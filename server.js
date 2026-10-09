'use strict';

const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const express = require('express');

// Tiny .env loader (no deps). Does not override real environment variables.
try {
  for (const line of require('fs').readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (_) { /* no .env */ }

const PIN_HASH = /^[0-9a-f]{64}$/i.test(process.env.TRACKER_PIN_HASH || '')
  ? Buffer.from(process.env.TRACKER_PIN_HASH, 'hex') : null;
const FAIL_MAX = 5;
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const failures = new Map(); // ip -> [timestamps]; in memory, cleared on restart

function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf.trim();
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  return req.ip || 'unknown';
}

function recentFailures(ip) {
  const now = Date.now();
  const list = (failures.get(ip) || []).filter((t) => now - t < FAIL_WINDOW_MS);
  if (list.length) failures.set(ip, list); else failures.delete(ip);
  return list;
}

function requirePin(req, res, next) {
  if (!PIN_HASH) {
    res.status(503).json({ error: 'pin_not_configured' });
    return;
  }
  const ip = clientIp(req);
  if (recentFailures(ip).length >= FAIL_MAX) {
    res.status(429).json({ error: 'too_many_attempts' });
    return;
  }
  const pin = req.get('x-edit-pin');
  let ok = false;
  if (typeof pin === 'string' && pin.length > 0 && pin.length <= 64) {
    const given = crypto.createHash('sha256').update(pin, 'utf8').digest();
    ok = crypto.timingSafeEqual(given, PIN_HASH);
  }
  if (!ok) {
    const list = recentFailures(ip);
    list.push(Date.now());
    failures.set(ip, list);
    res.status(401).json({ error: 'wrong_pin' });
    return;
  }
  next();
}

const PORT = Number(process.env.PORT) || 8766;
const ROOT = __dirname;
const REPORT = path.join(ROOT, 'report.html');
const DATA_DIR = path.join(ROOT, 'data');
const MILESTONES_FILE = path.join(DATA_DIR, 'milestones.json');

const DEFAULT_RECORDS = {
  '1': { done: true, date: '2026-09-06', note: 'ชำระงวด 1 แล้ว' },
  '1.1': { done: true, date: '2026-10-06', note: 'ชำระงวด 1.1 แล้ว' },
};

function defaultStore() {
  return {
    updatedAt: new Date().toISOString(),
    records: { ...DEFAULT_RECORDS },
  };
}

function sanitizeRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  if (typeof raw.done === 'boolean') out.done = raw.done;
  if (typeof raw.date === 'string') out.date = raw.date;
  if (typeof raw.note === 'string') out.note = raw.note;
  return out;
}

function sanitizeRecords(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [id, value] of Object.entries(raw)) {
    if (typeof id !== 'string' || !id.trim()) continue;
    const rec = sanitizeRecord(value);
    if (rec) out[id] = rec;
  }
  return out;
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readStore() {
  await ensureDataDir();
  try {
    const text = await fs.readFile(MILESTONES_FILE, 'utf8');
    const parsed = JSON.parse(text);
    const records = sanitizeRecords(parsed.records) || { ...DEFAULT_RECORDS };
    return {
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      records,
    };
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err instanceof SyntaxError)) {
      const store = defaultStore();
      await writeStore(store);
      return store;
    }
    throw err;
  }
}

async function writeStore(store) {
  await ensureDataDir();
  const tmp = MILESTONES_FILE + '.tmp';
  const payload = JSON.stringify(store, null, 2) + '\n';
  await fs.writeFile(tmp, payload, 'utf8');
  await fs.rename(tmp, MILESTONES_FILE);
}

const app = express();
app.set('trust proxy', 'loopback'); // cloudflared connects from localhost
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'apartment-progress-tracker', port: PORT });
});

app.get('/api/milestones', async (_req, res) => {
  try {
    const store = await readStore();
    res.json(store);
  } catch (err) {
    console.error('GET /api/milestones', err);
    res.status(500).json({ error: 'failed_to_read_milestones' });
  }
});

app.put('/api/milestones', requirePin, async (req, res) => {
  try {
    const body = req.body || {};
    const incoming = body.records !== undefined ? body.records : body;
    const records = sanitizeRecords(incoming);
    if (!records) {
      res.status(400).json({ error: 'invalid_records' });
      return;
    }
    const store = {
      updatedAt: new Date().toISOString(),
      records,
    };
    await writeStore(store);
    res.json(store);
  } catch (err) {
    console.error('PUT /api/milestones', err);
    res.status(500).json({ error: 'failed_to_write_milestones' });
  }
});

app.get(['/', '/report.html', '/index.html'], (_req, res) => {
  res.type('html').sendFile(REPORT);
});

app.use(express.static(ROOT, { index: false, fallthrough: true }));

app.use((_req, res) => {
  res.status(404).type('text').send('Not found');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`apartment-progress-tracker listening on http://0.0.0.0:${PORT}`);
  console.log(`serving Taky report.html (Project Milestone Tracker)`);
});

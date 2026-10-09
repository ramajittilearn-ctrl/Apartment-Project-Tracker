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
  // Trust CF-Connecting-IP only when the TCP peer is loopback (cloudflared); never X-Forwarded-For.
  const peer = req.socket.remoteAddress || 'unknown';
  const loop = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  const cf = req.headers['cf-connecting-ip'];
  if (loop && typeof cf === 'string' && cf.trim()) return cf.trim();
  return peer;
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

const IDS = new Set(['1', '1.1', ...Array.from({ length: 16 }, (_, i) => String(i + 2))]);
// Strict write validation: known ids only, typed fields, non-empty. Returns null if invalid.
function validateRecords(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const keys = Object.keys(raw);
  if (!keys.length) return null;
  const out = Object.create(null);
  for (const id of keys) {
    const r = raw[id];
    if (!IDS.has(id) || !r || typeof r !== 'object' || Array.isArray(r)) return null;
    const rec = {};
    if (r.done !== undefined) { if (typeof r.done !== 'boolean') return null; rec.done = r.done; }
    if (r.date !== undefined) { if (typeof r.date !== 'string' || (r.date && !/^\d{4}-\d{2}-\d{2}$/.test(r.date))) return null; rec.date = r.date; }
    if (r.note !== undefined) { if (typeof r.note !== 'string' || r.note.length > 300) return null; rec.note = r.note; }
    out[id] = rec;
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
    const records = validateRecords(incoming);
    if (!records) {
      res.status(400).json({ error: 'invalid_records' });
      return;
    }
    const cur = await readStore();
    if (Object.keys(cur.records).filter((id) => !(id in records)).length > 3) {
      res.status(409).json({ error: 'too_many_removed' });
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

app.use(express.static(path.join(ROOT, 'public'), { index: false, dotfiles: 'ignore', fallthrough: true })); // public/ only

app.use((_req, res) => {
  res.status(404).type('text').send('Not found');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`apartment-progress-tracker listening on http://0.0.0.0:${PORT}`);
  console.log(`serving Taky report.html (Project Milestone Tracker)`);
});

'use strict';

const path = require('path');
const express = require('express');

const PORT = Number(process.env.PORT) || 8766;
const ROOT = __dirname;
const REPORT = path.join(ROOT, 'report.html');

const app = express();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'apartment-progress-tracker', port: PORT });
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

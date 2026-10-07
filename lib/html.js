'use strict';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout({ title, body, flash, active }) {
  const nav = [
    { href: '/', label: 'Dashboard', key: 'dash' },
    { href: '/phases', label: 'Phases', key: 'phases' },
    { href: '/milestones', label: 'Milestones', key: 'miles' },
    { href: '/project', label: 'Project', key: 'project' },
  ]
    .map(
      (n) =>
        `<a class="nav-link${active === n.key ? ' active' : ''}" href="${n.href}">${n.label}</a>`
    )
    .join('');

  const flashHtml = flash
    ? `<div class="flash flash-${esc(flash.type || 'info')}">${esc(flash.message)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} · Progress Tracker</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <a href="/">🏗️ Progress Tracker</a>
      <span class="tag">private · Taky</span>
    </div>
    <nav class="nav">${nav}</nav>
    <form method="post" action="/logout" class="logout-form">
      <button type="submit" class="btn btn-ghost btn-sm">Log out</button>
    </form>
  </header>
  <main class="container">
    ${flashHtml}
    ${body}
  </main>
  <footer class="footer">
    <span>Construction progress only — not payments, not rental marketing.</span>
  </footer>
  <script src="/js/app.js"></script>
</body>
</html>`;
}

function statusBadge(status) {
  return `<span class="badge badge-${esc(status)}">${esc(status.replace(/_/g, ' '))}</span>`;
}

function pctBar(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="pct-bar" role="progressbar" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100">
    <div class="pct-fill" style="width:${p}%"></div>
    <span class="pct-label">${p}%</span>
  </div>`;
}

function statusSelect(name, current, id) {
  const opts = ['not_started', 'in_progress', 'done', 'blocked']
    .map(
      (s) =>
        `<option value="${s}"${s === current ? ' selected' : ''}>${s.replace(/_/g, ' ')}</option>`
    )
    .join('');
  return `<select name="${esc(name)}" id="${esc(id || name)}" class="input">${opts}</select>`;
}

module.exports = { esc, layout, statusBadge, pctBar, statusSelect };

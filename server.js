'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const store = require('./lib/store');
const progress = require('./lib/progress');
const auth = require('./lib/auth');
const { esc, layout, statusBadge, pctBar, statusSelect } = require('./lib/html');

const PORT = Number(process.env.PORT) || 8766;
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));

store.ensureStore();

// Flash via query string (simple, no session store needed beyond cookie auth)
function flashFromQuery(req) {
  if (req.query.ok) return { type: 'ok', message: String(req.query.ok) };
  if (req.query.err) return { type: 'error', message: String(req.query.err) };
  return null;
}

function redirectOk(res, path, msg) {
  res.redirect(`${path}?ok=${encodeURIComponent(msg)}`);
}

function redirectErr(res, path, msg) {
  res.redirect(`${path}?err=${encodeURIComponent(msg)}`);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'apartment-progress-tracker', port: PORT });
});

app.get('/login', (req, res) => {
  if (auth.isAuthed(req)) return res.redirect('/');
  const err = req.query.err ? `<div class="flash flash-error">${esc(req.query.err)}</div>` : '';
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Login · Progress Tracker</title>
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>
  <div class="login-wrap">
    <h1>🏗️ Progress Tracker</h1>
    <p class="muted" style="text-align:center">Private construction tracker for Taky</p>
    ${err}
    <form method="post" action="/login">
      <div class="field">
        <label for="pin">PIN</label>
        <input class="input" type="password" name="pin" id="pin" required autofocus />
      </div>
      <button class="btn" type="submit" style="width:100%">Enter</button>
    </form>
  </div>
</body>
</html>`);
});

app.post('/login', (req, res) => {
  const pin = String(req.body.pin || '');
  if (pin === auth.getPin()) {
    auth.setAuthCookie(res);
    return res.redirect('/');
  }
  return redirectErr(res, '/login', 'Wrong PIN');
});

app.post('/logout', (_req, res) => {
  auth.clearAuthCookie(res);
  res.redirect('/login');
});

app.use(auth.requireAuth);

// ── Dashboard ──────────────────────────────────────────────
app.get('/', (req, res) => {
  const data = store.readStore();
  const phases = [...(data.phases || [])].sort((a, b) => a.order - b.order);
  const overall = progress.projectPct(phases);
  const donePhases = phases.filter((p) => p.status === 'done').length;
  const inProg = phases.filter((p) => p.status === 'in_progress').length;
  const blocked = phases.filter((p) => p.status === 'blocked').length;
  const allTasks = phases.flatMap((p) => p.tasks || []);
  const doneTasks = allTasks.filter((t) => t.status === 'done').length;
  const miles = progress.upcomingMilestones(data.milestones, 8);
  const doneMiles = (data.milestones || []).filter((m) => m.done).length;

  const phaseCards = phases
    .map((p) => {
      const pct = progress.phasePct(p);
      return `<a class="card clickable" href="/phases/${esc(p.id)}" style="display:block;color:inherit;text-decoration:none">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem">
          <strong>${esc(p.name)}</strong>
          ${statusBadge(p.status)}
        </div>
        ${pctBar(pct)}
        <div class="muted" style="font-size:0.8rem">${(p.tasks || []).length} task(s)</div>
      </a>`;
    })
    .join('');

  const mileRows = miles.length
    ? miles
        .map((m) => {
          const dateLabel = m.date
            ? m.overdue
              ? `<span class="overdue">${esc(m.date)} · overdue</span>`
              : esc(m.date)
            : '<span class="muted">no date</span>';
          return `<tr>
            <td>${esc(m.name)}</td>
            <td>${dateLabel}</td>
          </tr>`;
        })
        .join('')
    : `<tr><td colspan="2" class="muted">No open milestones — <a href="/milestones">add some</a></td></tr>`;

  const body = `
    <div class="page-header">
      <div>
        <h1>${esc(data.project.name)}</h1>
        <p class="muted">${esc(data.project.address || 'Address (edit on Project page)')}</p>
      </div>
      <a class="btn btn-ghost" href="/project">Edit project</a>
    </div>

    <div class="card" style="margin-bottom:1.25rem">
      <div class="stat-label">Overall progress</div>
      ${pctBar(overall)}
      <p class="muted" style="font-size:0.8rem;margin:0.4rem 0 0">
        Project % = average of phase % (each phase = average of its tasks).
      </p>
    </div>

    <div class="grid" style="margin-bottom:1.25rem">
      <div class="card"><div class="stat-value">${overall}%</div><div class="stat-label">Complete</div></div>
      <div class="card"><div class="stat-value">${donePhases}/${phases.length}</div><div class="stat-label">Phases done</div></div>
      <div class="card"><div class="stat-value">${inProg}</div><div class="stat-label">In progress</div></div>
      <div class="card"><div class="stat-value">${blocked}</div><div class="stat-label">Blocked</div></div>
      <div class="card"><div class="stat-value">${doneTasks}/${allTasks.length}</div><div class="stat-label">Tasks done</div></div>
      <div class="card"><div class="stat-value">${doneMiles}/${(data.milestones || []).length}</div><div class="stat-label">Milestones done</div></div>
    </div>

    <h2>Phases</h2>
    <div class="grid" style="margin-bottom:1.5rem">${phaseCards || '<p class="muted">No phases yet.</p>'}</div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2 style="margin:0">Upcoming / open milestones</h2>
        <a class="btn btn-sm btn-ghost" href="/milestones">Manage</a>
      </div>
      <table class="simple">
        <thead><tr><th>Name</th><th>Date</th></tr></thead>
        <tbody>${mileRows}</tbody>
      </table>
    </div>
  `;

  res.send(layout({ title: 'Dashboard', body, flash: flashFromQuery(req), active: 'dash' }));
});

// ── Project edit ───────────────────────────────────────────
app.get('/project', (req, res) => {
  const data = store.readStore();
  const body = `
    <div class="page-header"><h1>Project details</h1></div>
    <div class="card">
      <form method="post" action="/project">
        <div class="field">
          <label for="name">Project name</label>
          <input class="input" id="name" name="name" value="${esc(data.project.name)}" required />
        </div>
        <div class="field">
          <label for="address">Address / location</label>
          <input class="input" id="address" name="address" value="${esc(data.project.address)}" placeholder="(optional — fill in yourself)" />
        </div>
        <div class="field">
          <label for="notes">Notes</label>
          <textarea class="input" id="notes" name="notes">${esc(data.project.notes)}</textarea>
        </div>
        <button class="btn" type="submit">Save</button>
      </form>
    </div>
  `;
  res.send(layout({ title: 'Project', body, flash: flashFromQuery(req), active: 'project' }));
});

app.post('/project', (req, res) => {
  store.update((data) => {
    data.project.name = String(req.body.name || '').trim() || data.project.name;
    data.project.address = String(req.body.address || '').trim();
    data.project.notes = String(req.body.notes || '').trim();
  });
  redirectOk(res, '/project', 'Project saved');
});

// ── Phases list ────────────────────────────────────────────
app.get('/phases', (req, res) => {
  const data = store.readStore();
  const phases = [...(data.phases || [])].sort((a, b) => a.order - b.order);

  const items = phases
    .map((p, idx) => {
      const pct = progress.phasePct(p);
      return `<li class="phase-item">
        <header>
          <div>
            <span class="muted" style="font-size:0.8rem">#${idx + 1}</span>
            <a class="phase-title" href="/phases/${esc(p.id)}">${esc(p.name)}</a>
            ${statusBadge(p.status)}
          </div>
          <div class="btn-row">
            <form class="inline-form" method="post" action="/phases/${esc(p.id)}/move">
              <input type="hidden" name="dir" value="up" />
              <button class="btn btn-sm btn-ghost" type="submit" ${idx === 0 ? 'disabled' : ''}>↑</button>
            </form>
            <form class="inline-form" method="post" action="/phases/${esc(p.id)}/move">
              <input type="hidden" name="dir" value="down" />
              <button class="btn btn-sm btn-ghost" type="submit" ${idx === phases.length - 1 ? 'disabled' : ''}>↓</button>
            </form>
            <a class="btn btn-sm" href="/phases/${esc(p.id)}">Open</a>
          </div>
        </header>
        ${pctBar(pct)}
        <div class="muted" style="font-size:0.85rem">${(p.tasks || []).length} tasks · ${esc(p.plannedStart || '—')} → ${esc(p.plannedEnd || '—')}</div>
      </li>`;
    })
    .join('');

  const body = `
    <div class="page-header">
      <h1>Phases</h1>
    </div>
    <ul class="phase-list">${items || '<li class="muted">No phases yet.</li>'}</ul>

    <div class="card" style="margin-top:1.25rem">
      <h2>Add phase</h2>
      <form method="post" action="/phases">
        <div class="form-grid">
          <div class="field">
            <label for="name">Name</label>
            <input class="input" id="name" name="name" required placeholder="e.g. Roofing (edit me)" />
          </div>
          <div class="field">
            <label for="status">Status</label>
            ${statusSelect('status', 'not_started')}
          </div>
          <div class="field">
            <label for="plannedStart">Planned start</label>
            <input class="input" type="date" id="plannedStart" name="plannedStart" />
          </div>
          <div class="field">
            <label for="plannedEnd">Planned end</label>
            <input class="input" type="date" id="plannedEnd" name="plannedEnd" />
          </div>
        </div>
        <div class="field">
          <label for="notes">Notes</label>
          <textarea class="input" id="notes" name="notes"></textarea>
        </div>
        <button class="btn" type="submit">Add phase</button>
      </form>
    </div>
  `;
  res.send(layout({ title: 'Phases', body, flash: flashFromQuery(req), active: 'phases' }));
});

app.post('/phases', (req, res) => {
  store.update((data) => {
    const maxOrder = (data.phases || []).reduce((m, p) => Math.max(m, p.order), -1);
    data.phases = data.phases || [];
    data.phases.push({
      id: store.uuidv4(),
      name: String(req.body.name || '').trim() || 'Untitled phase',
      status: ['not_started', 'in_progress', 'done', 'blocked'].includes(req.body.status)
        ? req.body.status
        : 'not_started',
      plannedStart: String(req.body.plannedStart || ''),
      plannedEnd: String(req.body.plannedEnd || ''),
      notes: String(req.body.notes || '').trim(),
      order: maxOrder + 1,
      tasks: [],
    });
  });
  redirectOk(res, '/phases', 'Phase added');
});

app.post('/phases/:id/move', (req, res) => {
  const dir = req.body.dir === 'up' ? -1 : 1;
  store.update((data) => {
    const phases = [...(data.phases || [])].sort((a, b) => a.order - b.order);
    const idx = phases.findIndex((p) => p.id === req.params.id);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= phases.length) return;
    const tmp = phases[idx].order;
    phases[idx].order = phases[swap].order;
    phases[swap].order = tmp;
    // normalize sequential orders
    phases.sort((a, b) => a.order - b.order).forEach((p, i) => { p.order = i; });
    data.phases = phases;
  });
  redirectOk(res, '/phases', 'Order updated');
});

app.post('/phases/:id/delete', (req, res) => {
  store.update((data) => {
    data.phases = (data.phases || []).filter((p) => p.id !== req.params.id);
    data.phases.sort((a, b) => a.order - b.order).forEach((p, i) => { p.order = i; });
  });
  redirectOk(res, '/phases', 'Phase deleted');
});

// ── Phase detail + tasks ───────────────────────────────────
function findPhase(data, id) {
  return (data.phases || []).find((p) => p.id === id);
}

app.get('/phases/:id', (req, res) => {
  const data = store.readStore();
  const phase = findPhase(data, req.params.id);
  if (!phase) return redirectErr(res, '/phases', 'Phase not found');

  const pct = progress.phasePct(phase);
  const tasks = phase.tasks || [];

  const taskItems = tasks
    .map((t) => {
      const tp = progress.taskPct(t);
      return `<li class="task-item">
        <header>
          <div>
            <span class="task-title ${t.status === 'done' ? 'done-strike' : ''}">${esc(t.title)}</span>
            ${statusBadge(t.status)}
            ${t.dueDate ? `<span class="muted" style="font-size:0.8rem">due ${esc(t.dueDate)}</span>` : ''}
          </div>
          <div class="btn-row">
            <form class="inline-form" method="post" action="/phases/${esc(phase.id)}/tasks/${esc(t.id)}/toggle">
              <button class="btn btn-sm ${t.status === 'done' ? 'btn-ghost' : 'btn-ok'}" type="submit">
                ${t.status === 'done' ? 'Undo' : 'Mark done'}
              </button>
            </form>
          </div>
        </header>
        ${pctBar(tp)}
        ${t.notes ? `<p class="muted" style="font-size:0.85rem;margin:0.3rem 0">${esc(t.notes)}</p>` : ''}
        <details class="details-panel">
          <summary class="muted" style="cursor:pointer">Edit / delete</summary>
          <form method="post" action="/phases/${esc(phase.id)}/tasks/${esc(t.id)}" style="margin-top:0.75rem">
            <div class="form-grid">
              <div class="field">
                <label>Title</label>
                <input class="input" name="title" value="${esc(t.title)}" required />
              </div>
              <div class="field">
                <label>Status</label>
                ${statusSelect('status', t.status, 'st-' + t.id)}
              </div>
              <div class="field">
                <label>Due date</label>
                <input class="input" type="date" name="dueDate" value="${esc(t.dueDate)}" />
              </div>
            </div>
            <div class="field">
              <label>Notes</label>
              <textarea class="input" name="notes">${esc(t.notes)}</textarea>
            </div>
            <div class="btn-row">
              <button class="btn btn-sm" type="submit">Save task</button>
            </div>
          </form>
          <form method="post" action="/phases/${esc(phase.id)}/tasks/${esc(t.id)}/delete" style="margin-top:0.5rem">
            <button class="btn btn-sm btn-danger" type="submit" data-confirm="Delete this task?">Delete task</button>
          </form>
        </details>
      </li>`;
    })
    .join('');

  const body = `
    <div class="page-header">
      <div>
        <p class="muted" style="margin:0"><a href="/phases">← Phases</a></p>
        <h1>${esc(phase.name)}</h1>
        ${statusBadge(phase.status)}
      </div>
    </div>

    <div class="card" style="margin-bottom:1rem">
      ${pctBar(pct)}
      <p class="muted" style="font-size:0.8rem;margin:0">Phase % = average of task progress.</p>
    </div>

    <div class="card" style="margin-bottom:1.25rem">
      <h2>Edit phase</h2>
      <form method="post" action="/phases/${esc(phase.id)}">
        <div class="form-grid">
          <div class="field">
            <label for="name">Name</label>
            <input class="input" id="name" name="name" value="${esc(phase.name)}" required />
          </div>
          <div class="field">
            <label for="status">Status</label>
            ${statusSelect('status', phase.status)}
          </div>
          <div class="field">
            <label for="plannedStart">Planned start</label>
            <input class="input" type="date" id="plannedStart" name="plannedStart" value="${esc(phase.plannedStart)}" />
          </div>
          <div class="field">
            <label for="plannedEnd">Planned end</label>
            <input class="input" type="date" id="plannedEnd" name="plannedEnd" value="${esc(phase.plannedEnd)}" />
          </div>
        </div>
        <div class="field">
          <label for="notes">Notes</label>
          <textarea class="input" id="notes" name="notes">${esc(phase.notes)}</textarea>
        </div>
        <div class="btn-row">
          <button class="btn" type="submit">Save phase</button>
        </div>
      </form>
      <form method="post" action="/phases/${esc(phase.id)}/delete" style="margin-top:0.75rem">
        <button class="btn btn-sm btn-danger" type="submit" data-confirm="Delete this phase and all its tasks?">Delete phase</button>
      </form>
    </div>

    <h2>Tasks</h2>
    <ul class="task-list">${taskItems || '<li class="muted">No tasks yet — add one below.</li>'}</ul>

    <div class="card" style="margin-top:1rem">
      <h2>Add task</h2>
      <form method="post" action="/phases/${esc(phase.id)}/tasks">
        <div class="form-grid">
          <div class="field">
            <label for="title">Title</label>
            <input class="input" id="title" name="title" required placeholder="Task title (edit me)" />
          </div>
          <div class="field">
            <label for="tstatus">Status</label>
            ${statusSelect('status', 'not_started', 'tstatus')}
          </div>
          <div class="field">
            <label for="dueDate">Due date</label>
            <input class="input" type="date" id="dueDate" name="dueDate" />
          </div>
        </div>
        <div class="field">
          <label for="tnotes">Notes</label>
          <textarea class="input" id="tnotes" name="notes"></textarea>
        </div>
        <button class="btn" type="submit">Add task</button>
      </form>
    </div>
  `;
  res.send(layout({ title: phase.name, body, flash: flashFromQuery(req), active: 'phases' }));
});

app.post('/phases/:id', (req, res) => {
  let ok = false;
  store.update((data) => {
    const phase = findPhase(data, req.params.id);
    if (!phase) return;
    phase.name = String(req.body.name || '').trim() || phase.name;
    if (['not_started', 'in_progress', 'done', 'blocked'].includes(req.body.status)) {
      phase.status = req.body.status;
    }
    phase.plannedStart = String(req.body.plannedStart || '');
    phase.plannedEnd = String(req.body.plannedEnd || '');
    phase.notes = String(req.body.notes || '').trim();
    ok = true;
  });
  if (!ok) return redirectErr(res, '/phases', 'Phase not found');
  redirectOk(res, `/phases/${req.params.id}`, 'Phase saved');
});

app.post('/phases/:id/tasks', (req, res) => {
  let ok = false;
  store.update((data) => {
    const phase = findPhase(data, req.params.id);
    if (!phase) return;
    phase.tasks = phase.tasks || [];
    phase.tasks.push({
      id: store.uuidv4(),
      title: String(req.body.title || '').trim() || 'Untitled task',
      status: ['not_started', 'in_progress', 'done', 'blocked'].includes(req.body.status)
        ? req.body.status
        : 'not_started',
      dueDate: String(req.body.dueDate || ''),
      notes: String(req.body.notes || '').trim(),
    });
    ok = true;
  });
  if (!ok) return redirectErr(res, '/phases', 'Phase not found');
  redirectOk(res, `/phases/${req.params.id}`, 'Task added');
});

app.post('/phases/:pid/tasks/:tid', (req, res) => {
  let ok = false;
  store.update((data) => {
    const phase = findPhase(data, req.params.pid);
    if (!phase) return;
    const task = (phase.tasks || []).find((t) => t.id === req.params.tid);
    if (!task) return;
    task.title = String(req.body.title || '').trim() || task.title;
    if (['not_started', 'in_progress', 'done', 'blocked'].includes(req.body.status)) {
      task.status = req.body.status;
    }
    task.dueDate = String(req.body.dueDate || '');
    task.notes = String(req.body.notes || '').trim();
    ok = true;
  });
  if (!ok) return redirectErr(res, '/phases', 'Task not found');
  redirectOk(res, `/phases/${req.params.pid}`, 'Task saved');
});

app.post('/phases/:pid/tasks/:tid/toggle', (req, res) => {
  store.update((data) => {
    const phase = findPhase(data, req.params.pid);
    if (!phase) return;
    const task = (phase.tasks || []).find((t) => t.id === req.params.tid);
    if (!task) return;
    task.status = task.status === 'done' ? 'not_started' : 'done';
  });
  redirectOk(res, `/phases/${req.params.pid}`, 'Task updated');
});

app.post('/phases/:pid/tasks/:tid/delete', (req, res) => {
  store.update((data) => {
    const phase = findPhase(data, req.params.pid);
    if (!phase) return;
    phase.tasks = (phase.tasks || []).filter((t) => t.id !== req.params.tid);
  });
  redirectOk(res, `/phases/${req.params.pid}`, 'Task deleted');
});

// ── Milestones ─────────────────────────────────────────────
app.get('/milestones', (req, res) => {
  const data = store.readStore();
  const miles = data.milestones || [];
  const today = new Date().toISOString().slice(0, 10);

  const items = miles
    .map((m) => {
      const overdue = !m.done && m.date && m.date < today;
      return `<li class="mile-item">
        <header>
          <div>
            <span class="task-title ${m.done ? 'done-strike' : ''}">${esc(m.name)}</span>
            ${m.done ? '<span class="badge badge-done">done</span>' : ''}
            ${overdue ? '<span class="overdue">overdue</span>' : ''}
            ${m.date ? `<span class="muted" style="font-size:0.85rem">${esc(m.date)}</span>` : '<span class="muted">no date</span>'}
          </div>
          <div class="btn-row">
            <form class="inline-form" method="post" action="/milestones/${esc(m.id)}/toggle">
              <button class="btn btn-sm ${m.done ? 'btn-ghost' : 'btn-ok'}" type="submit">
                ${m.done ? 'Mark open' : 'Mark done'}
              </button>
            </form>
          </div>
        </header>
        ${m.notes ? `<p class="muted" style="font-size:0.85rem">${esc(m.notes)}</p>` : ''}
        <details class="details-panel">
          <summary class="muted" style="cursor:pointer">Edit / delete</summary>
          <form method="post" action="/milestones/${esc(m.id)}" style="margin-top:0.75rem">
            <div class="form-grid">
              <div class="field">
                <label>Name</label>
                <input class="input" name="name" value="${esc(m.name)}" required />
              </div>
              <div class="field">
                <label>Date</label>
                <input class="input" type="date" name="date" value="${esc(m.date)}" />
              </div>
            </div>
            <div class="field">
              <label>Notes</label>
              <textarea class="input" name="notes">${esc(m.notes)}</textarea>
            </div>
            <button class="btn btn-sm" type="submit">Save</button>
          </form>
          <form method="post" action="/milestones/${esc(m.id)}/delete" style="margin-top:0.5rem">
            <button class="btn btn-sm btn-danger" type="submit" data-confirm="Delete this milestone?">Delete</button>
          </form>
        </details>
      </li>`;
    })
    .join('');

  const body = `
    <div class="page-header"><h1>Milestones</h1></div>
    <ul class="mile-list">${items || '<li class="muted">No milestones yet.</li>'}</ul>

    <div class="card" style="margin-top:1.25rem">
      <h2>Add milestone</h2>
      <form method="post" action="/milestones">
        <div class="form-grid">
          <div class="field">
            <label for="name">Name</label>
            <input class="input" id="name" name="name" required placeholder="Milestone (edit me)" />
          </div>
          <div class="field">
            <label for="date">Date</label>
            <input class="input" type="date" id="date" name="date" />
          </div>
        </div>
        <div class="field">
          <label for="notes">Notes</label>
          <textarea class="input" id="notes" name="notes"></textarea>
        </div>
        <button class="btn" type="submit">Add milestone</button>
      </form>
    </div>
  `;
  res.send(layout({ title: 'Milestones', body, flash: flashFromQuery(req), active: 'miles' }));
});

app.post('/milestones', (req, res) => {
  store.update((data) => {
    data.milestones = data.milestones || [];
    data.milestones.push({
      id: store.uuidv4(),
      name: String(req.body.name || '').trim() || 'Milestone (edit me)',
      date: String(req.body.date || ''),
      done: false,
      notes: String(req.body.notes || '').trim(),
    });
  });
  redirectOk(res, '/milestones', 'Milestone added');
});

app.post('/milestones/:id', (req, res) => {
  store.update((data) => {
    const m = (data.milestones || []).find((x) => x.id === req.params.id);
    if (!m) return;
    m.name = String(req.body.name || '').trim() || m.name;
    m.date = String(req.body.date || '');
    m.notes = String(req.body.notes || '').trim();
  });
  redirectOk(res, '/milestones', 'Milestone saved');
});

app.post('/milestones/:id/toggle', (req, res) => {
  store.update((data) => {
    const m = (data.milestones || []).find((x) => x.id === req.params.id);
    if (!m) return;
    m.done = !m.done;
  });
  redirectOk(res, '/milestones', 'Milestone updated');
});

app.post('/milestones/:id/delete', (req, res) => {
  store.update((data) => {
    data.milestones = (data.milestones || []).filter((m) => m.id !== req.params.id);
  });
  redirectOk(res, '/milestones', 'Milestone deleted');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Apartment Progress Tracker listening on http://127.0.0.1:${PORT}`);
  console.log(`PIN: ${auth.getPin()} (set ADMIN_PIN to change)`);
});

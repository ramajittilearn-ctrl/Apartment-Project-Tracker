# Apartment Project Tracker (construction progress)

Private **construction project management / progress tracker** for Taky (Ramajitti Pasutanavin).

This is **not** a payments app, **not** tenant slips, and **not** the rental marketing site.

## Ports

| Port | App |
|------|-----|
| **8766** | This progress tracker (default) |
| 8765 | Reserved for Elena’s marketing site — do not use |
| 8787 | Do not use for this app |

## Quick start

```bash
npm install
PORT=8766 npm start
```

Open http://127.0.0.1:8766 and enter the PIN.

### Environment

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `8766` | HTTP listen port |
| `ADMIN_PIN` | `taky-progress` | Light single-user PIN (cookie session) |

Copy `.env.example` if you want a local reference; the app reads process env only (no dotenv required).

## Features (v1)

- **Dashboard** — overall %, phase cards, task/milestone stats, upcoming/overdue milestones
- **One project** — name, address, notes (edit placeholders yourself)
- **Phases** — ordered list with status, planned dates, notes; reorder with ↑/↓
- **Tasks** under each phase — status, due date, notes; mark done / undo
- **Milestones** — named dates with done toggle
- **Light PIN auth** — cookie session; health endpoint is public

## Progress math

- **Task %**: `done` → 100, `in_progress` → 50, `not_started` / `blocked` → 0
- **Phase %**: average of its tasks (if no tasks: 100 when phase is `done`, else 0)
- **Project %**: **equal average of all phase percentages** (not weighted by task count)

## Data

- JSON store: `data/store.json` (created on first run with **placeholder** labels only)
- `data/store.json` is gitignored — seed happens at runtime via `lib/store.js`
- No invented contractors, costs, Thai addresses, or payment records

## Health check

```bash
curl -s http://127.0.0.1:8766/api/health
# {"ok":true,"service":"apartment-progress-tracker","port":8766}
```

## Cloudflare quick tunnel (preview)

With the app already listening on 8766:

```bash
npx --yes cloudflared tunnel --url http://127.0.0.1:8766
```

## Stack

Node.js + Express, server-rendered HTML, a little CSS/JS, JSON file storage. No React build step.

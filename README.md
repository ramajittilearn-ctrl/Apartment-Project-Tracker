# Apartment Project Tracker

Private construction **project milestone / progress tracker** for Taky (หอพัก 3 ชั้น คุณต๊ะ).

**Not** the payments app (Pamela). **Not** the rental marketing site (Elena).

## Live UI

The live UI is Taky’s own `report.html` — a self-contained Thai **Project Milestone Tracker** with contract milestones, payment schedule, and browser `localStorage`. Served as-is (no PIN gate on the trycloudflare preview).

- Port: **8766**
- Routes:
  - `GET /` → `report.html`
  - `GET /report.html` → same page
  - `GET /api/health` → `{"ok":true,"service":"apartment-progress-tracker","port":8766}`

## Run locally

```bash
cd /workspace/Apartment-Project-Tracker
npm install
node server.js
# → http://127.0.0.1:8766
```

## Cloudflare preview

Same pattern as Elena’s marketing site (she uses 8765; this app uses **8766**):

```bash
node server.js
npx --yes cloudflared tunnel --url http://127.0.0.1:8766
```

Leave both running. The trycloudflare hostname is ephemeral (new URL each tunnel restart). Repo stays **private**.

## Files

| Path | Role |
|------|------|
| `report.html` | Taky’s milestone tracker (source of truth for UI) |
| `server.js` | Minimal Express: health + serve report |
| `package.json` | Node deps |

Old dark dashboard / PIN UI under `public/` / `lib/` / `views/` is unused and not served at `/`.

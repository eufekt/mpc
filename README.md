# MPC — Music Production Center

Browser-based sampler: load audio from files or YouTube, chop on a waveform, and trigger slices from A–Z pads.

## Monorepo layout

```
apps/
  web/   Vite + React frontend
  api/   Express + yt-dlp (YouTube audio download, dev only)
```

## Development

```bash
npm install
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:3001 (proxied at `/api` in dev)

Requires `yt-dlp` on PATH for YouTube imports.

## Deploy (Vercel)

Set the Vercel project **root directory** to the repository root. [`vercel.json`](vercel.json) builds `apps/web` and outputs `apps/web/dist`.

YouTube import requires a separate backend with `yt-dlp` and `ffmpeg`; the static Vercel deploy serves the UI and file upload only.

## Architecture

- **Multi-track session** — each load adds a track with its own waveform, chops, and decoded buffer
- **Global mixer pads** — the same key can trigger chops from multiple tracks at once (LAYER mode)
- **Persistence** — `localStorage` session meta (v2) + per-track audio blobs in IndexedDB

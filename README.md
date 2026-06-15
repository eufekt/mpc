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

## Deploy (Cloudflare)

Full-stack deploy: React UI (static assets) + Express API with `yt-dlp`/`ffmpeg` in a [Container](https://developers.cloudflare.com/containers/).

**Requirements**

- [Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/) plan ($5/month minimum)
- [Docker](https://docs.docker.com/get-docker/) running locally (Wrangler builds the container image on deploy)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) authenticated (`wrangler login`)

**First deploy**

```bash
npm install
npm run deploy:cloudflare
```

This builds the frontend, builds/pushes the API container image, and deploys the Worker router. The first deploy can take several minutes; container provisioning may take a few more minutes before `/api` routes work.

**Subsequent deploys**

```bash
npm run deploy:cloudflare
```

**Useful commands**

```bash
npx wrangler dev          # local dev (needs Docker for container routes)
npx wrangler containers list
npx wrangler tail         # live Worker logs
```

After deploy, open the `*.workers.dev` URL from the Wrangler output. File upload works entirely in the browser; YouTube import uses `/api/youtube/*` via the container.

## Architecture

- **Multi-track session** — each load adds a track with its own waveform, chops, and decoded buffer
- **Global mixer pads** — the same key can trigger chops from multiple tracks at once (LAYER mode)
- **Persistence** — `localStorage` session meta (v2) + per-track audio blobs in IndexedDB

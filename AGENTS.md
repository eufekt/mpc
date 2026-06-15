# AGENTS.md

## Cursor Cloud specific instructions

MPC is a browser-based audio sampler. Services and standard commands are documented in `README.md` and the `package.json` scripts; prefer those. Notes below are the non-obvious bits.

### Services
- `@mpc/web` (Vite + React, http://localhost:5173) — the product. Almost all functionality (file upload, waveform chopping, pads, arrangement, MIDI, persistence) runs entirely client-side.
- `@mpc/api` (Express, http://localhost:3001) — only used by the optional YouTube import feature. Vite proxies `/api` → `:3001` in dev.
- `worker/` + `wrangler.jsonc` — Cloudflare deploy path only; not part of local dev.

### Running / building / checking
- Dev (starts web + api together): `npm run dev` from the repo root.
- Lint: there is no separate lint script; `npm run typecheck` (tsc across web/api/worker) is the closest equivalent.
- Build: `npm run build` (web only). There are no automated unit/integration tests in this repo.

### Non-obvious caveats
- The YouTube import feature needs the system binaries `yt-dlp` and `ffmpeg` on PATH (not npm packages). They are installed in the VM snapshot but are NOT reinstalled by the update script; if missing, install `yt-dlp` (download the release binary to `/usr/local/bin`) and `ffmpeg` (apt). Without them the API process still starts fine — only the `/api/youtube/*` endpoints fail at request time.
- Core sampler features do NOT require the API or those binaries. To test the product end-to-end without YouTube, just run the web app and upload a local audio file.
- App state persists in the browser (`localStorage` session meta + per-track audio in IndexedDB). To start from a clean slate, use SETTINGS → clear saved data in the UI.
- Chops are created by click-dragging a region on the black waveform; bind a chop to a pad by selecting its row in the chop table and pressing a letter key.

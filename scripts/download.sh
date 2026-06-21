#!/usr/bin/env bash
# Download videos (or audio) into offline/ for local use with MPC.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${MPC_DOWNLOAD_DIR:-$ROOT/offline}"
AUDIO_ONLY=0
BATCH_FILE=""
JOBS=1

usage() {
  cat <<'EOF'
Usage:
  npm run download -- <url> [url...]
  npm run download -- --batch offline/urls.txt
  npm run download:audio -- <url> [url...]

Options:
  --audio, -a     Extract audio as WAV (good for loading into MPC)
  --batch, -b     Read URLs from a file (one per line, # comments allowed)
  --jobs, -j N    Download N URLs in parallel (batch mode only, default: 1)
  --out, -o DIR   Output directory (default: offline/)
  -h, --help      Show this help

Requires yt-dlp and ffmpeg on PATH:
  brew install yt-dlp ffmpeg
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --audio|-a)
      AUDIO_ONLY=1
      shift
      ;;
    --batch|-b)
      BATCH_FILE="${2:?--batch requires a file path}"
      shift 2
      ;;
    --out|-o)
      OUT="${2:?--out requires a directory}"
      shift 2
      ;;
    --jobs|-j)
      JOBS="${2:?--jobs requires a number}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      break
      ;;
  esac
done

if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "yt-dlp not found. Install: brew install yt-dlp ffmpeg" >&2
  exit 1
fi

mkdir -p "$OUT"

OUTPUT_TEMPLATE="$OUT/%(title).200B [%(id)s].%(ext)s"

run_download() {
  local url="$1"
  if [[ "$AUDIO_ONLY" -eq 1 ]]; then
    yt-dlp \
      -f "bestaudio/best" \
      --no-playlist \
      -x \
      --audio-format wav \
      -o "$OUTPUT_TEMPLATE" \
      "$url"
  else
    yt-dlp \
      -f "bv*+ba/b" \
      --merge-output-format mp4 \
      --no-playlist \
      -o "$OUTPUT_TEMPLATE" \
      "$url"
  fi
}

download_one() {
  local url="$1"
  echo "→ $url"
  if run_download "$url"; then
    return 0
  fi
  echo "✗ failed: $url" >&2
  return 1
}

reap_finished() {
  local alive=()
  local pid
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      alive+=("$pid")
    else
      wait "$pid" || FAILED=$((FAILED + 1))
    fi
  done
  if ((${#alive[@]} > 0)); then
    PIDS=("${alive[@]}")
  else
    PIDS=()
  fi
}

run_batch() {
  local -a QUEUE=()
  local line url

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="$(echo "$line" | xargs)"
    [[ -z "$line" ]] && continue
    QUEUE+=("$line")
  done < "$BATCH_FILE"

  FAILED=0
  PIDS=()

  for url in "${QUEUE[@]}"; do
    while ((${#PIDS[@]} >= JOBS)); do
      reap_finished
      sleep 0.2
    done
    download_one "$url" &
    PIDS+=("$!")
  done

  while ((${#PIDS[@]} > 0)); do
    reap_finished
    sleep 0.2
  done
}

if [[ -n "$BATCH_FILE" ]]; then
  if [[ ! -f "$BATCH_FILE" ]]; then
    echo "Batch file not found: $BATCH_FILE" >&2
    exit 1
  fi
  if [[ "$JOBS" -lt 1 ]]; then
    echo "--jobs must be at least 1" >&2
    exit 1
  fi
  echo "Batch: ${BATCH_FILE} (${JOBS} parallel)"
  run_batch
  [[ "$FAILED" -gt 0 ]] && echo "$FAILED download(s) failed" >&2
elif [[ $# -eq 0 ]]; then
  usage >&2
  exit 1
else
  for url in "$@"; do
    download_one "$url"
  done
fi

echo "Done. Files saved to: $OUT"

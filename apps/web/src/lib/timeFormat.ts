/**
 * Format seconds as m:ss or m:ss.d… (minutes are not zero-padded).
 * Internal storage stays in seconds; this is display-only.
 */
export function formatTime(seconds: number, decimals = 0): string {
  if (!Number.isFinite(seconds)) {
    return formatTime(0, decimals);
  }

  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;

  if (decimals === 0) {
    return `${minutes}:${Math.floor(secs).toString().padStart(2, "0")}`;
  }

  const secsStr = secs.toFixed(decimals);
  const [whole, frac] = secsStr.split(".");
  const paddedWhole = whole.padStart(2, "0");
  return frac !== undefined ? `${minutes}:${paddedWhole}.${frac}` : `${minutes}:${paddedWhole}`;
}

/** Durations in arrangement / chop picker — one decimal on seconds. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00.0";
  return formatTime(seconds, 1);
}

/** Chop positions, waveform labels, playhead — two decimals on seconds. */
export function formatTimePrecise(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00.00";
  return formatTime(seconds, 2);
}

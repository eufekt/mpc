export const DEFAULT_TIME_STRETCH = 1;
export const MIN_TIME_STRETCH_PERCENT = 10;
export const MAX_TIME_STRETCH_PERCENT = 400;

export function normalizeTimeStretch(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TIME_STRETCH;
  return Math.round(Math.max(0.1, Math.min(4, value)) * 1000) / 1000;
}

/** UI scale: 100 = normal speed (1.0×). */
export function timeStretchToPercent(timeStretch: number): number {
  return Math.round(normalizeTimeStretch(timeStretch) * 100);
}

export function percentToTimeStretch(percent: number): number {
  if (!Number.isFinite(percent)) return DEFAULT_TIME_STRETCH;
  const clamped = Math.max(
    MIN_TIME_STRETCH_PERCENT,
    Math.min(MAX_TIME_STRETCH_PERCENT, Math.round(percent)),
  );
  return normalizeTimeStretch(clamped / 100);
}

export function formatTimeStretch(value: number): string {
  return String(timeStretchToPercent(value));
}

export function getChopNaturalDuration(chop: { start: number; end: number }): number {
  return Math.max(0, chop.end - chop.start);
}

export function getChopPlaybackDuration(
  naturalDuration: number,
  timeStretch: number,
): number {
  const stretch = normalizeTimeStretch(timeStretch);
  if (naturalDuration <= 0) return 0;
  return naturalDuration / stretch;
}

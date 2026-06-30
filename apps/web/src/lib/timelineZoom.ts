export const TIMELINE_ZOOM_STORAGE_KEY = "mpc-timeline-zoom";
export const DEFAULT_TIMELINE_ZOOM = 1;
export const MIN_TIMELINE_ZOOM = 0.125;
export const MAX_TIMELINE_ZOOM = 16;
/** Multiplicative step for +/- buttons and ctrl/meta + wheel. */
export const TIMELINE_ZOOM_STEP_FACTOR = 1.15;

export function clampTimelineZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return DEFAULT_TIMELINE_ZOOM;
  return (
    Math.round(
      Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, zoom)) * 100,
    ) / 100
  );
}

export function resolveInitialTimelineZoom(): number {
  try {
    const stored = localStorage.getItem(TIMELINE_ZOOM_STORAGE_KEY);
    if (stored) {
      const parsed = Number.parseFloat(stored);
      if (Number.isFinite(parsed)) return clampTimelineZoom(parsed);
    }
  } catch {
    /* private browsing */
  }
  return DEFAULT_TIMELINE_ZOOM;
}

export function persistTimelineZoom(zoom: number): void {
  try {
    localStorage.setItem(
      TIMELINE_ZOOM_STORAGE_KEY,
      String(clampTimelineZoom(zoom)),
    );
  } catch {
    /* private browsing */
  }
}

export function timelineZoomPercent(zoom: number): number {
  return Math.round(clampTimelineZoom(zoom) * 100);
}

export function adjustTimelineZoom(zoom: number, direction: "in" | "out"): number {
  const factor =
    direction === "in" ? TIMELINE_ZOOM_STEP_FACTOR : 1 / TIMELINE_ZOOM_STEP_FACTOR;
  return clampTimelineZoom(zoom * factor);
}

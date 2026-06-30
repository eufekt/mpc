export type TrackLayout = "side" | "top";

export const TRACK_LAYOUT_STORAGE_KEY = "mpc-track-layout";
export const DEFAULT_TRACK_LAYOUT: TrackLayout = "top";

export function isTrackLayout(value: string): value is TrackLayout {
  return value === "side" || value === "top";
}

export function resolveInitialTrackLayout(): TrackLayout {
  try {
    const stored = localStorage.getItem(TRACK_LAYOUT_STORAGE_KEY);
    if (stored && isTrackLayout(stored)) return stored;
  } catch {
    /* private browsing */
  }
  return DEFAULT_TRACK_LAYOUT;
}

export function persistTrackLayout(layout: TrackLayout): void {
  try {
    localStorage.setItem(TRACK_LAYOUT_STORAGE_KEY, layout);
  } catch {
    /* private browsing */
  }
}

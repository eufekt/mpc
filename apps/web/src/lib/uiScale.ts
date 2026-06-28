export const UI_SCALE_STORAGE_KEY = "mpc-ui-scale";
export const DEFAULT_UI_SCALE = 1;
export const MIN_UI_SCALE = 0.75;
export const MAX_UI_SCALE = 1.5;

export function clampUiScale(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_UI_SCALE;
  return (
    Math.round(Math.max(MIN_UI_SCALE, Math.min(MAX_UI_SCALE, scale)) * 100) / 100
  );
}

export function resolveInitialUiScale(): number {
  try {
    const stored = localStorage.getItem(UI_SCALE_STORAGE_KEY);
    if (stored) {
      const parsed = Number.parseFloat(stored);
      if (Number.isFinite(parsed)) return clampUiScale(parsed);
    }
  } catch {
    /* private browsing */
  }
  return DEFAULT_UI_SCALE;
}

export function applyUiScale(scale: number): void {
  const clamped = clampUiScale(scale);
  document.documentElement.style.setProperty("--ui-scale", String(clamped));
}

export function persistUiScale(scale: number): void {
  try {
    localStorage.setItem(UI_SCALE_STORAGE_KEY, String(clampUiScale(scale)));
  } catch {
    /* private browsing */
  }
}

export function uiScalePercent(scale: number): number {
  return Math.round(clampUiScale(scale) * 100);
}

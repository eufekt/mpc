import { useCallback, useState } from "react";
import {
  applyUiScale,
  clampUiScale,
  DEFAULT_UI_SCALE,
  persistUiScale,
  resolveInitialUiScale,
} from "../lib/uiScale";

export function useUiScale() {
  const [uiScale, setUiScaleState] = useState(resolveInitialUiScale);

  const setUiScale = useCallback((next: number) => {
    const clamped = clampUiScale(next);
    applyUiScale(clamped);
    persistUiScale(clamped);
    setUiScaleState(clamped);
  }, []);

  const resetUiScale = useCallback(() => {
    setUiScale(DEFAULT_UI_SCALE);
  }, [setUiScale]);

  return { uiScale, setUiScale, resetUiScale };
}

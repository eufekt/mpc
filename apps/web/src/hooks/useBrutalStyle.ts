import { useCallback, useState } from "react";
import {
  applyBrutalStyle,
  normalizeBrutalStyle,
  persistBrutalStyle,
  resolveInitialBrutalStyle,
  type BrutalStyle,
} from "../lib/brutalStyle";

export function useBrutalStyle() {
  const [brutalStyle, setBrutalStyleState] = useState<BrutalStyle>(
    resolveInitialBrutalStyle,
  );

  const setBrutalStyle = useCallback((next: BrutalStyle) => {
    const normalized = normalizeBrutalStyle(next);
    applyBrutalStyle(normalized);
    persistBrutalStyle(normalized);
    setBrutalStyleState(normalized);
  }, []);

  const patchBrutalStyle = useCallback((patch: Partial<BrutalStyle>) => {
    setBrutalStyleState((prev) => {
      const normalized = normalizeBrutalStyle({ ...prev, ...patch });
      applyBrutalStyle(normalized);
      persistBrutalStyle(normalized);
      return normalized;
    });
  }, []);

  return { brutalStyle, setBrutalStyle, patchBrutalStyle };
}

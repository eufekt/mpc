import { useCallback, useState } from "react";
import { normalizeMasterEffects, type MasterEffects } from "../lib/masterEffects";

export function useChopEffectsClipboard() {
  const [copiedEffects, setCopiedEffects] = useState<MasterEffects | null>(null);

  const copyEffects = useCallback((effects: MasterEffects) => {
    setCopiedEffects(normalizeMasterEffects(effects));
  }, []);

  const pasteEffects = useCallback((): MasterEffects | null => {
    if (copiedEffects === null) return null;
    return normalizeMasterEffects(copiedEffects);
  }, [copiedEffects]);

  const hasCopiedEffects = copiedEffects !== null;

  return { copiedEffects, copyEffects, pasteEffects, hasCopiedEffects };
}

import { useCallback, useState } from "react";
import {
  persistTrackLayout,
  resolveInitialTrackLayout,
  type TrackLayout,
} from "../lib/trackLayout";

export function useTrackLayout() {
  const [trackLayout, setTrackLayoutState] = useState(resolveInitialTrackLayout);

  const setTrackLayout = useCallback((next: TrackLayout) => {
    persistTrackLayout(next);
    setTrackLayoutState(next);
  }, []);

  return { trackLayout, setTrackLayout };
}

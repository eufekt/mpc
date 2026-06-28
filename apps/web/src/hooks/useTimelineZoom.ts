import { useCallback, useMemo, useState } from "react";
import { timelinePxPerSecond } from "../lib/arrangement";
import {
  clampTimelineZoom,
  DEFAULT_TIMELINE_ZOOM,
  persistTimelineZoom,
  resolveInitialTimelineZoom,
} from "../lib/timelineZoom";

export function useTimelineZoom() {
  const [timelineZoom, setTimelineZoomState] = useState(resolveInitialTimelineZoom);

  const setTimelineZoom = useCallback((next: number) => {
    const clamped = clampTimelineZoom(next);
    persistTimelineZoom(clamped);
    setTimelineZoomState(clamped);
  }, []);

  const resetTimelineZoom = useCallback(() => {
    setTimelineZoom(DEFAULT_TIMELINE_ZOOM);
  }, [setTimelineZoom]);

  const pxPerSecond = useMemo(
    () => timelinePxPerSecond(timelineZoom),
    [timelineZoom],
  );

  return { timelineZoom, setTimelineZoom, resetTimelineZoom, pxPerSecond };
}

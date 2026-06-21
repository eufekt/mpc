import { useCallback, useRef, useState } from "react";
import {
  clipWidthPx,
  formatDuration,
  normalizeLoopRegion,
  rulerTickInterval,
  seekTimeFromClientX,
  timeToPx,
} from "../lib/arrangement";
import type { ArrangementLoopRegion } from "../lib/types";

type Props = {
  duration: number;
  arrangementDuration: number;
  onSeek: (time: number) => void;
  onLoopRegionChange?: (region: ArrangementLoopRegion) => void;
};

const DRAG_THRESHOLD_PX = 3;

export function ArrangementTimelineRuler({
  duration,
  arrangementDuration,
  onSeek,
  onLoopRegionChange,
}: Props) {
  const widthPx = Math.max(clipWidthPx(duration), 1);
  const interval = rulerTickInterval(Math.max(duration, 1));
  const ticks: number[] = [];
  const maxTime = Math.max(duration, interval);
  for (let t = 0; t <= maxTime; t += interval) {
    ticks.push(t);
  }

  const [selectPreview, setSelectPreview] = useState<ArrangementLoopRegion | null>(
    null,
  );
  const selectPreviewRef = useRef<ArrangementLoopRegion | null>(null);
  const dragRef = useRef<{ anchorTime: number; anchorClientX: number } | null>(
    null,
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !onLoopRegionChange) return;
      const ruler = event.currentTarget;
      ruler.setPointerCapture(event.pointerId);
      const anchorTime = seekTimeFromClientX(event.clientX, ruler);
      const anchorClientX = event.clientX;
      dragRef.current = { anchorTime, anchorClientX };
      let selecting = false;

      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        if (!selecting && Math.abs(ev.clientX - drag.anchorClientX) < DRAG_THRESHOLD_PX) {
          return;
        }
        selecting = true;
        const time = seekTimeFromClientX(ev.clientX, ruler);
        const start = Math.min(drag.anchorTime, time);
        const end = Math.max(drag.anchorTime, time);
        const preview = normalizeLoopRegion(
          { start, end },
          arrangementDuration,
        );
        selectPreviewRef.current = preview;
        setSelectPreview(preview);
      };

      const onUp = (ev: PointerEvent) => {
        ruler.releasePointerCapture(ev.pointerId);
        dragRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);

        if (selecting && selectPreviewRef.current && onLoopRegionChange) {
          onLoopRegionChange(selectPreviewRef.current);
        } else if (!selecting) {
          onSeek(seekTimeFromClientX(ev.clientX, ruler));
        }
        selectPreviewRef.current = null;
        setSelectPreview(null);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [arrangementDuration, onLoopRegionChange, onSeek],
  );

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onLoopRegionChange) {
      onSeek(seekTimeFromClientX(e.clientX, e.currentTarget));
    }
  };

  return (
    <div
      className="arrangement-timeline-ruler"
      style={{ width: `${widthPx}px` }}
      onClick={onLoopRegionChange ? undefined : handleClick}
      onPointerDown={onLoopRegionChange ? handlePointerDown : undefined}
      role="slider"
      aria-label="Timeline"
      aria-valuemin={0}
      aria-valuemax={duration}
    >
      {selectPreview && (
        <div
          className="arrangement-ruler-loop-preview"
          style={{
            left: `${timeToPx(selectPreview.start)}px`,
            width: `${Math.max(0, timeToPx(selectPreview.end - selectPreview.start))}px`,
          }}
          aria-hidden
        />
      )}
      {ticks.map((time) => (
        <div
          key={time}
          className="arrangement-ruler-tick"
          style={{ left: `${timeToPx(time)}px` }}
        >
          <span className="arrangement-ruler-label">
            {formatDuration(time)}
          </span>
        </div>
      ))}
    </div>
  );
}

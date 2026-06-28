import { useCallback, useMemo, useRef, useState } from "react";
import {
  clipWidthPx,
  normalizeLoopRegion,
  pxToTime,
  seekTimeFromClientX,
  timeToPx,
} from "../lib/arrangement";
import {
  beatTimesInRange,
  isBarBoundary,
  snapTime,
  timeToBarBeat,
} from "../lib/musicalTime";
import type { ArrangementLoopRegion, MusicalTimeSettings } from "../lib/types";

type Props = {
  duration: number;
  arrangementDuration: number;
  pxPerSecond: number;
  musicalTime: MusicalTimeSettings;
  onSeek: (time: number) => void;
  onLoopRegionChange?: (region: ArrangementLoopRegion) => void;
};

const DRAG_THRESHOLD_PX = 3;

export function ArrangementTimelineRuler({
  duration,
  arrangementDuration,
  pxPerSecond,
  musicalTime,
  onSeek,
  onLoopRegionChange,
}: Props) {
  const widthPx = Math.max(clipWidthPx(duration, pxPerSecond), 1);
  const toTime = (px: number) => pxToTime(px, pxPerSecond);
  const toPx = (time: number) => timeToPx(time, pxPerSecond);

  const applySnap = useCallback(
    (time: number) => snapTime(time, musicalTime),
    [musicalTime],
  );

  const ticks = useMemo(() => {
    const beatTimes = beatTimesInRange(0, duration, musicalTime.bpm);
    return beatTimes.map((time) => ({
      time,
      isBar: isBarBoundary(time, musicalTime.bpm, musicalTime.beatsPerBar),
      barLabel: isBarBoundary(time, musicalTime.bpm, musicalTime.beatsPerBar)
        ? String(timeToBarBeat(time, musicalTime.bpm, musicalTime.beatsPerBar).bar)
        : null,
    }));
  }, [duration, musicalTime.bpm, musicalTime.beatsPerBar]);

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
      const anchorTime = applySnap(
        seekTimeFromClientX(event.clientX, ruler, toTime),
      );
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
        const time = applySnap(seekTimeFromClientX(ev.clientX, ruler, toTime));
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
          onSeek(applySnap(seekTimeFromClientX(ev.clientX, ruler, toTime)));
        }
        selectPreviewRef.current = null;
        setSelectPreview(null);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [applySnap, arrangementDuration, onLoopRegionChange, onSeek, toTime],
  );

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onLoopRegionChange) {
      onSeek(applySnap(seekTimeFromClientX(e.clientX, e.currentTarget, toTime)));
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
            left: `${toPx(selectPreview.start)}px`,
            width: `${Math.max(0, toPx(selectPreview.end - selectPreview.start))}px`,
          }}
          aria-hidden
        />
      )}
      {ticks.map(({ time, isBar, barLabel }) => (
        <div
          key={time}
          className={`arrangement-ruler-tick${isBar ? " bar" : " beat"}`}
          style={{ left: `${toPx(time)}px` }}
        >
          {barLabel && (
            <span className="arrangement-ruler-label">{barLabel}</span>
          )}
        </div>
      ))}
    </div>
  );
}

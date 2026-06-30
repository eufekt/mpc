import { useCallback, useRef } from "react";
import {
  MIN_LOOP_REGION_SECONDS,
  normalizeLoopRegion,
  pxToTime,
  resolveLoopBounds,
  seekTimeFromClientX,
  timeToPx,
  type ArrangementLoopBounds,
} from "../lib/arrangement";
import {
  formatLoopBeatLength,
  snapLoopEdgeTime,
} from "../lib/musicalTime";
import { formatTimePrecise } from "../lib/timeFormat";
import type {
  ArrangementLoopMode,
  ArrangementLoopRegion as LoopRegion,
  LoopEdgeSnap,
  MusicalTimeSettings,
} from "../lib/types";

type Props = {
  loopRegion: LoopRegion | null | undefined;
  loopMode: ArrangementLoopMode;
  loopBeats: number;
  loopEdgeSnap: LoopEdgeSnap;
  contentBounds: ArrangementLoopBounds | null;
  arrangementDuration: number;
  pxPerSecond: number;
  topPx: number;
  heightPx: number;
  loopEnabled: boolean;
  musicalTime?: MusicalTimeSettings;
  onChange: (region: LoopRegion) => void;
};

export function ArrangementLoopRegion({
  loopRegion,
  loopMode,
  loopBeats,
  loopEdgeSnap,
  contentBounds,
  arrangementDuration,
  pxPerSecond,
  topPx,
  heightPx,
  loopEnabled,
  musicalTime,
  onChange,
}: Props) {
  const resolvedRegion = resolveLoopBounds(loopRegion, arrangementDuration, {
    loopMode,
    loopBeats,
    bpm: musicalTime?.bpm,
    contentBounds,
  });
  const dragRef = useRef<{
    edge: "start" | "end";
    initialRegion: LoopRegion;
  } | null>(null);

  const displayRegion = resolvedRegion;
  const leftPx = timeToPx(displayRegion.start, pxPerSecond);
  const widthPx = Math.max(
    0,
    timeToPx(displayRegion.end - displayRegion.start, pxPerSecond),
  );
  const toTime = (px: number) => pxToTime(px, pxPerSecond);
  const loopLengthSeconds = displayRegion.end - displayRegion.start;
  const showHandles = loopMode === "region";

  const commitRegion = useCallback(
    (start: number, end: number) => {
      onChange(
        normalizeLoopRegion({ start, end }, arrangementDuration),
      );
    },
    [arrangementDuration, onChange],
  );

  const snapLoopTime = useCallback(
    (rawTime: number) => {
      if (!musicalTime) return Math.max(0, rawTime);
      return snapLoopEdgeTime(rawTime, loopEdgeSnap, musicalTime);
    },
    [loopEdgeSnap, musicalTime],
  );

  const handleResizePointerDown = useCallback(
    (edge: "start" | "end", event: React.PointerEvent<HTMLDivElement>) => {
      if (!showHandles) return;
      event.preventDefault();
      event.stopPropagation();
      const regionEl = event.currentTarget.parentElement;
      if (!regionEl) return;

      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      dragRef.current = { edge, initialRegion: resolvedRegion };

      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const rawTime = seekTimeFromClientX(ev.clientX, regionEl, toTime);
        const time = snapLoopTime(rawTime);
        if (drag.edge === "start") {
          commitRegion(
            Math.min(time, drag.initialRegion.end - MIN_LOOP_REGION_SECONDS),
            drag.initialRegion.end,
          );
        } else {
          commitRegion(
            drag.initialRegion.start,
            Math.max(time, drag.initialRegion.start + MIN_LOOP_REGION_SECONDS),
          );
        }
      };

      const onUp = (ev: PointerEvent) => {
        handle.releasePointerCapture(ev.pointerId);
        dragRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [commitRegion, resolvedRegion, showHandles, snapLoopTime, toTime],
  );

  if (arrangementDuration <= 0) return null;

  const lengthLabel =
    musicalTime && loopLengthSeconds > 0
      ? `${formatLoopBeatLength(loopLengthSeconds, musicalTime.bpm)} · ${formatTimePrecise(loopLengthSeconds)}`
      : formatTimePrecise(loopLengthSeconds);

  return (
    <div
      className={[
        "arrangement-loop-region",
        loopEnabled ? "active" : "",
        showHandles ? "editable" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        top: `${topPx}px`,
        left: `${leftPx}px`,
        width: `${widthPx}px`,
        height: `${heightPx}px`,
      }}
    >
      <div className="region-time-labels">
        <span className="region-time-label region-time-start">
          {formatTimePrecise(displayRegion.start)}
        </span>
        <span className="region-length-label">{lengthLabel}</span>
        <span className="region-time-label region-time-end">
          {formatTimePrecise(displayRegion.end)}
        </span>
      </div>
      {showHandles && (
        <>
          <div
            className="arrangement-loop-handle arrangement-loop-handle-start"
            onPointerDown={(e) => handleResizePointerDown("start", e)}
            aria-label="Loop region start"
          />
          <div
            className="arrangement-loop-handle arrangement-loop-handle-end"
            onPointerDown={(e) => handleResizePointerDown("end", e)}
            aria-label="Loop region end"
          />
        </>
      )}
    </div>
  );
}

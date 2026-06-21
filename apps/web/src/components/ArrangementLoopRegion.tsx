import { useCallback, useRef } from "react";
import {
  MIN_LOOP_REGION_SECONDS,
  normalizeLoopRegion,
  resolveLoopBounds,
  seekTimeFromClientX,
  timeToPx,
} from "../lib/arrangement";
import { formatTimePrecise } from "../lib/timeFormat";
import type { ArrangementLoopRegion as LoopRegion } from "../lib/types";

type Props = {
  loopRegion: LoopRegion | null | undefined;
  arrangementDuration: number;
  topPx: number;
  heightPx: number;
  loopEnabled: boolean;
  onChange: (region: LoopRegion) => void;
};

export function ArrangementLoopRegion({
  loopRegion,
  arrangementDuration,
  topPx,
  heightPx,
  loopEnabled,
  onChange,
}: Props) {
  const resolvedRegion = resolveLoopBounds(loopRegion, arrangementDuration);
  const dragRef = useRef<{
    edge: "start" | "end";
    initialRegion: LoopRegion;
  } | null>(null);

  const displayRegion = resolvedRegion;
  const leftPx = timeToPx(displayRegion.start);
  const widthPx = Math.max(0, timeToPx(displayRegion.end - displayRegion.start));

  const commitRegion = useCallback(
    (start: number, end: number) => {
      onChange(
        normalizeLoopRegion({ start, end }, arrangementDuration),
      );
    },
    [arrangementDuration, onChange],
  );

  const handleResizePointerDown = useCallback(
    (edge: "start" | "end", event: React.PointerEvent<HTMLDivElement>) => {
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
        const time = seekTimeFromClientX(ev.clientX, regionEl);
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
    [commitRegion, resolvedRegion],
  );

  if (arrangementDuration <= 0) return null;

  return (
    <div
      className={[
        "arrangement-loop-region",
        loopEnabled ? "active" : "",
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
        <span className="region-time-gap" aria-hidden />
        <span className="region-time-label region-time-end">
          {formatTimePrecise(displayRegion.end)}
        </span>
      </div>
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
    </div>
  );
}

import { useCallback, useMemo, useRef, useState } from "react";
import {
  clipWidthPx,
  computeTimelineWidthPx,
  formatChopKey,
  formatDuration,
  formatTimeStretch,
  getClipLeftPx,
  getFreeClipOverlapState,
  playheadLeftPx,
  pxToTime,
  pxDeltaToTime,
  resolveLaneClips,
} from "../lib/arrangement";
import type { ArrangementLane, Track } from "../lib/types";

type Props = {
  lane: ArrangementLane;
  tracks: Track[];
  playheadTime: number;
  arrangementDuration: number;
  isSelected: boolean;
  selectedChopKey: string;
  repeatCount: number;
  onSelectLane: (laneId: string) => void;
  onSeek: (time: number) => void;
  onAddClipAt: (
    laneId: string,
    sourceTrackId: string,
    chopId: string,
    startTime: number,
    repeat: number,
  ) => void;
  onRemoveClip: (laneId: string, clipId: string) => void;
  onReorderClip: (
    laneId: string,
    clipId: string,
    direction: "left" | "right",
  ) => void;
  onMoveClip: (laneId: string, clipId: string, startTime: number) => void;
  onSetClipStackMode: (
    laneId: string,
    clipId: string,
    stackMode: "clamp" | "overflow",
  ) => void;
};

type DragState = {
  clipId: string;
  startX: number;
  initialStartTime: number;
};

export function ArrangementLaneStrip({
  lane,
  tracks,
  playheadTime,
  arrangementDuration,
  isSelected,
  selectedChopKey,
  repeatCount,
  onSelectLane,
  onSeek,
  onAddClipAt,
  onRemoveClip,
  onReorderClip,
  onMoveClip,
  onSetClipStackMode,
}: Props) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const didDragRef = useRef(false);
  const stripRef = useRef<HTMLDivElement>(null);

  const resolvedClips = useMemo(
    () => resolveLaneClips(lane, tracks),
    [lane, tracks],
  );

  const timelineWidthPx = computeTimelineWidthPx(arrangementDuration);
  const playheadLeft = playheadLeftPx(playheadTime);
  const isFree = lane.mode === "free";
  const placementReady =
    isSelected && isFree && selectedChopKey.length > 0;

  const handleStripClick = (e: React.MouseEvent<HTMLDivElement>) => {
    onSelectLane(lane.id);
    if ((e.target as HTMLElement).closest(".arrangement-clip")) return;

    const strip = stripRef.current;
    if (!strip) return;
    const rect = strip.getBoundingClientRect();
    const time = pxToTime(e.clientX - rect.left);

    const placing =
      isFree &&
      selectedChopKey &&
      isSelected &&
      !dragState &&
      !didDragRef.current;

    if (placing) {
      const [sourceTrackId, chopId] = selectedChopKey.split(":");
      if (!sourceTrackId || !chopId) return;
      onAddClipAt(lane.id, sourceTrackId, chopId, time, repeatCount);
    } else {
      onSeek(time);
    }
    didDragRef.current = false;
  };

  const handleClipPointerDown = useCallback(
    (e: React.PointerEvent, clipId: string, startTime: number) => {
      onSelectLane(lane.id);
      if (!isFree || e.button !== 0) return;
      if ((e.target as HTMLElement).closest(".arrangement-clip-actions")) return;
      e.preventDefault();
      e.stopPropagation();
      didDragRef.current = false;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragState({
        clipId,
        startX: e.clientX,
        initialStartTime: startTime,
      });
    },
    [isFree, lane.id, onSelectLane],
  );

  const handleClipPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState || !stripRef.current) return;
      const deltaPx = e.clientX - dragState.startX;
      if (Math.abs(deltaPx) > 2) {
        didDragRef.current = true;
      }
      const deltaTime = pxDeltaToTime(deltaPx);
      const nextStart = Math.max(0, dragState.initialStartTime + deltaTime);
      onMoveClip(lane.id, dragState.clipId, nextStart);
    },
    [dragState, lane.id, onMoveClip],
  );

  const handleClipPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState) return;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      setDragState(null);
    },
    [dragState],
  );

  return (
    <div
      className={`arrangement-lane-strip-row${isSelected ? " selected" : ""}`}
    >
        <div
          ref={stripRef}
          className={`arrangement-clip-strip${placementReady ? " placement-ready" : " seekable"}`}
        style={{ width: `${timelineWidthPx}px` }}
        onClick={handleStripClick}
      >
        {resolvedClips.map((item, index) => {
          const label = `${item.chopIndex + 1}`;
          const leftPx = getClipLeftPx(lane, resolvedClips, index);
          const startTime = isFree
            ? item.clip.startTime
            : resolvedClips
                .slice(0, index)
                .reduce((sum, r) => sum + r.playbackDuration, 0);
          const overlap =
            isFree && (item.clip.stackMode ?? "overflow") === "overflow"
              ? getFreeClipOverlapState(index, resolvedClips)
              : null;
          const overlapClass = overlap?.hasOverlap
            ? `${overlap.isCoveredByLater ? " overlap-under" : ""}${overlap.coversEarlier ? " overlap-over" : ""}`
            : "";
          const overlapHint = overlap?.hasOverlap
            ? overlap.isCoveredByLater && overlap.coversEarlier
              ? " · overlapped (under & over)"
              : overlap.isCoveredByLater
                ? " · overlapped (under)"
                : " · overlapped (on top)"
            : "";
          return (
            <div
              key={item.clip.id}
              className={`arrangement-clip${isFree ? " draggable" : ""}${overlapClass}`}
              style={{
                backgroundColor: item.chop.color,
                width: `${clipWidthPx(item.playbackDuration)}px`,
                left: `${leftPx}px`,
                zIndex: isFree ? index + 1 : undefined,
              }}
              title={`#${item.chopIndex + 1} · ${formatDuration(item.duration)} · ${formatTimeStretch(item.timeStretch)}% · ${formatChopKey(item.chop)}${overlapHint}`}
              onPointerDown={(e) =>
                handleClipPointerDown(e, item.clip.id, startTime)
              }
              onPointerMove={handleClipPointerMove}
              onPointerUp={handleClipPointerUp}
              onPointerCancel={handleClipPointerUp}
            >
              <span className="arrangement-clip-label">{label}</span>
              <div className="arrangement-clip-actions">
                {!isFree && (
                  <>
                    <button
                      type="button"
                      className="arrangement-clip-action"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() =>
                        onReorderClip(lane.id, item.clip.id, "left")
                      }
                      aria-label="Move clip left"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="arrangement-clip-action"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() =>
                        onReorderClip(lane.id, item.clip.id, "right")
                      }
                      aria-label="Move clip right"
                    >
                      →
                    </button>
                  </>
                )}
                {isFree && (
                  <button
                    type="button"
                    className={`arrangement-clip-stack${(item.clip.stackMode ?? "overflow") === "clamp" ? " active" : ""}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() =>
                      onSetClipStackMode(
                        lane.id,
                        item.clip.id,
                        (item.clip.stackMode ?? "overflow") === "clamp"
                          ? "overflow"
                          : "clamp",
                      )
                    }
                    title={
                      (item.clip.stackMode ?? "overflow") === "clamp"
                        ? "Clamp — cannot overlap other clips"
                        : "Overflow — can overlap other clips"
                    }
                    aria-label={
                      (item.clip.stackMode ?? "overflow") === "clamp"
                        ? "Stack mode clamp"
                        : "Stack mode overflow"
                    }
                  >
                    {(item.clip.stackMode ?? "overflow") === "clamp"
                      ? "CL"
                      : "OV"}
                  </button>
                )}
                <button
                  type="button"
                  className="arrangement-clip-remove"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onRemoveClip(lane.id, item.clip.id)}
                  aria-label="Remove clip"
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
        <div
          className="arrangement-playhead"
          style={{ left: `${playheadLeft}px` }}
        />
      </div>
    </div>
  );
}

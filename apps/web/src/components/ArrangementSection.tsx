import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clampLaneRowHeight,
  computeArrangementDuration,
  computeTimelineLaneAreaHeight,
  computeTimelineScrollDuration,
  computeTimelineWidthPx,
  filterLoadedTracks,
  formatDuration,
  getAllChops,
  ARRANGEMENT_RULER_HEIGHT,
  MAX_LANE_ROW_HEIGHT,
  MIN_LANE_ROW_HEIGHT,
} from "../lib/arrangement";
import { useTimelineZoom } from "../hooks/useTimelineZoom";
import {
  adjustTimelineZoom,
  MAX_TIMELINE_ZOOM,
  MIN_TIMELINE_ZOOM,
  timelineZoomPercent,
} from "../lib/timelineZoom";
import {
  clampBpm,
  defaultMusicalTime,
  LOOP_BEAT_OPTIONS,
  normalizeMusicalTime,
  SNAP_DIVISIONS,
  snapDivisionLabel,
} from "../lib/musicalTime";
import type {
  ArrangementClipStackMode,
  ArrangementLane,
  ArrangementLaneMode,
  ArrangementLoopRegion as LoopRegion,
  MusicalTimeSettings,
  SnapDivision,
  Track,
} from "../lib/types";
import { ArrangementChopBank } from "./ArrangementChopBank";
import {
  ArrangementLaneDialog,
  type LaneDraft,
} from "./ArrangementLaneDialog";
import { ArrangementLanePanel } from "./ArrangementLanePanel";
import { ArrangementLaneStrip } from "./ArrangementLaneStrip";
import { ArrangementLoopRegion } from "./ArrangementLoopRegion";
import { ArrangementTimelineRuler } from "./ArrangementTimelineRuler";

export type ArrangementActions = {
  onRemoveLane: (laneId: string) => void;
  onRenameLane: (laneId: string, name: string) => void;
  onSetMute: (laneId: string, mute: boolean) => void;
  onSetVolume: (laneId: string, volume: number) => void;
  onSetLaneMode: (laneId: string, mode: ArrangementLaneMode) => void;
  onAddClip: (
    laneId: string,
    sourceTrackId: string,
    chopId: string,
    repeat: number,
  ) => void;
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
    stackMode: ArrangementClipStackMode,
  ) => void;
};

type Props = {
  lanes: ArrangementLane[];
  tracks: Track[];
  loadedTrackIds: string[];
  selectedLaneId: string | null;
  onSelectedLaneIdChange: (laneId: string | null) => void;
  isPlaying: boolean;
  playheadTime: number;
  loop: boolean;
  loopRegion: LoopRegion | undefined;
  loopBeats: number;
  musicalTime?: MusicalTimeSettings;
  onMusicalTimeChange: (patch: Partial<MusicalTimeSettings>) => void;
  transportFocused: boolean;
  onFocusTransport: () => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onSeek: (time: number) => void;
  onLoopChange: (loop: boolean) => void;
  onLoopRegionChange: (region: LoopRegion) => void;
  onLoopBeatsChange: (beats: number) => void;
  onAddLane: (draft: LaneDraft) => void;
  laneRowHeight: number;
  onLaneRowHeightChange: (height: number) => void;
  actions: ArrangementActions;
};

const LANE_RESIZE_HANDLE_HEIGHT = 6;

type LaneDialogState =
  | { mode: "add" }
  | { mode: "edit"; laneId: string };

export function ArrangementSection({
  lanes,
  tracks,
  loadedTrackIds,
  selectedLaneId,
  onSelectedLaneIdChange,
  isPlaying,
  playheadTime,
  loop,
  loopRegion,
  loopBeats,
  musicalTime: musicalTimeProp,
  onMusicalTimeChange,
  transportFocused,
  onFocusTransport,
  onTogglePlay,
  onStop,
  onSeek,
  onLoopChange,
  onLoopRegionChange,
  onLoopBeatsChange,
  onAddLane,
  laneRowHeight,
  onLaneRowHeightChange,
  actions,
}: Props) {
  const {
    onRemoveLane,
    onRenameLane,
    onSetMute,
    onSetVolume,
    onSetLaneMode,
    onAddClip,
    onAddClipAt,
    onRemoveClip,
    onReorderClip,
    onMoveClip,
    onSetClipStackMode,
  } = actions;

  const [selectedChopKey, setSelectedChopKey] = useState("");
  const [repeatCount, setRepeatCount] = useState(1);
  const [laneDialog, setLaneDialog] = useState<LaneDialogState | null>(null);
  const resizeStartRef = useRef({ y: 0, height: laneRowHeight });
  const { timelineZoom, setTimelineZoom, resetTimelineZoom, pxPerSecond } =
    useTimelineZoom();

  const musicalTime = normalizeMusicalTime(
    musicalTimeProp ?? defaultMusicalTime(),
  );

  const handleBpmChange = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    onMusicalTimeChange({ bpm: clampBpm(parsed) });
  };

  const handleSnapDivisionChange = (division: SnapDivision) => {
    onMusicalTimeChange({ snapDivision: division });
  };

  const handleLaneResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (lanes.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      resizeStartRef.current = { y: event.clientY, height: laneRowHeight };

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientY - resizeStartRef.current.y;
        const next = clampLaneRowHeight(
          resizeStartRef.current.height + delta / lanes.length,
        );
        onLaneRowHeightChange(next);
      };

      const onUp = (ev: PointerEvent) => {
        handle.releasePointerCapture(ev.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [laneRowHeight, lanes.length, onLaneRowHeightChange],
  );

  const handleTimelineWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setTimelineZoom(
        adjustTimelineZoom(timelineZoom, event.deltaY < 0 ? "in" : "out"),
      );
    },
    [setTimelineZoom, timelineZoom],
  );

  const timelineAreaHeight =
    computeTimelineLaneAreaHeight(lanes.length, laneRowHeight) +
    LANE_RESIZE_HANDLE_HEIGHT;
  const laneHeightStyle = {
    ["--lane-row-height" as string]: `${laneRowHeight}px`,
  } as React.CSSProperties;

  const loadedTracks = useMemo(
    () => filterLoadedTracks(tracks, loadedTrackIds),
    [tracks, loadedTrackIds],
  );

  const chopOptions = useMemo(
    () => getAllChops(loadedTracks),
    [loadedTracks],
  );

  const arrangementDuration = useMemo(
    () => computeArrangementDuration(lanes, loadedTracks),
    [lanes, loadedTracks],
  );

  const loopRegionHeightPx = lanes.length * laneRowHeight;
  const loopRegionTopPx = ARRANGEMENT_RULER_HEIGHT;

  const timelineScrollDuration = useMemo(
    () => computeTimelineScrollDuration(arrangementDuration),
    [arrangementDuration],
  );

  const timelineWidthPx = computeTimelineWidthPx(arrangementDuration, pxPerSecond);
  const canTransport = arrangementDuration > 0;
  const canStop = canTransport && (isPlaying || playheadTime > 0);

  const selectedLane =
    lanes.find((lane) => lane.id === selectedLaneId) ?? null;

  const editingLane =
    laneDialog?.mode === "edit"
      ? (lanes.find((lane) => lane.id === laneDialog.laneId) ?? null)
      : null;

  const defaultLaneName = `Lane ${lanes.length + 1}`;

  const openAddLaneDialog = () => setLaneDialog({ mode: "add" });

  const openEditLaneDialog = (laneId: string) => {
    onSelectedLaneIdChange(laneId);
    setLaneDialog({ mode: "edit", laneId });
  };

  const closeLaneDialog = () => setLaneDialog(null);

  const handleAddLane = (draft: LaneDraft) => {
    onAddLane(draft);
    closeLaneDialog();
  };

  useEffect(() => {
    if (lanes.length === 0) {
      onSelectedLaneIdChange(null);
      return;
    }
    if (!selectedLaneId || !lanes.some((lane) => lane.id === selectedLaneId)) {
      onSelectedLaneIdChange(lanes[0].id);
    }
  }, [lanes, onSelectedLaneIdChange, selectedLaneId]);

  const handleAddToLane = () => {
    if (!selectedLaneId || !selectedChopKey) return;
    const [sourceTrackId, chopId] = selectedChopKey.split(":");
    if (!sourceTrackId || !chopId) return;
    onAddClip(selectedLaneId, sourceTrackId, chopId, repeatCount);
    setRepeatCount(1);
  };

  const handleDropChop = useCallback(
    (
      laneId: string,
      sourceTrackId: string,
      chopId: string,
      startTime: number | null,
    ) => {
      if (startTime === null) {
        onAddClip(laneId, sourceTrackId, chopId, repeatCount);
      } else {
        onAddClipAt(laneId, sourceTrackId, chopId, startTime, repeatCount);
      }
    },
    [onAddClip, onAddClipAt, repeatCount],
  );

  return (
    <section className="arrangement-section" onPointerDown={onFocusTransport}>
      {laneDialog && (
        <ArrangementLaneDialog
          mode={laneDialog.mode}
          lane={editingLane ?? undefined}
          defaultName={defaultLaneName}
          onClose={closeLaneDialog}
          onAdd={laneDialog.mode === "add" ? handleAddLane : undefined}
          onRename={(name) => {
            if (laneDialog.mode !== "edit") return;
            onRenameLane(laneDialog.laneId, name);
          }}
          onSetMode={(mode) => {
            if (laneDialog.mode !== "edit") return;
            onSetLaneMode(laneDialog.laneId, mode);
          }}
          onSetMute={(mute) => {
            if (laneDialog.mode !== "edit") return;
            onSetMute(laneDialog.laneId, mute);
          }}
          onSetVolume={(volume) => {
            if (laneDialog.mode !== "edit") return;
            onSetVolume(laneDialog.laneId, volume);
          }}
          onRemove={
            laneDialog.mode === "edit"
              ? () => {
                  onRemoveLane(laneDialog.laneId);
                  if (selectedLaneId === laneDialog.laneId) {
                    onSelectedLaneIdChange(null);
                  }
                }
              : undefined
          }
        />
      )}

      <div className="arrangement-header">
        <h2>ARRANGEMENT</h2>
        <div className="arrangement-transport">
          <button
            type="button"
            className={isPlaying ? "active" : undefined}
            onClick={onTogglePlay}
            disabled={!canTransport}
          >
            {isPlaying ? "PAUSE" : "PLAY"}
          </button>
          <button type="button" onClick={onStop} disabled={!canStop}>
            STOP
          </button>
          <button
            type="button"
            className={loop ? "active" : undefined}
            onClick={() => onLoopChange(!loop)}
          >
            LOOP
          </button>
          <div className="arrangement-loop-beats">
            <span>BEATS</span>
            {LOOP_BEAT_OPTIONS.map((beats) => (
              <button
                key={beats}
                type="button"
                className={loopBeats === beats ? "active" : undefined}
                onClick={() => onLoopBeatsChange(beats)}
                title={`Loop ${beats} beat${beats === 1 ? "" : "s"}`}
              >
                {beats}
              </button>
            ))}
          </div>
          <span className="arrangement-duration">
            {formatDuration(arrangementDuration)}
          </span>
          <span className="arrangement-playhead-time">
            {formatDuration(playheadTime)}
          </span>
        </div>
        <div className="arrangement-musical-controls">
          <label className="arrangement-musical-bpm">
            BPM
            <input
              type="number"
              min={40}
              max={240}
              step={1}
              value={musicalTime.bpm}
              onChange={(e) => handleBpmChange(e.target.value)}
              aria-label="Beats per minute"
            />
          </label>
          <button
            type="button"
            className={musicalTime.snapEnabled ? "active" : undefined}
            onClick={() =>
              onMusicalTimeChange({ snapEnabled: !musicalTime.snapEnabled })
            }
            title="Snap clip placement to grid"
          >
            SNAP
          </button>
          <div className="arrangement-grid-selector">
            <span>GRID</span>
            {SNAP_DIVISIONS.map((division) => (
              <button
                key={division}
                type="button"
                className={
                  musicalTime.snapDivision === division ? "active" : undefined
                }
                onClick={() => handleSnapDivisionChange(division)}
                title={`Snap to ${snapDivisionLabel(division)} notes`}
              >
                {snapDivisionLabel(division)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={musicalTime.metronomeEnabled ? "active" : undefined}
            onClick={() =>
              onMusicalTimeChange({
                metronomeEnabled: !musicalTime.metronomeEnabled,
              })
            }
            title="Metronome click during arrangement playback"
          >
            CLICK
          </button>
        </div>
        <div className="arrangement-zoom-controls">
          <span>ZOOM</span>
          <button
            type="button"
            onClick={() => setTimelineZoom(adjustTimelineZoom(timelineZoom, "out"))}
            aria-label="Zoom timeline out"
          >
            −
          </button>
          <label className="arrangement-sizing-slider">
            <span className="visually-hidden">Timeline zoom</span>
            <input
              type="range"
              min={MIN_TIMELINE_ZOOM * 100}
              max={MAX_TIMELINE_ZOOM * 100}
              step={5}
              value={timelineZoomPercent(timelineZoom)}
              onChange={(e) =>
                setTimelineZoom(Number(e.target.value) / 100)
              }
              aria-label="Timeline zoom"
            />
          </label>
          <span className="arrangement-zoom-value">
            {timelineZoomPercent(timelineZoom)}%
          </span>
          <button
            type="button"
            onClick={() => setTimelineZoom(adjustTimelineZoom(timelineZoom, "in"))}
            aria-label="Zoom timeline in"
          >
            +
          </button>
          <button type="button" onClick={resetTimelineZoom}>
            RESET
          </button>
        </div>
        <div className="arrangement-lane-height-controls">
          <span>LANES</span>
          <button
            type="button"
            onClick={() =>
              onLaneRowHeightChange(
                clampLaneRowHeight(laneRowHeight - 4),
              )
            }
            disabled={lanes.length === 0}
            aria-label="Decrease lane height"
          >
            −
          </button>
          <label className="arrangement-sizing-slider">
            <span className="visually-hidden">Lane row height</span>
            <input
              type="range"
              min={MIN_LANE_ROW_HEIGHT}
              max={MAX_LANE_ROW_HEIGHT}
              step={2}
              value={laneRowHeight}
              disabled={lanes.length === 0}
              onChange={(e) =>
                onLaneRowHeightChange(Number(e.target.value))
              }
              aria-label="Lane row height"
            />
          </label>
          <span className="arrangement-lane-height-value">{laneRowHeight}px</span>
          <button
            type="button"
            onClick={() =>
              onLaneRowHeightChange(
                clampLaneRowHeight(laneRowHeight + 4),
              )
            }
            disabled={lanes.length === 0}
            aria-label="Increase lane height"
          >
            +
          </button>
        </div>
      </div>

      <div
        className={[
          "arrangement-editor",
          transportFocused ? "transport-focused" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={laneHeightStyle}
      >
        <ArrangementLanePanel
          lanes={lanes}
          tracks={loadedTracks}
          selectedLaneId={selectedLaneId}
          onSelectLane={onSelectedLaneIdChange}
          onEditLane={openEditLaneDialog}
          onAddLane={openAddLaneDialog}
        />

        {lanes.length > 0 ? (
          <div
            className="arrangement-timeline-area"
            style={{ minHeight: `${timelineAreaHeight}px` }}
          >
            <div className="arrangement-timeline-layout">
              <div className="arrangement-lane-labels">
                <div className="arrangement-ruler-spacer" aria-hidden />
                {lanes.map((lane, index) => (
                  <button
                    key={lane.id}
                    type="button"
                    className={`arrangement-lane-label${lane.id === selectedLaneId ? " selected" : ""}`}
                    onClick={() => onSelectedLaneIdChange(lane.id)}
                    onDoubleClick={() => openEditLaneDialog(lane.id)}
                    title={`${lane.name} — double-click to edit`}
                  >
                    {lane.name || `Lane ${index + 1}`}
                  </button>
                ))}
              </div>

              <div
                className="arrangement-timeline-scroll"
                onWheel={handleTimelineWheel}
                title="Ctrl or ⌘ + scroll to zoom timeline"
              >
                <div
                  className="arrangement-timeline-inner"
                  style={{ width: `${timelineWidthPx}px` }}
                >
                  <div className="arrangement-timeline-content">
                    <ArrangementTimelineRuler
                      duration={timelineScrollDuration}
                      arrangementDuration={arrangementDuration}
                      pxPerSecond={pxPerSecond}
                      musicalTime={musicalTime}
                      onSeek={onSeek}
                      onLoopRegionChange={onLoopRegionChange}
                    />
                    <div className="arrangement-lane-strips">
                      {lanes.map((lane) => (
                        <ArrangementLaneStrip
                          key={lane.id}
                          lane={lane}
                          tracks={loadedTracks}
                          playheadTime={playheadTime}
                          arrangementDuration={arrangementDuration}
                          pxPerSecond={pxPerSecond}
                          musicalTime={musicalTime}
                          isSelected={lane.id === selectedLaneId}
                          selectedChopKey={selectedChopKey}
                          repeatCount={repeatCount}
                          onSelectLane={onSelectedLaneIdChange}
                          onSeek={onSeek}
                          onAddClipAt={onAddClipAt}
                          onRemoveClip={onRemoveClip}
                          onReorderClip={onReorderClip}
                          onMoveClip={onMoveClip}
                          onSetClipStackMode={onSetClipStackMode}
                          onDropChop={(sourceTrackId, chopId, startTime) =>
                            handleDropChop(
                              lane.id,
                              sourceTrackId,
                              chopId,
                              startTime,
                            )
                          }
                        />
                      ))}
                    </div>
                    <ArrangementLoopRegion
                      loopRegion={loopRegion}
                      loopBeats={loopBeats}
                      arrangementDuration={arrangementDuration}
                      pxPerSecond={pxPerSecond}
                      topPx={loopRegionTopPx}
                      heightPx={loopRegionHeightPx}
                      loopEnabled={loop}
                      musicalTime={musicalTime}
                      onChange={onLoopRegionChange}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div
              className="arrangement-lane-resize-handle"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize lane height"
              onPointerDown={handleLaneResizePointerDown}
            />
          </div>
        ) : (
          <p className="hint arrangement-editor-empty">
            add a lane, then place chops from the bank below
          </p>
        )}
      </div>

      <ArrangementChopBank
        chopOptions={chopOptions}
        selectedChopKey={selectedChopKey}
        onSelectChop={setSelectedChopKey}
        repeatCount={repeatCount}
        onRepeatChange={setRepeatCount}
        selectedLane={selectedLane}
        onAdd={handleAddToLane}
      />
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  computeArrangementDuration,
  computeTimelineScrollDuration,
  computeTimelineWidthPx,
  formatDuration,
  getAllChops,
} from "../lib/arrangement";
import type { ArrangementLane, ArrangementLaneMode, Track } from "../lib/types";
import { ArrangementChopBank } from "./ArrangementChopBank";
import { ArrangementLanePanel } from "./ArrangementLanePanel";
import { ArrangementLaneStrip } from "./ArrangementLaneStrip";
import { ArrangementTimelineRuler } from "./ArrangementTimelineRuler";

type Props = {
  lanes: ArrangementLane[];
  tracks: Track[];
  loadedTrackIds: string[];
  isPlaying: boolean;
  playheadTime: number;
  loop: boolean;
  onPlay: () => void;
  onStop: () => void;
  onSeek: (time: number) => void;
  onLoopChange: (loop: boolean) => void;
  onAddLane: () => void;
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
    stackMode: "clamp" | "overflow",
  ) => void;
};

export function ArrangementSection({
  lanes,
  tracks,
  loadedTrackIds,
  isPlaying,
  playheadTime,
  loop,
  onPlay,
  onStop,
  onSeek,
  onLoopChange,
  onAddLane,
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
}: Props) {
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null);
  const [selectedChopKey, setSelectedChopKey] = useState("");
  const [repeatCount, setRepeatCount] = useState(1);

  const loadedTracks = useMemo(
    () => tracks.filter((track) => loadedTrackIds.includes(track.id)),
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

  const timelineScrollDuration = useMemo(
    () => computeTimelineScrollDuration(arrangementDuration),
    [arrangementDuration],
  );

  const timelineWidthPx = computeTimelineWidthPx(arrangementDuration);
  const canPlay = arrangementDuration > 0 && !isPlaying;

  const selectedLane =
    lanes.find((lane) => lane.id === selectedLaneId) ?? null;

  useEffect(() => {
    if (lanes.length === 0) {
      setSelectedLaneId(null);
      return;
    }
    if (!selectedLaneId || !lanes.some((lane) => lane.id === selectedLaneId)) {
      setSelectedLaneId(lanes[0].id);
    }
  }, [lanes, selectedLaneId]);

  const handleAddToLane = () => {
    if (!selectedLaneId || !selectedChopKey) return;
    const [sourceTrackId, chopId] = selectedChopKey.split(":");
    if (!sourceTrackId || !chopId) return;
    onAddClip(selectedLaneId, sourceTrackId, chopId, repeatCount);
    setRepeatCount(1);
  };

  return (
    <section className="arrangement-section">
      <div className="arrangement-header">
        <h2>ARRANGEMENT</h2>
        <div className="arrangement-transport">
          <button type="button" onClick={onPlay} disabled={!canPlay}>
            PLAY
          </button>
          <button type="button" onClick={onStop} disabled={!isPlaying}>
            STOP
          </button>
          <button
            type="button"
            className={loop ? "active" : undefined}
            onClick={() => onLoopChange(!loop)}
          >
            LOOP
          </button>
          <span className="arrangement-duration">
            {formatDuration(arrangementDuration)}
          </span>
          <span className="arrangement-playhead-time">
            {formatDuration(playheadTime)}
          </span>
        </div>
        <button type="button" onClick={onAddLane}>
          ADD LANE
        </button>
      </div>

      {lanes.length === 0 ? (
        <p className="hint">
          add a lane, then place chops from the bank below
        </p>
      ) : (
        <div className="arrangement-editor">
          <ArrangementLanePanel
            lanes={lanes}
            tracks={loadedTracks}
            selectedLaneId={selectedLaneId}
            onSelectLane={setSelectedLaneId}
            onRenameLane={onRenameLane}
            onSetMode={onSetLaneMode}
            onSetMute={onSetMute}
            onSetVolume={onSetVolume}
            onRemoveLane={onRemoveLane}
          />

          <div className="arrangement-timeline-area">
            <div className="arrangement-timeline-layout">
              <div className="arrangement-lane-labels">
                <div className="arrangement-ruler-spacer" aria-hidden />
                {lanes.map((lane, index) => (
                  <button
                    key={lane.id}
                    type="button"
                    className={`arrangement-lane-label${lane.id === selectedLaneId ? " selected" : ""}`}
                    onClick={() => setSelectedLaneId(lane.id)}
                    title={lane.name}
                  >
                    {lane.name || `Lane ${index + 1}`}
                  </button>
                ))}
              </div>

              <div className="arrangement-timeline-scroll">
                <div
                  className="arrangement-timeline-inner"
                  style={{ width: `${timelineWidthPx}px` }}
                >
                  <ArrangementTimelineRuler
                    duration={timelineScrollDuration}
                    onSeek={onSeek}
                  />
                  <div className="arrangement-lane-strips">
                    {lanes.map((lane) => (
                      <ArrangementLaneStrip
                        key={lane.id}
                        lane={lane}
                        tracks={loadedTracks}
                        playheadTime={playheadTime}
                        arrangementDuration={arrangementDuration}
                        isSelected={lane.id === selectedLaneId}
                        selectedChopKey={selectedChopKey}
                        repeatCount={repeatCount}
                        onSelectLane={setSelectedLaneId}
                        onSeek={onSeek}
                        onAddClipAt={onAddClipAt}
                        onRemoveClip={onRemoveClip}
                        onReorderClip={onReorderClip}
                        onMoveClip={onMoveClip}
                        onSetClipStackMode={onSetClipStackMode}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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

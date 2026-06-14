import { computeLaneDuration, formatDuration } from "../lib/arrangement";
import type { ArrangementLane, ArrangementLaneMode, Track } from "../lib/types";

type Props = {
  lanes: ArrangementLane[];
  tracks: Track[];
  selectedLaneId: string | null;
  onSelectLane: (laneId: string) => void;
  onRenameLane: (laneId: string, name: string) => void;
  onSetMode: (laneId: string, mode: ArrangementLaneMode) => void;
  onSetMute: (laneId: string, mute: boolean) => void;
  onSetVolume: (laneId: string, volume: number) => void;
  onRemoveLane: (laneId: string) => void;
};

export function ArrangementLanePanel({
  lanes,
  tracks,
  selectedLaneId,
  onSelectLane,
  onRenameLane,
  onSetMode,
  onSetMute,
  onSetVolume,
  onRemoveLane,
}: Props) {
  const selectedLane =
    lanes.find((lane) => lane.id === selectedLaneId) ?? null;

  return (
    <aside className="arrangement-lane-panel">
      <div className="arrangement-lane-panel-header">LANES</div>
      <ul className="arrangement-lane-list">
        {lanes.map((lane, index) => {
          const duration = computeLaneDuration(lane, tracks);
          const isSelected = lane.id === selectedLaneId;
          return (
            <li key={lane.id}>
              <button
                type="button"
                className={`arrangement-lane-list-item${isSelected ? " selected" : ""}`}
                onClick={() => onSelectLane(lane.id)}
              >
                <span className="arrangement-lane-list-name">
                  {lane.name || `Lane ${index + 1}`}
                </span>
                <span className="arrangement-lane-list-meta">
                  {lane.mode === "free" ? "FREE" : "CLAMPED"}
                  {lane.mute ? " · MUTED" : ""}
                </span>
                <span className="arrangement-lane-list-duration">
                  {formatDuration(duration)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selectedLane && (
        <div className="arrangement-lane-controls">
          <label className="arrangement-lane-control">
            <span>NAME</span>
            <input
              className="arrangement-lane-name"
              type="text"
              value={selectedLane.name}
              onChange={(e) => onRenameLane(selectedLane.id, e.target.value)}
              aria-label="Lane name"
            />
          </label>
          <div className="arrangement-lane-mode">
            <span>MODE</span>
            <button
              type="button"
              className={
                selectedLane.mode === "clamped" ? "active" : undefined
              }
              onClick={() => onSetMode(selectedLane.id, "clamped")}
            >
              CLAMPED
            </button>
            <button
              type="button"
              className={selectedLane.mode === "free" ? "active" : undefined}
              onClick={() => onSetMode(selectedLane.id, "free")}
            >
              FREE
            </button>
          </div>
          <button
            type="button"
            className={selectedLane.mute ? "active" : undefined}
            onClick={() => onSetMute(selectedLane.id, !selectedLane.mute)}
          >
            {selectedLane.mute ? "UNMUTE" : "MUTE"}
          </button>
          <label className="arrangement-lane-volume">
            <span>VOL</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={selectedLane.volume}
              onChange={(e) =>
                onSetVolume(
                  selectedLane.id,
                  Number.parseFloat(e.target.value),
                )
              }
            />
          </label>
          <button
            type="button"
            onClick={() => onRemoveLane(selectedLane.id)}
          >
            REMOVE LANE
          </button>
        </div>
      )}
    </aside>
  );
}

import { computeLaneDuration, formatDuration } from "../lib/arrangement";
import type { ArrangementLane, Track } from "../lib/types";

type Props = {
  lanes: ArrangementLane[];
  tracks: Track[];
  selectedLaneId: string | null;
  onSelectLane: (laneId: string) => void;
  onEditLane: (laneId: string) => void;
  onAddLane: () => void;
};

export function ArrangementLanePanel({
  lanes,
  tracks,
  selectedLaneId,
  onSelectLane,
  onEditLane,
  onAddLane,
}: Props) {
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
                onDoubleClick={() => onEditLane(lane.id)}
                title="Double-click to edit lane"
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
      <div className="arrangement-lane-add">
        <button type="button" onClick={onAddLane}>
          ADD LANE
        </button>
      </div>
    </aside>
  );
}

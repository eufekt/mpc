import type { PadMode } from "../lib/types";
import { PadRow } from "./PadRow";

type Props = {
  padMode: PadMode;
  onPadModeChange: (mode: PadMode) => void;
  loopingKey: string | null;
  onStopLoop: () => void;
  assignedKeys: Set<string>;
  keyColors: Map<string, string>;
  activeKey: string | null;
  onPadClick: (key: string) => void;
  onPadDoubleClick?: (key: string) => void;
  arrangeHint?: string | null;
};

export function PadDock({
  padMode,
  onPadModeChange,
  loopingKey,
  onStopLoop,
  assignedKeys,
  keyColors,
  activeKey,
  onPadClick,
  onPadDoubleClick,
  arrangeHint,
}: Props) {
  return (
    <footer className="pad-dock" aria-label="Pads">
      <div className="pad-dock-toolbar">
        <span className="pad-dock-label">PADS</span>
        <div className="pad-mode-toggle">
          <span>MODE</span>
          <button
            type="button"
            className={padMode === "layer" ? "active" : undefined}
            onClick={() => onPadModeChange("layer")}
          >
            LAYER
          </button>
          <button
            type="button"
            className={padMode === "clear" ? "active" : undefined}
            onClick={() => onPadModeChange("clear")}
          >
            CLEAR
          </button>
          <button
            type="button"
            className={padMode === "loop" ? "active" : undefined}
            onClick={() => onPadModeChange("loop")}
          >
            LOOP
          </button>
          {loopingKey && (
            <button type="button" onClick={onStopLoop}>
              STOP
            </button>
          )}
        </div>
        {arrangeHint && (
          <span className="pad-dock-hint hint">{arrangeHint}</span>
        )}
      </div>
      <PadRow
        assignedKeys={assignedKeys}
        keyColors={keyColors}
        activeKey={activeKey}
        loopingKey={loopingKey}
        onPadClick={onPadClick}
        onPadDoubleClick={onPadDoubleClick}
      />
    </footer>
  );
}

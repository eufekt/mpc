import { formatDuration } from "../lib/arrangement";
import type { PadMode } from "../lib/types";
import { PadRow } from "./PadRow";

type Props = {
  isPlaying: boolean;
  playheadTime: number;
  arrangementDuration: number;
  loop: boolean;
  canTransport: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onLoopChange: (loop: boolean) => void;
  trackCount: number;
  chopCount: number;
  padMode: PadMode;
  onPadModeChange: (mode: PadMode) => void;
  loopingKey: string | null;
  onStopLoop: () => void;
  assignedKeys: Set<string>;
  keyColors: Map<string, string>;
  activeKey: string | null;
  onPadClick: (key: string) => void;
};

export function PlayWorkspace({
  isPlaying,
  playheadTime,
  arrangementDuration,
  loop,
  canTransport,
  onTogglePlay,
  onStop,
  onLoopChange,
  trackCount,
  chopCount,
  padMode,
  onPadModeChange,
  loopingKey,
  onStopLoop,
  assignedKeys,
  keyColors,
  activeKey,
  onPadClick,
}: Props) {
  const canStop = canTransport && (isPlaying || playheadTime > 0);

  return (
    <section className="play-workspace">
      <h2>PERFORM</h2>
      <p className="play-workspace-summary">
        {trackCount} track{trackCount === 1 ? "" : "s"} · {chopCount} chop
        {chopCount === 1 ? "" : "s"}
      </p>
      <div className="play-workspace-transport">
        <button
          type="button"
          className={isPlaying ? "active" : undefined}
          onClick={onTogglePlay}
          disabled={!canTransport}
        >
          {isPlaying ? "PAUSE ARRANGEMENT" : "PLAY ARRANGEMENT"}
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
        <span>{formatDuration(playheadTime)}</span>
        <span className="hint">/ {formatDuration(arrangementDuration)}</span>
      </div>

      <div className="play-workspace-pads">
        <div className="play-workspace-pads-toolbar">
          <span>PADS</span>
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
        </div>
        <PadRow
          assignedKeys={assignedKeys}
          keyColors={keyColors}
          activeKey={activeKey}
          loopingKey={loopingKey}
          onPadClick={onPadClick}
        />
      </div>

      <p className="hint play-workspace-hint">
        tap pads to trigger chops · P toggles pad bind mode · space controls
        transport
      </p>
    </section>
  );
}

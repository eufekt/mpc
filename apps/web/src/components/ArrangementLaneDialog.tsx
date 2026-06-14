import { useEffect, useState } from "react";
import type { ArrangementLane, ArrangementLaneMode } from "../lib/types";

export type LaneDraft = {
  name: string;
  mode: ArrangementLaneMode;
  mute: boolean;
  volume: number;
};

type Props = {
  mode: "add" | "edit";
  lane?: ArrangementLane;
  defaultName?: string;
  onClose: () => void;
  onAdd?: (draft: LaneDraft) => void;
  onRename: (name: string) => void;
  onSetMode: (mode: ArrangementLaneMode) => void;
  onSetMute: (mute: boolean) => void;
  onSetVolume: (volume: number) => void;
  onRemove?: () => void;
};

export function ArrangementLaneDialog({
  mode,
  lane,
  defaultName = "Lane 1",
  onClose,
  onAdd,
  onRename,
  onSetMode,
  onSetMute,
  onSetVolume,
  onRemove,
}: Props) {
  const [draft, setDraft] = useState<LaneDraft>(() => ({
    name: lane?.name ?? defaultName,
    mode: lane?.mode ?? "clamped",
    mute: lane?.mute ?? false,
    volume: lane?.volume ?? 1,
  }));

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (mode !== "edit" || !lane) return;
    setDraft({
      name: lane.name,
      mode: lane.mode,
      mute: lane.mute,
      volume: lane.volume,
    });
  }, [lane, mode]);

  const applyEdit = (patch: Partial<LaneDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (mode !== "edit") return;
    if (patch.name !== undefined) onRename(patch.name);
    if (patch.mode !== undefined) onSetMode(patch.mode);
    if (patch.mute !== undefined) onSetMute(patch.mute);
    if (patch.volume !== undefined) onSetVolume(patch.volume);
  };

  const handleSubmit = () => {
    if (mode === "add") {
      onAdd?.(draft);
      onClose();
    }
  };

  return (
    <div
      className="arrangement-lane-dialog-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="arrangement-lane-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="arrangement-lane-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="arrangement-lane-dialog-header">
          <h3 id="arrangement-lane-dialog-title">
            {mode === "add" ? "ADD LANE" : "EDIT LANE"}
          </h3>
          <button type="button" onClick={onClose}>
            CLOSE
          </button>
        </header>

        <label className="arrangement-lane-dialog-field">
          <span>NAME</span>
          <input
            className="arrangement-lane-name"
            type="text"
            value={draft.name}
            onChange={(e) => applyEdit({ name: e.target.value })}
            aria-label="Lane name"
          />
        </label>

        <div className="arrangement-lane-mode">
          <span>MODE</span>
          <button
            type="button"
            className={draft.mode === "clamped" ? "active" : undefined}
            onClick={() => applyEdit({ mode: "clamped" })}
          >
            CLAMPED
          </button>
          <button
            type="button"
            className={draft.mode === "free" ? "active" : undefined}
            onClick={() => applyEdit({ mode: "free" })}
          >
            FREE
          </button>
        </div>

        <button
          type="button"
          className={`arrangement-lane-dialog-action${draft.mute ? " active" : ""}`}
          onClick={() => applyEdit({ mute: !draft.mute })}
        >
          {draft.mute ? "UNMUTE" : "MUTE"}
        </button>

        <label className="arrangement-lane-volume arrangement-lane-dialog-field">
          <span>VOL</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={draft.volume}
            onChange={(e) =>
              applyEdit({ volume: Number.parseFloat(e.target.value) })
            }
          />
        </label>

        {mode === "add" ? (
          <button
            type="button"
            className="arrangement-lane-dialog-action"
            onClick={handleSubmit}
          >
            ADD LANE
          </button>
        ) : (
          <button
            type="button"
            className="arrangement-lane-dialog-action"
            onClick={() => {
              onRemove?.();
              onClose();
            }}
          >
            REMOVE LANE
          </button>
        )}
      </div>
    </div>
  );
}

import type { ArrangementLane } from "../lib/types";
import { type ChopOption } from "../lib/arrangement";
import { ChopPicker } from "./ChopPicker";

type Props = {
  chopOptions: ChopOption[];
  selectedChopKey: string;
  onSelectChop: (key: string) => void;
  repeatCount: number;
  onRepeatChange: (count: number) => void;
  selectedLane: ArrangementLane | null;
  onAdd: () => void;
};

export function ArrangementChopBank({
  chopOptions,
  selectedChopKey,
  onSelectChop,
  repeatCount,
  onRepeatChange,
  selectedLane,
  onAdd,
}: Props) {
  const isFree = selectedLane?.mode === "free";
  const canAdd = !isFree && selectedChopKey.length > 0 && selectedLane !== null;

  return (
    <div className="arrangement-chop-bank">
      <div className="arrangement-chop-bank-header">
        <span>CHOP BANK</span>
        {selectedLane && (
          <span className="arrangement-chop-bank-target">
            → {selectedLane.name}
            {isFree ? " (free — click timeline)" : ""}
          </span>
        )}
      </div>
      <ChopPicker
        options={chopOptions}
        selectedKey={selectedChopKey}
        onSelect={onSelectChop}
      />
      <div className="arrangement-add-controls">
        <label>
          <span>REPEAT</span>
          <input
            type="number"
            min={1}
            max={99}
            value={repeatCount}
            onChange={(e) =>
              onRepeatChange(
                Math.max(1, Number.parseInt(e.target.value, 10) || 1),
              )
            }
          />
        </label>
        {!isFree && (
          <button type="button" onClick={onAdd} disabled={!canAdd}>
            ADD TO LANE
          </button>
        )}
      </div>
    </div>
  );
}

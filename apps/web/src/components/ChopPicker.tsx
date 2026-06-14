import {
  formatChopDisplayName,
  formatChopKey,
  formatChopSummary,
  formatDuration,
  getChopOptionId,
  type ChopOption,
} from "../lib/arrangement";

type Props = {
  options: ChopOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
};

export function ChopPicker({ options, selectedKey, onSelect }: Props) {
  if (options.length === 0) {
    return (
      <p className="hint chop-picker-empty">
        no chops — create on source tracks
      </p>
    );
  }

  return (
    <div className="chop-picker" role="listbox" aria-label="Select chop">
      {options.map((option) => {
        const id = getChopOptionId(option);
        const isSelected = selectedKey === id;
        return (
          <button
            key={id}
            type="button"
            role="option"
            aria-selected={isSelected}
            className={`chop-picker-item${isSelected ? " selected" : ""}`}
            onClick={() => onSelect(isSelected ? "" : id)}
            title={formatChopSummary(option)}
          >
            <span
              className="chop-picker-swatch"
              style={{ backgroundColor: option.chop.color }}
              aria-hidden
            />
            <span className="chop-picker-number">
              {formatChopDisplayName(option.chop, option.chopIndex)}
            </span>
            <span className="chop-picker-duration">
              {formatDuration(option.duration)}
            </span>
            <span className="chop-picker-key">{formatChopKey(option.chop)}</span>
          </button>
        );
      })}
    </div>
  );
}

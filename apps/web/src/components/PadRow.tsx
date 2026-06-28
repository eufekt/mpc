import { PAD_LETTERS } from "../lib/midi";

type Props = {
  assignedKeys: Set<string>;
  keyColors: Map<string, string>;
  activeKey: string | null;
  loopingKey?: string | null;
  onPadClick: (key: string) => void;
  onPadDoubleClick?: (key: string) => void;
};

export function PadRow({
  assignedKeys,
  keyColors,
  activeKey,
  loopingKey,
  onPadClick,
  onPadDoubleClick,
}: Props) {
  return (
    <div className="pad-row">
      {PAD_LETTERS.map((key) => {
        const assigned = assignedKeys.has(key);
        const active = activeKey === key;
        const looping = loopingKey === key;
        const color = keyColors.get(key);
        return (
          <button
            key={key}
            type="button"
            className={[
              "pad",
              assigned ? "assigned" : "",
              active ? "active" : "",
              looping ? "looping" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={
              color && !active && !looping
                ? { borderBottomWidth: 3, borderBottomColor: color }
                : undefined
            }
            onClick={() => onPadClick(key)}
            onDoubleClick={() => onPadDoubleClick?.(key)}
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}

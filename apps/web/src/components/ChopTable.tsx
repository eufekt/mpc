import { useEffect, useState } from "react";
import { PALETTES, type PaletteMode } from "../lib/chopColors";
import {
  MAX_TIME_STRETCH_PERCENT,
  MIN_TIME_STRETCH_PERCENT,
  percentToTimeStretch,
  timeStretchToPercent,
} from "../lib/arrangement";
import type { Chop } from "../lib/types";
import { formatTimePrecise } from "../lib/timeFormat";

type Props = {
  chops: Chop[];
  paletteMode: PaletteMode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNameChange: (id: string, name: string) => void;
  onVolumeChange: (id: string, volume: number) => void;
  onTimeStretchChange: (id: string, timeStretch: number) => void;
  onColorChange: (id: string, color: string) => void;
};

export function ChopTable({
  chops,
  paletteMode,
  selectedId,
  onSelect,
  onDelete,
  onNameChange,
  onVolumeChange,
  onTimeStretchChange,
  onColorChange,
}: Props) {
  const [openColorId, setOpenColorId] = useState<string | null>(null);
  const palette = PALETTES[paletteMode];

  useEffect(() => {
    if (!openColorId) return;
    const close = () => setOpenColorId(null);
    const id = window.setTimeout(() => {
      document.addEventListener("click", close);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("click", close);
    };
  }, [openColorId]);

  if (chops.length === 0) {
    return <p>no chops — drag on waveform to create</p>;
  }

  return (
    <table className="chop-table">
      <colgroup>
        <col className="chop-col-color" />
        <col className="chop-col-name" />
        <col className="chop-col-time" />
        <col className="chop-col-time" />
        <col className="chop-col-key" />
        <col className="chop-col-vol" />
        <col className="chop-col-spd" />
        <col className="chop-col-delete" />
      </colgroup>
      <thead>
        <tr>
          <th className="chop-color-cell"></th>
          <th className="chop-name-cell">#</th>
          <th className="chop-time-cell">start</th>
          <th className="chop-time-cell">end</th>
          <th className="chop-key-cell">key</th>
          <th className="chop-vol-cell">vol</th>
          <th className="chop-spd-cell">spd</th>
          <th className="chop-delete-cell"></th>
        </tr>
      </thead>
      <tbody>
        {chops.map((chop, index) => (
          <tr
            key={chop.id}
            className={selectedId === chop.id ? "selected" : undefined}
            onClick={() => onSelect(chop.id)}
          >
            <td className="chop-color-cell">
              <button
                type="button"
                className="chop-color-swatch"
                style={{ backgroundColor: chop.color }}
                aria-label={`chop ${index + 1} color`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenColorId((prev) =>
                    prev === chop.id ? null : chop.id,
                  );
                }}
              />
              {openColorId === chop.id && (
                <div
                  className="chop-color-popover"
                  onClick={(e) => e.stopPropagation()}
                >
                  {palette.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="chop-color-option"
                      style={{ backgroundColor: color }}
                      aria-label={`set color ${color}`}
                      aria-current={chop.color === color ? true : undefined}
                      onClick={() => {
                        onColorChange(chop.id, color);
                        setOpenColorId(null);
                      }}
                    />
                  ))}
                  <label className="chop-color-custom" title="custom color">
                    <input
                      type="color"
                      value={chop.color}
                      onChange={(e) => {
                        onColorChange(chop.id, e.target.value);
                        setOpenColorId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </label>
                </div>
              )}
            </td>
            <td className="chop-name-cell">
              <input
                type="text"
                className="chop-name-input"
                value={chop.name ?? ""}
                placeholder={String(index + 1)}
                aria-label={`chop ${index + 1} name`}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => onNameChange(chop.id, e.target.value)}
              />
            </td>
            <td className="chop-time-cell">{formatTimePrecise(chop.start)}</td>
            <td className="chop-time-cell">{formatTimePrecise(chop.end)}</td>
            <td className="chop-key-cell">{chop.key ?? "—"}</td>
            <td className="chop-volume-cell">
              <input
                type="number"
                className="chop-volume-input"
                min={0}
                max={100}
                step={1}
                value={Math.round(chop.volume * 100)}
                aria-label={`chop ${index + 1} volume`}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  const next = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(next)) {
                    onVolumeChange(
                      chop.id,
                      Math.min(100, Math.max(0, next)) / 100,
                    );
                  }
                }}
              />
            </td>
            <td className="chop-spd-cell">
              <input
                type="number"
                className="chop-stretch"
                min={MIN_TIME_STRETCH_PERCENT}
                max={MAX_TIME_STRETCH_PERCENT}
                step={1}
                value={timeStretchToPercent(chop.timeStretch)}
                aria-label={`chop ${index + 1} speed`}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  const next = Number.parseInt(e.target.value, 10);
                  if (Number.isFinite(next)) {
                    onTimeStretchChange(chop.id, percentToTimeStretch(next));
                  }
                }}
              />
            </td>
            <td className="chop-delete-cell">
              <button
                type="button"
                className="chop-delete-btn"
                aria-label={`Delete chop ${index + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(chop.id);
                }}
              >
                <svg aria-hidden="true" viewBox="0 0 8 8" width="8" height="8">
                  <path
                    d="M1 1 L7 7 M7 1 L1 7"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    fill="none"
                  />
                </svg>
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

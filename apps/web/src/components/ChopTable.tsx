import { useEffect, useState } from "react";
import { PALETTES, type PaletteMode } from "../lib/chopColors";
import type { Chop } from "../lib/types";

type Props = {
  chops: Chop[];
  paletteMode: PaletteMode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onVolumeChange: (id: string, volume: number) => void;
  onColorChange: (id: string, color: string) => void;
};

export function ChopTable({
  chops,
  paletteMode,
  selectedId,
  onSelect,
  onDelete,
  onVolumeChange,
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
    <table>
      <thead>
        <tr>
          <th></th>
          <th>#</th>
          <th>start</th>
          <th>end</th>
          <th>key</th>
          <th>vol</th>
          <th></th>
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
            <td>{index + 1}</td>
            <td>{chop.start.toFixed(2)}</td>
            <td>{chop.end.toFixed(2)}</td>
            <td>{chop.key?.toUpperCase() ?? "—"}</td>
            <td>
              <input
                type="range"
                className="chop-volume"
                min={0}
                max={100}
                value={Math.round(chop.volume * 100)}
                aria-label={`chop ${index + 1} volume`}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  onVolumeChange(chop.id, Number(e.target.value) / 100);
                }}
              />
              <span className="chop-volume-value">
                {Math.round(chop.volume * 100)}
              </span>
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

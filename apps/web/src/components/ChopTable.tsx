import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PALETTES, type PaletteMode } from "../lib/chopColors";
import {
  MAX_TIME_STRETCH_PERCENT,
  MIN_TIME_STRETCH_PERCENT,
  percentToTimeStretch,
  timeStretchToPercent,
} from "../lib/arrangement";
import {
  CHOP_DRAG_MIME,
  encodeChopDragKey,
} from "../lib/chopDrag";
import type { Chop } from "../lib/types";
import { formatTimePrecise } from "../lib/timeFormat";

type Props = {
  trackId: string;
  chops: Chop[];
  paletteMode: PaletteMode;
  selectedId: string | null;
  compact?: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNameChange: (id: string, name: string) => void;
  onVolumeChange: (id: string, volume: number) => void;
  onTimeStretchChange: (id: string, timeStretch: number) => void;
  onReverseChange: (id: string, reverse: boolean) => void;
  onColorChange: (id: string, color: string) => void;
};

type ColorMenuState = {
  chopId: string;
  top: number;
  left: number;
};

export function ChopTable({
  trackId,
  chops,
  paletteMode,
  selectedId,
  compact = false,
  onSelect,
  onDelete,
  onNameChange,
  onVolumeChange,
  onTimeStretchChange,
  onReverseChange,
  onColorChange,
}: Props) {
  const [colorMenu, setColorMenu] = useState<ColorMenuState | null>(null);
  const colorPopoverRef = useRef<HTMLDivElement | null>(null);
  const palette = PALETTES[paletteMode];

  const closeColorMenu = () => setColorMenu(null);

  useEffect(() => {
    if (!colorMenu) return;
    const close = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (colorPopoverRef.current?.contains(target)) return;
      closeColorMenu();
    };
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", close);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", close);
    };
  }, [colorMenu]);

  const openColorMenu = (chopId: string, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    setColorMenu({
      chopId,
      top: rect.top,
      left: rect.right + 4,
    });
  };

  const menuChop = colorMenu
    ? chops.find((chop) => chop.id === colorMenu.chopId)
    : null;

  const handleDragStart = (
    event: React.DragEvent<HTMLSpanElement>,
    chopId: string,
  ) => {
    event.dataTransfer.setData(
      CHOP_DRAG_MIME,
      encodeChopDragKey(trackId, chopId),
    );
    event.dataTransfer.effectAllowed = "copy";
  };

  if (chops.length === 0) {
    return <p>no chops — drag on waveform to create</p>;
  }

  return (
    <>
      <table
        className={["chop-table", compact ? "chop-table--compact" : ""]
          .filter(Boolean)
          .join(" ")}
      >
        <colgroup>
          <col className="chop-col-drag" />
          <col className="chop-col-color" />
          <col className="chop-col-name" />
          <col className="chop-col-time" />
          <col className="chop-col-time" />
          <col className="chop-col-key" />
          {!compact && <col className="chop-col-vol" />}
          {!compact && <col className="chop-col-spd" />}
          {!compact && <col className="chop-col-rev" />}
          <col className="chop-col-delete" />
        </colgroup>
        <thead>
          <tr>
            <th className="chop-drag-cell" aria-label="drag" />
            <th className="chop-color-cell" />
            <th className="chop-name-cell">#</th>
            <th className="chop-time-cell">start</th>
            <th className="chop-time-cell">end</th>
            <th className="chop-key-cell">key</th>
            {!compact && <th className="chop-vol-cell">vol</th>}
            {!compact && <th className="chop-spd-cell">spd</th>}
            {!compact && <th className="chop-rev-cell">rev</th>}
            <th className="chop-delete-cell" />
          </tr>
        </thead>
        <tbody>
          {chops.map((chop, index) => (
            <tr
              key={chop.id}
              className={selectedId === chop.id ? "selected" : undefined}
              onClick={() => onSelect(chop.id)}
            >
              <td className="chop-drag-cell">
                <span
                  className="chop-drag-handle"
                  draggable
                  title="drag to arrangement lane"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onDragStart={(e) => handleDragStart(e, chop.id)}
                >
                  ⋮⋮
                </span>
              </td>
              <td className="chop-color-cell">
                <button
                  type="button"
                  className="chop-color-swatch"
                  style={{ backgroundColor: chop.color }}
                  aria-label={`chop ${index + 1} color`}
                  aria-expanded={colorMenu?.chopId === chop.id}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (colorMenu?.chopId === chop.id) {
                      closeColorMenu();
                      return;
                    }
                    openColorMenu(chop.id, e.currentTarget);
                  }}
                />
              </td>
              <td className="chop-name-cell">
                {compact ? (
                  <span className="chop-name-display">
                    {chop.name?.trim() || String(index + 1)}
                  </span>
                ) : (
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
                )}
              </td>
              <td className="chop-time-cell">{formatTimePrecise(chop.start)}</td>
              <td className="chop-time-cell">{formatTimePrecise(chop.end)}</td>
              <td className="chop-key-cell">{chop.key?.toUpperCase() ?? "—"}</td>
              {!compact && (
                <>
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
                          onTimeStretchChange(
                            chop.id,
                            percentToTimeStretch(next),
                          );
                        }
                      }}
                    />
                  </td>
                  <td className="chop-rev-cell">
                    <button
                      type="button"
                      className={chop.reverse ? "active" : undefined}
                      aria-label={`chop ${index + 1} reverse`}
                      aria-pressed={chop.reverse}
                      title="reverse playback"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReverseChange(chop.id, !chop.reverse);
                      }}
                    >
                      rev
                    </button>
                  </td>
                </>
              )}
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

      {colorMenu &&
        menuChop &&
        createPortal(
          <div
            ref={colorPopoverRef}
            className="chop-color-popover chop-color-popover--floating"
            style={{ top: colorMenu.top, left: colorMenu.left }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {palette.map((color) => (
              <button
                key={color}
                type="button"
                className="chop-color-option"
                style={{ backgroundColor: color }}
                aria-label={`set color ${color}`}
                aria-current={menuChop.color === color ? true : undefined}
                onClick={() => {
                  onColorChange(menuChop.id, color);
                  closeColorMenu();
                }}
              />
            ))}
            <label className="chop-color-custom" title="custom color">
              <input
                type="color"
                value={menuChop.color}
                onChange={(e) => onColorChange(menuChop.id, e.target.value)}
              />
            </label>
          </div>,
          document.body,
        )}
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PALETTES, type PaletteMode } from "../lib/chopColors";
import {
  MAX_TIME_STRETCH_PERCENT,
  MIN_TIME_STRETCH_PERCENT,
  percentToTimeStretch,
  timeStretchToPercent,
} from "../lib/arrangement";
import type { Chop, Track } from "../lib/types";
import { formatTimePrecise } from "../lib/timeFormat";

type Props = {
  track: Track;
  chop: Chop;
  chopIndex: number;
  paletteMode: PaletteMode;
  onNameChange: (name: string) => void;
  onVolumeChange: (volume: number) => void;
  onTimeStretchChange: (timeStretch: number) => void;
  onReverseChange: (reverse: boolean) => void;
  onColorChange: (color: string) => void;
  onDelete: () => void;
  onClose: () => void;
};

export function ChopInspector({
  track,
  chop,
  chopIndex,
  paletteMode,
  onNameChange,
  onVolumeChange,
  onTimeStretchChange,
  onReverseChange,
  onColorChange,
  onDelete,
  onClose,
}: Props) {
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const colorPopoverRef = useRef<HTMLDivElement | null>(null);
  const swatchRef = useRef<HTMLButtonElement | null>(null);
  const palette = PALETTES[paletteMode];

  useEffect(() => {
    if (!colorMenuOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (colorPopoverRef.current?.contains(target)) return;
      if (swatchRef.current?.contains(target)) return;
      setColorMenuOpen(false);
    };
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", close);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", close);
    };
  }, [colorMenuOpen]);

  const displayNumber = chop.name?.trim() || String(chopIndex + 1);

  return (
    <aside className="chop-inspector" aria-label="Chop inspector">
      <header className="chop-inspector-header">
        <span>CHOP</span>
        <button type="button" onClick={onClose} aria-label="Close inspector">
          ×
        </button>
      </header>

      <div className="chop-inspector-track">{track.name}</div>

      <label className="chop-inspector-field">
        <span>NAME</span>
        <input
          type="text"
          value={chop.name ?? ""}
          placeholder={String(chopIndex + 1)}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </label>

      <div className="chop-inspector-field">
        <span>COLOR</span>
        <button
          ref={swatchRef}
          type="button"
          className="chop-inspector-swatch"
          style={{ backgroundColor: chop.color }}
          aria-label={`chop ${displayNumber} color`}
          aria-expanded={colorMenuOpen}
          onClick={() => setColorMenuOpen((open) => !open)}
        />
      </div>

      <div className="chop-inspector-times">
        <span>START {formatTimePrecise(chop.start)}</span>
        <span>END {formatTimePrecise(chop.end)}</span>
      </div>

      <div className="chop-inspector-field">
        <span>PAD KEY</span>
        <span className="chop-inspector-key">
          {chop.key?.toUpperCase() ?? "—"}
        </span>
        <p className="hint chop-inspector-hint">
          select chop, press a letter key to bind
        </p>
      </div>

      <label className="chop-inspector-field">
        <span>VOLUME</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(chop.volume * 100)}
          onChange={(e) =>
            onVolumeChange(Number(e.target.value) / 100)
          }
        />
        <span>{Math.round(chop.volume * 100)}%</span>
      </label>

      <label className="chop-inspector-field">
        <span>SPEED %</span>
        <input
          type="number"
          min={MIN_TIME_STRETCH_PERCENT}
          max={MAX_TIME_STRETCH_PERCENT}
          value={timeStretchToPercent(chop.timeStretch)}
          onChange={(e) => {
            const next = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(next)) {
              onTimeStretchChange(percentToTimeStretch(next));
            }
          }}
        />
      </label>

      <label className="chop-inspector-field chop-inspector-check">
        <input
          type="checkbox"
          checked={chop.reverse}
          onChange={(e) => onReverseChange(e.target.checked)}
        />
        <span>REVERSE</span>
      </label>

      <button type="button" className="chop-inspector-delete" onClick={onDelete}>
        DELETE CHOP
      </button>

      {colorMenuOpen &&
        createPortal(
          <div
            ref={colorPopoverRef}
            className="chop-color-popover chop-color-popover--floating"
            style={{
              top: swatchRef.current
                ? swatchRef.current.getBoundingClientRect().bottom + 4
                : 0,
              left: swatchRef.current
                ? swatchRef.current.getBoundingClientRect().left
                : 0,
            }}
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
                  onColorChange(color);
                  setColorMenuOpen(false);
                }}
              />
            ))}
            <label className="chop-color-custom" title="custom color">
              <input
                type="color"
                value={chop.color}
                onChange={(e) => onColorChange(e.target.value)}
              />
            </label>
          </div>,
          document.body,
        )}
    </aside>
  );
}

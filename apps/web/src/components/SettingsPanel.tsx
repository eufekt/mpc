import type { MasterEffects } from "../lib/masterEffects";
import type { Theme } from "../lib/theme";
import type { TrackLayout } from "../lib/trackLayout";
import type { BrutalStyle } from "../lib/brutalStyle";
import {
  MAX_BRUTAL_OFFSET,
  MIN_BRUTAL_OFFSET,
} from "../lib/brutalStyle";
import { normalizeMasterEffects } from "../lib/masterEffects";
import {
  MAX_UI_SCALE,
  MIN_UI_SCALE,
  uiScalePercent,
} from "../lib/uiScale";
import { EffectsControls } from "./EffectsControls";

type Props = {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  accentColor: string;
  onAccentColorChange: (color: string) => void;
  paletteMode: "pastel" | "acidic";
  onPaletteModeChange: (mode: "pastel" | "acidic") => void;
  masterEffects: MasterEffects;
  onMasterEffectsChange: (effects: MasterEffects) => void;
  uiScale: number;
  onUiScaleChange: (scale: number) => void;
  onUiScaleReset: () => void;
  trackLayout: TrackLayout;
  onTrackLayoutChange: (layout: TrackLayout) => void;
  brutalStyle: BrutalStyle;
  onBrutalStyleChange: (patch: Partial<BrutalStyle>) => void;
  projectName: string;
  onClearSavedData: () => void;
};

export function SettingsPanel({
  theme,
  onThemeChange,
  accentColor,
  onAccentColorChange,
  paletteMode,
  onPaletteModeChange,
  masterEffects,
  onMasterEffectsChange,
  uiScale,
  onUiScaleChange,
  onUiScaleReset,
  trackLayout,
  onTrackLayoutChange,
  brutalStyle,
  onBrutalStyleChange,
  projectName,
  onClearSavedData,
}: Props) {
  return (
    <section className="settings-panel">
      <div className="settings-panel-header">
        <h2>SETTINGS</h2>
      </div>
      <div className="settings-palette-toggle">
        <span>THEME</span>
        <button
          type="button"
          className={theme === "light" ? "active" : undefined}
          onClick={() => onThemeChange("light")}
        >
          LIGHT
        </button>
        <button
          type="button"
          className={theme === "dark" ? "active" : undefined}
          onClick={() => onThemeChange("dark")}
        >
          DARK
        </button>
      </div>
      <div className="settings-palette-toggle">
        <span>TRACKS</span>
        <button
          type="button"
          className={trackLayout === "top" ? "active" : undefined}
          onClick={() => onTrackLayoutChange("top")}
        >
          TOP
        </button>
        <button
          type="button"
          className={trackLayout === "side" ? "active" : undefined}
          onClick={() => onTrackLayoutChange("side")}
        >
          SIDE
        </button>
      </div>
      <div className="settings-palette-toggle">
        <span>PALETTE</span>
        <button
          type="button"
          className={paletteMode === "pastel" ? "active" : undefined}
          onClick={() => onPaletteModeChange("pastel")}
        >
          PASTEL
        </button>
        <button
          type="button"
          className={paletteMode === "acidic" ? "active" : undefined}
          onClick={() => onPaletteModeChange("acidic")}
        >
          ACIDIC
        </button>
      </div>
      <label className="settings-slider-field">
        <span>UI ZOOM {uiScalePercent(uiScale)}%</span>
        <input
          type="range"
          min={MIN_UI_SCALE * 100}
          max={MAX_UI_SCALE * 100}
          step={5}
          value={uiScalePercent(uiScale)}
          onChange={(e) => onUiScaleChange(Number(e.target.value) / 100)}
        />
      </label>
      <button type="button" onClick={onUiScaleReset}>
        RESET UI ZOOM
      </button>
      <p className="hint settings-zoom-hint">
        fixes clipped UI after browser zoom · ⌘0 / Ctrl+0 also resets
      </p>
      <label className="settings-color-field">
        Highlight / playhead color
        <input
          type="color"
          value={accentColor}
          onChange={(e) => onAccentColorChange(e.target.value)}
        />
      </label>

      <div className="settings-brutal-section">
        <div className="settings-palette-toggle">
          <span>BRUTAL</span>
          <button
            type="button"
            className={brutalStyle.enabled ? "active" : undefined}
            onClick={() => onBrutalStyleChange({ enabled: true })}
          >
            ON
          </button>
          <button
            type="button"
            className={!brutalStyle.enabled ? "active" : undefined}
            onClick={() => onBrutalStyleChange({ enabled: false })}
          >
            OFF
          </button>
        </div>
        {brutalStyle.enabled && (
          <>
            <label className="settings-slider-field">
              <span>3D OFFSET {brutalStyle.offsetHeight}px</span>
              <input
                type="range"
                min={MIN_BRUTAL_OFFSET}
                max={MAX_BRUTAL_OFFSET}
                step={1}
                value={brutalStyle.offsetHeight}
                onChange={(e) =>
                  onBrutalStyleChange({ offsetHeight: Number(e.target.value) })
                }
              />
            </label>
            <label className="settings-slider-field">
              <span>3D ANGLE {brutalStyle.angle}°</span>
              <input
                type="range"
                min={0}
                max={359}
                step={1}
                value={brutalStyle.angle}
                onChange={(e) =>
                  onBrutalStyleChange({ angle: Number(e.target.value) })
                }
              />
            </label>
            <label className="settings-color-field">
              3D border color
              <input
                type="color"
                value={brutalStyle.backgroundColor1}
                onChange={(e) =>
                  onBrutalStyleChange({ backgroundColor1: e.target.value })
                }
              />
            </label>
            <div className="settings-palette-toggle">
              <span>BORDER FADE</span>
              <button
                type="button"
                className={
                  brutalStyle.backgroundColor2 === null ? "active" : undefined
                }
                onClick={() => onBrutalStyleChange({ backgroundColor2: null })}
              >
                1 COLOR
              </button>
              <button
                type="button"
                className={
                  brutalStyle.backgroundColor2 !== null ? "active" : undefined
                }
                onClick={() =>
                  onBrutalStyleChange({
                    backgroundColor2:
                      brutalStyle.backgroundColor2 ?? "#ffffff",
                  })
                }
              >
                2 COLORS
              </button>
            </div>
            {brutalStyle.backgroundColor2 !== null && (
              <label className="settings-color-field">
                3D border fade color
                <input
                  type="color"
                  value={brutalStyle.backgroundColor2}
                  onChange={(e) =>
                    onBrutalStyleChange({ backgroundColor2: e.target.value })
                  }
                />
              </label>
            )}
          </>
        )}
      </div>

      <EffectsControls
        effects={masterEffects}
        onChange={(effects) =>
          onMasterEffectsChange(normalizeMasterEffects(effects))
        }
        title="MASTER EFFECTS"
      />

      <p className="hint">
        Clears tracks, chops, saved audio, session preferences, and MIDI pad
        mappings for the active project ({projectName}) in this browser.
      </p>
      <button type="button" onClick={onClearSavedData}>
        CLEAR PROJECT DATA
      </button>
    </section>
  );
}

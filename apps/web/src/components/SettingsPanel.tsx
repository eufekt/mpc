import type { MasterEffects } from "../lib/masterEffects";
import type { Theme } from "../lib/theme";
import { normalizeMasterEffects } from "../lib/masterEffects";

type Props = {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  accentColor: string;
  onAccentColorChange: (color: string) => void;
  paletteMode: "pastel" | "acidic";
  onPaletteModeChange: (mode: "pastel" | "acidic") => void;
  masterEffects: MasterEffects;
  onMasterEffectsChange: (effects: MasterEffects) => void;
  projectName: string;
  onClearSavedData: () => void;
};

function updateEffects(
  current: MasterEffects,
  patch: {
    delay?: Partial<MasterEffects["delay"]>;
    filter?: Partial<MasterEffects["filter"]>;
  },
): MasterEffects {
  return normalizeMasterEffects({
    delay: { ...current.delay, ...patch.delay },
    filter: { ...current.filter, ...patch.filter },
  });
}

export function SettingsPanel({
  theme,
  onThemeChange,
  accentColor,
  onAccentColorChange,
  paletteMode,
  onPaletteModeChange,
  masterEffects,
  onMasterEffectsChange,
  projectName,
  onClearSavedData,
}: Props) {
  const { delay, filter } = masterEffects;

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
      <label className="settings-color-field">
        Highlight / playhead color
        <input
          type="color"
          value={accentColor}
          onChange={(e) => onAccentColorChange(e.target.value)}
        />
      </label>

      <div className="settings-effects">
        <h3>MASTER EFFECTS</h3>

        <div className="settings-effect-block">
          <div className="settings-palette-toggle">
            <span>DELAY / ECHO</span>
            <button
              type="button"
              className={delay.enabled ? "active" : undefined}
              onClick={() =>
                onMasterEffectsChange(
                  updateEffects(masterEffects, {
                    delay: { enabled: !delay.enabled },
                  }),
                )
              }
            >
              {delay.enabled ? "ON" : "OFF"}
            </button>
          </div>
          <label className="settings-slider-field">
            <span>Time {delay.timeMs} ms</span>
            <input
              type="range"
              min={10}
              max={2000}
              step={10}
              value={delay.timeMs}
              disabled={!delay.enabled}
              onChange={(e) =>
                onMasterEffectsChange(
                  updateEffects(masterEffects, {
                    delay: { timeMs: Number(e.target.value) },
                  }),
                )
              }
            />
          </label>
          <label className="settings-slider-field">
            <span>Feedback {Math.round(delay.feedback * 100)}%</span>
            <input
              type="range"
              min={0}
              max={95}
              step={1}
              value={Math.round(delay.feedback * 100)}
              disabled={!delay.enabled}
              onChange={(e) =>
                onMasterEffectsChange(
                  updateEffects(masterEffects, {
                    delay: { feedback: Number(e.target.value) / 100 },
                  }),
                )
              }
            />
          </label>
          <label className="settings-slider-field">
            <span>Mix {Math.round(delay.mix * 100)}%</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(delay.mix * 100)}
              disabled={!delay.enabled}
              onChange={(e) =>
                onMasterEffectsChange(
                  updateEffects(masterEffects, {
                    delay: { mix: Number(e.target.value) / 100 },
                  }),
                )
              }
            />
          </label>
        </div>

        <div className="settings-effect-block">
          <div className="settings-palette-toggle">
            <span>FILTER</span>
            <button
              type="button"
              className={filter.enabled ? "active" : undefined}
              onClick={() =>
                onMasterEffectsChange(
                  updateEffects(masterEffects, {
                    filter: { enabled: !filter.enabled },
                  }),
                )
              }
            >
              {filter.enabled ? "ON" : "OFF"}
            </button>
          </div>
          <div className="settings-palette-toggle">
            <span>TYPE</span>
            <button
              type="button"
              className={filter.type === "lowpass" ? "active" : undefined}
              disabled={!filter.enabled}
              onClick={() =>
                onMasterEffectsChange(
                  updateEffects(masterEffects, {
                    filter: { type: "lowpass" },
                  }),
                )
              }
            >
              LOW
            </button>
            <button
              type="button"
              className={filter.type === "highpass" ? "active" : undefined}
              disabled={!filter.enabled}
              onClick={() =>
                onMasterEffectsChange(
                  updateEffects(masterEffects, {
                    filter: { type: "highpass" },
                  }),
                )
              }
            >
              HIGH
            </button>
          </div>
          <label className="settings-slider-field">
            <span>Cutoff {Math.round(filter.cutoffHz)} Hz</span>
            <input
              type="range"
              min={20}
              max={20000}
              step={1}
              value={filter.cutoffHz}
              disabled={!filter.enabled}
              onChange={(e) =>
                onMasterEffectsChange(
                  updateEffects(masterEffects, {
                    filter: { cutoffHz: Number(e.target.value) },
                  }),
                )
              }
            />
          </label>
          <label className="settings-slider-field">
            <span>Resonance {filter.resonance.toFixed(1)}</span>
            <input
              type="range"
              min={0.1}
              max={18}
              step={0.1}
              value={filter.resonance}
              disabled={!filter.enabled}
              onChange={(e) =>
                onMasterEffectsChange(
                  updateEffects(masterEffects, {
                    filter: { resonance: Number(e.target.value) },
                  }),
                )
              }
            />
          </label>
        </div>
      </div>

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

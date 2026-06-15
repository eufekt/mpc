type Props = {
  accentColor: string;
  onAccentColorChange: (color: string) => void;
  paletteMode: "pastel" | "acidic";
  onPaletteModeChange: (mode: "pastel" | "acidic") => void;
  projectName: string;
  onClearSavedData: () => void;
};

export function SettingsPanel({
  accentColor,
  onAccentColorChange,
  paletteMode,
  onPaletteModeChange,
  projectName,
  onClearSavedData,
}: Props) {
  return (
    <section className="settings-panel">
      <div className="settings-panel-header">
        <h2>SETTINGS</h2>
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

type Props = {
  onClearSavedData: () => void;
};

export function SettingsPanel({ onClearSavedData }: Props) {
  return (
    <section className="settings-panel">
      <div className="settings-panel-header">
        <h2>SETTINGS</h2>
      </div>
      <p className="hint">
        Clears tracks, chops, saved audio, session preferences, and MIDI pad
        mappings stored in this browser.
      </p>
      <button type="button" onClick={onClearSavedData}>
        CLEAR SAVED DATA
      </button>
    </section>
  );
}

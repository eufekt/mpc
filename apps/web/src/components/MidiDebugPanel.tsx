import {
  bindingKeyFromBinding,
  bindingKeyFromEntry,
  formatBinding,
  formatMidiEntry,
  isLearnableEntry,
  PAD_LETTERS,
  type MidiBinding,
  type MidiInputInfo,
  type MidiLogEntry,
  type MidiPortInfo,
} from "../lib/midi";

type Props = {
  supported: boolean;
  connected: boolean;
  error: string | null;
  inputs: MidiInputInfo[];
  outputs: MidiPortInfo[];
  sysexEnabled: boolean;
  permissionState: string | null;
  messages: MidiLogEntry[];
  bindings: MidiBinding[];
  learnPad: string | null;
  lastTrigger: string | null;
  assignedKeys: Set<string>;
  playMode: boolean;
  hasSelectedChop: boolean;
  onConnect: () => void;
  onConnectSysex: () => void;
  onRescan: () => void;
  onDisconnect: () => void;
  onArmLearn: (padKey: string) => void;
  onCancelLearn: () => void;
  onClearLog: () => void;
  onRemoveBinding: (key: string) => void;
  onClearBindings: () => void;
  onMapEntryToPad: (entry: MidiLogEntry, padKey: string) => void;
};

function PortList({
  label,
  ports,
}: {
  label: string;
  ports: MidiPortInfo[];
}) {
  if (ports.length === 0) return null;
  return (
    <>
      <span className="midi-port-label">{label}</span>
      <ul className="midi-input-list">
        {ports.map((port) => (
          <li key={port.id}>
            {port.name}
            {port.manufacturer ? ` (${port.manufacturer})` : ""} — {port.state}
          </li>
        ))}
      </ul>
    </>
  );
}

export function MidiDebugPanel({
  supported,
  connected,
  error,
  inputs,
  outputs,
  sysexEnabled,
  permissionState,
  messages,
  bindings,
  learnPad,
  lastTrigger,
  assignedKeys,
  playMode,
  hasSelectedChop,
  onConnect,
  onConnectSysex,
  onRescan,
  onDisconnect,
  onArmLearn,
  onCancelLearn,
  onClearLog,
  onRemoveBinding,
  onClearBindings,
  onMapEntryToPad,
}: Props) {
  const bindingByPad = new Map(
    bindings.map((b) => [b.padKey.toUpperCase(), b]),
  );

  const noDevices = connected && inputs.length === 0 && outputs.length === 0;
  const outputsOnly = connected && inputs.length === 0 && outputs.length > 0;

  return (
    <section className="midi-panel">
      <div className="midi-panel-header">
        <h2>MIDI</h2>
        <div className="midi-panel-actions">
          {!connected ? (
            <>
              <button type="button" onClick={onConnect} disabled={!supported}>
                CONNECT
              </button>
              <button
                type="button"
                onClick={onConnectSysex}
                disabled={!supported}
              >
                CONNECT (EXTENDED)
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onRescan}>
                RESCAN
              </button>
              <button type="button" onClick={onDisconnect}>
                DISCONNECT
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClearLog}
            disabled={messages.length === 0}
          >
            CLEAR LOG
          </button>
          <button
            type="button"
            onClick={onClearBindings}
            disabled={bindings.length === 0}
          >
            CLEAR MAPS
          </button>
        </div>
      </div>

      {!supported && (
        <p className="hint">
          Web MIDI requires Chrome or Edge. Safari does not support it yet.
        </p>
      )}

      {connected && (
        <p className="hint">
          {inputs.length} input{inputs.length === 1 ? "" : "s"},{" "}
          {outputs.length} output{outputs.length === 1 ? "" : "s"}
          {permissionState ? ` — permission: ${permissionState}` : ""}
          {sysexEnabled ? " — sysex on" : ""}
        </p>
      )}

      {error && <pre>midi error: {error}</pre>}

      {noDevices && (
        <div className="midi-troubleshoot">
          <p className="midi-warning">
            Chrome granted MIDI access but sees no devices at all.
          </p>
          <ol>
            <li>
              Confirm the PCR-300 is on, USB-connected, and shows in{" "}
              <strong>Audio MIDI Setup</strong> (macOS → Applications →
              Utilities).
            </li>
            <li>
              Unplug/replug USB, then click <strong>RESCAN</strong>.
            </li>
            <li>
              Open{" "}
              <a href="chrome://settings/content/midi" target="_blank" rel="noreferrer">
                chrome://settings/content/midi
              </a>{" "}
              — set localhost to <strong>Allow</strong>. Reload this page and
              click CONNECT again.
            </li>
            <li>
              Close DAWs or other apps that may be holding the device (Ableton,
              GarageBand, etc.).
            </li>
            <li>
              Try <strong>CONNECT (EXTENDED)</strong> if the normal connect
              still shows 0 devices.
            </li>
            <li>
              On the PCR-300: check the display isn&apos;t in a USB/storage mode
              — it should be in normal MIDI mode.
            </li>
          </ol>
        </div>
      )}

      {outputsOnly && (
        <p className="midi-warning">
          outputs found but no inputs — the controller may not be sending MIDI
          to the computer, or macOS only exposed an output port. Check Audio MIDI
          Setup and the PCR-300 MIDI settings.
        </p>
      )}

      <PortList label="INPUTS" ports={inputs} />
      <PortList label="OUTPUTS" ports={outputs} />

      <div className="midi-learn">
        <span>MAP TO PAD</span>
        {learnPad ? (
          <span className="midi-learn-status">
            press a key or button on your MIDI controller (not the computer
            keyboard) for pad {learnPad}…{" "}
            <button type="button" onClick={onCancelLearn}>
              cancel
            </button>
          </span>
        ) : (
          <span className="hint">
            click a pad, then press a control on your MIDI controller
          </span>
        )}
        <div className="midi-pad-row">
          {PAD_LETTERS.map((pad) => {
            const mapped = bindingByPad.get(pad);
            const assigned = assignedKeys.has(pad);
            const learning = learnPad === pad;
            const triggered = lastTrigger === pad;
            return (
              <button
                key={pad}
                type="button"
                className={[
                  "pad",
                  "midi-pad",
                  assigned ? "assigned" : "",
                  learning ? "active" : "",
                  triggered ? "active" : "",
                  mapped ? "mapped" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                title={
                  mapped
                    ? `mapped: ${formatBinding(mapped)}`
                    : assigned
                      ? "chop assigned"
                      : "click to learn MIDI"
                }
                onClick={() => onArmLearn(pad)}
              >
                {pad}
              </button>
            );
          })}
        </div>
      </div>

      <p className="hint">
        {hasSelectedChop
          ? "chop selected — mapped MIDI triggers bind to that pad"
          : playMode
            ? "play on — mapped MIDI triggers assigned chops"
            : "play off — mapped MIDI only shows in log unless a chop is selected"}
      </p>

      {bindings.length > 0 && (
        <table className="midi-bindings-table">
          <thead>
            <tr>
              <th>pad</th>
              <th>midi</th>
              <th>chops</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bindings
              .slice()
              .sort((a, b) => a.padKey.localeCompare(b.padKey))
              .map((binding) => (
                <tr key={bindingKeyFromBinding(binding)}>
                  <td>{binding.padKey}</td>
                  <td>{formatBinding(binding)}</td>
                  <td>
                    {assignedKeys.has(binding.padKey.toUpperCase()) ? "yes" : "—"}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() =>
                        onRemoveBinding(bindingKeyFromBinding(binding))
                      }
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      <div className="midi-log">
        <span>LOG</span>
        {messages.length === 0 ? (
          <p className="hint">no messages yet</p>
        ) : (
          <ul className="midi-log-list">
            {messages.map((entry) => {
              const key = bindingKeyFromEntry(entry);
              const mappedPad =
                key &&
                bindings.find((b) => bindingKeyFromBinding(b) === key)?.padKey;
              return (
                <li key={entry.id} className="midi-log-entry">
                  <code>{formatMidiEntry(entry)}</code>
                  {mappedPad && (
                    <span className="midi-log-mapped">→ {mappedPad}</span>
                  )}
                  {isLearnableEntry(entry) && !mappedPad && (
                    <span className="midi-log-map-actions">
                      map:
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const pad = e.target.value;
                          if (pad) onMapEntryToPad(entry, pad);
                          e.target.value = "";
                        }}
                      >
                        <option value="">—</option>
                        {PAD_LETTERS.map((pad) => (
                          <option key={pad} value={pad}>
                            {pad}
                          </option>
                        ))}
                      </select>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

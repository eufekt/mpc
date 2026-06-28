import {
  formatChopDisplayName,
  formatChopSummary,
  formatDuration,
  getChopOptionId,
  type ChopOption,
} from "../lib/arrangement";
import {
  computerPianoStartNote,
  DEFAULT_ROOT_MIDI_NOTE,
  midiToLabel,
  rootNoteOptions,
  SCALE_OPTIONS,
  stepOctaveOffset,
  stepRootNote,
  type ScaleId,
} from "../lib/music";
import type { Chop, Track } from "../lib/types";
import { PianoKeyboard } from "./PianoKeyboard";

type Props = {
  track: Track | null;
  chop: Chop | null;
  chopIndex: number;
  chopOptions: ChopOption[];
  selectedChopKey: string;
  onSelectChop: (trackId: string, chopId: string | null) => void;
  rootMidiNote: number;
  onRootMidiNoteChange: (note: number) => void;
  scaleId: ScaleId;
  onScaleIdChange: (scaleId: ScaleId) => void;
  octaveOffset: number;
  onOctaveOffsetChange: (offset: number) => void;
  activeNotes: Set<number>;
  onNoteOn: (midiNote: number) => void;
  onNoteOff: (midiNote: number) => void;
};

const PIANO_OCTAVE_COUNT = 2;

export function KeyboardWorkspace({
  track,
  chop,
  chopIndex,
  chopOptions,
  selectedChopKey,
  onSelectChop,
  rootMidiNote,
  onRootMidiNoteChange,
  scaleId,
  onScaleIdChange,
  octaveOffset,
  onOctaveOffsetChange,
  activeNotes,
  onNoteOn,
  onNoteOff,
}: Props) {
  const startMidiNote = computerPianoStartNote(rootMidiNote, octaveOffset);
  const rootOptions = rootNoteOptions();

  return (
    <section className="keyboard-workspace">
      <h2>KEYBOARD</h2>
      <p className="keyboard-workspace-summary">
        {track && chop
          ? `${track.name} · ${formatChopDisplayName(chop, chopIndex)} · ${formatDuration(chop.end - chop.start)}`
          : "select a chop below to play it across the keyboard"}
      </p>

      {chopOptions.length > 0 && (
        <div className="keyboard-workspace-chops">
          <span className="keyboard-workspace-chops-label">CHOP</span>
          <div className="keyboard-workspace-chop-list" role="listbox" aria-label="Select chop">
            {chopOptions.map((option) => {
              const id = getChopOptionId(option);
              const isSelected = selectedChopKey === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`keyboard-workspace-chop-item${isSelected ? " selected" : ""}`}
                  onClick={() =>
                    onSelectChop(
                      option.sourceTrackId,
                      isSelected ? null : option.chopId,
                    )
                  }
                  title={formatChopSummary(option)}
                >
                  <span
                    className="keyboard-workspace-chop-swatch"
                    style={{ backgroundColor: option.chop.color }}
                    aria-hidden
                  />
                  <span>{formatChopDisplayName(option.chop, option.chopIndex)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="keyboard-workspace-controls">
        <label className="keyboard-workspace-control">
          <span>ROOT</span>
          <select
            value={rootMidiNote}
            onChange={(event) =>
              onRootMidiNoteChange(Number(event.target.value))
            }
          >
            {rootOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            title="Root down (-)"
            onClick={() =>
              onRootMidiNoteChange(stepRootNote(rootMidiNote, -1))
            }
          >
            −
          </button>
          <button
            type="button"
            title="Root up (=)"
            onClick={() =>
              onRootMidiNoteChange(stepRootNote(rootMidiNote, 1))
            }
          >
            +
          </button>
        </label>

        <label className="keyboard-workspace-control">
          <span>SCALE</span>
          <select
            value={scaleId}
            onChange={(event) =>
              onScaleIdChange(event.target.value as ScaleId)
            }
          >
            {SCALE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="keyboard-workspace-control">
          <span>OCTAVE</span>
          <button
            type="button"
            title="Octave down ([)"
            onClick={() =>
              onOctaveOffsetChange(stepOctaveOffset(octaveOffset, -1))
            }
          >
            −
          </button>
          <span className="keyboard-workspace-octave-label">
            {midiToLabel(startMidiNote)} –{" "}
            {midiToLabel(startMidiNote + PIANO_OCTAVE_COUNT * 12 - 1)}
          </span>
          <button
            type="button"
            title="Octave up (])"
            onClick={() =>
              onOctaveOffsetChange(stepOctaveOffset(octaveOffset, 1))
            }
          >
            +
          </button>
        </div>
      </div>

      <PianoKeyboard
        startMidiNote={startMidiNote}
        octaveCount={PIANO_OCTAVE_COUNT}
        rootMidiNote={rootMidiNote}
        scaleId={scaleId}
        activeNotes={activeNotes}
        onNoteOn={onNoteOn}
        onNoteOff={onNoteOff}
      />

      <p className="hint keyboard-workspace-hint">
        computer keys: Z X C V B N M , . / (white) · S D G H J W E T Y U (black)
        · [ ] octave · - + root · MIDI notes play when connected
      </p>
    </section>
  );
}

export { DEFAULT_ROOT_MIDI_NOTE };

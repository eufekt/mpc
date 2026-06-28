export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export type ScaleId =
  | "chromatic"
  | "major"
  | "naturalMinor"
  | "harmonicMinor"
  | "majorPentatonic"
  | "minorPentatonic";

export const SCALE_OPTIONS: { id: ScaleId; label: string }[] = [
  { id: "chromatic", label: "Chromatic" },
  { id: "major", label: "Major" },
  { id: "naturalMinor", label: "Natural minor" },
  { id: "harmonicMinor", label: "Harmonic minor" },
  { id: "majorPentatonic", label: "Major pentatonic" },
  { id: "minorPentatonic", label: "Minor pentatonic" },
];

const SCALES: Record<ScaleId, readonly number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
};

export const MIN_MIDI_NOTE = 0;
export const MAX_MIDI_NOTE = 127;

export const DEFAULT_ROOT_MIDI_NOTE = 60;

export const MIN_OCTAVE_OFFSET = -3;
export const MAX_OCTAVE_OFFSET = 3;

export function midiToLabel(note: number): string {
  const clamped = clampMidiNote(note);
  const octave = Math.floor(clamped / 12) - 1;
  const name = NOTE_NAMES[clamped % 12]!;
  return `${name}${octave}`;
}

export function clampMidiNote(note: number): number {
  return Math.max(MIN_MIDI_NOTE, Math.min(MAX_MIDI_NOTE, Math.round(note)));
}

export function isNoteInScale(
  midiNote: number,
  rootMidiNote: number,
  scaleId: ScaleId,
): boolean {
  if (scaleId === "chromatic") return true;
  const intervals = SCALES[scaleId];
  const semitone = ((midiNote - rootMidiNote) % 12 + 12) % 12;
  return intervals.includes(semitone);
}

export function semitoneOffset(fromNote: number, toNote: number): number {
  return toNote - fromNote;
}

export function pitchRatioFromSemitones(semitones: number): number {
  return 2 ** (semitones / 12);
}

export function alignToC(midiNote: number): number {
  const clamped = clampMidiNote(midiNote);
  return Math.floor(clamped / 12) * 12;
}

export function computerPianoStartNote(
  rootMidiNote: number,
  octaveOffset: number,
): number {
  return clampMidiNote(alignToC(rootMidiNote) + octaveOffset * 12);
}

export function stepRootNote(note: number, delta: number): number {
  return clampMidiNote(note + delta);
}

export function stepOctaveOffset(offset: number, delta: number): number {
  return Math.max(
    MIN_OCTAVE_OFFSET,
    Math.min(MAX_OCTAVE_OFFSET, offset + delta),
  );
}

export function isBlackKey(midiNote: number): boolean {
  const pc = ((midiNote % 12) + 12) % 12;
  return [1, 3, 6, 8, 10].includes(pc);
}

export function buildPianoKeys(
  startMidiNote: number,
  octaveCount: number,
): number[] {
  const start = clampMidiNote(startMidiNote);
  const end = clampMidiNote(start + octaveCount * 12);
  const keys: number[] = [];
  for (let note = start; note < end; note += 1) {
    keys.push(note);
  }
  return keys;
}

export function rootNoteOptions(): { value: number; label: string }[] {
  const options: { value: number; label: string }[] = [];
  for (let octave = 1; octave <= 7; octave += 1) {
    for (let pc = 0; pc < 12; pc += 1) {
      const note = (octave + 1) * 12 + pc;
      if (note > MAX_MIDI_NOTE) break;
      options.push({ value: note, label: midiToLabel(note) });
    }
  }
  return options;
}

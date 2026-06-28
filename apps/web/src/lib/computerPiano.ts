/** Semitone offset from the keyboard start note for each computer key. */
const KEY_OFFSETS: Record<string, number> = {
  z: 0,
  s: 1,
  x: 2,
  d: 3,
  c: 4,
  v: 5,
  g: 6,
  b: 7,
  h: 8,
  n: 9,
  j: 10,
  m: 11,
  ",": 12,
  w: 13,
  ".": 14,
  e: 15,
  "/": 16,
  t: 17,
  y: 18,
  u: 19,
};

export const COMPUTER_PIANO_KEYS = Object.keys(KEY_OFFSETS);

export function getMidiNoteForComputerKey(
  key: string,
  startMidiNote: number,
): number | null {
  const offset = KEY_OFFSETS[key.toLowerCase()];
  if (offset === undefined) return null;
  const note = startMidiNote + offset;
  if (note < 0 || note > 127) return null;
  return note;
}

export function isComputerPianoKey(key: string): boolean {
  return key.toLowerCase() in KEY_OFFSETS;
}

export function isOctaveDownKey(key: string): boolean {
  return key === "[";
}

export function isOctaveUpKey(key: string): boolean {
  return key === "]";
}

export function isRootDownKey(key: string): boolean {
  return key === "-" || key === "_";
}

export function isRootUpKey(key: string): boolean {
  return key === "=" || key === "+";
}

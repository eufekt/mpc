import type { MidiBinding } from "./midi";

function midiStorageKey(projectId: string): string {
  return `mpc-midi-bindings-${projectId}`;
}

function demigrateMidiPadKey(padKey: string): string {
  const lower = padKey.toLowerCase();
  const match = lower.match(/^([a-h])(0[1-9]|1[0-6])$/);
  if (!match) return lower;
  const bankIndex = match[1].charCodeAt(0) - "a".charCodeAt(0);
  const padIndex = Number(match[2]);
  const offset = bankIndex * 16 + padIndex - 1;
  if (offset >= 0 && offset < 26) {
    return String.fromCharCode("a".charCodeAt(0) + offset);
  }
  return lower;
}

export function loadMidiBindings(projectId: string): MidiBinding[] {
  try {
    const raw = localStorage.getItem(midiStorageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MidiBinding[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (b) =>
          (b.type === "note" || b.type === "cc") &&
          typeof b.number === "number" &&
          typeof b.padKey === "string",
      )
      .map((b) => ({
        ...b,
        padKey: demigrateMidiPadKey(b.padKey).toUpperCase(),
      }));
  } catch {
    return [];
  }
}

export function saveMidiBindings(
  projectId: string,
  bindings: MidiBinding[],
): void {
  localStorage.setItem(midiStorageKey(projectId), JSON.stringify(bindings));
}

export function clearMidiBindings(projectId: string): void {
  localStorage.removeItem(midiStorageKey(projectId));
}

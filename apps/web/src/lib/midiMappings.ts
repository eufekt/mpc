import type { MidiBinding } from "./midi";

function midiStorageKey(projectId: string): string {
  return `mpc-midi-bindings-${projectId}`;
}

export function loadMidiBindings(projectId: string): MidiBinding[] {
  try {
    const raw = localStorage.getItem(midiStorageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MidiBinding[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (b) =>
        (b.type === "note" || b.type === "cc") &&
        typeof b.number === "number" &&
        typeof b.padKey === "string",
    );
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

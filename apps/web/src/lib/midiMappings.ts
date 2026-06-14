import type { MidiBinding } from "./midi";

const STORAGE_KEY = "mpc-midi-bindings";

export function loadMidiBindings(): MidiBinding[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

export function saveMidiBindings(bindings: MidiBinding[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
}

export function clearMidiBindings(): void {
  localStorage.removeItem(STORAGE_KEY);
}

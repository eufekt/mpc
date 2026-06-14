export type MidiPortInfo = {
  id: string;
  name: string;
  manufacturer: string;
  state: MIDIPortDeviceState;
  direction: "input" | "output";
};

export type MidiInputInfo = MidiPortInfo & { direction: "input" };

export const PAD_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export type MidiLogEntry = {
  id: string;
  timestamp: number;
  device: string;
  type: "noteon" | "noteoff" | "cc" | "other";
  channel: number;
  note?: number;
  velocity?: number;
  controller?: number;
  value?: number;
  raw: number[];
};

export type MidiBinding = {
  type: "note" | "cc";
  number: number;
  channel?: number;
  padKey: string;
};

export function bindingKey(
  type: MidiBinding["type"],
  number: number,
  channel?: number,
): string {
  return `${type}:${channel ?? "*"}:${number}`;
}

export function bindingKeyFromEntry(entry: MidiLogEntry): string | null {
  if (entry.type === "noteon" || entry.type === "noteoff") {
    if (entry.note === undefined) return null;
    return bindingKey("note", entry.note, entry.channel);
  }
  if (entry.type === "cc" && entry.controller !== undefined) {
    return bindingKey("cc", entry.controller, entry.channel);
  }
  return null;
}

export function bindingKeyFromBinding(binding: MidiBinding): string {
  return bindingKey(binding.type, binding.number, binding.channel);
}

export function formatMidiEntry(entry: MidiLogEntry): string {
  const time = new Date(entry.timestamp).toLocaleTimeString();
  if (entry.type === "noteon" || entry.type === "noteoff") {
    const label = entry.type === "noteon" ? "NOTE ON" : "NOTE OFF";
    return `${time}  ${label}  ch${entry.channel}  note=${entry.note}  vel=${entry.velocity ?? 0}`;
  }
  if (entry.type === "cc") {
    return `${time}  CC  ch${entry.channel}  cc=${entry.controller}  val=${entry.value ?? 0}`;
  }
  return `${time}  ${entry.raw.map((b) => b.toString(16).padStart(2, "0")).join(" ")}`;
}

export function formatBinding(binding: MidiBinding): string {
  const ch = binding.channel ?? "any";
  if (binding.type === "note") {
    return `note ${binding.number} (ch ${ch})`;
  }
  return `cc ${binding.number} (ch ${ch})`;
}

export function parseMidiMessage(
  device: string,
  data: Uint8Array,
): MidiLogEntry | null {
  if (data.length < 1) return null;

  const status = data[0];
  const command = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (command === 0x90 && data.length >= 3) {
    const note = data[1];
    const velocity = data[2];
    return {
      id,
      timestamp: Date.now(),
      device,
      type: velocity === 0 ? "noteoff" : "noteon",
      channel,
      note,
      velocity,
      raw: Array.from(data),
    };
  }

  if (command === 0x80 && data.length >= 3) {
    return {
      id,
      timestamp: Date.now(),
      device,
      type: "noteoff",
      channel,
      note: data[1],
      velocity: data[2],
      raw: Array.from(data),
    };
  }

  if (command === 0xb0 && data.length >= 3) {
    return {
      id,
      timestamp: Date.now(),
      device,
      type: "cc",
      channel,
      controller: data[1],
      value: data[2],
      raw: Array.from(data),
    };
  }

  return {
    id,
    timestamp: Date.now(),
    device,
    type: "other",
    channel,
    raw: Array.from(data),
  };
}

export function isLearnableEntry(entry: MidiLogEntry): boolean {
  if (entry.type === "noteon") {
    return (entry.velocity ?? 0) > 0;
  }
  return entry.type === "cc";
}

export function bindingFromEntry(entry: MidiLogEntry): Omit<MidiBinding, "padKey"> | null {
  if (entry.type === "noteon" && entry.note !== undefined) {
    return { type: "note", number: entry.note, channel: entry.channel };
  }
  if (entry.type === "cc" && entry.controller !== undefined) {
    return { type: "cc", number: entry.controller, channel: entry.channel };
  }
  return null;
}

export function entryMatchesBinding(
  entry: MidiLogEntry,
  binding: MidiBinding,
): boolean {
  if (binding.channel !== undefined && entry.channel !== binding.channel) {
    return false;
  }
  if (binding.type === "note") {
    return entry.type === "noteon" && entry.note === binding.number;
  }
  if (binding.type === "cc") {
    return entry.type === "cc" && entry.controller === binding.number;
  }
  return false;
}

import { normalizeTimeStretch } from "./chopPlayback";
import { beatsFromSeconds, clampBpm } from "./musicalTime";
import type { Chop } from "./types";

export function normalizeSourceBpm(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  return clampBpm(raw);
}

export function normalizeBeatOffset(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    return undefined;
  }
  return raw;
}

/** Playback rate that makes audio recorded at sourceBpm land on the project tempo. */
export function fitTimeStretch(sourceBpm: number, projectBpm: number): number {
  return normalizeTimeStretch(projectBpm / sourceBpm);
}

/** Chop length in beats at the source tempo. */
export function chopLengthInBeats(
  chop: Pick<Chop, "start" | "end">,
  sourceBpm: number,
): number {
  return beatsFromSeconds(Math.max(0, chop.end - chop.start), sourceBpm);
}

export function formatBeatsLabel(beats: number): string {
  const rounded = Math.round(beats);
  const label =
    Math.abs(beats - rounded) < 0.05 ? String(rounded) : beats.toFixed(2);
  return `${label} ${label === "1" ? "beat" : "beats"}`;
}

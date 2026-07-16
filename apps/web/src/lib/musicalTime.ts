import type {
  ArrangementLoopMode,
  LoopEdgeSnap,
  MusicalTimeSettings,
  SnapDivision,
} from "./types";

export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const DEFAULT_BPM = 90;
export const DEFAULT_BEATS_PER_BAR = 4;
export const DEFAULT_LOOP_BEATS = 16;
export const MIN_LOOP_BEATS = 1;
export const MAX_LOOP_BEATS = 128;

export const LOOP_BEAT_OPTIONS = [1, 2, 4, 8, 16, 32] as const;
export type LoopBeatOption = (typeof LOOP_BEAT_OPTIONS)[number];

export const DEFAULT_LOOP_MODE = "region" as const;
export const LOOP_EDGE_SNAP_OPTIONS = ["off", "beat", "bar"] as const satisfies readonly LoopEdgeSnap[];

export function normalizeLoopMode(
  raw: ArrangementLoopMode | null | undefined,
): ArrangementLoopMode {
  if (raw === "region" || raw === "content" || raw === "beats") return raw;
  return DEFAULT_LOOP_MODE;
}

export function normalizeLoopEdgeSnap(
  raw: LoopEdgeSnap | null | undefined,
): LoopEdgeSnap {
  if (raw === "off" || raw === "beat" || raw === "bar") return raw;
  return "off";
}

export function defaultMusicalTime(): MusicalTimeSettings {
  return {
    bpm: DEFAULT_BPM,
    beatsPerBar: DEFAULT_BEATS_PER_BAR,
    snapEnabled: true,
    snapDivision: 16,
    metronomeEnabled: false,
  };
}

export function clampBpm(bpm: number): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));
}

export function secondsPerBeat(bpm: number): number {
  return 60 / bpm;
}

export function secondsPerBar(bpm: number, beatsPerBar: number): number {
  return secondsPerBeat(bpm) * beatsPerBar;
}

export function clampLoopBeats(beats: number): number {
  return Math.max(MIN_LOOP_BEATS, Math.min(MAX_LOOP_BEATS, Math.round(beats)));
}

export function loopDurationSeconds(loopBeats: number, bpm: number): number {
  return clampLoopBeats(loopBeats) * secondsPerBeat(bpm);
}

export function beatsFromSeconds(seconds: number, bpm: number): number {
  if (bpm <= 0) return 0;
  return (Math.max(0, seconds) * bpm) / 60;
}

export function formatLoopBeatLength(seconds: number, bpm: number): string {
  const beats = beatsFromSeconds(seconds, bpm);
  const beatsLabel =
    Math.abs(beats - Math.round(beats)) < 0.05
      ? String(Math.round(beats))
      : beats.toFixed(1);
  return `${beatsLabel} beats`;
}

export function snapLoopEdgeTime(
  seconds: number,
  loopEdgeSnap: LoopEdgeSnap,
  settings: MusicalTimeSettings,
): number {
  if (loopEdgeSnap === "off") return Math.max(0, seconds);
  if (loopEdgeSnap === "beat") {
    const step = secondsPerBeat(settings.bpm);
    if (step <= 0) return Math.max(0, seconds);
    return Math.max(0, Math.round(seconds / step) * step);
  }
  const step = secondsPerBar(settings.bpm, settings.beatsPerBar);
  if (step <= 0) return Math.max(0, seconds);
  return Math.max(0, Math.round(seconds / step) * step);
}

export function normalizeLoopBeats(
  raw: number | null | undefined,
  fallback = DEFAULT_LOOP_BEATS,
): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return clampLoopBeats(raw);
}

export const SNAP_DIVISIONS = [4, 8, 16, 32, 64, 128] as const satisfies readonly SnapDivision[];

export function isSnapDivision(value: number): value is SnapDivision {
  return (SNAP_DIVISIONS as readonly number[]).includes(value);
}

/** Grid step in seconds — snapDivision 4 = quarter, 8 = eighth, 16 = sixteenth, etc. */
export function snapGridStep(settings: MusicalTimeSettings): number {
  const beat = secondsPerBeat(settings.bpm);
  return beat * (4 / settings.snapDivision);
}

export function snapTime(
  seconds: number,
  settings: MusicalTimeSettings,
): number {
  if (!settings.snapEnabled) return Math.max(0, seconds);
  const step = snapGridStep(settings);
  if (step <= 0) return Math.max(0, seconds);
  return Math.max(0, Math.round(seconds / step) * step);
}

/** Bar and beat are 1-indexed for display. */
export function timeToBarBeat(
  seconds: number,
  bpm: number,
  beatsPerBar: number,
): { bar: number; beat: number; tick: number } {
  const beatDuration = secondsPerBeat(bpm);
  const totalBeats = seconds / beatDuration;
  const bar = Math.floor(totalBeats / beatsPerBar) + 1;
  const beat = (Math.floor(totalBeats) % beatsPerBar) + 1;
  const tick = (totalBeats % 1) * 480;
  return { bar, beat, tick };
}

export function barBeatToTime(
  bar: number,
  beat: number,
  bpm: number,
  beatsPerBar: number,
): number {
  const beatDuration = secondsPerBeat(bpm);
  return ((bar - 1) * beatsPerBar + (beat - 1)) * beatDuration;
}

export function beatWidthPx(bpm: number, pxPerSecond: number): number {
  return secondsPerBeat(bpm) * pxPerSecond;
}

export function snapDivisionLabel(division: SnapDivision): string {
  return `1/${division}`;
}

export function normalizeMusicalTime(
  raw: Partial<MusicalTimeSettings> | null | undefined,
): MusicalTimeSettings {
  const defaults = defaultMusicalTime();
  if (!raw) return defaults;

  const snapDivision: SnapDivision =
    typeof raw.snapDivision === "number" && isSnapDivision(raw.snapDivision)
      ? raw.snapDivision
      : defaults.snapDivision;

  return {
    bpm: clampBpm(typeof raw.bpm === "number" ? raw.bpm : defaults.bpm),
    beatsPerBar:
      typeof raw.beatsPerBar === "number" && raw.beatsPerBar > 0
        ? raw.beatsPerBar
        : defaults.beatsPerBar,
    snapEnabled:
      typeof raw.snapEnabled === "boolean"
        ? raw.snapEnabled
        : defaults.snapEnabled,
    snapDivision,
    metronomeEnabled:
      typeof raw.metronomeEnabled === "boolean"
        ? raw.metronomeEnabled
        : defaults.metronomeEnabled,
  };
}

/** Beat boundary times in [fromTime, toTime] for ruler/grid generation. */
export function beatTimesInRange(
  fromTime: number,
  toTime: number,
  bpm: number,
): number[] {
  const step = secondsPerBeat(bpm);
  if (step <= 0 || toTime < fromTime) return [];

  const times: number[] = [];
  let t = fromTime <= 0 ? 0 : Math.ceil(fromTime / step) * step;
  while (t <= toTime) {
    times.push(t);
    t += step;
  }
  return times;
}

export function isBarBoundary(
  timeSeconds: number,
  bpm: number,
  beatsPerBar: number,
): boolean {
  const step = secondsPerBeat(bpm);
  if (step <= 0) return false;
  const beatIndex = Math.round(timeSeconds / step);
  return beatIndex % beatsPerBar === 0;
}

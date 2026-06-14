import type {
  ArrangementClip,
  ArrangementClipStackMode,
  ArrangementLane,
  Chop,
  Track,
} from "./types";
import {
  getChopNaturalDuration,
  getChopPlaybackDuration,
  normalizeTimeStretch,
} from "./chopPlayback";
import { formatDuration } from "./timeFormat";

export {
  formatTimeStretch,
  MAX_TIME_STRETCH_PERCENT,
  MIN_TIME_STRETCH_PERCENT,
  percentToTimeStretch,
  timeStretchToPercent,
} from "./chopPlayback";

export { formatDuration } from "./timeFormat";

export type ResolvedClip = {
  clip: ArrangementClip;
  chop: Chop;
  track: Track;
  chopIndex: number;
  /** Natural chop length in seconds. */
  duration: number;
  /** Wall-clock length after time stretch. */
  playbackDuration: number;
  timeStretch: number;
};

export type ChopOption = {
  sourceTrackId: string;
  sourceTrackName: string;
  chopId: string;
  chopIndex: number;
  chop: Chop;
  duration: number;
};

/** Timeline pixels per second of chop audio — keeps lane visuals aligned with playback. */
export const ARRANGEMENT_PX_PER_SECOND = 16;

/** Empty scrollable space beyond clip content on the timeline. */
export const ARRANGEMENT_TIMELINE_PAD_SECONDS = 30;

/** Minimum timeline length when lanes exist (even with no clips). */
export const ARRANGEMENT_TIMELINE_MIN_SECONDS = 60;

export const DEFAULT_LANE_ROW_HEIGHT = 28;
export const MIN_LANE_ROW_HEIGHT = 20;
export const MAX_LANE_ROW_HEIGHT = 160;
export const ARRANGEMENT_RULER_HEIGHT = 20;

export function clampLaneRowHeight(height: number): number {
  if (!Number.isFinite(height)) return DEFAULT_LANE_ROW_HEIGHT;
  return Math.round(
    Math.max(MIN_LANE_ROW_HEIGHT, Math.min(MAX_LANE_ROW_HEIGHT, height)),
  );
}

export function computeTimelineLaneAreaHeight(
  laneCount: number,
  laneRowHeight: number,
): number {
  if (laneCount <= 0) return 0;
  return ARRANGEMENT_RULER_HEIGHT + laneCount * clampLaneRowHeight(laneRowHeight);
}

export function clipWidthPx(duration: number): number {
  return Math.max(0, duration) * ARRANGEMENT_PX_PER_SECOND;
}

export function timeToPx(time: number): number {
  return Math.max(0, time) * ARRANGEMENT_PX_PER_SECOND;
}

export function pxToTime(px: number): number {
  return Math.max(0, px) / ARRANGEMENT_PX_PER_SECOND;
}

/** Signed px → seconds — for drag deltas (may be negative). */
export function pxDeltaToTime(px: number): number {
  return px / ARRANGEMENT_PX_PER_SECOND;
}

export function playheadLeftPx(playheadTime: number): number {
  return timeToPx(Math.max(0, playheadTime));
}

export function filterLoadedTracks(
  tracks: Track[],
  loadedTrackIds: string[],
): Track[] {
  return tracks.filter((track) => loadedTrackIds.includes(track.id));
}

export function seekTimeFromClientX(
  clientX: number,
  element: HTMLElement,
  pxToTimeFn: (px: number) => number = pxToTime,
): number {
  const rect = element.getBoundingClientRect();
  return pxToTimeFn(clientX - rect.left);
}

export function getClipStartTime(
  lane: ArrangementLane,
  resolvedClips: ResolvedClip[],
  clipIndex: number,
): number {
  if (lane.mode === "free") {
    return Math.max(0, resolvedClips[clipIndex]?.clip.startTime ?? 0);
  }
  let offset = 0;
  for (let i = 0; i < clipIndex; i++) {
    offset += resolvedClips[i]?.playbackDuration ?? 0;
  }
  return offset;
}

export function getClipLeftPx(
  lane: ArrangementLane,
  resolvedClips: ResolvedClip[],
  clipIndex: number,
): number {
  return timeToPx(getClipStartTime(lane, resolvedClips, clipIndex));
}

export type TimelineSegment = {
  start: number;
  end: number;
};

function subtractTimelineSegment(
  segments: TimelineSegment[],
  blockStart: number,
  blockEnd: number,
): TimelineSegment[] {
  const result: TimelineSegment[] = [];
  for (const segment of segments) {
    if (blockEnd <= segment.start || blockStart >= segment.end) {
      result.push(segment);
      continue;
    }
    if (blockStart > segment.start) {
      result.push({ start: segment.start, end: blockStart });
    }
    if (blockEnd < segment.end) {
      result.push({ start: blockEnd, end: segment.end });
    }
  }
  return result.filter((segment) => segment.end - segment.start > 0.0001);
}

/** Audible wall-clock segments for a free-mode clip — later clips in the lane mask earlier ones. */
export function getFreeClipAudibleSegments(
  clipIndex: number,
  resolvedClips: ResolvedClip[],
): TimelineSegment[] {
  const item = resolvedClips[clipIndex];
  const clipStart = Math.max(0, item.clip.startTime ?? 0);
  const clipEnd = clipStart + item.playbackDuration;
  let segments: TimelineSegment[] = [{ start: clipStart, end: clipEnd }];

  for (let j = clipIndex + 1; j < resolvedClips.length; j++) {
    const other = resolvedClips[j];
    const otherStart = Math.max(0, other.clip.startTime ?? 0);
    const otherEnd = otherStart + other.playbackDuration;
    segments = subtractTimelineSegment(segments, otherStart, otherEnd);
  }

  return segments;
}

function timelineIntervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function clipOverlapsAny(
  startTime: number,
  playbackDuration: number,
  blockers: TimelineSegment[],
): boolean {
  const end = startTime + playbackDuration;
  for (const block of blockers) {
    if (timelineIntervalsOverlap(startTime, end, block.start, block.end)) {
      return true;
    }
  }
  return false;
}

/** Snap to the nearest non-overlapping start when a clamp clip would collide. */
export function resolveClampStartTime(
  proposedStart: number,
  playbackDuration: number,
  blockers: TimelineSegment[],
): number {
  const target = Math.max(0, proposedStart);
  if (!clipOverlapsAny(target, playbackDuration, blockers)) {
    return target;
  }

  const candidates = new Set<number>([0, target]);
  for (const block of blockers) {
    candidates.add(block.end);
    candidates.add(block.start - playbackDuration);
  }

  let best = target;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const start = Math.max(0, candidate);
    if (clipOverlapsAny(start, playbackDuration, blockers)) continue;
    const distance = Math.abs(start - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = start;
    }
  }

  return best;
}

export function resolveFreeClipStartTime(
  proposedStart: number,
  playbackDuration: number,
  stackMode: ArrangementClipStackMode,
  blockers: TimelineSegment[],
): number {
  if (stackMode === "clamp") {
    return resolveClampStartTime(proposedStart, playbackDuration, blockers);
  }
  return Math.max(0, proposedStart);
}

export type FreeClipOverlapState = {
  hasOverlap: boolean;
  isCoveredByLater: boolean;
  coversEarlier: boolean;
};

/** Whether a free-mode clip overlaps others on the same lane (for UI feedback). */
export function getFreeClipOverlapState(
  clipIndex: number,
  resolvedClips: ResolvedClip[],
): FreeClipOverlapState {
  const item = resolvedClips[clipIndex];
  const start = Math.max(0, item.clip.startTime ?? 0);
  const end = start + item.playbackDuration;
  let isCoveredByLater = false;
  let coversEarlier = false;

  for (let j = 0; j < resolvedClips.length; j++) {
    if (j === clipIndex) continue;
    const other = resolvedClips[j];
    const otherStart = Math.max(0, other.clip.startTime ?? 0);
    const otherEnd = otherStart + other.playbackDuration;
    if (!timelineIntervalsOverlap(start, end, otherStart, otherEnd)) continue;
    if (j > clipIndex) isCoveredByLater = true;
    if (j < clipIndex) coversEarlier = true;
  }

  return {
    hasOverlap: isCoveredByLater || coversEarlier,
    isCoveredByLater,
    coversEarlier,
  };
}

export function migrateLaneToFree(
  lane: ArrangementLane,
  tracks: Track[],
): ArrangementLane {
  const resolved = resolveLaneClips(lane, tracks);
  let offset = 0;
  const startByClipId = new Map<string, number>();
  for (const item of resolved) {
    startByClipId.set(item.clip.id, offset);
    offset += item.playbackDuration;
  }
  return {
    ...lane,
    mode: "free",
    clips: lane.clips.map((clip) => ({
      ...clip,
      startTime: startByClipId.get(clip.id) ?? clip.startTime ?? 0,
    })),
  };
}

export function migrateLaneToClamped(
  lane: ArrangementLane,
): ArrangementLane {
  const clips = [...lane.clips].sort(
    (a, b) => (a.startTime ?? 0) - (b.startTime ?? 0),
  );
  return { ...lane, mode: "clamped", clips };
}

/** Tick interval for the ruler — adapts to total duration. */
export function rulerTickInterval(duration: number): number {
  if (duration <= 0) return 1;
  if (duration <= 10) return 1;
  if (duration <= 30) return 2;
  if (duration <= 60) return 5;
  if (duration <= 180) return 10;
  return 30;
}

export function formatChopKey(chop: Chop): string {
  return chop.key ? chop.key.toUpperCase() : "—";
}

/** Chop table # column label — custom name or 1-based index. */
export function formatChopDisplayName(chop: Chop, chopIndex: number): string {
  const name = chop.name?.trim();
  return name || String(chopIndex + 1);
}

export function formatChopSummary(option: ChopOption, extra?: string): string {
  const base = `${formatChopDisplayName(option.chop, option.chopIndex)} · ${formatDuration(option.duration)} · ${formatChopKey(option.chop)}`;
  return extra ? `${base} · ${extra}` : base;
}

export function getChopOptionId(option: ChopOption): string {
  return `${option.sourceTrackId}:${option.chopId}`;
}

export function createArrangementClipId(): string {
  return crypto.randomUUID();
}

export function createArrangementLaneId(): string {
  return crypto.randomUUID();
}

export function findChop(
  tracks: Track[],
  sourceTrackId: string,
  chopId: string,
): { chop: Chop; track: Track; chopIndex: number } | null {
  const track = tracks.find((t) => t.id === sourceTrackId);
  if (!track) return null;
  const chopIndex = track.chops.findIndex((c) => c.id === chopId);
  if (chopIndex === -1) return null;
  return { chop: track.chops[chopIndex], track, chopIndex };
}

export function getAllChops(tracks: Track[]): ChopOption[] {
  const options: ChopOption[] = [];
  for (const track of tracks) {
    track.chops.forEach((chop, chopIndex) => {
      options.push({
        sourceTrackId: track.id,
        sourceTrackName: track.name,
        chopId: chop.id,
        chopIndex,
        chop,
        duration: getChopNaturalDuration(chop),
      });
    });
  }
  return options;
}

export function resolveLaneClips(
  lane: ArrangementLane,
  tracks: Track[],
): ResolvedClip[] {
  const resolved: ResolvedClip[] = [];
  for (const clip of lane.clips) {
    const match = findChop(tracks, clip.sourceTrackId, clip.chopId);
    if (!match) continue;
    const duration = getChopNaturalDuration(match.chop);
    const timeStretch = normalizeTimeStretch(match.chop.timeStretch);
    resolved.push({
      clip,
      chop: match.chop,
      track: match.track,
      chopIndex: match.chopIndex,
      duration,
      playbackDuration: getChopPlaybackDuration(duration, timeStretch),
      timeStretch,
    });
  }
  return resolved;
}

export function computeLaneDuration(
  lane: ArrangementLane,
  tracks: Track[],
): number {
  const resolved = resolveLaneClips(lane, tracks);
  if (resolved.length === 0) return 0;
  if (lane.mode === "free") {
    return resolved.reduce(
      (max, item) =>
        Math.max(max, (item.clip.startTime ?? 0) + item.playbackDuration),
      0,
    );
  }
  return resolved.reduce((sum, item) => sum + item.playbackDuration, 0);
}

export function computeArrangementDuration(
  lanes: ArrangementLane[],
  tracks: Track[],
): number {
  if (lanes.length === 0) return 0;
  return Math.max(...lanes.map((lane) => computeLaneDuration(lane, tracks)));
}

/** Scrollable timeline length — content plus trailing pad for placement. */
export function computeTimelineScrollDuration(contentDuration: number): number {
  return Math.max(
    contentDuration + ARRANGEMENT_TIMELINE_PAD_SECONDS,
    ARRANGEMENT_TIMELINE_MIN_SECONDS,
  );
}

export function computeTimelineWidthPx(contentDuration: number): number {
  return clipWidthPx(computeTimelineScrollDuration(contentDuration));
}


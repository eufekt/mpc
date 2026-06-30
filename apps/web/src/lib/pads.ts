import { DEFAULT_MASTER_EFFECTS } from "./masterEffects";
import type { Chop, ChopPlayRequest, Track } from "./types";

export type PadPressAction = "bind" | "play" | "noop";

export type BoundChop = {
  trackId: string;
  chop: Chop;
};

export function getAssignedKeys(tracks: Track[]): Set<string> {
  const keys = new Set<string>();
  for (const track of tracks) {
    for (const chop of track.chops) {
      if (chop.key) keys.add(chop.key.toUpperCase());
    }
  }
  return keys;
}

/** Last-bound chop wins when multiple tracks share a pad key. */
export function getKeyColors(tracks: Track[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const track of tracks) {
    for (const chop of track.chops) {
      if (chop.key) map.set(chop.key.toUpperCase(), chop.color);
    }
  }
  return map;
}

export function getChopsForKey(tracks: Track[], key: string): BoundChop[] {
  const upper = key.toUpperCase();
  const result: BoundChop[] = [];
  for (const track of tracks) {
    for (const chop of track.chops) {
      if (chop.key?.toUpperCase() === upper) {
        result.push({ trackId: track.id, chop });
      }
    }
  }
  return result;
}

export function toChopPlayRequests(bound: BoundChop[]): ChopPlayRequest[] {
  return bound.map((b) => ({
    trackId: b.trackId,
    chopId: b.chop.id,
    start: b.chop.start,
    end: b.chop.end,
    key: b.chop.key!,
    volume: b.chop.volume,
    timeStretch: b.chop.timeStretch,
    reverse: b.chop.reverse,
    effects: b.chop.effects ?? DEFAULT_MASTER_EFFECTS,
  }));
}

/** When auditioning a selected chop, play only that chop — not every track on the pad. */
export function resolveChopsForKey(
  tracks: Track[],
  key: string,
  selectedChop: { trackId: string; chopId: string } | null,
  activeTrackId?: string | null,
): BoundChop[] {
  if (selectedChop && isSelectedChopPadKey(tracks, selectedChop, key)) {
    const track = tracks.find((t) => t.id === selectedChop.trackId);
    const chop = track?.chops.find((c) => c.id === selectedChop.chopId);
    if (track && chop) {
      return [{ trackId: track.id, chop }];
    }
  }
  const bound = getChopsForKey(tracks, key);
  if (activeTrackId && bound.length > 1) {
    const onActive = bound.filter((item) => item.trackId === activeTrackId);
    if (onActive.length > 0) return onActive;
  }
  return bound;
}

export function isSelectedChopPadKey(
  tracks: Track[],
  selectedChop: { trackId: string; chopId: string },
  key: string,
): boolean {
  const track = tracks.find((t) => t.id === selectedChop.trackId);
  const chop = track?.chops.find((c) => c.id === selectedChop.chopId);
  return chop?.key?.toLowerCase() === key.toLowerCase();
}

export function resolvePadPress(options: {
  tracks: Track[];
  selectedChop: { trackId: string; chopId: string } | null;
  key: string;
  requirePlayMode: boolean;
  playMode: boolean;
  hasAudio: boolean;
}): PadPressAction {
  const key = options.key.toLowerCase();
  const keyUpper = key.toUpperCase();

  if (options.selectedChop) {
    const track = options.tracks.find((t) => t.id === options.selectedChop!.trackId);
    const chop = track?.chops.find((c) => c.id === options.selectedChop!.chopId);
    if (chop?.key?.toUpperCase() === keyUpper) {
      return "play";
    }
    return "bind";
  }

  if (options.requirePlayMode && (!options.playMode || !options.hasAudio)) {
    return "noop";
  }

  if (getChopsForKey(options.tracks, key).length > 0) {
    return "play";
  }

  return "noop";
}

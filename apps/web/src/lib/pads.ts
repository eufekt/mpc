import type { Chop, ChopPlayRequest, Track } from "./types";

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
  return bound
    .filter((b) => b.chop.key)
    .map((b) => ({
      trackId: b.trackId,
      start: b.chop.start,
      end: b.chop.end,
      key: b.chop.key!,
      volume: b.chop.volume,
      timeStretch: b.chop.timeStretch,
    }));
}

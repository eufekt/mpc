import type { PaletteMode } from "./chopColors";

export type Chop = {
  id: string;
  start: number;
  end: number;
  key: string | null;
  /** Optional display name for the chop table # column. */
  name?: string;
  color: string;
  volume: number;
  /** Playback speed multiplier — 1.000 = normal, 0.900 = 0.9× speed. */
  timeStretch: number;
};

export type SourceType = "file" | "youtube";

export type PadMode = "layer" | "clear" | "loop";

export type Track = {
  id: string;
  name: string;
  sourceType: SourceType;
  sourceName: string;
  sourceUrl?: string;
  chops: Chop[];
};

export type ArrangementLaneMode = "clamped" | "free";

/** Free-mode clip placement — clamp avoids overlap; overflow can stack on other clips. */
export type ArrangementClipStackMode = "clamp" | "overflow";

export type ArrangementClip = {
  id: string;
  sourceTrackId: string;
  chopId: string;
  /** Seconds from arrangement start — used in free lanes only. */
  startTime: number;
  /** Free-mode only — clamp clips cannot overlap others on the lane. */
  stackMode: ArrangementClipStackMode;
};

export type ArrangementLane = {
  id: string;
  name: string;
  clips: ArrangementClip[];
  mute: boolean;
  volume: number;
  mode: ArrangementLaneMode;
};

export type ArrangementState = {
  lanes: ArrangementLane[];
  /** Pixel height of each timeline lane row (saved workspace preference). */
  laneRowHeight: number;
};

export type SessionState = {
  version: 3;
  tracks: Track[];
  arrangement: ArrangementState;
  activeTrackId: string | null;
  paletteMode: PaletteMode;
  padMode: PadMode;
  volume: number;
  accentColor: string;
};

export type ProjectMeta = {
  id: string;
  name: string;
  updatedAt: number;
};

export type ProjectsIndex = {
  activeProjectId: string | null;
  projects: ProjectMeta[];
};

/** v2 layout — kept for migration from older saved sessions. */
export type SavedSessionMetaV2 = {
  version: 2;
  tracks: Track[];
  activeTrackId: string | null;
  paletteMode: PaletteMode;
  padMode: PadMode;
  volume: number;
};

export type ChopPlayRequest = {
  trackId: string;
  start: number;
  end: number;
  key: string;
  volume: number;
  timeStretch: number;
};

/** v1 layout — kept for migration from older saved sessions. */
export type SavedSessionMetaV1 = {
  version: 1;
  sourceType: SourceType;
  sourceName: string;
  sourceUrl?: string;
  chops: Chop[];
  paletteMode: PaletteMode;
  padMode: PadMode;
  volume: number;
};

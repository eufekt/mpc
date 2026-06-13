import type { PaletteMode } from "./chopColors";

export type Chop = {
  id: string;
  start: number;
  end: number;
  key: string | null;
  color: string;
  volume: number;
};

export type SourceType = "file" | "youtube";

export type PadMode = "layer" | "clear" | "loop";

export type Track = {
  id: string;
  sourceType: SourceType;
  sourceName: string;
  sourceUrl?: string;
  chops: Chop[];
};

export type SessionState = {
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

export type Chop = {
  id: string;
  start: number;
  end: number;
  key: string | null;
  color: string;
};

export type SourceType = "file" | "youtube";

export type PadMode = "layer" | "clear" | "loop";

export type SavedSessionMeta = {
  version: 1;
  sourceType: SourceType;
  sourceName: string;
  sourceUrl?: string;
  chops: Chop[];
  paletteMode: "pastel" | "acidic";
  padMode: PadMode;
  volume: number;
};

export type Session = {
  sourceName: string;
  chops: Chop[];
};

import type { Chop } from "./types";

export type PaletteMode = "pastel" | "acidic";

export const PASTEL_PALETTE = [
  "#f4a6a6",
  "#f4c2a6",
  "#f4e0a6",
  "#d4f4a6",
  "#a6f4c8",
  "#a6f4f4",
  "#a6c8f4",
  "#c8a6f4",
  "#f4a6e0",
  "#f4a6c8",
  "#e0f4a6",
  "#a6f4e0",
  "#f4d4a6",
  "#a6e0f4",
  "#e0a6f4",
  "#f4f4a6",
] as const;

export const ACIDIC_PALETTE = [
  "#ff0055",
  "#ff6600",
  "#ffcc00",
  "#66ff00",
  "#00ff66",
  "#00ffcc",
  "#00ccff",
  "#0066ff",
  "#6600ff",
  "#cc00ff",
  "#ff00cc",
  "#ff0066",
  "#ff3300",
  "#33ff00",
  "#00ff33",
  "#3300ff",
] as const;

export const PALETTES: Record<PaletteMode, readonly string[]> = {
  pastel: PASTEL_PALETTE,
  acidic: ACIDIC_PALETTE,
};

export function getColorForIndex(mode: PaletteMode, index: number): string {
  const palette = PALETTES[mode];
  return palette[index % palette.length];
}

export function assignColorsToChops(
  chops: Chop[],
  mode: PaletteMode,
): Chop[] {
  return chops.map((chop, index) => ({
    ...chop,
    color: getColorForIndex(mode, index),
  }));
}

export function regionFillColor(hex: string, alpha = 0.25): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

import type { Track } from "./types";

function isProbablyUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function nameFromFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return "Untitled";
  const withoutExtension = trimmed.replace(/\.[^.]+$/, "");
  return withoutExtension || trimmed;
}

export function deriveDefaultTrackName(
  track: Pick<Track, "sourceType" | "sourceName" | "name">,
  index: number,
): string {
  if (track.name?.trim()) return track.name.trim();
  if (track.sourceType === "file") {
    return nameFromFileName(track.sourceName);
  }
  if (track.sourceName && !isProbablyUrl(track.sourceName)) {
    return track.sourceName;
  }
  return `Track ${index + 1}`;
}

export async function fetchYouTubeTitle(url: string): Promise<string> {
  const response = await fetch("/api/youtube/metadata", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `request failed (${response.status})`);
  }
  const data = (await response.json()) as { title?: string };
  const title = data.title?.trim();
  if (!title) throw new Error("empty title");
  return title;
}

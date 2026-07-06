import { SimpleFilter, SoundTouch, WebAudioBufferSource } from "soundtouchjs";
import { normalizeTimeStretch } from "./chopPlayback";
import type { Chop, Track } from "./types";

/** Chop fields that determine the rendered output. */
type StretchParams = Pick<Chop, "start" | "end" | "timeStretch"> & {
  id: string;
};

const EXTRACT_CHUNK_FRAMES = 4096;
/**
 * Silence appended to the input slice so SoundTouch's internal pipeline is
 * fully flushed — without it the last ~10% of the output never comes out.
 */
const FLUSH_PAD_FRAMES = 16384;

const cache = new Map<string, AudioBuffer>();
const pending = new Map<string, Promise<AudioBuffer | null>>();

function stretchKey(trackId: string, params: StretchParams): string {
  return [
    trackId,
    params.id,
    params.start.toFixed(6),
    params.end.toFixed(6),
    normalizeTimeStretch(params.timeStretch).toFixed(3),
  ].join(":");
}

/** Slice [start, end] plus trailing silence (padFrames) to flush the stretcher. */
function sliceBuffer(
  context: BaseAudioContext,
  buffer: AudioBuffer,
  start: number,
  end: number,
  padFrames: number,
): { slice: AudioBuffer; contentFrames: number } | null {
  const clampedStart = Math.max(0, Math.min(buffer.duration, start));
  const clampedEnd = Math.max(clampedStart, Math.min(buffer.duration, end));
  const startFrame = Math.floor(clampedStart * buffer.sampleRate);
  const endFrame = Math.min(
    buffer.length,
    Math.ceil(clampedEnd * buffer.sampleRate),
  );
  const frameCount = endFrame - startFrame;
  if (frameCount <= 0) return null;

  const slice = context.createBuffer(
    buffer.numberOfChannels,
    frameCount + padFrames,
    buffer.sampleRate,
  );
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    slice.copyToChannel(
      buffer.getChannelData(channel).subarray(startFrame, endFrame),
      channel,
    );
  }
  return { slice, contentFrames: frameCount };
}

/** Pitch-preserving render of a chop slice — output length is natural / timeStretch. */
function renderStretchedSlice(
  context: BaseAudioContext,
  buffer: AudioBuffer,
  start: number,
  end: number,
  timeStretch: number,
): AudioBuffer | null {
  const stretch = normalizeTimeStretch(timeStretch);
  const sliced = sliceBuffer(context, buffer, start, end, FLUSH_PAD_FRAMES);
  if (!sliced) return null;
  const { slice, contentFrames } = sliced;

  const expectedFrames = Math.max(1, Math.round(contentFrames / stretch));
  const output = context.createBuffer(2, expectedFrames, buffer.sampleRate);
  const outLeft = output.getChannelData(0);
  const outRight = output.getChannelData(1);

  const soundTouch = new SoundTouch();
  soundTouch.tempo = stretch;
  const filter = new SimpleFilter(new WebAudioBufferSource(slice), soundTouch);

  const chunk = new Float32Array(EXTRACT_CHUNK_FRAMES * 2);
  let written = 0;
  while (written < expectedFrames) {
    const frames = filter.extract(chunk, EXTRACT_CHUNK_FRAMES);
    if (frames <= 0) break;
    const usable = Math.min(frames, expectedFrames - written);
    for (let i = 0; i < usable; i += 1) {
      outLeft[written + i] = chunk[i * 2];
      outRight[written + i] = chunk[i * 2 + 1];
    }
    written += usable;
  }

  return output;
}

/** Cached stretched buffer for a tempo-mode chop, or null when not rendered yet. */
export function getStretchedSlice(
  trackId: string,
  params: StretchParams,
): AudioBuffer | null {
  return cache.get(stretchKey(trackId, params)) ?? null;
}

/** Render (or reuse) the stretched buffer for a tempo-mode chop. */
export function ensureStretchedSlice(
  context: BaseAudioContext,
  buffer: AudioBuffer,
  trackId: string,
  params: StretchParams,
): Promise<AudioBuffer | null> {
  const key = stretchKey(trackId, params);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  // Defer to a macrotask so bursts of edits don't block the current frame.
  const task = new Promise<AudioBuffer | null>((resolve) => {
    window.setTimeout(() => {
      const rendered = renderStretchedSlice(
        context,
        buffer,
        params.start,
        params.end,
        params.timeStretch,
      );
      pending.delete(key);
      if (rendered) {
        cache.set(key, rendered);
      }
      resolve(rendered);
    }, 0);
  });
  pending.set(key, task);
  return task;
}

/** Drop cache entries that no longer match a tempo-mode chop. */
export function pruneStretchCache(tracks: Track[]): void {
  const validKeys = new Set<string>();
  for (const track of tracks) {
    for (const chop of track.chops) {
      if (chop.stretchMode !== "tempo") continue;
      validKeys.add(stretchKey(track.id, chop));
    }
  }
  for (const key of cache.keys()) {
    if (!validKeys.has(key)) {
      cache.delete(key);
    }
  }
}

/** Pre-render every tempo-mode chop that has audio loaded. */
export async function ensureAllStretchedSlices(
  context: BaseAudioContext,
  tracks: Track[],
  getBuffer: (trackId: string) => AudioBuffer | null,
): Promise<void> {
  const jobs: Promise<AudioBuffer | null>[] = [];
  for (const track of tracks) {
    const buffer = getBuffer(track.id);
    if (!buffer) continue;
    for (const chop of track.chops) {
      if (chop.stretchMode !== "tempo") continue;
      jobs.push(ensureStretchedSlice(context, buffer, track.id, chop));
    }
  }
  await Promise.all(jobs);
}

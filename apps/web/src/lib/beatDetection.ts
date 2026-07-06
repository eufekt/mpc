import { guess } from "web-audio-beat-detector";

export type DetectedTempo = {
  /** Estimated tempo in BPM. */
  bpm: number;
  /** Seconds from buffer start to the first detected beat. */
  offset: number;
};

/**
 * Estimate tempo and first-beat offset of a buffer.
 * Widens the default 90–180 range so slower material resolves without halving.
 */
export async function detectTempo(
  buffer: AudioBuffer,
): Promise<DetectedTempo> {
  const { bpm, offset } = await guess(buffer, {
    minTempo: 60,
    maxTempo: 200,
  });
  return { bpm, offset };
}

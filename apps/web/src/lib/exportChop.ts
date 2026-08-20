import { audioBufferToWav } from "./audioBufferToWav";
import {
  getChopNaturalDuration,
  getChopPlaybackDuration,
} from "./chopPlayback";
import {
  createMasterEffectsRack,
  normalizeMasterEffects,
  type MasterEffects,
} from "./masterEffects";
import { playSlice } from "./sliceAudioBuffer";
import { ensureStretchedSlice } from "./stretchRender";
import type { Chop } from "./types";

const DELAY_TAIL_AMPLITUDE = 0.001;
const MAX_TAIL_SECONDS = 90;
const TAIL_PAD_SECONDS = 0.05;
const SILENCE_THRESHOLD = 0.0005;
const SILENCE_PAD_SECONDS = 0.03;

/** Extra seconds to render after the dry chop so delay/reverb tails are captured. */
export function estimateEffectsTailSeconds(effects: MasterEffects): number {
  const fx = normalizeMasterEffects(effects);
  let delayTail = 0;
  const delayTime = fx.delay.timeMs / 1000;

  if (fx.delay.enabled && fx.delay.mix > 0) {
    if (fx.delay.feedback <= 0) {
      delayTail = delayTime;
    } else {
      const relative =
        DELAY_TAIL_AMPLITUDE / Math.max(fx.delay.mix, DELAY_TAIL_AMPLITUDE);
      const n =
        Math.log(relative) / Math.log(Math.max(fx.delay.feedback, 1e-6));
      const echoes = Number.isFinite(n) ? Math.max(1, Math.ceil(n) + 1) : 1;
      delayTail = echoes * delayTime;
    }
  }

  let reverbTail = 0;
  if (fx.reverb.enabled && fx.reverb.mix > 0) {
    // The reverb send is taken from the delay node, so it is always offset by
    // delayTime, and keeps ringing after the last echo when feedback is on.
    const delaySendTail =
      fx.delay.enabled && fx.delay.feedback > 0 ? delayTail : delayTime;
    reverbTail =
      delaySendTail + fx.reverb.preDelayMs / 1000 + fx.reverb.decaySeconds;
  }

  const tail = Math.max(delayTail, reverbTail);
  if (tail <= 0) return 0;
  return Math.min(MAX_TAIL_SECONDS, tail + TAIL_PAD_SECONDS);
}

export function chopExportFilename(
  trackName: string,
  chop: Chop,
  chopIndex: number,
): string {
  const track = sanitizeFilename(trackName || "track");
  const name = sanitizeFilename(chop.name?.trim() || String(chopIndex + 1));
  return `${track}-${name}.wav`;
}

function sanitizeFilename(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 80) || "chop";
}

function extractSlice(
  context: BaseAudioContext,
  buffer: AudioBuffer,
  start: number,
  end: number,
): AudioBuffer | null {
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
    frameCount,
    buffer.sampleRate,
  );
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    slice.copyToChannel(
      buffer.getChannelData(channel).subarray(startFrame, endFrame),
      channel,
    );
  }
  return slice;
}

function trimTrailingSilence(buffer: AudioBuffer): AudioBuffer {
  const { numberOfChannels, length, sampleRate } = buffer;
  let last = -1;
  outer: for (let i = length - 1; i >= 0; i -= 1) {
    for (let channel = 0; channel < numberOfChannels; channel += 1) {
      if (Math.abs(buffer.getChannelData(channel)[i]) > SILENCE_THRESHOLD) {
        last = i;
        break outer;
      }
    }
  }
  if (last < 0) {
    return buffer;
  }
  const pad = Math.round(SILENCE_PAD_SECONDS * sampleRate);
  const keep = Math.min(length, last + 1 + pad);
  if (keep >= length) return buffer;

  const trimmed = new OfflineAudioContext(
    numberOfChannels,
    keep,
    sampleRate,
  ).createBuffer(numberOfChannels, keep, sampleRate);
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    trimmed.copyToChannel(
      buffer.getChannelData(channel).subarray(0, keep),
      channel,
    );
  }
  return trimmed;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ExportChopOptions = {
  /** Live context used to render tempo-stretched slices (SoundTouch). */
  renderContext: BaseAudioContext;
  buffer: AudioBuffer;
  trackId: string;
  trackName: string;
  chop: Chop;
  chopIndex: number;
};

/**
 * Render a chop through its insert effects (filter / delay / reverb), including
 * any tail that rings past the dry slice, and download it as a WAV.
 */
export async function exportChopWithEffects(
  options: ExportChopOptions,
): Promise<void> {
  const { renderContext, buffer, trackId, trackName, chop, chopIndex } =
    options;
  const effects = normalizeMasterEffects(chop.effects);
  const natural = getChopNaturalDuration(chop);
  if (natural <= 0) {
    throw new Error("chop is empty");
  }

  let playBuffer = buffer;
  let start = chop.start;
  let end = chop.end;
  let rate = chop.timeStretch;

  if (chop.stretchMode === "tempo" && chop.timeStretch !== 1) {
    const stretched = await ensureStretchedSlice(
      renderContext,
      buffer,
      trackId,
      chop,
    );
    if (!stretched) {
      throw new Error("could not render time-stretched chop");
    }
    playBuffer = stretched;
    start = 0;
    end = stretched.duration;
    rate = 1;
  }

  const playbackDuration = getChopPlaybackDuration(end - start, rate);
  if (playbackDuration <= 0) {
    throw new Error("chop is empty");
  }

  const totalDuration =
    playbackDuration + estimateEffectsTailSeconds(effects);
  const sampleRate = playBuffer.sampleRate;
  const channelCount = Math.max(2, playBuffer.numberOfChannels);
  const frameCount = Math.max(1, Math.ceil(totalDuration * sampleRate));
  const offline = new OfflineAudioContext(channelCount, frameCount, sampleRate);
  const localBuffer = extractSlice(offline, playBuffer, start, end);
  if (!localBuffer) {
    throw new Error("chop is empty");
  }

  const rack = createMasterEffectsRack(offline);
  rack.apply(effects);
  rack.output.connect(offline.destination);

  playSlice(
    offline,
    localBuffer,
    0,
    localBuffer.duration,
    rack.input,
    chop.volume,
    0,
    rate,
    chop.reverse,
  );

  const rendered = trimTrailingSilence(await offline.startRendering());
  const wav = audioBufferToWav(rendered);
  triggerDownload(wav, chopExportFilename(trackName, chop, chopIndex));
}

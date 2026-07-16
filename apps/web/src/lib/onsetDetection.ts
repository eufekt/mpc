export type OnsetSensitivity = "low" | "medium" | "high";

const WINDOW_SIZE = 1024;
const HOP_SIZE = 512;
/** Minimum seconds between detected onsets. */
const MIN_ONSET_GAP_SECONDS = 0.05;
/** Frames on each side used for the adaptive threshold. */
const THRESHOLD_NEIGHBORHOOD = 20;

const SENSITIVITY_MULTIPLIER: Record<OnsetSensitivity, number> = {
  low: 2.2,
  medium: 1.6,
  high: 1.2,
};

function downmixToMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      mono[i] += data[i];
    }
  }
  if (buffer.numberOfChannels > 1) {
    for (let i = 0; i < mono.length; i += 1) {
      mono[i] /= buffer.numberOfChannels;
    }
  }
  return mono;
}

function energyEnvelope(mono: Float32Array): Float32Array {
  const frameCount = Math.max(
    0,
    Math.floor((mono.length - WINDOW_SIZE) / HOP_SIZE) + 1,
  );
  const energies = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * HOP_SIZE;
    let sum = 0;
    for (let i = start; i < start + WINDOW_SIZE; i += 1) {
      sum += mono[i] * mono[i];
    }
    energies[frame] = Math.sqrt(sum / WINDOW_SIZE);
  }
  return energies;
}

/** Half-wave rectified energy difference — rises sharply at transients. */
function onsetStrength(energies: Float32Array): Float32Array {
  const flux = new Float32Array(energies.length);
  for (let i = 1; i < energies.length; i += 1) {
    flux[i] = Math.max(0, energies[i] - energies[i - 1]);
  }
  return flux;
}

/**
 * Detect transient positions (seconds) with an energy-envelope method:
 * local peaks in the rectified energy difference above an adaptive threshold.
 */
export function detectOnsets(
  buffer: AudioBuffer,
  sensitivity: OnsetSensitivity = "medium",
): number[] {
  if (buffer.length < WINDOW_SIZE * 2) return [];

  const mono = downmixToMono(buffer);
  const energies = energyEnvelope(mono);
  const flux = onsetStrength(energies);
  const multiplier = SENSITIVITY_MULTIPLIER[sensitivity];

  let globalMean = 0;
  for (let i = 0; i < flux.length; i += 1) {
    globalMean += flux[i];
  }
  globalMean /= Math.max(1, flux.length);
  // Floor keeps near-silent stretches from producing spurious onsets.
  const noiseFloor = globalMean * 0.5;

  const onsets: number[] = [];
  const minGapFrames = Math.ceil(
    (MIN_ONSET_GAP_SECONDS * buffer.sampleRate) / HOP_SIZE,
  );
  let lastOnsetFrame = -minGapFrames;

  for (let i = 1; i < flux.length - 1; i += 1) {
    if (flux[i] < flux[i - 1] || flux[i] <= flux[i + 1]) continue;

    const from = Math.max(0, i - THRESHOLD_NEIGHBORHOOD);
    const to = Math.min(flux.length, i + THRESHOLD_NEIGHBORHOOD + 1);
    let localMean = 0;
    for (let j = from; j < to; j += 1) {
      localMean += flux[j];
    }
    localMean /= to - from;

    const threshold = Math.max(localMean * multiplier, noiseFloor);
    if (flux[i] <= threshold) continue;
    if (i - lastOnsetFrame < minGapFrames) continue;

    lastOnsetFrame = i;
    onsets.push((i * HOP_SIZE) / buffer.sampleRate);
  }

  return onsets;
}

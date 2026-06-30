export type MasterDelayEffects = {
  enabled: boolean;
  /** Echo delay time in milliseconds. */
  timeMs: number;
  /** Feedback amount 0–1. */
  feedback: number;
  /** Wet mix 0–1. */
  mix: number;
};

export type MasterFilterEffects = {
  enabled: boolean;
  type: "lowpass" | "highpass";
  /** Cutoff frequency in Hz. */
  cutoffHz: number;
  /** Filter Q / resonance. */
  resonance: number;
};

export type MasterReverbEffects = {
  enabled: boolean;
  /** Wet mix 0–1. */
  mix: number;
  /** Decay / room size in seconds. */
  decaySeconds: number;
  /** Pre-delay before the reverb tail, in milliseconds. */
  preDelayMs: number;
};

export type MasterEffects = {
  delay: MasterDelayEffects;
  filter: MasterFilterEffects;
  reverb: MasterReverbEffects;
};

export const DEFAULT_MASTER_EFFECTS: MasterEffects = {
  delay: {
    enabled: false,
    timeMs: 350,
    feedback: 0.35,
    mix: 0.3,
  },
  filter: {
    enabled: false,
    type: "lowpass",
    cutoffHz: 8000,
    resonance: 1,
  },
  reverb: {
    enabled: false,
    mix: 0.35,
    decaySeconds: 1.2,
    preDelayMs: 20,
  },
};

const MIN_DELAY_MS = 10;
const MAX_DELAY_MS = 2000;
const MIN_CUTOFF_HZ = 20;
const MAX_CUTOFF_HZ = 20000;
const MIN_RESONANCE = 0.1;
const MAX_RESONANCE = 18;
const MAX_FEEDBACK = 0.95;
const MIN_REVERB_DECAY_S = 0.1;
const MAX_REVERB_DECAY_S = 8;
const MIN_REVERB_PRE_DELAY_MS = 0;
const MAX_REVERB_PRE_DELAY_MS = 100;
const MAX_REVERB_PRE_DELAY_S = MAX_REVERB_PRE_DELAY_MS / 1000;

export function normalizeMasterEffects(
  value: Partial<MasterEffects> | undefined,
): MasterEffects {
  const delay: Partial<MasterDelayEffects> = value?.delay ?? {};
  const filter: Partial<MasterFilterEffects> = value?.filter ?? {};
  const reverb: Partial<MasterReverbEffects> = value?.reverb ?? {};

  return {
    delay: {
      enabled: delay.enabled === true,
      timeMs: clamp(
        typeof delay.timeMs === "number" ? delay.timeMs : DEFAULT_MASTER_EFFECTS.delay.timeMs,
        MIN_DELAY_MS,
        MAX_DELAY_MS,
      ),
      feedback: clamp(
        typeof delay.feedback === "number"
          ? delay.feedback
          : DEFAULT_MASTER_EFFECTS.delay.feedback,
        0,
        MAX_FEEDBACK,
      ),
      mix: clamp(
        typeof delay.mix === "number" ? delay.mix : DEFAULT_MASTER_EFFECTS.delay.mix,
        0,
        1,
      ),
    },
    filter: {
      enabled: filter.enabled === true,
      type: filter.type === "highpass" ? "highpass" : "lowpass",
      cutoffHz: clamp(
        typeof filter.cutoffHz === "number"
          ? filter.cutoffHz
          : DEFAULT_MASTER_EFFECTS.filter.cutoffHz,
        MIN_CUTOFF_HZ,
        MAX_CUTOFF_HZ,
      ),
      resonance: clamp(
        typeof filter.resonance === "number"
          ? filter.resonance
          : DEFAULT_MASTER_EFFECTS.filter.resonance,
        MIN_RESONANCE,
        MAX_RESONANCE,
      ),
    },
    reverb: {
      enabled: reverb.enabled === true,
      mix: clamp(
        typeof reverb.mix === "number" ? reverb.mix : DEFAULT_MASTER_EFFECTS.reverb.mix,
        0,
        1,
      ),
      decaySeconds: clamp(
        typeof reverb.decaySeconds === "number"
          ? reverb.decaySeconds
          : DEFAULT_MASTER_EFFECTS.reverb.decaySeconds,
        MIN_REVERB_DECAY_S,
        MAX_REVERB_DECAY_S,
      ),
      preDelayMs: clamp(
        typeof reverb.preDelayMs === "number"
          ? reverb.preDelayMs
          : DEFAULT_MASTER_EFFECTS.reverb.preDelayMs,
        MIN_REVERB_PRE_DELAY_MS,
        MAX_REVERB_PRE_DELAY_MS,
      ),
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function createReverbImpulseResponse(
  context: AudioContext,
  decaySeconds: number,
): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.ceil(decaySeconds * sampleRate));
  const impulse = context.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const channelData = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      const envelope = Math.exp((-6 * t) / decaySeconds);
      channelData[i] = (Math.random() * 2 - 1) * envelope;
    }
  }

  return impulse;
}

export type MasterEffectsRack = {
  input: GainNode;
  output: GainNode;
  apply: (effects: MasterEffects) => void;
};

export function patchMasterEffects(
  current: MasterEffects,
  patch: {
    delay?: Partial<MasterEffects["delay"]>;
    filter?: Partial<MasterEffects["filter"]>;
    reverb?: Partial<MasterEffects["reverb"]>;
  },
): MasterEffects {
  return normalizeMasterEffects({
    delay: { ...current.delay, ...patch.delay },
    filter: { ...current.filter, ...patch.filter },
    reverb: { ...current.reverb, ...patch.reverb },
  });
}

/** Per-chop insert routed into the master bus (chop FX → master FX). */
export function createChopEffectsInsert(
  context: AudioContext,
  masterBus: AudioNode,
  effects: MasterEffects,
): MasterEffectsRack {
  const rack = createMasterEffectsRack(context);
  rack.apply(normalizeMasterEffects(effects));
  rack.output.connect(masterBus);
  return rack;
}

/** Master insert: filter -> dry/wet delay -> reverb -> output. */
export function createMasterEffectsRack(context: AudioContext): MasterEffectsRack {
  const input = context.createGain();
  const output = context.createGain();
  const filter = context.createBiquadFilter();
  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const delay = context.createDelay(MAX_DELAY_MS / 1000);
  const feedbackGain = context.createGain();
  const reverbPreDelay = context.createDelay(MAX_REVERB_PRE_DELAY_S);
  const convolver = context.createConvolver();
  const reverbWetGain = context.createGain();
  let lastReverbDecaySeconds = -1;

  input.connect(filter);
  filter.connect(dryGain);
  filter.connect(delay);
  delay.connect(feedbackGain);
  feedbackGain.connect(delay);
  delay.connect(wetGain);
  delay.connect(reverbPreDelay);
  reverbPreDelay.connect(convolver);
  convolver.connect(reverbWetGain);
  dryGain.connect(output);
  wetGain.connect(output);
  reverbWetGain.connect(output);

  return {
    input,
    output,
    apply(effects) {
      const normalized = normalizeMasterEffects(effects);

      if (normalized.filter.enabled) {
        filter.type = normalized.filter.type;
        filter.frequency.value = normalized.filter.cutoffHz;
        filter.Q.value = normalized.filter.resonance;
      } else {
        filter.type = "lowpass";
        filter.frequency.value = MAX_CUTOFF_HZ;
        filter.Q.value = 0.707;
      }

      const delayWetMix = normalized.delay.enabled ? normalized.delay.mix : 0;
      const reverbWetMix = normalized.reverb.enabled ? normalized.reverb.mix : 0;
      dryGain.gain.value = Math.max(0, 1 - delayWetMix - reverbWetMix);
      wetGain.gain.value = delayWetMix;
      delay.delayTime.value = normalized.delay.timeMs / 1000;
      feedbackGain.gain.value = normalized.delay.enabled
        ? normalized.delay.feedback
        : 0;

      reverbWetGain.gain.value = reverbWetMix;
      reverbPreDelay.delayTime.value = normalized.reverb.preDelayMs / 1000;
      if (lastReverbDecaySeconds !== normalized.reverb.decaySeconds) {
        convolver.buffer = createReverbImpulseResponse(
          context,
          normalized.reverb.decaySeconds,
        );
        lastReverbDecaySeconds = normalized.reverb.decaySeconds;
      }
    },
  };
}

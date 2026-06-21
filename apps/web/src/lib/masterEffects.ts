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

export type MasterEffects = {
  delay: MasterDelayEffects;
  filter: MasterFilterEffects;
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
};

const MIN_DELAY_MS = 10;
const MAX_DELAY_MS = 2000;
const MIN_CUTOFF_HZ = 20;
const MAX_CUTOFF_HZ = 20000;
const MIN_RESONANCE = 0.1;
const MAX_RESONANCE = 18;
const MAX_FEEDBACK = 0.95;

export function normalizeMasterEffects(
  value: Partial<MasterEffects> | undefined,
): MasterEffects {
  const delay: Partial<MasterDelayEffects> = value?.delay ?? {};
  const filter: Partial<MasterFilterEffects> = value?.filter ?? {};

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
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export type MasterEffectsRack = {
  input: GainNode;
  output: GainNode;
  apply: (effects: MasterEffects) => void;
};

/** Master insert: filter -> dry/wet delay -> output. */
export function createMasterEffectsRack(context: AudioContext): MasterEffectsRack {
  const input = context.createGain();
  const output = context.createGain();
  const filter = context.createBiquadFilter();
  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const delay = context.createDelay(MAX_DELAY_MS / 1000);
  const feedbackGain = context.createGain();

  input.connect(filter);
  filter.connect(dryGain);
  filter.connect(delay);
  delay.connect(feedbackGain);
  feedbackGain.connect(delay);
  delay.connect(wetGain);
  dryGain.connect(output);
  wetGain.connect(output);

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

      const wetMix = normalized.delay.enabled ? normalized.delay.mix : 0;
      dryGain.gain.value = 1 - wetMix;
      wetGain.gain.value = wetMix;
      delay.delayTime.value = normalized.delay.timeMs / 1000;
      feedbackGain.gain.value = normalized.delay.enabled
        ? normalized.delay.feedback
        : 0;
    },
  };
}

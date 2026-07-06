declare module "soundtouchjs" {
  export class SoundTouch {
    /** Speed multiplier — >1 plays faster (shorter output). */
    tempo: number;
    /** Pitch multiplier — 1 keeps the original pitch. */
    pitch: number;
    rate: number;
  }

  export class WebAudioBufferSource {
    constructor(buffer: AudioBuffer);
    extract(target: Float32Array, numFrames?: number, position?: number): number;
  }

  export class SimpleFilter {
    constructor(sourceSound: WebAudioBufferSource, pipe: SoundTouch);
    /** Fills target with interleaved stereo samples; returns frames extracted. */
    extract(target: Float32Array, numFrames?: number): number;
  }
}

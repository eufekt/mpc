function connectWithGain(
  context: AudioContext,
  source: AudioBufferSourceNode,
  destination: AudioNode,
  volume: number,
) {
  if (volume === 1) {
    source.connect(destination);
    return;
  }
  const gain = context.createGain();
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(destination);
}

function createReversedSliceBuffer(
  context: AudioContext,
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

  const reversed = context.createBuffer(
    buffer.numberOfChannels,
    frameCount,
    buffer.sampleRate,
  );

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const input = buffer.getChannelData(channel);
    const output = reversed.getChannelData(channel);
    for (let i = 0; i < frameCount; i += 1) {
      output[i] = input[startFrame + frameCount - 1 - i];
    }
  }

  return reversed;
}

export function playSlice(
  context: AudioContext,
  buffer: AudioBuffer,
  start: number,
  end: number,
  destination: AudioNode,
  volume = 1,
  when = 0,
  playbackRate = 1,
  reverse = false,
): AudioBufferSourceNode {
  const source = context.createBufferSource();
  const reversedBuffer = reverse
    ? createReversedSliceBuffer(context, buffer, start, end)
    : null;

  source.buffer = reversedBuffer ?? buffer;
  source.playbackRate.value = playbackRate;
  connectWithGain(context, source, destination, volume);

  if (reversedBuffer) {
    source.start(when, 0, reversedBuffer.duration);
  } else {
    const duration = Math.max(0, end - start);
    source.start(when, start, duration);
  }

  return source;
}

export function playFrom(
  context: AudioContext,
  buffer: AudioBuffer,
  from: number,
  destination: AudioNode,
): AudioBufferSourceNode {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(destination);
  const duration = Math.max(0, buffer.duration - from);
  source.start(0, from, duration);
  return source;
}

export function playSliceLoop(
  context: AudioContext,
  buffer: AudioBuffer,
  start: number,
  end: number,
  destination: AudioNode,
  volume = 1,
  playbackRate = 1,
  reverse = false,
): AudioBufferSourceNode {
  const source = context.createBufferSource();
  const reversedBuffer = reverse
    ? createReversedSliceBuffer(context, buffer, start, end)
    : null;

  source.buffer = reversedBuffer ?? buffer;
  source.loop = true;
  source.loopStart = reversedBuffer ? 0 : start;
  source.loopEnd = reversedBuffer ? reversedBuffer.duration : end;
  source.playbackRate.value = playbackRate;
  connectWithGain(context, source, destination, volume);
  source.start(0, reversedBuffer ? 0 : start);
  return source;
}

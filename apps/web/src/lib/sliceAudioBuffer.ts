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

export function playSlice(
  context: AudioContext,
  buffer: AudioBuffer,
  start: number,
  end: number,
  destination: AudioNode,
  volume = 1,
): AudioBufferSourceNode {
  const source = context.createBufferSource();
  source.buffer = buffer;
  connectWithGain(context, source, destination, volume);
  const duration = Math.max(0, end - start);
  source.start(0, start, duration);
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
): AudioBufferSourceNode {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = start;
  source.loopEnd = end;
  connectWithGain(context, source, destination, volume);
  source.start(0, start);
  return source;
}

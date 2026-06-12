export function playSlice(
  context: AudioContext,
  buffer: AudioBuffer,
  start: number,
  end: number,
  destination: AudioNode,
): AudioBufferSourceNode {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(destination);
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
): AudioBufferSourceNode {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = start;
  source.loopEnd = end;
  source.connect(destination);
  source.start(0, start);
  return source;
}

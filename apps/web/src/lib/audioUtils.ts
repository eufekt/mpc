export function stopSource(source: AudioBufferSourceNode): void {
  try {
    source.stop();
  } catch {
    // already stopped
  }
}

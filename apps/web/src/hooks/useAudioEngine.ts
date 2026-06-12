import { useCallback, useRef, useState } from "react";
import { playFrom, playSlice, playSliceLoop } from "../lib/sliceAudioBuffer";
import type { PadMode } from "../lib/types";

function stopSource(source: AudioBufferSourceNode) {
  try {
    source.stop();
  } catch {
    // already stopped
  }
}

type ActivePlayback = {
  start: number;
  end: number;
  startedAt: number;
  source: AudioBufferSourceNode;
  loop: boolean;
  kind: "chop" | "track";
};

export function useAudioEngine() {
  const contextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const volumeRef = useRef(1);
  const [volume, setVolumeState] = useState(1);
  const padSourcesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  const loopRef = useRef<{
    key: string;
    source: AudioBufferSourceNode;
  } | null>(null);
  const activePlaybackRef = useRef<ActivePlayback | null>(null);
  const trackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const seekTimeRef = useRef(0);
  const [seekTime, setSeekTimeState] = useState(0);
  const [playbackEpoch, setPlaybackEpoch] = useState(0);
  const [loopingKey, setLoopingKey] = useState<string | null>(null);
  const [isTrackPlaying, setIsTrackPlaying] = useState(false);

  const getContext = useCallback(() => {
    if (!contextRef.current) {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.value = volumeRef.current;
      gain.connect(ctx.destination);
      contextRef.current = ctx;
      gainNodeRef.current = gain;
    }
    return contextRef.current;
  }, []);

  const setVolume = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    volumeRef.current = clamped;
    setVolumeState(clamped);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = clamped;
    }
  }, []);

  const resume = useCallback(async () => {
    const ctx = getContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
  }, [getContext]);

  const stopPad = useCallback((padKey: string) => {
    const key = padKey.toLowerCase();
    const existing = padSourcesRef.current.get(key);
    if (!existing) return;
    stopSource(existing);
    padSourcesRef.current.delete(key);
  }, []);

  const pauseTrack = useCallback(() => {
    const active = activePlaybackRef.current;
    const ctx = contextRef.current;
    if (active?.kind === "track" && ctx) {
      const elapsed = ctx.currentTime - active.startedAt;
      const pausedAt = Math.min(active.end, active.start + elapsed);
      seekTimeRef.current = pausedAt;
      setSeekTimeState(pausedAt);
    }

    const source = trackSourceRef.current;
    if (source) {
      stopSource(source);
      trackSourceRef.current = null;
    }
    setIsTrackPlaying(false);
    if (activePlaybackRef.current?.kind === "track") {
      activePlaybackRef.current = null;
    }
  }, []);

  const stopLoop = useCallback(() => {
    const loop = loopRef.current;
    if (!loop) return;
    stopSource(loop.source);
    loopRef.current = null;
    setLoopingKey(null);
    if (activePlaybackRef.current?.source === loop.source) {
      activePlaybackRef.current = null;
    }
  }, []);

  const stopAllPads = useCallback(() => {
    stopLoop();
    pauseTrack();
    for (const source of padSourcesRef.current.values()) {
      stopSource(source);
    }
    padSourcesRef.current.clear();
    if (activePlaybackRef.current?.kind === "chop") {
      activePlaybackRef.current = null;
    }
  }, [stopLoop, pauseTrack]);

  const setSeekTime = useCallback((time: number) => {
    const buffer = bufferRef.current;
    const clamped = buffer
      ? Math.max(0, Math.min(buffer.duration, time))
      : Math.max(0, time);
    seekTimeRef.current = clamped;
    setSeekTimeState(clamped);
  }, []);

  const getPlaybackTime = useCallback((): number | null => {
    const active = activePlaybackRef.current;
    const ctx = contextRef.current;
    if (!active || !ctx) return null;

    const elapsed = ctx.currentTime - active.startedAt;
    const sliceLen = active.end - active.start;
    if (sliceLen <= 0) return null;

    if (active.loop) {
      return active.start + (elapsed % sliceLen);
    }

    const time = active.start + elapsed;
    if (time >= active.end) {
      return null;
    }
    return time;
  }, []);

  const decodeArrayBuffer = useCallback(
    async (arrayBuffer: ArrayBuffer, name: string) => {
      setLoading(true);
      setError(null);
      stopAllPads();
      try {
        await resume();
        const ctx = getContext();
        const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
        bufferRef.current = decoded;
        setSourceName(name);
        seekTimeRef.current = 0;
        setSeekTimeState(0);
      } catch (e) {
        bufferRef.current = null;
        setSourceName(null);
        setError(e instanceof Error ? e.message : "decode failed");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [getContext, resume, stopAllPads],
  );

  const loadArrayBuffer = useCallback(
    async (arrayBuffer: ArrayBuffer, name: string) => {
      await decodeArrayBuffer(arrayBuffer, name);
    },
    [decodeArrayBuffer],
  );

  const loadFile = useCallback(
    async (file: File) => {
      const arrayBuffer = await file.arrayBuffer();
      await decodeArrayBuffer(arrayBuffer, file.name);
      return file;
    },
    [decodeArrayBuffer],
  );

  const loadYouTubeUrl = useCallback(
    async (url: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/youtube/audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || `request failed (${response.status})`);
        }
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength < 44) {
          throw new Error("empty or invalid audio response from server");
        }
        await decodeArrayBuffer(arrayBuffer, url);
        return new Blob([arrayBuffer], { type: "audio/wav" });
      } catch (e) {
        setLoading(false);
        setError(e instanceof Error ? e.message : "load failed");
        throw e;
      }
    },
    [decodeArrayBuffer],
  );

  const playTrack = useCallback(async () => {
    const buffer = bufferRef.current;
    if (!buffer) return;
    await resume();
    const ctx = getContext();
    const gain = gainNodeRef.current;
    if (!gain) return;

    pauseTrack();
    stopLoop();

    const from = seekTimeRef.current;
    const remaining = buffer.duration - from;
    if (remaining <= 0) return;

    const source = playFrom(ctx, buffer, from, gain);
    trackSourceRef.current = source;
    const startedAt = ctx.currentTime;
    activePlaybackRef.current = {
      start: from,
      end: buffer.duration,
      startedAt,
      source,
      loop: false,
      kind: "track",
    };
    setIsTrackPlaying(true);
    setPlaybackEpoch((n) => n + 1);

    source.onended = () => {
      trackSourceRef.current = null;
      setIsTrackPlaying(false);
      if (activePlaybackRef.current?.source === source) {
        activePlaybackRef.current = null;
        seekTimeRef.current = buffer.duration;
        setSeekTimeState(buffer.duration);
      }
    };
  }, [getContext, resume, stopLoop, pauseTrack]);

  const toggleTrackPlayback = useCallback(async () => {
    if (isTrackPlaying) {
      pauseTrack();
      return;
    }
    await playTrack();
  }, [isTrackPlaying, pauseTrack, playTrack]);

  const playChop = useCallback(
    async (
      start: number,
      end: number,
      padKey: string,
      mode: PadMode,
    ) => {
      const buffer = bufferRef.current;
      if (!buffer) return;
      await resume();
      const ctx = getContext();
      const gain = gainNodeRef.current;
      if (!gain) return;

      pauseTrack();

      const key = padKey.toLowerCase();

      if (mode === "loop") {
        if (loopRef.current?.key === key) {
          stopLoop();
          return;
        }
        stopLoop();
        stopPad(key);

        const source = playSliceLoop(ctx, buffer, start, end, gain);
        const startedAt = ctx.currentTime;
        loopRef.current = { key, source };
        setLoopingKey(padKey.toUpperCase());
        activePlaybackRef.current = {
          start,
          end,
          startedAt,
          source,
          loop: true,
          kind: "chop",
        };
        setPlaybackEpoch((n) => n + 1);

        source.onended = () => {
          if (loopRef.current?.source === source) {
            loopRef.current = null;
            setLoopingKey(null);
          }
          if (activePlaybackRef.current?.source === source) {
            activePlaybackRef.current = null;
          }
        };
        return;
      }

      if (mode === "clear") {
        stopPad(key);
      }

      const source = playSlice(ctx, buffer, start, end, gain);
      const startedAt = ctx.currentTime;
      activePlaybackRef.current = {
        start,
        end,
        startedAt,
        source,
        loop: false,
        kind: "chop",
      };
      setPlaybackEpoch((n) => n + 1);

      source.onended = () => {
        if (activePlaybackRef.current?.source === source) {
          activePlaybackRef.current = null;
        }
        if (mode === "clear" && padSourcesRef.current.get(key) === source) {
          padSourcesRef.current.delete(key);
        }
      };

      if (mode === "clear") {
        padSourcesRef.current.set(key, source);
      }
    },
    [getContext, resume, stopLoop, stopPad, pauseTrack],
  );

  const getBuffer = useCallback(() => bufferRef.current, []);

  const clear = useCallback(() => {
    stopAllPads();
    bufferRef.current = null;
    setSourceName(null);
    setError(null);
  }, [stopAllPads]);

  return {
    sourceName,
    loading,
    error,
    setError,
    loadFile,
    loadArrayBuffer,
    loadYouTubeUrl,
    playChop,
    playTrack,
    pauseTrack,
    toggleTrackPlayback,
    stopLoop,
    loopingKey,
    isTrackPlaying,
    seekTime,
    setSeekTime,
    getBuffer,
    clear,
    resume,
    volume,
    setVolume,
    getPlaybackTime,
    playbackEpoch,
  };
}

import { useCallback, useRef, useState } from "react";
import { playFrom, playSlice, playSliceLoop } from "../lib/sliceAudioBuffer";
import type { ChopPlayRequest, PadMode } from "../lib/types";

function stopSource(source: AudioBufferSourceNode) {
  try {
    source.stop();
  } catch {
    // already stopped
  }
}

type ActivePlayback = {
  trackId: string;
  start: number;
  end: number;
  startedAt: number;
  source: AudioBufferSourceNode;
  loop: boolean;
  kind: "chop" | "track";
};

type TrackTransport = {
  seekTime: number;
  isPlaying: boolean;
  source: AudioBufferSourceNode | null;
};

type LoopState = {
  padKey: string;
  sources: Array<{ trackId: string; source: AudioBufferSourceNode }>;
};

function padSourceKey(trackId: string, padKey: string): string {
  return `${trackId}:${padKey.toLowerCase()}`;
}

// Web Audio nodes live in refs; React state only mirrors what the UI needs.
export function useAudioEngine() {
  const contextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const trackNamesRef = useRef<Map<string, string>>(new Map());
  const [loadedTrackIds, setLoadedTrackIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const volumeRef = useRef(1);
  const [volume, setVolumeState] = useState(1);
  const padSourcesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  const loopRef = useRef<LoopState | null>(null);
  const activePlaybackRef = useRef<ActivePlayback | null>(null);
  const chopPlaybackRef = useRef<Map<string, ActivePlayback>>(new Map());
  const transportRef = useRef<Map<string, TrackTransport>>(new Map());
  const [transportVersion, setTransportVersion] = useState(0);

  const [loopingKey, setLoopingKey] = useState<string | null>(null);

  const bumpTransport = useCallback(() => {
    setTransportVersion((n) => n + 1);
  }, []);

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

  const getTransport = useCallback((trackId: string): TrackTransport => {
    let transport = transportRef.current.get(trackId);
    if (!transport) {
      transport = { seekTime: 0, isPlaying: false, source: null };
      transportRef.current.set(trackId, transport);
    }
    return transport;
  }, []);

  const stopPad = useCallback((trackId: string, padKey: string) => {
    const key = padSourceKey(trackId, padKey);
    const existing = padSourcesRef.current.get(key);
    if (!existing) return;
    stopSource(existing);
    padSourcesRef.current.delete(key);
  }, []);

  const pauseTrack = useCallback(
    (trackId: string) => {
      const active = activePlaybackRef.current;
      const ctx = contextRef.current;
      const transport = getTransport(trackId);

      if (active?.kind === "track" && active.trackId === trackId && ctx) {
        const elapsed = ctx.currentTime - active.startedAt;
        const pausedAt = Math.min(active.end, active.start + elapsed);
        transport.seekTime = pausedAt;
      }

      if (transport.source) {
        stopSource(transport.source);
        transport.source = null;
      }
      transport.isPlaying = false;

      if (
        activePlaybackRef.current?.kind === "track" &&
        activePlaybackRef.current.trackId === trackId
      ) {
        activePlaybackRef.current = null;
      }
      bumpTransport();
    },
    [getTransport, bumpTransport],
  );

  const stopLoop = useCallback(() => {
    const loop = loopRef.current;
    if (!loop) return;
    for (const { trackId, source } of loop.sources) {
      stopSource(source);
      const chopPlayback = chopPlaybackRef.current.get(trackId);
      if (chopPlayback?.source === source) {
        chopPlaybackRef.current.delete(trackId);
      }
    }
    loopRef.current = null;
    setLoopingKey(null);
    if (activePlaybackRef.current?.kind === "chop") {
      const activeSource = activePlaybackRef.current.source;
      if (loop.sources.some((s) => s.source === activeSource)) {
        activePlaybackRef.current = null;
      }
    }
  }, []);

  const stopAllPadsForTrack = useCallback(
    (trackId: string) => {
      for (const [key, source] of padSourcesRef.current.entries()) {
        if (key.startsWith(`${trackId}:`)) {
          stopSource(source);
          padSourcesRef.current.delete(key);
        }
      }
    },
    [],
  );

  const stopAllPlayback = useCallback(() => {
    stopLoop();
    for (const trackId of transportRef.current.keys()) {
      pauseTrack(trackId);
    }
    for (const source of padSourcesRef.current.values()) {
      stopSource(source);
    }
    padSourcesRef.current.clear();
    chopPlaybackRef.current.clear();
    if (activePlaybackRef.current?.kind === "chop") {
      activePlaybackRef.current = null;
    }
  }, [stopLoop, pauseTrack]);

  const setSeekTime = useCallback(
    (trackId: string, time: number) => {
      const buffer = buffersRef.current.get(trackId);
      const transport = getTransport(trackId);
      transport.seekTime = buffer
        ? Math.max(0, Math.min(buffer.duration, time))
        : Math.max(0, time);
      bumpTransport();
    },
    [getTransport, bumpTransport],
  );

  const getSeekTime = useCallback(
    (trackId: string): number => {
      return getTransport(trackId).seekTime;
    },
    [getTransport],
  );

  const isTrackPlaying = useCallback(
    (trackId: string): boolean => {
      return getTransport(trackId).isPlaying;
    },
    [getTransport],
  );

  const getPlaybackTime = useCallback((trackId: string): number | null => {
    const ctx = contextRef.current;
    if (!ctx) return null;

    const chopPlayback = chopPlaybackRef.current.get(trackId);
    const active = chopPlayback ?? (
      activePlaybackRef.current?.trackId === trackId
        ? activePlaybackRef.current
        : null
    );
    if (!active) return null;

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

  const loadTrackAudio = useCallback(
    async (trackId: string, arrayBuffer: ArrayBuffer, name: string) => {
      setLoading(true);
      setError(null);
      try {
        await resume();
        const ctx = getContext();
        const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
        buffersRef.current.set(trackId, decoded);
        trackNamesRef.current.set(trackId, name);
        setLoadedTrackIds(Array.from(buffersRef.current.keys()));

        const transport = getTransport(trackId);
        transport.seekTime = 0;
        transport.isPlaying = false;
        if (transport.source) {
          stopSource(transport.source);
          transport.source = null;
        }
        bumpTransport();
      } catch (e) {
        buffersRef.current.delete(trackId);
        trackNamesRef.current.delete(trackId);
        setLoadedTrackIds(Array.from(buffersRef.current.keys()));
        setError(e instanceof Error ? e.message : "decode failed");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [getContext, resume, getTransport, bumpTransport],
  );

  const unloadTrack = useCallback(
    (trackId: string) => {
      stopAllPadsForTrack(trackId);
      pauseTrack(trackId);
      buffersRef.current.delete(trackId);
      trackNamesRef.current.delete(trackId);
      transportRef.current.delete(trackId);
      chopPlaybackRef.current.delete(trackId);
      setLoadedTrackIds(Array.from(buffersRef.current.keys()));
      bumpTransport();
    },
    [stopAllPadsForTrack, pauseTrack, bumpTransport],
  );

  const hasTrack = useCallback((trackId: string): boolean => {
    return buffersRef.current.has(trackId);
  }, []);

  const getBuffer = useCallback((trackId: string): AudioBuffer | null => {
    return buffersRef.current.get(trackId) ?? null;
  }, []);

  const getTrackName = useCallback((trackId: string): string | null => {
    return trackNamesRef.current.get(trackId) ?? null;
  }, []);

  const loadFile = useCallback(
    async (trackId: string, file: File) => {
      const arrayBuffer = await file.arrayBuffer();
      await loadTrackAudio(trackId, arrayBuffer, file.name);
      return file;
    },
    [loadTrackAudio],
  );

  const loadYouTubeUrl = useCallback(
    async (trackId: string, url: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/youtube/audio", {
          method: "POST",
          cache: "no-store",
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
        await loadTrackAudio(trackId, arrayBuffer, url);
        return new Blob([arrayBuffer], { type: "audio/wav" });
      } catch (e) {
        setLoading(false);
        setError(e instanceof Error ? e.message : "load failed");
        throw e;
      }
    },
    [loadTrackAudio],
  );

  const playTrack = useCallback(
    async (trackId: string) => {
      const buffer = buffersRef.current.get(trackId);
      if (!buffer) return;
      await resume();
      const ctx = getContext();
      const gain = gainNodeRef.current;
      if (!gain) return;

      pauseTrack(trackId);
      stopLoop();

      const transport = getTransport(trackId);
      const from = transport.seekTime;
      const remaining = buffer.duration - from;
      if (remaining <= 0) return;

      const source = playFrom(ctx, buffer, from, gain);
      transport.source = source;
      transport.isPlaying = true;
      const startedAt = ctx.currentTime;
      activePlaybackRef.current = {
        trackId,
        start: from,
        end: buffer.duration,
        startedAt,
        source,
        loop: false,
        kind: "track",
      };
      bumpTransport();

      source.onended = () => {
        transport.source = null;
        transport.isPlaying = false;
        if (activePlaybackRef.current?.source === source) {
          activePlaybackRef.current = null;
          transport.seekTime = buffer.duration;
        }
        bumpTransport();
      };
    },
    [getContext, resume, stopLoop, pauseTrack, getTransport, bumpTransport],
  );

  const toggleTrackPlayback = useCallback(
    async (trackId: string) => {
      if (getTransport(trackId).isPlaying) {
        pauseTrack(trackId);
        return;
      }
      await playTrack(trackId);
    },
    [getTransport, pauseTrack, playTrack],
  );

  const playChops = useCallback(
    async (requests: ChopPlayRequest[], mode: PadMode) => {
      if (requests.length === 0) return;

      const padKey = requests[0].key.toLowerCase();
      await resume();
      const ctx = getContext();
      const gain = gainNodeRef.current;
      if (!gain) return;

      const affectedTrackIds = new Set(requests.map((r) => r.trackId));
      for (const trackId of affectedTrackIds) {
        pauseTrack(trackId);
      }

      if (mode === "loop") {
        if (loopRef.current?.padKey === padKey) {
          stopLoop();
          return;
        }
        stopLoop();
        for (const req of requests) {
          stopPad(req.trackId, req.key);
        }

        const sources: Array<{
          trackId: string;
          source: AudioBufferSourceNode;
          req: ChopPlayRequest;
        }> = [];
        for (const req of requests) {
          const buffer = buffersRef.current.get(req.trackId);
          if (!buffer) continue;
          const source = playSliceLoop(
            ctx,
            buffer,
            req.start,
            req.end,
            gain,
            req.volume,
            req.timeStretch,
          );
          sources.push({ trackId: req.trackId, source, req });
        }
        if (sources.length === 0) return;

        loopRef.current = {
          padKey,
          sources: sources.map(({ trackId, source }) => ({ trackId, source })),
        };
        setLoopingKey(requests[0].key.toUpperCase());

        const startedAt = ctx.currentTime;
        for (const { trackId, source, req } of sources) {
          chopPlaybackRef.current.set(trackId, {
            trackId,
            start: req.start,
            end: req.end,
            startedAt,
            source,
            loop: true,
            kind: "chop",
          });
        }
        return;
      }

      for (const req of requests) {
        const buffer = buffersRef.current.get(req.trackId);
        if (!buffer) continue;

        if (mode === "clear") {
          stopPad(req.trackId, req.key);
        }

        const source = playSlice(
          ctx,
          buffer,
          req.start,
          req.end,
          gain,
          req.volume,
          0,
          req.timeStretch,
        );
        const sourceKey = padSourceKey(req.trackId, req.key);
        const startedAt = ctx.currentTime;
        const playback: ActivePlayback = {
          trackId: req.trackId,
          start: req.start,
          end: req.end,
          startedAt,
          source,
          loop: false,
          kind: "chop",
        };
        chopPlaybackRef.current.set(req.trackId, playback);

        source.onended = () => {
          const current = chopPlaybackRef.current.get(req.trackId);
          if (current?.source === source) {
            chopPlaybackRef.current.delete(req.trackId);
          }
          if (
            mode === "clear" &&
            padSourcesRef.current.get(sourceKey) === source
          ) {
            padSourcesRef.current.delete(sourceKey);
          }
        };

        if (mode === "clear") {
          padSourcesRef.current.set(sourceKey, source);
        }
      }
    },
    [getContext, resume, stopLoop, stopPad, pauseTrack],
  );

  const getMasterGain = useCallback(() => {
    getContext();
    return gainNodeRef.current;
  }, [getContext]);

  return {
    loading,
    error,
    volume,
    loadedTrackIds,
    transportVersion,
    loopingKey,
    loadTrackAudio,
    unloadTrack,
    hasTrack,
    getBuffer,
    getTrackName,
    loadFile,
    loadYouTubeUrl,
    playChops,
    toggleTrackPlayback,
    pauseTrack,
    stopLoop,
    stopAllPlayback,
    isTrackPlaying,
    getSeekTime,
    setSeekTime,
    getPlaybackTime,
    resume,
    setVolume,
    getContext,
    getMasterGain,
  };
}

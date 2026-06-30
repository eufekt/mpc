import { useCallback, useEffect, useRef, useState } from "react";
import { stopSource } from "../lib/audioUtils";
import {
  computeArrangementDuration,
  computeArrangementContentBounds,
  filterLoadedTracks,
  getClipStartTime,
  getFreeClipAudibleSegments,
  resolveLaneClips,
  resolveLoopBounds,
  type ArrangementLoopBounds,
  type ResolvedClip,
} from "../lib/arrangement";
import { playSlice } from "../lib/sliceAudioBuffer";
import { createChopEffectsInsert, normalizeMasterEffects } from "../lib/masterEffects";
import { secondsPerBeat } from "../lib/musicalTime";
import type {
  ArrangementLane,
  ArrangementLoopMode,
  ArrangementLoopRegion,
  MusicalTimeSettings,
  Track,
} from "../lib/types";

const LOOKAHEAD_SECONDS = 0.05;
/** How many loop passes to pre-schedule on the audio clock (gapless). */
const LOOP_ITERATIONS_AHEAD = 3;
/** Re-schedule more loop passes when playhead is within this many seconds of the end. */
const LOOP_RESCHEDULE_LEAD_SECONDS = 8;

function loopRegionLength(bounds: ArrangementLoopBounds): number {
  return Math.max(0, bounds.end - bounds.start);
}

function iterationTimelineOffset(
  iterIndex: number,
  bounds: ArrangementLoopBounds,
  initialStartAt: number,
): number {
  if (iterIndex === 0) return 0;
  const firstPassLength = Math.max(0, bounds.end - initialStartAt);
  const loopLength = loopRegionLength(bounds);
  if (iterIndex === 1) return firstPassLength;
  return firstPassLength + (iterIndex - 1) * loopLength;
}

function loopIterationSchedule(
  iterIndex: number,
  bounds: ArrangementLoopBounds,
  initialStartAt: number,
): { fromTime: number; toTime: number } {
  if (iterIndex === 0) {
    return { fromTime: initialStartAt, toTime: bounds.end };
  }
  return { fromTime: bounds.start, toTime: bounds.end };
}

type Params = {
  lanes: ArrangementLane[];
  tracks: Track[];
  loadedTrackIds: string[];
  loopRegion: ArrangementLoopRegion | null | undefined;
  loopMode: ArrangementLoopMode;
  loopBeats: number;
  musicalTime: MusicalTimeSettings;
  getBuffer: (trackId: string) => AudioBuffer | undefined;
  getContext: () => AudioContext;
  getMasterGain: () => GainNode | null;
  resume: () => Promise<void>;
  masterVolume: number;
};

type ScheduleParams = {
  lanes: ArrangementLane[];
  tracks: Track[];
  getBuffer: (trackId: string) => AudioBuffer | undefined;
  ctx: AudioContext;
  laneGains: Map<string, GainNode>;
  baseTime: number;
  fromTime: number;
  toTime?: number;
  timelineOffset?: number;
};

function scheduleClipWallSegment(
  ctx: AudioContext,
  item: ResolvedClip,
  clipStart: number,
  segStart: number,
  segEnd: number,
  laneGain: GainNode,
  volume: number,
  baseTime: number,
  fromTime: number,
  timelineOffset: number,
  buffer: AudioBuffer,
): AudioBufferSourceNode | null {
  if (segEnd <= fromTime || segEnd <= segStart) return null;

  let wallStart = segStart;
  const wallEnd = segEnd;
  let when: number;

  if (wallStart >= fromTime) {
    when = baseTime + timelineOffset + (wallStart - fromTime);
  } else {
    wallStart = fromTime;
    when = baseTime + timelineOffset;
  }

  if (wallEnd <= wallStart) return null;

  const offsetInClip = wallStart - clipStart;
  const offsetEnd = wallEnd - clipStart;
  let bufferStart: number;
  let bufferEnd: number;
  if (item.chop.reverse) {
    bufferStart = item.chop.end - offsetEnd * item.timeStretch;
    bufferEnd = item.chop.end - offsetInClip * item.timeStretch;
  } else {
    bufferStart = item.chop.start + offsetInClip * item.timeStretch;
    bufferEnd = item.chop.start + offsetEnd * item.timeStretch;
  }

  if (bufferEnd <= bufferStart) return null;

  const chopFx = createChopEffectsInsert(
    ctx,
    laneGain,
    normalizeMasterEffects(item.chop.effects),
  );

  return playSlice(
    ctx,
    buffer,
    bufferStart,
    bufferEnd,
    chopFx.input,
    volume,
    when,
    item.timeStretch,
    item.chop.reverse,
  );
}

function scheduleArrangement({
  lanes,
  tracks,
  getBuffer,
  ctx,
  laneGains,
  baseTime,
  fromTime,
  toTime,
  timelineOffset = 0,
}: ScheduleParams): AudioBufferSourceNode[] {
  const sources: AudioBufferSourceNode[] = [];
  const cappedTo = toTime ?? Number.POSITIVE_INFINITY;

  for (const lane of lanes) {
    if (lane.mute) continue;

    const laneGain = laneGains.get(lane.id);
    if (!laneGain) continue;

    const resolvedClips = resolveLaneClips(lane, tracks);

    for (let i = 0; i < resolvedClips.length; i++) {
      const item = resolvedClips[i];
      const clipStart = getClipStartTime(lane, resolvedClips, i);
      const clipEnd = clipStart + item.playbackDuration;
      if (clipEnd <= fromTime || clipStart >= cappedTo) continue;

      const buffer = getBuffer(item.track.id);
      if (!buffer) continue;

      const volume = item.chop.volume * lane.volume;
      const segments =
        lane.mode === "free"
          ? getFreeClipAudibleSegments(i, resolvedClips)
          : [{ start: clipStart, end: clipEnd }];

      for (const segment of segments) {
        const segEnd = Math.min(segment.end, cappedTo);
        if (segEnd <= fromTime || segEnd <= segment.start) continue;

        const source = scheduleClipWallSegment(
          ctx,
          item,
          clipStart,
          segment.start,
          segEnd,
          laneGain,
          volume,
          baseTime,
          fromTime,
          timelineOffset,
          buffer,
        );
        if (source) sources.push(source);
      }
    }
  }

  return sources;
}

const METRONOME_CLICK_SECONDS = 0.04;

function scheduleMetronomeClick(
  ctx: AudioContext,
  masterGain: GainNode,
  when: number,
  accent: boolean,
): OscillatorNode {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = accent ? 1200 : 880;
  gain.gain.setValueAtTime(accent ? 0.22 : 0.12, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + METRONOME_CLICK_SECONDS);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(when);
  osc.stop(when + METRONOME_CLICK_SECONDS);
  return osc;
}

function scheduleMetronomeBeats({
  ctx,
  masterGain,
  settings,
  baseTime,
  fromTime,
  toTime,
  timelineOffset = 0,
}: {
  ctx: AudioContext;
  masterGain: GainNode;
  settings: MusicalTimeSettings;
  baseTime: number;
  fromTime: number;
  toTime: number;
  timelineOffset?: number;
}): OscillatorNode[] {
  if (!settings.metronomeEnabled) return [];
  const step = secondsPerBeat(settings.bpm);
  if (step <= 0) return [];

  const sources: OscillatorNode[] = [];
  let t = Math.ceil(fromTime / step) * step;
  if (fromTime <= 0 && t > 0) t = 0;

  while (t <= toTime + 1e-9) {
    const beatIndex = Math.round(t / step);
    const accent = beatIndex % settings.beatsPerBar === 0;
    const when = baseTime + timelineOffset + (t - fromTime);
    if (when >= ctx.currentTime - 0.01) {
      sources.push(scheduleMetronomeClick(ctx, masterGain, when, accent));
    }
    t += step;
  }
  return sources;
}

function loopPlayheadTime(
  elapsed: number,
  bounds: ArrangementLoopBounds,
  initialStartAt: number,
): number {
  const loopLength = loopRegionLength(bounds);
  if (loopLength <= 0) return bounds.start;

  const firstPassLength = Math.max(0, bounds.end - initialStartAt);
  if (elapsed <= firstPassLength) return initialStartAt + elapsed;
  return bounds.start + ((elapsed - firstPassLength) % loopLength);
}

export function useArrangementPlayer({
  lanes,
  tracks,
  loadedTrackIds,
  loopRegion,
  loopMode,
  loopBeats,
  musicalTime,
  getBuffer,
  getContext,
  getMasterGain,
  resume,
  masterVolume,
}: Params) {
  const laneGainsRef = useRef<Map<string, GainNode>>(new Map());
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const metronomeSourcesRef = useRef<OscillatorNode[]>([]);
  const baseTimeRef = useRef<number | null>(null);
  const durationRef = useRef(0);
  const loopBoundsRef = useRef<ArrangementLoopBounds>({ start: 0, end: 0 });
  const loopInitialStartRef = useRef(0);
  const nextLoopIterationRef = useRef(0);
  const loopMaintainerFrameRef = useRef<number | null>(null);
  const endTimerRef = useRef<number | null>(null);
  const loopRef = useRef(false);
  const lanesRef = useRef(lanes);
  const tracksRef = useRef(tracks);
  const loadedTrackIdsRef = useRef(loadedTrackIds);
  const getBufferRef = useRef(getBuffer);
  const musicalTimeRef = useRef(musicalTime);
  const [isPlaying, setIsPlaying] = useState(false);
  const [seekTime, setSeekTimeState] = useState(0);
  const [loop, setLoop] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  useEffect(() => {
    lanesRef.current = lanes;
    tracksRef.current = tracks;
    loadedTrackIdsRef.current = loadedTrackIds;
    getBufferRef.current = getBuffer;
    musicalTimeRef.current = musicalTime;
  }, [lanes, tracks, loadedTrackIds, getBuffer, musicalTime]);

  const playableTracks = useCallback((): Track[] => {
    return filterLoadedTracks(tracksRef.current, loadedTrackIdsRef.current);
  }, []);

  const bump = useCallback(() => {
    setVersion((n) => n + 1);
  }, []);

  const syncLaneGains = useCallback(() => {
    const ctx = getContext();
    const masterGain = getMasterGain();
    if (!masterGain) return;

    const activeLaneIds = new Set(lanes.map((lane) => lane.id));

    for (const [laneId, gainNode] of laneGainsRef.current) {
      if (!activeLaneIds.has(laneId)) {
        gainNode.disconnect();
        laneGainsRef.current.delete(laneId);
      }
    }

    for (const lane of lanes) {
      let laneGain = laneGainsRef.current.get(lane.id);
      if (!laneGain) {
        laneGain = ctx.createGain();
        laneGain.connect(masterGain);
        laneGainsRef.current.set(lane.id, laneGain);
      }
      laneGain.gain.value = lane.mute ? 0 : lane.volume;
    }
  }, [getContext, getMasterGain, lanes]);

  useEffect(() => {
    syncLaneGains();
  }, [syncLaneGains, masterVolume]);

  const clearEndTimer = useCallback(() => {
    if (endTimerRef.current !== null) {
      window.clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
  }, []);

  const stopLoopMaintainer = useCallback(() => {
    if (loopMaintainerFrameRef.current !== null) {
      window.cancelAnimationFrame(loopMaintainerFrameRef.current);
      loopMaintainerFrameRef.current = null;
    }
  }, []);

  const stopSources = useCallback(() => {
    for (const source of scheduledSourcesRef.current) {
      stopSource(source);
    }
    scheduledSourcesRef.current = [];
    for (const osc of metronomeSourcesRef.current) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }
    metronomeSourcesRef.current = [];
  }, []);

  const scheduleLoopIterations = useCallback(
    (fromIter: number, toIter: number) => {
      const baseTime = baseTimeRef.current;
      if (baseTime === null) return;

      const ctx = getContext();
      const bounds = loopBoundsRef.current;
      const initialStartAt = loopInitialStartRef.current;
      const masterGain = getMasterGain();

      for (let i = fromIter; i < toIter; i++) {
        const { fromTime, toTime } = loopIterationSchedule(
          i,
          bounds,
          initialStartAt,
        );
        const sources = scheduleArrangement({
          lanes: lanesRef.current,
          tracks: filterLoadedTracks(
            tracksRef.current,
            loadedTrackIdsRef.current,
          ),
          getBuffer: getBufferRef.current,
          ctx,
          laneGains: laneGainsRef.current,
          baseTime,
          fromTime,
          toTime,
          timelineOffset: iterationTimelineOffset(i, bounds, initialStartAt),
        });
        scheduledSourcesRef.current.push(...sources);

        if (masterGain) {
          const clicks = scheduleMetronomeBeats({
            ctx,
            masterGain,
            settings: musicalTimeRef.current,
            baseTime,
            fromTime,
            toTime,
            timelineOffset: iterationTimelineOffset(i, bounds, initialStartAt),
          });
          metronomeSourcesRef.current.push(...clicks);
        }
      }
      nextLoopIterationRef.current = toIter;
    },
    [getContext, getMasterGain],
  );

  const startLoopMaintainer = useCallback(() => {
    stopLoopMaintainer();

    const tick = () => {
      if (!loopRef.current || baseTimeRef.current === null) {
        loopMaintainerFrameRef.current = null;
        return;
      }

      const ctx = getContext();
      const bounds = loopBoundsRef.current;
      if (loopRegionLength(bounds) <= 0) {
        loopMaintainerFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      const elapsed = ctx.currentTime - baseTimeRef.current;
      const initialStartAt = loopInitialStartRef.current;
      const firstPassLength = Math.max(0, bounds.end - initialStartAt);
      const loopLength = loopRegionLength(bounds);
      const loopedElapsed = Math.max(0, elapsed - firstPassLength);
      const currentIter =
        elapsed <= firstPassLength
          ? 0
          : 1 + Math.floor(loopedElapsed / loopLength);

      const scheduledEndTime =
        nextLoopIterationRef.current === 0
          ? 0
          : iterationTimelineOffset(
              nextLoopIterationRef.current,
              bounds,
              initialStartAt,
            );

      if (scheduledEndTime - elapsed < LOOP_RESCHEDULE_LEAD_SECONDS) {
        const targetIter = Math.max(
          nextLoopIterationRef.current,
          currentIter + LOOP_ITERATIONS_AHEAD,
        );
        if (targetIter > nextLoopIterationRef.current) {
          scheduleLoopIterations(
            nextLoopIterationRef.current,
            targetIter,
          );
        }
      }

      loopMaintainerFrameRef.current = window.requestAnimationFrame(tick);
    };

    loopMaintainerFrameRef.current = window.requestAnimationFrame(tick);
  }, [getContext, scheduleLoopIterations, stopLoopMaintainer]);

  const stop = useCallback(() => {
    clearEndTimer();
    stopLoopMaintainer();
    stopSources();
    baseTimeRef.current = null;
    nextLoopIterationRef.current = 0;
    setSeekTimeState(0);
    setIsPlaying(false);
    bump();
  }, [bump, clearEndTimer, stopLoopMaintainer, stopSources]);

  const pause = useCallback(() => {
    if (!isPlaying) return;

    clearEndTimer();
    stopLoopMaintainer();
    stopSources();

    const ctx = getContext();
    const baseTime = baseTimeRef.current;
    if (baseTime !== null) {
      const elapsed = ctx.currentTime - baseTime;
      const duration = durationRef.current;
      const bounds = loopBoundsRef.current;
      const pausedAt = loopRef.current
        ? loopPlayheadTime(elapsed, bounds, loopInitialStartRef.current)
        : loopInitialStartRef.current + elapsed;
      setSeekTimeState(Math.min(pausedAt, duration));
    }

    baseTimeRef.current = null;
    nextLoopIterationRef.current = 0;
    setIsPlaying(false);
    bump();
  }, [
    bump,
    clearEndTimer,
    getContext,
    isPlaying,
    stopLoopMaintainer,
    stopSources,
  ]);

  const schedulePlaybackEnd = useCallback(
    (segmentDuration: number) => {
      clearEndTimer();
      endTimerRef.current = window.setTimeout(() => {
        if (loopRef.current) return;
        durationRef.current = computeArrangementDuration(
          lanesRef.current,
          tracksRef.current,
        );
        setSeekTimeState(durationRef.current);
        baseTimeRef.current = null;
        setIsPlaying(false);
        bump();
      }, (segmentDuration + LOOKAHEAD_SECONDS) * 1000 + 50);
    },
    [bump, clearEndTimer],
  );

  const play = useCallback(
    async (fromTime?: number) => {
      stopSources();
      clearEndTimer();
      stopLoopMaintainer();
      nextLoopIterationRef.current = 0;
      await resume();

      const ctx = getContext();
      const masterGain = getMasterGain();
      if (!masterGain) return;

      syncLaneGains();

      const playable = playableTracks();
      const duration = computeArrangementDuration(lanes, playable);
      if (duration <= 0) return;

      const bounds = resolveLoopBounds(loopRegion, duration, {
        loopMode,
        loopBeats,
        bpm: musicalTime.bpm,
        contentBounds: computeArrangementContentBounds(lanes, playable),
      });
      loopBoundsRef.current = bounds;

      let startAt = Math.max(
        0,
        Math.min(fromTime ?? seekTime, duration),
      );
      if (startAt >= duration) {
        startAt = 0;
      }
      if (loopRef.current && startAt >= bounds.end) {
        startAt = bounds.start;
      }

      const baseTime = ctx.currentTime + LOOKAHEAD_SECONDS;
      baseTimeRef.current = baseTime;
      durationRef.current = duration;
      loopInitialStartRef.current = startAt;
      setSeekTimeState(startAt);

      if (loopRef.current) {
        scheduleLoopIterations(0, LOOP_ITERATIONS_AHEAD);
        startLoopMaintainer();
      } else {
        scheduledSourcesRef.current = scheduleArrangement({
          lanes,
          tracks: playable,
          getBuffer,
          ctx,
          laneGains: laneGainsRef.current,
          baseTime,
          fromTime: startAt,
        });
        if (masterGain) {
          const clicks = scheduleMetronomeBeats({
            ctx,
            masterGain,
            settings: musicalTime,
            baseTime,
            fromTime: startAt,
            toTime: duration,
          });
          metronomeSourcesRef.current.push(...clicks);
        }
        schedulePlaybackEnd(duration - startAt);
      }

      if (scheduledSourcesRef.current.length === 0) {
        baseTimeRef.current = null;
        return;
      }

      setIsPlaying(true);
      bump();
    },
    [
      bump,
      clearEndTimer,
      getBuffer,
      getContext,
      getMasterGain,
      lanes,
      resume,
      scheduleLoopIterations,
      schedulePlaybackEnd,
      seekTime,
      startLoopMaintainer,
      stopLoopMaintainer,
      stopSources,
      syncLaneGains,
      playableTracks,
      tracks,
      loopRegion,
      loopMode,
      loopBeats,
      musicalTime,
    ],
  );

  const setSeekTime = useCallback(
    (time: number) => {
      const duration = computeArrangementDuration(lanes, playableTracks());
      const next = Math.max(0, Math.min(time, duration));
      setSeekTimeState(next);
      if (isPlaying) {
        void play(next);
      }
    },
    [isPlaying, lanes, play, playableTracks],
  );

  const getPlayheadTime = useCallback(() => {
    const ctx = getContext();
    const baseTime = baseTimeRef.current;
    if (!isPlaying || baseTime === null) return seekTime;

    const elapsed = ctx.currentTime - baseTime;
    const bounds = loopBoundsRef.current;
    if (loopRef.current) {
      return loopPlayheadTime(
        elapsed,
        bounds,
        loopInitialStartRef.current,
      );
    }
    return loopInitialStartRef.current + elapsed;
  }, [getContext, isPlaying, seekTime]);

  const toggle = useCallback(async () => {
    if (isPlaying) {
      pause();
      return;
    }
    await play();
  }, [isPlaying, pause, play]);

  return {
    isPlaying,
    seekTime,
    loop,
    version,
    play,
    pause,
    toggle,
    stop,
    setSeekTime,
    setLoop,
    getPlayheadTime,
  };
}

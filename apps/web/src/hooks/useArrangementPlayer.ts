import { useCallback, useEffect, useRef, useState } from "react";
import { stopSource } from "../lib/audioUtils";
import {
  computeArrangementDuration,
  getClipStartTime,
  getFreeClipAudibleSegments,
  resolveLaneClips,
  type ResolvedClip,
} from "../lib/arrangement";
import { playSlice } from "../lib/sliceAudioBuffer";
import type { ArrangementLane, Track } from "../lib/types";

const LOOKAHEAD_SECONDS = 0.05;
/** How many loop passes to pre-schedule on the audio clock (gapless). */
const LOOP_ITERATIONS_AHEAD = 3;
/** Re-schedule more loop passes when playhead is within this many seconds of the end. */
const LOOP_RESCHEDULE_LEAD_SECONDS = 8;

function iterationTimelineOffset(
  iterIndex: number,
  duration: number,
  initialStartAt: number,
): number {
  if (iterIndex === 0) return 0;
  return duration - initialStartAt + (iterIndex - 1) * duration;
}

type Params = {
  lanes: ArrangementLane[];
  tracks: Track[];
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
  const bufferStart = item.chop.start + offsetInClip * item.timeStretch;
  const bufferEnd =
    item.chop.start + (wallEnd - clipStart) * item.timeStretch;

  if (bufferEnd <= bufferStart) return null;

  return playSlice(
    ctx,
    buffer,
    bufferStart,
    bufferEnd,
    laneGain,
    volume,
    when,
    item.timeStretch,
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
  timelineOffset = 0,
}: ScheduleParams): AudioBufferSourceNode[] {
  const sources: AudioBufferSourceNode[] = [];

  for (const lane of lanes) {
    if (lane.mute) continue;

    const laneGain = laneGains.get(lane.id);
    if (!laneGain) continue;

    const resolvedClips = resolveLaneClips(lane, tracks);

    for (let i = 0; i < resolvedClips.length; i++) {
      const item = resolvedClips[i];
      const clipStart = getClipStartTime(lane, resolvedClips, i);
      const clipEnd = clipStart + item.playbackDuration;
      if (clipEnd <= fromTime) continue;

      const buffer = getBuffer(item.track.id);
      if (!buffer) continue;

      const volume = item.chop.volume * lane.volume;
      const segments =
        lane.mode === "free"
          ? getFreeClipAudibleSegments(i, resolvedClips)
          : [{ start: clipStart, end: clipEnd }];

      for (const segment of segments) {
        const source = scheduleClipWallSegment(
          ctx,
          item,
          clipStart,
          segment.start,
          segment.end,
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

function loopPlayheadTime(
  elapsed: number,
  duration: number,
  initialStartAt: number,
): number {
  if (duration <= 0) return 0;
  const firstPassLength = duration - initialStartAt;
  if (elapsed <= firstPassLength) return initialStartAt + elapsed;
  return (elapsed - firstPassLength) % duration;
}

export function useArrangementPlayer({
  lanes,
  tracks,
  getBuffer,
  getContext,
  getMasterGain,
  resume,
  masterVolume,
}: Params) {
  const laneGainsRef = useRef<Map<string, GainNode>>(new Map());
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const baseTimeRef = useRef<number | null>(null);
  const durationRef = useRef(0);
  const loopInitialStartRef = useRef(0);
  const nextLoopIterationRef = useRef(0);
  const loopMaintainerFrameRef = useRef<number | null>(null);
  const endTimerRef = useRef<number | null>(null);
  const loopRef = useRef(false);
  const lanesRef = useRef(lanes);
  const tracksRef = useRef(tracks);
  const getBufferRef = useRef(getBuffer);
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
    getBufferRef.current = getBuffer;
  }, [lanes, tracks, getBuffer]);

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
  }, []);

  const scheduleLoopIterations = useCallback(
    (fromIter: number, toIter: number) => {
      const baseTime = baseTimeRef.current;
      if (baseTime === null) return;

      const ctx = getContext();
      const duration = durationRef.current;
      const initialStartAt = loopInitialStartRef.current;

      for (let i = fromIter; i < toIter; i++) {
        const sources = scheduleArrangement({
          lanes: lanesRef.current,
          tracks: tracksRef.current,
          getBuffer: getBufferRef.current,
          ctx,
          laneGains: laneGainsRef.current,
          baseTime,
          fromTime: i === 0 ? initialStartAt : 0,
          timelineOffset: iterationTimelineOffset(i, duration, initialStartAt),
        });
        scheduledSourcesRef.current.push(...sources);
      }
      nextLoopIterationRef.current = toIter;
    },
    [getContext],
  );

  const startLoopMaintainer = useCallback(() => {
    stopLoopMaintainer();

    const tick = () => {
      if (!loopRef.current || baseTimeRef.current === null) {
        loopMaintainerFrameRef.current = null;
        return;
      }

      const ctx = getContext();
      const duration = durationRef.current;
      if (duration <= 0) {
        loopMaintainerFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      const elapsed = ctx.currentTime - baseTimeRef.current;
      const initialStartAt = loopInitialStartRef.current;
      const firstPassLength = duration - initialStartAt;
      const loopedElapsed = Math.max(0, elapsed - firstPassLength);
      const currentIter =
        elapsed <= firstPassLength
          ? 0
          : 1 + Math.floor(loopedElapsed / duration);

      const scheduledEndTime =
        nextLoopIterationRef.current === 0
          ? 0
          : iterationTimelineOffset(
              nextLoopIterationRef.current,
              duration,
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
      const pausedAt = loopRef.current
        ? loopPlayheadTime(elapsed, duration, loopInitialStartRef.current)
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

      const duration = computeArrangementDuration(lanes, tracks);
      if (duration <= 0) return;

      let startAt = Math.max(
        0,
        Math.min(fromTime ?? seekTime, duration),
      );
      if (startAt >= duration) {
        startAt = 0;
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
          tracks,
          getBuffer,
          ctx,
          laneGains: laneGainsRef.current,
          baseTime,
          fromTime: startAt,
        });
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
      tracks,
    ],
  );

  const setSeekTime = useCallback(
    (time: number) => {
      const duration = computeArrangementDuration(lanes, tracks);
      const next = Math.max(0, Math.min(time, duration));
      setSeekTimeState(next);
      if (isPlaying) {
        void play(next);
      }
    },
    [isPlaying, lanes, play, tracks],
  );

  const getPlayheadTime = useCallback(() => {
    const ctx = getContext();
    const baseTime = baseTimeRef.current;
    if (!isPlaying || baseTime === null) return seekTime;

    const elapsed = ctx.currentTime - baseTime;
    const duration = durationRef.current;
    if (loopRef.current) {
      return loopPlayheadTime(
        elapsed,
        duration,
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

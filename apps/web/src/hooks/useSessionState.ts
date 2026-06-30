import { useCallback, useReducer } from "react";
import {
  createArrangementClipId,
  createArrangementLaneId,
  findChop,
  migrateLaneToClamped,
  migrateLaneToFree,
  resolveFreeClipStartTime,
  resolveLaneClips,
  DEFAULT_LANE_ROW_HEIGHT,
  clampLaneRowHeight,
} from "../lib/arrangement";
import { getChopNaturalDuration, getChopPlaybackDuration, normalizeTimeStretch } from "../lib/chopPlayback";
import { assignColorsToChops, type PaletteMode } from "../lib/chopColors";
import type {
  ArrangementLane,
  ArrangementClipStackMode,
  ArrangementLaneMode,
  ArrangementLoopMode,
  ArrangementLoopRegion,
  Chop,
  LoopEdgeSnap,
  MusicalTimeSettings,
  PadMode,
  SessionState,
  Track,
} from "../lib/types";
import { createTrackId } from "../lib/trackIds";
import { DEFAULT_ACCENT_COLOR } from "../lib/transport";
import { DEFAULT_MASTER_EFFECTS, normalizeMasterEffects, type MasterEffects } from "../lib/masterEffects";
import { defaultMusicalTime, normalizeLoopBeats, normalizeLoopEdgeSnap, normalizeLoopMode, normalizeMusicalTime, snapTime } from "../lib/musicalTime";

export function createTrack(
  params: Pick<Track, "sourceType" | "sourceName" | "name"> & {
    sourceUrl?: string;
    chops?: Chop[];
    id?: string;
  },
): Track {
  return {
    id: params.id ?? createTrackId(),
    name: params.name,
    sourceType: params.sourceType,
    sourceName: params.sourceName,
    sourceUrl: params.sourceUrl,
    chops: params.chops ?? [],
  };
}

export function createArrangementLane(name?: string): ArrangementLane {
  const laneNumber =
    name?.match(/\d+/)?.[0] ??
    String(Math.floor(Math.random() * 1000));
  return {
    id: createArrangementLaneId(),
    name: name ?? `Lane ${laneNumber}`,
    clips: [],
    mute: false,
    volume: 1,
    mode: "clamped",
  };
}

function createInitialState(): SessionState {
  return {
    version: 3,
    tracks: [],
    arrangement: {
      lanes: [],
      laneRowHeight: DEFAULT_LANE_ROW_HEIGHT,
      loopMode: normalizeLoopMode(undefined),
      loopBeats: normalizeLoopBeats(undefined),
      loopEdgeSnap: normalizeLoopEdgeSnap(undefined),
      musicalTime: defaultMusicalTime(),
    },
    activeTrackId: null,
    paletteMode: "pastel",
    padMode: "layer",
    volume: 1,
    accentColor: DEFAULT_ACCENT_COLOR,
    masterEffects: DEFAULT_MASTER_EFFECTS,
  };
}

function resolvedMusicalTime(state: SessionState): MusicalTimeSettings {
  return normalizeMusicalTime(state.arrangement.musicalTime);
}

type SessionAction =
  | { type: "restore"; state: SessionState }
  | { type: "reset" }
  | { type: "addTrack"; track: Track }
  | { type: "removeTrack"; trackId: string }
  | { type: "renameTrack"; trackId: string; name: string }
  | { type: "setActiveTrack"; trackId: string | null }
  | { type: "updateChops"; trackId: string; chops: Chop[] }
  | { type: "deleteChop"; trackId: string; chopId: string }
  | { type: "duplicateChop"; trackId: string; chopId: string; newChopId: string }
  | { type: "updateChop"; trackId: string; chopId: string; patch: Partial<Chop> }
  | { type: "bindKey"; trackId: string; chopId: string; key: string }
  | { type: "setPaletteMode"; mode: PaletteMode }
  | { type: "setPadMode"; mode: PadMode }
  | { type: "setVolume"; volume: number }
  | { type: "setAccentColor"; accentColor: string }
  | { type: "setMasterEffects"; masterEffects: MasterEffects }
  | { type: "addLane"; lane: ArrangementLane }
  | { type: "removeLane"; laneId: string }
  | { type: "updateLane"; laneId: string; patch: Partial<ArrangementLane> }
  | {
      type: "addClip";
      laneId: string;
      sourceTrackId: string;
      chopId: string;
      repeat?: number;
    }
  | { type: "removeClip"; laneId: string; clipId: string }
  | { type: "reorderClip"; laneId: string; clipId: string; direction: "left" | "right" }
  | { type: "setLaneMode"; laneId: string; mode: ArrangementLaneMode }
  | { type: "moveClip"; laneId: string; clipId: string; startTime: number }
  | {
      type: "setClipStackMode";
      laneId: string;
      clipId: string;
      stackMode: ArrangementClipStackMode;
    }
  | {
      type: "addClipAt";
      laneId: string;
      sourceTrackId: string;
      chopId: string;
      startTime: number;
      repeat?: number;
    }
  | { type: "setLaneMute"; laneId: string; mute: boolean }
  | { type: "setLaneVolume"; laneId: string; volume: number }
  | { type: "setLaneRowHeight"; laneRowHeight: number }
  | { type: "setLoopRegion"; loopRegion: ArrangementLoopRegion | undefined }
  | { type: "setLoopMode"; loopMode: ArrangementLoopMode }
  | { type: "setLoopBeats"; loopBeats: number }
  | { type: "setLoopEdgeSnap"; loopEdgeSnap: LoopEdgeSnap }
  | { type: "setMusicalTime"; patch: Partial<MusicalTimeSettings> };

function laneBlockerSegments(
  lane: ArrangementLane,
  tracks: Track[],
  excludeClipId?: string,
) {
  return resolveLaneClips(lane, tracks)
    .filter((item) => item.clip.id !== excludeClipId)
    .map((item) => ({
      start: item.clip.startTime ?? 0,
      end: (item.clip.startTime ?? 0) + item.playbackDuration,
    }));
}

function createNewArrangementClip(
  sourceTrackId: string,
  chopId: string,
  startTime: number,
): ArrangementLane["clips"][number] {
  return {
    id: createArrangementClipId(),
    sourceTrackId,
    chopId,
    startTime,
    stackMode: "overflow",
  };
}

function updateLane(
  state: SessionState,
  laneId: string,
  updater: (lane: ArrangementLane) => ArrangementLane,
): SessionState {
  return {
    ...state,
    arrangement: {
      ...state.arrangement,
      lanes: state.arrangement.lanes.map((lane) =>
        lane.id === laneId ? updater(lane) : lane,
      ),
    },
  };
}

function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case "restore":
      return action.state;
    case "reset":
      return createInitialState();
    case "addTrack":
      return {
        ...state,
        tracks: [...state.tracks, action.track],
        activeTrackId: action.track.id,
      };
    case "removeTrack": {
      const tracks = state.tracks.filter((t) => t.id !== action.trackId);
      let activeTrackId = state.activeTrackId;
      if (activeTrackId === action.trackId) {
        activeTrackId = tracks[0]?.id ?? null;
      }
      return {
        ...state,
        tracks,
        activeTrackId,
        arrangement: {
          ...state.arrangement,
          lanes: state.arrangement.lanes.map((lane) => ({
            ...lane,
            clips: lane.clips.filter(
              (clip) => clip.sourceTrackId !== action.trackId,
            ),
          })),
        },
      };
    }
    case "renameTrack":
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === action.trackId ? { ...t, name: action.name } : t,
        ),
      };
    case "setActiveTrack":
      return { ...state, activeTrackId: action.trackId };
    case "updateChops":
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === action.trackId ? { ...t, chops: action.chops } : t,
        ),
        arrangement: {
          ...state.arrangement,
          lanes: state.arrangement.lanes.map((lane) => ({
            ...lane,
            clips: lane.clips.filter((clip) => {
              if (clip.sourceTrackId !== action.trackId) return true;
              return action.chops.some((chop) => chop.id === clip.chopId);
            }),
          })),
        },
      };
    case "deleteChop":
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id !== action.trackId
            ? t
            : { ...t, chops: t.chops.filter((c) => c.id !== action.chopId) },
        ),
        arrangement: {
          ...state.arrangement,
          lanes: state.arrangement.lanes.map((lane) => ({
            ...lane,
            clips: lane.clips.filter(
              (clip) =>
                !(
                  clip.sourceTrackId === action.trackId &&
                  clip.chopId === action.chopId
                ),
            ),
          })),
        },
      };
    case "duplicateChop": {
      const track = state.tracks.find((t) => t.id === action.trackId);
      if (!track) return state;
      const chopIndex = track.chops.findIndex((c) => c.id === action.chopId);
      if (chopIndex === -1) return state;
      const source = track.chops[chopIndex];
      const trimmedName = source.name?.trim();
      const duplicate: Chop = {
        id: action.newChopId,
        start: source.start,
        end: source.end,
        key: null,
        name: trimmedName ? `${trimmedName} copy` : undefined,
        color: source.color,
        volume: source.volume,
        timeStretch: source.timeStretch,
        reverse: source.reverse,
        effects: normalizeMasterEffects(source.effects),
      };
      const chops = [
        ...track.chops.slice(0, chopIndex + 1),
        duplicate,
        ...track.chops.slice(chopIndex + 1),
      ];
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === action.trackId ? { ...t, chops } : t,
        ),
      };
    }
    case "updateChop":
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id !== action.trackId
            ? t
            : {
                ...t,
                chops: t.chops.map((c) =>
                  c.id === action.chopId ? { ...c, ...action.patch } : c,
                ),
              },
        ),
      };
    case "bindKey": {
      const lower = action.key.toLowerCase();
      return {
        ...state,
        tracks: state.tracks.map((t) => {
          if (t.id !== action.trackId) return t;
          return {
            ...t,
            chops: t.chops.map((c) => {
              if (c.id === action.chopId) return { ...c, key: lower };
              if (c.key?.toLowerCase() === lower) return { ...c, key: null };
              return c;
            }),
          };
        }),
      };
    }
    case "setPaletteMode":
      return {
        ...state,
        paletteMode: action.mode,
        tracks: state.tracks.map((t) => ({
          ...t,
          chops: assignColorsToChops(t.chops, action.mode),
        })),
      };
    case "setPadMode":
      return { ...state, padMode: action.mode };
    case "setVolume":
      return { ...state, volume: action.volume };
    case "setAccentColor":
      return { ...state, accentColor: action.accentColor };
    case "setMasterEffects":
      return { ...state, masterEffects: action.masterEffects };
    case "addLane":
      return {
        ...state,
        arrangement: {
          ...state.arrangement,
          lanes: [...state.arrangement.lanes, action.lane],
        },
      };
    case "removeLane":
      return {
        ...state,
        arrangement: {
          ...state.arrangement,
          lanes: state.arrangement.lanes.filter(
            (lane) => lane.id !== action.laneId,
          ),
        },
      };
    case "updateLane":
      return updateLane(state, action.laneId, (lane) => ({
        ...lane,
        ...action.patch,
      }));
    case "addClip": {
      const repeat = Math.max(1, Math.floor(action.repeat ?? 1));
      const newClips = Array.from({ length: repeat }, () =>
        createNewArrangementClip(
          action.sourceTrackId,
          action.chopId,
          0,
        ),
      );
      return updateLane(state, action.laneId, (lane) => ({
        ...lane,
        clips: [...lane.clips, ...newClips],
      }));
    }
    case "addClipAt": {
      const repeat = Math.max(1, Math.floor(action.repeat ?? 1));
      const match = findChop(state.tracks, action.sourceTrackId, action.chopId);
      if (!match) return state;
      const musicalTime = resolvedMusicalTime(state);
      const naturalDuration = getChopNaturalDuration(match.chop);
      const playbackDuration = getChopPlaybackDuration(
        naturalDuration,
        normalizeTimeStretch(match.chop.timeStretch),
      );
      return updateLane(state, action.laneId, (lane) => {
        const newClips = [];
        let proposedStart = snapTime(Math.max(0, action.startTime), musicalTime);
        for (let i = 0; i < repeat; i++) {
          const blockers = [
            ...laneBlockerSegments(lane, state.tracks),
            ...newClips.map((clip) => ({
              start: clip.startTime,
              end: clip.startTime + playbackDuration,
            })),
          ];
          const startTime = resolveFreeClipStartTime(
            proposedStart,
            playbackDuration,
            "overflow",
            blockers,
          );
          newClips.push(
            createNewArrangementClip(
              action.sourceTrackId,
              action.chopId,
              startTime,
            ),
          );
          proposedStart = startTime + playbackDuration;
        }
        return { ...lane, clips: [...lane.clips, ...newClips] };
      });
    }
    case "removeClip":
      return updateLane(state, action.laneId, (lane) => ({
        ...lane,
        clips: lane.clips.filter((clip) => clip.id !== action.clipId),
      }));
    case "reorderClip":
      return updateLane(state, action.laneId, (lane) => {
        if (lane.mode !== "clamped") return lane;
        const index = lane.clips.findIndex((clip) => clip.id === action.clipId);
        if (index === -1) return lane;
        const targetIndex =
          action.direction === "left" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= lane.clips.length) return lane;
        const clips = [...lane.clips];
        const [moved] = clips.splice(index, 1);
        clips.splice(targetIndex, 0, moved);
        return { ...lane, clips };
      });
    case "setLaneMode":
      return updateLane(state, action.laneId, (lane) => {
        if (lane.mode === action.mode) return lane;
        if (action.mode === "free") {
          return migrateLaneToFree(lane, state.tracks);
        }
        return migrateLaneToClamped(lane);
      });
    case "moveClip":
      return updateLane(state, action.laneId, (lane) => {
        if (lane.mode !== "free") return lane;
        const resolved = resolveLaneClips(lane, state.tracks);
        const item = resolved.find((r) => r.clip.id === action.clipId);
        if (!item) return lane;
        const blockers = laneBlockerSegments(lane, state.tracks, action.clipId);
        const musicalTime = resolvedMusicalTime(state);
        const startTime = resolveFreeClipStartTime(
          snapTime(action.startTime, musicalTime),
          item.playbackDuration,
          item.clip.stackMode ?? "overflow",
          blockers,
        );
        return {
          ...lane,
          clips: lane.clips.map((clip) =>
            clip.id === action.clipId ? { ...clip, startTime } : clip,
          ),
        };
      });
    case "setClipStackMode":
      return updateLane(state, action.laneId, (lane) => {
        if (lane.mode !== "free") return lane;
        const resolved = resolveLaneClips(lane, state.tracks);
        const item = resolved.find((r) => r.clip.id === action.clipId);
        if (!item) return lane;
        let startTime = item.clip.startTime ?? 0;
        if (action.stackMode === "clamp") {
          const blockers = laneBlockerSegments(lane, state.tracks, action.clipId);
          startTime = resolveFreeClipStartTime(
            startTime,
            item.playbackDuration,
            "clamp",
            blockers,
          );
        }
        return {
          ...lane,
          clips: lane.clips.map((clip) =>
            clip.id === action.clipId
              ? { ...clip, stackMode: action.stackMode, startTime }
              : clip,
          ),
        };
      });
    case "setLaneMute":
      return updateLane(state, action.laneId, (lane) => ({
        ...lane,
        mute: action.mute,
      }));
    case "setLaneVolume":
      return updateLane(state, action.laneId, (lane) => ({
        ...lane,
        volume: action.volume,
      }));
    case "setLaneRowHeight":
      return {
        ...state,
        arrangement: {
          ...state.arrangement,
          laneRowHeight: clampLaneRowHeight(action.laneRowHeight),
        },
      };
    case "setLoopRegion":
      return {
        ...state,
        arrangement: {
          ...state.arrangement,
          loopRegion: action.loopRegion,
          ...(action.loopRegion ? { loopMode: "region" as const } : {}),
        },
      };
    case "setLoopMode":
      return {
        ...state,
        arrangement: {
          ...state.arrangement,
          loopMode: normalizeLoopMode(action.loopMode),
        },
      };
    case "setLoopBeats":
      return {
        ...state,
        arrangement: {
          ...state.arrangement,
          loopBeats: normalizeLoopBeats(action.loopBeats),
          loopMode: "beats",
        },
      };
    case "setLoopEdgeSnap":
      return {
        ...state,
        arrangement: {
          ...state.arrangement,
          loopEdgeSnap: normalizeLoopEdgeSnap(action.loopEdgeSnap),
        },
      };
    case "setMusicalTime":
      return {
        ...state,
        arrangement: {
          ...state.arrangement,
          musicalTime: normalizeMusicalTime({
            ...resolvedMusicalTime(state),
            ...action.patch,
          }),
        },
      };
    default:
      return state;
  }
}

export function useSessionState() {
  const [session, dispatch] = useReducer(sessionReducer, undefined, createInitialState);

  const restoreSession = useCallback((state: SessionState) => {
    dispatch({ type: "restore", state });
  }, []);

  const resetSession = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  const addTrack = useCallback((track: Track) => {
    dispatch({ type: "addTrack", track });
    return track.id;
  }, []);

  const removeTrack = useCallback((trackId: string) => {
    dispatch({ type: "removeTrack", trackId });
  }, []);

  const renameTrack = useCallback((trackId: string, name: string) => {
    dispatch({ type: "renameTrack", trackId, name });
  }, []);

  const setActiveTrack = useCallback((trackId: string | null) => {
    dispatch({ type: "setActiveTrack", trackId });
  }, []);

  const updateChops = useCallback((trackId: string, chops: Chop[]) => {
    dispatch({ type: "updateChops", trackId, chops });
  }, []);

  const deleteChop = useCallback((trackId: string, chopId: string) => {
    dispatch({ type: "deleteChop", trackId, chopId });
  }, []);

  const duplicateChop = useCallback((trackId: string, chopId: string) => {
    const newChopId = crypto.randomUUID();
    dispatch({ type: "duplicateChop", trackId, chopId, newChopId });
    return newChopId;
  }, []);

  const updateChop = useCallback(
    (trackId: string, chopId: string, patch: Partial<Chop>) => {
      const normalized = { ...patch };
      if (typeof normalized.volume === "number") {
        normalized.volume = Math.max(0, Math.min(1, normalized.volume));
      }
      if (typeof normalized.timeStretch === "number") {
        normalized.timeStretch = normalizeTimeStretch(normalized.timeStretch);
      }
      if (typeof normalized.name === "string") {
        const trimmed = normalized.name.trim();
        normalized.name = trimmed || undefined;
      }
      if (normalized.effects !== undefined) {
        normalized.effects = normalizeMasterEffects(normalized.effects);
      }
      dispatch({ type: "updateChop", trackId, chopId, patch: normalized });
    },
    [],
  );

  const bindKey = useCallback(
    (trackId: string, chopId: string, key: string) => {
      dispatch({ type: "bindKey", trackId, chopId, key });
    },
    [],
  );

  const setPaletteMode = useCallback((mode: PaletteMode) => {
    dispatch({ type: "setPaletteMode", mode });
  }, []);

  const setPadMode = useCallback((mode: PadMode) => {
    dispatch({ type: "setPadMode", mode });
  }, []);

  const setVolume = useCallback((volume: number) => {
    dispatch({ type: "setVolume", volume });
  }, []);

  const setAccentColor = useCallback((accentColor: string) => {
    dispatch({ type: "setAccentColor", accentColor });
  }, []);

  const setMasterEffects = useCallback((masterEffects: MasterEffects) => {
    dispatch({ type: "setMasterEffects", masterEffects });
  }, []);

  const addLane = useCallback((lane?: ArrangementLane) => {
    const nextLane = lane ?? createArrangementLane(`Lane ${Date.now()}`);
    dispatch({ type: "addLane", lane: nextLane });
    return nextLane.id;
  }, []);

  const removeLane = useCallback((laneId: string) => {
    dispatch({ type: "removeLane", laneId });
  }, []);

  const updateLaneMeta = useCallback(
    (laneId: string, patch: Partial<ArrangementLane>) => {
      dispatch({ type: "updateLane", laneId, patch });
    },
    [],
  );

  const addClip = useCallback(
    (
      laneId: string,
      sourceTrackId: string,
      chopId: string,
      repeat = 1,
    ) => {
      dispatch({
        type: "addClip",
        laneId,
        sourceTrackId,
        chopId,
        repeat,
      });
    },
    [],
  );

  const removeClip = useCallback((laneId: string, clipId: string) => {
    dispatch({ type: "removeClip", laneId, clipId });
  }, []);

  const reorderClip = useCallback(
    (laneId: string, clipId: string, direction: "left" | "right") => {
      dispatch({ type: "reorderClip", laneId, clipId, direction });
    },
    [],
  );

  const setLaneMode = useCallback(
    (laneId: string, mode: ArrangementLaneMode) => {
      dispatch({ type: "setLaneMode", laneId, mode });
    },
    [],
  );

  const moveClip = useCallback(
    (laneId: string, clipId: string, startTime: number) => {
      dispatch({ type: "moveClip", laneId, clipId, startTime });
    },
    [],
  );

  const setClipStackMode = useCallback(
    (
      laneId: string,
      clipId: string,
      stackMode: ArrangementClipStackMode,
    ) => {
      dispatch({ type: "setClipStackMode", laneId, clipId, stackMode });
    },
    [],
  );

  const addClipAt = useCallback(
    (
      laneId: string,
      sourceTrackId: string,
      chopId: string,
      startTime: number,
      repeat = 1,
    ) => {
      dispatch({
        type: "addClipAt",
        laneId,
        sourceTrackId,
        chopId,
        startTime,
        repeat,
      });
    },
    [],
  );

  const setLaneMute = useCallback((laneId: string, mute: boolean) => {
    dispatch({ type: "setLaneMute", laneId, mute });
  }, []);

  const setLaneVolume = useCallback((laneId: string, volume: number) => {
    dispatch({ type: "setLaneVolume", laneId, volume });
  }, []);

  const setLaneRowHeight = useCallback((laneRowHeight: number) => {
    dispatch({ type: "setLaneRowHeight", laneRowHeight });
  }, []);

  const setLoopRegion = useCallback((loopRegion: ArrangementLoopRegion | undefined) => {
    dispatch({ type: "setLoopRegion", loopRegion });
  }, []);

  const setLoopBeats = useCallback((loopBeats: number) => {
    dispatch({ type: "setLoopBeats", loopBeats });
  }, []);

  const setLoopMode = useCallback((loopMode: ArrangementLoopMode) => {
    dispatch({ type: "setLoopMode", loopMode });
  }, []);

  const setLoopEdgeSnap = useCallback((loopEdgeSnap: LoopEdgeSnap) => {
    dispatch({ type: "setLoopEdgeSnap", loopEdgeSnap });
  }, []);

  const setMusicalTime = useCallback((patch: Partial<MusicalTimeSettings>) => {
    dispatch({ type: "setMusicalTime", patch });
  }, []);

  const activeTrack =
    session.tracks.find((t) => t.id === session.activeTrackId) ?? null;

  return {
    session,
    activeTrack,
    restoreSession,
    resetSession,
    addTrack,
    removeTrack,
    renameTrack,
    setActiveTrack,
    updateChops,
    deleteChop,
    duplicateChop,
    updateChop,
    bindKey,
    setPaletteMode,
    setPadMode,
    setVolume,
    setAccentColor,
    setMasterEffects,
    addLane,
    removeLane,
    updateLaneMeta,
    addClip,
    removeClip,
    reorderClip,
    setLaneMode,
    moveClip,
    addClipAt,
    setClipStackMode,
    setLaneMute,
    setLaneVolume,
    setLaneRowHeight,
    setLoopRegion,
    setLoopMode,
    setLoopBeats,
    setLoopEdgeSnap,
    setMusicalTime,
  };
}

import { useCallback, useReducer } from "react";
import { assignColorsToChops, type PaletteMode } from "../lib/chopColors";
import type {
  Chop,
  PadMode,
  SessionState,
  Track,
} from "../lib/types";
import { createTrackId } from "../lib/trackIds";

export { createTrackId };

export function createTrack(
  params: Pick<Track, "sourceType" | "sourceName"> & {
    sourceUrl?: string;
    chops?: Chop[];
    id?: string;
  },
): Track {
  return {
    id: params.id ?? createTrackId(),
    sourceType: params.sourceType,
    sourceName: params.sourceName,
    sourceUrl: params.sourceUrl,
    chops: params.chops ?? [],
  };
}

function createInitialState(): SessionState {
  return {
    version: 2,
    tracks: [],
    activeTrackId: null,
    paletteMode: "pastel",
    padMode: "layer",
    volume: 1,
  };
}

type SessionAction =
  | { type: "restore"; state: SessionState }
  | { type: "addTrack"; track: Track }
  | { type: "removeTrack"; trackId: string }
  | { type: "setActiveTrack"; trackId: string | null }
  | { type: "updateChops"; trackId: string; chops: Chop[] }
  | { type: "bindKey"; trackId: string; chopId: string; key: string }
  | { type: "setPaletteMode"; mode: PaletteMode }
  | { type: "setPadMode"; mode: PadMode }
  | { type: "setVolume"; volume: number };

function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case "restore":
      return action.state;
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
      return { ...state, tracks, activeTrackId };
    }
    case "setActiveTrack":
      return { ...state, activeTrackId: action.trackId };
    case "updateChops":
      return {
        ...state,
        tracks: state.tracks.map((t) =>
          t.id === action.trackId ? { ...t, chops: action.chops } : t,
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
    default:
      return state;
  }
}

export function useSessionState() {
  const [session, dispatch] = useReducer(sessionReducer, undefined, createInitialState);

  const restoreSession = useCallback((state: SessionState) => {
    dispatch({ type: "restore", state });
  }, []);

  const addTrack = useCallback((track: Track) => {
    dispatch({ type: "addTrack", track });
    return track.id;
  }, []);

  const removeTrack = useCallback((trackId: string) => {
    dispatch({ type: "removeTrack", trackId });
  }, []);

  const setActiveTrack = useCallback((trackId: string | null) => {
    dispatch({ type: "setActiveTrack", trackId });
  }, []);

  const updateChops = useCallback((trackId: string, chops: Chop[]) => {
    dispatch({ type: "updateChops", trackId, chops });
  }, []);

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

  const activeTrack =
    session.tracks.find((t) => t.id === session.activeTrackId) ?? null;

  return {
    session,
    activeTrack,
    restoreSession,
    addTrack,
    removeTrack,
    setActiveTrack,
    updateChops,
    bindKey,
    setPaletteMode,
    setPadMode,
    setVolume,
  };
}

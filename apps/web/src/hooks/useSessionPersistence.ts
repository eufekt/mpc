import { useCallback, useEffect, useMemo, useRef } from "react";
import { DEFAULT_LANE_ROW_HEIGHT } from "../lib/arrangement";
import { DEFAULT_MASTER_EFFECTS } from "../lib/masterEffects";
import { loadProjectsIndex, touchProject } from "../lib/projectPersistence";
import {
  clearProject,
  loadLegacyAudioBlob,
  loadSessionState,
  loadTrackBlob,
  migrateLegacyAudioForProject,
  migrateLegacyBlobToTrack,
  saveSessionState,
  saveTrackAudio,
} from "../lib/sessionPersistence";
import { DEFAULT_ACCENT_COLOR } from "../lib/transport";
import type { SessionState } from "../lib/types";
import type { useAudioEngine } from "./useAudioEngine";
import type { useSessionState } from "./useSessionState";

type Engine = ReturnType<typeof useAudioEngine>;
type SessionApi = ReturnType<typeof useSessionState>;

type Params = {
  projectId: string;
  engine: Engine;
  session: SessionState;
  restoreSession: SessionApi["restoreSession"];
  setVolume: SessionApi["setVolume"];
  setMasterEffects: SessionApi["setMasterEffects"];
  onStatus: (message: string | null) => void;
  onProjectsIndexChange?: () => void;
};

const LEGACY_AUDIO_MIGRATED_KEY = "mpc-legacy-audio-migrated";

async function maybeMigrateLegacyAudio(
  projectId: string,
  trackIds: string[],
): Promise<void> {
  if (localStorage.getItem(LEGACY_AUDIO_MIGRATED_KEY)) return;
  await migrateLegacyAudioForProject(projectId, trackIds);
  localStorage.setItem(LEGACY_AUDIO_MIGRATED_KEY, "1");
}

async function loadCachedTrackAudio(
  projectId: string,
  track: SessionState["tracks"][number],
  engine: Engine,
  isFirstTrack: boolean,
): Promise<boolean> {
  let blob = await loadTrackBlob(projectId, track.id);

  if (!blob && isFirstTrack) {
    const legacyBlob = await loadLegacyAudioBlob();
    if (legacyBlob) {
      blob = legacyBlob;
      await migrateLegacyBlobToTrack(projectId, track.id);
    }
  }

  if (!blob) return false;

  const arrayBuffer = await blob.arrayBuffer();
  await engine.loadTrackAudio(track.id, arrayBuffer, track.sourceName);
  return true;
}

function emptySession(): SessionState {
  return {
    version: 3,
    tracks: [],
    arrangement: { lanes: [], laneRowHeight: DEFAULT_LANE_ROW_HEIGHT },
    activeTrackId: null,
    paletteMode: "pastel",
    padMode: "layer",
    volume: 1,
    accentColor: DEFAULT_ACCENT_COLOR,
    masterEffects: DEFAULT_MASTER_EFFECTS,
  };
}

export function useSessionPersistence({
  projectId,
  engine,
  session,
  restoreSession,
  setVolume,
  setMasterEffects,
  onStatus,
  onProjectsIndexChange,
}: Params) {
  const isRestoringRef = useRef(false);
  const suppressRestoreRef = useRef(false);
  const restoreAbortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(session);
  const engineRef = useRef(engine);
  const onStatusRef = useRef(onStatus);
  sessionRef.current = session;
  engineRef.current = engine;
  onStatusRef.current = onStatus;

  const cancelPendingRestore = useCallback(() => {
    suppressRestoreRef.current = true;
    restoreAbortRef.current?.abort();
    isRestoringRef.current = false;
  }, []);

  const clearPersistedSession = useCallback(async () => {
    cancelPendingRestore();
    await clearProject(projectId);
    saveSessionState(projectId, emptySession());
    onProjectsIndexChange?.();
  }, [cancelPendingRestore, onProjectsIndexChange, projectId]);

  const flushSessionSave = useCallback(() => {
    saveSessionState(projectId, sessionRef.current);
    touchProject(loadProjectsIndex(), projectId);
    onProjectsIndexChange?.();
  }, [onProjectsIndexChange, projectId]);

  useEffect(() => {
    if (!projectId) return;

    suppressRestoreRef.current = false;
    const abort = new AbortController();
    restoreAbortRef.current = abort;
    let statusTimer: number | undefined;
    const engine = engineRef.current;

    const clearStatusLater = () => {
      statusTimer = window.setTimeout(() => {
        if (!abort.signal.aborted) onStatusRef.current(null);
      }, 2000);
    };

    const unloadRestoredTracks = (saved: SessionState) => {
      for (const track of saved.tracks) {
        if (engine.hasTrack(track.id)) {
          engine.unloadTrack(track.id);
        }
      }
    };

    (async () => {
      if (suppressRestoreRef.current) return;

      const saved = loadSessionState(projectId);
      if (!saved) {
        restoreSession(emptySession());
        return;
      }

      restoreSession(saved);
      setVolume(saved.volume);
      engine.setVolume(saved.volume);
      setMasterEffects(saved.masterEffects);
      engine.setMasterEffects(saved.masterEffects);

      if (saved.tracks.length === 0) {
        return;
      }

      isRestoringRef.current = true;
      onStatusRef.current("restoring project...");

      try {
        if (abort.signal.aborted || suppressRestoreRef.current) return;

        await maybeMigrateLegacyAudio(
          projectId,
          saved.tracks.map((track) => track.id),
        );

        await engine.resume();
        if (abort.signal.aborted || suppressRestoreRef.current) return;

        const loadResults = await Promise.all(
          saved.tracks.map((track, index) => {
            if (abort.signal.aborted || suppressRestoreRef.current) {
              return Promise.resolve(false);
            }
            return loadCachedTrackAudio(
              projectId,
              track,
              engine,
              index === 0,
            );
          }),
        );

        if (abort.signal.aborted || suppressRestoreRef.current) return;

        const anyLoaded =
          saved.tracks.length === 0 || loadResults.some(Boolean);
        if (anyLoaded) {
          onStatusRef.current("project restored");
        } else if (saved.tracks.some((track) => track.sourceType === "youtube")) {
          onStatusRef.current(
            "audio missing — reload youtube tracks via LOAD TRACK",
          );
        } else {
          onStatusRef.current(
            "audio missing — reload your file or url",
          );
        }
        clearStatusLater();
      } catch (e) {
        if (abort.signal.aborted || suppressRestoreRef.current) return;
        const message = e instanceof Error ? e.message : "unknown error";
        onStatusRef.current(`restore failed: ${message}`);
        clearStatusLater();
      } finally {
        isRestoringRef.current = false;
        if (abort.signal.aborted || suppressRestoreRef.current) {
          unloadRestoredTracks(saved);
        }
      }
    })();

    return () => {
      abort.abort();
      restoreAbortRef.current = null;
      if (statusTimer !== undefined) {
        window.clearTimeout(statusTimer);
      }
    };
    // Only re-restore when switching projects — not on every engine render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const sessionSaveKey = useMemo(
    () =>
      JSON.stringify({
        version: session.version,
        tracks: session.tracks,
        arrangement: session.arrangement,
        paletteMode: session.paletteMode,
        padMode: session.padMode,
        volume: session.volume,
        accentColor: session.accentColor,
        masterEffects: session.masterEffects,
        activeTrackId: session.activeTrackId,
      }),
    [
      session.version,
      session.tracks,
      session.arrangement,
      session.paletteMode,
      session.padMode,
      session.volume,
      session.accentColor,
      session.masterEffects,
      session.activeTrackId,
    ],
  );

  useEffect(() => {
    if (isRestoringRef.current) return;

    const timer = window.setTimeout(() => {
      saveSessionState(projectId, sessionRef.current);
      touchProject(loadProjectsIndex(), projectId);
      onProjectsIndexChange?.();
    }, 300);

    return () => window.clearTimeout(timer);
  }, [sessionSaveKey, engine.loadedTrackIds, onProjectsIndexChange, projectId]);

  const persistTrackAudio = async (trackId: string, blob: Blob) => {
    await saveTrackAudio(projectId, trackId, blob);
    saveSessionState(projectId, sessionRef.current);
    touchProject(loadProjectsIndex(), projectId);
    onProjectsIndexChange?.();
  };

  return {
    persistTrackAudio,
    cancelPendingRestore,
    clearPersistedSession,
    flushSessionSave,
  };
}

import { useCallback, useEffect, useMemo, useRef } from "react";
import { DEFAULT_LANE_ROW_HEIGHT } from "../lib/arrangement";
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
  onStatus: (message: string | null) => void;
  onProjectsIndexChange?: () => void;
};

export function useSessionPersistence({
  projectId,
  engine,
  session,
  restoreSession,
  setVolume,
  onStatus,
  onProjectsIndexChange,
}: Params) {
  const isRestoringRef = useRef(false);
  const suppressRestoreRef = useRef(false);
  const restoreAbortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const cancelPendingRestore = useCallback(() => {
    suppressRestoreRef.current = true;
    restoreAbortRef.current?.abort();
    isRestoringRef.current = false;
  }, []);

  const clearPersistedSession = useCallback(async () => {
    cancelPendingRestore();
    await clearProject(projectId);
    onProjectsIndexChange?.();
  }, [cancelPendingRestore, onProjectsIndexChange, projectId]);

  const flushSessionSave = useCallback(() => {
    saveSessionState(projectId, sessionRef.current);
    touchProject(loadProjectsIndex(), projectId);
    onProjectsIndexChange?.();
  }, [onProjectsIndexChange, projectId]);

  useEffect(() => {
    suppressRestoreRef.current = false;
    const abort = new AbortController();
    restoreAbortRef.current = abort;
    let statusTimer: number | undefined;

    const clearStatusLater = () => {
      statusTimer = window.setTimeout(() => {
        if (!abort.signal.aborted) onStatus(null);
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
        restoreSession({
          version: 3,
          tracks: [],
          arrangement: { lanes: [], laneRowHeight: DEFAULT_LANE_ROW_HEIGHT },
          activeTrackId: null,
          paletteMode: "pastel",
          padMode: "layer",
          volume: 1,
          accentColor: DEFAULT_ACCENT_COLOR,
        });
        return;
      }

      isRestoringRef.current = true;
      onStatus("restoring project...");

      try {
        await migrateLegacyAudioForProject(
          projectId,
          saved.tracks.map((track) => track.id),
        );

        await engine.resume();
        if (abort.signal.aborted || suppressRestoreRef.current) return;

        const legacyBlob = await loadLegacyAudioBlob();
        const migratedFromV1 = legacyBlob !== null;

        for (const track of saved.tracks) {
          if (abort.signal.aborted || suppressRestoreRef.current) return;

          let blob = await loadTrackBlob(projectId, track.id);

          if (!blob && migratedFromV1 && track.id === saved.tracks[0]?.id) {
            blob = legacyBlob;
            await migrateLegacyBlobToTrack(projectId, track.id);
          }

          if (
            !blob &&
            track.sourceType === "youtube" &&
            track.sourceUrl
          ) {
            blob = await engine.loadYouTubeUrl(track.id, track.sourceUrl);
            if (abort.signal.aborted || suppressRestoreRef.current) return;
            await saveTrackAudio(projectId, track.id, blob);
            continue;
          }

          if (blob) {
            const arrayBuffer = await blob.arrayBuffer();
            if (abort.signal.aborted || suppressRestoreRef.current) return;
            await engine.loadTrackAudio(
              track.id,
              arrayBuffer,
              track.sourceName,
            );
          }
        }

        if (abort.signal.aborted || suppressRestoreRef.current) return;

        if (saved.tracks.length > 0) {
          const anyLoaded = saved.tracks.some((t) => engine.hasTrack(t.id));
          if (!anyLoaded) {
            onStatus("restore failed: audio missing — reload your file or url");
            clearStatusLater();
            return;
          }
        }

        restoreSession(saved);
        setVolume(saved.volume);
        engine.setVolume(saved.volume);
        onStatus("project restored");
        clearStatusLater();
      } catch (e) {
        if (abort.signal.aborted || suppressRestoreRef.current) return;
        const message = e instanceof Error ? e.message : "unknown error";
        onStatus(`restore failed: ${message}`);
        clearStatusLater();
      } finally {
        isRestoringRef.current = false;
        if (abort.signal.aborted || suppressRestoreRef.current) {
          if (saved) unloadRestoredTracks(saved);
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
  }, [engine, onStatus, projectId, restoreSession, setVolume]);

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
      session.activeTrackId,
    ],
  );

  useEffect(() => {
    if (isRestoringRef.current) return;

    const hasLoadedTracks = session.tracks.some((t) => engine.hasTrack(t.id));
    if (session.tracks.length > 0 && !hasLoadedTracks) return;

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

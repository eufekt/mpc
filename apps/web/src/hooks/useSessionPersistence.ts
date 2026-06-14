import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  clearSession,
  loadLegacyAudioBlob,
  loadSessionState,
  loadTrackBlob,
  migrateLegacyBlobToTrack,
  saveSessionState,
  saveTrackAudio,
} from "../lib/sessionPersistence";
import type { SessionState } from "../lib/types";
import type { useAudioEngine } from "./useAudioEngine";
import type { useSessionState } from "./useSessionState";

type Engine = ReturnType<typeof useAudioEngine>;
type SessionApi = ReturnType<typeof useSessionState>;

type Params = {
  engine: Engine;
  session: SessionState;
  restoreSession: SessionApi["restoreSession"];
  setVolume: SessionApi["setVolume"];
  onStatus: (message: string | null) => void;
};

export function useSessionPersistence({
  engine,
  session,
  restoreSession,
  setVolume,
  onStatus,
}: Params) {
  const isRestoringRef = useRef(false);
  const suppressRestoreRef = useRef(false);
  const restoreAbortRef = useRef<AbortController | null>(null);
  const prevTrackCountRef = useRef<number | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const cancelPendingRestore = useCallback(() => {
    suppressRestoreRef.current = true;
    restoreAbortRef.current?.abort();
    isRestoringRef.current = false;
  }, []);

  const clearPersistedSession = useCallback(async () => {
    cancelPendingRestore();
    await clearSession();
  }, [cancelPendingRestore]);

  useEffect(() => {
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

      const saved = loadSessionState();
      if (!saved || saved.tracks.length === 0) return;

      isRestoringRef.current = true;
      onStatus("restoring session...");

      try {
        await engine.resume();
        if (abort.signal.aborted || suppressRestoreRef.current) return;

        const legacyBlob = await loadLegacyAudioBlob();
        const migratedFromV1 = legacyBlob !== null;

        for (const track of saved.tracks) {
          if (abort.signal.aborted || suppressRestoreRef.current) return;

          let blob = await loadTrackBlob(track.id);

          if (!blob && migratedFromV1 && track.id === saved.tracks[0]?.id) {
            blob = legacyBlob;
            await migrateLegacyBlobToTrack(track.id);
          }

          if (
            !blob &&
            track.sourceType === "youtube" &&
            track.sourceUrl
          ) {
            blob = await engine.loadYouTubeUrl(track.id, track.sourceUrl);
            if (abort.signal.aborted || suppressRestoreRef.current) return;
            await saveTrackAudio(track.id, blob);
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

        const anyLoaded = saved.tracks.some((t) => engine.hasTrack(t.id));
        if (!anyLoaded) {
          onStatus("restore failed: audio missing — reload your file or url");
          clearStatusLater();
          return;
        }

        restoreSession(saved);
        setVolume(saved.volume);
        engine.setVolume(saved.volume);
        onStatus("session restored");
        clearStatusLater();
      } catch (e) {
        if (abort.signal.aborted || suppressRestoreRef.current) return;
        const message = e instanceof Error ? e.message : "unknown error";
        onStatus(`restore failed: ${message}`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once on mount
  }, []);

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

    const trackCount = session.tracks.length;
    const prevCount = prevTrackCountRef.current;
    prevTrackCountRef.current = trackCount;

    if (trackCount === 0) {
      if (prevCount !== null && prevCount > 0) {
        saveSessionState(session);
      }
      return;
    }

    if (!session.tracks.some((t) => engine.hasTrack(t.id))) return;

    const timer = window.setTimeout(() => {
      saveSessionState(sessionRef.current);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [sessionSaveKey, engine.loadedTrackIds]);

  const persistTrackAudio = async (trackId: string, blob: Blob) => {
    await saveTrackAudio(trackId, blob);
    if (sessionRef.current.tracks.length > 0) {
      saveSessionState(sessionRef.current);
    }
  };

  return { persistTrackAudio, cancelPendingRestore, clearPersistedSession };
}

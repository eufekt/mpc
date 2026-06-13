import { useEffect, useMemo, useRef } from "react";
import {
  loadLegacyAudioBlob,
  loadSessionState,
  loadTrackAudio,
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
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    const abort = new AbortController();
    let statusTimer: number | undefined;

    const clearStatusLater = () => {
      statusTimer = window.setTimeout(() => {
        if (!abort.signal.aborted) onStatus(null);
      }, 2000);
    };

    (async () => {
      const saved = loadSessionState();
      if (!saved || saved.tracks.length === 0) return;

      isRestoringRef.current = true;
      onStatus("restoring session...");

      try {
        await engine.resume();
        if (abort.signal.aborted) return;

        const legacyBlob = await loadLegacyAudioBlob();
        const migratedFromV1 = legacyBlob !== null;

        for (const track of saved.tracks) {
          if (abort.signal.aborted) return;

          let blob = await loadTrackAudio(track.id);

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
            if (abort.signal.aborted) return;
            await saveTrackAudio(track.id, blob);
            continue;
          }

          if (blob) {
            const arrayBuffer = await blob.arrayBuffer();
            if (abort.signal.aborted) return;
            await engine.loadTrackAudio(
              track.id,
              arrayBuffer,
              track.sourceName,
            );
          }
        }

        if (abort.signal.aborted) return;

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
        if (abort.signal.aborted) return;
        const message = e instanceof Error ? e.message : "unknown error";
        onStatus(`restore failed: ${message}`);
        clearStatusLater();
      } finally {
        if (!abort.signal.aborted) {
          isRestoringRef.current = false;
        }
      }
    })();

    return () => {
      abort.abort();
      if (statusTimer !== undefined) {
        window.clearTimeout(statusTimer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once on mount
  }, []);

  const structuralSessionKey = useMemo(
    () =>
      JSON.stringify({
        version: session.version,
        tracks: session.tracks,
        paletteMode: session.paletteMode,
        padMode: session.padMode,
        volume: session.volume,
      }),
    [
      session.version,
      session.tracks,
      session.paletteMode,
      session.padMode,
      session.volume,
    ],
  );

  useEffect(() => {
    if (isRestoringRef.current) return;
    if (session.tracks.length === 0) return;
    if (!session.tracks.some((t) => engine.hasTrack(t.id))) return;
    saveSessionState(session);
  }, [structuralSessionKey, engine.loadedTrackIds, session]);

  useEffect(() => {
    if (isRestoringRef.current) return;
    if (session.tracks.length === 0) return;
    if (!session.tracks.some((t) => engine.hasTrack(t.id))) return;

    const timer = window.setTimeout(() => {
      saveSessionState(sessionRef.current);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [session.activeTrackId, session.volume, engine.loadedTrackIds]);

  const persistTrackAudio = async (trackId: string, blob: Blob) => {
    await saveTrackAudio(trackId, blob);
    if (sessionRef.current.tracks.length > 0) {
      saveSessionState(sessionRef.current);
    }
  };

  return { persistTrackAudio };
}

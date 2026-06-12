import { useEffect, useRef } from "react";
import type { PaletteMode } from "../lib/chopColors";
import {
  buildSessionMeta,
  loadAudioBlob,
  loadSessionMeta,
  saveAudioBlob,
  saveSessionMeta,
} from "../lib/sessionPersistence";
import type { Chop, PadMode, SourceType } from "../lib/types";
import type { useAudioEngine } from "./useAudioEngine";

type Engine = ReturnType<typeof useAudioEngine>;

type Params = {
  engine: Engine;
  chops: Chop[];
  paletteMode: PaletteMode;
  padMode: PadMode;
  sourceType: SourceType | null;
  sourceUrl: string | null;
  hasAudio: boolean;
  setChops: (chops: Chop[]) => void;
  setPaletteMode: (mode: PaletteMode) => void;
  setPadMode: (mode: PadMode) => void;
  setSourceType: (type: SourceType | null) => void;
  setSourceUrl: (url: string | null) => void;
  onStatus: (message: string | null) => void;
};

function saveCurrentSession(
  engine: Engine,
  params: {
    sourceType: SourceType;
    sourceUrl: string | null;
    chops: Chop[];
    paletteMode: PaletteMode;
    padMode: PadMode;
  },
) {
  if (!engine.sourceName) return;
  saveSessionMeta(
    buildSessionMeta({
      sourceType: params.sourceType,
      sourceName: engine.sourceName,
      sourceUrl: params.sourceUrl ?? undefined,
      chops: params.chops,
      paletteMode: params.paletteMode,
      padMode: params.padMode,
      volume: engine.volume,
    }),
  );
}

export function useSessionPersistence({
  engine,
  chops,
  paletteMode,
  padMode,
  sourceType,
  sourceUrl,
  hasAudio,
  setChops,
  setPaletteMode,
  setPadMode,
  setSourceType,
  setSourceUrl,
  onStatus,
}: Params) {
  const isRestoringRef = useRef(false);
  const chopsRef = useRef(chops);
  const paletteModeRef = useRef(paletteMode);
  const padModeRef = useRef(padMode);
  const sourceTypeRef = useRef(sourceType);
  const sourceUrlRef = useRef(sourceUrl);
  chopsRef.current = chops;
  paletteModeRef.current = paletteMode;
  padModeRef.current = padMode;
  sourceTypeRef.current = sourceType;
  sourceUrlRef.current = sourceUrl;

  useEffect(() => {
    const abort = new AbortController();
    let statusTimer: number | undefined;

    const clearStatusLater = () => {
      statusTimer = window.setTimeout(() => {
        if (!abort.signal.aborted) onStatus(null);
      }, 2000);
    };

    (async () => {
      const meta = loadSessionMeta();
      if (!meta) return;

      isRestoringRef.current = true;
      onStatus("restoring session...");

      try {
        await engine.resume();
        if (abort.signal.aborted) return;

        let blob = await loadAudioBlob();
        if (abort.signal.aborted) return;

        if (!blob && meta.sourceType === "youtube" && meta.sourceUrl) {
          blob = await engine.loadYouTubeUrl(meta.sourceUrl);
          if (abort.signal.aborted) return;
          await saveAudioBlob(blob);
        } else if (blob) {
          const arrayBuffer = await blob.arrayBuffer();
          if (abort.signal.aborted) return;
          await engine.loadArrayBuffer(arrayBuffer, meta.sourceName);
        } else {
          onStatus("restore failed: audio missing — reload your file or url");
          clearStatusLater();
          return;
        }

        if (abort.signal.aborted) return;

        setSourceType(meta.sourceType);
        setSourceUrl(meta.sourceUrl ?? null);
        setPaletteMode(meta.paletteMode);
        setPadMode(meta.padMode);
        setChops(meta.chops);
        engine.setVolume(meta.volume);
        onStatus("session restored");
        clearStatusLater();
      } catch (e) {
        if (abort.signal.aborted) return;
        const message =
          e instanceof Error ? e.message : "unknown error";
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

  useEffect(() => {
    if (isRestoringRef.current) return;
    if (!hasAudio || !sourceType || !engine.sourceName) return;
    saveCurrentSession(engine, {
      sourceType,
      sourceUrl,
      chops,
      paletteMode,
      padMode,
    });
  }, [chops, paletteMode, padMode, sourceType, sourceUrl, hasAudio, engine.sourceName]);

  useEffect(() => {
    if (isRestoringRef.current) return;
    if (!hasAudio || !sourceType || !engine.sourceName) return;

    const timer = window.setTimeout(() => {
      saveCurrentSession(engine, {
        sourceType,
        sourceUrl,
        chops: chopsRef.current,
        paletteMode: paletteModeRef.current,
        padMode: padModeRef.current,
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [engine.volume, hasAudio, sourceType, engine.sourceName]);

  const persistAudio = async (
    blob: Blob,
    type: SourceType,
    url: string | null,
  ) => {
    await saveAudioBlob(blob);
    sourceTypeRef.current = type;
    sourceUrlRef.current = url;
    if (engine.sourceName) {
      saveCurrentSession(engine, {
        sourceType: type,
        sourceUrl: url,
        chops: chopsRef.current,
        paletteMode: paletteModeRef.current,
        padMode: padModeRef.current,
      });
    }
  };

  return { persistAudio };
}

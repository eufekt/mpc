import { useCallback, useEffect, useMemo, useState } from "react";
import { ChopTable } from "./components/ChopTable";
import { FileUpload } from "./components/FileUpload";
import { PadRow } from "./components/PadRow";
import { UrlInput } from "./components/UrlInput";
import { WaveformEditor } from "./components/WaveformEditor";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { useKeyboardSampler } from "./hooks/useKeyboardSampler";
import { useSessionPersistence } from "./hooks/useSessionPersistence";
import {
  assignColorsToChops,
  type PaletteMode,
} from "./lib/chopColors";
import type { Chop, PadMode, SourceType } from "./lib/types";

export default function App() {
  const engine = useAudioEngine();
  const [chops, setChops] = useState<Chop[]>([]);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("pastel");
  const [padMode, setPadMode] = useState<PadMode>("layer");
  const [sourceType, setSourceType] = useState<SourceType | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [selectedChopId, setSelectedChopId] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [playMode, setPlayMode] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const buffer = engine.getBuffer();
  const hasAudio = buffer !== null;

  const { persistAudio } = useSessionPersistence({
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
    onStatus: setStatus,
  });

  const selectedChop = useMemo(
    () => chops.find((c) => c.id === selectedChopId) ?? null,
    [chops, selectedChopId],
  );

  const assignedKeys = useMemo(
    () =>
      new Set(
        chops.filter((c) => c.key).map((c) => c.key!.toUpperCase()),
      ),
    [chops],
  );

  const keyColors = useMemo(() => {
    const map = new Map<string, string>();
    for (const chop of chops) {
      if (chop.key) map.set(chop.key.toUpperCase(), chop.color);
    }
    return map;
  }, [chops]);

  const handlePaletteChange = (mode: PaletteMode) => {
    setPaletteMode(mode);
    setChops((prev) => assignColorsToChops(prev, mode));
  };

  const handlePadModeChange = (mode: PadMode) => {
    if (padMode === "loop" && mode !== "loop") {
      engine.stopLoop();
    }
    setPadMode(mode);
  };

  const playChop = useCallback(
    (chop: Chop) => {
      if (!chop.key) return;
      engine.playChop(chop.start, chop.end, chop.key, padMode);
    },
    [engine, padMode],
  );

  const flashPad = useCallback((key: string) => {
    setActiveKey(key);
    window.setTimeout(() => setActiveKey(null), 100);
  }, []);

  const bindKeyToSelectedChop = useCallback(
    (key: string) => {
      if (!selectedChopId) return;
      const lower = key.toLowerCase();
      const upper = key.toUpperCase();
      setChops((prev) =>
        prev.map((c) => {
          if (c.id === selectedChopId) return { ...c, key: lower };
          if (c.key?.toLowerCase() === lower) return { ...c, key: null };
          return c;
        }),
      );
      setStatus(`chop bound to ${upper}`);
    },
    [selectedChopId],
  );

  useKeyboardSampler({
    chops,
    onPlay: playChop,
    onPadPress: flashPad,
    enabled: hasAudio && playMode && !selectedChopId,
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        setPlayMode((prev) => !prev);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!selectedChopId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key.length !== 1 || key < "a" || key > "z") return;

      event.preventDefault();
      bindKeyToSelectedChop(key);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedChopId, bindKeyToSelectedChop]);

  const handleLoadFile = async (file: File) => {
    setStatus("loading...");
    setChops([]);
    setSelectedChopId(null);
    try {
      await engine.resume();
      const blob = await engine.loadFile(file);
      setSourceType("file");
      setSourceUrl(null);
      await persistAudio(blob, "file", null);
      setStatus(`loaded: ${file.name}`);
    } catch {
      setStatus(null);
    }
  };

  const handleLoadUrl = async (url: string) => {
    setStatus("loading...");
    setChops([]);
    setSelectedChopId(null);
    try {
      await engine.resume();
      const blob = await engine.loadYouTubeUrl(url);
      setSourceType("youtube");
      setSourceUrl(url);
      await persistAudio(blob, "youtube", url);
      setStatus(`loaded: ${url}`);
    } catch {
      setStatus(null);
    }
  };

  const handlePadClick = (key: string) => {
    if (selectedChopId) {
      bindKeyToSelectedChop(key);
      return;
    }
    const chop = chops.find((c) => c.key?.toUpperCase() === key);
    if (chop) {
      flashPad(key);
      playChop(chop);
    }
  };

  const handleDeleteChop = (id: string) => {
    setChops((prev) => prev.filter((c) => c.id !== id));
    if (selectedChopId === id) setSelectedChopId(null);
  };

  const handleChopColorChange = (color: string) => {
    if (!selectedChopId) return;
    setChops((prev) =>
      prev.map((c) => (c.id === selectedChopId ? { ...c, color } : c)),
    );
  };

  return (
    <main>
      <section className="play-mode-bar">
        <button
          type="button"
          className={playMode ? "active" : undefined}
          onClick={() => setPlayMode((prev) => !prev)}
        >
          PLAY
        </button>
        <span className="hint">{playMode ? "on — keys trigger chops" : "off — P to toggle"}</span>
      </section>

      <h1>MPC — Music Production Center</h1>
      <hr />

      <section className="volume">
        <label htmlFor="volume">VOLUME</label>
        <input
          id="volume"
          type="range"
          min={0}
          max={100}
          value={Math.round(engine.volume * 100)}
          onChange={(e) => engine.setVolume(Number(e.target.value) / 100)}
        />
        <span>{Math.round(engine.volume * 100)}</span>
      </section>

      <section>
        <UrlInput onLoad={handleLoadUrl} disabled={engine.loading} />
        <FileUpload onFile={handleLoadFile} disabled={engine.loading} />
        {!hasAudio && (
          <p className="hint">click load to enable audio</p>
        )}
      </section>

      {engine.loading && <pre>loading...</pre>}
      {engine.error && <pre>error: {engine.error}</pre>}
      {status && !engine.loading && !engine.error && (
        <pre>{status}</pre>
      )}

      {hasAudio && buffer && (
        <>
          <hr />
          <p>source: {engine.sourceName}</p>
          <section className="palette-toggle">
            <span>PALETTE</span>
            <button
              type="button"
              className={paletteMode === "pastel" ? "active" : undefined}
              onClick={() => handlePaletteChange("pastel")}
            >
              PASTEL
            </button>
            <button
              type="button"
              className={paletteMode === "acidic" ? "active" : undefined}
              onClick={() => handlePaletteChange("acidic")}
            >
              ACIDIC
            </button>
          </section>
          <section className="transport">
            <button
              type="button"
              className={engine.isTrackPlaying ? "active" : undefined}
              onClick={() => {
                void engine.resume().then(() => engine.toggleTrackPlayback());
              }}
            >
              {engine.isTrackPlaying ? "PAUSE" : "PLAY"}
            </button>
            <span>POS {engine.seekTime.toFixed(2)}</span>
            <span className="hint">click waveform to set position</span>
          </section>
          <WaveformEditor
            buffer={buffer}
            chops={chops}
            paletteMode={paletteMode}
            onChopsChange={setChops}
            seekTime={engine.seekTime}
            onSeek={engine.setSeekTime}
            getPlaybackTime={engine.getPlaybackTime}
          />

          <hr />
          <h2>CHOPS</h2>
          {selectedChop && (
            <section className="chop-selection">
              <p className="hint">
                selected — press a letter to bind or change key
              </p>
              <label htmlFor="chop-color">COLOR</label>
              <input
                id="chop-color"
                type="color"
                value={selectedChop.color}
                onChange={(e) => handleChopColorChange(e.target.value)}
              />
            </section>
          )}
          <ChopTable
            chops={chops}
            selectedId={selectedChopId}
            onSelect={setSelectedChopId}
            onDelete={handleDeleteChop}
          />

          <hr />
          <h2>PADS</h2>
          <section className="pad-mode-toggle">
            <span>MODE</span>
            <button
              type="button"
              className={padMode === "layer" ? "active" : undefined}
              onClick={() => handlePadModeChange("layer")}
            >
              LAYER
            </button>
            <button
              type="button"
              className={padMode === "clear" ? "active" : undefined}
              onClick={() => handlePadModeChange("clear")}
            >
              CLEAR
            </button>
            <button
              type="button"
              className={padMode === "loop" ? "active" : undefined}
              onClick={() => handlePadModeChange("loop")}
            >
              LOOP
            </button>
            {engine.loopingKey && (
              <button type="button" onClick={() => engine.stopLoop()}>
                STOP
              </button>
            )}
          </section>
          <PadRow
            assignedKeys={assignedKeys}
            keyColors={keyColors}
            activeKey={activeKey}
            loopingKey={engine.loopingKey}
            onPadClick={handlePadClick}
          />
        </>
      )}
    </main>
  );
}

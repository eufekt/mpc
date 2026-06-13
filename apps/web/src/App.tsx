import { useCallback, useMemo, useState } from "react";
import { FileUpload } from "./components/FileUpload";
import { PadRow } from "./components/PadRow";
import { TrackList } from "./components/TrackList";
import { TrackModal } from "./components/TrackModal";
import { TrackPanel } from "./components/TrackPanel";
import { TracksSection } from "./components/TracksSection";
import { UrlInput } from "./components/UrlInput";
import { useAudioEngine } from "./hooks/useAudioEngine";
import {
  useSamplerKeyboard,
  type SelectedChop,
} from "./hooks/useSamplerKeyboard";
import { useSessionPersistence } from "./hooks/useSessionPersistence";
import { createTrack, useSessionState } from "./hooks/useSessionState";
import {
  getAssignedKeys,
  getChopsForKey,
  getKeyColors,
  toChopPlayRequests,
} from "./lib/pads";
import { deleteTrackAudio } from "./lib/sessionPersistence";
import type { PaletteMode } from "./lib/chopColors";

export default function App() {
  const engine = useAudioEngine();
  const {
    session,
    addTrack,
    removeTrack,
    setActiveTrack,
    updateChops,
    bindKey,
    setPaletteMode,
    setPadMode,
    setVolume,
    restoreSession,
  } = useSessionState();

  const [selectedChop, setSelectedChop] = useState<SelectedChop | null>(null);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [playMode, setPlayMode] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const activeTrackId = session.activeTrackId;
  const hasAudio = engine.loadedTrackIds.length > 0;

  const loadedTracks = useMemo(
    () =>
      session.tracks.filter((t) => engine.loadedTrackIds.includes(t.id)),
    [session.tracks, engine.loadedTrackIds],
  );

  const { persistTrackAudio } = useSessionPersistence({
    engine,
    session,
    restoreSession,
    setVolume,
    onStatus: setStatus,
  });

  const assignedKeys = useMemo(
    () => getAssignedKeys(session.tracks),
    [session.tracks],
  );

  const keyColors = useMemo(
    () => getKeyColors(session.tracks),
    [session.tracks],
  );

  const handlePaletteChange = (mode: PaletteMode) => {
    setPaletteMode(mode);
  };

  const handlePadModeChange = (mode: typeof session.padMode) => {
    if (session.padMode === "loop" && mode !== "loop") {
      engine.stopLoop();
    }
    setPadMode(mode);
  };

  const playKey = useCallback(
    (key: string) => {
      const bound = getChopsForKey(session.tracks, key);
      const requests = toChopPlayRequests(bound);
      if (requests.length === 0) return;
      void engine.playChops(requests, session.padMode);
    },
    [engine, session.tracks, session.padMode],
  );

  const flashPad = useCallback((key: string) => {
    setActiveKey(key);
    window.setTimeout(() => setActiveKey(null), 100);
  }, []);

  const handleBindKey = useCallback(
    (trackId: string, key: string) => {
      if (!selectedChop || selectedChop.trackId !== trackId) return;
      bindKey(trackId, selectedChop.chopId, key);
      setSelectedChop(null);
      setStatus(`chop bound to ${key.toUpperCase()}`);
    },
    [selectedChop, bindKey],
  );

  useSamplerKeyboard({
    tracks: session.tracks,
    selectedChop,
    playMode,
    hasAudio,
    onTogglePlayMode: () => setPlayMode((prev) => !prev),
    onPlayKey: (key) => {
      playKey(key);
      setSelectedChop(null);
    },
    onBindKey: handleBindKey,
    onPadPress: flashPad,
  });

  const loadIntoNewTrack = async (
    load: (trackId: string) => Promise<Blob | File>,
    trackMeta: Parameters<typeof createTrack>[0],
  ) => {
    const track = createTrack(trackMeta);
    addTrack(track);
    setSelectedChop(null);
    try {
      await engine.resume();
      const result = await load(track.id);
      const blob =
        result instanceof File ? result : (result as Blob);
      await persistTrackAudio(track.id, blob);
      setActiveTrack(track.id);
      setLoadModalOpen(false);
      setStatus(`loaded: ${track.sourceName}`);
    } catch {
      removeTrack(track.id);
      engine.unloadTrack(track.id);
      setStatus(null);
    }
  };

  const handleLoadFile = async (file: File) => {
    setStatus("loading...");
    await loadIntoNewTrack(
      (trackId) => engine.loadFile(trackId, file),
      { sourceType: "file", sourceName: file.name },
    );
  };

  const handleLoadUrl = async (url: string) => {
    setStatus("loading...");
    await loadIntoNewTrack(
      (trackId) => engine.loadYouTubeUrl(trackId, url),
      { sourceType: "youtube", sourceName: url, sourceUrl: url },
    );
  };

  const handlePadClick = (key: string) => {
    if (selectedChop) {
      const track = session.tracks.find((t) => t.id === selectedChop.trackId);
      const chop = track?.chops.find((c) => c.id === selectedChop.chopId);
      if (chop?.key?.toUpperCase() === key) {
        flashPad(key);
        playKey(key);
        setSelectedChop(null);
        return;
      }
      handleBindKey(selectedChop.trackId, key);
      return;
    }

    if (getChopsForKey(session.tracks, key).length > 0) {
      flashPad(key);
      playKey(key);
    }
  };

  const handleRemoveTrack = (trackId: string) => {
    engine.unloadTrack(trackId);
    removeTrack(trackId);
    void deleteTrackAudio(trackId);
    if (selectedChop?.trackId === trackId) setSelectedChop(null);
  };

  const handleSelectTrack = useCallback(
    (trackId: string) => {
      setActiveTrack(trackId);
      setSelectedChop(null);
    },
    [setActiveTrack],
  );

  const handleSelectChop = useCallback(
    (trackId: string, chopId: string | null) => {
      if (chopId) {
        setSelectedChop({ trackId, chopId });
        setActiveTrack(trackId);
      } else {
        setSelectedChop(null);
      }
    },
    [setActiveTrack],
  );

  const handleDeleteChop = useCallback(
    (trackId: string, chopId: string) => {
      const track = session.tracks.find((t) => t.id === trackId);
      if (!track) return;
      updateChops(
        trackId,
        track.chops.filter((c) => c.id !== chopId),
      );
      setSelectedChop((prev) =>
        prev?.trackId === trackId && prev.chopId === chopId ? null : prev,
      );
    },
    [session.tracks, updateChops],
  );

  const handleChopColorChange = useCallback(
    (trackId: string, chopId: string, color: string) => {
      const track = session.tracks.find((t) => t.id === trackId);
      if (!track) return;
      updateChops(
        trackId,
        track.chops.map((c) => (c.id === chopId ? { ...c, color } : c)),
      );
    },
    [session.tracks, updateChops],
  );

  const handleChopVolumeChange = useCallback(
    (trackId: string, chopId: string, volume: number) => {
      const track = session.tracks.find((t) => t.id === trackId);
      if (!track) return;
      const clamped = Math.max(0, Math.min(1, volume));
      updateChops(
        trackId,
        track.chops.map((c) =>
          c.id === chopId ? { ...c, volume: clamped } : c,
        ),
      );
    },
    [session.tracks, updateChops],
  );

  const trackTransport = useMemo(
    () => ({
      getSeekTime: engine.getSeekTime,
      isTrackPlaying: engine.isTrackPlaying,
      toggleTrackPlayback: engine.toggleTrackPlayback,
      setSeekTime: engine.setSeekTime,
      getPlaybackTime: engine.getPlaybackTime,
      resume: engine.resume,
    }),
    [
      engine.getSeekTime,
      engine.isTrackPlaying,
      engine.toggleTrackPlayback,
      engine.setSeekTime,
      engine.getPlaybackTime,
      engine.resume,
    ],
  );

  const activeTrack = session.tracks.find((t) => t.id === activeTrackId) ?? null;

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
        <span className="hint">
          {playMode ? "on — keys trigger chops" : "off — P to toggle"}
        </span>
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
          value={Math.round(session.volume * 100)}
          onChange={(e) => {
            const value = Number(e.target.value) / 100;
            setVolume(value);
            engine.setVolume(value);
          }}
        />
        <span>{Math.round(session.volume * 100)}</span>
      </section>

      <TracksSection
        trackCount={session.tracks.length}
        activeTrackName={activeTrack?.sourceName ?? null}
        onOpen={() => setLoadModalOpen(true)}
      />

      {loadModalOpen && (
        <TrackModal title="LOAD TRACK" onClose={() => setLoadModalOpen(false)}>
          <UrlInput onLoad={handleLoadUrl} disabled={engine.loading} />
          <FileUpload onFile={handleLoadFile} disabled={engine.loading} />
          {session.tracks.length > 0 && (
            <TrackList
              tracks={session.tracks}
              activeTrackId={activeTrackId}
              loadedTrackIds={engine.loadedTrackIds}
              onOpen={handleSelectTrack}
              onRemove={handleRemoveTrack}
            />
          )}
          {session.tracks.length === 0 && (
            <p className="hint">paste url or upload file to add a track</p>
          )}
        </TrackModal>
      )}

      {engine.loading && <pre>loading...</pre>}
      {engine.error && <pre>error: {engine.error}</pre>}
      {status && !engine.loading && !engine.error && (
        <pre>{status}</pre>
      )}

      {loadedTracks.length > 0 && (
        <>
          <section className="palette-toggle">
            <span>PALETTE</span>
            <button
              type="button"
              className={
                session.paletteMode === "pastel" ? "active" : undefined
              }
              onClick={() => handlePaletteChange("pastel")}
            >
              PASTEL
            </button>
            <button
              type="button"
              className={
                session.paletteMode === "acidic" ? "active" : undefined
              }
              onClick={() => handlePaletteChange("acidic")}
            >
              ACIDIC
            </button>
          </section>

          <div className="timeline-stack">
            {loadedTracks.map((track) => {
              const buffer = engine.getBuffer(track.id);
              if (!buffer) return null;
              const index = session.tracks.findIndex((t) => t.id === track.id);
              return (
                <TrackPanel
                  key={track.id}
                  track={track}
                  index={index}
                  buffer={buffer}
                  paletteMode={session.paletteMode}
                  transport={trackTransport}
                  transportVersion={engine.transportVersion}
                  isActive={track.id === activeTrackId}
                  selectedChopId={
                    selectedChop?.trackId === track.id
                      ? selectedChop.chopId
                      : null
                  }
                  onActivateTrack={handleSelectTrack}
                  updateChops={updateChops}
                  onSelectChop={handleSelectChop}
                  onDeleteChop={handleDeleteChop}
                  onChopColorChange={handleChopColorChange}
                  onChopVolumeChange={handleChopVolumeChange}
                />
              );
            })}
          </div>
        </>
      )}

      {hasAudio && (
        <>
          <hr />
          <h2>PADS</h2>
          <section className="pad-mode-toggle">
            <span>MODE</span>
            <button
              type="button"
              className={session.padMode === "layer" ? "active" : undefined}
              onClick={() => handlePadModeChange("layer")}
            >
              LAYER
            </button>
            <button
              type="button"
              className={session.padMode === "clear" ? "active" : undefined}
              onClick={() => handlePadModeChange("clear")}
            >
              CLEAR
            </button>
            <button
              type="button"
              className={session.padMode === "loop" ? "active" : undefined}
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

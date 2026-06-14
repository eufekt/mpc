import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrangementSection } from "./components/ArrangementSection";
import { FileUpload } from "./components/FileUpload";
import { PadRow } from "./components/PadRow";
import { TrackList } from "./components/TrackList";
import { TrackModal } from "./components/TrackModal";
import { TrackPanel } from "./components/TrackPanel";
import { TracksSection } from "./components/TracksSection";
import { UrlInput } from "./components/UrlInput";
import {
  ConfigMenuBody,
  ConfigMenuTrigger,
  useConfigMenu,
} from "./components/ConfigMenu";
import { MidiDebugPanel } from "./components/MidiDebugPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { useArrangementPlayer } from "./hooks/useArrangementPlayer";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { useMidiInput } from "./hooks/useMidiInput";
import {
  useSamplerKeyboard,
  type SelectedChop,
} from "./hooks/useSamplerKeyboard";
import { useSessionPersistence } from "./hooks/useSessionPersistence";
import { createTrack, createArrangementLane, useSessionState } from "./hooks/useSessionState";
import { normalizeTimeStretch } from "./lib/chopPlayback";
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
    resetSession,
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
  } = useSessionState();

  const [selectedChop, setSelectedChop] = useState<SelectedChop | null>(null);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [playMode, setPlayMode] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [playheadTime, setPlayheadTime] = useState(0);
  const configMenu = useConfigMenu();
  const activeTrackId = session.activeTrackId;
  const arrangementPlayer = useArrangementPlayer({
    lanes: session.arrangement.lanes,
    tracks: session.tracks,
    getBuffer: (trackId) => engine.getBuffer(trackId) ?? undefined,
    getContext: engine.getContext,
    getMasterGain: engine.getMasterGain,
    resume: engine.resume,
    masterVolume: session.volume,
  });

  useEffect(() => {
    if (!arrangementPlayer.isPlaying) {
      setPlayheadTime(arrangementPlayer.seekTime);
      return;
    }

    let frameId = 0;
    const tick = () => {
      setPlayheadTime(arrangementPlayer.getPlayheadTime());
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [
    arrangementPlayer.isPlaying,
    arrangementPlayer.version,
    arrangementPlayer.seekTime,
    arrangementPlayer,
  ]);

  const stopArrangement = useCallback(() => {
    arrangementPlayer.stop();
  }, [arrangementPlayer]);

  const playArrangement = useCallback(async () => {
    engine.stopAllPlayback();
    engine.stopLoop();
    await arrangementPlayer.play();
  }, [arrangementPlayer, engine]);

  const hasAudio = engine.loadedTrackIds.length > 0;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (!hasAudio) return;
      event.preventDefault();
      if (arrangementPlayer.isPlaying) {
        stopArrangement();
      } else {
        void playArrangement();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    arrangementPlayer.isPlaying,
    hasAudio,
    playArrangement,
    stopArrangement,
  ]);

  const loadedTracks = useMemo(
    () =>
      session.tracks.filter((t) => engine.loadedTrackIds.includes(t.id)),
    [session.tracks, engine.loadedTrackIds],
  );

  const { persistTrackAudio, cancelPendingRestore, clearPersistedSession } =
    useSessionPersistence({
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
      stopArrangement();
      const bound = getChopsForKey(session.tracks, key);
      const requests = toChopPlayRequests(bound);
      if (requests.length === 0) return;
      void engine.playChops(requests, session.padMode);
    },
    [engine, session.tracks, session.padMode, stopArrangement],
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

  const handleMidiPad = useCallback(
    (padKey: string) => {
      void engine.resume();
      const key = padKey.toLowerCase();

      if (selectedChop) {
        const track = session.tracks.find((t) => t.id === selectedChop.trackId);
        const chop = track?.chops.find((c) => c.id === selectedChop.chopId);
        if (chop?.key?.toUpperCase() === padKey) {
          flashPad(padKey);
          playKey(key);
          setSelectedChop(null);
          return;
        }
        handleBindKey(selectedChop.trackId, key);
        return;
      }

      if (!playMode || !hasAudio) return;

      if (getChopsForKey(session.tracks, key).length > 0) {
        flashPad(padKey);
        playKey(key);
      }
    },
    [
      engine,
      selectedChop,
      session.tracks,
      playMode,
      hasAudio,
      flashPad,
      playKey,
      handleBindKey,
    ],
  );

  const midi = useMidiInput({ onPadTrigger: handleMidiPad });

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
    cancelPendingRestore();
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

  const handleChopTimeStretchChange = useCallback(
    (trackId: string, chopId: string, timeStretch: number) => {
      const track = session.tracks.find((t) => t.id === trackId);
      if (!track) return;
      const normalized = normalizeTimeStretch(timeStretch);
      updateChops(
        trackId,
        track.chops.map((c) =>
          c.id === chopId ? { ...c, timeStretch: normalized } : c,
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

  const handleClearSavedData = useCallback(async () => {
    const confirmed = window.confirm(
      "Clear all saved data in this browser? This removes tracks, chops, audio, session settings, and MIDI mappings. This cannot be undone.",
    );
    if (!confirmed) return;

    cancelPendingRestore();
    engine.stopLoop();
    for (const trackId of engine.loadedTrackIds) {
      engine.unloadTrack(trackId);
    }
    resetSession();
    midi.clearBindings();
    await clearPersistedSession();
    setSelectedChop(null);
    setLoadModalOpen(false);
    setStatus("saved data cleared");
    window.setTimeout(() => setStatus(null), 2000);
  }, [
    cancelPendingRestore,
    clearPersistedSession,
    engine,
    midi,
    resetSession,
  ]);

  return (
    <main>
      <header className="top-bar">
        <h1>MPC</h1>
        <button
          type="button"
          className={playMode ? "active" : undefined}
          onClick={() => setPlayMode((prev) => !prev)}
        >
          PLAY
        </button>
        <ConfigMenuTrigger
          menuOpen={configMenu.menuOpen}
          onToggle={configMenu.toggleMenu}
        />
        <div className="top-bar-volume">
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
        </div>
      </header>

      <ConfigMenuBody
        menuOpen={configMenu.menuOpen}
        activeTab={configMenu.activeTab}
        onSelectTab={configMenu.selectTab}
        midiPanel={
          <MidiDebugPanel
            supported={midi.supported}
            connected={midi.connected}
            error={midi.error}
            inputs={midi.inputs}
            outputs={midi.outputs}
            sysexEnabled={midi.sysexEnabled}
            permissionState={midi.permissionState}
            messages={midi.messages}
            bindings={midi.bindings}
            learnPad={midi.learnPad}
            lastTrigger={midi.lastTrigger}
            assignedKeys={assignedKeys}
            playMode={playMode}
            hasSelectedChop={selectedChop !== null}
            onConnect={() => void midi.connect()}
            onConnectSysex={() => void midi.connect({ sysex: true })}
            onRescan={midi.rescan}
            onDisconnect={midi.disconnect}
            onArmLearn={midi.armLearn}
            onCancelLearn={midi.cancelLearn}
            onClearLog={midi.clearLog}
            onRemoveBinding={midi.removeBinding}
            onClearBindings={midi.clearBindings}
            onMapEntryToPad={midi.mapEntryToPad}
          />
        }
        settingsPanel={
          <SettingsPanel onClearSavedData={handleClearSavedData} />
        }
      />

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
                  onChopTimeStretchChange={handleChopTimeStretchChange}
                  onRemoveTrack={handleRemoveTrack}
                />
              );
            })}
          </div>

          <hr />
          <ArrangementSection
            lanes={session.arrangement.lanes}
            tracks={session.tracks}
            loadedTrackIds={engine.loadedTrackIds}
            isPlaying={arrangementPlayer.isPlaying}
            playheadTime={playheadTime}
            loop={arrangementPlayer.loop}
            onPlay={() => void playArrangement()}
            onStop={stopArrangement}
            onSeek={arrangementPlayer.setSeekTime}
            onLoopChange={arrangementPlayer.setLoop}
            onAddLane={() => {
              const laneNumber = session.arrangement.lanes.length + 1;
              addLane(createArrangementLane(`Lane ${laneNumber}`));
            }}
            onRemoveLane={removeLane}
            onRenameLane={(laneId, name) =>
              updateLaneMeta(laneId, { name })
            }
            onSetMute={setLaneMute}
            onSetVolume={setLaneVolume}
            onSetLaneMode={setLaneMode}
            onAddClip={addClip}
            onAddClipAt={addClipAt}
            onRemoveClip={removeClip}
            onReorderClip={reorderClip}
            onMoveClip={moveClip}
            onSetClipStackMode={setClipStackMode}
          />
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

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrangementSection,
  type ArrangementActions,
} from "./components/ArrangementSection";
import { FileUpload } from "./components/FileUpload";
import { PadRow } from "./components/PadRow";
import { TrackList } from "./components/TrackList";
import { TrackModal } from "./components/TrackModal";
import { TrackPanel } from "./components/TrackPanel";
import { UrlInput } from "./components/UrlInput";
import { MidiDebugPanel } from "./components/MidiDebugPanel";
import { ProjectsPanel } from "./components/ProjectsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { useArrangementPlayer } from "./hooks/useArrangementPlayer";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { useMidiInput } from "./hooks/useMidiInput";
import {
  useSamplerKeyboard,
  type SelectedChop,
} from "./hooks/useSamplerKeyboard";
import { useSessionPersistence } from "./hooks/useSessionPersistence";
import { useTheme } from "./hooks/useTheme";
import { useProjects } from "./hooks/useProjects";
import { createTrack, createArrangementLane, useSessionState } from "./hooks/useSessionState";
import { filterLoadedTracks } from "./lib/arrangement";
import type { PaletteMode } from "./lib/chopColors";
import { isTypingTarget } from "./lib/keyboard";
import {
  fetchYouTubeTitle,
  nameFromFileName,
} from "./lib/trackNames";
import {
  getAssignedKeys,
  getChopsForKey,
  getKeyColors,
  resolvePadPress,
  toChopPlayRequests,
} from "./lib/pads";
import { deleteTrackAudio } from "./lib/sessionPersistence";
import type { TransportFocus } from "./lib/transport";

export default function App() {
  const { theme, setTheme } = useTheme();
  const engine = useAudioEngine();
  const {
    projects,
    activeProjectId,
    activeProject,
    createProject,
    renameProject,
    selectProject,
    deleteProject,
    refreshIndex,
  } = useProjects();
  const projectId = activeProjectId ?? projects[0]?.id ?? "";
  const {
    session,
    activeTrack,
    addTrack,
    removeTrack,
    renameTrack,
    setActiveTrack,
    updateChops,
    deleteChop,
    updateChop,
    bindKey,
    setPaletteMode,
    setPadMode,
    setVolume,
    setAccentColor,
    setMasterEffects,
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
    setLaneRowHeight,
    setLoopRegion,
  } = useSessionState();

  const [selectedChop, setSelectedChop] = useState<SelectedChop | null>(null);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [playMode, setPlayMode] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [transportFocus, setTransportFocus] = useState<TransportFocus>({
    type: "arrangement",
  });
  const [viewVisibility, setViewVisibility] = useState({
    tracks: true,
    arrangement: true,
    pads: true,
  });
  const [midiPanelOpen, setMidiPanelOpen] = useState(false);
  const [projectsPanelOpen, setProjectsPanelOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const activeTrackId = session.activeTrackId;
  const arrangementPlayer = useArrangementPlayer({
    lanes: session.arrangement.lanes,
    tracks: session.tracks,
    loopRegion: session.arrangement.loopRegion,
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

  const pauseArrangement = useCallback(() => {
    arrangementPlayer.pause();
  }, [arrangementPlayer]);

  const playArrangement = useCallback(async () => {
    engine.stopAllPlayback();
    engine.stopLoop();
    await arrangementPlayer.play();
  }, [arrangementPlayer, engine]);

  const toggleArrangementPlayback = useCallback(async () => {
    if (arrangementPlayer.isPlaying) {
      arrangementPlayer.pause();
      return;
    }
    await playArrangement();
  }, [arrangementPlayer, playArrangement]);

  const hasAudio = engine.loadedTrackIds.length > 0;

  const loadedTracks = useMemo(
    () => filterLoadedTracks(session.tracks, engine.loadedTrackIds),
    [session.tracks, engine.loadedTrackIds],
  );

  useEffect(() => {
    if (loadedTracks.length === 0) return;
    setTransportFocus((prev) => {
      if (
        prev.type === "track" &&
        loadedTracks.some((track) => track.id === prev.trackId)
      ) {
        return prev;
      }
      const trackId =
        activeTrackId && loadedTracks.some((track) => track.id === activeTrackId)
          ? activeTrackId
          : loadedTracks[0].id;
      return { type: "track", trackId };
    });
  }, [loadedTracks, activeTrackId]);

  const focusTrackTransport = useCallback((trackId: string) => {
    setTransportFocus({ type: "track", trackId });
  }, []);

  const focusArrangementTransport = useCallback(() => {
    setTransportFocus({ type: "arrangement" });
  }, []);

  const handleSpaceTransport = useCallback(async () => {
    if (!hasAudio) return;

    if (arrangementPlayer.isPlaying) {
      pauseArrangement();
      return;
    }

    const playingTrackId = engine.getPlayingTrackId();
    if (playingTrackId) {
      engine.pauseTrack(playingTrackId);
      return;
    }

    if (engine.loopingKey) {
      engine.stopLoop();
      return;
    }

    if (transportFocus.type === "arrangement") {
      await toggleArrangementPlayback();
      return;
    }

    if (engine.hasTrack(transportFocus.trackId)) {
      stopArrangement();
      engine.stopLoop();
      await engine.resume();
      await engine.toggleTrackPlayback(transportFocus.trackId);
    }
  }, [
    arrangementPlayer.isPlaying,
    engine,
    hasAudio,
    pauseArrangement,
    stopArrangement,
    toggleArrangementPlayback,
    transportFocus,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      if (isTypingTarget(event.target)) return;
      if (!hasAudio) return;
      event.preventDefault();
      void handleSpaceTransport();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSpaceTransport, hasAudio]);

  const { persistTrackAudio, cancelPendingRestore, clearPersistedSession, flushSessionSave } =
    useSessionPersistence({
      projectId,
      engine,
      session,
      restoreSession,
      setVolume,
      setMasterEffects,
      onStatus: setStatus,
      onProjectsIndexChange: refreshIndex,
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

  const handleMasterEffectsChange = useCallback(
    (masterEffects: typeof session.masterEffects) => {
      setMasterEffects(masterEffects);
      engine.setMasterEffects(masterEffects);
    },
    [engine, setMasterEffects],
  );

  const toggleView = (view: keyof typeof viewVisibility) => {
    setViewVisibility((prev) => ({ ...prev, [view]: !prev[view] }));
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
      const requests = toChopPlayRequests(getChopsForKey(session.tracks, key));
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
      setStatus(`chop bound to ${key}`);
    },
    [selectedChop, bindKey],
  );

  const handlePadInteraction = useCallback(
    (key: string, requirePlayMode: boolean) => {
      void engine.resume();
      const action = resolvePadPress({
        tracks: session.tracks,
        selectedChop,
        key,
        requirePlayMode,
        playMode,
        hasAudio,
      });

      if (action === "noop") return;

      if (action === "bind") {
        if (!selectedChop) return;
        handleBindKey(selectedChop.trackId, key);
        return;
      }

      flashPad(key.toUpperCase());
      playKey(key);
      if (selectedChop) setSelectedChop(null);
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

  const handleMidiPad = useCallback(
    (padKey: string) => {
      handlePadInteraction(padKey, true);
    },
    [handlePadInteraction],
  );

  const midi = useMidiInput({ projectId, onPadTrigger: handleMidiPad });

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
      const blob = result instanceof File ? result : (result as Blob);
      await persistTrackAudio(track.id, blob);
      setActiveTrack(track.id);
      setLoadModalOpen(false);
      setStatus(`loaded: ${track.name}`);
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
      {
        sourceType: "file",
        sourceName: file.name,
        name: nameFromFileName(file.name),
      },
    );
  };

  const handleLoadUrl = async (url: string) => {
    setStatus("loading...");
    const name = await fetchYouTubeTitle(url).catch(() => "YouTube");
    await loadIntoNewTrack(
      (trackId) => engine.loadYouTubeUrl(trackId, url),
      {
        sourceType: "youtube",
        sourceName: url,
        sourceUrl: url,
        name,
      },
    );
  };

  const handlePadClick = (key: string) => {
    handlePadInteraction(key, false);
  };

  const handleRenameTrack = useCallback(
    (trackId: string, name: string) => {
      renameTrack(trackId, name);
    },
    [renameTrack],
  );

  const handleRemoveTrack = (trackId: string) => {
    engine.unloadTrack(trackId);
    removeTrack(trackId);
    void deleteTrackAudio(projectId, trackId);
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
      deleteChop(trackId, chopId);
      setSelectedChop((prev) =>
        prev?.trackId === trackId && prev.chopId === chopId ? null : prev,
      );
    },
    [deleteChop],
  );

  const handleChopColorChange = useCallback(
    (trackId: string, chopId: string, color: string) => {
      updateChop(trackId, chopId, { color });
    },
    [updateChop],
  );

  const handleChopVolumeChange = useCallback(
    (trackId: string, chopId: string, volume: number) => {
      updateChop(trackId, chopId, { volume });
    },
    [updateChop],
  );

  const handleChopTimeStretchChange = useCallback(
    (trackId: string, chopId: string, timeStretch: number) => {
      updateChop(trackId, chopId, { timeStretch });
    },
    [updateChop],
  );

  const handleChopReverseChange = useCallback(
    (trackId: string, chopId: string, reverse: boolean) => {
      updateChop(trackId, chopId, { reverse });
    },
    [updateChop],
  );

  const handleChopNameChange = useCallback(
    (trackId: string, chopId: string, name: string) => {
      updateChop(trackId, chopId, { name });
    },
    [updateChop],
  );

  const trackTransport = useMemo(
    () => ({
      getSeekTime: engine.getSeekTime,
      isTrackPlaying: engine.isTrackPlaying,
      toggleTrackPlayback: engine.toggleTrackPlayback,
      setSeekTime: engine.setSeekTime,
      getPlaybackTime: engine.getPlaybackTime,
      getPlaybackDirection: engine.getPlaybackDirection,
      resume: engine.resume,
    }),
    [
      engine.getSeekTime,
      engine.isTrackPlaying,
      engine.toggleTrackPlayback,
      engine.setSeekTime,
      engine.getPlaybackTime,
      engine.getPlaybackDirection,
      engine.resume,
    ],
  );

  const arrangementActions = useMemo<ArrangementActions>(
    () => ({
      onRemoveLane: removeLane,
      onRenameLane: (laneId, name) => updateLaneMeta(laneId, { name }),
      onSetMute: setLaneMute,
      onSetVolume: setLaneVolume,
      onSetLaneMode: setLaneMode,
      onAddClip: addClip,
      onAddClipAt: addClipAt,
      onRemoveClip: removeClip,
      onReorderClip: reorderClip,
      onMoveClip: moveClip,
      onSetClipStackMode: setClipStackMode,
    }),
    [
      addClip,
      addClipAt,
      moveClip,
      removeClip,
      removeLane,
      reorderClip,
      setClipStackMode,
      setLaneMode,
      setLaneMute,
      setLaneVolume,
      updateLaneMeta,
    ],
  );

  const unloadEngineAndReset = useCallback(() => {
    cancelPendingRestore();
    engine.stopLoop();
    arrangementPlayer.stop();
    for (const trackId of engine.loadedTrackIds) {
      engine.unloadTrack(trackId);
    }
    resetSession();
    setSelectedChop(null);
    setLoadModalOpen(false);
  }, [arrangementPlayer, cancelPendingRestore, engine, resetSession]);

  const handleLoadProject = useCallback(
    async (nextProjectId: string) => {
      if (!nextProjectId || nextProjectId === projectId) return;
      flushSessionSave();
      unloadEngineAndReset();
      selectProject(nextProjectId);
      setStatus("project loaded");
      window.setTimeout(() => setStatus(null), 2000);
    },
    [flushSessionSave, projectId, selectProject, unloadEngineAndReset],
  );

  const handleCreateProject = useCallback(
    (name: string) => {
      flushSessionSave();
      unloadEngineAndReset();
      createProject(name);
      setStatus(`created project: ${name.trim() || "Untitled"}`);
      window.setTimeout(() => setStatus(null), 2000);
    },
    [createProject, flushSessionSave, unloadEngineAndReset],
  );

  const handleRenameProject = useCallback(
    (nextProjectId: string, name: string) => {
      renameProject(nextProjectId, name);
      setStatus(`renamed project: ${name}`);
      window.setTimeout(() => setStatus(null), 2000);
    },
    [renameProject],
  );

  const handleDeleteProject = useCallback(
    async (nextProjectId: string) => {
      const wasActive = nextProjectId === projectId;
      await deleteProject(nextProjectId);
      if (wasActive) {
        unloadEngineAndReset();
        setStatus("project deleted");
        window.setTimeout(() => setStatus(null), 2000);
      }
    },
    [deleteProject, projectId, unloadEngineAndReset],
  );

  const handleClearSavedData = useCallback(async () => {
    const projectName = activeProject?.name ?? "this project";
    const confirmed = window.confirm(
      `Clear saved data for "${projectName}"? This removes tracks, chops, audio, session settings, and MIDI mappings for this project. This cannot be undone.`,
    );
    if (!confirmed) return;

    unloadEngineAndReset();
    await clearPersistedSession();
    midi.clearBindings();
    setStatus("project data cleared");
    window.setTimeout(() => setStatus(null), 2000);
  }, [
    activeProject?.name,
    clearPersistedSession,
    midi,
    unloadEngineAndReset,
  ]);

  return (
    <main style={{ ["--accent-color" as string]: session.accentColor }}>
      <header className="top-bar">
        <h1>MPC</h1>
        <button
          type="button"
          className={loadModalOpen ? "active" : undefined}
          onClick={() => setLoadModalOpen(true)}
          title={
            activeTrack?.name
              ? `Load track — active: ${activeTrack.name}`
              : "Load track"
          }
        >
          {session.tracks.length > 0
            ? `LOAD TRACK (${session.tracks.length})`
            : "LOAD TRACK"}
        </button>
        <button
          type="button"
          className={playMode ? "active" : undefined}
          onClick={() => setPlayMode((prev) => !prev)}
          title="Toggle play mode — P"
        >
          PLAY MODE (P)
        </button>
        <div className="top-bar-views">
          <span>views</span>
          <button
            type="button"
            className={viewVisibility.tracks ? "active" : undefined}
            onClick={() => toggleView("tracks")}
            title="Show or hide timeline tracks"
          >
            TRACKS
          </button>
          <button
            type="button"
            className={viewVisibility.arrangement ? "active" : undefined}
            onClick={() => toggleView("arrangement")}
            title="Show or hide arrangement"
          >
            ARRANGEMENT
          </button>
          <button
            type="button"
            className={viewVisibility.pads ? "active" : undefined}
            onClick={() => toggleView("pads")}
            title="Show or hide pads"
          >
            PADS
          </button>
        </div>
        <div className="top-bar-panels-toggle">
          <button
            type="button"
            className={projectsPanelOpen ? "active" : undefined}
            onClick={() => setProjectsPanelOpen((prev) => !prev)}
            aria-expanded={projectsPanelOpen}
            title={
              activeProject?.name
                ? `Projects — active: ${activeProject.name}`
                : "Projects"
            }
          >
            PROJECTS
          </button>
          <button
            type="button"
            className={midiPanelOpen ? "active" : undefined}
            onClick={() => setMidiPanelOpen((prev) => !prev)}
            aria-expanded={midiPanelOpen}
          >
            MIDI
          </button>
          <button
            type="button"
            className={settingsPanelOpen ? "active" : undefined}
            onClick={() => setSettingsPanelOpen((prev) => !prev)}
            aria-expanded={settingsPanelOpen}
          >
            SETTINGS
          </button>
        </div>
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

      {(projectsPanelOpen || midiPanelOpen || settingsPanelOpen) && (
        <div className="top-bar-panels">
          {projectsPanelOpen && (
            <ProjectsPanel
              projects={projects}
              activeProjectId={activeProjectId}
              onCreateProject={handleCreateProject}
              onLoadProject={(id) => void handleLoadProject(id)}
              onRenameProject={handleRenameProject}
              onDeleteProject={(id) => void handleDeleteProject(id)}
            />
          )}
          {midiPanelOpen && (
            <MidiDebugPanel
              midi={midi}
              assignedKeys={assignedKeys}
              playMode={playMode}
              hasSelectedChop={selectedChop !== null}
            />
          )}
          {settingsPanelOpen && (
            <SettingsPanel
              theme={theme}
              onThemeChange={setTheme}
              accentColor={session.accentColor}
              onAccentColorChange={setAccentColor}
              paletteMode={session.paletteMode}
              onPaletteModeChange={handlePaletteChange}
              masterEffects={session.masterEffects}
              onMasterEffectsChange={handleMasterEffectsChange}
              projectName={activeProject?.name ?? "Untitled"}
              onClearSavedData={() => void handleClearSavedData()}
            />
          )}
        </div>
      )}

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
          {viewVisibility.tracks && (
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
                    theme={theme}
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
                    onChopNameChange={handleChopNameChange}
                    onChopVolumeChange={handleChopVolumeChange}
                    onChopTimeStretchChange={handleChopTimeStretchChange}
                    onChopReverseChange={handleChopReverseChange}
                    onRemoveTrack={handleRemoveTrack}
                    onRenameTrack={handleRenameTrack}
                    transportFocused={
                      transportFocus.type === "track" &&
                      transportFocus.trackId === track.id
                    }
                    onFocusTransport={() => focusTrackTransport(track.id)}
                  />
                );
              })}
            </div>
          )}

          {viewVisibility.tracks && viewVisibility.arrangement && <hr />}

          {viewVisibility.arrangement && (
            <ArrangementSection
              lanes={session.arrangement.lanes}
              tracks={session.tracks}
              loadedTrackIds={engine.loadedTrackIds}
              isPlaying={arrangementPlayer.isPlaying}
              playheadTime={playheadTime}
              loop={arrangementPlayer.loop}
              loopRegion={session.arrangement.loopRegion}
              transportFocused={transportFocus.type === "arrangement"}
              onFocusTransport={focusArrangementTransport}
              onTogglePlay={() => void toggleArrangementPlayback()}
              onStop={stopArrangement}
              onSeek={arrangementPlayer.setSeekTime}
              onLoopChange={arrangementPlayer.setLoop}
              onLoopRegionChange={setLoopRegion}
              onAddLane={(draft) => {
                addLane({
                  ...createArrangementLane(draft.name),
                  mode: draft.mode,
                  mute: draft.mute,
                  volume: draft.volume,
                });
              }}
              laneRowHeight={session.arrangement.laneRowHeight}
              onLaneRowHeightChange={setLaneRowHeight}
              actions={arrangementActions}
            />
          )}
        </>
      )}

      {hasAudio && viewVisibility.pads && (
        <>
          {(viewVisibility.tracks || viewVisibility.arrangement) && <hr />}
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

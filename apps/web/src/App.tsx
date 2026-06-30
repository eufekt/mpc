import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrangementSection,
  type ArrangementActions,
} from "./components/ArrangementSection";
import { FileUpload } from "./components/FileUpload";
import { ChopInspector } from "./components/ChopInspector";
import { KeyboardWorkspace } from "./components/KeyboardWorkspace";
import { PadDock } from "./components/PadDock";
import { PlayWorkspace } from "./components/PlayWorkspace";
import { TrackSidebar } from "./components/TrackSidebar";
import { TrackList } from "./components/TrackList";
import { TrackModal } from "./components/TrackModal";
import { TrackPanel } from "./components/TrackPanel";
import { UrlInput } from "./components/UrlInput";
import { MidiDebugPanel } from "./components/MidiDebugPanel";
import { ProjectsPanel } from "./components/ProjectsPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { useChopEffectsClipboard } from "./hooks/useChopEffectsClipboard";
import { useArrangementPlayer } from "./hooks/useArrangementPlayer";
import { useAudioEngine } from "./hooks/useAudioEngine";
import { useKeyboardModeInput } from "./hooks/useKeyboardModeInput";
import { useMidiInput } from "./hooks/useMidiInput";
import {
  useSamplerKeyboard,
  type SelectedChop,
} from "./hooks/useSamplerKeyboard";
import { useSessionPersistence } from "./hooks/useSessionPersistence";
import { useBrutalStyle } from "./hooks/useBrutalStyle";
import { useTheme } from "./hooks/useTheme";
import { useTrackLayout } from "./hooks/useTrackLayout";
import { useUiScale } from "./hooks/useUiScale";
import { useProjects } from "./hooks/useProjects";
import { createTrack, createArrangementLane, useSessionState } from "./hooks/useSessionState";
import { filterLoadedTracks, computeArrangementDuration } from "./lib/arrangement";
import { normalizeMusicalTime, snapTime } from "./lib/musicalTime";
import type { PaletteMode } from "./lib/chopColors";
import { isTypingTarget } from "./lib/keyboard";
import {
  fetchYouTubeTitle,
  nameFromFileName,
} from "./lib/trackNames";
import { deleteTrackAudio } from "./lib/sessionPersistence";
import {
  DEFAULT_MASTER_EFFECTS,
  type MasterEffects,
} from "./lib/masterEffects";
import {
  getAssignedKeys,
  getChopsForKey,
  getKeyColors,
  isSelectedChopPadKey,
  resolveChopsForKey,
  resolvePadPress,
  toChopPlayRequests,
} from "./lib/pads";
import {
  DEFAULT_ROOT_MIDI_NOTE,
  isNoteInScale,
  semitoneOffset,
  type ScaleId,
} from "./lib/music";
import type { TransportFocus } from "./lib/transport";
import {
  WORKFLOW_MODES,
  workflowModeDigit,
  workflowModeFromDigit,
  workflowModeLabel,
  type WorkflowMode,
} from "./lib/workflowMode";

export default function App() {
  const { theme, setTheme } = useTheme();
  const { trackLayout, setTrackLayout } = useTrackLayout();
  const { uiScale, setUiScale, resetUiScale } = useUiScale();
  const { brutalStyle, patchBrutalStyle } = useBrutalStyle();
  const engine = useAudioEngine();
  const {
    copyEffects,
    pasteEffects,
    hasCopiedEffects,
  } = useChopEffectsClipboard();
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
    duplicateChop,
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
    setMusicalTime,
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
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("sample");
  const [rootMidiNote, setRootMidiNote] = useState(DEFAULT_ROOT_MIDI_NOTE);
  const [octaveOffset, setOctaveOffset] = useState(0);
  const [scaleId, setScaleId] = useState<ScaleId>("chromatic");
  const [activeNotes, setActiveNotes] = useState<Set<number>>(() => new Set());
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null);
  const [midiPanelOpen, setMidiPanelOpen] = useState(false);
  const [projectsPanelOpen, setProjectsPanelOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const activeTrackId = session.activeTrackId;
  const arrangementPlayer = useArrangementPlayer({
    lanes: session.arrangement.lanes,
    tracks: session.tracks,
    loadedTrackIds: engine.loadedTrackIds,
    loopRegion: session.arrangement.loopRegion,
    musicalTime: normalizeMusicalTime(session.arrangement.musicalTime),
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

  const arrangementDuration = useMemo(
    () =>
      computeArrangementDuration(
        session.arrangement.lanes,
        loadedTracks,
      ),
    [session.arrangement.lanes, loadedTracks],
  );

  const totalChopCount = useMemo(
    () => loadedTracks.reduce((sum, track) => sum + track.chops.length, 0),
    [loadedTracks],
  );

  const activeLoadedTrack = useMemo(() => {
    if (loadedTracks.length === 0) return null;
    if (activeTrackId) {
      const match = loadedTracks.find((track) => track.id === activeTrackId);
      if (match) return match;
    }
    return loadedTracks[0];
  }, [loadedTracks, activeTrackId]);

  const inspectorChop = useMemo(() => {
    if (!selectedChop) return null;
    const track = session.tracks.find((item) => item.id === selectedChop.trackId);
    if (!track) return null;
    const chopIndex = track.chops.findIndex((chop) => chop.id === selectedChop.chopId);
    if (chopIndex < 0) return null;
    return { track, chop: track.chops[chopIndex], chopIndex };
  }, [selectedChop, session.tracks]);

  const selectedArrangementLane = useMemo(
    () => session.arrangement.lanes.find((lane) => lane.id === selectedLaneId) ?? null,
    [session.arrangement.lanes, selectedLaneId],
  );

  useEffect(() => {
    if (loadedTracks.length === 0) return;
    if (workflowMode === "arrange" || workflowMode === "play") return;
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
  }, [loadedTracks, activeTrackId, workflowMode]);

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

    if (workflowMode === "arrange" || workflowMode === "play") {
      if (engine.loopingKey) {
        engine.stopLoop();
        return;
      }
      const playingTrackId = engine.getPlayingTrackId();
      if (playingTrackId) {
        engine.pauseTrack(playingTrackId);
        return;
      }
      await toggleArrangementPlayback();
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
    workflowMode,
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const mode = workflowModeFromDigit(event.key);
      if (mode) {
        event.preventDefault();
        setWorkflowMode(mode);
        return;
      }
      if (event.key === "0" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        resetUiScale();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resetUiScale]);

  useEffect(() => {
    if (workflowMode === "play") {
      setSelectedChop(null);
    }
  }, [workflowMode]);

  useEffect(() => {
    if (workflowMode === "arrange" || workflowMode === "play") {
      setTransportFocus({ type: "arrangement" });
      return;
    }
    if (
      (workflowMode === "sample" || workflowMode === "keyboard") &&
      activeTrackId
    ) {
      setTransportFocus({ type: "track", trackId: activeTrackId });
    }
  }, [workflowMode, activeTrackId]);

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

  const handlePadDoubleClick = useCallback(
    (key: string) => {
      if (workflowMode !== "arrange" || !selectedLaneId) return;
      const bound = getChopsForKey(session.tracks, key);
      if (bound.length === 0) return;
      const { trackId, chop } = bound[bound.length - 1]!;
      const lane = session.arrangement.lanes.find(
        (item) => item.id === selectedLaneId,
      );
      if (!lane) return;
      if (lane.mode === "free") {
        const musicalTime = normalizeMusicalTime(session.arrangement.musicalTime);
        addClipAt(
          selectedLaneId,
          trackId,
          chop.id,
          snapTime(playheadTime, musicalTime),
          1,
        );
      } else {
        addClip(selectedLaneId, trackId, chop.id, 1);
      }
    },
    [
      addClip,
      addClipAt,
      playheadTime,
      selectedLaneId,
      session.arrangement.lanes,
      session.arrangement.musicalTime,
      session.tracks,
      workflowMode,
    ],
  );

  const handlePadModeChange = (mode: typeof session.padMode) => {
    if (session.padMode === "loop" && mode !== "loop") {
      engine.stopLoop();
    }
    setPadMode(mode);
  };

  const playKey = useCallback(
    (key: string) => {
      stopArrangement();
      const bound = resolveChopsForKey(
        session.tracks,
        key,
        selectedChop,
        workflowMode === "sample" ? activeTrackId : null,
      );
      const requests = toChopPlayRequests(bound);
      if (requests.length === 0) return;
      void engine.playChops(requests, session.padMode);
    },
    [
      engine,
      session.tracks,
      session.padMode,
      stopArrangement,
      selectedChop,
      workflowMode,
      activeTrackId,
    ],
  );

  const flashPad = useCallback((key: string) => {
    setActiveKey(key);
    window.setTimeout(() => setActiveKey(null), 100);
  }, []);

  const keyboardChopOptions = useMemo(() => {
    if (!activeLoadedTrack) return [];
    return activeLoadedTrack.chops.map((chop, chopIndex) => ({
      sourceTrackId: activeLoadedTrack.id,
      sourceTrackName: activeLoadedTrack.name,
      chopId: chop.id,
      chopIndex,
      chop,
      duration: chop.end - chop.start,
    }));
  }, [activeLoadedTrack]);

  const selectedKeyboardChopKey = useMemo(() => {
    if (!selectedChop || !activeLoadedTrack) return "";
    if (selectedChop.trackId !== activeLoadedTrack.id) return "";
    return `${selectedChop.trackId}:${selectedChop.chopId}`;
  }, [selectedChop, activeLoadedTrack]);

  const playKeyboardNote = useCallback(
    (midiNote: number) => {
      if (!selectedChop) return;
      if (!isNoteInScale(midiNote, rootMidiNote, scaleId)) return;

      const track = session.tracks.find((item) => item.id === selectedChop.trackId);
      const chop = track?.chops.find((item) => item.id === selectedChop.chopId);
      if (!track || !chop) return;
      if (!engine.hasTrack(track.id)) return;

      stopArrangement();
      void engine.resume();
      void engine.playChops(
        [
          {
            trackId: track.id,
            chopId: chop.id,
            start: chop.start,
            end: chop.end,
            key: `kb${midiNote}`,
            volume: chop.volume,
            timeStretch: chop.timeStretch,
            reverse: chop.reverse,
            pitchSemitones: semitoneOffset(rootMidiNote, midiNote),
            effects: chop.effects ?? DEFAULT_MASTER_EFFECTS,
          },
        ],
        "layer",
      );
    },
    [
      selectedChop,
      rootMidiNote,
      scaleId,
      session.tracks,
      engine,
      stopArrangement,
    ],
  );

  const handleKeyboardNoteOn = useCallback(
    (midiNote: number) => {
      setActiveNotes((prev) => new Set(prev).add(midiNote));
      playKeyboardNote(midiNote);
    },
    [playKeyboardNote],
  );

  const handleKeyboardNoteOff = useCallback((midiNote: number) => {
    setActiveNotes((prev) => {
      if (!prev.has(midiNote)) return prev;
      const next = new Set(prev);
      next.delete(midiNote);
      return next;
    });
  }, []);

  const handleMidiKeyboardNote = useCallback(
    (note: number, velocity: number) => {
      if (velocity <= 0) {
        handleKeyboardNoteOff(note);
        return;
      }
      handleKeyboardNoteOn(note);
    },
    [handleKeyboardNoteOff, handleKeyboardNoteOn],
  );

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
      if (
        selectedChop &&
        !isSelectedChopPadKey(session.tracks, selectedChop, key)
      ) {
        setSelectedChop(null);
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

  const handleMidiPad = useCallback(
    (padKey: string) => {
      handlePadInteraction(padKey, true);
    },
    [handlePadInteraction],
  );

  const midi = useMidiInput({
    projectId,
    onPadTrigger: handleMidiPad,
    keyboardMode: workflowMode === "keyboard",
    onKeyboardNote: handleMidiKeyboardNote,
  });

  useSamplerKeyboard({
    tracks: session.tracks,
    selectedChop,
    playMode,
    hasAudio,
    enabled: workflowMode !== "keyboard",
    onTogglePlayMode: () => setPlayMode((prev) => !prev),
    onPlayKey: (key) => {
      playKey(key);
      if (
        selectedChop &&
        !isSelectedChopPadKey(session.tracks, selectedChop, key)
      ) {
        setSelectedChop(null);
      }
    },
    onBindKey: handleBindKey,
    onPadPress: flashPad,
  });

  useKeyboardModeInput({
    enabled: workflowMode === "keyboard" && hasAudio,
    hasSelectedChop: selectedChop !== null,
    rootMidiNote,
    octaveOffset,
    scaleId,
    onNoteOn: handleKeyboardNoteOn,
    onNoteOff: handleKeyboardNoteOff,
    onRootMidiNoteChange: setRootMidiNote,
    onOctaveOffsetChange: setOctaveOffset,
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
      engine.stopChopAndPadPlayback();
      setActiveTrack(trackId);
      setSelectedChop(null);
    },
    [setActiveTrack, engine],
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

  const handleDuplicateChop = useCallback(
    (trackId: string, chopId: string) => {
      const track = session.tracks.find((item) => item.id === trackId);
      if (!track?.chops.some((chop) => chop.id === chopId)) return;
      const newChopId = duplicateChop(trackId, chopId);
      setSelectedChop({ trackId, chopId: newChopId });
    },
    [duplicateChop, session.tracks],
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

  const handleChopEffectsChange = useCallback(
    (trackId: string, chopId: string, effects: MasterEffects) => {
      updateChop(trackId, chopId, { effects });
      engine.updateActiveChopEffects(trackId, chopId, effects);
    },
    [updateChop, engine],
  );

  const handlePasteChopEffects = useCallback(
    (trackId: string, chopId: string) => {
      const effects = pasteEffects();
      if (!effects) return;
      handleChopEffectsChange(trackId, chopId, effects);
    },
    [pasteEffects, handleChopEffectsChange],
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
    <main
      className="app-shell"
      data-mode={workflowMode}
      style={{ ["--accent-color" as string]: session.accentColor }}
    >
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
          <span>mode</span>
          {WORKFLOW_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={workflowMode === mode ? "active" : undefined}
              onClick={() => setWorkflowMode(mode)}
              title={`${workflowModeLabel(mode)} — ${workflowModeDigit(mode)}`}
            >
              {workflowModeLabel(mode)}
            </button>
          ))}
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
              uiScale={uiScale}
              onUiScaleChange={setUiScale}
              onUiScaleReset={resetUiScale}
              trackLayout={trackLayout}
              onTrackLayoutChange={setTrackLayout}
              brutalStyle={brutalStyle}
              onBrutalStyleChange={patchBrutalStyle}
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

      <div className="app-body">
        {!hasAudio && (
          <p className="hint app-body-empty">
            load a track to use sample, arrange, play, and keyboard modes
          </p>
        )}

        {hasAudio && (
          <div
            className={[
              "workspace",
              workflowMode === "play" ? "workspace--play" : "",
              workflowMode === "arrange" ? "workspace--arrange" : "",
              workflowMode === "keyboard" ? "workspace--keyboard" : "",
              workflowMode !== "play" && trackLayout === "top"
                ? "workspace--tracks-top"
                : "",
              workflowMode !== "play" && trackLayout === "side"
                ? "workspace--tracks-side"
                : "",
              inspectorChop &&
              workflowMode !== "play" &&
              workflowMode !== "keyboard"
                ? "has-inspector"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {workflowMode !== "play" && trackLayout === "side" && (
              <TrackSidebar
                tracks={loadedTracks}
                activeTrackId={activeTrackId}
                layout="side"
                onSelectTrack={handleSelectTrack}
              />
            )}

            <div className="workspace-main">
              {workflowMode !== "play" && trackLayout === "top" && (
                <TrackSidebar
                  tracks={loadedTracks}
                  activeTrackId={activeTrackId}
                  layout="top"
                  onSelectTrack={handleSelectTrack}
                />
              )}
              {workflowMode === "sample" && activeLoadedTrack && (() => {
                const buffer = engine.getBuffer(activeLoadedTrack.id);
                if (!buffer) {
                  return (
                    <p className="hint">loading track audio...</p>
                  );
                }
                const index = session.tracks.findIndex(
                  (track) => track.id === activeLoadedTrack.id,
                );
                return (
                  <TrackPanel
                    key={activeLoadedTrack.id}
                    track={activeLoadedTrack}
                    index={index}
                    buffer={buffer}
                    paletteMode={session.paletteMode}
                    theme={theme}
                    transport={trackTransport}
                    transportVersion={engine.transportVersion}
                    isActive
                    selectedChopId={
                      selectedChop?.trackId === activeLoadedTrack.id
                        ? selectedChop.chopId
                        : null
                    }
                    onActivateTrack={handleSelectTrack}
                    updateChops={updateChops}
                    onSelectChop={handleSelectChop}
                    onDeleteChop={handleDeleteChop}
                    onDuplicateChop={handleDuplicateChop}
                    onChopColorChange={handleChopColorChange}
                    onChopNameChange={handleChopNameChange}
                    onChopVolumeChange={handleChopVolumeChange}
                    onChopTimeStretchChange={handleChopTimeStretchChange}
                    onChopReverseChange={handleChopReverseChange}
                    hasCopiedEffects={hasCopiedEffects}
                    onPasteChopEffects={handlePasteChopEffects}
                    onRemoveTrack={handleRemoveTrack}
                    onRenameTrack={handleRenameTrack}
                    transportFocused={
                      transportFocus.type === "track" &&
                      transportFocus.trackId === activeLoadedTrack.id
                    }
                    onFocusTransport={() =>
                      focusTrackTransport(activeLoadedTrack.id)
                    }
                  />
                );
              })()}

              {workflowMode === "sample" && !activeLoadedTrack && (
                <p className="hint">select a track</p>
              )}

              {workflowMode === "arrange" && (
                <ArrangementSection
                  lanes={session.arrangement.lanes}
                  tracks={session.tracks}
                  loadedTrackIds={engine.loadedTrackIds}
                  selectedLaneId={selectedLaneId}
                  onSelectedLaneIdChange={setSelectedLaneId}
                  isPlaying={arrangementPlayer.isPlaying}
                  playheadTime={playheadTime}
                  loop={arrangementPlayer.loop}
                  loopRegion={session.arrangement.loopRegion}
                  musicalTime={session.arrangement.musicalTime}
                  onMusicalTimeChange={setMusicalTime}
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

              {workflowMode === "keyboard" && (
                <KeyboardWorkspace
                  track={activeLoadedTrack}
                  chop={
                    inspectorChop &&
                    inspectorChop.track.id === activeLoadedTrack?.id
                      ? inspectorChop.chop
                      : null
                  }
                  chopIndex={
                    inspectorChop &&
                    inspectorChop.track.id === activeLoadedTrack?.id
                      ? inspectorChop.chopIndex
                      : 0
                  }
                  chopOptions={keyboardChopOptions}
                  selectedChopKey={selectedKeyboardChopKey}
                  onSelectChop={handleSelectChop}
                  rootMidiNote={rootMidiNote}
                  onRootMidiNoteChange={setRootMidiNote}
                  scaleId={scaleId}
                  onScaleIdChange={setScaleId}
                  octaveOffset={octaveOffset}
                  onOctaveOffsetChange={setOctaveOffset}
                  activeNotes={activeNotes}
                  onNoteOn={handleKeyboardNoteOn}
                  onNoteOff={handleKeyboardNoteOff}
                />
              )}

              {workflowMode === "play" && (
                <PlayWorkspace
                  isPlaying={arrangementPlayer.isPlaying}
                  playheadTime={playheadTime}
                  arrangementDuration={arrangementDuration}
                  loop={arrangementPlayer.loop}
                  canTransport={arrangementDuration > 0}
                  onTogglePlay={() => void toggleArrangementPlayback()}
                  onStop={stopArrangement}
                  onLoopChange={arrangementPlayer.setLoop}
                  trackCount={loadedTracks.length}
                  chopCount={totalChopCount}
                  padMode={session.padMode}
                  onPadModeChange={handlePadModeChange}
                  loopingKey={engine.loopingKey}
                  onStopLoop={() => engine.stopLoop()}
                  assignedKeys={assignedKeys}
                  keyColors={keyColors}
                  activeKey={activeKey}
                  onPadClick={handlePadClick}
                />
              )}
            </div>

            {inspectorChop &&
              workflowMode !== "play" &&
              workflowMode !== "keyboard" && (
              <ChopInspector
                track={inspectorChop.track}
                chop={inspectorChop.chop}
                chopIndex={inspectorChop.chopIndex}
                paletteMode={session.paletteMode}
                onNameChange={(name) =>
                  handleChopNameChange(
                    inspectorChop.track.id,
                    inspectorChop.chop.id,
                    name,
                  )
                }
                onVolumeChange={(volume) =>
                  handleChopVolumeChange(
                    inspectorChop.track.id,
                    inspectorChop.chop.id,
                    volume,
                  )
                }
                onTimeStretchChange={(timeStretch) =>
                  handleChopTimeStretchChange(
                    inspectorChop.track.id,
                    inspectorChop.chop.id,
                    timeStretch,
                  )
                }
                onReverseChange={(reverse) =>
                  handleChopReverseChange(
                    inspectorChop.track.id,
                    inspectorChop.chop.id,
                    reverse,
                  )
                }
                onEffectsChange={(effects) =>
                  handleChopEffectsChange(
                    inspectorChop.track.id,
                    inspectorChop.chop.id,
                    effects,
                  )
                }
                hasCopiedEffects={hasCopiedEffects}
                onCopyEffects={() =>
                  copyEffects(inspectorChop.chop.effects ?? DEFAULT_MASTER_EFFECTS)
                }
                onPasteEffects={() =>
                  handlePasteChopEffects(
                    inspectorChop.track.id,
                    inspectorChop.chop.id,
                  )
                }
                onColorChange={(color) =>
                  handleChopColorChange(
                    inspectorChop.track.id,
                    inspectorChop.chop.id,
                    color,
                  )
                }
                onDelete={() =>
                  handleDeleteChop(inspectorChop.track.id, inspectorChop.chop.id)
                }
                onDuplicate={() =>
                  handleDuplicateChop(inspectorChop.track.id, inspectorChop.chop.id)
                }
                onClose={() => setSelectedChop(null)}
              />
            )}
          </div>
        )}
      </div>

      {hasAudio && workflowMode !== "play" && workflowMode !== "keyboard" && (
        <PadDock
          padMode={session.padMode}
          onPadModeChange={handlePadModeChange}
          loopingKey={engine.loopingKey}
          onStopLoop={() => engine.stopLoop()}
          assignedKeys={assignedKeys}
          keyColors={keyColors}
          activeKey={activeKey}
          onPadClick={handlePadClick}
          onPadDoubleClick={handlePadDoubleClick}
          arrangeHint={
            workflowMode === "arrange" && selectedArrangementLane
              ? `double-click pad → ${selectedArrangementLane.name}`
              : workflowMode === "arrange"
                ? "select a lane, double-click pad to add chop"
                : null
          }
        />
      )}
    </main>
  );
}

import { memo, useCallback, useEffect, useState } from "react";
import { ChopTable } from "./ChopTable";
import {
  WaveformEditor,
  type WaveformSnapDivision,
} from "./WaveformEditor";
import { detectTempo } from "../lib/beatDetection";
import { getColorForIndex, type PaletteMode } from "../lib/chopColors";
import { DEFAULT_MASTER_EFFECTS } from "../lib/masterEffects";
import { MAX_BPM, MIN_BPM } from "../lib/musicalTime";
import {
  detectOnsets,
  type OnsetSensitivity,
} from "../lib/onsetDetection";
import type { Theme } from "../lib/theme";
import type { Chop, Track } from "../lib/types";
import { formatTimePrecise } from "../lib/timeFormat";

/** Cap auto-chop output to the number of bindable pads. */
const MAX_AUTO_CHOPS = 26;
/** Slices shorter than this are merged into the next onset. */
const MIN_AUTO_CHOP_SECONDS = 0.03;

type TransportApi = {
  getSeekTime: (trackId: string) => number;
  isTrackPlaying: (trackId: string) => boolean;
  toggleTrackPlayback: (trackId: string) => Promise<void>;
  setSeekTime: (trackId: string, time: number) => void;
  getPlaybackTime: (trackId: string) => number | null;
  getPlaybackDirection: (trackId: string) => "forward" | "reverse" | null;
  resume: () => Promise<void>;
};

type Props = {
  track: Track;
  index: number;
  buffer: AudioBuffer;
  paletteMode: PaletteMode;
  theme: Theme;
  transport: TransportApi;
  transportVersion: number;
  isActive: boolean;
  selectedChopId: string | null;
  onActivateTrack: (trackId: string) => void;
  updateChops: (trackId: string, chops: Chop[]) => void;
  onSelectChop: (trackId: string, chopId: string | null) => void;
  onDeleteChop: (trackId: string, chopId: string) => void;
  onDuplicateChop: (trackId: string, chopId: string) => void;
  onChopColorChange: (trackId: string, chopId: string, color: string) => void;
  onChopNameChange: (trackId: string, chopId: string, name: string) => void;
  onChopVolumeChange: (trackId: string, chopId: string, volume: number) => void;
  onChopTimeStretchChange: (
    trackId: string,
    chopId: string,
    timeStretch: number,
  ) => void;
  onChopReverseChange: (trackId: string, chopId: string, reverse: boolean) => void;
  hasCopiedEffects?: boolean;
  onPasteChopEffects?: (trackId: string, chopId: string) => void;
  onRemoveTrack: (trackId: string) => void;
  onRenameTrack: (trackId: string, name: string) => void;
  onUpdateTrack: (
    trackId: string,
    patch: Partial<Pick<Track, "sourceBpm" | "beatOffset">>,
  ) => void;
  transportFocused: boolean;
  onFocusTransport: () => void;
};

export const TrackPanel = memo(function TrackPanel({
  track,
  index,
  buffer,
  paletteMode,
  theme,
  transport,
  transportVersion,
  isActive,
  selectedChopId,
  onActivateTrack,
  updateChops,
  onSelectChop,
  onDeleteChop,
  onDuplicateChop,
  onChopColorChange,
  onChopNameChange,
  onChopVolumeChange,
  onChopTimeStretchChange,
  onChopReverseChange,
  hasCopiedEffects,
  onPasteChopEffects,
  onRemoveTrack,
  onRenameTrack,
  onUpdateTrack,
  transportFocused,
  onFocusTransport,
}: Props) {
  void transportVersion;
  const seekTime = transport.getSeekTime(track.id);
  const isPlaying = transport.isTrackPlaying(track.id);

  // Draft avoids the clamp fighting keystrokes mid-entry (e.g. typing "87.5").
  const [bpmDraft, setBpmDraft] = useState(
    track.sourceBpm != null ? String(track.sourceBpm) : "",
  );
  useEffect(() => {
    setBpmDraft(track.sourceBpm != null ? String(track.sourceBpm) : "");
  }, [track.sourceBpm]);

  const [snapEnabled, setSnapEnabled] = useState(false);
  const [snapDivision, setSnapDivision] = useState<WaveformSnapDivision>(16);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState(false);

  const handleDetectBpm = useCallback(async () => {
    setDetecting(true);
    setDetectError(false);
    try {
      const { bpm, offset } = await detectTempo(buffer);
      onUpdateTrack(track.id, { sourceBpm: bpm, beatOffset: offset });
    } catch {
      setDetectError(true);
    } finally {
      setDetecting(false);
    }
  }, [buffer, onUpdateTrack, track.id]);

  const [onsetSensitivity, setOnsetSensitivity] =
    useState<OnsetSensitivity>("medium");
  const [autoChopMessage, setAutoChopMessage] = useState<string | null>(null);

  const handleAutoChop = useCallback(() => {
    const onsets = detectOnsets(buffer, onsetSensitivity);
    if (onsets.length === 0) {
      setAutoChopMessage("no transients found — try higher sensitivity");
      return;
    }

    const boundaries = [...onsets, buffer.duration];
    const existing = track.chops;
    const maxNew = Math.max(0, MAX_AUTO_CHOPS - existing.length);
    if (maxNew === 0) {
      setAutoChopMessage("pad limit reached — delete chops first");
      return;
    }

    const newChops: Chop[] = [];
    let start = boundaries[0];
    for (let i = 1; i < boundaries.length && newChops.length < maxNew; i += 1) {
      const end = boundaries[i];
      if (end - start < MIN_AUTO_CHOP_SECONDS) continue;
      newChops.push({
        id: crypto.randomUUID(),
        start,
        end,
        key: null,
        color: getColorForIndex(
          paletteMode,
          existing.length + newChops.length,
        ),
        volume: 1,
        timeStretch: 1,
        reverse: false,
        effects: DEFAULT_MASTER_EFFECTS,
      });
      start = end;
    }

    if (newChops.length === 0) {
      setAutoChopMessage("no transients found — try higher sensitivity");
      return;
    }
    setAutoChopMessage(`${newChops.length} chops created`);
    updateChops(track.id, [...existing, ...newChops]);
  }, [buffer, onsetSensitivity, paletteMode, track.chops, track.id, updateChops]);

  useEffect(() => {
    if (!autoChopMessage) return;
    const id = window.setTimeout(() => setAutoChopMessage(null), 4000);
    return () => window.clearTimeout(id);
  }, [autoChopMessage]);

  const commitSourceBpm = useCallback(() => {
    if (bpmDraft.trim() === "") {
      onUpdateTrack(track.id, { sourceBpm: undefined });
      return;
    }
    const next = Number.parseFloat(bpmDraft);
    if (Number.isFinite(next) && next > 0) {
      onUpdateTrack(track.id, { sourceBpm: next });
    } else {
      setBpmDraft(track.sourceBpm != null ? String(track.sourceBpm) : "");
    }
  }, [bpmDraft, onUpdateTrack, track.id, track.sourceBpm]);

  const onSelectTrack = useCallback(() => {
    onActivateTrack(track.id);
  }, [onActivateTrack, track.id]);

  const onChopsChange = useCallback(
    (chops: Chop[]) => updateChops(track.id, chops),
    [track.id, updateChops],
  );

  const onSeek = useCallback(
    (time: number) => transport.setSeekTime(track.id, time),
    [transport, track.id],
  );

  const getPlaybackTime = useCallback(
    () => transport.getPlaybackTime(track.id),
    [transport, track.id],
  );
  const getPlaybackDirection = useCallback(
    () => transport.getPlaybackDirection(track.id),
    [transport, track.id],
  );

  const handleSelectChop = useCallback(
    (chopId: string) => {
      onActivateTrack(track.id);
      onSelectChop(track.id, chopId);
    },
    [onActivateTrack, onSelectChop, track.id],
  );

  const handleDeleteChop = useCallback(
    (chopId: string) => onDeleteChop(track.id, chopId),
    [onDeleteChop, track.id],
  );

  const handleDuplicateChop = useCallback(
    (chopId: string) => onDuplicateChop(track.id, chopId),
    [onDuplicateChop, track.id],
  );

  const handleTableNameChange = useCallback(
    (chopId: string, name: string) => {
      onChopNameChange(track.id, chopId, name);
    },
    [onChopNameChange, track.id],
  );

  const handleTableVolumeChange = useCallback(
    (chopId: string, volume: number) => {
      onChopVolumeChange(track.id, chopId, volume);
    },
    [onChopVolumeChange, track.id],
  );

  const handleTableColorChange = useCallback(
    (chopId: string, color: string) => {
      onChopColorChange(track.id, chopId, color);
    },
    [onChopColorChange, track.id],
  );

  const handleTableTimeStretchChange = useCallback(
    (chopId: string, timeStretch: number) => {
      onChopTimeStretchChange(track.id, chopId, timeStretch);
    },
    [onChopTimeStretchChange, track.id],
  );

  const handleTableReverseChange = useCallback(
    (chopId: string, reverse: boolean) => {
      onChopReverseChange(track.id, chopId, reverse);
    },
    [onChopReverseChange, track.id],
  );

  const handleTablePasteEffects = useCallback(
    (chopId: string) => {
      onPasteChopEffects?.(track.id, chopId);
    },
    [onPasteChopEffects, track.id],
  );

  return (
    <section
      className={[
        "track-panel",
        isActive ? "active" : "",
        transportFocused ? "transport-focused" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onSelectTrack}
      onPointerDown={onFocusTransport}
    >
      <header className="track-panel-header">
        <label className="track-panel-name-field">
          <span className="track-panel-index">{index + 1}.</span>
          <input
            className="track-panel-name"
            type="text"
            value={track.name}
            onChange={(e) => onRenameTrack(track.id, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Track ${index + 1} name`}
          />
        </label>
        <div className="track-panel-transport">
          <button
            type="button"
            className={isPlaying ? "active" : undefined}
            onClick={(e) => {
              e.stopPropagation();
              void transport.resume().then(() =>
                transport.toggleTrackPlayback(track.id),
              );
            }}
          >
            {isPlaying ? "PAUSE" : "PLAY"}
          </button>
          <span>POS {formatTimePrecise(seekTime)}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveTrack(track.id);
            }}
            aria-label={`remove track ${index + 1}`}
          >
            REMOVE
          </button>
        </div>
      </header>

      <div
        className="track-panel-toolbar"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <label className="track-panel-bpm">
          <span>BPM</span>
          <input
            type="number"
            min={MIN_BPM}
            max={MAX_BPM}
            step={0.1}
            value={bpmDraft}
            placeholder="—"
            aria-label={`Track ${index + 1} source BPM`}
            onChange={(e) => setBpmDraft(e.target.value)}
            onBlur={commitSourceBpm}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
          />
        </label>
        <button
          type="button"
          disabled={detecting}
          title="Detect tempo and first beat from the audio"
          onClick={() => void handleDetectBpm()}
        >
          {detecting ? "DETECTING…" : "DETECT"}
        </button>
        {detectError && (
          <span className="hint">couldn't detect — enter BPM manually</span>
        )}
        <div className="track-panel-snap">
          <button
            type="button"
            className={snapEnabled ? "active" : undefined}
            disabled={track.sourceBpm == null}
            title={
              track.sourceBpm == null
                ? "Set track BPM to enable beat snapping"
                : "Snap chop edges to the beat grid"
            }
            onClick={() => setSnapEnabled((prev) => !prev)}
          >
            SNAP
          </button>
          {([4, 8, 16] as const).map((division) => (
            <button
              key={division}
              type="button"
              className={snapDivision === division ? "active" : undefined}
              disabled={track.sourceBpm == null}
              title={`Snap to 1/${division} notes`}
              onClick={() => setSnapDivision(division)}
            >
              1/{division}
            </button>
          ))}
        </div>
        <div className="track-panel-autochop">
          <button
            type="button"
            title="Slice the track into chops at detected transients"
            onClick={handleAutoChop}
          >
            AUTO CHOP
          </button>
          <select
            value={onsetSensitivity}
            aria-label="Auto chop sensitivity"
            title="Transient detection sensitivity"
            onChange={(e) =>
              setOnsetSensitivity(e.target.value as OnsetSensitivity)
            }
          >
            <option value="low">low</option>
            <option value="medium">med</option>
            <option value="high">high</option>
          </select>
          {autoChopMessage && <span className="hint">{autoChopMessage}</span>}
        </div>
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <WaveformEditor
          buffer={buffer}
          chops={track.chops}
          paletteMode={paletteMode}
          theme={theme}
          onChopsChange={onChopsChange}
          seekTime={seekTime}
          onSeek={onSeek}
          getPlaybackTime={getPlaybackTime}
          getPlaybackDirection={getPlaybackDirection}
          sourceBpm={track.sourceBpm}
          beatOffset={track.beatOffset ?? 0}
          snapEnabled={snapEnabled && track.sourceBpm != null}
          snapDivision={snapDivision}
        />

        <ChopTable
          trackId={track.id}
          chops={track.chops}
          paletteMode={paletteMode}
          selectedId={isActive ? selectedChopId : null}
          compact
          onSelect={handleSelectChop}
          onDelete={handleDeleteChop}
          onDuplicate={handleDuplicateChop}
          onNameChange={handleTableNameChange}
          onVolumeChange={handleTableVolumeChange}
          onTimeStretchChange={handleTableTimeStretchChange}
          onReverseChange={handleTableReverseChange}
          onColorChange={handleTableColorChange}
          hasCopiedEffects={hasCopiedEffects}
          onPasteEffects={
            onPasteChopEffects ? handleTablePasteEffects : undefined
          }
        />
      </div>
    </section>
  );
});

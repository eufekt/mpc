import { memo, useCallback } from "react";
import { ChopTable } from "./ChopTable";
import { WaveformEditor } from "./WaveformEditor";
import type { PaletteMode } from "../lib/chopColors";
import type { Theme } from "../lib/theme";
import type { Chop, Track } from "../lib/types";
import { formatTimePrecise } from "../lib/timeFormat";

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
  transportFocused,
  onFocusTransport,
}: Props) {
  void transportVersion;
  const seekTime = transport.getSeekTime(track.id);
  const isPlaying = transport.isTrackPlaying(track.id);

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

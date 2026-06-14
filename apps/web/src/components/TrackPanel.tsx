import { memo, useCallback } from "react";
import { ChopTable } from "./ChopTable";
import { WaveformEditor } from "./WaveformEditor";
import type { PaletteMode } from "../lib/chopColors";
import type { Chop, Track } from "../lib/types";
import { formatTimePrecise } from "../lib/timeFormat";

type TransportApi = {
  getSeekTime: (trackId: string) => number;
  isTrackPlaying: (trackId: string) => boolean;
  toggleTrackPlayback: (trackId: string) => Promise<void>;
  setSeekTime: (trackId: string, time: number) => void;
  getPlaybackTime: (trackId: string) => number | null;
  resume: () => Promise<void>;
};

type Props = {
  track: Track;
  index: number;
  buffer: AudioBuffer;
  paletteMode: PaletteMode;
  transport: TransportApi;
  transportVersion: number;
  isActive: boolean;
  selectedChopId: string | null;
  onActivateTrack: (trackId: string) => void;
  updateChops: (trackId: string, chops: Chop[]) => void;
  onSelectChop: (trackId: string, chopId: string | null) => void;
  onDeleteChop: (trackId: string, chopId: string) => void;
  onChopColorChange: (trackId: string, chopId: string, color: string) => void;
  onChopVolumeChange: (trackId: string, chopId: string, volume: number) => void;
  onChopTimeStretchChange: (
    trackId: string,
    chopId: string,
    timeStretch: number,
  ) => void;
  onRemoveTrack: (trackId: string) => void;
};

export const TrackPanel = memo(function TrackPanel({
  track,
  index,
  buffer,
  paletteMode,
  transport,
  transportVersion,
  isActive,
  selectedChopId,
  onActivateTrack,
  updateChops,
  onSelectChop,
  onDeleteChop,
  onChopColorChange,
  onChopVolumeChange,
  onChopTimeStretchChange,
  onRemoveTrack,
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

  return (
    <section
      className={["track-panel", isActive ? "active" : ""].filter(Boolean).join(" ")}
      onClick={onSelectTrack}
    >
      <header className="track-panel-header">
        <span className="track-panel-title">
          {index + 1}. {track.sourceName}
        </span>
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
          onChopsChange={onChopsChange}
          seekTime={seekTime}
          onSeek={onSeek}
          getPlaybackTime={getPlaybackTime}
        />

        <ChopTable
          chops={track.chops}
          paletteMode={paletteMode}
          selectedId={isActive ? selectedChopId : null}
          onSelect={handleSelectChop}
          onDelete={handleDeleteChop}
          onVolumeChange={handleTableVolumeChange}
          onTimeStretchChange={handleTableTimeStretchChange}
          onColorChange={handleTableColorChange}
        />
      </div>
    </section>
  );
});

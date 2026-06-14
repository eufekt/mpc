import type { Track } from "../lib/types";

type Props = {
  tracks: Track[];
  activeTrackId: string | null;
  loadedTrackIds: string[];
  onOpen: (trackId: string) => void;
  onRemove: (trackId: string) => void;
};

export function TrackList({
  tracks,
  activeTrackId,
  loadedTrackIds,
  onOpen,
  onRemove,
}: Props) {
  if (tracks.length === 0) {
    return <p className="hint">load audio to create a track</p>;
  }

  return (
    <ul className="track-list">
      {tracks.map((track, index) => {
        const loaded = loadedTrackIds.includes(track.id);
        const active = track.id === activeTrackId;
        return (
          <li key={track.id} className={active ? "active" : undefined}>
            <button
              type="button"
              onClick={() => loaded && onOpen(track.id)}
              disabled={!loaded}
              title={loaded ? "select track" : "still loading"}
            >
              {index + 1}. {track.name || "untitled"}
              {!loaded ? " (pending)" : ""}
            </button>
            <button
              type="button"
              onClick={() => onRemove(track.id)}
              aria-label={`remove track ${index + 1}`}
            >
              DEL
            </button>
          </li>
        );
      })}
    </ul>
  );
}

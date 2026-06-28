import type { Track } from "../lib/types";

type Props = {
  tracks: Track[];
  activeTrackId: string | null;
  onSelectTrack: (trackId: string) => void;
};

function formatPadKeys(track: Track): string {
  const keys = track.chops
    .map((chop) => chop.key?.toUpperCase())
    .filter((key): key is string => Boolean(key));
  return keys.length > 0 ? keys.join(" ") : "—";
}

export function TrackSidebar({ tracks, activeTrackId, onSelectTrack }: Props) {
  if (tracks.length === 0) return null;

  return (
    <aside className="track-sidebar" aria-label="Tracks">
      <div className="track-sidebar-header">TRACKS</div>
      <ul className="track-sidebar-list">
        {tracks.map((track, index) => {
          const isActive = track.id === activeTrackId;
          return (
            <li key={track.id}>
              <button
                type="button"
                className={`track-sidebar-item${isActive ? " active" : ""}`}
                onClick={() => onSelectTrack(track.id)}
                title={track.name}
              >
                <span className="track-sidebar-item-top">
                  <span className="track-sidebar-index">{index + 1}.</span>
                  <span className="track-sidebar-name">{track.name}</span>
                </span>
                <span className="track-sidebar-meta">
                  {track.chops.length} chop{track.chops.length === 1 ? "" : "s"}
                  {" · "}
                  {formatPadKeys(track)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

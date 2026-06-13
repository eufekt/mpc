type Props = {
  trackCount: number;
  activeTrackName: string | null;
  onOpen: () => void;
};

export function TracksSection({
  trackCount,
  activeTrackName,
  onOpen,
}: Props) {
  const label =
    trackCount > 0 ? `LOAD TRACK (${trackCount})` : "LOAD TRACK";

  return (
    <section className="tracks-trigger">
      <button type="button" onClick={onOpen}>
        {label}
      </button>
      {activeTrackName && (
        <span className="hint">{activeTrackName}</span>
      )}
    </section>
  );
}

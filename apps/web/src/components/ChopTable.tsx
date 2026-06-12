import type { Chop } from "../lib/types";

type Props = {
  chops: Chop[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

export function ChopTable({ chops, selectedId, onSelect, onDelete }: Props) {
  if (chops.length === 0) {
    return <p>no chops — drag on waveform to create</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th></th>
          <th>#</th>
          <th>start</th>
          <th>end</th>
          <th>key</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {chops.map((chop, index) => (
          <tr
            key={chop.id}
            className={selectedId === chop.id ? "selected" : undefined}
            onClick={() => onSelect(chop.id)}
          >
            <td>
              <span
                className="chop-color-swatch"
                style={{ backgroundColor: chop.color }}
                aria-hidden
              />
            </td>
            <td>{index + 1}</td>
            <td>{chop.start.toFixed(2)}</td>
            <td>{chop.end.toFixed(2)}</td>
            <td>{chop.key?.toUpperCase() ?? "—"}</td>
            <td>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(chop.id);
                }}
              >
                DEL
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

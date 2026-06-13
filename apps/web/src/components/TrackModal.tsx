import { useEffect, type ReactNode } from "react";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function TrackModal({ title, onClose, children }: Props) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="track-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="track-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="track-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="track-modal-header">
          <h2 id="track-modal-title">{title}</h2>
          <button type="button" onClick={onClose}>
            CLOSE
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

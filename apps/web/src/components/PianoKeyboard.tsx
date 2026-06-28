import { useCallback, useRef } from "react";
import type { CSSProperties } from "react";
import {
  buildPianoKeys,
  isBlackKey,
  isNoteInScale,
  type ScaleId,
} from "../lib/music";

type Props = {
  startMidiNote: number;
  octaveCount: number;
  rootMidiNote: number;
  scaleId: ScaleId;
  activeNotes: Set<number>;
  onNoteOn: (midiNote: number) => void;
  onNoteOff: (midiNote: number) => void;
};

export function PianoKeyboard({
  startMidiNote,
  octaveCount,
  rootMidiNote,
  scaleId,
  activeNotes,
  onNoteOn,
  onNoteOff,
}: Props) {
  const heldNotesRef = useRef(new Set<number>());

  const handlePointerDown = useCallback(
    (midiNote: number) => {
      if (!isNoteInScale(midiNote, rootMidiNote, scaleId)) return;
      heldNotesRef.current.add(midiNote);
      onNoteOn(midiNote);
    },
    [onNoteOn, rootMidiNote, scaleId],
  );

  const handlePointerUp = useCallback(
    (midiNote: number) => {
      if (heldNotesRef.current.delete(midiNote)) {
        onNoteOff(midiNote);
      }
    },
    [onNoteOff],
  );

  const handlePointerLeave = useCallback(() => {
    for (const note of heldNotesRef.current) {
      onNoteOff(note);
    }
    heldNotesRef.current.clear();
  }, [onNoteOff]);

  const allKeys = buildPianoKeys(startMidiNote, octaveCount);
  const whiteKeys = allKeys.filter((note) => !isBlackKey(note));
  const blackKeys = allKeys.filter((note) => isBlackKey(note));

  const whiteIndexByNote = new Map<number, number>();
  whiteKeys.forEach((note, index) => {
    whiteIndexByNote.set(note, index);
  });

  return (
    <div
      className="piano-keyboard"
      onPointerLeave={handlePointerLeave}
      onPointerUp={(event) => {
        if (event.target instanceof HTMLElement) {
          const note = Number(event.target.dataset.midiNote);
          if (Number.isFinite(note)) handlePointerUp(note);
        }
      }}
    >
      <div
        className="piano-keyboard-whites"
        style={
          {
            "--piano-white-count": whiteKeys.length,
          } as CSSProperties
        }
      >
        {whiteKeys.map((midiNote) => {
          const inScale = isNoteInScale(midiNote, rootMidiNote, scaleId);
          const isRoot = midiNote === rootMidiNote;
          const isActive = activeNotes.has(midiNote);
          return (
            <button
              key={midiNote}
              type="button"
              className={[
                "piano-key",
                "piano-key--white",
                isRoot ? "piano-key--root" : "",
                !inScale ? "piano-key--disabled" : "",
                isActive ? "piano-key--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-midi-note={midiNote}
              disabled={!inScale}
              onPointerDown={(event) => {
                event.preventDefault();
                handlePointerDown(midiNote);
              }}
              aria-label={`${midiNote}`}
            />
          );
        })}
      </div>
      <div className="piano-keyboard-blacks">
        {blackKeys.map((midiNote) => {
          const whiteIndex = whiteIndexByNote.get(midiNote - 1);
          if (whiteIndex === undefined) return null;
          const inScale = isNoteInScale(midiNote, rootMidiNote, scaleId);
          const isRoot = midiNote === rootMidiNote;
          const isActive = activeNotes.has(midiNote);
          return (
            <button
              key={midiNote}
              type="button"
              className={[
                "piano-key",
                "piano-key--black",
                isRoot ? "piano-key--root" : "",
                !inScale ? "piano-key--disabled" : "",
                isActive ? "piano-key--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                {
                  "--piano-black-index": whiteIndex + 1,
                } as CSSProperties
              }
              data-midi-note={midiNote}
              disabled={!inScale}
              onPointerDown={(event) => {
                event.preventDefault();
                handlePointerDown(midiNote);
              }}
              aria-label={`${midiNote}`}
            />
          );
        })}
      </div>
    </div>
  );
}

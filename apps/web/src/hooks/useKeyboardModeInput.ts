import { useEffect, useRef } from "react";
import {
  getMidiNoteForComputerKey,
  isComputerPianoKey,
  isOctaveDownKey,
  isOctaveUpKey,
  isRootDownKey,
  isRootUpKey,
} from "../lib/computerPiano";
import { isTypingTarget } from "../lib/keyboard";
import {
  computerPianoStartNote,
  isNoteInScale,
  stepOctaveOffset,
  stepRootNote,
  type ScaleId,
} from "../lib/music";

type Options = {
  enabled: boolean;
  hasSelectedChop: boolean;
  rootMidiNote: number;
  octaveOffset: number;
  scaleId: ScaleId;
  onNoteOn: (midiNote: number) => void;
  onNoteOff: (midiNote: number) => void;
  onRootMidiNoteChange: (note: number) => void;
  onOctaveOffsetChange: (offset: number) => void;
};

export function useKeyboardModeInput({
  enabled,
  hasSelectedChop,
  rootMidiNote,
  octaveOffset,
  scaleId,
  onNoteOn,
  onNoteOff,
  onRootMidiNoteChange,
  onOctaveOffsetChange,
}: Options) {
  const enabledRef = useRef(enabled);
  const hasSelectedChopRef = useRef(hasSelectedChop);
  const rootMidiNoteRef = useRef(rootMidiNote);
  const octaveOffsetRef = useRef(octaveOffset);
  const scaleIdRef = useRef(scaleId);
  const onNoteOnRef = useRef(onNoteOn);
  const onNoteOffRef = useRef(onNoteOff);
  const onRootMidiNoteChangeRef = useRef(onRootMidiNoteChange);
  const onOctaveOffsetChangeRef = useRef(onOctaveOffsetChange);
  const heldKeysRef = useRef(new Map<string, number>());

  enabledRef.current = enabled;
  hasSelectedChopRef.current = hasSelectedChop;
  rootMidiNoteRef.current = rootMidiNote;
  octaveOffsetRef.current = octaveOffset;
  scaleIdRef.current = scaleId;
  onNoteOnRef.current = onNoteOn;
  onNoteOffRef.current = onNoteOff;
  onRootMidiNoteChangeRef.current = onRootMidiNoteChange;
  onOctaveOffsetChangeRef.current = onOctaveOffsetChange;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!enabledRef.current) return;
      if (isTypingTarget(event.target)) return;

      const key = event.key;

      if (isOctaveDownKey(key)) {
        event.preventDefault();
        onOctaveOffsetChangeRef.current(
          stepOctaveOffset(octaveOffsetRef.current, -1),
        );
        return;
      }

      if (isOctaveUpKey(key)) {
        event.preventDefault();
        onOctaveOffsetChangeRef.current(
          stepOctaveOffset(octaveOffsetRef.current, 1),
        );
        return;
      }

      if (isRootDownKey(key)) {
        event.preventDefault();
        onRootMidiNoteChangeRef.current(
          stepRootNote(rootMidiNoteRef.current, -1),
        );
        return;
      }

      if (isRootUpKey(key)) {
        event.preventDefault();
        onRootMidiNoteChangeRef.current(
          stepRootNote(rootMidiNoteRef.current, 1),
        );
        return;
      }

      if (!hasSelectedChopRef.current || !isComputerPianoKey(key)) return;
      if (event.repeat) return;

      const startNote = computerPianoStartNote(
        rootMidiNoteRef.current,
        octaveOffsetRef.current,
      );
      const midiNote = getMidiNoteForComputerKey(key, startNote);
      if (midiNote === null) return;

      if (
        !isNoteInScale(midiNote, rootMidiNoteRef.current, scaleIdRef.current)
      ) {
        return;
      }

      event.preventDefault();
      heldKeysRef.current.set(key, midiNote);
      onNoteOnRef.current(midiNote);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!enabledRef.current) return;
      if (isTypingTarget(event.target)) return;

      const key = event.key;
      const midiNote = heldKeysRef.current.get(key);
      if (midiNote === undefined) return;

      heldKeysRef.current.delete(key);
      onNoteOffRef.current(midiNote);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);
}

import { useEffect, useRef } from "react";
import { isLetterKey, isTypingTarget } from "../lib/keyboard";
import { getChopsForKey } from "../lib/pads";
import type { Track } from "../lib/types";

export type SelectedChop = {
  trackId: string;
  chopId: string;
};

type Options = {
  tracks: Track[];
  selectedChop: SelectedChop | null;
  playMode: boolean;
  hasAudio: boolean;
  onTogglePlayMode: () => void;
  onPlayKey: (key: string) => void;
  onBindKey: (trackId: string, key: string) => void;
  onPadPress?: (key: string) => void;
};

export function useSamplerKeyboard({
  tracks,
  selectedChop,
  playMode,
  hasAudio,
  onTogglePlayMode,
  onPlayKey,
  onBindKey,
  onPadPress,
}: Options) {
  const tracksRef = useRef(tracks);
  const selectedChopRef = useRef(selectedChop);
  const playModeRef = useRef(playMode);
  const hasAudioRef = useRef(hasAudio);
  tracksRef.current = tracks;
  selectedChopRef.current = selectedChop;
  playModeRef.current = playMode;
  hasAudioRef.current = hasAudio;

  const onTogglePlayModeRef = useRef(onTogglePlayMode);
  const onPlayKeyRef = useRef(onPlayKey);
  const onBindKeyRef = useRef(onBindKey);
  const onPadPressRef = useRef(onPadPress);
  onTogglePlayModeRef.current = onTogglePlayMode;
  onPlayKeyRef.current = onPlayKey;
  onBindKeyRef.current = onBindKey;
  onPadPressRef.current = onPadPress;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        onTogglePlayModeRef.current();
        return;
      }

      const key = event.key.toLowerCase();
      if (!isLetterKey(key)) return;

      const selection = selectedChopRef.current;

      if (selection) {
        const track = tracksRef.current.find((t) => t.id === selection.trackId);
        const chop = track?.chops.find((c) => c.id === selection.chopId);
        if (
          chop?.key?.toLowerCase() === key &&
          getChopsForKey(tracksRef.current, key).some(
            (b) => b.chop.id === selection.chopId,
          )
        ) {
          event.preventDefault();
          onPadPressRef.current?.(key.toUpperCase());
          onPlayKeyRef.current(key);
          return;
        }

        event.preventDefault();
        onBindKeyRef.current(selection.trackId, key);
        return;
      }

      if (!hasAudioRef.current || !playModeRef.current) return;

      const bound = getChopsForKey(tracksRef.current, key);
      if (bound.length === 0) return;

      event.preventDefault();
      onPadPressRef.current?.(key.toUpperCase());
      onPlayKeyRef.current(key);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

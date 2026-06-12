import { useEffect, useRef } from "react";
import type { Chop } from "../lib/types";

type Options = {
  chops: Chop[];
  onPlay: (chop: Chop) => void;
  onPadPress?: (key: string) => void;
  enabled: boolean;
};

export function useKeyboardSampler({
  chops,
  onPlay,
  onPadPress,
  enabled,
}: Options) {
  const chopsRef = useRef(chops);
  chopsRef.current = chops;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key.length !== 1 || key < "a" || key > "z") return;

      const chop = chopsRef.current.find(
        (c) => c.key?.toLowerCase() === key,
      );
      if (!chop) return;

      event.preventDefault();
      onPadPress?.(key.toUpperCase());
      onPlay(chop);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onPlay, onPadPress]);
}

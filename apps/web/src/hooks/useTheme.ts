import { useCallback, useState } from "react";
import {
  applyTheme,
  persistTheme,
  readTheme,
  type Theme,
} from "../lib/theme";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readTheme);

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    persistTheme(next);
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}

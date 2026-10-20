"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  applyHomeThemeToDocument,
  readHomeThemePreference,
  resolveHomeTheme,
  systemPrefersDark,
  writeHomeThemePreference,
  type HomeResolvedTheme,
  type HomeThemePreference,
} from "@/lib/home/theme";

type ThemeContextValue = {
  preference: HomeThemePreference;
  resolved: HomeResolvedTheme;
  setPreference: (preference: HomeThemePreference) => void;
  toggleDark: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function subscribeSystemTheme(onStoreChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getSystemDarkSnapshot() {
  return systemPrefersDark();
}

function getServerSystemDarkSnapshot() {
  return false;
}

export function HomeThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<HomeThemePreference>("system");
  const [hydrated, setHydrated] = useState(false);
  const systemDark = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemDarkSnapshot,
    getServerSystemDarkSnapshot,
  );

  useEffect(() => {
    setPreferenceState(readHomeThemePreference());
    setHydrated(true);
  }, []);

  const resolved: HomeResolvedTheme = useMemo(() => {
    if (!hydrated) {
      // Match bootstrap script / SSR light default until client reads storage.
      if (typeof document !== "undefined") {
        const boot = document.documentElement.dataset.homeTheme;
        if (boot === "dark" || boot === "light") return boot;
      }
      return "light";
    }
    if (preference === "system") {
      return systemDark ? "dark" : "light";
    }
    return preference;
  }, [hydrated, preference, systemDark]);

  useEffect(() => {
    applyHomeThemeToDocument(resolved);
  }, [resolved]);

  const setPreference = useCallback((next: HomeThemePreference) => {
    setPreferenceState(next);
    writeHomeThemePreference(next);
    applyHomeThemeToDocument(resolveHomeTheme(next));
  }, []);

  const toggleDark = useCallback(() => {
    setPreference(resolved === "dark" ? "light" : "dark");
  }, [resolved, setPreference]);

  const value = useMemo(
    () => ({ preference, resolved, setPreference, toggleDark }),
    [preference, resolved, setPreference, toggleDark],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useHomeTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useHomeTheme must be used within HomeThemeProvider");
  }
  return ctx;
}

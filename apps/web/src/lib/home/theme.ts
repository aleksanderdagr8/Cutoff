export const HOME_THEME_STORAGE_KEY = "cutoff-home-theme";

export type HomeThemePreference = "light" | "dark" | "system";
export type HomeResolvedTheme = "light" | "dark";

export function isHomeThemePreference(value: unknown): value is HomeThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function readHomeThemePreference(): HomeThemePreference {
  try {
    const raw = window.localStorage.getItem(HOME_THEME_STORAGE_KEY);
    if (isHomeThemePreference(raw)) return raw;
  } catch {
    /* private mode / blocked storage */
  }
  return "system";
}

export function writeHomeThemePreference(preference: HomeThemePreference): void {
  try {
    window.localStorage.setItem(HOME_THEME_STORAGE_KEY, preference);
  } catch {
    /* private mode / blocked storage */
  }
}

export function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveHomeTheme(
  preference: HomeThemePreference,
): HomeResolvedTheme {
  if (preference === "system") {
    return systemPrefersDark() ? "dark" : "light";
  }
  return preference;
}

/** Apply resolved theme for FOUC + runtime; scoped via html dataset for .home-shell CSS. */
export function applyHomeThemeToDocument(resolved: HomeResolvedTheme): void {
  document.documentElement.dataset.homeTheme = resolved;
}

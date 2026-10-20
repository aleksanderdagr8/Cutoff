import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOME_THEME_STORAGE_KEY,
  isHomeThemePreference,
  readHomeThemePreference,
  resolveHomeTheme,
  writeHomeThemePreference,
} from "./theme";

describe("home theme preference", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    vi.stubGlobal("window", {
      localStorage: globalThis.localStorage,
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts light, dark, system", () => {
    expect(isHomeThemePreference("light")).toBe(true);
    expect(isHomeThemePreference("dark")).toBe(true);
    expect(isHomeThemePreference("system")).toBe(true);
    expect(isHomeThemePreference("neon")).toBe(false);
  });

  it("defaults to system and persists explicit override", () => {
    expect(readHomeThemePreference()).toBe("system");
    writeHomeThemePreference("dark");
    expect(store.get(HOME_THEME_STORAGE_KEY)).toBe("dark");
    expect(readHomeThemePreference()).toBe("dark");
    writeHomeThemePreference("light");
    expect(readHomeThemePreference()).toBe("light");
  });

  it("resolves system from matchMedia", () => {
    vi.stubGlobal("window", {
      localStorage: globalThis.localStorage,
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    });
    expect(resolveHomeTheme("system")).toBe("dark");
    expect(resolveHomeTheme("light")).toBe("light");
  });
});

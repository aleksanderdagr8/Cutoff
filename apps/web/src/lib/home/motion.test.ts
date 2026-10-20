import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOME_WORDMARK_ENTER_KEY,
  markHomeWordmarkEnterPlayed,
  peekHomeWordmarkEnter,
} from "./motion";

describe("home wordmark enter gate", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    const sessionStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    };
    vi.stubGlobal("sessionStorage", sessionStorage);
    vi.stubGlobal("window", { sessionStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plays once then stays quiet for the tab session", () => {
    expect(peekHomeWordmarkEnter()).toBe(true);
    markHomeWordmarkEnterPlayed();
    expect(store.get(HOME_WORDMARK_ENTER_KEY)).toBe("1");
    expect(peekHomeWordmarkEnter()).toBe(false);
  });
});

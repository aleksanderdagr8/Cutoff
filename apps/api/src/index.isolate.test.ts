import { afterEach, describe, expect, it } from "vitest";
import {
  buildWorkerBindingsForTests,
  resetApiIsolateCacheForTests,
} from "./index.js";

afterEach(() => {
  resetApiIsolateCacheForTests();
});

describe("Worker isolate bindings cache", () => {
  it("reuses the same memory repos across builds (quote→commit across HTTP)", () => {
    const a = buildWorkerBindingsForTests();
    const b = buildWorkerBindingsForTests();
    expect(a.quotes).toBe(b.quotes);
    expect(a.orders).toBe(b.orders);
    expect(a.agents).toBe(b.agents);
    expect(a.traceId).not.toBe(b.traceId);
  });

  it("rebuilds when switching to a different repos cache key", () => {
    const memory = buildWorkerBindingsForTests();
    resetApiIsolateCacheForTests();
    const again = buildWorkerBindingsForTests();
    expect(again.quotes).not.toBe(memory.quotes);
  });
});

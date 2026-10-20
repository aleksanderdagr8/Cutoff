import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DEMO_HOUSEHOLD_ID,
  getHomeStore,
  getMandateForSession,
  listKeysForSession,
  listLinesForSession,
  resetHomeStoreForTests,
} from "./store";
import type { HomeSession } from "./types";

afterEach(() => {
  resetHomeStoreForTests();
});

describe("home store demo seed", () => {
  it("single-flights concurrent cold-start seed (Promise.all pattern)", async () => {
    const liveSession: HomeSession = {
      memberId: "01LIVEAUTHMEMBER00000000001",
      householdId: "01LIVEAUTHHOUSEHOLD0000001",
      email: "aleks@example.com",
      householdName: "Aleks Home",
    };

    // Mirrors apps/web/src/app/home/page.tsx after Auth resolves a session.
    const [lines, mandate, keys] = await Promise.all([
      listLinesForSession(liveSession),
      getMandateForSession(liveSession),
      listKeysForSession(liveSession),
    ]);

    expect(lines).toEqual([]);
    expect(mandate).toBeNull();
    expect(keys).toEqual([]);

    const store = await getHomeStore();
    expect(store.seeded).toBe(true);
    expect(store.demoHouseholdId).toBe(DEMO_HOUSEHOLD_ID);
    expect(store.mandates.listForHousehold(DEMO_HOUSEHOLD_ID)).toHaveLength(1);
  });

  it("survives a burst of overlapping getHomeStore calls", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => getHomeStore()),
    );
    const first = results[0]!;
    expect(results.every((r) => r === first)).toBe(true);
    expect(first.seeded).toBe(true);
    expect(first.list.listForHousehold(DEMO_HOUSEHOLD_ID).length).toBeGreaterThan(
      0,
    );
  });
});

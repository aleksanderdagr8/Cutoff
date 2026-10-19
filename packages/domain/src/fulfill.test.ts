import { describe, expect, it } from "vitest";
import {
  acceptInboundShipmentEvent,
  canCancelOrder,
  isLateShip,
  signaturesEqual,
} from "./fulfill.js";

describe("canCancelOrder", () => {
  it("allows cancel before ship when mandate permits", () => {
    expect(
      canCancelOrder({ status: "placed", allowCancel: true }),
    ).toEqual({ ok: true });
    expect(
      canCancelOrder({ status: "captured", allowCancel: true }),
    ).toEqual({ ok: true });
  });

  it("returns not_cancellable after ship", () => {
    expect(
      canCancelOrder({ status: "shipped", allowCancel: true }),
    ).toEqual({ ok: false, error: "not_cancellable" });
    expect(
      canCancelOrder({ status: "delivered", allowCancel: true }),
    ).toEqual({ ok: false, error: "not_cancellable" });
  });

  it("returns mandate_miss when cancel not allowed", () => {
    expect(
      canCancelOrder({ status: "placed", allowCancel: false }),
    ).toEqual({ ok: false, error: "mandate_miss" });
  });
});

describe("acceptInboundShipmentEvent", () => {
  it("accepts a fresh unique event", () => {
    expect(
      acceptInboundShipmentEvent({
        eventId: "evt_1",
        eventTimestampUtc: "2026-10-19T12:00:00.000Z",
        nowUtc: "2026-10-19T12:01:00.000Z",
        seenEventIds: new Set(),
      }),
    ).toEqual({ ok: true });
  });

  it("dedupes by event id", () => {
    expect(
      acceptInboundShipmentEvent({
        eventId: "evt_1",
        eventTimestampUtc: "2026-10-19T12:00:00.000Z",
        nowUtc: "2026-10-19T12:01:00.000Z",
        seenEventIds: new Set(["evt_1"]),
      }),
    ).toEqual({ ok: false, reason: "duplicate" });
  });

  it("rejects outside replay window", () => {
    expect(
      acceptInboundShipmentEvent({
        eventId: "evt_2",
        eventTimestampUtc: "2026-10-19T10:00:00.000Z",
        nowUtc: "2026-10-19T12:00:00.000Z",
        seenEventIds: new Set(),
      }),
    ).toEqual({ ok: false, reason: "replay_window" });
  });
});

describe("isLateShip / signaturesEqual", () => {
  it("flags late ship", () => {
    expect(isLateShip("2026-10-20", "2026-10-21T00:00:00.000Z")).toBe(true);
    expect(isLateShip("2026-10-22", "2026-10-21T00:00:00.000Z")).toBe(false);
  });

  it("compares signatures", () => {
    expect(signaturesEqual("abc", "abc")).toBe(true);
    expect(signaturesEqual("abc", "abd")).toBe(false);
    expect(signaturesEqual("ab", "abc")).toBe(false);
  });
});

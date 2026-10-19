import "server-only";

import { FakePayAdapter } from "@cutoff/adapters";
import {
  MemoryAgentCredentialRepository,
  MemoryFulfillmentRepository,
  MemoryHouseholdRepository,
  MemoryListRepository,
  MemoryMandateRepository,
  MemoryOrderRepository,
  MemoryQuoteRepository,
  MemoryReceiptRepository,
  MemoryRevocationKv,
  MemoryRiskRepository,
  seedFixtureCatalog,
  ulid,
  type EvidenceRow,
  type OrderRow,
  type QuoteRow,
} from "@cutoff/db";
import { assembleEvidencePack } from "@cutoff/domain";
import type { OpsSession } from "./session";
import type {
  OpsAlertView,
  OpsAuditView,
  OpsFlowRowView,
  OpsFulfillerView,
  OpsHouseholdView,
  OpsLiveView,
  OpsMandateView,
  OpsNeverCommittedView,
  OpsOrderAction,
  OpsOrderSheetView,
} from "./types";

type OpsAuditRow = {
  auditId: string;
  atUtc: string;
  actorId: string;
  action: string;
  targetId: string | null;
  reason: string;
  orderId: string | null;
};

type OpsStoreState = {
  households: MemoryHouseholdRepository;
  mandates: MemoryMandateRepository;
  agents: MemoryAgentCredentialRepository;
  list: MemoryListRepository;
  catalog: ReturnType<typeof seedFixtureCatalog>;
  quotes: MemoryQuoteRepository;
  orders: MemoryOrderRepository;
  receipts: MemoryReceiptRepository;
  risk: MemoryRiskRepository;
  fulfill: MemoryFulfillmentRepository;
  audits: OpsAuditRow[];
  demoOperator: OpsSession;
  seeded: boolean;
};

const globalKey = "__cutoff_ops_store__" as const;

function emptyState(): OpsStoreState {
  const kv = new MemoryRevocationKv();
  const pay = new FakePayAdapter();
  return {
    households: new MemoryHouseholdRepository(),
    mandates: new MemoryMandateRepository(),
    agents: new MemoryAgentCredentialRepository(kv),
    list: new MemoryListRepository(),
    catalog: seedFixtureCatalog(),
    quotes: new MemoryQuoteRepository(),
    orders: new MemoryOrderRepository(pay),
    receipts: new MemoryReceiptRepository(),
    risk: new MemoryRiskRepository(),
    fulfill: new MemoryFulfillmentRepository(),
    audits: [],
    demoOperator: {
      operatorId: "op_demo",
      email: "ops@cutoff.local",
      displayName: "Demo Operator",
    },
    seeded: false,
  };
}

function getState(): OpsStoreState {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: OpsStoreState;
  };
  if (!g[globalKey]) {
    g[globalKey] = emptyState();
  }
  return g[globalKey];
}

function pushAudit(
  state: OpsStoreState,
  input: {
    actorId: string;
    action: string;
    targetId: string | null;
    reason: string;
    orderId: string | null;
    atUtc?: string;
  },
): OpsAuditRow {
  const row: OpsAuditRow = {
    auditId: ulid(),
    atUtc: input.atUtc ?? new Date().toISOString(),
    actorId: input.actorId,
    action: input.action,
    targetId: input.targetId,
    reason: input.reason,
    orderId: input.orderId,
  };
  state.audits.push(row);
  return row;
}

function householdName(state: OpsStoreState, householdId: string): string {
  const row = state.households
    .listHouseholds()
    .find((h) => h.householdId === householdId);
  return row?.name ?? householdId;
}

function itemLabel(state: OpsStoreState, canonicalItemId: string): string {
  const item = state.catalog.get(canonicalItemId);
  if (!item) return canonicalItemId;
  return `${item.brand} · ${item.description}`;
}

async function seedIfNeeded(): Promise<OpsStoreState> {
  const state = getState();
  if (state.seeded) return state;

  const t0 = "2026-10-19T11:40:00.000Z";
  const t1 = "2026-10-19T11:42:00.000Z";
  const t2 = "2026-10-19T11:55:00.000Z";
  const t3 = "2026-10-19T12:05:00.000Z";
  const nowUtc = "2026-10-19T12:10:00.000Z";

  const home = state.households.createHousehold(
    "Demo Home",
    "member@cutoff.local",
  );
  const loft = state.households.createHousehold(
    "River Loft",
    "loft@cutoff.local",
  );

  const homeMandate = state.mandates.create({
    householdId: home.household.householdId,
    ceilingCents: 5000,
    expiresAtUtc: "2027-01-01T00:00:00.000Z",
    canonicalItemIds: [
      "item_towels_12",
      "item_coffee_12oz",
      "item_filter_1",
    ],
    neverSubstituteIds: ["item_towels_12"],
    addressId: "addr_home",
    allowCancel: true,
  });
  const loftMandate = state.mandates.create({
    householdId: loft.household.householdId,
    ceilingCents: 3500,
    expiresAtUtc: "2027-01-01T00:00:00.000Z",
    canonicalItemIds: ["item_coffee_12oz", "item_filter_1"],
    neverSubstituteIds: [],
    addressId: "addr_loft",
    allowCancel: true,
  });

  const homeKey = await state.agents.issue({
    householdId: home.household.householdId,
    scopes: ["quote", "commit", "read_list"],
    mandateIds: [homeMandate.mandateId],
  });
  const loftKey = await state.agents.issue({
    householdId: loft.household.householdId,
    scopes: ["quote", "commit", "read_list"],
    mandateIds: [loftMandate.mandateId],
  });

  const towelsLine = state.list.upsert({
    householdId: home.household.householdId,
    mandateId: homeMandate.mandateId,
    canonicalItemId: "item_towels_12",
    cadenceHintDays: 28,
    neverSubstitute: true,
    nowUtc: t0,
  });
  state.list.upsert({
    householdId: home.household.householdId,
    mandateId: homeMandate.mandateId,
    canonicalItemId: "item_coffee_12oz",
    cadenceHintDays: 21,
    neverSubstitute: false,
    nowUtc: t0,
  });
  const loftCoffee = state.list.upsert({
    householdId: loft.household.householdId,
    mandateId: loftMandate.mandateId,
    canonicalItemId: "item_coffee_12oz",
    cadenceHintDays: 14,
    neverSubstitute: false,
    nowUtc: t0,
  });

  // Order 1: towels committed + placed (live flow row)
  const towelsQuote = state.quotes.create({
    householdId: home.household.householdId,
    mandateId: homeMandate.mandateId,
    agentKeyId: homeKey.keyId,
    canonicalItemId: "item_towels_12",
    qty: 1,
    landedCents: 1299,
    taxCents: 99,
    unitPriceCents: 1200,
    deliveryDateUtc: "2026-10-22",
    fulfillerId: "fulfiller_a",
    offerId: "offer_seed_towels",
    scoreInputs: {
      landedCents: 1299,
      deliveryDateUtc: "2026-10-22",
      merchantScore: 0,
    },
    addressId: "addr_home",
    ceilingCents: homeMandate.ceilingCents,
    nowUtc: t0,
  });
  if (!towelsQuote.ok) throw new Error("ops_seed_towels_quote");
  state.quotes.markCommitted(towelsQuote.quote.quoteId, t1);

  const towelsCommit = await state.orders.commitWithEvidence({
    householdId: home.household.householdId,
    canonicalItemId: "item_towels_12",
    quoteId: towelsQuote.quote.quoteId,
    amountCents: 1299,
    idempotencyKey: "ops_seed_towels",
    mandate: state.mandates.toSnapshot(homeMandate),
    addressId: "addr_home",
    nowUtc: t1,
    actorChain: ["human.member", "agent.buyer", "cutoff.commit"],
    protocol: "cutoff.v1",
    agentKeyId: homeKey.keyId,
    mandateId: homeMandate.mandateId,
    quoteHashMaterial: towelsQuote.quote.quoteId,
  });
  if (!towelsCommit.ok) throw new Error("ops_seed_towels_commit");
  state.orders.appendStatus(towelsCommit.order.orderId, "placed", t2);
  state.list.recordQuote(towelsLine.lineId, towelsQuote.quote.quoteId);
  state.list.recordOrder(towelsLine.lineId, towelsCommit.order.orderId, t2);
  state.receipts.issue({
    orderId: towelsCommit.order.orderId,
    householdId: home.household.householdId,
    nowUtc: t2,
  });
  state.risk.recordScoreEvent({
    fulfillerId: "fulfiller_a",
    kind: "on_time",
    orderId: towelsCommit.order.orderId,
    atUtc: t2,
    actorId: "system.fulfill",
  });

  // Order 2: loft coffee captured, not yet placed (stuck-ish)
  const coffeeQuote = state.quotes.create({
    householdId: loft.household.householdId,
    mandateId: loftMandate.mandateId,
    agentKeyId: loftKey.keyId,
    canonicalItemId: "item_coffee_12oz",
    qty: 1,
    landedCents: 1899,
    taxCents: 140,
    unitPriceCents: 1759,
    deliveryDateUtc: "2026-10-23",
    fulfillerId: "fulfiller_b",
    offerId: "offer_seed_coffee",
    scoreInputs: {
      landedCents: 1899,
      deliveryDateUtc: "2026-10-23",
      merchantScore: 0,
    },
    addressId: "addr_loft",
    ceilingCents: loftMandate.ceilingCents,
    nowUtc: t2,
  });
  if (!coffeeQuote.ok) throw new Error("ops_seed_coffee_quote");
  state.quotes.markCommitted(coffeeQuote.quote.quoteId, t3);

  const coffeeCommit = await state.orders.commitWithEvidence({
    householdId: loft.household.householdId,
    canonicalItemId: "item_coffee_12oz",
    quoteId: coffeeQuote.quote.quoteId,
    amountCents: 1899,
    idempotencyKey: "ops_seed_coffee",
    mandate: state.mandates.toSnapshot(loftMandate),
    addressId: "addr_loft",
    nowUtc: t3,
    actorChain: ["human.member", "agent.buyer", "cutoff.commit"],
    protocol: "cutoff.v1",
    agentKeyId: loftKey.keyId,
    mandateId: loftMandate.mandateId,
    quoteHashMaterial: coffeeQuote.quote.quoteId,
  });
  if (!coffeeCommit.ok) throw new Error("ops_seed_coffee_commit");
  state.list.recordQuote(loftCoffee.lineId, coffeeQuote.quote.quoteId);
  state.list.recordOrder(loftCoffee.lineId, coffeeCommit.order.orderId, t3);

  // Never-committed lane: open hold on filter that never committed
  const filterQuote = state.quotes.create({
    householdId: home.household.householdId,
    mandateId: homeMandate.mandateId,
    agentKeyId: homeKey.keyId,
    canonicalItemId: "item_filter_1",
    qty: 1,
    landedCents: 2499,
    taxCents: 180,
    unitPriceCents: 2319,
    deliveryDateUtc: "2026-10-25",
    fulfillerId: "fulfiller_a",
    offerId: "offer_seed_filter",
    scoreInputs: {
      landedCents: 2499,
      deliveryDateUtc: "2026-10-25",
      merchantScore: 0,
    },
    addressId: "addr_home",
    ceilingCents: homeMandate.ceilingCents,
    nowUtc: "2026-10-19T12:00:00.000Z",
    ttlMs: 60 * 60 * 1000,
  });
  if (!filterQuote.ok) throw new Error("ops_seed_filter_quote");

  state.list.upsert({
    householdId: home.household.householdId,
    mandateId: homeMandate.mandateId,
    canonicalItemId: "item_filter_1",
    cadenceHintDays: 90,
    neverSubstitute: true,
    nowUtc: t0,
  });

  state.risk.recordScoreEvent({
    fulfillerId: "fulfiller_b",
    kind: "late",
    orderId: null,
    atUtc: t1,
    actorId: "system.fulfill",
  });
  state.risk.recordMerchantStrike("fulfiller_b", "late_ship");

  pushAudit(state, {
    actorId: state.demoOperator.operatorId,
    action: "seed",
    targetId: null,
    reason: "ops demo seed",
    orderId: null,
    atUtc: nowUtc,
  });

  state.seeded = true;
  return state;
}

export async function getOpsStore(): Promise<OpsStoreState> {
  return seedIfNeeded();
}

export async function demoOpsSession(): Promise<OpsSession> {
  const state = await getOpsStore();
  return { ...state.demoOperator };
}

function auditView(row: OpsAuditRow): OpsAuditView {
  return {
    audit_id: row.auditId,
    at_utc: row.atUtc,
    actor_id: row.actorId,
    action: row.action,
    target_id: row.targetId,
    reason: row.reason,
    order_id: row.orderId,
  };
}

function flowRow(
  state: OpsStoreState,
  order: OrderRow,
  lastEvent: string,
  atUtc: string,
): OpsFlowRowView {
  const quote = state.quotes.get(order.quoteId);
  const evidence = state.orders.getEvidence(order.orderId);
  return {
    order_id: order.orderId,
    at_utc: atUtc,
    household_id: order.householdId,
    household_name: householdName(state, order.householdId),
    item_description: itemLabel(state, order.canonicalItemId),
    landed_cents: order.amountCents,
    fulfiller_id: quote?.fulfillerId ?? "—",
    agent_key_id: evidence?.agentKeyId ?? quote?.agentKeyId ?? "—",
    last_event: lastEvent,
  };
}

function neverCommittedView(
  state: OpsStoreState,
  quote: QuoteRow,
  nowUtc: string,
): OpsNeverCommittedView {
  return {
    quote_id: quote.quoteId,
    household_id: quote.householdId,
    household_name: householdName(state, quote.householdId),
    item_description: itemLabel(state, quote.canonicalItemId),
    landed_cents: quote.landedCents,
    fulfiller_id: quote.fulfillerId,
    created_at: quote.createdAt,
    expires_at: quote.expiresAtUtc,
    expired: Date.parse(nowUtc) >= Date.parse(quote.expiresAtUtc),
  };
}

function buildAlerts(state: OpsStoreState, nowUtc: string): OpsAlertView[] {
  const alerts: OpsAlertView[] = [];
  if (state.risk.killSwitch) {
    alerts.push({
      alert_id: "kill_switch",
      severity: "critical",
      title: "Kill switch on",
      detail: "New commits are blocked until an operator turns it off.",
      href: "/ops/live",
    });
  }

  const openHolds = state.quotes.listOpenHolds();
  for (const hold of openHolds) {
    const quote = state.quotes.get(hold.quoteId);
    if (!quote || quote.committedAtUtc) continue;
    const ageMin =
      (Date.parse(nowUtc) - Date.parse(quote.createdAt)) / 60_000;
    if (ageMin >= 5) {
      alerts.push({
        alert_id: `hold_${quote.quoteId}`,
        severity: "warn",
        title: "Never-committed quote",
        detail: `${householdName(state, quote.householdId)} · ${itemLabel(state, quote.canonicalItemId)}`,
        href: "/ops/live",
      });
    }
  }

  for (const order of state.orders.list()) {
    if (order.status === "captured") {
      const ageMin =
        (Date.parse(nowUtc) - Date.parse(order.createdAt)) / 60_000;
      if (ageMin >= 8) {
        alerts.push({
          alert_id: `stuck_${order.orderId}`,
          severity: "warn",
          title: "Captured, not placed",
          detail: `${householdName(state, order.householdId)} · ${itemLabel(state, order.canonicalItemId)}`,
          href: `/ops/orders/${order.orderId}`,
        });
      }
    }
  }

  for (const score of state.risk.listMerchantScores()) {
    if (state.risk.isMerchantSuspended(score.fulfillerId)) {
      alerts.push({
        alert_id: `suspend_${score.fulfillerId}`,
        severity: "info",
        title: "Fulfiller suspended",
        detail: score.fulfillerId,
        href: "/ops/fulfillers",
      });
    }
  }

  return alerts;
}

export async function getLiveView(nowUtc = new Date().toISOString()): Promise<OpsLiveView> {
  const state = await getOpsStore();
  const rows: OpsFlowRowView[] = [];

  for (const order of state.orders.list()) {
    const events = state.orders.listEvents(order.orderId);
    const last = events[events.length - 1];
    rows.push(
      flowRow(
        state,
        order,
        last?.status ?? order.status,
        last?.atUtc ?? order.createdAt,
      ),
    );
  }
  rows.sort((a, b) => Date.parse(b.at_utc) - Date.parse(a.at_utc));

  const never_committed: OpsNeverCommittedView[] = [];
  for (const hold of state.quotes.listOpenHolds()) {
    const quote = state.quotes.get(hold.quoteId);
    if (!quote || quote.committedAtUtc) continue;
    never_committed.push(neverCommittedView(state, quote, nowUtc));
  }
  never_committed.sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );

  return {
    rows,
    never_committed,
    alerts: buildAlerts(state, nowUtc),
    kill_switch: state.risk.killSwitch,
  };
}

function availableActions(
  state: OpsStoreState,
  order: OrderRow,
  evidence: EvidenceRow | null,
  openHoldQuoteId: string | null,
  linePaused: boolean,
): OpsOrderAction[] {
  const actions: OpsOrderAction[] = [];
  if (state.risk.killSwitch) {
    actions.push("kill_switch_off");
  } else {
    actions.push("kill_switch_on");
  }
  if (evidence?.agentKeyId) {
    const key = state.agents.selectByKeyId(evidence.agentKeyId);
    if (key && !key.revokedAt) actions.push("revoke_key");
  }
  if (order.status === "captured" || order.status === "placed") {
    actions.push("cancel_before_ship");
  }
  if (
    order.status === "captured" ||
    order.status === "placed" ||
    order.status === "shipped" ||
    order.status === "delivered"
  ) {
    actions.push("refund");
  }
  if (openHoldQuoteId) actions.push("release_hold");
  if (!linePaused) actions.push("pause_line");
  actions.push("replay_webhook");
  return actions;
}

export async function getOrderSheet(
  orderId: string,
): Promise<OpsOrderSheetView | null> {
  const state = await getOpsStore();
  const order = state.orders.get(orderId);
  if (!order) return null;

  const quote = state.quotes.get(order.quoteId);
  const evidence = state.orders.getEvidence(orderId);
  const item = state.catalog.get(order.canonicalItemId);
  const events = state.orders.listEvents(orderId).map((e) => ({
    event_id: e.eventId,
    status: e.status,
    at_utc: e.atUtc,
  }));

  const lines = state.list.listForHousehold(order.householdId);
  const line =
    lines.find((l) => l.lastOrderId === order.orderId) ??
    lines.find((l) => l.canonicalItemId === order.canonicalItemId) ??
    null;

  const openHold = state.quotes.openHold(
    order.householdId,
    order.canonicalItemId,
  );

  let rank: OpsOrderSheetView["rank_inputs"] = null;
  if (quote) {
    rank = {
      landed_cents: quote.scoreInputs.landedCents,
      delivery_date_utc: quote.scoreInputs.deliveryDateUtc,
      merchant_score: quote.scoreInputs.merchantScore,
    };
  }

  let evidenceView: OpsOrderSheetView["evidence"] = null;
  if (evidence) {
    evidenceView = {
      evidence_id: evidence.evidenceId,
      actor_chain: [...evidence.actorChain],
      protocol: evidence.protocol,
      agent_key_id: evidence.agentKeyId,
      mandate_id: evidence.mandateId,
      quote_hash: evidence.quoteHash,
      address_id: evidence.addressId,
      amount_cents: evidence.amountCents,
    };
    if (quote) {
      assembleEvidencePack({
        orderId: order.orderId,
        evidenceId: evidence.evidenceId,
        actorChain: evidence.actorChain,
        protocol: evidence.protocol,
        agentKeyId: evidence.agentKeyId,
        mandateId: evidence.mandateId,
        quoteHash: evidence.quoteHash,
        addressId: evidence.addressId,
        amountCents: evidence.amountCents,
        fulfillerId: quote.fulfillerId,
        quoteId: quote.quoteId,
        canonicalItemId: order.canonicalItemId,
        rankInputs: quote.scoreInputs,
      });
    }
  }

  return {
    order_id: order.orderId,
    household_id: order.householdId,
    household_name: householdName(state, order.householdId),
    canonical_item_id: order.canonicalItemId,
    item_description: item?.description ?? order.canonicalItemId,
    brand: item?.brand ?? "",
    status: order.status,
    landed_cents: order.amountCents,
    fulfiller_id: quote?.fulfillerId ?? "—",
    quote_id: order.quoteId,
    agent_key_id: evidence?.agentKeyId ?? quote?.agentKeyId ?? "—",
    mandate_id: evidence?.mandateId ?? quote?.mandateId ?? "—",
    events,
    evidence: evidenceView,
    rank_inputs: rank,
    open_hold_quote_id: openHold?.quoteId ?? null,
    list_line_id: line?.lineId ?? null,
    line_paused: Boolean(line?.paused),
    available_actions: availableActions(
      state,
      order,
      evidence,
      openHold?.quoteId ?? null,
      Boolean(line?.paused),
    ),
  };
}

export async function runOrderAction(
  session: OpsSession,
  orderId: string,
  action: OpsOrderAction,
  reason: string,
): Promise<
  | { ok: true; sheet: OpsOrderSheetView; audit: OpsAuditView }
  | { error: string; status: number }
> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    return { error: "reason_required", status: 400 };
  }

  const state = await getOpsStore();
  const order = state.orders.get(orderId);
  if (!order && action !== "kill_switch_on" && action !== "kill_switch_off") {
    return { error: "not_found", status: 404 };
  }

  const nowUtc = new Date().toISOString();
  const actorId = session.operatorId;
  let targetId: string | null = orderId;

  switch (action) {
    case "kill_switch_on": {
      state.risk.setKillSwitch(true, { actorId, atUtc: nowUtc });
      targetId = "kill_switch";
      break;
    }
    case "kill_switch_off": {
      state.risk.setKillSwitch(false, { actorId, atUtc: nowUtc });
      targetId = "kill_switch";
      break;
    }
    case "revoke_key": {
      const evidence = order ? state.orders.getEvidence(order.orderId) : null;
      const keyId = evidence?.agentKeyId;
      if (!keyId) return { error: "mandate_miss", status: 400 };
      await state.agents.revoke(keyId);
      targetId = keyId;
      break;
    }
    case "refund": {
      if (!order) return { error: "not_found", status: 404 };
      state.orders.appendStatus(order.orderId, "refunded", nowUtc);
      state.fulfill.enqueueRefund({
        orderId: order.orderId,
        amountCents: order.amountCents,
        reason: "human",
        nowUtc,
      });
      targetId = order.orderId;
      break;
    }
    case "cancel_before_ship": {
      if (!order) return { error: "not_found", status: 404 };
      if (order.status !== "captured" && order.status !== "placed") {
        return { error: "not_cancellable", status: 403 };
      }
      state.orders.appendStatus(order.orderId, "refunded", nowUtc);
      state.fulfill.enqueueRefund({
        orderId: order.orderId,
        amountCents: order.amountCents,
        reason: "cancel_before_ship",
        nowUtc,
      });
      targetId = order.orderId;
      break;
    }
    case "release_hold": {
      if (!order) return { error: "not_found", status: 404 };
      const hold = state.quotes.openHold(
        order.householdId,
        order.canonicalItemId,
      );
      if (!hold) return { error: "mandate_miss", status: 400 };
      const released = state.quotes.releaseHold(hold.quoteId);
      if (!released) return { error: "mandate_miss", status: 400 };
      targetId = hold.quoteId;
      break;
    }
    case "pause_line": {
      if (!order) return { error: "not_found", status: 404 };
      const lines = state.list.listForHousehold(order.householdId);
      const line =
        lines.find((l) => l.lastOrderId === order.orderId) ??
        lines.find((l) => l.canonicalItemId === order.canonicalItemId);
      if (!line) return { error: "mandate_miss", status: 400 };
      state.list.skip(line.lineId);
      targetId = line.lineId;
      break;
    }
    case "replay_webhook": {
      if (!order) return { error: "not_found", status: 404 };
      // Stub: audit only — outbound notify is Worker-owned.
      targetId = order.orderId;
      break;
    }
    default:
      return { error: "invalid_body", status: 400 };
  }

  const audit = pushAudit(state, {
    actorId,
    action,
    targetId,
    reason: trimmed,
    orderId: order?.orderId ?? null,
    atUtc: nowUtc,
  });

  const sheetOrderId = order?.orderId ?? orderId;
  const sheet = await getOrderSheet(sheetOrderId);
  if (!sheet && action !== "kill_switch_on" && action !== "kill_switch_off") {
    return { error: "not_found", status: 404 };
  }

  return {
    ok: true,
    sheet: sheet ?? {
      order_id: sheetOrderId,
      household_id: "",
      household_name: "",
      canonical_item_id: "",
      item_description: "",
      brand: "",
      status: "",
      landed_cents: 0,
      fulfiller_id: "",
      quote_id: "",
      agent_key_id: "",
      mandate_id: "",
      events: [],
      evidence: null,
      rank_inputs: null,
      open_hold_quote_id: null,
      list_line_id: null,
      line_paused: false,
      available_actions: [],
    },
    audit: auditView(audit),
  };
}

export async function releaseNeverCommitted(
  session: OpsSession,
  quoteId: string,
  reason: string,
): Promise<
  | { ok: true; audit: OpsAuditView }
  | { error: string; status: number }
> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) return { error: "reason_required", status: 400 };
  const state = await getOpsStore();
  const released = state.quotes.releaseHold(quoteId);
  if (!released) return { error: "not_found", status: 404 };
  const audit = pushAudit(state, {
    actorId: session.operatorId,
    action: "release_hold",
    targetId: quoteId,
    reason: trimmed,
    orderId: null,
  });
  return { ok: true, audit: auditView(audit) };
}

export async function listHouseholdsView(): Promise<OpsHouseholdView[]> {
  const state = await getOpsStore();
  return state.households.listHouseholds().map((h) => ({
    household_id: h.householdId,
    name: h.name,
    member_emails: state.households
      .listMembers(h.householdId)
      .map((m) => m.email),
    created_at: h.createdAt,
    order_count: state.orders.listForHousehold(h.householdId).length,
  }));
}

export async function listMandatesView(): Promise<OpsMandateView[]> {
  const state = await getOpsStore();
  return state.mandates.listAll().map((m) => ({
    mandate_id: m.mandateId,
    household_id: m.householdId,
    household_name: householdName(state, m.householdId),
    ceiling_cents: m.ceilingCents,
    expires_at: m.expiresAtUtc,
    address_id: m.addressId,
    never_substitute_ids: [...m.neverSubstituteIds],
  }));
}

export async function lowerMandateCeiling(
  session: OpsSession,
  mandateId: string,
  ceilingCents: number,
  reason: string,
): Promise<
  | { ok: true; mandate: OpsMandateView; audit: OpsAuditView }
  | { error: string; status: number }
> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) return { error: "reason_required", status: 400 };
  if (!Number.isInteger(ceilingCents) || ceilingCents < 0) {
    return { error: "invalid_body", status: 400 };
  }

  const state = await getOpsStore();
  const row = state.mandates.get(mandateId);
  if (!row) return { error: "not_found", status: 404 };

  const lowered = state.mandates.lowerCeiling(
    mandateId,
    row.householdId,
    ceilingCents,
  );
  if (!lowered) {
    return { error: "over_ceiling", status: 403 };
  }

  const audit = pushAudit(state, {
    actorId: session.operatorId,
    action: "lower_ceiling",
    targetId: mandateId,
    reason: trimmed,
    orderId: null,
  });

  return {
    ok: true,
    mandate: {
      mandate_id: lowered.mandateId,
      household_id: lowered.householdId,
      household_name: householdName(state, lowered.householdId),
      ceiling_cents: lowered.ceilingCents,
      expires_at: lowered.expiresAtUtc,
      address_id: lowered.addressId,
      never_substitute_ids: [...lowered.neverSubstituteIds],
    },
    audit: auditView(audit),
  };
}

export async function listFulfillersView(): Promise<OpsFulfillerView[]> {
  const state = await getOpsStore();
  const ids = new Set<string>(["fulfiller_a", "fulfiller_b", "fulfiller_brand"]);
  for (const score of state.risk.listMerchantScores()) {
    ids.add(score.fulfillerId);
  }
  for (const q of state.quotes.listAll()) {
    ids.add(q.fulfillerId);
  }

  return [...ids].sort().map((fulfillerId) => {
    const scoreRow = state.risk
      .listMerchantScores()
      .find((s) => s.fulfillerId === fulfillerId);
    return {
      fulfiller_id: fulfillerId,
      score: state.risk.merchantScore(fulfillerId),
      strikes: state.risk.merchantStrikeCount(fulfillerId),
      suspended: state.risk.isMerchantSuspended(fulfillerId),
      updated_at: scoreRow?.updatedAt ?? null,
    };
  });
}

export async function setFulfillerSuspended(
  session: OpsSession,
  fulfillerId: string,
  suspend: boolean,
  reason: string,
): Promise<
  | { ok: true; fulfiller: OpsFulfillerView; audit: OpsAuditView }
  | { error: string; status: number }
> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) return { error: "reason_required", status: 400 };
  const state = await getOpsStore();
  const nowUtc = new Date().toISOString();
  if (suspend) {
    state.risk.suspendMerchant(fulfillerId, {
      actorId: session.operatorId,
      atUtc: nowUtc,
    });
  } else {
    state.risk.resumeMerchant(fulfillerId, {
      actorId: session.operatorId,
      atUtc: nowUtc,
    });
  }
  const audit = pushAudit(state, {
    actorId: session.operatorId,
    action: suspend ? "suspend_fulfiller" : "resume_fulfiller",
    targetId: fulfillerId,
    reason: trimmed,
    orderId: null,
    atUtc: nowUtc,
  });
  const views = await listFulfillersView();
  const fulfiller = views.find((f) => f.fulfiller_id === fulfillerId);
  if (!fulfiller) return { error: "not_found", status: 404 };
  return { ok: true, fulfiller, audit: auditView(audit) };
}

export async function listAuditView(): Promise<OpsAuditView[]> {
  const state = await getOpsStore();
  const riskAudits = state.risk.listAudits().map((a) =>
    auditView({
      auditId: a.auditId,
      atUtc: a.atUtc,
      actorId: a.actorId,
      action: a.action,
      targetId: a.targetId,
      reason: "risk",
      orderId: null,
    }),
  );
  const all = [...state.audits.map(auditView), ...riskAudits];
  all.sort((a, b) => Date.parse(b.at_utc) - Date.parse(a.at_utc));
  return all;
}

import "server-only";

import { FakePayAdapter } from "@cutoff/adapters";
import {
  MemoryAgentCredentialRepository,
  MemoryHouseholdRepository,
  MemoryListRepository,
  MemoryMandateRepository,
  MemoryOrderRepository,
  MemoryQuoteRepository,
  MemoryReceiptRepository,
  MemoryRevocationKv,
  seedFixtureCatalog,
  type AgentCredentialRow,
  type ListLineRow,
  type MandateRow,
  type MemberRow,
} from "@cutoff/db";
import { canViewReceipt, receiptSkipAction, whyThisSeller } from "@cutoff/domain";
import type { ReceiptResponse } from "@cutoff/contracts";
import type { HomeSession } from "./session";
import type {
  HomeKeyView,
  HomeListLineView,
  HomeMandateView,
} from "./types";

export type { HomeKeyView, HomeListLineView, HomeMandateView } from "./types";

type HomeStoreState = {
  households: MemoryHouseholdRepository;
  mandates: MemoryMandateRepository;
  agents: MemoryAgentCredentialRepository;
  list: MemoryListRepository;
  catalog: ReturnType<typeof seedFixtureCatalog>;
  quotes: MemoryQuoteRepository;
  orders: MemoryOrderRepository;
  receipts: MemoryReceiptRepository;
  demoMember: MemberRow;
  demoHouseholdId: string;
  demoHouseholdName: string;
  seeded: boolean;
};

const globalKey = "__cutoff_home_store__" as const;

function emptyState(): HomeStoreState {
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
    demoMember: {
      memberId: "",
      householdId: "",
      email: "",
      createdAt: "",
    },
    demoHouseholdId: "",
    demoHouseholdName: "",
    seeded: false,
  };
}

function getState(): HomeStoreState {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: HomeStoreState;
  };
  if (!g[globalKey]) {
    g[globalKey] = emptyState();
  }
  return g[globalKey];
}

async function seedIfNeeded(): Promise<HomeStoreState> {
  const state = getState();
  if (state.seeded) return state;

  const nowUtc = "2026-10-19T12:00:00.000Z";
  const { household, member } = state.households.createHousehold(
    "Demo Home",
    "member@cutoff.local",
  );

  const mandate = state.mandates.create({
    householdId: household.householdId,
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

  await state.agents.issue({
    householdId: household.householdId,
    scopes: ["quote", "commit", "read_list"],
    mandateIds: [mandate.mandateId],
  });

  const towels = state.list.upsert({
    householdId: household.householdId,
    mandateId: mandate.mandateId,
    canonicalItemId: "item_towels_12",
    cadenceHintDays: 28,
    neverSubstitute: true,
    nowUtc,
  });
  state.list.upsert({
    householdId: household.householdId,
    mandateId: mandate.mandateId,
    canonicalItemId: "item_coffee_12oz",
    cadenceHintDays: 21,
    neverSubstitute: false,
    nowUtc,
  });
  const filter = state.list.upsert({
    householdId: household.householdId,
    mandateId: mandate.mandateId,
    canonicalItemId: "item_filter_1",
    cadenceHintDays: 90,
    neverSubstitute: true,
    nowUtc,
  });
  state.list.skip(filter.lineId);

  const agentRow = state.agents.listForHousehold(household.householdId)[0]!;
  const quote = state.quotes.create({
    householdId: household.householdId,
    mandateId: mandate.mandateId,
    agentKeyId: agentRow.keyId,
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
    ceilingCents: mandate.ceilingCents,
    nowUtc,
  });
  if (!quote.ok) {
    throw new Error("home_seed_quote_failed");
  }

  const commit = await state.orders.commit({
    householdId: household.householdId,
    canonicalItemId: "item_towels_12",
    quoteId: quote.quote.quoteId,
    amountCents: 1299,
    idempotencyKey: "home_seed_towels",
  });
  state.orders.appendStatus(commit.order.orderId, "placed", nowUtc);
  state.list.recordQuote(towels.lineId, quote.quote.quoteId);
  state.list.recordOrder(towels.lineId, commit.order.orderId);
  state.receipts.issue({
    orderId: commit.order.orderId,
    householdId: household.householdId,
    nowUtc,
  });

  state.demoMember = member;
  state.demoHouseholdId = household.householdId;
  state.demoHouseholdName = household.name;
  state.seeded = true;
  return state;
}

export async function getHomeStore(): Promise<HomeStoreState> {
  return seedIfNeeded();
}

export async function demoSession(): Promise<HomeSession> {
  const state = await getHomeStore();
  return {
    memberId: state.demoMember.memberId,
    householdId: state.demoHouseholdId,
    email: state.demoMember.email,
    householdName: state.demoHouseholdName,
  };
}

function lineView(state: HomeStoreState, line: ListLineRow): HomeListLineView {
  const item = state.catalog.get(line.canonicalItemId);
  let lastPrice: number | null = null;
  let receiptToken: string | null = null;
  if (line.lastOrderId) {
    const order = state.orders.get(line.lastOrderId);
    if (order) lastPrice = order.amountCents;
    const receipt = state.receipts.getByOrder(line.lastOrderId);
    if (receipt) receiptToken = receipt.receiptToken;
  } else if (line.lastQuoteId) {
    const quote = state.quotes.get(line.lastQuoteId);
    if (quote) lastPrice = quote.landedCents;
  }
  return {
    line_id: line.lineId,
    canonical_item_id: line.canonicalItemId,
    brand: item?.brand ?? "",
    description: item?.description ?? line.canonicalItemId,
    cadence_hint_days: line.cadenceHintDays,
    never_substitute: line.neverSubstitute,
    last_quote_id: line.lastQuoteId,
    last_order_id: line.lastOrderId,
    last_price_cents: lastPrice,
    paused: line.paused,
    mandate_id: line.mandateId,
    receipt_token: receiptToken,
  };
}

export async function listLinesForSession(
  session: HomeSession,
): Promise<HomeListLineView[]> {
  const state = await getHomeStore();
  if (
    !state.households.memberOf(session.memberId, session.householdId)
  ) {
    return [];
  }
  return state.list
    .listForHousehold(session.householdId)
    .map((line) => lineView(state, line));
}

export async function skipListLineForSession(
  session: HomeSession,
  lineId: string,
): Promise<HomeListLineView | { error: string; status: number }> {
  const state = await getHomeStore();
  if (!state.households.memberOf(session.memberId, session.householdId)) {
    return { error: "unauthenticated", status: 401 };
  }
  const line = state.list.getForHousehold(lineId, session.householdId);
  if (!line) return { error: "mandate_miss", status: 404 };
  const skipped = state.list.skip(line.lineId);
  if (!skipped) return { error: "mandate_miss", status: 404 };
  return lineView(state, skipped);
}

export async function getReceiptForSession(
  session: HomeSession,
  token: string,
): Promise<ReceiptResponse | { error: string; status: number }> {
  const state = await getHomeStore();
  const receipt = state.receipts.getByToken(token);
  if (!receipt) return { error: "unauthenticated", status: 401 };

  const viewer = {
    role: "member" as const,
    memberId: session.memberId,
    householdId: session.householdId,
  };
  if (!canViewReceipt(viewer, receipt.householdId)) {
    return { error: "unauthenticated", status: 401 };
  }
  if (!state.households.memberOf(session.memberId, receipt.householdId)) {
    return { error: "unauthenticated", status: 401 };
  }

  const order = state.orders.getForHousehold(
    receipt.orderId,
    receipt.householdId,
  );
  if (!order) return { error: "unauthenticated", status: 401 };
  const quote = state.quotes.get(order.quoteId);
  if (!quote) return { error: "quote_mismatch", status: 400 };
  const item = state.catalog.get(order.canonicalItemId);
  const skip = receiptSkipAction(order.status);

  return {
    receipt_token: receipt.receiptToken,
    order_id: order.orderId,
    household_id: order.householdId,
    item: {
      canonical_item_id: order.canonicalItemId,
      description: item?.description ?? order.canonicalItemId,
      brand: item?.brand ?? "",
    },
    landed_cents: order.amountCents,
    fulfiller_id: quote.fulfillerId,
    why_this_seller: whyThisSeller({
      landedCents: quote.scoreInputs.landedCents,
      deliveryDateUtc: quote.scoreInputs.deliveryDateUtc,
      merchantScore: quote.scoreInputs.merchantScore,
    }),
    status: order.status,
    skip_available: skip !== "none",
  };
}

export async function skipReceiptForSession(
  session: HomeSession,
  token: string,
): Promise<
  | {
      order_id: string;
      action: "cancel" | "return_request";
      status: string;
      return_id?: string;
    }
  | { error: string; status: number }
> {
  const state = await getHomeStore();
  const receipt = state.receipts.getByToken(token);
  if (!receipt) return { error: "unauthenticated", status: 401 };
  if (!canViewReceipt(
    {
      role: "member",
      memberId: session.memberId,
      householdId: session.householdId,
    },
    receipt.householdId,
  )) {
    return { error: "unauthenticated", status: 401 };
  }
  if (!state.households.memberOf(session.memberId, receipt.householdId)) {
    return { error: "unauthenticated", status: 401 };
  }

  const order = state.orders.getForHousehold(
    receipt.orderId,
    receipt.householdId,
  );
  if (!order) return { error: "unauthenticated", status: 401 };

  const action = receiptSkipAction(order.status);
  if (action === "none") {
    return { error: "not_cancellable", status: 403 };
  }

  const nowUtc = new Date().toISOString();
  if (action === "return_request") {
    return {
      order_id: order.orderId,
      action: "return_request",
      status: "return_open",
      return_id: `ret_home_${order.orderId}`,
    };
  }

  state.orders.appendStatus(order.orderId, "refunded", nowUtc);
  return {
    order_id: order.orderId,
    action: "cancel",
    status: "cancelled",
  };
}

function mandateView(row: MandateRow): HomeMandateView {
  return {
    mandate_id: row.mandateId,
    ceiling_cents: row.ceilingCents,
    expires_at: row.expiresAtUtc,
    address_id: row.addressId,
    never_substitute_ids: [...row.neverSubstituteIds],
    canonical_item_ids: [...row.canonicalItemIds],
    allow_cancel: row.allowCancel,
  };
}

export async function getMandateForSession(
  session: HomeSession,
): Promise<HomeMandateView | null> {
  const state = await getHomeStore();
  if (!state.households.memberOf(session.memberId, session.householdId)) {
    return null;
  }
  const rows = state.mandates.listForHousehold(session.householdId);
  return rows[0] ? mandateView(rows[0]) : null;
}

export async function upsertMandateForSession(
  session: HomeSession,
  input: {
    ceiling_cents: number;
    expires_at: string;
    address_id: string;
    never_substitute_ids: string[];
    canonical_item_ids?: string[];
  },
): Promise<HomeMandateView | { error: string; status: number }> {
  const state = await getHomeStore();
  if (!state.households.memberOf(session.memberId, session.householdId)) {
    return { error: "unauthenticated", status: 401 };
  }

  const existing = state.mandates.listForHousehold(session.householdId)[0];
  if (existing) {
    const lowered = state.mandates.lowerCeiling(
      existing.mandateId,
      session.householdId,
      input.ceiling_cents,
    );
    if (!lowered && input.ceiling_cents > existing.ceilingCents) {
      // Household may set ceiling on create path; for demo, create a new
      // mandate when raising — operators cannot raise, humans can replace.
      const created = state.mandates.create({
        householdId: session.householdId,
        ceilingCents: input.ceiling_cents,
        expiresAtUtc: input.expires_at,
        canonicalItemIds:
          input.canonical_item_ids ?? existing.canonicalItemIds,
        neverSubstituteIds: input.never_substitute_ids,
        addressId: input.address_id,
        allowCancel: existing.allowCancel,
      });
      return mandateView(created);
    }
    if (lowered) {
      lowered.expiresAtUtc = input.expires_at;
      lowered.addressId = input.address_id;
      lowered.neverSubstituteIds = [...input.never_substitute_ids];
      if (input.canonical_item_ids) {
        lowered.canonicalItemIds = [...input.canonical_item_ids];
      }
      lowered.updatedAt = new Date().toISOString();
      return mandateView(lowered);
    }
    existing.expiresAtUtc = input.expires_at;
    existing.addressId = input.address_id;
    existing.neverSubstituteIds = [...input.never_substitute_ids];
    existing.updatedAt = new Date().toISOString();
    return mandateView(existing);
  }

  const created = state.mandates.create({
    householdId: session.householdId,
    ceilingCents: input.ceiling_cents,
    expiresAtUtc: input.expires_at,
    canonicalItemIds: input.canonical_item_ids ?? ["item_towels_12"],
    neverSubstituteIds: input.never_substitute_ids,
    addressId: input.address_id,
    allowCancel: true,
  });
  return mandateView(created);
}

function keyView(row: AgentCredentialRow): HomeKeyView {
  return {
    key_id: row.keyId,
    scopes: [...row.scopes],
    mandate_ids: [...row.mandateIds],
    revoked: Boolean(row.revokedAt),
    created_at: row.createdAt,
    last_used_at: row.lastUsedAt,
  };
}

export async function listKeysForSession(
  session: HomeSession,
): Promise<HomeKeyView[]> {
  const state = await getHomeStore();
  if (!state.households.memberOf(session.memberId, session.householdId)) {
    return [];
  }
  return state.agents
    .listForHousehold(session.householdId)
    .map(keyView);
}

export async function issueKeyForSession(
  session: HomeSession,
  scopes: Array<"quote" | "commit" | "read_list">,
): Promise<
  | (HomeKeyView & { secret: string })
  | { error: string; status: number }
> {
  const state = await getHomeStore();
  if (!state.households.memberOf(session.memberId, session.householdId)) {
    return { error: "unauthenticated", status: 401 };
  }
  const mandate = state.mandates.listForHousehold(session.householdId)[0];
  if (!mandate) return { error: "mandate_miss", status: 400 };

  try {
    const issued = await state.agents.issue({
      householdId: session.householdId,
      scopes,
      mandateIds: [mandate.mandateId],
    });
    const row = state.agents.selectByKeyId(issued.keyId);
    if (!row) return { error: "unauthenticated", status: 401 };
    return {
      ...keyView(row),
      secret: issued.secret,
    };
  } catch {
    return { error: "invalid_body", status: 400 };
  }
}

export async function revokeKeyForSession(
  session: HomeSession,
  keyId: string,
): Promise<{ key_id: string; revoked: true } | { error: string; status: number }> {
  const state = await getHomeStore();
  if (!state.households.memberOf(session.memberId, session.householdId)) {
    return { error: "unauthenticated", status: 401 };
  }
  const row = state.agents.selectByKeyId(keyId);
  if (!row || row.householdId !== session.householdId) {
    return { error: "unauthenticated", status: 401 };
  }
  await state.agents.revoke(keyId);
  return { key_id: keyId, revoked: true };
}

import { holdKey, quoteExpiresAt, MAX_QUOTE_TTL_MS } from "@cutoff/domain";
import type {
  CreateQuoteInput,
  CreateQuoteResult,
  HoldRow,
  QuoteRepository,
  QuoteRow,
} from "../quotes.js";
import type { CutoffSupabaseClient } from "../supabase-client.js";
import { ulid } from "../ulid.js";
import {
  mapHold,
  mapQuote,
  throwOnError,
  type DbHold,
  type DbQuote,
} from "./mappers.js";

/**
 * Thin Postgres quote + hold store.
 * Sequential writes (REST); race-safe uniqueness relies on quote_holds PK.
 */
export class PostgresQuoteRepository implements QuoteRepository {
  constructor(private readonly db: CutoffSupabaseClient) {}

  attemptInsertWithPlacement(_row: Record<string, unknown>): {
    ok: false;
    error: "placement_rejected";
  } {
    void _row;
    return { ok: false, error: "placement_rejected" };
  }

  async create(input: CreateQuoteInput): Promise<CreateQuoteResult> {
    const probe = input as CreateQuoteInput & { placement?: unknown };
    if (probe.placement !== undefined) {
      return { ok: false, error: "placement_rejected" };
    }

    const key = holdKey({
      householdId: input.householdId,
      canonicalItemId: input.canonicalItemId,
    });
    void key;

    const existingHold = await this.openHold(
      input.householdId,
      input.canonicalItemId,
    );
    if (existingHold) {
      const existing = await this.get(existingHold.quoteId);
      if (
        existing &&
        !existing.committedAtUtc &&
        Date.parse(input.nowUtc) < Date.parse(existing.expiresAtUtc)
      ) {
        return {
          ok: false,
          error: "hold_active",
          quoteId: existing.quoteId,
        };
      }
      const { error: delError } = await this.db
        .from("quote_holds")
        .delete()
        .eq("household_id", input.householdId)
        .eq("canonical_item_id", input.canonicalItemId);
      throwOnError(delError, "quote_holds.clearExpired");
    }

    const ttl = Math.min(input.ttlMs ?? MAX_QUOTE_TTL_MS, MAX_QUOTE_TTL_MS);
    const quoteId = ulid();
    const quoteInsert = {
      quote_id: quoteId,
      household_id: input.householdId,
      mandate_id: input.mandateId,
      agent_key_id: input.agentKeyId,
      canonical_item_id: input.canonicalItemId,
      qty: input.qty,
      landed_cents: input.landedCents,
      tax_cents: input.taxCents,
      unit_price_cents: input.unitPriceCents,
      delivery_date_utc: input.deliveryDateUtc,
      fulfiller_id: input.fulfillerId,
      offer_id: input.offerId,
      score_inputs: { ...input.scoreInputs },
      address_id: input.addressId,
      ceiling_cents: input.ceilingCents,
      expires_at_utc: quoteExpiresAt(input.nowUtc, ttl),
      created_at: input.nowUtc,
      committed_at_utc: null,
      substitute: input.substitute ?? null,
    };

    const { error } = await this.db.from("quotes").insert(quoteInsert);
    throwOnError(error, "quotes.insert");

    const { error: holdError } = await this.db.from("quote_holds").insert({
      household_id: quoteInsert.household_id,
      canonical_item_id: quoteInsert.canonical_item_id,
      quote_id: quoteId,
    });
    throwOnError(holdError, "quote_holds.insert");

    const quote = await this.get(quoteId);
    if (!quote) throw new Error("quotes.insert: row missing after insert");
    return { ok: true, quote };
  }

  async get(quoteId: string): Promise<QuoteRow | null> {
    const { data, error } = await this.db
      .from("quotes")
      .select("*")
      .eq("quote_id", quoteId)
      .maybeSingle();
    throwOnError(error, "quotes.get");
    if (!data) return null;
    return mapQuote(data as DbQuote);
  }

  async markCommitted(
    quoteId: string,
    atUtc: string,
  ): Promise<QuoteRow | null> {
    const row = await this.get(quoteId);
    if (!row) return null;
    const { error } = await this.db
      .from("quotes")
      .update({ committed_at_utc: atUtc })
      .eq("quote_id", quoteId);
    throwOnError(error, "quotes.markCommitted");
    const { error: holdError } = await this.db
      .from("quote_holds")
      .delete()
      .eq("household_id", row.householdId)
      .eq("canonical_item_id", row.canonicalItemId)
      .eq("quote_id", quoteId);
    throwOnError(holdError, "quote_holds.releaseOnCommit");
    return this.get(quoteId);
  }

  async openHold(
    householdId: string,
    canonicalItemId: string,
  ): Promise<HoldRow | null> {
    const { data, error } = await this.db
      .from("quote_holds")
      .select("*")
      .eq("household_id", householdId)
      .eq("canonical_item_id", canonicalItemId)
      .maybeSingle();
    throwOnError(error, "quote_holds.openHold");
    if (!data) return null;
    return mapHold(data as DbHold);
  }

  async listAll(): Promise<readonly QuoteRow[]> {
    const { data, error } = await this.db.from("quotes").select("*");
    throwOnError(error, "quotes.listAll");
    return ((data ?? []) as DbQuote[]).map(mapQuote);
  }

  async listOpenHolds(): Promise<readonly HoldRow[]> {
    const { data, error } = await this.db.from("quote_holds").select("*");
    throwOnError(error, "quote_holds.listOpenHolds");
    return ((data ?? []) as DbHold[]).map(mapHold);
  }

  async releaseHold(quoteId: string): Promise<HoldRow | null> {
    const quote = await this.get(quoteId);
    if (!quote || quote.committedAtUtc) return null;
    const hold = await this.openHold(
      quote.householdId,
      quote.canonicalItemId,
    );
    if (!hold || hold.quoteId !== quoteId) return null;
    const { error } = await this.db
      .from("quote_holds")
      .delete()
      .eq("household_id", quote.householdId)
      .eq("canonical_item_id", quote.canonicalItemId)
      .eq("quote_id", quoteId);
    throwOnError(error, "quote_holds.releaseHold");
    return hold;
  }

  schemaHasPlacementColumn(): boolean {
    return false;
  }
}

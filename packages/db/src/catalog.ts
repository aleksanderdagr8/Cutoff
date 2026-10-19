/**
 * Catalog module repository. Owns canonical_items + equivalences.
 * Unit 4: hand-loaded replenishment set; plain-text ingest validation.
 */

import {
  isExcludedByRecall,
  validateDescription,
} from "@cutoff/domain";
import { ulid } from "./ulid.js";

export type PackUnit = "roll" | "oz" | "lb" | "each";

export type CanonicalItemRow = {
  canonicalItemId: string;
  gtin: string;
  packCount: number;
  unit: PackUnit;
  category: string;
  description: string;
  allergenFlags: string[];
  formulaFlags: string[];
  recalled: boolean;
  brand: string;
  createdAt: string;
};

export type EquivalenceRow = {
  equivalenceId: string;
  fromCanonicalItemId: string;
  toCanonicalItemId: string;
};

export type IngestCanonicalItemInput = {
  canonicalItemId?: string;
  gtin: string;
  packCount: number;
  unit: PackUnit;
  category: string;
  description: string;
  allergenFlags?: string[];
  formulaFlags?: string[];
  recalled?: boolean;
  brand: string;
};

export type IngestResult =
  | { ok: true; item: CanonicalItemRow }
  | { ok: false; error: "invalid_description" | "duplicate_id" };

export class MemoryCatalogRepository {
  private readonly items = new Map<string, CanonicalItemRow>();
  private readonly byGtinPack = new Map<string, string>();
  private readonly equivalences: EquivalenceRow[] = [];

  private gtinPackKey(gtin: string, packCount: number): string {
    return `${gtin}::${packCount}`;
  }

  ingest(input: IngestCanonicalItemInput): IngestResult {
    const desc = validateDescription(input.description);
    if (!desc.ok) {
      return { ok: false, error: "invalid_description" };
    }
    if (
      !Number.isInteger(input.packCount) ||
      input.packCount < 1 ||
      !input.gtin
    ) {
      return { ok: false, error: "invalid_description" };
    }

    const canonicalItemId = input.canonicalItemId ?? ulid();
    if (this.items.has(canonicalItemId)) {
      return { ok: false, error: "duplicate_id" };
    }

    const row: CanonicalItemRow = {
      canonicalItemId,
      gtin: input.gtin,
      packCount: input.packCount,
      unit: input.unit,
      category: input.category,
      description: desc.description,
      allergenFlags: [...(input.allergenFlags ?? [])],
      formulaFlags: [...(input.formulaFlags ?? [])],
      recalled: input.recalled ?? false,
      brand: input.brand,
      createdAt: new Date().toISOString(),
    };
    this.items.set(canonicalItemId, row);
    this.byGtinPack.set(this.gtinPackKey(row.gtin, row.packCount), canonicalItemId);
    return { ok: true, item: row };
  }

  get(canonicalItemId: string): CanonicalItemRow | null {
    return this.items.get(canonicalItemId) ?? null;
  }

  findByGtinPack(gtin: string, packCount: number): CanonicalItemRow | null {
    const id = this.byGtinPack.get(this.gtinPackKey(gtin, packCount));
    return id ? (this.items.get(id) ?? null) : null;
  }

  /** Recalled items are not quotable. */
  getQuotable(canonicalItemId: string): CanonicalItemRow | null {
    const item = this.get(canonicalItemId);
    if (!item || isExcludedByRecall(item.recalled)) return null;
    return item;
  }

  addEquivalence(fromId: string, toId: string): EquivalenceRow {
    const row: EquivalenceRow = {
      equivalenceId: ulid(),
      fromCanonicalItemId: fromId,
      toCanonicalItemId: toId,
    };
    this.equivalences.push(row);
    return row;
  }

  substitutesFor(canonicalItemId: string): CanonicalItemRow[] {
    const out: CanonicalItemRow[] = [];
    for (const eq of this.equivalences) {
      if (eq.fromCanonicalItemId !== canonicalItemId) continue;
      const item = this.getQuotable(eq.toCanonicalItemId);
      if (item) out.push(item);
    }
    return out;
  }

  list(): readonly CanonicalItemRow[] {
    return [...this.items.values()];
  }
}

/** Fixture replenishment set: towels, coffee, filter, kibble — two packs each. */
export function seedFixtureCatalog(
  catalog: MemoryCatalogRepository = new MemoryCatalogRepository(),
): MemoryCatalogRepository {
  const fixtures: IngestCanonicalItemInput[] = [
    {
      canonicalItemId: "item_towels_6",
      gtin: "00011111111116",
      packCount: 6,
      unit: "roll",
      category: "paper_towels",
      description: "Paper towels, 6-roll pack",
      brand: "ShelfSoft",
    },
    {
      canonicalItemId: "item_towels_12",
      gtin: "00011111111112",
      packCount: 12,
      unit: "roll",
      category: "paper_towels",
      description: "Paper towels, 12-roll pack",
      brand: "ShelfSoft",
    },
    {
      canonicalItemId: "item_coffee_12oz",
      gtin: "00022222222212",
      packCount: 12,
      unit: "oz",
      category: "coffee",
      description: "Ground coffee, 12 oz bag",
      brand: "MorningBatch",
      allergenFlags: [],
      formulaFlags: ["ground"],
    },
    {
      canonicalItemId: "item_coffee_24oz",
      gtin: "00022222222224",
      packCount: 24,
      unit: "oz",
      category: "coffee",
      description: "Ground coffee, 24 oz bag",
      brand: "MorningBatch",
      formulaFlags: ["ground"],
    },
    {
      canonicalItemId: "item_filter_1",
      gtin: "00033333333301",
      packCount: 1,
      unit: "each",
      category: "furnace_filter",
      description: "Furnace filter, single",
      brand: "ClearAir",
    },
    {
      canonicalItemId: "item_filter_2",
      gtin: "00033333333302",
      packCount: 2,
      unit: "each",
      category: "furnace_filter",
      description: "Furnace filter, 2-pack",
      brand: "ClearAir",
    },
    {
      canonicalItemId: "item_kibble_5lb",
      gtin: "00044444444405",
      packCount: 5,
      unit: "lb",
      category: "kibble",
      description: "Dog kibble, 5 lb bag",
      brand: "YardBowl",
      allergenFlags: ["chicken"],
    },
    {
      canonicalItemId: "item_kibble_15lb",
      gtin: "00044444444415",
      packCount: 15,
      unit: "lb",
      category: "kibble",
      description: "Dog kibble, 15 lb bag",
      brand: "YardBowl",
      allergenFlags: ["chicken"],
    },
  ];

  for (const f of fixtures) {
    const result = catalog.ingest(f);
    if (!result.ok) {
      throw new Error(`fixture_ingest_failed:${f.canonicalItemId}`);
    }
  }

  // Same category packs are NOT the same id — equivalences are explicit.
  catalog.addEquivalence("item_towels_12", "item_towels_6");
  return catalog;
}

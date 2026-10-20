/**
 * Google Places API (New) — autocomplete + place details for shipping addresses.
 * Server-only. Key: GOOGLE_PLACES_API_KEY (Worker secret / .env — never NEXT_PUBLIC_).
 */

import "server-only";
import {
  formatStructuredAddress,
  structuredFromComponents,
  type StructuredAddress,
} from "./places-parse";

export const GOOGLE_PLACES_API_KEY_ENV = "GOOGLE_PLACES_API_KEY";

export type { StructuredAddress };
export { formatStructuredAddress, structuredFromComponents };

export type AddressSuggestion = {
  place_id: string;
  primary: string;
  secondary: string;
  description: string;
};

type AutocompleteSuggestion = {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
  };
};

export function placesApiConfigured(): boolean {
  return Boolean(process.env[GOOGLE_PLACES_API_KEY_ENV]?.trim());
}

function apiKey(): string | null {
  return process.env[GOOGLE_PLACES_API_KEY_ENV]?.trim() || null;
}

export async function suggestAddresses(
  input: string,
  opts?: { sessionToken?: string },
): Promise<
  | { configured: false; suggestions: [] }
  | { configured: true; suggestions: AddressSuggestion[] }
  | { error: string; status: number }
> {
  const key = apiKey();
  if (!key) {
    return { configured: false, suggestions: [] };
  }
  const q = input.trim();
  if (q.length < 3) {
    return { configured: true, suggestions: [] };
  }

  const body: Record<string, unknown> = {
    input: q,
    includedPrimaryTypes: ["street_address", "premise", "subpremise"],
    languageCode: "en",
  };
  if (opts?.sessionToken) {
    body.sessionToken = opts.sessionToken;
  }

  const res = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("places_autocomplete_failed", res.status, text.slice(0, 200));
    return { error: "places_unavailable", status: 502 };
  }

  const json = (await res.json()) as { suggestions?: AutocompleteSuggestion[] };
  const suggestions: AddressSuggestion[] = [];
  for (const s of json.suggestions ?? []) {
    const pred = s.placePrediction;
    if (!pred?.placeId) continue;
    const primary =
      pred.structuredFormat?.mainText?.text?.trim() ||
      pred.text?.text?.trim() ||
      "";
    const secondary =
      pred.structuredFormat?.secondaryText?.text?.trim() || "";
    const description =
      pred.text?.text?.trim() ||
      [primary, secondary].filter(Boolean).join(", ");
    if (!primary && !description) continue;
    suggestions.push({
      place_id: pred.placeId,
      primary: primary || description,
      secondary,
      description,
    });
  }
  return { configured: true, suggestions };
}

export async function resolvePlace(
  placeId: string,
  opts?: { sessionToken?: string },
): Promise<
  | { configured: false }
  | { address: StructuredAddress }
  | { error: string; status: number }
> {
  const key = apiKey();
  if (!key) {
    return { configured: false };
  }
  const raw = placeId.trim().replace(/^places\//, "");
  if (!raw) {
    return { error: "invalid_place", status: 400 };
  }

  const url = new URL(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(raw)}`,
  );
  if (opts?.sessionToken) {
    url.searchParams.set("sessionToken", opts.sessionToken);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "id,formattedAddress,addressComponents",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("places_details_failed", res.status, text.slice(0, 200));
    return { error: "places_unavailable", status: 502 };
  }

  const json = (await res.json()) as {
    id?: string;
    formattedAddress?: string;
    addressComponents?: Parameters<typeof structuredFromComponents>[0];
  };

  const components = json.addressComponents ?? [];
  const placeResourceId = (json.id ?? raw).replace(/^places\//, "");
  const parsed = structuredFromComponents(
    components,
    json.formattedAddress ?? "",
    placeResourceId,
  );
  if ("error" in parsed) {
    return { error: parsed.error, status: 422 };
  }
  return { address: parsed };
}

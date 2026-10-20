/** Pure address parsing helpers (safe for unit tests — no server-only). */

export type StructuredAddress = {
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postal: string;
  country: string;
  formatted: string;
  place_id: string | null;
};

export type PlacesAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

export function componentOf(
  components: PlacesAddressComponent[],
  type: string,
  preferShort = false,
): string {
  const hit = components.find((c) => c.types?.includes(type));
  if (!hit) return "";
  if (preferShort) return (hit.shortText || hit.longText || "").trim();
  return (hit.longText || hit.shortText || "").trim();
}

export function formatStructuredAddress(
  a: Pick<
    StructuredAddress,
    "line1" | "line2" | "city" | "region" | "postal" | "country"
  >,
): string {
  const street = a.line2 ? `${a.line1}, ${a.line2}` : a.line1;
  return `${street}, ${a.city}, ${a.region} ${a.postal}, ${a.country}`;
}

/** Build a fulfillment-grade address from Places addressComponents. */
export function structuredFromComponents(
  components: PlacesAddressComponent[],
  formattedAddress: string,
  placeId: string,
): StructuredAddress | { error: "incomplete_address" } {
  const streetNumber = componentOf(components, "street_number");
  const route = componentOf(components, "route");
  const premise = componentOf(components, "premise");
  const subpremise = componentOf(components, "subpremise");

  let line1 = [streetNumber, route].filter(Boolean).join(" ").trim();
  if (!line1 && premise) line1 = premise;
  if (!line1) {
    return { error: "incomplete_address" };
  }

  const city =
    componentOf(components, "locality") ||
    componentOf(components, "sublocality") ||
    componentOf(components, "postal_town") ||
    componentOf(components, "administrative_area_level_3");
  const region = componentOf(components, "administrative_area_level_1", true);
  const postal = componentOf(components, "postal_code");
  const country = componentOf(components, "country", true) || "US";

  if (!city || !region || !postal || !country) {
    return { error: "incomplete_address" };
  }

  const countryNorm = country.toUpperCase();
  const line2 = subpremise || null;
  return {
    line1,
    line2,
    city,
    region,
    postal,
    country: countryNorm,
    formatted:
      formattedAddress.trim() ||
      formatStructuredAddress({
        line1,
        line2,
        city,
        region,
        postal,
        country: countryNorm,
      }),
    place_id: placeId,
  };
}

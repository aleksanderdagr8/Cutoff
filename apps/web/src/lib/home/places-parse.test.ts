import { describe, expect, it } from "vitest";
import {
  formatStructuredAddress,
  structuredFromComponents,
} from "./places-parse";

describe("structuredFromComponents", () => {
  it("builds a precise US shipping address", () => {
    const result = structuredFromComponents(
      [
        { longText: "1600", shortText: "1600", types: ["street_number"] },
        {
          longText: "Amphitheatre Parkway",
          shortText: "Amphitheatre Pkwy",
          types: ["route"],
        },
        { longText: "Mountain View", types: ["locality", "political"] },
        {
          longText: "California",
          shortText: "CA",
          types: ["administrative_area_level_1", "political"],
        },
        { longText: "94043", types: ["postal_code"] },
        {
          longText: "United States",
          shortText: "US",
          types: ["country", "political"],
        },
      ],
      "1600 Amphitheatre Parkway, Mountain View, CA 94043, USA",
      "ChIJ_test",
    );
    expect(result).toEqual({
      line1: "1600 Amphitheatre Parkway",
      line2: null,
      city: "Mountain View",
      region: "CA",
      postal: "94043",
      country: "US",
      formatted: "1600 Amphitheatre Parkway, Mountain View, CA 94043, USA",
      place_id: "ChIJ_test",
    });
  });

  it("captures unit / subpremise", () => {
    const result = structuredFromComponents(
      [
        { longText: "1", types: ["street_number"] },
        { longText: "Main St", types: ["route"] },
        { longText: "4B", types: ["subpremise"] },
        { longText: "Austin", types: ["locality"] },
        { shortText: "TX", longText: "Texas", types: ["administrative_area_level_1"] },
        { longText: "78701", types: ["postal_code"] },
        { shortText: "US", types: ["country"] },
      ],
      "",
      "place_unit",
    );
    expect(result).toMatchObject({
      line1: "1 Main St",
      line2: "4B",
      city: "Austin",
      region: "TX",
      postal: "78701",
      country: "US",
    });
    if (!("error" in result)) {
      expect(result.formatted).toContain("4B");
    }
  });

  it("rejects place-name-only results without a street", () => {
    const result = structuredFromComponents(
      [
        { longText: "Austin", types: ["locality"] },
        { shortText: "TX", types: ["administrative_area_level_1"] },
        { longText: "78701", types: ["postal_code"] },
        { shortText: "US", types: ["country"] },
      ],
      "Austin, TX",
      "city_only",
    );
    expect(result).toEqual({ error: "incomplete_address" });
  });
});

describe("formatStructuredAddress", () => {
  it("joins lines for display", () => {
    expect(
      formatStructuredAddress({
        line1: "1 Main St",
        line2: "Apt 2",
        city: "Austin",
        region: "TX",
        postal: "78701",
        country: "US",
      }),
    ).toBe("1 Main St, Apt 2, Austin, TX 78701, US");
  });
});

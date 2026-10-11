/**
 * Fixture used by the boundary test. This file is NOT part of the build graph.
 * It demonstrates the import shape that check-boundaries must reject.
 *
 * Do not import this file from apps or packages.
 */
// @ts-expect-error — intentional forbidden import for the checker fixture
export { MODULE_TABLES } from "@cutoff/db/tables";

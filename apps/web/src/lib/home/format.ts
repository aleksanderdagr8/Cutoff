/** Format integer cents as USD display. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

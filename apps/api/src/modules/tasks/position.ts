/** Gap between cards when appending, and the base for rebalancing a column. */
export const STEP = 1024;
/** When two neighbours are closer than this, the column is renumbered. */
export const MIN_GAP = 1e-6;

/**
 * Board ordering uses fractional positions: moving a card writes only that card,
 * placing it at the midpoint between its new neighbours.
 *   before = position of the card that will sit directly above (undefined = top)
 *   after  = position of the card that will sit directly below (undefined = bottom)
 */
export function positionBetween(before?: number, after?: number): number {
  if (before === undefined && after === undefined) return STEP;
  if (before === undefined) return after! / 2;
  if (after === undefined) return before + STEP;
  return (before + after) / 2;
}

export const needsRebalance = (before: number | undefined, after: number | undefined, position: number) =>
  (before !== undefined && position - before < MIN_GAP) || (after !== undefined && after - position < MIN_GAP) || position <= 0;

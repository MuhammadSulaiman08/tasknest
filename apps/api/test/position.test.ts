import { describe, expect, it } from 'vitest';
import { STEP, needsRebalance, positionBetween } from '../src/modules/tasks/position.js';

describe('positionBetween', () => {
  it('handles empty column, top, bottom and middle', () => {
    expect(positionBetween()).toBe(STEP);
    expect(positionBetween(undefined, 1024)).toBe(512);
    expect(positionBetween(2048, undefined)).toBe(2048 + STEP);
    expect(positionBetween(1024, 2048)).toBe(1536);
  });
  it('flags a column for rebalancing when the gap is exhausted', () => {
    expect(needsRebalance(1, 1 + 1e-7, positionBetween(1, 1 + 1e-7))).toBe(true);
    expect(needsRebalance(1024, 2048, 1536)).toBe(false);
  });
});

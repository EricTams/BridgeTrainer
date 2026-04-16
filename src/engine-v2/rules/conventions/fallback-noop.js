/**
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 */

/**
 * Low-priority no-op pack.
 * Exists to validate multi-pack ordering/fallback behavior.
 * @type {{ id: string, priority: number, when: (ctx: ConventionContext) => boolean, run: (ctx: ConventionContext) => BidRecommendation[] | null }}
 */
export const fallbackNoopPack = {
  id: 'fallback-noop',
  priority: -1000,
  when: () => true,
  run: () => null,
};

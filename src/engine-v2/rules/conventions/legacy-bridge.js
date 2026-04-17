import { getLegacyRecommendations } from '../../../engine/legacy-advisor.js';

/**
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

/**
 * Bridge pack that routes any unmatched context through the legacy
 * phase-based engine. This makes v2 convention routing universal while
 * preserving behavior for not-yet-migrated bidding families.
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[] | null}
 */
function runLegacyBridgePack(ctx) {
  return getLegacyRecommendations(ctx.hand, ctx.auction, ctx.seat);
}

/**
 * @type {{ id: string, priority: number, when: (ctx: ConventionContext) => boolean, run: (ctx: ConventionContext) => BidRecommendation[] | null }}
 */
export const legacyBridgePack = {
  id: 'legacy-bridge',
  priority: -900,
  when: () => true,
  run: runLegacyBridgePack,
};

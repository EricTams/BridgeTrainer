import { buildConventionPackContext } from './context.js';
import { ntStaymanTransferPack } from './nt-stayman-transfers.js';

/**
 * @typedef {import('../../../model/hand.js').Hand} Hand
 * @typedef {import('../../../model/bid.js').Auction} Auction
 * @typedef {import('../../../model/deal.js').Seat} Seat
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

/**
 * @typedef {{
 *   id: string,
 *   priority: number,
 *   when: (ctx: import('./context.js').ConventionContext) => boolean,
 *   run: (ctx: import('./context.js').ConventionContext) => BidRecommendation[] | null,
 * }} ConventionPack
 */

/** @type {ReadonlyArray<ConventionPack>} */
const CONVENTION_PACKS = Object.freeze([
  ntStaymanTransferPack,
]);

/**
 * v2 convention rule-pack registry dispatcher.
 * Returns the first matching pack's recommendations.
 * @param {Hand} hand
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {BidRecommendation[] | null}
 */
export function getConventionRuleRecommendations(hand, auction, seat) {
  const ctx = buildConventionPackContext(auction, seat, hand);
  const ordered = [...CONVENTION_PACKS].sort((a, b) => b.priority - a.priority);
  for (const pack of ordered) {
    if (!pack.when(ctx)) continue;
    const result = pack.run(ctx);
    if (result) return result;
  }
  return null;
}

/** @returns {number} */
export function conventionPackCount() {
  return CONVENTION_PACKS.length;
}

import { buildConventionPackContext } from './context.js';
import { ntStaymanTransferPack } from './nt-stayman-transfers.js';
import { competitiveNTPenaltyDoublePack } from './competitive-nt-penalty-double.js';
import { reopeningDoublePack } from './reopening-double.js';
import { competitiveSuitTakeoutDoublePack } from './competitive-suit-takeout-double.js';
import { michaelsPack } from './michaels.js';
import { unusualNotrumpPack } from './unusual-notrump.js';
import { advancerAfterTakeoutDoublePack } from './advancer-after-takeout-double.js';
import { advancerAfterPenaltyDoublePack } from './advancer-after-penalty-double.js';
import { negativeDoublePack } from './negative-double.js';
import { fallbackNoopPack } from './fallback-noop.js';

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
  competitiveNTPenaltyDoublePack,
  unusualNotrumpPack,
  michaelsPack,
  reopeningDoublePack,
  competitiveSuitTakeoutDoublePack,
  advancerAfterPenaltyDoublePack,
  advancerAfterTakeoutDoublePack,
  negativeDoublePack,
  fallbackNoopPack,
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

/**
 * @returns {ReadonlyArray<{ id: string, priority: number }>}
 */
export function conventionPackMeta() {
  return CONVENTION_PACKS.map(pack => ({ id: pack.id, priority: pack.priority }));
}

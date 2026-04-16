import { getNTStaymanTransferRuleRecommendations } from './nt-stayman-transfers.js';

/**
 * @typedef {import('../../../model/hand.js').Hand} Hand
 * @typedef {import('../../../model/bid.js').Auction} Auction
 * @typedef {import('../../../model/deal.js').Seat} Seat
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

/** @type {ReadonlyArray<(hand: Hand, auction: Auction, seat: Seat) => BidRecommendation[] | null>} */
const CONVENTION_PACKS = Object.freeze([
  getNTStaymanTransferRuleRecommendations,
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
  for (const pack of CONVENTION_PACKS) {
    const result = pack(hand, auction, seat);
    if (result) return result;
  }
  return null;
}

/** @returns {number} */
export function conventionPackCount() {
  return CONVENTION_PACKS.length;
}

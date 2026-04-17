import { isLegalBid } from '../model/bid.js';
import { evaluate } from './evaluate.js';
import { interpretAuctionState } from '../engine-v2/semantics/interpreter.js';
import { getConventionRuleRecommendations } from '../engine-v2/rules/conventions/runner.js';
import {
  applyForcingConstraints,
  scopeCandidatesByHardObligations,
} from '../engine-v2/constraints/forcing.js';

/**
 * @typedef {import('./opening.js').BidRecommendation} BidRecommendation
 * @typedef {import('../model/hand.js').Hand} Hand
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('../model/deal.js').Seat} Seat
 */

/**
 * Get ranked bid recommendations for a hand in the current auction.
 * @param {Hand} hand
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {BidRecommendation[]}
 */
export function getRecommendations(hand, auction, seat) {
  const eval_ = evaluate(hand);
  // AIDEV-NOTE: keep semantic diagnostics visible during full v2 routing.
  maybeRunV2Diagnostics(auction, seat, eval_);
  const v2Meaning = interpretAuctionState(auction, seat, eval_);
  const v2Recommendations = getConventionRuleRecommendations(hand, auction, seat) || [];
  const constrainedV2 = constrainRecommendations(v2Recommendations, auction, v2Meaning);
  return constrainedV2.sort(compareBidRecommendations);
}

/**
 * Read-only diagnostics hook for engine-v2 semantic interpretation.
 * Controlled by `globalThis.__AIDEV_V2_DIAGNOSTICS__`.
 * @param {Auction} auction
 * @param {Seat} seat
 * @param {ReturnType<typeof evaluate>} eval_
 * @returns {void}
 */
function maybeRunV2Diagnostics(auction, seat, eval_) {
  if (!globalThis.__AIDEV_V2_DIAGNOSTICS__) return;
  try {
    const meaning = interpretAuctionState(auction, seat, eval_);
    globalThis.__AIDEV_V2_LAST_MEANING__ = meaning;
  } catch (err) {
    globalThis.__AIDEV_V2_LAST_MEANING_ERROR__ = String(err?.message || err);
  }
}

/**
 * @param {BidRecommendation[]} recommendations
 * @param {Auction} auction
 * @param {ReturnType<typeof interpretAuctionState>} meaning
 * @returns {BidRecommendation[]}
 */
function constrainRecommendations(recommendations, auction, meaning) {
  const legal = recommendations.filter(rec => isLegalBid(auction, rec.bid));
  const scoped = scopeCandidatesByHardObligations(legal, meaning, auction);
  return applyForcingConstraints(scoped, meaning);
}

/**
 * Compare recommendations by priority, preferring action over pass on ties.
 * @param {BidRecommendation} a
 * @param {BidRecommendation} b
 * @returns {number}
 */
function compareBidRecommendations(a, b) {
  if (b.priority !== a.priority) return b.priority - a.priority;
  const aPass = a.bid.type === 'pass' ? 1 : 0;
  const bPass = b.bid.type === 'pass' ? 1 : 0;
  return aPass - bPass;
}

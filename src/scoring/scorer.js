import { getRecommendations } from '../engine/advisor.js';

/**
 * @typedef {import('../model/bid.js').Bid} Bid
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('../model/hand.js').Hand} Hand
 * @typedef {import('../engine/advisor.js').BidRecommendation} BidRecommendation
 * @typedef {{
 *   points: number,
 *   recommendations: BidRecommendation[],
 * }} ScoreResult
 */

const PLAYER_SEAT = /** @type {import('../model/deal.js').Seat} */ ('S');
const MAX_POINTS = 10;

/**
 * Score the player's bid based on inaccuracy: the gap between the best
 * available bid's engine priority and the player's bid's engine priority.
 *
 * points = MAX_POINTS - inaccuracy.  No floors, no caps.
 * Choosing the best available bid always scores MAX_POINTS.
 * Worse bids score proportionally lower, driven entirely by the
 * engine's penalty system (HCP_COST, LENGTH_SHORT_COST, etc.).
 *
 * @param {Bid} playerBid
 * @param {Hand} hand
 * @param {Auction} auction
 * @returns {ScoreResult}
 */
export function scoreBid(playerBid, hand, auction) {
  const recommendations = getRecommendations(hand, auction, PLAYER_SEAT);
  const bestPriority = recommendations.length > 0 ? recommendations[0].priority : 0;
  const matched = recommendations.find(r => bidMatches(r.bid, playerBid));
  const playerPriority = matched ? matched.priority : estimateUnmatched(recommendations, bestPriority);
  const inaccuracy = bestPriority - playerPriority;

  return { points: Math.round((MAX_POINTS - inaccuracy) * 10) / 10, recommendations };
}

/**
 * Estimate priority for a bid not in the engine's candidates.
 * Extrapolates below the worst candidate using the engine's own
 * best-to-worst spread -- no arbitrary constants.
 * @param {BidRecommendation[]} recs
 * @param {number} bestPriority
 * @returns {number}
 */
function estimateUnmatched(recs, bestPriority) {
  if (recs.length === 0) return -MAX_POINTS;
  const worstPriority = recs[recs.length - 1].priority;
  const spread = bestPriority - worstPriority;
  return worstPriority - spread;
}

/**
 * @param {Bid} a
 * @param {Bid} b
 * @returns {boolean}
 */
function bidMatches(a, b) {
  if (a.type !== b.type) return false;
  if (a.type === 'contract' && b.type === 'contract') {
    return a.level === b.level && a.strain === b.strain;
  }
  return true;
}

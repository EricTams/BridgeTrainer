import { isLegalBid } from '../model/bid.js';
import { evaluate } from './evaluate.js';
import { classifyAuction, findPartnerBid, findOwnBid, findOpponentBid } from './context.js';
import { RULES } from './ruleset.js';

/**
 * @typedef {import('./penalty.js').PenaltyItem} PenaltyItem
 * @typedef {import('./ruleset.js').RuleContext} RuleContext
 * @typedef {{
 *   bid: import('../model/bid.js').Bid,
 *   priority: number,
 *   explanation: string,
 *   penalties: PenaltyItem[],
 * }} BidRecommendation
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
  const context = buildRuleContext(hand, auction, seat);
  if (context.phase === 'passed-out') return [];

  /** @type {BidRecommendation[]} */
  const results = [];
  for (const rule of RULES) {
    if (!rule.applies(context)) continue;
    const bid = rule.propose(context);
    if (!isLegalBid(auction, bid)) continue;
    results.push({
      bid,
      priority: rule.priority,
      explanation: `[${rule.id}] ${rule.description}`,
      penalties: [],
    });
  }

  return dedupeAndSort(results);
}

/**
 * Compare two bid recommendations: higher priority first, and when
 * priorities are equal, active bids (contract/double/redouble) sort
 * ahead of Pass so tie-breaking never picks Pass over a real bid.
 * @param {BidRecommendation} a
 * @param {BidRecommendation} b
 * @returns {number}
 */
function bidRecCompare(a, b) {
  if (b.priority !== a.priority) return b.priority - a.priority;
  const aPass = a.bid.type === 'pass' ? 1 : 0;
  const bPass = b.bid.type === 'pass' ? 1 : 0;
  return aPass - bPass;
}

/**
 * @param {Hand} hand
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {RuleContext}
 */
function buildRuleContext(hand, auction, seat) {
  const cls = classifyAuction(auction, seat);
  return {
    hand,
    auction,
    seat,
    evaluation: evaluate(hand),
    phase: cls.phase,
    seatPosition: cls.seatPosition,
    ownBid: findOwnBid(auction, seat),
    partnerBid: findPartnerBid(auction, seat),
    opponentBid: findOpponentBid(auction, seat),
  };
}

/**
 * @param {import('../model/bid.js').Bid} bid
 * @returns {string}
 */
function bidKey(bid) {
  if (bid.type === 'contract') return `${bid.level}${bid.strain}`;
  return bid.type;
}

/**
 * @param {BidRecommendation[]} recommendations
 * @returns {BidRecommendation[]}
 */
function dedupeAndSort(recommendations) {
  /** @type {Map<string, BidRecommendation>} */
  const bestByBid = new Map();
  for (const rec of recommendations) {
    const key = bidKey(rec.bid);
    const existing = bestByBid.get(key);
    if (!existing || rec.priority > existing.priority) {
      bestByBid.set(key, rec);
    }
  }
  return [...bestByBid.values()].sort(bidRecCompare);
}

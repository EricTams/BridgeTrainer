import { pass, contractBid, Strain, STRAIN_ORDER, lastContractBid, isLegalBid } from '../model/bid.js';
import { evaluate } from './evaluate.js';
import { classifyAuction, findPartnerBid, findPartnerLastBid, findOwnBid, findOpponentBid, hasOpponentBids, countOwnBids, isOpener, hasPlayerDoubled, hasPartnerDoubled, opponentsOutbidPartnership, opponentStrains } from './context.js';
import { getOpeningBids } from './opening.js';
import { getRespondingBids } from './responding.js';
import { getRebidBids, getContinuationBids, getResponderRebidBids } from './rebid.js';
import { getCompetitiveBids, getCompetitiveResponseBids, getPostDoubleBids } from './competitive.js';
import { getConventionResponse, getSlamInitiationBids } from './conventions.js';
import { getContestBids } from './contest.js';

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

  const conventionResp = getConventionResponse(hand, eval_, auction, seat);
  if (conventionResp) return conventionResp;

  const ctx = classifyAuction(auction, seat);

  /** @type {BidRecommendation[]} */
  let results;

  switch (ctx.phase) {
    case 'opening':
      results = getOpeningBids(hand, eval_, ctx.seatPosition);
      break;
    case 'responding': {
      const partnerBid = findPartnerBid(auction, seat);
      if (!partnerBid) return [{ bid: pass(), priority: 10, explanation: 'No partner bid found', penalties: [] }];
      if (hasPlayerDoubled(auction, seat)) {
        results = getPostDoubleBids(hand, eval_, partnerBid, auction, seat);
        break;
      }
      if (hasPartnerDoubled(auction, seat)) {
        results = getCompetitiveBids(hand, eval_, auction, seat);
        break;
      }
      const oppBid = findOpponentBid(auction, seat);
      if (oppBid) {
        results = getCompetitiveResponseBids(hand, eval_, partnerBid, oppBid, auction, seat);
      } else {
        results = getRespondingBids(hand, eval_, partnerBid);
      }

      const partnerLast = findPartnerLastBid(auction, seat);
      if (partnerLast &&
          (partnerLast.level !== partnerBid.level || partnerLast.strain !== partnerBid.strain)) {
        const oppSuits = opponentStrains(auction, seat);
        if (partnerLast.strain !== Strain.NOTRUMP && oppSuits.has(partnerLast.strain)) {
          results = results.map(rec => {
            if (rec.bid.type === 'pass') {
              return { ...rec, priority: Math.min(rec.priority, -5),
                explanation: 'Partner cue-bid opponent\'s suit: forcing, must bid',
                penalties: [{ label: 'Partner cue-bid: forcing', amount: 15 }] };
            }
            return rec;
          });
        }
      }
      break;
    }
    case 'rebid': {
      const myBid = findOwnBid(auction, seat);
      const partnerBid = findPartnerBid(auction, seat);

      if (myBid && partnerBid && opponentsOutbidPartnership(auction, seat)) {
        results = getContestBids(hand, eval_, auction, seat);
        break;
      }

      const ownBidCount = countOwnBids(auction, seat);
      if (ownBidCount >= 2) {
        results = getContinuationBids(hand, eval_, auction, seat);
        break;
      }
      const opener = isOpener(auction, seat);
      if (!myBid) {
        results = hasOpponentBids(auction, seat)
          ? getCompetitiveBids(hand, eval_, auction, seat)
          : [{ bid: pass(), priority: 10, explanation: 'No own bid found in rebid phase', penalties: [] }];
        break;
      }
      if (!partnerBid) {
        if (hasOpponentBids(auction, seat)) {
          results = getCompetitiveBids(hand, eval_, auction, seat);
        } else {
          results = getRebidBids(hand, eval_, myBid, myBid, auction, seat, opener);
        }
        break;
      }
      if (!opener) {
        const partnerLastBid = findPartnerLastBid(auction, seat);
        if (partnerLastBid &&
            (partnerLastBid.level !== partnerBid.level || partnerLastBid.strain !== partnerBid.strain)) {
          results = getResponderRebidBids(hand, eval_, myBid, partnerBid, partnerLastBid, auction, seat);
          break;
        }
        if (hasOpponentBids(auction, seat)) {
          results = getCompetitiveBids(hand, eval_, auction, seat);
          break;
        }
        results = getContinuationBids(hand, eval_, auction, seat);
        break;
      }
      results = getRebidBids(hand, eval_, myBid, partnerBid, auction, seat, opener);
      break;
    }
    case 'competitive':
      results = getCompetitiveBids(hand, eval_, auction, seat);
      break;
    case 'passed-out':
      return [];
    default:
      return [];
  }

  const slamBids = getSlamInitiationBids(hand, eval_, auction, seat);
  if (slamBids.length > 0) {
    results = mergeSlamBids(results, slamBids);
  }

  results = results.filter(rec => isLegalBid(auction, rec.bid));

  if (results.length === 0) {
    results = generateFallbackBids(eval_, auction);
  }

  return results.sort(bidRecCompare);
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
 * Merge slam initiation bids with phase-based results.
 * Convention-specific scores replace generic scores for the same bid
 * when the convention score is higher.
 * @param {BidRecommendation[]} base
 * @param {BidRecommendation[]} slam
 * @returns {BidRecommendation[]}
 */
function mergeSlamBids(base, slam) {
  /** @type {Map<string, BidRecommendation>} */
  const map = new Map();
  for (const rec of base) {
    map.set(bidKey(rec.bid), rec);
  }
  for (const rec of slam) {
    const key = bidKey(rec.bid);
    const existing = map.get(key);
    if (!existing || rec.priority > existing.priority) {
      map.set(key, rec);
    }
  }
  return [...map.values()];
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
 * Safety-net fallback when no phase-specific logic produced legal bids.
 * Returns Pass plus any cheapest legal contract bids so the engine
 * never returns an empty recommendation list.
 * @param {ReturnType<typeof evaluate>} eval_
 * @param {import('../model/auction.js').Auction} auction
 * @returns {BidRecommendation[]}
 */
function generateFallbackBids(eval_, auction) {
  /** @type {BidRecommendation[]} */
  const results = [];

  const passRec = { bid: pass(), priority: 5, explanation: 'Fallback: pass', penalties: [] };
  if (isLegalBid(auction, passRec.bid)) results.push(passRec);

  const current = lastContractBid(auction);
  const startLevel = current ? current.level : 1;
  const startIdx = current ? STRAIN_ORDER.indexOf(current.strain) + 1 : 0;

  const shape = eval_.shape;
  const SHAPE_IDX = [Strain.SPADES, Strain.HEARTS, Strain.DIAMONDS, Strain.CLUBS];
  for (let lvl = startLevel; lvl <= 7; lvl++) {
    const fromIdx = lvl === startLevel ? startIdx : 0;
    for (let si = fromIdx; si < STRAIN_ORDER.length; si++) {
      const strain = STRAIN_ORDER[si];
      const bid = contractBid(lvl, strain);
      if (!isLegalBid(auction, bid)) continue;

      let priority = 0;
      const idx = SHAPE_IDX.indexOf(strain);
      const len = idx >= 0 ? shape[idx] : 0;
      if (strain === Strain.NOTRUMP) {
        priority = eval_.hcp >= 15 ? 3 : 1;
      } else {
        priority = len >= 5 ? 4 : len >= 4 ? 2 : -2;
      }
      if (lvl >= 4) priority -= (lvl - 3) * 2;

      results.push({ bid, priority, explanation: `Fallback: ${lvl}${strain}`, penalties: [] });
      if (results.length >= 8) return results;
    }
  }
  return results;
}

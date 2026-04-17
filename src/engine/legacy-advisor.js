import { pass, contractBid, Strain, STRAIN_ORDER, lastContractBid, isLegalBid } from '../model/bid.js';
import { evaluate } from './evaluate.js';
import {
  classifyAuction,
  findPartnerBid,
  findPartnerLastBid,
  findOwnBid,
  findOpponentBid,
  hasOpponentBids,
  countOwnBids,
  isOpener,
  hasPlayerDoubled,
  hasPartnerDoubled,
  opponentsOutbidPartnership,
  opponentStrains,
  hasDoubleAfterPartnerBid,
  isTransferContextDead,
} from './context.js';
import { SEATS } from '../model/deal.js';
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
 * Compute recommendations via the legacy phase-based engine path.
 * This is extracted from advisor for reuse by the v2 legacy-bridge pack.
 * @param {Hand} hand
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {BidRecommendation[]}
 */
export function getLegacyRecommendations(hand, auction, seat) {
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
      const partnerBidDoubled = hasDoubleAfterPartnerBid(auction, seat);
      if (oppBid) {
        results = getCompetitiveResponseBids(hand, eval_, partnerBid, oppBid, auction, seat);
      } else {
        results = getRespondingBids(hand, eval_, partnerBid, { partnerBidDoubled });
      }

      const partnerLast = findPartnerLastBid(auction, seat);
      if (partnerLast &&
          (partnerLast.level !== partnerBid.level || partnerLast.strain !== partnerBid.strain)) {
        const oppSuits = opponentStrains(auction, seat);
        if (!partnerBidDoubled &&
            partnerLast.strain !== Strain.NOTRUMP && oppSuits.has(partnerLast.strain)) {
          results = results.map(rec => {
            if (rec.bid.type === 'pass') {
              return {
                ...rec,
                priority: Math.min(rec.priority, -5),
                explanation: 'Partner cue-bid opponent\'s suit: forcing, must bid',
                penalties: [{ label: 'Partner cue-bid: forcing', amount: 15 }],
              };
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
          if (myBid && isPreemptLevelBid(myBid)) {
            results = applyPreemptSilentPartnerPenalty(results, eval_);
          } else if (myBid) {
            results = applySilentPartnerRebidPenalty(results, eval_);
          }
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
          results = applyDoubledAtCompetitiveLevelPenalty(results, eval_, auction, seat);
          break;
        }
        if (hasOpponentBids(auction, seat)) {
          results = getCompetitiveBids(hand, eval_, auction, seat);
          break;
        }
        results = getContinuationBids(hand, eval_, auction, seat);
        break;
      }
      if (isTransferContextDead(auction, seat)) {
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
 * priorities are equal, active bids sort ahead of Pass.
 * @param {BidRecommendation} a
 * @param {BidRecommendation} b
 * @returns {number}
 */
export function bidRecCompare(a, b) {
  if (b.priority !== a.priority) return b.priority - a.priority;
  const aPass = a.bid.type === 'pass' ? 1 : 0;
  const bPass = b.bid.type === 'pass' ? 1 : 0;
  return aPass - bPass;
}

/**
 * Merge slam initiation bids with phase-based results.
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
 * True when a bid is a weak two (2♦/2♥/2♠) or preempt (3+level suit).
 * @param {import('../model/bid.js').ContractBid} bid
 * @returns {boolean}
 */
function isPreemptLevelBid(bid) {
  if (bid.level >= 3 && bid.strain !== Strain.NOTRUMP) return true;
  if (bid.level === 2 && bid.strain !== Strain.CLUBS && bid.strain !== Strain.NOTRUMP) return true;
  return false;
}

/**
 * @param {BidRecommendation[]} results
 * @param {ReturnType<typeof evaluate>} eval_
 * @returns {BidRecommendation[]}
 */
function applyPreemptSilentPartnerPenalty(results, eval_) {
  const PREEMPT_SILENT_BASE = 10;
  const penalty = Math.max(0, PREEMPT_SILENT_BASE - Math.max(0, eval_.hcp - 12) * 3);
  if (penalty === 0) return results;

  return results.map(rec => {
    if (rec.bid.type === 'pass') {
      return {
        ...rec,
        priority: Math.max(rec.priority, 9),
        explanation: 'Already described hand with preempt; partner silent — pass',
      };
    }
    return {
      ...rec,
      priority: rec.priority - penalty,
      explanation: `[Preempt opener, partner silent] ${rec.explanation}`,
      penalties: [...rec.penalties, {
        label: 'Already described hand with preempt; partner silent',
        amount: penalty,
      }],
    };
  });
}

/**
 * @param {BidRecommendation[]} results
 * @param {ReturnType<typeof evaluate>} eval_
 * @returns {BidRecommendation[]}
 */
function applySilentPartnerRebidPenalty(results, eval_) {
  const SILENT_REBID_BASE = 4;
  const penalty = Math.max(0, SILENT_REBID_BASE - Math.max(0, eval_.hcp - 14) * 2);
  if (penalty === 0) return results;

  return results.map(rec => {
    if (rec.bid.type === 'pass') {
      return {
        ...rec,
        priority: Math.max(rec.priority, 7),
        explanation: 'Already described hand; partner silent — pass',
      };
    }
    return {
      ...rec,
      priority: rec.priority - penalty,
      explanation: rec.explanation,
      penalties: [...rec.penalties, {
        label: 'Already bid and partner silent: need extras to re-enter',
        amount: penalty,
      }],
    };
  });
}

/** @type {Readonly<Record<Seat, Seat>>} */
const PARTNER_SEAT_MAP = { N: 'S', S: 'N', E: 'W', W: 'E' };

/**
 * @param {BidRecommendation[]} results
 * @param {ReturnType<typeof evaluate>} eval_
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {BidRecommendation[]}
 */
function applyDoubledAtCompetitiveLevelPenalty(results, eval_, auction, seat) {
  if (auction.bids.length < 3) return results;

  const dealerIdx = SEATS.indexOf(auction.dealer);
  const lastIdx = auction.bids.length - 1;
  const lastBid = auction.bids[lastIdx];
  const lastBidSeat = SEATS[(dealerIdx + lastIdx) % SEATS.length];
  const partner = PARTNER_SEAT_MAP[seat];
  if (lastBid.type !== 'double') return results;
  if (lastBidSeat === seat || lastBidSeat === partner) return results;

  /** @type {import('../model/bid.js').ContractBid | null} */
  let doubledContract = null;
  for (let i = lastIdx - 1; i >= 0; i--) {
    if (auction.bids[i].type === 'contract') {
      doubledContract = /** @type {import('../model/bid.js').ContractBid} */ (auction.bids[i]);
      break;
    }
  }
  if (!doubledContract) return results;

  const dcSeat = (() => {
    for (let i = lastIdx - 1; i >= 0; i--) {
      if (auction.bids[i].type === 'contract') {
        return SEATS[(dealerIdx + i) % SEATS.length];
      }
    }
    return null;
  })();
  if (dcSeat !== seat && dcSeat !== partner) return results;
  if (doubledContract.level >= 4) return results;
  if (eval_.hcp >= 12) return results;

  const runPenalty = Math.max(0, (12 - eval_.hcp) * 1.5);
  return results.map(rec => {
    if (rec.bid.type === 'pass') {
      return {
        ...rec,
        priority: Math.max(rec.priority, 9),
        explanation: `Opponents doubled ${doubledContract.level}${doubledContract.strain === Strain.NOTRUMP ? 'NT' : doubledContract.strain}: pass for profitable defense`,
      };
    }
    if (rec.bid.type === 'contract') {
      const cb = /** @type {import('../model/bid.js').ContractBid} */ (rec.bid);
      const isGame = (cb.strain === Strain.NOTRUMP && cb.level >= 3) ||
        ((cb.strain === Strain.SPADES || cb.strain === Strain.HEARTS) && cb.level >= 4) ||
        cb.level >= 5;
      if (isGame) {
        return {
          ...rec,
          priority: rec.priority - runPenalty,
          penalties: [...rec.penalties, {
            label: `Opponents doubled: ${eval_.hcp} HCP too weak to run to game`,
            amount: runPenalty,
          }],
        };
      }
    }
    return rec;
  });
}

/**
 * Safety-net fallback when no phase-specific logic produced legal bids.
 * @param {ReturnType<typeof evaluate>} eval_
 * @param {Auction} auction
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

import { pass, Strain, isLegalBid, contractBid, STRAIN_ORDER, lastContractBid } from '../../../model/bid.js';
import { SEATS } from '../../../model/deal.js';
import {
  classifyAuction,
  findPartnerBid,
  findPartnerLastBid,
  findOwnBid,
  findOpponentBid,
  hasOpponentBids,
  countOwnBids,
  hasPlayerDoubled,
  hasPartnerDoubled,
  opponentsOutbidPartnership,
  opponentStrains,
  hasDoubleAfterPartnerBid,
  isOpener,
  isTransferContextDead,
} from '../../../engine/context.js';
import { getOpeningBids } from '../../../engine/opening.js';
import { getRespondingBids } from '../../../engine/responding.js';
import { getRebidBids, getContinuationBids, getResponderRebidBids } from '../../../engine/rebid.js';
import { getCompetitiveBids, getCompetitiveResponseBids, getPostDoubleBids } from '../../../engine/competitive.js';
import { getConventionResponse, getSlamInitiationBids } from '../../../engine/conventions.js';
import { getContestBids } from '../../../engine/contest.js';

/**
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 * @typedef {import('../../../model/bid.js').Bid} Bid
 * @typedef {import('../../../model/bid.js').ContractBid} ContractBid
 * @typedef {import('../../../model/deal.js').Seat} Seat
 */

/** @type {Readonly<Record<Seat, Seat>>} */
const PARTNER_SEAT_MAP = { N: 'S', S: 'N', E: 'W', W: 'E' };

/**
 * Native v2 fallback scorer that preserves legacy phase behavior while
 * running through the v2 convention dispatcher.
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[]}
 */
function runPhaseBaselinePack(ctx) {
  const conventionResp = getConventionResponse(ctx.hand, ctx.eval_, ctx.auction, ctx.seat);
  if (conventionResp) return sortRecommendations(filterLegal(conventionResp, ctx.auction));

  const phase = classifyAuction(ctx.auction, ctx.seat).phase;
  let results = scoreByPhase(ctx, phase);

  const slamBids = getSlamInitiationBids(ctx.hand, ctx.eval_, ctx.auction, ctx.seat);
  if (slamBids.length > 0) {
    results = mergeSlamBids(results, slamBids);
  }

  const legal = filterLegal(results, ctx.auction);
  if (legal.length > 0) return sortRecommendations(legal);
  return sortRecommendations(generateFallbackBids(ctx.eval_, ctx.auction));
}

/**
 * @type {{ id: string, priority: number, when: (ctx: ConventionContext) => boolean, run: (ctx: ConventionContext) => BidRecommendation[] | null }}
 */
export const phaseBaselinePack = {
  id: 'phase-baseline',
  priority: -850,
  when: () => true,
  run: runPhaseBaselinePack,
};

/**
 * @param {ConventionContext} ctx
 * @param {import('../../../engine/context.js').AuctionPhase} phase
 * @returns {BidRecommendation[]}
 */
function scoreByPhase(ctx, phase) {
  if (phase === 'opening') return getOpeningBids(ctx.hand, ctx.eval_, classifyAuction(ctx.auction, ctx.seat).seatPosition);
  if (phase === 'responding') return scoreRespondingPhase(ctx);
  if (phase === 'rebid') return scoreRebidPhase(ctx);
  if (phase === 'competitive') return getCompetitiveBids(ctx.hand, ctx.eval_, ctx.auction, ctx.seat);
  return [];
}

/**
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[]}
 */
function scoreRespondingPhase(ctx) {
  const partnerBid = findPartnerBid(ctx.auction, ctx.seat);
  if (!partnerBid) return [passRecommendation('No partner bid found')];

  if (hasPlayerDoubled(ctx.auction, ctx.seat)) {
    return getPostDoubleBids(ctx.hand, ctx.eval_, partnerBid, ctx.auction, ctx.seat);
  }
  if (hasPartnerDoubled(ctx.auction, ctx.seat)) {
    return getCompetitiveBids(ctx.hand, ctx.eval_, ctx.auction, ctx.seat);
  }

  const oppBid = findOpponentBid(ctx.auction, ctx.seat);
  const partnerBidDoubled = hasDoubleAfterPartnerBid(ctx.auction, ctx.seat);
  let results = oppBid
    ? getCompetitiveResponseBids(ctx.hand, ctx.eval_, partnerBid, oppBid, ctx.auction, ctx.seat)
    : getRespondingBids(ctx.hand, ctx.eval_, partnerBid, { partnerBidDoubled });

  const partnerLast = findPartnerLastBid(ctx.auction, ctx.seat);
  if (!partnerLast) return results;
  const sameAsFirst = partnerLast.level === partnerBid.level && partnerLast.strain === partnerBid.strain;
  if (sameAsFirst || partnerBidDoubled) return results;

  const oppSuits = opponentStrains(ctx.auction, ctx.seat);
  if (partnerLast.strain === Strain.NOTRUMP || !oppSuits.has(partnerLast.strain)) return results;
  return applyCueBidForcingPenalty(results);
}

/**
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[]}
 */
function scoreRebidPhase(ctx) {
  const myBid = findOwnBid(ctx.auction, ctx.seat);
  const partnerBid = findPartnerBid(ctx.auction, ctx.seat);

  if (myBid && partnerBid && opponentsOutbidPartnership(ctx.auction, ctx.seat)) {
    return getContestBids(ctx.hand, ctx.eval_, ctx.auction, ctx.seat);
  }

  const ownBidCount = countOwnBids(ctx.auction, ctx.seat);
  if (ownBidCount >= 2) {
    return getContinuationBids(ctx.hand, ctx.eval_, ctx.auction, ctx.seat);
  }

  const opener = isOpener(ctx.auction, ctx.seat);
  if (!myBid) {
    return hasOpponentBids(ctx.auction, ctx.seat)
      ? getCompetitiveBids(ctx.hand, ctx.eval_, ctx.auction, ctx.seat)
      : [passRecommendation('No own bid found in rebid phase')];
  }

  if (!partnerBid) {
    if (!hasOpponentBids(ctx.auction, ctx.seat)) {
      return getRebidBids(ctx.hand, ctx.eval_, myBid, myBid, ctx.auction, ctx.seat, opener);
    }
    const base = getCompetitiveBids(ctx.hand, ctx.eval_, ctx.auction, ctx.seat);
    if (isPreemptLevelBid(myBid)) return applyPreemptSilentPartnerPenalty(base, ctx.eval_.hcp);
    return applySilentPartnerRebidPenalty(base, ctx.eval_.hcp);
  }

  if (!opener) {
    const partnerLastBid = findPartnerLastBid(ctx.auction, ctx.seat);
    if (partnerLastBid &&
        (partnerLastBid.level !== partnerBid.level || partnerLastBid.strain !== partnerBid.strain)) {
      const rebids = getResponderRebidBids(
        ctx.hand,
        ctx.eval_,
        myBid,
        partnerBid,
        partnerLastBid,
        ctx.auction,
        ctx.seat,
      );
      return applyDoubledAtCompetitiveLevelPenalty(rebids, ctx.eval_.hcp, ctx.auction, ctx.seat);
    }
    if (hasOpponentBids(ctx.auction, ctx.seat)) {
      return getCompetitiveBids(ctx.hand, ctx.eval_, ctx.auction, ctx.seat);
    }
    return getContinuationBids(ctx.hand, ctx.eval_, ctx.auction, ctx.seat);
  }

  if (isTransferContextDead(ctx.auction, ctx.seat)) {
    return getContinuationBids(ctx.hand, ctx.eval_, ctx.auction, ctx.seat);
  }
  return getRebidBids(ctx.hand, ctx.eval_, myBid, partnerBid, ctx.auction, ctx.seat, opener);
}

/**
 * @param {BidRecommendation[]} recommendations
 * @param {import('../../../model/bid.js').Auction} auction
 * @returns {BidRecommendation[]}
 */
function filterLegal(recommendations, auction) {
  return recommendations.filter(rec => isLegalBid(auction, rec.bid));
}

/**
 * @param {BidRecommendation[]} recommendations
 * @returns {BidRecommendation[]}
 */
function sortRecommendations(recommendations) {
  return [...recommendations].sort(compareRecommendations);
}

/**
 * @param {BidRecommendation[]} results
 * @returns {BidRecommendation[]}
 */
function applyCueBidForcingPenalty(results) {
  return results.map(rec => {
    if (rec.bid.type !== 'pass') return rec;
    return {
      ...rec,
      priority: Math.min(rec.priority, -5),
      explanation: 'Partner cue-bid opponent suit: forcing, must bid',
      penalties: [{ label: 'Partner cue-bid: forcing', amount: 15 }],
    };
  });
}

/**
 * @param {BidRecommendation[]} results
 * @param {number} hcp
 * @returns {BidRecommendation[]}
 */
function applyPreemptSilentPartnerPenalty(results, hcp) {
  const PREEMPT_SILENT_BASE = 10;
  const penalty = Math.max(0, PREEMPT_SILENT_BASE - Math.max(0, hcp - 12) * 3);
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
 * @param {number} hcp
 * @returns {BidRecommendation[]}
 */
function applySilentPartnerRebidPenalty(results, hcp) {
  const SILENT_REBID_BASE = 4;
  const penalty = Math.max(0, SILENT_REBID_BASE - Math.max(0, hcp - 14) * 2);
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

/**
 * @param {BidRecommendation[]} results
 * @param {number} hcp
 * @param {import('../../../model/bid.js').Auction} auction
 * @param {Seat} seat
 * @returns {BidRecommendation[]}
 */
function applyDoubledAtCompetitiveLevelPenalty(results, hcp, auction, seat) {
  if (auction.bids.length < 3) return results;
  const dealerIdx = SEATS.indexOf(auction.dealer);
  const lastIdx = auction.bids.length - 1;
  const lastBid = auction.bids[lastIdx];
  const lastBidSeat = SEATS[(dealerIdx + lastIdx) % SEATS.length];
  const partner = PARTNER_SEAT_MAP[seat];
  if (lastBid.type !== 'double') return results;
  if (lastBidSeat === seat || lastBidSeat === partner) return results;

  const doubled = findDoubledContract(auction);
  if (!doubled) return results;
  if (doubled.level >= 4 || hcp >= 12) return results;

  const contractSeat = seatOfLastContract(auction);
  if (contractSeat !== seat && contractSeat !== partner) return results;

  const runPenalty = Math.max(0, (12 - hcp) * 1.5);
  return results.map(rec => {
    if (rec.bid.type === 'pass') {
      return {
        ...rec,
        priority: Math.max(rec.priority, 9),
        explanation: `Opponents doubled ${doubled.level}${bidStrainLabel(doubled.strain)}: pass for defense`,
      };
    }
    if (rec.bid.type !== 'contract') return rec;
    if (!isGameLevel(rec.bid)) return rec;
    return {
      ...rec,
      priority: rec.priority - runPenalty,
      penalties: [...rec.penalties, {
        label: `Opponents doubled: ${hcp} HCP too weak to run to game`,
        amount: runPenalty,
      }],
    };
  });
}

/**
 * @param {BidRecommendation[]} base
 * @param {BidRecommendation[]} slam
 * @returns {BidRecommendation[]}
 */
function mergeSlamBids(base, slam) {
  /** @type {Map<string, BidRecommendation>} */
  const map = new Map();
  for (const rec of base) map.set(bidKey(rec.bid), rec);
  for (const rec of slam) {
    const key = bidKey(rec.bid);
    const existing = map.get(key);
    if (!existing || rec.priority > existing.priority) map.set(key, rec);
  }
  return [...map.values()];
}

/**
 * @param {import('../../../engine/evaluate.js').Evaluation} eval_
 * @param {import('../../../model/bid.js').Auction} auction
 * @returns {BidRecommendation[]}
 */
function generateFallbackBids(eval_, auction) {
  /** @type {BidRecommendation[]} */
  const results = [];
  const passRec = passRecommendation('Fallback: pass');
  if (isLegalBid(auction, passRec.bid)) results.push(passRec);

  const current = lastContractBid(auction);
  const startLevel = current ? current.level : 1;
  const startIdx = current ? STRAIN_ORDER.indexOf(current.strain) + 1 : 0;
  const shape = eval_.shape;
  const SHAPE_IDX = [Strain.SPADES, Strain.HEARTS, Strain.DIAMONDS, Strain.CLUBS];

  for (let level = startLevel; level <= 7; level++) {
    const fromIdx = level === startLevel ? startIdx : 0;
    for (let si = fromIdx; si < STRAIN_ORDER.length; si++) {
      const strain = STRAIN_ORDER[si];
      const bid = contractBid(level, strain);
      if (!isLegalBid(auction, bid)) continue;

      let priority = 0;
      const idx = SHAPE_IDX.indexOf(strain);
      const len = idx >= 0 ? shape[idx] : 0;
      if (strain === Strain.NOTRUMP) priority = eval_.hcp >= 15 ? 3 : 1;
      else priority = len >= 5 ? 4 : len >= 4 ? 2 : -2;
      if (level >= 4) priority -= (level - 3) * 2;

      results.push({
        bid,
        priority,
        explanation: `Fallback: ${level}${strain}`,
        penalties: [],
      });
      if (results.length >= 8) return results;
    }
  }
  return results;
}

/**
 * @param {Bid} bid
 * @returns {string}
 */
function bidKey(bid) {
  if (bid.type === 'contract') return `${bid.level}${bid.strain}`;
  return bid.type;
}

/**
 * @param {BidRecommendation} a
 * @param {BidRecommendation} b
 * @returns {number}
 */
function compareRecommendations(a, b) {
  if (b.priority !== a.priority) return b.priority - a.priority;
  const aPass = a.bid.type === 'pass' ? 1 : 0;
  const bPass = b.bid.type === 'pass' ? 1 : 0;
  return aPass - bPass;
}

/**
 * @param {string} explanation
 * @returns {BidRecommendation}
 */
function passRecommendation(explanation) {
  return { bid: pass(), priority: 10, explanation, penalties: [] };
}

/**
 * @param {ContractBid} bid
 * @returns {boolean}
 */
function isPreemptLevelBid(bid) {
  if (bid.level >= 3 && bid.strain !== Strain.NOTRUMP) return true;
  if (bid.level === 2 && bid.strain !== Strain.CLUBS && bid.strain !== Strain.NOTRUMP) return true;
  return false;
}

/**
 * @param {ContractBid} bid
 * @returns {boolean}
 */
function isGameLevel(bid) {
  if (bid.strain === Strain.NOTRUMP && bid.level >= 3) return true;
  if ((bid.strain === Strain.SPADES || bid.strain === Strain.HEARTS) && bid.level >= 4) return true;
  return bid.level >= 5;
}

/**
 * @param {import('../../../model/bid.js').Auction} auction
 * @returns {ContractBid | null}
 */
function findDoubledContract(auction) {
  for (let i = auction.bids.length - 2; i >= 0; i--) {
    if (auction.bids[i].type === 'contract') return /** @type {ContractBid} */ (auction.bids[i]);
  }
  return null;
}

/**
 * @param {import('../../../model/bid.js').Auction} auction
 * @returns {Seat | null}
 */
function seatOfLastContract(auction) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    if (auction.bids[i].type !== 'contract') continue;
    return /** @type {Seat} */ (SEATS[(dealerIdx + i) % SEATS.length]);
  }
  return null;
}

/**
 * @param {'C'|'D'|'H'|'S'|'NT'} strain
 * @returns {string}
 */
function bidStrainLabel(strain) {
  return strain === Strain.NOTRUMP ? 'NT' : strain;
}


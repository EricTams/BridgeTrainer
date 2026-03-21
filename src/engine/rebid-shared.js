import { contractBid, pass, dbl, Strain, STRAIN_ORDER, STRAIN_SYMBOLS, lastContractBid } from '../model/bid.js';
import { pen, penTotal } from './penalty.js';

/**
 * @typedef {import('../model/hand.js').Hand} Hand
 * @typedef {import('./evaluate.js').Evaluation} Evaluation
 * @typedef {import('../model/bid.js').ContractBid} ContractBid
 * @typedef {import('../model/bid.js').Bid} Bid
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('./opening.js').BidRecommendation} BidRecommendation
 * @typedef {import('./penalty.js').PenaltyItem} PenaltyItem
 */

// ── Scoring costs ────────────────────────────────────────────────────

export const MAX_SCORE = 10;

export const HCP_COST = 2;
export const LENGTH_SHORT_COST = 3;
export const FORCING_PASS_COST = 15;
export const SHAPE_SEMI_COST = 4;
export const SHAPE_UNBAL_COST = 8;
export const FIT_PREF_COST = 2;
export const LONG_SUIT_PREF_COST = 2;
export const MAJOR_FIT_GAME_COST = 3;

export const STAYMAN_WRONG_BID_COST = 10;
export const DENY_WITH_MAJOR_COST = 8;
export const WRONG_MAJOR_ORDER_COST = 6;

export const MISS_SUPER_ACCEPT_COST = 2;
export const WRONG_SUPER_ACCEPT_COST = 5;
export const MISS_TRANSFER_COST = 15;

export const GAME_REACHED_COST = 5;

// ── SAYC thresholds ─────────────────────────────────────────────────

export const REBID_1NT_MIN = 12;
export const REBID_1NT_MAX = 14;

export const MIN_MIN = 13;
export const MIN_MAX = 16;
export const INV_MIN = 17;
export const INV_MAX = 18;
export const GF_MIN = 19;

export const REBID_2NT_MIN = 18;
export const REBID_2NT_MAX = 19;
export const REVERSE_MIN = 17;

export const FIT_MIN = 4;
export const REBID_SUIT_MIN = 6;
export const NEW_SUIT_MIN = 4;

export const SUPER_ACCEPT_SUPPORT = 4;
export const SUPER_ACCEPT_HCP = 17;
export const NT_ACCEPT_HCP = 16;

export const RAISE_PASS_MAX = 14;
export const RAISE_INV_MIN = 15;
export const RAISE_INV_MAX = 17;
export const RAISE_GAME_MIN = 18;

export const LIMIT_ACCEPT_MIN = 14;

// ── Display ──────────────────────────────────────────────────────────

export const SHAPE_STRAINS = [Strain.SPADES, Strain.HEARTS, Strain.DIAMONDS, Strain.CLUBS];

/** @type {Readonly<Record<import('../model/bid.js').Strain, string>>} */
export const STRAIN_DISPLAY = {
  [Strain.CLUBS]: 'clubs',
  [Strain.DIAMONDS]: 'diamonds',
  [Strain.HEARTS]: 'hearts',
  [Strain.SPADES]: 'spades',
  [Strain.NOTRUMP]: 'notrump',
};

// ── Re-exports for convenience ───────────────────────────────────────

export { contractBid, pass, dbl, Strain, STRAIN_ORDER, STRAIN_SYMBOLS, lastContractBid };
export { pen, penTotal };

// ── Candidate generation ─────────────────────────────────────────────

/**
 * @param {Auction} auction
 * @returns {Bid[]}
 */
export function rebidCandidates(auction) {
  const last = lastContractBid(auction);
  /** @type {Bid[]} */
  const bids = [pass()];
  for (let level = 1; level <= 7; level++) {
    for (const strain of STRAIN_ORDER) {
      const bid = contractBid(level, strain);
      if (!last || isHigher(bid, last)) bids.push(bid);
    }
  }
  return bids;
}

/** @param {ContractBid} a @param {ContractBid} b */
export function isHigher(a, b) {
  if (a.level !== b.level) return a.level > b.level;
  return STRAIN_ORDER.indexOf(a.strain) > STRAIN_ORDER.indexOf(b.strain);
}

// ── Helpers ──────────────────────────────────────────────────────────

/** @param {number[]} shape @param {import('../model/bid.js').Strain} strain */
export function suitLen(shape, strain) {
  return shape[SHAPE_STRAINS.indexOf(strain)];
}

/** @param {import('../model/bid.js').Strain} strain */
export function isMajor(strain) {
  return strain === Strain.SPADES || strain === Strain.HEARTS;
}

/**
 * @param {import('../model/bid.js').Strain} a
 * @param {import('../model/bid.js').Strain} b
 */
export function ranksAbove(a, b) {
  return STRAIN_ORDER.indexOf(a) > STRAIN_ORDER.indexOf(b);
}

export function hcpDev(hcp, min, max) {
  if (hcp < min) return min - hcp;
  if (hcp > max) return hcp - max;
  return 0;
}

export function shapePenalty(sc) {
  if (sc === 'semi-balanced') return SHAPE_SEMI_COST;
  if (sc === 'unbalanced') return SHAPE_UNBAL_COST;
  return 0;
}

export function deduct(penalty) {
  return Math.round((MAX_SCORE - penalty) * 10) / 10;
}

/**
 * @param {Bid} bid
 * @param {number} priority
 * @param {string} explanation
 * @param {PenaltyItem[]} [penalties]
 * @returns {BidRecommendation}
 */
export function scored(bid, priority, explanation, penalties) {
  return { bid, priority, explanation, penalties: penalties || [] };
}

/** @param {ContractBid} bid */
export function isGameLevel(bid) {
  if (bid.strain === Strain.NOTRUMP) return bid.level >= 3;
  if (isMajor(bid.strain)) return bid.level >= 4;
  return bid.level >= 5;
}

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @returns {BidRecommendation}
 */
export function scoreGenericRebid(bid, eval_) {
  if (bid.type === 'pass') return scored(bid, deduct(0), 'Pass');
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { hcp } = eval_;
  const { level, strain } = bid;
  const minHcp = MIN_MIN + (level - 1) * 3;
  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
  const sym = strain === Strain.NOTRUMP ? 'NT' : STRAIN_SYMBOLS[strain];
  return scored(bid, deduct(penTotal(p)), `${level}${sym}: non-standard rebid`, p);
}

/**
 * Cheapest level at which `strain` can be legally bid over `afterBid`.
 * @param {import('../model/bid.js').Strain} strain
 * @param {ContractBid} afterBid
 * @returns {number}
 */
export function minBidLevel(strain, afterBid) {
  if (strain !== afterBid.strain && ranksAbove(strain, afterBid.strain)) {
    return afterBid.level;
  }
  return afterBid.level + 1;
}

/**
 * If partner's bid is in the opponents' suit, treat it as a cue-bid
 * raise of our suit (mapped to an equivalent level raise).
 * @param {ContractBid} partnerBid
 * @param {ContractBid} myBid
 * @param {Set<import('../model/bid.js').Strain>} oppSuits
 * @returns {ContractBid}
 */
export function resolvePartnerBid(partnerBid, myBid, oppSuits) {
  if (!oppSuits.has(partnerBid.strain)) return partnerBid;
  return contractBid(partnerBid.level, myBid.strain);
}

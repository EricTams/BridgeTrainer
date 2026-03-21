import { contractBid, pass, dbl, Strain, STRAIN_ORDER, STRAIN_SYMBOLS, lastContractBid, isLegalBid } from '../model/bid.js';
import { SEATS } from '../model/deal.js';
import { Rank } from '../model/card.js';
import { pen, penTotal } from './penalty.js';
import {
  findOpponentBid,
  hasPartnerDoubled,
  isBalancingSeat,
  findDoubledBid,
  findLastDoubledBid,
  findPartnerLastBid,
  opponentStrains,
  hasPlayerDoubled,
  reopeningWithoutOwnBid,
  isSandwichBetweenOpponents,
  directCompetitiveContextPrefix,
} from './context.js';

/**
 * @typedef {import('../model/hand.js').Hand} Hand
 * @typedef {import('./evaluate.js').Evaluation} Evaluation
 * @typedef {import('../model/bid.js').ContractBid} ContractBid
 * @typedef {import('../model/bid.js').Bid} Bid
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('../model/deal.js').Seat} Seat
 * @typedef {import('./opening.js').BidRecommendation} BidRecommendation
 * @typedef {import('./penalty.js').PenaltyItem} PenaltyItem
 */

// ── Scoring costs ────────────────────────────────────────────────────

const MAX_SCORE = 10;

const HCP_COST = 2;
const LENGTH_SHORT_COST = 3;
const SUIT_QUALITY_COST = 3;
const SHAPE_SEMI_COST = 4;
const SHAPE_UNBAL_COST = 8;
const STOPPER_COST = 6;
const SUIT_PREF_COST = 1.5;

// Overcall
const OC_1_MIN_HCP = 8;
const OC_1_MAX_HCP = 16;
const OC_2_MIN_HCP = 10;
const OC_2_MAX_HCP = 16;
const OC_MIN_LEN = 5;
const OC_HONOR_MIN = 2;
const OC_PASS_HCP_COST = 2;
const OC_PASS_SUIT_COST = 1.5;
const OC_OPP_SUIT_COST = 15;

// Level-scaled overcall requirements (3-level+)
const OC_3_MIN_HCP = 12;
const OC_4_MIN_HCP = 14;
const OC_5_MIN_HCP = 16;
const OC_3_MIN_LEN = 6;
const OC_4_MIN_LEN = 7;
const OC_5_MIN_LEN = 7;

// 1NT overcall
const NT_OC_MIN_HCP = 15;
const NT_OC_MAX_HCP = 18;

// Jump overcall (weak)
const JUMP_OC_MIN_HCP = 5;
const JUMP_OC_MAX_HCP = 10;
const JUMP_OC_MIN_LEN = 6;
/** Penalty when a "weak jump" shape is not the textbook direct-seat case */
const JUMP_OC_AWKWARD_CONTEXT_COST = 6;

// Penalty double of 1NT
const PENALTY_DBL_NT_MIN_HCP = 15;

// Takeout double
const DBL_MIN_HCP = 12;
const DBL_SHORT_MAX = 2;
const DBL_UNBID_MIN = 3;
const DBL_STRONG_MIN = 17;
const DBL_SHORTNESS_COST = 3;
const DBL_UNBID_COST = 2;
const DBL_PASS_WITH_VALUES_COST = 2;
const DBL_LEVEL_HCP_STEP = 2;
const DBL_HIGH_LEVEL_RISK = 2;

// Re-doubling (penalty after initial takeout): need extras to act again
const POST_DBL_EXTRAS_MIN = 15;
const POST_DBL_LEVEL_RISK = 1.5;

// Advance partner's takeout double
const ADV_MIN_MAX = 8;
const ADV_INV_MIN = 9;
const ADV_INV_MAX = 11;
const ADV_GF_MIN = 12;
const ADV_1NT_MIN = 6;
const ADV_1NT_MAX = 10;
const ADV_2NT_MIN = 11;
const ADV_2NT_MAX = 12;
const ADV_3NT_MIN = 13;
const ADV_SUIT_MIN = 4;
const ADV_CUEBID_COST = 5;
const ADV_PASS_COST = 10;

// Advance partner's overcall
const AOC_CUEBID_LEVEL_COST = 3;
const AOC_RAISE_MIN = 8;
const AOC_RAISE_MAX = 10;
const AOC_RAISE_SUPPORT = 3;
const AOC_CUEBID_MIN = 11;
const AOC_CUEBID_SUPPORT = 3;
const AOC_NEW_SUIT_MIN = 10;
const AOC_NEW_SUIT_LEN = 5;
const AOC_1NT_MIN = 8;
const AOC_1NT_MAX = 12;
const AOC_PASS_MAX = 7;
const AOC_SUPPORT_PASS_COST = 2;

// Negative double
const NEG_DBL_1_MIN = 6;
const NEG_DBL_2_MIN = 8;
const NEG_DBL_3_MIN = 10;
const NEG_DBL_MAJOR_MIN = 4;
const NEG_DBL_NO_MAJOR_COST = 10;

// Contextual adjustments (B-05: flexibility beyond fixed bands)
const SUIT_QUALITY_EXCELLENT = 3;   // 3+ top-5 honors → lower HCP floor by 1
const SUIT_QUALITY_POOR_EXTRA = 1;  // 0-1 top-5 honor → raise HCP floor by 1
const LONG_SUIT_6_DISCOUNT = 1;     // 6-card suit → lower HCP floor by 1
const LONG_SUIT_7_DISCOUNT = 2;     // 7-card suit → lower HCP floor by 2
const IDEAL_TAKEOUT_VOID_BONUS = 2; // void in opp suit → reduce penalty by 2
const ADV_PARTNER_LEVEL_ADJ = 2;    // per level above 1 that partner doubled: combined floor rises

// Balancing
const BALANCE_HCP_DISCOUNT = 3;

// ── Display ──────────────────────────────────────────────────────────

const SHAPE_STRAINS = [Strain.SPADES, Strain.HEARTS, Strain.DIAMONDS, Strain.CLUBS];

/** @type {Readonly<Record<import('../model/bid.js').Strain, string>>} */
const STRAIN_DISPLAY = {
  [Strain.CLUBS]: 'clubs',
  [Strain.DIAMONDS]: 'diamonds',
  [Strain.HEARTS]: 'hearts',
  [Strain.SPADES]: 'spades',
  [Strain.NOTRUMP]: 'notrump',
};

/** @type {Readonly<Record<Seat, Seat>>} */
const PARTNER_SEAT = { N: 'S', S: 'N', E: 'W', W: 'E' };

// ═════════════════════════════════════════════════════════════════════
// ENTRY POINTS
// ═════════════════════════════════════════════════════════════════════

/**
 * Get bids for the competitive phase (only opponents have contract bids).
 * Handles: overcalls, takeout doubles, advancing partner's double, balancing.
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {BidRecommendation[]}
 */
export function getCompetitiveBids(hand, eval_, auction, seat) {
  const oppBid = findOpponentBid(auction, seat);
  if (!oppBid) return [scored(pass(), 10, 'No opponent bid found')];

  const partnerDbl = hasPartnerDoubled(auction, seat);
  const balancing = isBalancingSeat(auction);

  if (partnerDbl) {
    const doubledBid = findLastDoubledBid(auction, PARTNER_SEAT[seat]);
    if (doubledBid && doubledBid.strain === Strain.NOTRUMP) {
      return scoreAdvancePenaltyDblCandidates(hand, eval_, oppBid, balancing, auction);
    }
    return scoreAdvanceDoubleCandidates(hand, eval_, oppBid, balancing, auction);
  }
  return scoreDirectCandidates(hand, eval_, oppBid, balancing, auction, seat);
}

/**
 * Get bids when responding to partner's bid with opponent interference.
 * Handles: negative doubles (partner opened), advancing partner's overcall.
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} partnerBid
 * @param {ContractBid} oppBid
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {BidRecommendation[]}
 */
export function getCompetitiveResponseBids(hand, eval_, partnerBid, oppBid, auction, seat) {
  const partnerOpened = isPartnerOpener(auction, seat);
  const balancing = isBalancingSeat(auction);

  if (partnerOpened) {
    return scoreNegDblCandidates(hand, eval_, partnerBid, oppBid, balancing, auction);
  }
  return scoreAdvanceOvercallCandidates(hand, eval_, partnerBid, oppBid, balancing, auction);
}

// ═════════════════════════════════════════════════════════════════════
// DIRECT COMPETITIVE ACTION (overcalls, takeout doubles)
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {boolean} balancing
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {BidRecommendation[]}
 */
function scoreDirectCandidates(hand, eval_, oppBid, balancing, auction, seat) {
  const candidates = directCandidates(oppBid, auction);
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(scoreDirectBid(bid, hand, eval_, oppBid, balancing, auction, seat));
  }
  return results.sort((a, b) => b.priority - a.priority);
}


/**
 * Generate all candidate bids for direct competitive action.
 * Includes Pass, Double, and legal contract bids up to 3 levels above
 * the current contract (capped at 7).
 * @param {ContractBid} oppBid
 * @param {Auction} auction
 * @returns {Bid[]}
 */
function directCandidates(oppBid, auction) {
  const last = lastContractBid(auction);
  const maxLevel = Math.min(7, (last ? last.level : 0) + 3);
  /** @type {Bid[]} */
  const bids = [pass()];
  const d = dbl();
  if (isLegalBid(auction, d)) bids.push(d);
  for (let level = 1; level <= maxLevel; level++) {
    for (const strain of STRAIN_ORDER) {
      const bid = contractBid(level, strain);
      if (!last || isHigher(bid, last)) bids.push(bid);
    }
  }
  return bids;
}

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {boolean} balancing
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {BidRecommendation}
 */
function scoreDirectBid(bid, hand, eval_, oppBid, balancing, auction, seat) {
  /** @type {BidRecommendation} */
  let rec;
  if (bid.type === 'pass') rec = scoreDirectPass(bid, hand, eval_, oppBid, balancing);
  else if (bid.type === 'double') {
    if (oppBid.strain === Strain.NOTRUMP) {
      rec = scorePenaltyDoubleOfNT(bid, eval_, oppBid, balancing);
    } else {
      rec = scoreTakeoutDouble(bid, eval_, oppBid, balancing);
    }
  } else if (bid.type !== 'contract') rec = scored(bid, 0, '');
  else {
    const { level, strain } = bid;
    if (strain === Strain.NOTRUMP) rec = scoreNTOvercall(bid, hand, eval_, oppBid, balancing);
    else if (isJumpOvercall(level, strain, oppBid) && level <= 4) {
      rec = scoreJumpOvercall(bid, hand, eval_, oppBid, auction, seat);
    } else {
      rec = scoreSuitOvercall(bid, hand, eval_, oppBid, balancing);
    }
  }

  const prefix = directCompetitiveContextPrefix(auction, seat);
  if (!prefix) return rec;
  return { ...rec, explanation: prefix + rec.explanation };
}

// ── Direct: Pass ─────────────────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {boolean} balancing
 */
function scoreDirectPass(bid, hand, eval_, oppBid, balancing) {
  const { hcp, shape } = eval_;
  const adj = balancing ? BALANCE_HCP_DISCOUNT : 0;
  /** @type {PenaltyItem[]} */
  const p = [];

  if (oppBid.strain === Strain.NOTRUMP) {
    const penaltyThreshold = PENALTY_DBL_NT_MIN_HCP - adj;
    if (hcp >= penaltyThreshold) {
      pen(p, `${hcp} HCP: penalty double of ${oppBid.level}NT available`,
        (hcp - penaltyThreshold + 1) * OC_PASS_HCP_COST);
    }
    const bestLen = Math.max(...shape);
    if (bestLen >= OC_MIN_LEN && hcp >= OC_1_MIN_HCP - adj) {
      pen(p, `${bestLen}-card suit: consider overcalling`,
        (bestLen - OC_MIN_LEN + 1) * OC_PASS_SUIT_COST);
    }
  } else {
    const threshold = OC_1_MIN_HCP - adj;
    if (hcp >= threshold) {
      const bestLen = longestNonOppSuit(shape, oppBid.strain);
      if (bestLen >= OC_MIN_LEN && hasOvercallQuality(hand, bestSuitExcluding(shape, oppBid.strain))) {
        pen(p, `${hcp} HCP with ${bestLen}-card suit: consider overcalling`,
          (hcp - threshold + 1) * OC_PASS_HCP_COST);
      }
      pen(p, `${hcp} HCP above pass threshold (${threshold})`,
        Math.max(0, hcp - threshold) * OC_PASS_HCP_COST);
    }
    if (hcp >= DBL_MIN_HCP - adj && hasTakeoutShape(shape, oppBid.strain)) {
      pen(p, 'Takeout double shape available', DBL_PASS_WITH_VALUES_COST);
    }
  }

  let expl;
  if (penTotal(p) < 0.5) expl = `${hcp} HCP: correct to pass`;
  else if (balancing) expl = `${hcp} HCP in balancing seat: consider acting`;
  else expl = `${hcp} HCP: consider competing`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Direct: Suit Overcall ────────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {boolean} balancing
 */
function scoreSuitOvercall(bid, hand, eval_, oppBid, balancing) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];
  const sym = STRAIN_SYMBOLS[strain];
  const adj = balancing ? BALANCE_HCP_DISCOUNT : 0;

  const reqs = overcallReqs(level, adj);
  const ctxAdj = overcallContextAdj(hand, strain, len);
  const minHcp = Math.max(5, reqs.minHcp + ctxAdj);
  const maxHcp = reqs.maxHcp;
  const minLen = reqs.minLen;
  const lenShortMult = reqs.lenShortMult;

  /** @type {PenaltyItem[]} */
  const p = [];

  if (strain === oppBid.strain) {
    pen(p, `Bidding opponent's ${name} suit`, OC_OPP_SUIT_COST);
    return scored(bid, deduct(penTotal(p)),
      `Cannot overcall in opponent's ${name}`, p);
  }

  pen(p, `${hcp} HCP, need ${minHcp}-${maxHcp}`, hcpDev(hcp, minHcp, maxHcp) * HCP_COST);
  pen(p, `${len} ${name}, need ${minLen}+`, Math.max(0, minLen - len) * lenShortMult);
  if (len >= minLen && !hasOvercallQuality(hand, strain)) {
    pen(p, 'Poor suit quality for overcall', SUIT_QUALITY_COST);
  }
  pen(p, 'Better suit available', ocSuitPrefCost(strain, shape, oppBid.strain));

  let expl;
  if (len < minLen) expl = `${len} ${name}: need ${minLen}+ to overcall at the ${level}-level`;
  else if (hcp < minHcp) expl = `${hcp} HCP: need ${minHcp}+ for ${level}-level overcall`;
  else if (hcp > maxHcp) expl = `${hcp} HCP: too strong for simple overcall (consider double)`;
  else expl = `${hcp} HCP with ${len} ${name}: overcall ${level}${sym}`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Direct: 1NT Overcall ─────────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {boolean} balancing
 */
function scoreNTOvercall(bid, hand, eval_, oppBid, balancing) {
  const { hcp, shapeClass } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  const adj = balancing ? BALANCE_HCP_DISCOUNT : 0;
  const minHcp = NT_OC_MIN_HCP - adj;
  const maxHcp = NT_OC_MAX_HCP - adj;

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${minHcp}-${maxHcp}`, hcpDev(hcp, minHcp, maxHcp) * HCP_COST);
  pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));
  if (!hasStopper(hand, oppBid.strain)) {
    pen(p, `No stopper in opponent's ${STRAIN_DISPLAY[oppBid.strain]}`, STOPPER_COST);
  }

  if (level !== 1) {
    const perLevel = 5;
    pen(p, `Level ${level}NT overcall`, (level - 1) * perLevel);
  }

  let expl;
  if (shapeClass !== 'balanced') expl = 'Not balanced for NT overcall';
  else if (!hasStopper(hand, oppBid.strain)) expl = `No stopper in ${STRAIN_DISPLAY[oppBid.strain]}`;
  else if (level === 1 && hcpDev(hcp, minHcp, maxHcp) === 0) expl = `${hcp} HCP, balanced with stopper: 1NT overcall`;
  else expl = `${hcp} HCP: outside ${level}NT overcall range`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Direct: Jump Overcall (weak) ─────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {Auction} auction
 * @param {Seat} seat
 */
function scoreJumpOvercall(bid, hand, eval_, oppBid, auction, seat) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];
  const sym = STRAIN_SYMBOLS[strain];

  /** @type {PenaltyItem[]} */
  const p = [];

  if (strain === oppBid.strain) {
    pen(p, `Bidding opponent's ${name} suit`, OC_OPP_SUIT_COST);
    return scored(bid, deduct(penTotal(p)),
      `Cannot jump overcall in opponent's ${name}`, p);
  }

  const awkwardJumpContext =
    reopeningWithoutOwnBid(auction, seat) || isSandwichBetweenOpponents(auction, seat);
  if (awkwardJumpContext) {
    pen(p, 'Not textbook direct-seat weak jump (prior pass and/or sandwich)',
      JUMP_OC_AWKWARD_CONTEXT_COST);
  }

  pen(p, `${hcp} HCP, need ${JUMP_OC_MIN_HCP}-${JUMP_OC_MAX_HCP}`,
    hcpDev(hcp, JUMP_OC_MIN_HCP, JUMP_OC_MAX_HCP) * HCP_COST);
  pen(p, `${len} ${name}, need ${JUMP_OC_MIN_LEN}+`,
    Math.max(0, JUMP_OC_MIN_LEN - len) * LENGTH_SHORT_COST);
  if (len >= JUMP_OC_MIN_LEN && !hasOvercallQuality(hand, strain)) {
    pen(p, 'Poor suit quality', SUIT_QUALITY_COST);
  }

  let expl;
  if (len < JUMP_OC_MIN_LEN) expl = `${len} ${name}: need ${JUMP_OC_MIN_LEN}+ for jump overcall`;
  else if (hcpDev(hcp, JUMP_OC_MIN_HCP, JUMP_OC_MAX_HCP) === 0) {
    expl = awkwardJumpContext
      ? `${hcp} HCP with ${len} ${name}: preemptive ${level}${sym} (sandwich or after pass — not a standard weak jump over one opponent)`
      : `${hcp} HCP with ${len} ${name}: weak jump overcall ${level}${sym}`;
  } else expl = `${hcp} HCP: outside weak jump overcall range`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Direct: Takeout Double ───────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {boolean} balancing
 */
function scoreTakeoutDouble(bid, eval_, oppBid, balancing) {
  const { hcp, shape } = eval_;
  const adj = balancing ? BALANCE_HCP_DISCOUNT : 0;
  const levelExtra = Math.max(0, oppBid.level - 1) * DBL_LEVEL_HCP_STEP;
  const oppLen = suitLen(shape, oppBid.strain);
  const oppName = STRAIN_DISPLAY[oppBid.strain];

  // B-05: Ideal takeout shape (void/singleton in opp suit) lowers threshold
  const shapeAdj = oppLen === 0 ? IDEAL_TAKEOUT_VOID_BONUS : (oppLen === 1 ? 1 : 0);
  const minHcp = Math.max(10, DBL_MIN_HCP + levelExtra - adj - shapeAdj);

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${minHcp}+ for ${oppBid.level}-level double`,
    Math.max(0, minHcp - hcp) * HCP_COST);

  if (hcp < DBL_STRONG_MIN) {
    if (oppLen > DBL_SHORT_MAX) {
      pen(p, `${oppLen} ${oppName}: too long in opponent's suit`,
        (oppLen - DBL_SHORT_MAX) * DBL_SHORTNESS_COST);
    }
    const unbidShort = shortestUnbidSuit(shape, oppBid.strain);
    if (unbidShort < DBL_UNBID_MIN) {
      pen(p, `Only ${unbidShort} cards in an unbid suit`,
        (DBL_UNBID_MIN - unbidShort) * DBL_UNBID_COST);
    }
    if (oppBid.level >= 3) {
      pen(p, `${oppBid.level}-level double commits partner to high bid`,
        (oppBid.level - 2) * DBL_HIGH_LEVEL_RISK);
    }
  }

  let expl;
  if (hcp < minHcp) expl = `${hcp} HCP: need ${minHcp}+ for takeout double at the ${oppBid.level}-level`;
  else if (hcp >= DBL_STRONG_MIN) expl = `${hcp} HCP: strong takeout double (any shape)`;
  else if (oppLen > DBL_SHORT_MAX) expl = `${oppLen} ${oppName}: too long for classic takeout double`;
  else if (oppLen === 0) expl = `${hcp} HCP, void in ${oppName}: ideal takeout double`;
  else expl = `${hcp} HCP, short in ${oppName}: takeout double`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Direct: Penalty Double of NT ─────────────────────────────────────

/**
 * In SAYC, a double of 1NT (or 2NT) is penalty, showing at least as
 * many HCP as the opener (15+ for 1NT).
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {boolean} balancing
 */
function scorePenaltyDoubleOfNT(bid, eval_, oppBid, balancing) {
  const { hcp } = eval_;
  const adj = balancing ? BALANCE_HCP_DISCOUNT : 0;
  const minHcp = PENALTY_DBL_NT_MIN_HCP - adj;

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${minHcp}+ for penalty double`,
    Math.max(0, minHcp - hcp) * HCP_COST);

  let expl;
  if (hcp < minHcp) expl = `${hcp} HCP: need ${minHcp}+ for penalty double of ${oppBid.level}NT`;
  else expl = `${hcp} HCP: penalty double of ${oppBid.level}NT`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ═════════════════════════════════════════════════════════════════════
// ADVANCING PARTNER'S PENALTY DOUBLE OF NT
// ═════════════════════════════════════════════════════════════════════

/**
 * After partner's penalty double of 1NT and opponent escapes, advancer
 * is NOT forced to bid. Pass is the default action.
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {boolean} balancing
 * @param {Auction} auction
 * @returns {BidRecommendation[]}
 */
function scoreAdvancePenaltyDblCandidates(hand, eval_, oppBid, balancing, auction) {
  const last = lastContractBid(auction);
  const maxLevel = Math.min(7, (last ? last.level : 0) + 3);
  /** @type {Bid[]} */
  const bids = [pass()];
  const d = dbl();
  if (isLegalBid(auction, d)) bids.push(d);
  for (let level = 1; level <= maxLevel; level++) {
    for (const strain of STRAIN_ORDER) {
      const bid = contractBid(level, strain);
      if (!last || isHigher(bid, last)) bids.push(bid);
    }
  }

  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of bids) {
    results.push(scoreAdvPenDblBid(bid, hand, eval_, oppBid, balancing));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {boolean} balancing
 * @returns {BidRecommendation}
 */
function scoreAdvPenDblBid(bid, hand, eval_, oppBid, balancing) {
  if (bid.type === 'pass') return scoreAdvPenDblPass(bid, eval_, oppBid);
  if (bid.type === 'double') return scoreAdvPenDblDouble(bid, hand, eval_, oppBid);
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;
  if (strain === oppBid.strain) {
    return scored(bid, deduct(OC_OPP_SUIT_COST), 'Cannot bid opponent\'s suit', []);
  }
  if (strain === Strain.NOTRUMP) return scoreAdvPenDblNT(bid, hand, eval_, oppBid);
  return scoreAdvPenDblSuit(bid, eval_, oppBid, balancing);
}

/**
 * Pass after partner's penalty double — the default action.
 * After opponent escapes, consider competing with a suit.
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 */
function scoreAdvPenDblPass(bid, eval_, oppBid) {
  const { hcp, shape } = eval_;
  /** @type {PenaltyItem[]} */
  const p = [];
  if (hcp >= 10) {
    pen(p, `${hcp} HCP: enough to compete`, (hcp - 10) * 0.5);
  }

  if (oppBid.strain !== Strain.NOTRUMP) {
    const bestLen = longestNonOppSuit(shape, oppBid.strain);
    if (bestLen >= 5 && hcp >= 8) {
      pen(p, `${bestLen}-card suit with ${hcp} HCP: consider bidding after escape`,
        (bestLen - 4) * 1.5 + (hcp - 7) * 0.5);
    }
    const oppLen = suitLen(shape, oppBid.strain);
    if (oppLen >= 4 && hcp >= 8) {
      pen(p, `${oppLen} in opponent's escape suit: consider doubling`,
        (oppLen - 3) * 1 + (hcp - 7) * 0.3);
    }
  }

  const expl = penTotal(p) > 1
    ? `${hcp} HCP: consider competing after opponent's escape`
    : `${hcp} HCP: pass (partner's penalty double)`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/**
 * Penalty double of opponent's escape suit.
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 */
function scoreAdvPenDblDouble(bid, hand, eval_, oppBid) {
  const { hcp, shape } = eval_;
  const oppLen = suitLen(shape, oppBid.strain);
  const oppName = STRAIN_DISPLAY[oppBid.strain];
  /** @type {PenaltyItem[]} */
  const p = [];
  if (hcp < 8) pen(p, `${hcp} HCP: need 8+ to penalize`, (8 - hcp) * HCP_COST);
  if (oppLen < 4) pen(p, `Only ${oppLen} ${oppName}: need length to penalize`,
    (4 - oppLen) * LENGTH_SHORT_COST);
  if (!hasStopper(hand, oppBid.strain)) {
    pen(p, `Weak holding in ${oppName}`, 3);
  }

  let expl;
  if (oppLen >= 4 && hcp >= 8) expl = `${oppLen} ${oppName}, ${hcp} HCP: penalty double`;
  else expl = `Need length and strength in ${oppName} for penalty double`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/**
 * NT after partner's penalty double (with stopper in opponent's suit).
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 */
function scoreAdvPenDblNT(bid, hand, eval_, oppBid) {
  const { hcp, shapeClass } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  const minHcp = 8 + (level - 1) * 3;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
  if (!hasStopper(hand, oppBid.strain)) {
    pen(p, `No stopper in ${STRAIN_DISPLAY[oppBid.strain]}`, STOPPER_COST);
  }
  if (shapeClass !== 'balanced') {
    pen(p, `${shapeClass} (prefer balanced)`, shapePenalty(shapeClass));
  }
  const expl = hasStopper(hand, oppBid.strain) && hcp >= minHcp
    ? `${hcp} HCP with stopper: ${level}NT`
    : `${hcp} HCP: ${level}NT not ideal`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/**
 * Suit bid after partner's penalty double — competitive, not forced.
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {boolean} balancing
 */
function scoreAdvPenDblSuit(bid, eval_, oppBid, balancing) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];
  const sym = STRAIN_SYMBOLS[strain];
  const adj = balancing ? BALANCE_HCP_DISCOUNT : 0;
  // B-05: Partner penalty-doubled NT → they have 15+ HCP. At higher levels,
  // opponent escape implies more risk but combined values are known to be high.
  const baseHcp = level <= 1 ? 5 : level === 2 ? 7 : 8 + (level - 3) * 2;
  const minHcp = Math.max(3, baseHcp - adj);

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${len} ${name}, need 5+`, Math.max(0, 5 - len) * LENGTH_SHORT_COST);
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
  pen(p, 'Better suit available', advSuitPrefCost(strain, shape, oppBid.strain));

  if (level >= 3) {
    pen(p, `${level}-level bid carries risk`, (level - 2) * 1.5);
  }

  let expl;
  if (len < 5) expl = `${len} ${name}: need 5+ to bid`;
  else if (hcp < minHcp) expl = `${hcp} HCP: need ${minHcp}+ to compete at the ${level}-level`;
  else expl = `${hcp} HCP, ${len} ${name}: compete with ${level}${sym}`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ═════════════════════════════════════════════════════════════════════
// REBID AFTER OWN PREVIOUS DOUBLE
// ═════════════════════════════════════════════════════════════════════

/**
 * After this player doubled and partner bid, evaluate the rebid.
 * Partner's bid was likely an advance of our double; now opponents
 * may have bid and we need to decide whether to raise, pass, double, etc.
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} partnerBid
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {BidRecommendation[]}
 */
export function getPostDoubleBids(hand, eval_, partnerBid, auction, seat) {
  const oppBid = findOpponentBid(auction, seat);
  const last = lastContractBid(auction);
  const maxLevel = Math.min(7, (last ? last.level : 0) + 3);

  const oppSuits = opponentStrains(auction, seat);
  const partnerLast = findPartnerLastBid(auction, seat);
  const partnerCueBid = !!(partnerLast && partnerLast.strain !== Strain.NOTRUMP &&
    oppSuits.has(partnerLast.strain));

  /** @type {Bid[]} */
  const bids = [pass()];
  if (oppBid) {
    const d = dbl();
    if (isLegalBid(auction, d)) bids.push(d);
  }
  for (let level = 1; level <= maxLevel; level++) {
    for (const strain of STRAIN_ORDER) {
      const bid = contractBid(level, strain);
      if (!last || isHigher(bid, last)) bids.push(bid);
    }
  }

  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of bids) {
    results.push(scorePostDblBid(bid, hand, eval_, partnerBid, oppBid, partnerCueBid));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} partnerBid
 * @param {ContractBid | null} oppBid
 * @param {boolean} partnerCueBid
 * @returns {BidRecommendation}
 */
function scorePostDblBid(bid, hand, eval_, partnerBid, oppBid, partnerCueBid) {
  if (bid.type === 'pass') return scorePostDblPass(bid, eval_, partnerBid, partnerCueBid);
  if (bid.type === 'double' && oppBid) return scorePostDblPenalty(bid, hand, eval_, oppBid);
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;
  const ps = partnerBid.strain;

  if (oppBid && strain === oppBid.strain) {
    /** @type {PenaltyItem[]} */
    const p = [];
    pen(p, `Bidding opponent's ${STRAIN_DISPLAY[strain]}`, OC_OPP_SUIT_COST);
    if (level >= 4) pen(p, `Level ${level} in opponent's suit`, (level - 3) * 5);
    return scored(bid, deduct(penTotal(p)),
      `Cannot bid opponent's ${STRAIN_DISPLAY[strain]}`, p);
  }
  if (strain === ps) return scorePostDblRaise(bid, eval_, ps);
  if (strain === Strain.NOTRUMP) return scorePostDblNT(bid, hand, eval_, oppBid);
  return scorePostDblNewSuit(bid, eval_);
}

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} partnerBid
 * @param {boolean} partnerCueBid
 */
function scorePostDblPass(bid, eval_, partnerBid, partnerCueBid) {
  const { hcp, shape } = eval_;
  const support = suitLen(shape, partnerBid.strain);
  const name = STRAIN_DISPLAY[partnerBid.strain];
  /** @type {PenaltyItem[]} */
  const p = [];

  if (partnerCueBid) {
    pen(p, 'Partner cue-bid opponent\'s suit: forcing, must bid', 12);
    return scored(bid, deduct(penTotal(p)), 'Partner cue-bid: forcing, must bid', p);
  }

  if (hcp >= DBL_STRONG_MIN) {
    pen(p, `${hcp} HCP: too strong to pass`, (hcp - DBL_STRONG_MIN + 1) * HCP_COST);
  }
  if (support >= 4 && hcp >= 14) {
    pen(p, `${support} ${name} with ${hcp} HCP: consider raising`,
      3 + Math.min(3, support - 3));
  } else if (support >= 3 && hcp >= 16) {
    pen(p, `${support} ${name} with ${hcp} HCP: fit + extras`, 2);
  }

  for (const s of SHAPE_STRAINS) {
    if (s === partnerBid.strain) continue;
    const len = suitLen(shape, s);
    if (len >= 6) {
      const longPen = (len - 5) * 4;
      pen(p, `${len}-card ${STRAIN_DISPLAY[s]}: consider pulling to own suit`, longPen);
      if (support <= 1) {
        pen(p, `Only ${support} ${name}: poor fit, should pull`, 3);
      }
      break;
    }
  }

  let expl;
  if (hcp >= DBL_STRONG_MIN) expl = `${hcp} HCP: consider bidding`;
  else if (hcp < DBL_MIN_HCP) expl = `${hcp} HCP: minimum, pass`;
  else expl = `${hcp} HCP: pass (already shown hand with double)`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/**
 * Penalty double of opponent's bid after we already doubled.
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 */
function scorePostDblPenalty(bid, hand, eval_, oppBid) {
  const { hcp, shape } = eval_;
  const oppLen = suitLen(shape, oppBid.strain);
  const oppName = STRAIN_DISPLAY[oppBid.strain];
  /** @type {PenaltyItem[]} */
  const p = [];
  if (oppLen < 3) pen(p, `Only ${oppLen} ${oppName}`, (3 - oppLen) * LENGTH_SHORT_COST);
  if (!hasStopper(hand, oppBid.strain)) {
    pen(p, `Weak holding in ${oppName}`, 3);
  }
  if (hcp < POST_DBL_EXTRAS_MIN) {
    pen(p, `${hcp} HCP: need ${POST_DBL_EXTRAS_MIN}+ to double again`,
      (POST_DBL_EXTRAS_MIN - hcp) * HCP_COST);
  }
  if (oppBid.level >= 3) {
    pen(p, `${oppBid.level}-level double: risk if contract makes`,
      (oppBid.level - 2) * POST_DBL_LEVEL_RISK);
  }

  let expl;
  if (oppLen >= 3 && hasStopper(hand, oppBid.strain) && hcp >= POST_DBL_EXTRAS_MIN) {
    expl = `${oppLen} ${oppName} with extras: penalty double`;
  } else if (hcp < POST_DBL_EXTRAS_MIN) {
    expl = `${hcp} HCP: need extras (${POST_DBL_EXTRAS_MIN}+) to double again`;
  } else {
    expl = `Penalty double of ${oppBid.level}${STRAIN_SYMBOLS[oppBid.strain]}`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 */
function scorePostDblRaise(bid, eval_, ps) {
  const { hcp, shape } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  const support = suitLen(shape, ps);
  const name = STRAIN_DISPLAY[ps];
  const sym = STRAIN_SYMBOLS[ps];
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${support} ${name}, need 3+`, Math.max(0, 3 - support) * LENGTH_SHORT_COST);
  const minHcp = 12 + (level - 2) * 3;
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);

  let expl;
  if (support < 3) expl = `${support} ${name}: need 3+ to raise`;
  else if (hcp < minHcp) expl = `${hcp} HCP: need ${minHcp}+ to raise to ${level}${sym}`;
  else expl = `${hcp} HCP, ${support} ${name}: raise to ${level}${sym}`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid | null} oppBid
 */
function scorePostDblNT(bid, hand, eval_, oppBid) {
  const { hcp, shapeClass } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  const minHcp = 13 + (level - 2) * 3;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
  pen(p, `${shapeClass} (prefer balanced)`, shapePenalty(shapeClass));
  if (oppBid && !hasStopper(hand, oppBid.strain)) {
    pen(p, `No stopper in ${STRAIN_DISPLAY[oppBid.strain]}`, STOPPER_COST);
  }

  const stopOk = !oppBid || hasStopper(hand, oppBid.strain);
  const expl = (hcp >= minHcp && stopOk)
    ? `${hcp} HCP with stoppers: ${level}NT`
    : `${hcp} HCP: ${level}NT`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/** @param {Bid} bid @param {Evaluation} eval_ */
function scorePostDblNewSuit(bid, eval_) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];
  const sym = STRAIN_SYMBOLS[strain];
  const minHcp = 13 + (level - 2) * 3;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${len} ${name}, need 4+`, Math.max(0, 4 - len) * LENGTH_SHORT_COST);
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);

  const expl = (len >= 4 && hcp >= minHcp)
    ? `${hcp} HCP, ${len} ${name}: ${level}${sym}`
    : `Need 4+ ${name} and ${minHcp}+ HCP`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ═════════════════════════════════════════════════════════════════════
// ADVANCING PARTNER'S TAKEOUT DOUBLE
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {boolean} balancing
 * @param {Auction} auction
 * @returns {BidRecommendation[]}
 */
function scoreAdvanceDoubleCandidates(hand, eval_, oppBid, balancing, auction) {
  const candidates = advanceDoubleCandidates(auction, oppBid);
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(scoreAdvanceDoubleBid(bid, hand, eval_, oppBid, balancing));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

/**
 * @param {Auction} auction
 * @param {ContractBid} _oppBid
 * @returns {Bid[]}
 */
function advanceDoubleCandidates(auction, _oppBid) {
  const last = lastContractBid(auction);
  const maxLevel = Math.min(7, (last ? last.level : 0) + 3);
  /** @type {Bid[]} */
  const bids = [pass()];
  for (let level = 1; level <= maxLevel; level++) {
    for (const strain of STRAIN_ORDER) {
      const bid = contractBid(level, strain);
      if (!last || isHigher(bid, last)) bids.push(bid);
    }
  }
  return bids;
}

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {boolean} balancing
 * @returns {BidRecommendation}
 */
function scoreAdvanceDoubleBid(bid, hand, eval_, oppBid, balancing) {
  if (bid.type === 'pass') return scoreAdvDblPass(bid, hand, eval_, oppBid);
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;
  if (strain === oppBid.strain) return scoreAdvDblCuebid(bid, eval_);
  if (strain === Strain.NOTRUMP) return scoreAdvDblNT(bid, hand, eval_, oppBid);
  return scoreAdvDblSuit(bid, eval_, oppBid, balancing);
}

// ── Advance Double: Pass (convert to penalty -- rare) ────────────────

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 */
function scoreAdvDblPass(bid, hand, eval_, oppBid) {
  const { hcp, shape } = eval_;
  const oppLen = suitLen(shape, oppBid.strain);
  const oppName = STRAIN_DISPLAY[oppBid.strain];
  /** @type {PenaltyItem[]} */
  const p = [];

  if (oppLen < 5 || hcp < 8) {
    const highLevelAdj = Math.max(0, (oppBid.level - 2) * 3);
    pen(p, 'Partner expects you to bid', Math.max(2, ADV_PASS_COST - highLevelAdj));
  }

  if (oppLen < 5) {
    const bestNonOpp = longestNonOppSuit(shape, oppBid.strain);
    if (bestNonOpp >= 5) {
      pen(p, `${bestNonOpp}-card suit: should bid rather than sit`, (bestNonOpp - 4) * 1.5);
    }
  }

  let expl;
  if (oppLen >= 5 && hcp >= 8) {
    expl = `${oppLen} ${oppName} with ${hcp} HCP: convert to penalty`;
  } else {
    expl = 'Partner doubled for takeout: must bid';
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Advance Double: Suit bid ─────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {boolean} balancing
 */
function scoreAdvDblSuit(bid, eval_, oppBid, balancing) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];
  const sym = STRAIN_SYMBOLS[strain];
  const cheapestLevel = cheapestBidLevel(strain, oppBid);
  const isJump = level > cheapestLevel;
  const isDoubleJump = level > cheapestLevel + 1;

  // B-05: Partner's double at higher levels implies more HCP (12 + 2/level via
  // B-16), so combined values are known to be higher. Relax advance thresholds
  // by 1 per level above 1 that partner doubled.
  const partnerLevelAdj = Math.max(0, oppBid.level - 1);

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${len} ${name}, need ${ADV_SUIT_MIN}+`,
    Math.max(0, ADV_SUIT_MIN - len) * LENGTH_SHORT_COST);

  if (isDoubleJump) {
    const effGfMin = Math.max(8, ADV_GF_MIN - partnerLevelAdj);
    pen(p, `${hcp} HCP, need ${effGfMin}+`, Math.max(0, effGfMin - hcp) * HCP_COST);
  } else if (isJump) {
    const effInvMin = Math.max(6, ADV_INV_MIN - partnerLevelAdj);
    const effInvMax = ADV_INV_MAX;
    pen(p, `${hcp} HCP, need ${effInvMin}-${effInvMax}`,
      hcpDev(hcp, effInvMin, effInvMax) * HCP_COST);
  } else {
    const effMinMax = ADV_MIN_MAX + partnerLevelAdj;
    if (hcp > effMinMax) {
      pen(p, `${hcp} HCP: consider jumping (invitational)`, (hcp - effMinMax) * 0.5);
    }
  }

  pen(p, 'Better suit available', advSuitPrefCost(strain, shape, oppBid.strain));

  if (level >= 3) {
    pen(p, `${level}-level advance carries risk`, (level - 2) * 3);
  }

  let expl;
  if (len < ADV_SUIT_MIN) expl = `${len} ${name}: need ${ADV_SUIT_MIN}+ to bid`;
  else if (isDoubleJump) expl = `${hcp} HCP, ${len} ${name}: game-forcing ${level}${sym}`;
  else if (isJump) expl = `${hcp} HCP, ${len} ${name}: invitational jump to ${level}${sym}`;
  else expl = `${len} ${name}: ${level}${sym} (minimum advance)`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Advance Double: Cue bid opponent's suit (game forcing) ───────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 */
function scoreAdvDblCuebid(bid, eval_) {
  const { hcp } = eval_;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${ADV_GF_MIN}+`, Math.max(0, ADV_GF_MIN - hcp) * HCP_COST);

  const expl = hcp >= ADV_GF_MIN
    ? `${hcp} HCP: cue bid (game-forcing advance)`
    : `${hcp} HCP: need ${ADV_GF_MIN}+ for cue bid`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Advance Double: NT (with stopper) ────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 */
function scoreAdvDblNT(bid, hand, eval_, oppBid) {
  const { hcp, shapeClass } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  /** @type {PenaltyItem[]} */
  const p = [];

  let minHcp, maxHcp;
  if (level === 1) { minHcp = ADV_1NT_MIN; maxHcp = ADV_1NT_MAX; }
  else if (level === 2) { minHcp = ADV_2NT_MIN; maxHcp = ADV_2NT_MAX; }
  else { minHcp = ADV_3NT_MIN; maxHcp = 40; }

  pen(p, `${hcp} HCP, need ${minHcp}${maxHcp < 40 ? '-' + maxHcp : '+'}`,
    hcpDev(hcp, minHcp, maxHcp) * HCP_COST);
  if (!hasStopper(hand, oppBid.strain)) {
    pen(p, `No stopper in ${STRAIN_DISPLAY[oppBid.strain]}`, STOPPER_COST);
  }
  if (level >= 2) pen(p, `${shapeClass} (prefer balanced)`, shapePenalty(shapeClass));

  const stopperOk = hasStopper(hand, oppBid.strain);
  const hcpOk = hcpDev(hcp, minHcp, maxHcp) === 0;
  let expl;
  if (!stopperOk) expl = `No stopper in ${STRAIN_DISPLAY[oppBid.strain]} for ${level}NT`;
  else if (hcpOk) expl = `${hcp} HCP with stopper: ${level}NT advance`;
  else expl = `${hcp} HCP: outside ${level}NT range`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ═════════════════════════════════════════════════════════════════════
// ADVANCING PARTNER'S OVERCALL
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} partnerBid
 * @param {ContractBid} oppBid
 * @param {boolean} balancing
 * @param {Auction} auction
 * @returns {BidRecommendation[]}
 */
function scoreAdvanceOvercallCandidates(hand, eval_, partnerBid, oppBid, balancing, auction) {
  const candidates = advanceOvercallCandidates(auction);
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(scoreAdvOcBid(bid, hand, eval_, partnerBid, oppBid));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

/** @param {Auction} auction @returns {Bid[]} */
function advanceOvercallCandidates(auction) {
  const last = lastContractBid(auction);
  const maxLevel = Math.min(7, (last ? last.level : 0) + 3);
  /** @type {Bid[]} */
  const bids = [pass()];
  for (let level = 1; level <= maxLevel; level++) {
    for (const strain of STRAIN_ORDER) {
      const bid = contractBid(level, strain);
      if (!last || isHigher(bid, last)) bids.push(bid);
    }
  }
  return bids;
}

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} partnerBid
 * @param {ContractBid} oppBid
 * @returns {BidRecommendation}
 */
function scoreAdvOcBid(bid, hand, eval_, partnerBid, oppBid) {
  const ps = partnerBid.strain;
  if (bid.type === 'pass') return scoreAdvOcPass(bid, eval_, ps);
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (strain === oppBid.strain) return scoreAdvOcCuebid(bid, eval_, ps);
  if (strain === ps) return scoreAdvOcRaise(bid, eval_, ps);
  if (strain === Strain.NOTRUMP) return scoreAdvOcNT(bid, hand, eval_, oppBid);
  return scoreAdvOcNewSuit(bid, eval_);
}

// ── Advance Overcall: Pass ───────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 */
function scoreAdvOcPass(bid, eval_, ps) {
  const { hcp, shape } = eval_;
  const support = suitLen(shape, ps);
  /** @type {PenaltyItem[]} */
  const p = [];
  if (hcp > AOC_PASS_MAX) {
    pen(p, `${hcp} HCP: enough to act (${AOC_PASS_MAX + 1}+)`,
      (hcp - AOC_PASS_MAX) * HCP_COST);
  }
  if (support >= AOC_RAISE_SUPPORT && hcp >= AOC_RAISE_MIN) {
    pen(p, `${support} ${STRAIN_DISPLAY[ps]} support: consider raising`, AOC_SUPPORT_PASS_COST);
  }

  const expl = hcp <= AOC_PASS_MAX
    ? `${hcp} HCP: pass partner's overcall`
    : `${hcp} HCP: enough to support partner`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Advance Overcall: Raise partner's suit ───────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 */
function scoreAdvOcRaise(bid, eval_, ps) {
  const { hcp, shape } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  const support = suitLen(shape, ps);
  const name = STRAIN_DISPLAY[ps];
  const sym = STRAIN_SYMBOLS[ps];
  /** @type {PenaltyItem[]} */
  const p = [];

  pen(p, `${support} ${name}, need ${AOC_RAISE_SUPPORT}+`,
    Math.max(0, AOC_RAISE_SUPPORT - support) * LENGTH_SHORT_COST);

  if (level <= 3) {
    pen(p, `${hcp} HCP, need ${AOC_RAISE_MIN}-${AOC_RAISE_MAX}`,
      hcpDev(hcp, AOC_RAISE_MIN, AOC_RAISE_MAX) * HCP_COST);
  } else {
    const gameMin = AOC_CUEBID_MIN + 3;
    pen(p, `${hcp} HCP, need ${gameMin}+`, Math.max(0, gameMin - hcp) * HCP_COST);
  }

  let expl;
  if (support < AOC_RAISE_SUPPORT) expl = `${support} ${name}: need ${AOC_RAISE_SUPPORT}+ to raise`;
  else if (level <= 3) expl = `${support} ${name}, ${hcp} HCP: raise to ${level}${sym}`;
  else expl = `${support} ${name}, ${hcp} HCP: game raise ${level}${sym}`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Advance Overcall: Cue bid (limit raise+) ─────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 */
function scoreAdvOcCuebid(bid, eval_, ps) {
  const { hcp, shape } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  const support = suitLen(shape, ps);
  const name = STRAIN_DISPLAY[ps];
  /** @type {PenaltyItem[]} */
  const p = [];
  const minHcp = AOC_CUEBID_MIN + Math.max(0, level - 3) * 3;
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
  pen(p, `${support} ${name}, need ${AOC_CUEBID_SUPPORT}+`,
    Math.max(0, AOC_CUEBID_SUPPORT - support) * LENGTH_SHORT_COST);
  if (level >= 4) {
    pen(p, `Level ${level} cuebid: very high`, (level - 3) * AOC_CUEBID_LEVEL_COST);
  }

  const expl = (hcp >= minHcp && support >= AOC_CUEBID_SUPPORT)
    ? `${hcp} HCP, ${support} ${name}: cue bid (limit raise+)`
    : `Need ${minHcp}+ HCP and ${AOC_CUEBID_SUPPORT}+ support for cue bid`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Advance Overcall: NT ─────────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 */
function scoreAdvOcNT(bid, hand, eval_, oppBid) {
  const { hcp, shapeClass } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  /** @type {PenaltyItem[]} */
  const p = [];

  if (level === 1) {
    pen(p, `${hcp} HCP, need ${AOC_1NT_MIN}-${AOC_1NT_MAX}`,
      hcpDev(hcp, AOC_1NT_MIN, AOC_1NT_MAX) * HCP_COST);
  } else {
    const minHcp = AOC_1NT_MIN + (level - 1) * 3;
    pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
  }
  if (!hasStopper(hand, oppBid.strain)) {
    pen(p, `No stopper in ${STRAIN_DISPLAY[oppBid.strain]}`, STOPPER_COST);
  }
  pen(p, `${shapeClass} (prefer balanced)`, shapePenalty(shapeClass));

  const stopOk = hasStopper(hand, oppBid.strain);
  const expl = stopOk
    ? `${hcp} HCP with stopper: ${level}NT`
    : `No stopper in ${STRAIN_DISPLAY[oppBid.strain]} for ${level}NT`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Advance Overcall: New suit ───────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 */
function scoreAdvOcNewSuit(bid, eval_) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];
  const sym = STRAIN_SYMBOLS[strain];
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${AOC_NEW_SUIT_MIN}+`,
    Math.max(0, AOC_NEW_SUIT_MIN - hcp) * HCP_COST);
  pen(p, `${len} ${name}, need ${AOC_NEW_SUIT_LEN}+`,
    Math.max(0, AOC_NEW_SUIT_LEN - len) * LENGTH_SHORT_COST);

  if (level >= 3) {
    pen(p, `${level}-level new suit is risky`, (level - 2) * 2);
  }

  const expl = (hcp >= AOC_NEW_SUIT_MIN && len >= AOC_NEW_SUIT_LEN)
    ? `${hcp} HCP, ${len} ${name}: new suit ${level}${sym}`
    : `Need ${AOC_NEW_SUIT_MIN}+ HCP and ${AOC_NEW_SUIT_LEN}+ suit for new suit`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ═════════════════════════════════════════════════════════════════════
// NEGATIVE DOUBLES (partner opened, opponent overcalled)
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} partnerBid
 * @param {ContractBid} oppBid
 * @param {boolean} balancing
 * @param {Auction} auction
 * @returns {BidRecommendation[]}
 */
function scoreNegDblCandidates(hand, eval_, partnerBid, oppBid, balancing, auction) {
  const candidates = negDblCandidates(auction, oppBid);
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(scoreNegDblBid(bid, hand, eval_, partnerBid, oppBid));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

/**
 * @param {Auction} auction
 * @param {ContractBid} _oppBid
 * @returns {Bid[]}
 */
function negDblCandidates(auction, _oppBid) {
  const last = lastContractBid(auction);
  const maxLevel = Math.min(7, (last ? last.level : 0) + 3);
  /** @type {Bid[]} */
  const bids = [pass()];
  const d = dbl();
  if (isLegalBid(auction, d)) bids.push(d);
  for (let level = 1; level <= maxLevel; level++) {
    for (const strain of STRAIN_ORDER) {
      const bid = contractBid(level, strain);
      if (!last || isHigher(bid, last)) bids.push(bid);
    }
  }
  return bids;
}

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} partnerBid
 * @param {ContractBid} oppBid
 * @returns {BidRecommendation}
 */
function scoreNegDblBid(bid, hand, eval_, partnerBid, oppBid) {
  if (bid.type === 'pass') return scoreNegDblPass(bid, eval_, partnerBid, oppBid);
  if (bid.type === 'double') return scoreNegativeDouble(bid, eval_, partnerBid, oppBid);
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;
  const ps = partnerBid.strain;
  if (strain === ps) return scoreNegDblRaise(bid, eval_, ps);
  if (strain === Strain.NOTRUMP) return scoreNegDblNT(bid, hand, eval_, oppBid);
  return scoreNegDblNewSuit(bid, eval_, oppBid);
}

// ── Negative Double: Pass ────────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} partnerBid
 * @param {ContractBid} oppBid
 */
function scoreNegDblPass(bid, eval_, partnerBid, oppBid) {
  const { hcp, shape } = eval_;
  const unbidMajors = getUnbidMajors(partnerBid.strain, oppBid.strain);
  const hasMajor = unbidMajors.some(s => suitLen(shape, s) >= NEG_DBL_MAJOR_MIN);
  const minResp = 6;
  /** @type {PenaltyItem[]} */
  const p = [];
  if (hcp >= minResp) {
    pen(p, `${hcp} HCP: enough to act (${minResp}+)`, (hcp - minResp + 1) * OC_PASS_HCP_COST);
  }

  let expl;
  if (hcp < minResp) expl = `${hcp} HCP: too weak to act over interference`;
  else if (hasMajor) expl = `${hcp} HCP with unbid major: consider negative double`;
  else expl = `${hcp} HCP: consider acting over interference`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Negative Double: The double itself ───────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} partnerBid
 * @param {ContractBid} oppBid
 */
function scoreNegativeDouble(bid, eval_, partnerBid, oppBid) {
  const { hcp, shape } = eval_;
  const unbidMajors = getUnbidMajors(partnerBid.strain, oppBid.strain);
  const bestMajorLen = unbidMajors.reduce((max, s) => Math.max(max, suitLen(shape, s)), 0);

  const baseMinHcp = oppBid.level === 1 ? NEG_DBL_1_MIN
    : oppBid.level === 2 ? NEG_DBL_2_MIN : NEG_DBL_3_MIN;

  // B-05: Distributional hands (void somewhere) can shade the negative
  // double threshold by 1 HCP — the extra playing strength compensates.
  const hasVoid = shape.some(len => len === 0);
  const distAdj = hasVoid ? 1 : 0;
  const minHcp = Math.max(5, baseMinHcp - distAdj);

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
  if (unbidMajors.length === 0) {
    pen(p, 'No unbid major to show', NEG_DBL_NO_MAJOR_COST);
  } else if (bestMajorLen < NEG_DBL_MAJOR_MIN) {
    pen(p, `Best unbid major is ${bestMajorLen} cards, need ${NEG_DBL_MAJOR_MIN}+`,
      (NEG_DBL_MAJOR_MIN - bestMajorLen) * LENGTH_SHORT_COST);
  }

  let expl;
  if (unbidMajors.length === 0) expl = 'No unbid major for negative double';
  else if (bestMajorLen < NEG_DBL_MAJOR_MIN) expl = `Only ${bestMajorLen}-card unbid major: need ${NEG_DBL_MAJOR_MIN}+`;
  else if (hcp < minHcp) expl = `${hcp} HCP: need ${minHcp}+ for negative double at this level`;
  else {
    const names = unbidMajors.filter(s => suitLen(shape, s) >= NEG_DBL_MAJOR_MIN)
      .map(s => STRAIN_DISPLAY[s]).join('/');
    expl = `${hcp} HCP, ${bestMajorLen}+ ${names}: negative double`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Negative Double context: Raise partner ───────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 */
function scoreNegDblRaise(bid, eval_, ps) {
  const { hcp, shape } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  const support = suitLen(shape, ps);
  const name = STRAIN_DISPLAY[ps];
  const sym = STRAIN_SYMBOLS[ps];
  const minSupport = 3;
  const minHcp = 6 + (level - 2) * 3;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${support} ${name}, need ${minSupport}+`,
    Math.max(0, minSupport - support) * LENGTH_SHORT_COST);
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);

  const expl = (support >= minSupport && hcp >= minHcp)
    ? `${support} ${name}, ${hcp} HCP: raise to ${level}${sym}`
    : `Need ${minSupport}+ support and ${minHcp}+ HCP`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Negative Double context: NT ──────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 */
function scoreNegDblNT(bid, hand, eval_, oppBid) {
  const { hcp, shapeClass } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  const minHcp = 8 + (level - 1) * 3;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
  if (!hasStopper(hand, oppBid.strain)) {
    pen(p, `No stopper in ${STRAIN_DISPLAY[oppBid.strain]}`, STOPPER_COST);
  }
  pen(p, `${shapeClass} (prefer balanced)`, shapePenalty(shapeClass));

  const expl = hasStopper(hand, oppBid.strain)
    ? `${hcp} HCP with stopper: ${level}NT`
    : `No stopper in ${STRAIN_DISPLAY[oppBid.strain]}`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Negative Double context: New suit ────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 */
function scoreNegDblNewSuit(bid, eval_, oppBid) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];
  const sym = STRAIN_SYMBOLS[strain];
  const minLen = 4;
  const minHcp = level <= 1 ? 6 : level === 2 ? 10 : 10 + (level - 2) * 2;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${len} ${name}, need ${minLen}+`, Math.max(0, minLen - len) * LENGTH_SHORT_COST);
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);

  if (strain === oppBid.strain) {
    pen(p, 'Bidding opponent\'s suit', ADV_CUEBID_COST);
  }

  if (level >= 3) {
    pen(p, `${level}-level new suit over interference`, (level - 2) * 2);
  }

  const expl = (len >= minLen && hcp >= minHcp)
    ? `${hcp} HCP, ${len} ${name}: ${level}${sym} over interference`
    : `Need ${minLen}+ ${name} and ${minHcp}+ HCP`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ═════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════

/** @param {number[]} shape @param {import('../model/bid.js').Strain} strain */
function suitLen(shape, strain) {
  return shape[SHAPE_STRAINS.indexOf(strain)];
}

/** @param {import('../model/bid.js').Strain} strain */
function isMajor(strain) {
  return strain === Strain.SPADES || strain === Strain.HEARTS;
}

/** @param {ContractBid} a @param {ContractBid} b */
function isHigher(a, b) {
  if (a.level !== b.level) return a.level > b.level;
  return STRAIN_ORDER.indexOf(a.strain) > STRAIN_ORDER.indexOf(b.strain);
}

function hcpDev(hcp, min, max) {
  if (hcp < min) return min - hcp;
  if (hcp > max) return hcp - max;
  return 0;
}

function shapePenalty(sc) {
  if (sc === 'semi-balanced') return SHAPE_SEMI_COST;
  if (sc === 'unbalanced') return SHAPE_UNBAL_COST;
  return 0;
}

function deduct(penalty) {
  return Math.round((MAX_SCORE - penalty) * 10) / 10;
}

/**
 * @param {Bid} bid
 * @param {number} priority
 * @param {string} explanation
 * @param {PenaltyItem[]} [penalties]
 * @returns {BidRecommendation}
 */
function scored(bid, priority, explanation, penalties) {
  return { bid, priority, explanation, penalties: penalties || [] };
}

/**
 * Check if the suit has at least 2 of the top 5 honors (A, K, Q, J, 10).
 * @param {Hand} hand
 * @param {import('../model/bid.js').Strain} strain
 * @returns {boolean}
 */
function hasOvercallQuality(hand, strain) {
  const suitCards = hand.cards.filter(c => c.suit === /** @type {any} */ (strain));
  let honors = 0;
  for (const card of suitCards) {
    if (card.rank >= Rank.TEN) honors++;
  }
  return honors >= OC_HONOR_MIN;
}

/**
 * Count top-5 honors (A, K, Q, J, 10) in the given suit.
 * @param {Hand} hand
 * @param {import('../model/bid.js').Strain} strain
 * @returns {number}
 */
function suitHonorCount(hand, strain) {
  let count = 0;
  for (const card of hand.cards) {
    if (card.suit === /** @type {any} */ (strain) && card.rank >= Rank.TEN) count++;
  }
  return count;
}

/**
 * B-05: Contextual HCP adjustment for overcalls based on suit quality and
 * extra length. Good suits with extra length lower the effective HCP
 * requirement; poor short suits raise it.
 * @param {Hand} hand
 * @param {import('../model/bid.js').Strain} strain
 * @param {number} len  suit length
 * @returns {number} negative = lower threshold (easier to bid), positive = raise it
 */
function overcallContextAdj(hand, strain, len) {
  let adj = 0;
  const honors = suitHonorCount(hand, strain);
  if (honors >= SUIT_QUALITY_EXCELLENT) adj -= 1;
  else if (honors <= 1 && len <= 5) adj += SUIT_QUALITY_POOR_EXTRA;
  if (len >= 7) adj -= LONG_SUIT_7_DISCOUNT;
  else if (len >= 6) adj -= LONG_SUIT_6_DISCOUNT;
  return adj;
}

/**
 * Check if hand has a stopper in the given suit.
 * A, Kx, Qxx, or Jxxx counts as a stopper.
 * @param {Hand} hand
 * @param {import('../model/bid.js').Strain} strain
 * @returns {boolean}
 */
function hasStopper(hand, strain) {
  const suitCards = hand.cards.filter(c => c.suit === /** @type {any} */ (strain));
  const len = suitCards.length;
  if (len === 0) return false;
  const highRank = suitCards.reduce((max, c) => Math.max(max, c.rank), 0);
  if (highRank === Rank.ACE) return true;
  if (highRank === Rank.KING && len >= 2) return true;
  if (highRank === Rank.QUEEN && len >= 3) return true;
  if (highRank === Rank.JACK && len >= 4) return true;
  return false;
}

/**
 * Check if shape supports a takeout double (short in opp suit, 3+ in unbids).
 * @param {number[]} shape
 * @param {import('../model/bid.js').Strain} oppStrain
 * @returns {boolean}
 */
function hasTakeoutShape(shape, oppStrain) {
  const oppLen = suitLen(shape, oppStrain);
  if (oppLen > DBL_SHORT_MAX) return false;
  for (const s of SHAPE_STRAINS) {
    if (s === oppStrain) continue;
    if (suitLen(shape, s) < DBL_UNBID_MIN) return false;
  }
  return true;
}

/**
 * Length of longest suit excluding opponent's suit.
 * @param {number[]} shape
 * @param {import('../model/bid.js').Strain} oppStrain
 * @returns {number}
 */
function longestNonOppSuit(shape, oppStrain) {
  let max = 0;
  for (const s of SHAPE_STRAINS) {
    if (s === oppStrain) continue;
    max = Math.max(max, suitLen(shape, s));
  }
  return max;
}

/**
 * Best suit (longest, prefer higher-ranking) excluding opponent's suit.
 * @param {number[]} shape
 * @param {import('../model/bid.js').Strain} oppStrain
 * @returns {import('../model/bid.js').Strain}
 */
function bestSuitExcluding(shape, oppStrain) {
  let best = Strain.CLUBS;
  let bestLen = 0;
  for (const s of SHAPE_STRAINS) {
    if (s === oppStrain) continue;
    const len = suitLen(shape, s);
    if (len > bestLen || (len === bestLen && STRAIN_ORDER.indexOf(s) > STRAIN_ORDER.indexOf(best))) {
      best = s;
      bestLen = len;
    }
  }
  return best;
}

/**
 * Shortest unbid suit length (excluding opponent's suit).
 * @param {number[]} shape
 * @param {import('../model/bid.js').Strain} oppStrain
 * @returns {number}
 */
function shortestUnbidSuit(shape, oppStrain) {
  let min = 14;
  for (const s of SHAPE_STRAINS) {
    if (s === oppStrain) continue;
    min = Math.min(min, suitLen(shape, s));
  }
  return min;
}

/**
 * Penalty for overcalling in a suit that isn't the longest available.
 * @param {import('../model/bid.js').Strain} strain
 * @param {number[]} shape
 * @param {import('../model/bid.js').Strain} oppStrain
 * @returns {number}
 */
function ocSuitPrefCost(strain, shape, oppStrain) {
  const best = bestSuitExcluding(shape, oppStrain);
  if (strain === best) return 0;
  const diff = suitLen(shape, best) - suitLen(shape, strain);
  return diff > 0 ? diff * SUIT_PREF_COST : 0;
}

/**
 * Penalty for advancing with a non-optimal suit.
 * @param {import('../model/bid.js').Strain} strain
 * @param {number[]} shape
 * @param {import('../model/bid.js').Strain} oppStrain
 * @returns {number}
 */
function advSuitPrefCost(strain, shape, oppStrain) {
  let bestLen = 0;
  let bestStrain = strain;
  for (const s of SHAPE_STRAINS) {
    if (s === oppStrain) continue;
    const len = suitLen(shape, s);
    if (len > bestLen || (len === bestLen && isMajor(s) && !isMajor(bestStrain))) {
      bestLen = len;
      bestStrain = s;
    }
  }
  if (strain === bestStrain) return 0;
  const diff = bestLen - suitLen(shape, strain);
  if (diff > 0 && suitLen(shape, strain) < ADV_SUIT_MIN) return diff * SUIT_PREF_COST;
  if (diff > 0) return diff * 0.5;
  return 0;
}

/**
 * Return HCP range, minimum suit length, and length-short penalty
 * multiplier for a suit overcall at the given level.
 * @param {number} level
 * @param {number} adj  Balancing discount (0 or BALANCE_HCP_DISCOUNT)
 * @returns {{ minHcp: number, maxHcp: number, minLen: number, lenShortMult: number }}
 */
function overcallReqs(level, adj) {
  if (level === 1) {
    return { minHcp: OC_1_MIN_HCP - adj, maxHcp: OC_1_MAX_HCP, minLen: OC_MIN_LEN, lenShortMult: LENGTH_SHORT_COST };
  }
  if (level === 2) {
    return { minHcp: OC_2_MIN_HCP - adj, maxHcp: OC_2_MAX_HCP, minLen: OC_MIN_LEN, lenShortMult: LENGTH_SHORT_COST };
  }
  if (level === 3) {
    return { minHcp: OC_3_MIN_HCP - adj, maxHcp: OC_2_MAX_HCP, minLen: OC_3_MIN_LEN, lenShortMult: LENGTH_SHORT_COST + 1 };
  }
  if (level === 4) {
    return { minHcp: OC_4_MIN_HCP - adj, maxHcp: 18, minLen: OC_4_MIN_LEN, lenShortMult: LENGTH_SHORT_COST + 2 };
  }
  // 5-level and above
  return { minHcp: OC_5_MIN_HCP - adj, maxHcp: 20, minLen: OC_5_MIN_LEN, lenShortMult: LENGTH_SHORT_COST + 3 };
}

/**
 * Is this a jump overcall (bidding 1+ levels higher than necessary)?
 * @param {number} level
 * @param {import('../model/bid.js').Strain} strain
 * @param {ContractBid} oppBid
 * @returns {boolean}
 */
function isJumpOvercall(level, strain, oppBid) {
  const cheapest = cheapestBidLevel(strain, oppBid);
  return level > cheapest;
}

/**
 * The cheapest level at which a given strain can be bid over the opponent's bid.
 * @param {import('../model/bid.js').Strain} strain
 * @param {ContractBid} oppBid
 * @returns {number}
 */
function cheapestBidLevel(strain, oppBid) {
  if (STRAIN_ORDER.indexOf(strain) > STRAIN_ORDER.indexOf(oppBid.strain)) {
    return oppBid.level;
  }
  return oppBid.level + 1;
}

/**
 * Get unbid majors (not bid by partner or opponent).
 * @param {import('../model/bid.js').Strain} partnerStrain
 * @param {import('../model/bid.js').Strain} oppStrain
 * @returns {import('../model/bid.js').Strain[]}
 */
function getUnbidMajors(partnerStrain, oppStrain) {
  /** @type {import('../model/bid.js').Strain[]} */
  const result = [];
  if (Strain.SPADES !== partnerStrain && Strain.SPADES !== oppStrain) result.push(Strain.SPADES);
  if (Strain.HEARTS !== partnerStrain && Strain.HEARTS !== oppStrain) result.push(Strain.HEARTS);
  return result;
}

/**
 * Check whether partner was the first to open (vs having overcalled).
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {boolean}
 */
function isPartnerOpener(auction, seat) {
  const partner = PARTNER_SEAT[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  for (let i = 0; i < auction.bids.length; i++) {
    if (auction.bids[i].type === 'contract') {
      const bidSeat = SEATS[(dealerIdx + i) % SEATS.length];
      return bidSeat === partner;
    }
  }
  return false;
}

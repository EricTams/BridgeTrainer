import { contractBid, pass, Strain, STRAIN_ORDER, STRAIN_SYMBOLS } from '../model/bid.js';
import { pen, penTotal } from './penalty.js';

/**
 * @typedef {import('../model/hand.js').Hand} Hand
 * @typedef {import('./evaluate.js').Evaluation} Evaluation
 * @typedef {import('./opening.js').BidRecommendation} BidRecommendation
 * @typedef {import('../model/bid.js').ContractBid} ContractBid
 * @typedef {import('./penalty.js').PenaltyItem} PenaltyItem
 */

// ── Scoring costs ────────────────────────────────────────────────────

const MAX_SCORE = 10;

const HCP_COST = 2;
const LENGTH_SHORT_COST = 3;
const PASS_HCP_COST = 2.5;
const LONG_SUIT_PASS_COST = 1.5;
const SUIT_PREF_COST = 1.5;
const MAJOR_FIT_PREF_COST = 2;
const SUIT_AVAIL_1NT_COST = 2;
const FIT_AVAIL_1NT_COST = 1.5;
const SHAPE_SEMI_COST = 4;
const SHAPE_UNBAL_COST = 8;
const MAJOR_FIT_2NT_COST = 3;

// ── SAYC thresholds ─────────────────────────────────────────────────

const RESP_MIN_HCP = 6;
const NEW_SUIT_2_MIN_HCP = 10;
const NEW_SUIT_MIN_LEN = 4;
const SINGLE_RAISE_MIN = 6;
const SINGLE_RAISE_MAX = 10;
const RAISE_MIN_SUPPORT = 3;
const LIMIT_RAISE_MIN = 10;
const LIMIT_RAISE_MAX = 12;
const LIMIT_RAISE_SUPPORT = 4;
const RESP_1NT_MIN = 6;
const RESP_1NT_MAX = 10;
const RESP_2NT_MIN = 13;
const RESP_2NT_MAX = 15;
const JUMP_SHIFT_MIN = 19;
const JUMP_SHIFT_MIN_LEN = 5;
const LONG_SUIT_THRESHOLD = 6;
const RESP_LONG_SUIT_DISCOUNT = 2;

// ── 1NT Response thresholds ─────────────────────────────────────────

const NT_RESP_PASS_MAX = 7;
const STAYMAN_MIN_HCP = 8;
const STAYMAN_MAJOR_LEN = 4;
const NT_TRANSFER_MIN_LEN = 5;
const INVITE_2NT_MIN_HCP = 8;
const INVITE_2NT_MAX_HCP = 9;
const GAME_3NT_MIN_HCP = 10;
const GAME_3NT_MAX_HCP = 15;
const QUANT_4NT_MIN_HCP = 16;
const QUANT_4NT_MAX_HCP = 17;

const NO_MAJOR_STAYMAN_COST = 10;
const PREFER_TRANSFER_COST = 2;
const LONG_MAJOR_PASS_COST = 2;
const MAJOR_AVAIL_NT_COST = 2;
const FIVE_MAJOR_NT_COST = 3;
const TRANSFER_SUIT_PREF_COST = 1.5;

// ── Display ──────────────────────────────────────────────────────────

/** Shape array index to strain: [0]=S, [1]=H, [2]=D, [3]=C */
const SHAPE_STRAINS = [Strain.SPADES, Strain.HEARTS, Strain.DIAMONDS, Strain.CLUBS];

/** @type {Readonly<Record<import('../model/bid.js').Strain, string>>} */
const STRAIN_DISPLAY = {
  [Strain.CLUBS]: 'clubs',
  [Strain.DIAMONDS]: 'diamonds',
  [Strain.HEARTS]: 'hearts',
  [Strain.SPADES]: 'spades',
  [Strain.NOTRUMP]: 'notrump',
};

// ── Main ─────────────────────────────────────────────────────────────

/**
 * Score every plausible responding bid when partner opened 1 of a suit.
 * Returns all scored bids sorted best-first (scores may be negative).
 * @param {Hand} _hand
 * @param {Evaluation} evaluation
 * @param {ContractBid} partnerBid
 * @returns {BidRecommendation[]}
 */
export function getRespondingBids(_hand, evaluation, partnerBid) {
  if (partnerBid.level !== 1) return [];
  if (partnerBid.strain === Strain.NOTRUMP) return get1NTResponseBids(evaluation);

  const ps = partnerBid.strain;
  const candidates = respondingCandidates(ps);
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(scoreResponseBid(bid, evaluation, ps));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

// ── Candidate generation ─────────────────────────────────────────────

/** All contract bids (levels 1-7) plus Pass, filtered for legality. */
function respondingCandidates(ps) {
  /** @type {import('../model/bid.js').Bid[]} */
  const bids = [pass()];
  for (let level = 1; level <= 7; level++) {
    for (const strain of STRAIN_ORDER) {
      if (level === 1 && strain !== Strain.NOTRUMP && !ranksAbove(strain, ps)) continue;
      bids.push(contractBid(level, strain));
    }
  }
  return bids;
}

// ── Dispatcher ───────────────────────────────────────────────────────

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps - partner's strain
 * @returns {BidRecommendation}
 */
function scoreResponseBid(bid, eval_, ps) {
  if (bid.type === 'pass') return scorePass(bid, eval_);
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;
  if (level === 1 && strain === Strain.NOTRUMP) return scoreResp1NT(bid, eval_, ps);
  if (level === 1) return scoreNewSuit1(bid, eval_, ps);
  if (level === 2 && strain === Strain.NOTRUMP) return scoreResp2NT(bid, eval_, ps);
  if (level === 2 && strain === ps) return scoreSingleRaise(bid, eval_, ps);
  if (level === 2 && ranksAbove(strain, ps)) return scoreJumpShift(bid, eval_);
  if (level === 2) return scoreNewSuit2(bid, eval_, ps);
  if (level === 3 && strain === ps) return scoreLimitRaise(bid, eval_, ps);
  return scoreGenericResponse(bid, eval_, ps);
}

// ── Pass ─────────────────────────────────────────────────────────────

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ */
function scorePass(bid, eval_) {
  const { hcp, shape } = eval_;
  /** @type {PenaltyItem[]} */
  const p = [];
  if (hcp >= RESP_MIN_HCP) {
    pen(p, `${hcp} HCP, enough to respond (${RESP_MIN_HCP}+)`, (hcp - RESP_MIN_HCP + 1) * PASS_HCP_COST);
  }
  const maxLen = Math.max(...shape);
  if (maxLen >= LONG_SUIT_THRESHOLD) {
    pen(p, `${maxLen}-card suit worth bidding`, (maxLen - LONG_SUIT_THRESHOLD + 1) * LONG_SUIT_PASS_COST);
  }
  let expl;
  if (maxLen >= LONG_SUIT_THRESHOLD && hcp < RESP_MIN_HCP) {
    expl = `${hcp} HCP but ${maxLen}-card suit: consider bidding`;
  } else if (hcp < RESP_MIN_HCP) {
    expl = `${hcp} HCP: correct to pass`;
  } else {
    expl = `${hcp} HCP: enough to respond (${RESP_MIN_HCP}+ needed)`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── New suit at 1-level (6+ HCP, 4+ cards) ──────────────────────────

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 */
function scoreNewSuit1(bid, eval_, ps) {
  const { hcp, shape } = eval_;
  const strain = /** @type {import('../model/bid.js').ContractBid} */ (bid).strain;
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];
  const hcpMin = adjustedRespMin(len);

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${hcpMin}+`, Math.max(0, hcpMin - hcp) * HCP_COST);
  pen(p, `${len} ${name}, need ${NEW_SUIT_MIN_LEN}+`, Math.max(0, NEW_SUIT_MIN_LEN - len) * LENGTH_SHORT_COST);
  pen(p, 'Better suit available', suitPrefCost(strain, shape, ps));
  pen(p, 'Major raise available', majorRaiseAvailCost(ps, shape, hcp));

  return scored(bid, deduct(penTotal(p)), newSuit1Expl(hcp, len, strain, hcpMin), p);
}

/** @param {number} hcp @param {number} len @param {import('../model/bid.js').Strain} strain @param {number} hcpMin */
function newSuit1Expl(hcp, len, strain, hcpMin) {
  const sym = STRAIN_SYMBOLS[strain];
  const name = STRAIN_DISPLAY[strain];
  if (len < NEW_SUIT_MIN_LEN) return `${len} ${name}: need ${NEW_SUIT_MIN_LEN}+ for 1${sym}`;
  if (hcp < hcpMin) return `${hcp} HCP: not enough to respond (need ${hcpMin}+)`;
  if (hcpMin < RESP_MIN_HCP) return `${len} ${name} compensates for ${hcp} HCP: bid 1${sym}`;
  return `${hcp} HCP with ${len} ${name}: bid 1${sym}`;
}

// ── New suit at 2-level (10+ HCP, 4+ cards, forcing 1 round) ────────

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 */
function scoreNewSuit2(bid, eval_, ps) {
  const { hcp, shape } = eval_;
  const strain = /** @type {import('../model/bid.js').ContractBid} */ (bid).strain;
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${NEW_SUIT_2_MIN_HCP}+`, Math.max(0, NEW_SUIT_2_MIN_HCP - hcp) * HCP_COST);
  pen(p, `${len} ${name}, need ${NEW_SUIT_MIN_LEN}+`, Math.max(0, NEW_SUIT_MIN_LEN - len) * LENGTH_SHORT_COST);
  pen(p, 'Better suit available', suitPrefCost(strain, shape, ps));
  pen(p, 'Major raise available', majorRaiseAvailCost(ps, shape, hcp));

  return scored(bid, deduct(penTotal(p)), newSuit2Expl(hcp, len, strain), p);
}

/** @param {number} hcp @param {number} len @param {import('../model/bid.js').Strain} strain */
function newSuit2Expl(hcp, len, strain) {
  const sym = STRAIN_SYMBOLS[strain];
  const name = STRAIN_DISPLAY[strain];
  if (len < NEW_SUIT_MIN_LEN) return `${len} ${name}: need ${NEW_SUIT_MIN_LEN}+ for 2${sym}`;
  if (hcp < NEW_SUIT_2_MIN_HCP) return `${hcp} HCP: need ${NEW_SUIT_2_MIN_HCP}+ for 2-level new suit`;
  return `${hcp} HCP with ${len} ${name}: 2${sym} (forcing one round)`;
}

// ── Single raise (6-10 HCP, 3+ support) ─────────────────────────────

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 */
function scoreSingleRaise(bid, eval_, ps) {
  const { hcp, shape } = eval_;
  const support = suitLen(shape, ps);
  const name = STRAIN_DISPLAY[ps];

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${SINGLE_RAISE_MIN}-${SINGLE_RAISE_MAX}`, hcpDev(hcp, SINGLE_RAISE_MIN, SINGLE_RAISE_MAX) * HCP_COST);
  pen(p, `${support} ${name}, need ${RAISE_MIN_SUPPORT}+`, Math.max(0, RAISE_MIN_SUPPORT - support) * LENGTH_SHORT_COST);

  return scored(bid, deduct(penTotal(p)), singleRaiseExpl(hcp, support, ps), p);
}

/** @param {number} hcp @param {number} support @param {import('../model/bid.js').Strain} ps */
function singleRaiseExpl(hcp, support, ps) {
  const sym = STRAIN_SYMBOLS[ps];
  const name = STRAIN_DISPLAY[ps];
  if (support < RAISE_MIN_SUPPORT) return `${support} ${name}: need ${RAISE_MIN_SUPPORT}+ to raise`;
  if (hcp < SINGLE_RAISE_MIN) return `${hcp} HCP: too weak to raise (${SINGLE_RAISE_MIN}+)`;
  if (hcp > SINGLE_RAISE_MAX) return `${hcp} HCP: too strong for single raise (${SINGLE_RAISE_MIN}-${SINGLE_RAISE_MAX})`;
  return `${hcp} HCP with ${support} ${name}: raise to 2${sym}`;
}

// ── Limit raise (10-12 HCP, 4+ support) ─────────────────────────────

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 */
function scoreLimitRaise(bid, eval_, ps) {
  const { hcp, shape } = eval_;
  const support = suitLen(shape, ps);
  const name = STRAIN_DISPLAY[ps];

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${LIMIT_RAISE_MIN}-${LIMIT_RAISE_MAX}`, hcpDev(hcp, LIMIT_RAISE_MIN, LIMIT_RAISE_MAX) * HCP_COST);
  pen(p, `${support} ${name}, need ${LIMIT_RAISE_SUPPORT}+`, Math.max(0, LIMIT_RAISE_SUPPORT - support) * LENGTH_SHORT_COST);

  return scored(bid, deduct(penTotal(p)), limitRaiseExpl(hcp, support, ps), p);
}

/** @param {number} hcp @param {number} support @param {import('../model/bid.js').Strain} ps */
function limitRaiseExpl(hcp, support, ps) {
  const sym = STRAIN_SYMBOLS[ps];
  const name = STRAIN_DISPLAY[ps];
  if (support < LIMIT_RAISE_SUPPORT) return `${support} ${name}: need ${LIMIT_RAISE_SUPPORT}+ for limit raise`;
  if (hcp < LIMIT_RAISE_MIN) return `${hcp} HCP: too weak for limit raise (${LIMIT_RAISE_MIN}+)`;
  if (hcp > LIMIT_RAISE_MAX) return `${hcp} HCP: too strong for limit raise (${LIMIT_RAISE_MIN}-${LIMIT_RAISE_MAX})`;
  return `${hcp} HCP with ${support} ${name}: limit raise to 3${sym}`;
}

// ── 1NT response (6-10 HCP, no fit, no new suit at 1) ───────────────

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 */
function scoreResp1NT(bid, eval_, ps) {
  const { hcp, shape } = eval_;

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${RESP_1NT_MIN}-${RESP_1NT_MAX}`, hcpDev(hcp, RESP_1NT_MIN, RESP_1NT_MAX) * HCP_COST);
  if (hasSuitAt1(shape, ps)) pen(p, 'Suit available at 1-level', SUIT_AVAIL_1NT_COST);
  if (suitLen(shape, ps) >= RAISE_MIN_SUPPORT) pen(p, 'Fit available, prefer raise', FIT_AVAIL_1NT_COST);

  return scored(bid, deduct(penTotal(p)), resp1NTExpl(hcp, shape, ps), p);
}

/** @param {number} hcp @param {number[]} shape @param {import('../model/bid.js').Strain} ps */
function resp1NTExpl(hcp, shape, ps) {
  if (hcp < RESP_1NT_MIN) return `${hcp} HCP: too weak for 1NT (${RESP_1NT_MIN}+)`;
  if (hcp > RESP_1NT_MAX) return `${hcp} HCP: too strong for 1NT (${RESP_1NT_MIN}-${RESP_1NT_MAX})`;
  if (hasSuitAt1(shape, ps)) return 'Have a suit to bid at 1-level; prefer showing it';
  if (suitLen(shape, ps) >= RAISE_MIN_SUPPORT) {
    return `Have ${suitLen(shape, ps)} ${STRAIN_DISPLAY[ps]}: prefer raising partner`;
  }
  return `${hcp} HCP, no fit or new suit: 1NT response`;
}

// ── 2NT jump response (13-15 HCP, balanced, no major fit) ───────────

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 */
function scoreResp2NT(bid, eval_, ps) {
  const { hcp, shapeClass, shape } = eval_;

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${RESP_2NT_MIN}-${RESP_2NT_MAX}`, hcpDev(hcp, RESP_2NT_MIN, RESP_2NT_MAX) * HCP_COST);
  pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));
  if (isMajor(ps) && suitLen(shape, ps) >= RAISE_MIN_SUPPORT) {
    pen(p, 'Major fit, prefer raise', MAJOR_FIT_2NT_COST);
  }

  return scored(bid, deduct(penTotal(p)), resp2NTExpl(hcp, shapeClass, shape, ps), p);
}

/**
 * @param {number} hcp
 * @param {import('./evaluate.js').ShapeClass} shapeClass
 * @param {number[]} shape
 * @param {import('../model/bid.js').Strain} ps
 */
function resp2NTExpl(hcp, shapeClass, shape, ps) {
  if (shapeClass !== 'balanced') return 'Hand is not balanced for 2NT';
  if (hcp < RESP_2NT_MIN) return `${hcp} HCP: too weak for 2NT (${RESP_2NT_MIN}+)`;
  if (hcp > RESP_2NT_MAX) return `${hcp} HCP: above 2NT range (${RESP_2NT_MIN}-${RESP_2NT_MAX})`;
  if (isMajor(ps) && suitLen(shape, ps) >= RAISE_MIN_SUPPORT) {
    return `Have major fit: prefer raising ${STRAIN_DISPLAY[ps]}`;
  }
  return `${hcp} HCP, balanced: 2NT (game-forcing)`;
}

// ── Jump shift (19+ HCP, strong hand) ────────────────────────────────

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 */
function scoreJumpShift(bid, eval_) {
  const { hcp, shape } = eval_;
  const strain = /** @type {import('../model/bid.js').ContractBid} */ (bid).strain;
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${JUMP_SHIFT_MIN}+`, Math.max(0, JUMP_SHIFT_MIN - hcp) * HCP_COST);
  pen(p, `${len} ${name}, need ${JUMP_SHIFT_MIN_LEN}+`, Math.max(0, JUMP_SHIFT_MIN_LEN - len) * LENGTH_SHORT_COST);

  return scored(bid, deduct(penTotal(p)), jumpShiftExpl(hcp, len, strain), p);
}

/** @param {number} hcp @param {number} len @param {import('../model/bid.js').Strain} strain */
function jumpShiftExpl(hcp, len, strain) {
  const sym = STRAIN_SYMBOLS[strain];
  const name = STRAIN_DISPLAY[strain];
  if (hcp < JUMP_SHIFT_MIN) return `${hcp} HCP: need ${JUMP_SHIFT_MIN}+ for jump shift`;
  if (len < JUMP_SHIFT_MIN_LEN) return `${len} ${name}: need ${JUMP_SHIFT_MIN_LEN}+ for jump shift`;
  return `${hcp} HCP with ${len} ${name}: jump shift to 2${sym}`;
}

// ── Generic response (levels 3+ not otherwise handled) ───────────────

/** HCP per level increment, derived from existing level-1 / level-2 thresholds. */
const RESP_HCP_PER_LEVEL = NEW_SUIT_2_MIN_HCP - RESP_MIN_HCP;

/**
 * Fallback scorer for any suit response or NT response not covered by a
 * specific SAYC rule. Penalty grows with bid level using the engine's
 * existing HCP_COST and LENGTH_SHORT_COST -- no new arbitrary constants.
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 * @returns {BidRecommendation}
 */
function scoreGenericResponse(bid, eval_, ps) {
  const { hcp, shape, shapeClass } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const minHcp = RESP_MIN_HCP + (level - 1) * RESP_HCP_PER_LEVEL;

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
  if (strain === Strain.NOTRUMP) {
    pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));
  } else {
    const name = STRAIN_DISPLAY[strain];
    const len = suitLen(shape, strain);
    pen(p, `${len} ${name}, need ${NEW_SUIT_MIN_LEN}+`, Math.max(0, NEW_SUIT_MIN_LEN - len) * LENGTH_SHORT_COST);
    if (strain === ps) pen(p, `${suitLen(shape, ps)} support, need ${RAISE_MIN_SUPPORT}+`, Math.max(0, RAISE_MIN_SUPPORT - suitLen(shape, ps)) * LENGTH_SHORT_COST);
  }

  return scored(bid, deduct(penTotal(p)), genericRespExpl(hcp, level, strain, minHcp), p);
}

function genericRespExpl(hcp, level, strain, minHcp) {
  const sym = strain === Strain.NOTRUMP ? 'NT' : STRAIN_SYMBOLS[strain];
  if (hcp < minHcp) return `${hcp} HCP: ${level}${sym} needs ${minHcp}+ HCP`;
  return `${hcp} HCP: non-standard ${level}${sym} response`;
}

// ── Responses to 1NT ─────────────────────────────────────────────────

/**
 * Score every plausible response when partner opened 1NT.
 * @param {Evaluation} eval_
 * @returns {BidRecommendation[]}
 */
function get1NTResponseBids(eval_) {
  const candidates = nt1ResponseCandidates();
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(scoreNTResponse(bid, eval_));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

/** All contract bids (levels 2-7) plus Pass. Level 1 is never legal over 1NT. */
function nt1ResponseCandidates() {
  /** @type {import('../model/bid.js').Bid[]} */
  const bids = [pass()];
  for (let level = 2; level <= 7; level++) {
    for (const strain of STRAIN_ORDER) {
      bids.push(contractBid(level, strain));
    }
  }
  return bids;
}

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @returns {BidRecommendation}
 */
function scoreNTResponse(bid, eval_) {
  if (bid.type === 'pass') return scoreNTPass(bid, eval_);
  if (bid.type !== 'contract') return scored(bid, 0, '');
  const { level, strain } = bid;
  if (level === 2 && strain === Strain.CLUBS) return scoreStayman(bid, eval_);
  if (level === 2 && strain === Strain.DIAMONDS) return scoreTransfer(bid, eval_, Strain.HEARTS);
  if (level === 2 && strain === Strain.HEARTS) return scoreTransfer(bid, eval_, Strain.SPADES);
  if (level === 2 && strain === Strain.NOTRUMP) return scoreInvite2NT(bid, eval_);
  if (level === 3 && strain === Strain.NOTRUMP) return scoreGame3NT(bid, eval_);
  if (level === 4 && strain === Strain.NOTRUMP) return scoreQuant4NT(bid, eval_);
  return scoreGenericNTResponse(bid, eval_);
}

// ── 1NT: Pass ────────────────────────────────────────────────────────

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ */
function scoreNTPass(bid, eval_) {
  const { hcp, shape } = eval_;
  const longMajor = Math.max(suitLen(shape, Strain.HEARTS), suitLen(shape, Strain.SPADES));
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, max ${NT_RESP_PASS_MAX} to pass`, Math.max(0, hcp - NT_RESP_PASS_MAX) * HCP_COST);
  if (longMajor >= NT_TRANSFER_MIN_LEN) pen(p, `${longMajor}-card major (transfer available)`, LONG_MAJOR_PASS_COST);
  return scored(bid, deduct(penTotal(p)), ntPassExpl(hcp, longMajor), p);
}

/** @param {number} hcp @param {number} longMajor */
function ntPassExpl(hcp, longMajor) {
  if (hcp > NT_RESP_PASS_MAX) return `${hcp} HCP: too strong to pass (${NT_RESP_PASS_MAX} max)`;
  if (longMajor >= NT_TRANSFER_MIN_LEN) return `${longMajor}-card major: transfer for a better partscore`;
  return `${hcp} HCP: correct to pass partner's 1NT`;
}

// ── 1NT: Stayman (2♣) ───────────────────────────────────────────────

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ */
function scoreStayman(bid, eval_) {
  const { hcp, shape } = eval_;
  const spades = suitLen(shape, Strain.SPADES);
  const hearts = suitLen(shape, Strain.HEARTS);
  const longestMajor = Math.max(spades, hearts);
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${STAYMAN_MIN_HCP}+`, Math.max(0, STAYMAN_MIN_HCP - hcp) * HCP_COST);
  if (longestMajor < STAYMAN_MAJOR_LEN) pen(p, 'No 4-card major for Stayman', NO_MAJOR_STAYMAN_COST);
  if (spades >= NT_TRANSFER_MIN_LEN && hearts < STAYMAN_MAJOR_LEN) pen(p, '5+ spades: prefer transfer', PREFER_TRANSFER_COST);
  if (hearts >= NT_TRANSFER_MIN_LEN && spades < STAYMAN_MAJOR_LEN) pen(p, '5+ hearts: prefer transfer', PREFER_TRANSFER_COST);
  return scored(bid, deduct(penTotal(p)), staymanExpl(hcp, spades, hearts), p);
}

/** @param {number} hcp @param {number} spades @param {number} hearts */
function staymanExpl(hcp, spades, hearts) {
  if (Math.max(spades, hearts) < STAYMAN_MAJOR_LEN) return 'No 4-card major for Stayman';
  if (hcp < STAYMAN_MIN_HCP) return `${hcp} HCP: need ${STAYMAN_MIN_HCP}+ for Stayman`;
  const parts = [];
  if (spades >= STAYMAN_MAJOR_LEN) parts.push(`${spades}${STRAIN_SYMBOLS[Strain.SPADES]}`);
  if (hearts >= STAYMAN_MAJOR_LEN) parts.push(`${hearts}${STRAIN_SYMBOLS[Strain.HEARTS]}`);
  return `${hcp} HCP with ${parts.join(' and ')}: Stayman, asking for 4-card major`;
}

// ── 1NT: Jacoby Transfer ────────────────────────────────────────────

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} targetStrain
 */
function scoreTransfer(bid, eval_, targetStrain) {
  const { shape } = eval_;
  const len = suitLen(shape, targetStrain);
  const name = STRAIN_DISPLAY[targetStrain];
  /** @type {PenaltyItem[]} */
  const p = [];
  if (len < NT_TRANSFER_MIN_LEN) {
    pen(p, `${len} ${name}, need ${NT_TRANSFER_MIN_LEN}+ for transfer`, (NT_TRANSFER_MIN_LEN - len) * LENGTH_SHORT_COST);
    return scored(bid, deduct(penTotal(p)), `${len} ${name}: need ${NT_TRANSFER_MIN_LEN}+ for transfer`, p);
  }
  const otherMajor = targetStrain === Strain.HEARTS ? Strain.SPADES : Strain.HEARTS;
  const otherLen = suitLen(shape, otherMajor);
  if (otherLen > len) pen(p, `Other major is longer (${otherLen} vs ${len})`, (otherLen - len) * TRANSFER_SUIT_PREF_COST);
  if (otherLen === len && otherLen >= NT_TRANSFER_MIN_LEN && targetStrain === Strain.HEARTS) {
    pen(p, 'Equal length: prefer spades', TRANSFER_SUIT_PREF_COST);
  }
  return scored(bid, deduct(penTotal(p)), transferExpl(eval_.hcp, len, targetStrain), p);
}

/**
 * @param {number} hcp @param {number} len
 * @param {import('../model/bid.js').Strain} targetStrain
 */
function transferExpl(hcp, len, targetStrain) {
  const name = STRAIN_DISPLAY[targetStrain];
  if (hcp <= NT_RESP_PASS_MAX) return `${len} ${name}: Jacoby Transfer, then pass (weak)`;
  if (hcp <= INVITE_2NT_MAX_HCP) return `${len} ${name}: Jacoby Transfer, then 2NT (invitational)`;
  if (hcp <= GAME_3NT_MAX_HCP) return `${len} ${name}: Jacoby Transfer, then bid game`;
  return `${len} ${name}: Jacoby Transfer, then explore slam`;
}

// ── 1NT: 2NT invitational ───────────────────────────────────────────

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ */
function scoreInvite2NT(bid, eval_) {
  const { hcp, shape, shapeClass } = eval_;
  const longMajor = Math.max(suitLen(shape, Strain.SPADES), suitLen(shape, Strain.HEARTS));
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${INVITE_2NT_MIN_HCP}-${INVITE_2NT_MAX_HCP}`, hcpDev(hcp, INVITE_2NT_MIN_HCP, INVITE_2NT_MAX_HCP) * HCP_COST);
  pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));
  if (longMajor >= STAYMAN_MAJOR_LEN && hcp >= STAYMAN_MIN_HCP) pen(p, '4-card major: prefer Stayman', MAJOR_AVAIL_NT_COST);
  if (longMajor >= NT_TRANSFER_MIN_LEN) pen(p, '5-card major: prefer transfer', FIVE_MAJOR_NT_COST);
  return scored(bid, deduct(penTotal(p)), invite2NTExpl(hcp, shapeClass, longMajor), p);
}

/**
 * @param {number} hcp
 * @param {import('./evaluate.js').ShapeClass} shapeClass
 * @param {number} longMajor
 */
function invite2NTExpl(hcp, shapeClass, longMajor) {
  if (shapeClass !== 'balanced') return 'Hand not balanced for 2NT invitation';
  if (hcp < INVITE_2NT_MIN_HCP || hcp > INVITE_2NT_MAX_HCP) {
    return `${hcp} HCP: outside 2NT range (${INVITE_2NT_MIN_HCP}-${INVITE_2NT_MAX_HCP})`;
  }
  if (longMajor >= NT_TRANSFER_MIN_LEN) return 'Have 5-card major: prefer Jacoby Transfer';
  if (longMajor >= STAYMAN_MAJOR_LEN) return 'Have 4-card major: prefer Stayman';
  return `${hcp} HCP, balanced: 2NT invitation`;
}

// ── 1NT: 3NT game ───────────────────────────────────────────────────

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ */
function scoreGame3NT(bid, eval_) {
  const { hcp, shape } = eval_;
  const longMajor = Math.max(suitLen(shape, Strain.SPADES), suitLen(shape, Strain.HEARTS));
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${GAME_3NT_MIN_HCP}-${GAME_3NT_MAX_HCP}`, hcpDev(hcp, GAME_3NT_MIN_HCP, GAME_3NT_MAX_HCP) * HCP_COST);
  if (longMajor >= STAYMAN_MAJOR_LEN && hcp >= STAYMAN_MIN_HCP) pen(p, '4-card major: prefer Stayman', MAJOR_AVAIL_NT_COST);
  if (longMajor >= NT_TRANSFER_MIN_LEN) pen(p, '5-card major: prefer transfer', FIVE_MAJOR_NT_COST);
  return scored(bid, deduct(penTotal(p)), game3NTExpl(hcp, longMajor), p);
}

/** @param {number} hcp @param {number} longMajor */
function game3NTExpl(hcp, longMajor) {
  if (hcp < GAME_3NT_MIN_HCP || hcp > GAME_3NT_MAX_HCP) {
    return `${hcp} HCP: outside 3NT range (${GAME_3NT_MIN_HCP}-${GAME_3NT_MAX_HCP})`;
  }
  if (longMajor >= NT_TRANSFER_MIN_LEN) return 'Have 5-card major: prefer Jacoby Transfer first';
  if (longMajor >= STAYMAN_MAJOR_LEN) return 'Have 4-card major: prefer Stayman first';
  return `${hcp} HCP: direct 3NT`;
}

// ── 1NT: 4NT quantitative slam invitation ───────────────────────────

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ */
function scoreQuant4NT(bid, eval_) {
  const { hcp, shape, shapeClass } = eval_;
  const longMajor = Math.max(suitLen(shape, Strain.SPADES), suitLen(shape, Strain.HEARTS));
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${QUANT_4NT_MIN_HCP}-${QUANT_4NT_MAX_HCP}`, hcpDev(hcp, QUANT_4NT_MIN_HCP, QUANT_4NT_MAX_HCP) * HCP_COST);
  pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));
  if (longMajor >= STAYMAN_MAJOR_LEN) pen(p, '4-card major: prefer Stayman', MAJOR_AVAIL_NT_COST);
  return scored(bid, deduct(penTotal(p)), quant4NTExpl(hcp, shapeClass, longMajor), p);
}

/**
 * @param {number} hcp
 * @param {import('./evaluate.js').ShapeClass} shapeClass
 * @param {number} longMajor
 */
function quant4NTExpl(hcp, shapeClass, longMajor) {
  if (shapeClass !== 'balanced') return 'Hand not balanced for 4NT quantitative';
  if (hcp < QUANT_4NT_MIN_HCP || hcp > QUANT_4NT_MAX_HCP) {
    return `${hcp} HCP: outside quantitative range (${QUANT_4NT_MIN_HCP}-${QUANT_4NT_MAX_HCP})`;
  }
  if (longMajor >= STAYMAN_MAJOR_LEN) return 'Have 4-card major: consider Stayman first';
  return `${hcp} HCP, balanced: 4NT quantitative slam invitation`;
}

// ── Generic 1NT response (unhandled bids over 1NT) ──────────────────

/** HCP per level increment, derived from 2NT invite and 4NT quant thresholds. */
const NT_RESP_HCP_PER_LEVEL = (QUANT_4NT_MIN_HCP - INVITE_2NT_MIN_HCP) / (4 - 2);

/**
 * Fallback scorer for responses to 1NT not covered by a specific
 * convention (Stayman, transfers, 2NT invite, 3NT, 4NT quant).
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @returns {BidRecommendation}
 */
function scoreGenericNTResponse(bid, eval_) {
  const { hcp, shape, shapeClass } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const minHcp = INVITE_2NT_MIN_HCP + (level - 2) * NT_RESP_HCP_PER_LEVEL;

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
  if (strain === Strain.NOTRUMP) {
    pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));
  } else {
    const name = STRAIN_DISPLAY[strain];
    const len = suitLen(shape, strain);
    pen(p, `${len} ${name}, need ${NT_TRANSFER_MIN_LEN}+`, Math.max(0, NT_TRANSFER_MIN_LEN - len) * LENGTH_SHORT_COST);
  }

  return scored(bid, deduct(penTotal(p)), genericNTRespExpl(hcp, level, strain, minHcp), p);
}

function genericNTRespExpl(hcp, level, strain, minHcp) {
  const sym = strain === Strain.NOTRUMP ? 'NT' : STRAIN_SYMBOLS[strain];
  if (hcp < minHcp) return `${hcp} HCP: ${level}${sym} over 1NT needs ${minHcp}+ HCP`;
  return `${hcp} HCP: non-standard ${level}${sym} over 1NT`;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** @param {number[]} shape @param {import('../model/bid.js').Strain} strain */
function suitLen(shape, strain) {
  return shape[SHAPE_STRAINS.indexOf(strain)];
}

/** @param {import('../model/bid.js').Strain} strain */
function isMajor(strain) {
  return strain === Strain.SPADES || strain === Strain.HEARTS;
}

/**
 * Does strain `a` rank above strain `b` in the bidding order?
 * @param {import('../model/bid.js').Strain} a
 * @param {import('../model/bid.js').Strain} b
 */
function ranksAbove(a, b) {
  return STRAIN_ORDER.indexOf(a) > STRAIN_ORDER.indexOf(b);
}

/**
 * Adjusted minimum HCP for a 1-level new suit response.
 * Long suits (6+) reduce the requirement: each card above 5 discounts by
 * RESP_LONG_SUIT_DISCOUNT HCP.
 * @param {number} suitLength
 * @returns {number}
 */
function adjustedRespMin(suitLength) {
  const discount = Math.max(0, suitLength - 5) * RESP_LONG_SUIT_DISCOUNT;
  return Math.max(0, RESP_MIN_HCP - discount);
}

/** Distance in HCP from the ideal range (0 if within range). */
function hcpDev(hcp, min, max) {
  if (hcp < min) return min - hcp;
  if (hcp > max) return hcp - max;
  return 0;
}

/** Shape penalty when balanced is required (for 2NT). */
function shapePenalty(shapeClass) {
  if (shapeClass === 'semi-balanced') return SHAPE_SEMI_COST;
  if (shapeClass === 'unbalanced') return SHAPE_UNBAL_COST;
  return 0;
}

/** Convert penalty to priority score (can go negative). */
function deduct(penalty) {
  return Math.round((MAX_SCORE - penalty) * 10) / 10;
}

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {number} priority
 * @param {string} explanation
 * @returns {BidRecommendation}
 */
/** @param {PenaltyItem[]} [penalties] */
function scored(bid, priority, explanation, penalties) {
  return { bid, priority, explanation, penalties: penalties || [] };
}

/** Does the hand have a 4+ card suit biddable at the 1-level over partner? */
function hasSuitAt1(shape, partnerStrain) {
  for (const strain of SHAPE_STRAINS) {
    if (strain === partnerStrain) continue;
    if (ranksAbove(strain, partnerStrain) && suitLen(shape, strain) >= NEW_SUIT_MIN_LEN) {
      return true;
    }
  }
  return false;
}

/**
 * Penalty for bidding a suit that isn't the longest available new suit.
 * @param {import('../model/bid.js').Strain} strain
 * @param {number[]} shape
 * @param {import('../model/bid.js').Strain} ps
 */
function suitPrefCost(strain, shape, ps) {
  let maxLen = 0;
  for (const s of SHAPE_STRAINS) {
    if (s === ps) continue;
    if (suitLen(shape, s) > maxLen) maxLen = suitLen(shape, s);
  }
  const thisLen = suitLen(shape, strain);
  if (thisLen >= NEW_SUIT_MIN_LEN && thisLen < maxLen) {
    return (maxLen - thisLen) * SUIT_PREF_COST;
  }
  return 0;
}

/**
 * Penalty for bidding a new suit when a major raise is clearly available.
 * Applies only when partner opened a major and we have adequate support.
 * @param {import('../model/bid.js').Strain} ps
 * @param {number[]} shape
 * @param {number} hcp
 */
function majorRaiseAvailCost(ps, shape, hcp) {
  if (!isMajor(ps)) return 0;
  const support = suitLen(shape, ps);
  if (support < RAISE_MIN_SUPPORT) return 0;
  if (hcp >= SINGLE_RAISE_MIN && hcp <= SINGLE_RAISE_MAX) return MAJOR_FIT_PREF_COST;
  if (support >= LIMIT_RAISE_SUPPORT && hcp >= LIMIT_RAISE_MIN && hcp <= LIMIT_RAISE_MAX) {
    return MAJOR_FIT_PREF_COST;
  }
  return 0;
}

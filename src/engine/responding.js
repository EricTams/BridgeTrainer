import { contractBid, pass, Strain, STRAIN_ORDER, STRAIN_SYMBOLS } from '../model/bid.js';
import { Rank } from '../model/card.js';
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
const RESP_2NT_STOPPER_COST = 3;

// ── SAYC thresholds ─────────────────────────────────────────────────

const RESP_MIN_HCP = 6;
const NEW_SUIT_2_MIN_HCP = 10;
const NEW_SUIT_MIN_LEN = 4;
const NEW_SUIT_2_MIN_LEN = 5;
const SINGLE_RAISE_MIN = 6;
const SINGLE_RAISE_MAX = 10;
const RAISE_MIN_SUPPORT = 3;
const LIMIT_RAISE_MIN = 10;
const LIMIT_RAISE_MAX = 12;
const LIMIT_RAISE_SUPPORT = 4;
const RESP_1NT_MIN = 6;
const RESP_1NT_MAX = 10;
const RESP_2NT_MINOR_MIN = 11;
const RESP_2NT_MINOR_MAX = 12;
const JACOBY_2NT_MIN_HCP = 13;
const JACOBY_2NT_MIN_SUPPORT = 4;
const JACOBY_2NT_NO_FIT_COST = 10;
const JUMP_SHIFT_MIN = 19;
const JUMP_SHIFT_MIN_LEN = 5;
const GAME_RAISE_MIN_HCP = 5;
const GAME_RAISE_MAX_HCP = 10;
const GAME_RAISE_MIN_SUPPORT = 5;
const GAME_RAISE_BALANCED_COST = 6;
const GAME_RAISE_SEMI_BAL_COST = 3;
const MINOR_RAISE_NT_AVAIL_COST = 3;
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

// ── 2♣ Response thresholds ───────────────────────────────────────────

const RESP_2C_NEG_MAX = 7;
const RESP_2C_POS_MIN = 8;
const RESP_2C_POS_SUIT_LEN = 5;
const RESP_2C_PASS_COST = 20;
const RESP_2C_POS_AVAIL_COST = 1;
const RESP_2C_5CARD_NT_COST = 3;

// ── Weak Two Response thresholds ─────────────────────────────────────

const WT_PASS_MAX = 13;
const WT_RAISE_SUPPORT = 3;
const WT_RAISE_MAX_HCP = 13;
const WT_GAME_SUPPORT = 3;
const WT_GAME_MIN_HCP = 14;
const WT_GAME_PREEMPT_SUPPORT = 5;
const WT_GAME_PREEMPT_MIN_HCP = 8;
const WT_2NT_MIN = 14;
const WT_2NT_MAX = 16;
const WT_NEW_SUIT_MIN = 16;
const WT_NEW_SUIT_LEN = 5;
const WT_3NT_MIN = 15;
const WT_3NT_MAX = 17;
const WT_SUPPORT_PASS_COST = 2;
const WT_LONG_SUPPORT_2NT_COST = 2;

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
 * @param {Hand} hand
 * @param {Evaluation} evaluation
 * @param {ContractBid} partnerBid
 * @returns {BidRecommendation[]}
 */
export function getRespondingBids(hand, evaluation, partnerBid) {
  if (partnerBid.level === 2 && partnerBid.strain === Strain.CLUBS) {
    return get2CResponseBids(evaluation);
  }
  if (partnerBid.level === 2 && partnerBid.strain === Strain.NOTRUMP) {
    return get2NTResponseBids(evaluation);
  }
  if (partnerBid.level === 2 && partnerBid.strain !== Strain.NOTRUMP) {
    return getWeakTwoResponseBids(hand, evaluation, partnerBid.strain);
  }
  if (partnerBid.level >= 3 && partnerBid.strain !== Strain.NOTRUMP) {
    return getPreempt3ResponseBids(evaluation, partnerBid);
  }
  if (partnerBid.level !== 1) return [];
  if (partnerBid.strain === Strain.NOTRUMP) return get1NTResponseBids(evaluation);

  const ps = partnerBid.strain;
  const candidates = respondingCandidates(ps);
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(scoreResponseBid(bid, hand, evaluation, ps));
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
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps - partner's strain
 * @returns {BidRecommendation}
 */
function scoreResponseBid(bid, hand, eval_, ps) {
  if (bid.type === 'pass') return scorePass(bid, eval_);
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;
  if (level === 1 && strain === Strain.NOTRUMP) return scoreResp1NT(bid, eval_, ps);
  if (level === 1) return scoreNewSuit1(bid, eval_, ps);
  if (level === 2 && strain === Strain.NOTRUMP) return scoreResp2NT(bid, hand, eval_, ps);
  if (level === 2 && strain === ps) return scoreSingleRaise(bid, eval_, ps);
  if (level === 2 && ranksAbove(strain, ps)) return scoreJumpShift(bid, eval_);
  if (level === 2) return scoreNewSuit2(bid, eval_, ps);
  if (level === 3 && strain === ps) return scoreLimitRaise(bid, eval_, ps);
  if (level === 3 && strain !== Strain.NOTRUMP && strain !== ps && !ranksAbove(strain, ps)) {
    return scoreJumpShift(bid, eval_);
  }
  if (level === 4 && strain === ps && isMajor(ps)) return scoreGameRaise(bid, eval_, ps);
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
  pen(p, 'Equal length: bid higher-ranking suit first', equalLenHigherSuitCost(strain, shape, ps));
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

// ── New suit at 2-level (10+ HCP, 5+ cards, forcing 1 round) ────────

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
  pen(p, `${len} ${name}, need ${NEW_SUIT_2_MIN_LEN}+`, Math.max(0, NEW_SUIT_2_MIN_LEN - len) * LENGTH_SHORT_COST);
  pen(p, 'Better suit available', suitPrefCost(strain, shape, ps));
  pen(p, 'Equal length: bid higher-ranking suit first', equalLenHigherSuitCost(strain, shape, ps));
  pen(p, 'Major raise available', majorRaiseAvailCost(ps, shape, hcp));

  return scored(bid, deduct(penTotal(p)), newSuit2Expl(hcp, len, strain), p);
}

/** @param {number} hcp @param {number} len @param {import('../model/bid.js').Strain} strain */
function newSuit2Expl(hcp, len, strain) {
  const sym = STRAIN_SYMBOLS[strain];
  const name = STRAIN_DISPLAY[strain];
  if (len < NEW_SUIT_2_MIN_LEN) return `${len} ${name}: need ${NEW_SUIT_2_MIN_LEN}+ for 2${sym}`;
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
  const { hcp, shape, shapeClass } = eval_;
  const support = suitLen(shape, ps);
  const name = STRAIN_DISPLAY[ps];
  const balancedMinor = !isMajor(ps) && shapeClass === 'balanced'
    && hcp >= RESP_1NT_MIN && hcp <= RESP_1NT_MAX;

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${SINGLE_RAISE_MIN}-${SINGLE_RAISE_MAX}`, hcpDev(hcp, SINGLE_RAISE_MIN, SINGLE_RAISE_MAX) * HCP_COST);
  pen(p, `${support} ${name}, need ${RAISE_MIN_SUPPORT}+`, Math.max(0, RAISE_MIN_SUPPORT - support) * LENGTH_SHORT_COST);
  if (balancedMinor) {
    pen(p, 'Balanced: prefer 1NT over minor raise', MINOR_RAISE_NT_AVAIL_COST);
  }

  return scored(bid, deduct(penTotal(p)), singleRaiseExpl(hcp, support, ps, shapeClass), p);
}

/** @param {number} hcp @param {number} support @param {import('../model/bid.js').Strain} ps @param {import('./evaluate.js').ShapeClass} shapeClass */
function singleRaiseExpl(hcp, support, ps, shapeClass) {
  const sym = STRAIN_SYMBOLS[ps];
  const name = STRAIN_DISPLAY[ps];
  if (support < RAISE_MIN_SUPPORT) return `${support} ${name}: need ${RAISE_MIN_SUPPORT}+ to raise`;
  if (hcp < SINGLE_RAISE_MIN) return `${hcp} HCP: too weak to raise (${SINGLE_RAISE_MIN}+)`;
  if (hcp > SINGLE_RAISE_MAX) return `${hcp} HCP: too strong for single raise (${SINGLE_RAISE_MIN}-${SINGLE_RAISE_MAX})`;
  if (!isMajor(ps) && shapeClass === 'balanced' && hcp >= RESP_1NT_MIN && hcp <= RESP_1NT_MAX) {
    return `${hcp} HCP, balanced with ${support} ${name}: prefer 1NT (keeps options open)`;
  }
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
  const partnerSupport = suitLen(shape, ps);

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${RESP_1NT_MIN}-${RESP_1NT_MAX}`, hcpDev(hcp, RESP_1NT_MIN, RESP_1NT_MAX) * HCP_COST);
  if (hasSuitAt1(shape, ps)) pen(p, 'Suit available at 1-level', SUIT_AVAIL_1NT_COST);
  if (partnerSupport >= RAISE_MIN_SUPPORT) pen(p, 'Fit available, prefer raise', FIT_AVAIL_1NT_COST);
  if (partnerSupport <= 1 && hcp >= NEW_SUIT_2_MIN_HCP && hasSuitAt2(shape, ps)) {
    pen(p, 'Singleton in partner\'s suit with biddable side suit', 3);
  }

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
  if (suitLen(shape, ps) <= 1 && hcp >= NEW_SUIT_2_MIN_HCP && hasSuitAt2(shape, ps)) {
    return 'Singleton in partner\'s suit: prefer new suit at 2-level';
  }
  const forcing = isMajor(ps) ? 'semi-forcing' : 'non-forcing';
  return `${hcp} HCP, no fit or new suit: 1NT response (${forcing})`;
}

// ── 2NT response (Jacoby 2NT over major / invitational over minor) ───

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 */
function scoreResp2NT(bid, hand, eval_, ps) {
  if (isMajor(ps)) return scoreJacoby2NT(bid, eval_, ps);
  return scoreNatural2NTMinor(bid, hand, eval_, ps);
}

/**
 * Jacoby 2NT over 1♥/1♠: game-forcing raise showing 4+ trump support.
 * Any shape; balanced not required.
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 */
function scoreJacoby2NT(bid, eval_, ps) {
  const { hcp, shape } = eval_;
  const support = suitLen(shape, ps);
  const name = STRAIN_DISPLAY[ps];

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${JACOBY_2NT_MIN_HCP}+`,
    Math.max(0, JACOBY_2NT_MIN_HCP - hcp) * HCP_COST);
  if (support < JACOBY_2NT_MIN_SUPPORT) {
    pen(p, `${support} ${name}: need ${JACOBY_2NT_MIN_SUPPORT}+ for Jacoby 2NT`,
      JACOBY_2NT_NO_FIT_COST);
  }

  let expl;
  if (support < JACOBY_2NT_MIN_SUPPORT) {
    expl = `${support} ${name}: need ${JACOBY_2NT_MIN_SUPPORT}+ trump support for Jacoby 2NT`;
  } else if (hcp < JACOBY_2NT_MIN_HCP) {
    expl = `${hcp} HCP: need ${JACOBY_2NT_MIN_HCP}+ for Jacoby 2NT (game-forcing)`;
  } else {
    expl = `${hcp} HCP with ${support} ${name}: Jacoby 2NT (game-forcing, showing fit)`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/**
 * Natural invitational 2NT over 1♣/1♦: 11-12 HCP, balanced, stoppers.
 * @param {import('../model/bid.js').Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 */
function scoreNatural2NTMinor(bid, hand, eval_, ps) {
  const { hcp, shapeClass } = eval_;
  const rangeMin = RESP_2NT_MINOR_MIN;
  const rangeMax = RESP_2NT_MINOR_MAX;
  const unstopped = countUnstoppedSuits(hand, ps);

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${rangeMin}-${rangeMax}`, hcpDev(hcp, rangeMin, rangeMax) * HCP_COST);
  pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));
  if (unstopped > 0) {
    pen(p, `${unstopped} unbid suit(s) without stopper`, unstopped * RESP_2NT_STOPPER_COST);
  }

  let expl;
  if (shapeClass !== 'balanced') expl = 'Hand is not balanced for 2NT';
  else if (hcp < rangeMin) expl = `${hcp} HCP: too weak for 2NT (${rangeMin}+)`;
  else if (hcp > rangeMax) expl = `${hcp} HCP: above 2NT range (${rangeMin}-${rangeMax})`;
  else if (unstopped > 0) expl = `${hcp} HCP, balanced but ${unstopped} unbid suit(s) unstopped: 2NT risky`;
  else expl = `${hcp} HCP, balanced with stoppers: 2NT (invitational)`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Jump shift (19+ HCP, strong hand) ────────────────────────────────

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 */
function scoreJumpShift(bid, eval_) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {import('../model/bid.js').ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${JUMP_SHIFT_MIN}+`, Math.max(0, JUMP_SHIFT_MIN - hcp) * HCP_COST);
  pen(p, `${len} ${name}, need ${JUMP_SHIFT_MIN_LEN}+`, Math.max(0, JUMP_SHIFT_MIN_LEN - len) * LENGTH_SHORT_COST);

  return scored(bid, deduct(penTotal(p)), jumpShiftExpl(hcp, len, level, strain), p);
}

/** @param {number} hcp @param {number} len @param {number} level @param {import('../model/bid.js').Strain} strain */
function jumpShiftExpl(hcp, len, level, strain) {
  const sym = STRAIN_SYMBOLS[strain];
  const name = STRAIN_DISPLAY[strain];
  if (hcp < JUMP_SHIFT_MIN) return `${hcp} HCP: need ${JUMP_SHIFT_MIN}+ for jump shift`;
  if (len < JUMP_SHIFT_MIN_LEN) return `${len} ${name}: need ${JUMP_SHIFT_MIN_LEN}+ for jump shift`;
  return `${hcp} HCP with ${len} ${name}: jump shift to ${level}${sym}`;
}

// ── Game raise (4♥/4♠ — preemptive, 5-10 HCP, 5+ support, shape) ────

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 */
function scoreGameRaise(bid, eval_, ps) {
  const { hcp, shape, shapeClass } = eval_;
  const support = suitLen(shape, ps);
  const name = STRAIN_DISPLAY[ps];

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${GAME_RAISE_MIN_HCP}-${GAME_RAISE_MAX_HCP}`,
    hcpDev(hcp, GAME_RAISE_MIN_HCP, GAME_RAISE_MAX_HCP) * HCP_COST);
  pen(p, `${support} ${name}, need ${GAME_RAISE_MIN_SUPPORT}+`,
    Math.max(0, GAME_RAISE_MIN_SUPPORT - support) * LENGTH_SHORT_COST);
  if (shapeClass === 'balanced') pen(p, 'Balanced: prefer constructive bidding', GAME_RAISE_BALANCED_COST);
  else if (shapeClass === 'semi-balanced') pen(p, 'Semi-balanced: less ideal for preempt', GAME_RAISE_SEMI_BAL_COST);

  return scored(bid, deduct(penTotal(p)), gameRaiseExpl(hcp, support, shapeClass, ps), p);
}

/** @param {number} hcp @param {number} support @param {import('./evaluate.js').ShapeClass} shapeClass @param {import('../model/bid.js').Strain} ps */
function gameRaiseExpl(hcp, support, shapeClass, ps) {
  const sym = STRAIN_SYMBOLS[ps];
  const name = STRAIN_DISPLAY[ps];
  if (support < GAME_RAISE_MIN_SUPPORT) return `${support} ${name}: need ${GAME_RAISE_MIN_SUPPORT}+ for preemptive 4${sym}`;
  if (hcp > GAME_RAISE_MAX_HCP) return `${hcp} HCP: too strong for preemptive 4${sym} (use Jacoby 2NT or splinter)`;
  if (hcp < GAME_RAISE_MIN_HCP) return `${hcp} HCP: too weak for 4${sym} (${GAME_RAISE_MIN_HCP}+)`;
  if (shapeClass === 'balanced') return `Balanced hand: prefer constructive bidding over preemptive 4${sym}`;
  return `${hcp} HCP with ${support} ${name}: preemptive raise to 4${sym}`;
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
  const longSuit = Math.max(...shape);
  const shortSuit = Math.min(...shape);
  const hasMajor = suitLen(shape, Strain.HEARTS) >= STAYMAN_MAJOR_LEN ||
                   suitLen(shape, Strain.SPADES) >= STAYMAN_MAJOR_LEN;
  /** @type {PenaltyItem[]} */
  const p = [];
  const ntPassHcpCost = 3;
  pen(p, `${hcp} HCP, max ${NT_RESP_PASS_MAX} to pass`, Math.max(0, hcp - NT_RESP_PASS_MAX) * ntPassHcpCost);
  if (longMajor >= NT_TRANSFER_MIN_LEN) pen(p, `${longMajor}-card major (transfer available)`, LONG_MAJOR_PASS_COST);
  if (shortSuit <= 1 && hasMajor && hcp >= NT_RESP_PASS_MAX) {
    pen(p, 'Singleton/void with 4-card major: Stayman or transfer preferred', 3);
  }
  if (hcp === 7 && shortSuit <= 1) {
    pen(p, 'Distributional shape (singleton/void) adds value at 7 HCP', 2);
  }
  if (hcp === 7 && longSuit >= 5) {
    pen(p, '5-card suit adds value at 7 HCP', 1.5);
  }
  return scored(bid, deduct(penTotal(p)), ntPassExpl(hcp, longMajor, shortSuit, hasMajor), p);
}

/** @param {number} hcp @param {number} longMajor @param {number} shortSuit @param {boolean} hasMajor */
function ntPassExpl(hcp, longMajor, shortSuit, hasMajor) {
  if (hcp > NT_RESP_PASS_MAX) return `${hcp} HCP: too strong to pass (${NT_RESP_PASS_MAX} max)`;
  if (longMajor >= NT_TRANSFER_MIN_LEN) return `${longMajor}-card major: transfer for a better partscore`;
  if (shortSuit <= 1 && hasMajor && hcp >= NT_RESP_PASS_MAX) return `${hcp} HCP with shortness: explore with Stayman/transfer`;
  return `${hcp} HCP: correct to pass partner's 1NT`;
}

// ── 1NT: Stayman (2♣) ───────────────────────────────────────────────

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ */
function scoreStayman(bid, eval_) {
  const { hcp, shape } = eval_;
  const spades = suitLen(shape, Strain.SPADES);
  const hearts = suitLen(shape, Strain.HEARTS);
  const longestMajor = Math.max(spades, hearts);
  const shortSuit = Math.min(...shape);
  const effHcp = shortSuit <= 1 ? hcp + 1 : hcp;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${STAYMAN_MIN_HCP}+`, Math.max(0, STAYMAN_MIN_HCP - effHcp) * HCP_COST);
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

// ── Responses to 2NT opening (20-21 HCP, balanced) ──────────────────

const NT2_RESP_PASS_MAX = 3;
const NT2_STAYMAN_MIN_HCP = 4;
const NT2_TRANSFER_MIN_LEN = 5;
const NT2_GAME_MIN_HCP = 4;
const NT2_GAME_MAX_HCP = 10;
const NT2_SLAM_MIN_HCP = 11;
const NT2_SLAM_MAX_HCP = 14;
const NT2_GRAND_MIN_HCP = 15;

/**
 * Score every plausible response when partner opened 2NT.
 * @param {Evaluation} eval_
 * @returns {BidRecommendation[]}
 */
function get2NTResponseBids(eval_) {
  /** @type {import('../model/bid.js').Bid[]} */
  const bids = [pass()];
  for (let level = 3; level <= 7; level++) {
    for (const strain of STRAIN_ORDER) {
      bids.push(contractBid(level, strain));
    }
  }
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of bids) {
    results.push(score2NTResponse(bid, eval_));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @returns {BidRecommendation}
 */
function score2NTResponse(bid, eval_) {
  if (bid.type === 'pass') return score2NTPass(bid, eval_);
  if (bid.type !== 'contract') return scored(bid, 0, '');
  const { level, strain } = bid;
  if (level === 3 && strain === Strain.CLUBS) return score2NTStayman(bid, eval_);
  if (level === 3 && strain === Strain.DIAMONDS) return score2NTTransfer(bid, eval_, Strain.HEARTS);
  if (level === 3 && strain === Strain.HEARTS) return score2NTTransfer(bid, eval_, Strain.SPADES);
  if (level === 3 && strain === Strain.NOTRUMP) return score2NT3NT(bid, eval_);
  if (level === 4 && strain === Strain.NOTRUMP) return score2NT4NT(bid, eval_);
  if (level === 6 && strain === Strain.NOTRUMP) return score2NT6NT(bid, eval_);
  return score2NTGeneric(bid, eval_);
}

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ */
function score2NTPass(bid, eval_) {
  const { hcp, shape } = eval_;
  const longMajor = Math.max(suitLen(shape, Strain.HEARTS), suitLen(shape, Strain.SPADES));
  /** @type {PenaltyItem[]} */
  const p = [];
  if (hcp > NT2_RESP_PASS_MAX) {
    pen(p, `${hcp} HCP: too strong to pass 2NT (${NT2_RESP_PASS_MAX} max)`,
      (hcp - NT2_RESP_PASS_MAX) * HCP_COST);
  }
  if (longMajor >= NT2_TRANSFER_MIN_LEN && hcp >= NT2_STAYMAN_MIN_HCP) {
    pen(p, `${longMajor}-card major: transfer available`, LONG_MAJOR_PASS_COST);
  }
  const expl = hcp > NT2_RESP_PASS_MAX
    ? `${hcp} HCP: too strong to pass 2NT`
    : `${hcp} HCP: pass partner's 2NT`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ */
function score2NTStayman(bid, eval_) {
  const { hcp, shape } = eval_;
  const spades = suitLen(shape, Strain.SPADES);
  const hearts = suitLen(shape, Strain.HEARTS);
  const longestMajor = Math.max(spades, hearts);
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${NT2_STAYMAN_MIN_HCP}+`,
    Math.max(0, NT2_STAYMAN_MIN_HCP - hcp) * HCP_COST);
  if (longestMajor < STAYMAN_MAJOR_LEN) {
    pen(p, 'No 4-card major for Stayman', NO_MAJOR_STAYMAN_COST);
  }
  if (spades >= NT2_TRANSFER_MIN_LEN && hearts < STAYMAN_MAJOR_LEN) {
    pen(p, '5+ spades: prefer transfer', PREFER_TRANSFER_COST);
  }
  if (hearts >= NT2_TRANSFER_MIN_LEN && spades < STAYMAN_MAJOR_LEN) {
    pen(p, '5+ hearts: prefer transfer', PREFER_TRANSFER_COST);
  }
  const expl = longestMajor >= STAYMAN_MAJOR_LEN && hcp >= NT2_STAYMAN_MIN_HCP
    ? `${hcp} HCP with 4-card major: Stayman 3${STRAIN_SYMBOLS[Strain.CLUBS]} over 2NT`
    : longestMajor < STAYMAN_MAJOR_LEN
      ? 'No 4-card major for Stayman'
      : `${hcp} HCP: need ${NT2_STAYMAN_MIN_HCP}+ for Stayman`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} targetStrain
 */
function score2NTTransfer(bid, eval_, targetStrain) {
  const { shape } = eval_;
  const len = suitLen(shape, targetStrain);
  const name = STRAIN_DISPLAY[targetStrain];
  /** @type {PenaltyItem[]} */
  const p = [];
  if (len < NT2_TRANSFER_MIN_LEN) {
    pen(p, `${len} ${name}, need ${NT2_TRANSFER_MIN_LEN}+`,
      (NT2_TRANSFER_MIN_LEN - len) * LENGTH_SHORT_COST);
  }
  const otherMajor = targetStrain === Strain.HEARTS ? Strain.SPADES : Strain.HEARTS;
  const otherLen = suitLen(shape, otherMajor);
  if (otherLen > len) {
    pen(p, `Other major is longer (${otherLen} vs ${len})`,
      (otherLen - len) * TRANSFER_SUIT_PREF_COST);
  }
  const expl = len >= NT2_TRANSFER_MIN_LEN
    ? `${len} ${name}: Jacoby Transfer over 2NT`
    : `${len} ${name}: need ${NT2_TRANSFER_MIN_LEN}+ for transfer`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ */
function score2NT3NT(bid, eval_) {
  const { hcp, shape } = eval_;
  const longMajor = Math.max(suitLen(shape, Strain.SPADES), suitLen(shape, Strain.HEARTS));
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${NT2_GAME_MIN_HCP}-${NT2_GAME_MAX_HCP}`,
    hcpDev(hcp, NT2_GAME_MIN_HCP, NT2_GAME_MAX_HCP) * HCP_COST);
  if (longMajor >= STAYMAN_MAJOR_LEN && hcp >= NT2_STAYMAN_MIN_HCP) {
    pen(p, '4-card major: prefer Stayman', MAJOR_AVAIL_NT_COST);
  }
  if (longMajor >= NT2_TRANSFER_MIN_LEN) {
    pen(p, '5-card major: prefer transfer', FIVE_MAJOR_NT_COST);
  }
  const expl = hcpDev(hcp, NT2_GAME_MIN_HCP, NT2_GAME_MAX_HCP) === 0
    ? `${hcp} HCP: raise to 3NT`
    : `${hcp} HCP: outside 3NT range (${NT2_GAME_MIN_HCP}-${NT2_GAME_MAX_HCP})`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ */
function score2NT4NT(bid, eval_) {
  const { hcp, shapeClass } = eval_;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${NT2_SLAM_MIN_HCP}-${NT2_SLAM_MAX_HCP}`,
    hcpDev(hcp, NT2_SLAM_MIN_HCP, NT2_SLAM_MAX_HCP) * HCP_COST);
  pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));
  const expl = hcpDev(hcp, NT2_SLAM_MIN_HCP, NT2_SLAM_MAX_HCP) === 0
    ? `${hcp} HCP: 4NT quantitative slam invitation`
    : `${hcp} HCP: outside quantitative range`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ */
function score2NT6NT(bid, eval_) {
  const { hcp, shapeClass } = eval_;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${NT2_GRAND_MIN_HCP}+`,
    Math.max(0, NT2_GRAND_MIN_HCP - hcp) * HCP_COST);
  pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));
  const expl = hcp >= NT2_GRAND_MIN_HCP
    ? `${hcp} HCP: 6NT slam`
    : `${hcp} HCP: need ${NT2_GRAND_MIN_HCP}+ for slam`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @returns {BidRecommendation}
 */
function score2NTGeneric(bid, eval_) {
  const { hcp, shape, shapeClass } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const minHcp = NT2_STAYMAN_MIN_HCP + Math.max(0, level - 3) * 4;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
  if (strain === Strain.NOTRUMP) {
    pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));
  } else {
    const len = suitLen(shape, strain);
    pen(p, `${len} ${STRAIN_DISPLAY[strain]}, need 5+`,
      Math.max(0, 5 - len) * LENGTH_SHORT_COST);
  }
  const sym = strain === Strain.NOTRUMP ? 'NT' : STRAIN_SYMBOLS[strain];
  const expl = hcp < minHcp
    ? `${hcp} HCP: ${level}${sym} over 2NT needs ${minHcp}+ HCP`
    : `${hcp} HCP: non-standard ${level}${sym} over 2NT`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Responses to 3-level preempts ────────────────────────────────────

const PRE3_PASS_MAX = 14;
const PRE3_RAISE_SUPPORT = 3;
const PRE3_RAISE_ACE_REQ = true;
const PRE3_3NT_MIN = 16;
const PRE3_3NT_MAX = 20;
const PRE3_GAME_SUPPORT = 3;
const PRE3_GAME_MIN = 14;

/**
 * Score every plausible response when partner opened at the 3-level (preempt).
 * @param {Evaluation} eval_
 * @param {ContractBid} partnerBid
 * @returns {BidRecommendation[]}
 */
function getPreempt3ResponseBids(eval_, partnerBid) {
  const ps = partnerBid.strain;
  /** @type {import('../model/bid.js').Bid[]} */
  const bids = [pass()];
  for (let level = partnerBid.level; level <= 7; level++) {
    for (const strain of STRAIN_ORDER) {
      const bid = contractBid(level, strain);
      if (level > partnerBid.level ||
          STRAIN_ORDER.indexOf(strain) > STRAIN_ORDER.indexOf(ps)) {
        bids.push(bid);
      }
    }
  }
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of bids) {
    results.push(scorePre3Response(bid, eval_, partnerBid));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} partnerBid
 * @returns {BidRecommendation}
 */
function scorePre3Response(bid, eval_, partnerBid) {
  if (bid.type === 'pass') return scorePre3Pass(bid, eval_, partnerBid);
  if (bid.type !== 'contract') return scored(bid, 0, '');
  const { level, strain } = bid;
  const ps = partnerBid.strain;
  if (strain === Strain.NOTRUMP && level === 3) return scorePre3NT(bid, eval_);
  if (strain === ps && level === partnerBid.level + 1) return scorePre3Raise(bid, eval_, ps);
  if (strain === ps && isMajor(ps) && level === 4) return scorePre3GameRaise(bid, eval_, ps);
  if (strain === ps && !isMajor(ps) && level === 5) return scorePre3GameRaise(bid, eval_, ps);
  return scorePre3Generic(bid, eval_, partnerBid);
}

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ @param {ContractBid} partnerBid */
function scorePre3Pass(bid, eval_, partnerBid) {
  const { hcp, shape } = eval_;
  const support = suitLen(shape, partnerBid.strain);
  /** @type {PenaltyItem[]} */
  const p = [];
  if (hcp > PRE3_PASS_MAX) {
    pen(p, `${hcp} HCP: game interest`, (hcp - PRE3_PASS_MAX) * HCP_COST);
  }
  if (support >= PRE3_RAISE_SUPPORT && hcp >= 10) {
    pen(p, `${support} ${STRAIN_DISPLAY[partnerBid.strain]} support: consider raising`, 2);
  }
  const expl = hcp > PRE3_PASS_MAX
    ? `${hcp} HCP: too strong to pass partner's preempt`
    : `${hcp} HCP: pass partner's preempt`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ */
function scorePre3NT(bid, eval_) {
  const { hcp, shapeClass } = eval_;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${PRE3_3NT_MIN}-${PRE3_3NT_MAX}`,
    hcpDev(hcp, PRE3_3NT_MIN, PRE3_3NT_MAX) * HCP_COST);
  pen(p, `${shapeClass} (prefer balanced)`, shapePenalty(shapeClass));
  const expl = hcpDev(hcp, PRE3_3NT_MIN, PRE3_3NT_MAX) === 0 && shapeClass === 'balanced'
    ? `${hcp} HCP, balanced: 3NT`
    : shapeClass !== 'balanced'
      ? 'Not balanced for 3NT'
      : `${hcp} HCP: outside 3NT range`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ @param {import('../model/bid.js').Strain} ps */
function scorePre3Raise(bid, eval_, ps) {
  const { hcp, shape } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  const support = suitLen(shape, ps);
  const name = STRAIN_DISPLAY[ps];
  const sym = STRAIN_SYMBOLS[ps];
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${support} ${name}, need ${PRE3_RAISE_SUPPORT}+`,
    Math.max(0, PRE3_RAISE_SUPPORT - support) * LENGTH_SHORT_COST);
  if (hcp > 13) {
    pen(p, `${hcp} HCP: too strong for preemptive raise, consider game`,
      (hcp - 13) * HCP_COST);
  }
  const expl = support >= PRE3_RAISE_SUPPORT
    ? `${support} ${name}: preemptive raise to ${level}${sym}`
    : `${support} ${name}: need ${PRE3_RAISE_SUPPORT}+ to raise`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ @param {import('../model/bid.js').Strain} ps */
function scorePre3GameRaise(bid, eval_, ps) {
  const { hcp, shape } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  const support = suitLen(shape, ps);
  const name = STRAIN_DISPLAY[ps];
  const sym = STRAIN_SYMBOLS[ps];
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${support} ${name}, need ${PRE3_GAME_SUPPORT}+`,
    Math.max(0, PRE3_GAME_SUPPORT - support) * LENGTH_SHORT_COST);
  pen(p, `${hcp} HCP, need ${PRE3_GAME_MIN}+`,
    Math.max(0, PRE3_GAME_MIN - hcp) * HCP_COST);
  const expl = support >= PRE3_GAME_SUPPORT && hcp >= PRE3_GAME_MIN
    ? `${hcp} HCP, ${support} ${name}: game raise to ${level}${sym}`
    : `Need ${PRE3_GAME_MIN}+ HCP and ${PRE3_GAME_SUPPORT}+ support for game`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} partnerBid
 * @returns {BidRecommendation}
 */
function scorePre3Generic(bid, eval_, partnerBid) {
  const { hcp, shape, shapeClass } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const minHcp = PRE3_GAME_MIN + Math.max(0, level - 4) * 4;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
  if (strain === Strain.NOTRUMP) {
    pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));
  } else if (strain !== partnerBid.strain) {
    const len = suitLen(shape, strain);
    pen(p, `${len} ${STRAIN_DISPLAY[strain]}, need 5+`,
      Math.max(0, 5 - len) * LENGTH_SHORT_COST);
  }
  const sym = strain === Strain.NOTRUMP ? 'NT' : STRAIN_SYMBOLS[strain];
  const expl = hcp < minHcp
    ? `${hcp} HCP: ${level}${sym} needs ${minHcp}+ HCP`
    : `${hcp} HCP: ${level}${sym} over preempt`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Responses to 2♣ (strong, artificial, forcing) ────────────────────

/**
 * Score every plausible response when partner opened 2♣ (strong, artificial).
 * @param {Evaluation} eval_
 * @returns {BidRecommendation[]}
 */
function get2CResponseBids(eval_) {
  const candidates = response2CCandidates();
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(score2CResponse(bid, eval_));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

function response2CCandidates() {
  /** @type {import('../model/bid.js').Bid[]} */
  const bids = [pass()];
  for (let level = 2; level <= 7; level++) {
    for (const strain of STRAIN_ORDER) {
      if (level === 2 && strain === Strain.CLUBS) continue;
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
function score2CResponse(bid, eval_) {
  if (bid.type === 'pass') return score2CPass(bid);
  if (bid.type !== 'contract') return scored(bid, 0, '');
  const { level, strain } = bid;
  if (level === 2 && strain === Strain.DIAMONDS) return score2CWaiting(bid, eval_);
  if (level === 2 && strain === Strain.NOTRUMP) return score2CPos2NT(bid, eval_);
  if (level === 2) return score2CPosSuit(bid, eval_);
  if (level === 3 && strain !== Strain.NOTRUMP) return score2CPosSuit(bid, eval_);
  return scoreGeneric2CResponse(bid, eval_);
}

// ── 2♣: Pass (illegal — 2♣ is forcing) ──────────────────────────────

/** @param {import('../model/bid.js').Bid} bid */
function score2CPass(bid) {
  const sym = STRAIN_SYMBOLS[Strain.CLUBS];
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `2${sym} is forcing: cannot pass`, RESP_2C_PASS_COST);
  return scored(bid, deduct(penTotal(p)), `2${sym} is absolutely forcing: must respond`, p);
}

// ── 2♣: 2♦ waiting / negative (0-7 HCP) ─────────────────────────────

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ */
function score2CWaiting(bid, eval_) {
  const { hcp } = eval_;
  const dSym = STRAIN_SYMBOLS[Strain.DIAMONDS];
  /** @type {PenaltyItem[]} */
  const p = [];
  if (hcp >= RESP_2C_POS_MIN) {
    pen(p, `${hcp} HCP: positive response available (${RESP_2C_POS_MIN}+)`,
      (hcp - RESP_2C_NEG_MAX) * RESP_2C_POS_AVAIL_COST);
  }
  const expl = hcp <= RESP_2C_NEG_MAX
    ? `${hcp} HCP: 2${dSym} waiting (0-${RESP_2C_NEG_MAX})`
    : `${hcp} HCP: consider positive response instead of 2${dSym} waiting`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── 2♣: Positive suit response (2♥/2♠ or 3♣/3♦, 8+ HCP, 5+ suit) ──

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ */
function score2CPosSuit(bid, eval_) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];
  const sym = STRAIN_SYMBOLS[strain];
  const cSym = STRAIN_SYMBOLS[Strain.CLUBS];
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${RESP_2C_POS_MIN}+`,
    Math.max(0, RESP_2C_POS_MIN - hcp) * HCP_COST);
  pen(p, `${len} ${name}, need ${RESP_2C_POS_SUIT_LEN}+`,
    Math.max(0, RESP_2C_POS_SUIT_LEN - len) * LENGTH_SHORT_COST);
  pen(p, 'Longer suit available', posSuitPrefCost(strain, shape));

  let expl;
  if (hcp >= RESP_2C_POS_MIN && len >= RESP_2C_POS_SUIT_LEN) {
    expl = `${hcp} HCP with ${len} ${name}: positive ${level}${sym} over 2${cSym}`;
  } else if (len < RESP_2C_POS_SUIT_LEN) {
    expl = `${len} ${name}: need ${RESP_2C_POS_SUIT_LEN}+ for positive suit response`;
  } else {
    expl = `${hcp} HCP: need ${RESP_2C_POS_MIN}+ for positive response`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── 2♣: Positive 2NT (8+ HCP, balanced, no 5-card suit) ─────────────

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ */
function score2CPos2NT(bid, eval_) {
  const { hcp, shapeClass, shape } = eval_;
  const cSym = STRAIN_SYMBOLS[Strain.CLUBS];
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${RESP_2C_POS_MIN}+`,
    Math.max(0, RESP_2C_POS_MIN - hcp) * HCP_COST);
  pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));
  const maxLen = Math.max(...shape);
  if (maxLen >= RESP_2C_POS_SUIT_LEN) {
    pen(p, `Have ${maxLen}-card suit: prefer showing it`, RESP_2C_5CARD_NT_COST);
  }

  let expl;
  if (hcp >= RESP_2C_POS_MIN && shapeClass === 'balanced' && maxLen < RESP_2C_POS_SUIT_LEN) {
    expl = `${hcp} HCP, balanced: positive 2NT over 2${cSym}`;
  } else if (shapeClass !== 'balanced') {
    expl = 'Not balanced for 2NT positive response';
  } else if (maxLen >= RESP_2C_POS_SUIT_LEN) {
    expl = `Have ${maxLen}-card suit: prefer showing it`;
  } else {
    expl = `${hcp} HCP: need ${RESP_2C_POS_MIN}+ for positive 2NT`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── 2♣: Generic (higher-level bids not specifically handled) ─────────

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @returns {BidRecommendation}
 */
function scoreGeneric2CResponse(bid, eval_) {
  const { hcp, shape, shapeClass } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const minHcp = RESP_2C_POS_MIN + (level - 2) * RESP_HCP_PER_LEVEL;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
  if (strain === Strain.NOTRUMP) {
    pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));
  } else {
    const len = suitLen(shape, strain);
    const name = STRAIN_DISPLAY[strain];
    pen(p, `${len} ${name}, need ${RESP_2C_POS_SUIT_LEN}+`,
      Math.max(0, RESP_2C_POS_SUIT_LEN - len) * LENGTH_SHORT_COST);
  }
  const sym = strain === Strain.NOTRUMP ? 'NT' : STRAIN_SYMBOLS[strain];
  const cSym = STRAIN_SYMBOLS[Strain.CLUBS];
  const expl = hcp < minHcp
    ? `${hcp} HCP: ${level}${sym} over 2${cSym} needs ${minHcp}+ HCP`
    : `${hcp} HCP: non-standard ${level}${sym} over 2${cSym}`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Responses to Weak Two (2♦/2♥/2♠) ────────────────────────────────

/**
 * Score every plausible response when partner opened a weak two.
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps - partner's suit
 * @returns {BidRecommendation[]}
 */
function getWeakTwoResponseBids(hand, eval_, ps) {
  const candidates = weakTwoResponseCandidates(ps);
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(scoreWeakTwoResponse(bid, hand, eval_, ps));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

function weakTwoResponseCandidates(ps) {
  /** @type {import('../model/bid.js').Bid[]} */
  const bids = [pass()];
  for (let level = 2; level <= 7; level++) {
    for (const strain of STRAIN_ORDER) {
      if (level === 2 && !ranksAbove(strain, ps)) continue;
      bids.push(contractBid(level, strain));
    }
  }
  return bids;
}

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 * @returns {BidRecommendation}
 */
function scoreWeakTwoResponse(bid, hand, eval_, ps) {
  if (bid.type === 'pass') return scoreWTPass(bid, eval_, ps);
  if (bid.type !== 'contract') return scored(bid, 0, '');
  const { level, strain } = bid;
  if (level === 2 && strain === Strain.NOTRUMP) return scoreWT2NT(bid, hand, eval_, ps);
  if (level === 2) return scoreWTNewSuit(bid, hand, eval_, ps);
  if (level === 3 && strain === ps) return scoreWTSimpleRaise(bid, eval_, ps);
  if (level === 3 && strain === Strain.NOTRUMP) return scoreWT3NT(bid, eval_, ps);
  if (level === 3) return scoreWTNewSuit(bid, hand, eval_, ps);
  if (level === 4 && strain === ps && isMajor(ps)) return scoreWTGameRaise(bid, eval_, ps);
  if (level >= 4 && strain !== ps && strain !== Strain.NOTRUMP) return scoreWTNewSuit(bid, hand, eval_, ps);
  return scoreGenericWTResponse(bid, eval_, ps);
}

// ── Weak Two: Pass ───────────────────────────────────────────────────

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ @param {import('../model/bid.js').Strain} ps */
function scoreWTPass(bid, eval_, ps) {
  const { hcp, shape } = eval_;
  const support = suitLen(shape, ps);
  const name = STRAIN_DISPLAY[ps];
  /** @type {PenaltyItem[]} */
  const p = [];
  if (hcp > WT_PASS_MAX) {
    pen(p, `${hcp} HCP: game interest (${WT_PASS_MAX + 1}+)`, (hcp - WT_PASS_MAX) * HCP_COST);
  }
  if (support >= WT_RAISE_SUPPORT && hcp <= WT_RAISE_MAX_HCP) {
    pen(p, `${support} ${name} support: consider raising`, WT_SUPPORT_PASS_COST);
  }

  let expl;
  if (hcp > WT_PASS_MAX) {
    expl = `${hcp} HCP: too strong to pass (consider game)`;
  } else if (support >= WT_RAISE_SUPPORT) {
    expl = `${support} ${name} support: consider preemptive raise`;
  } else {
    expl = `${hcp} HCP, no fit: pass partner's weak two`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Weak Two: 2NT Feature Ask (14-16 HCP, game interest) ────────────

/** @param {import('../model/bid.js').Bid} bid @param {Hand} hand @param {Evaluation} eval_ @param {import('../model/bid.js').Strain} ps */
function scoreWT2NT(bid, hand, eval_, ps) {
  const { hcp, shape } = eval_;
  const support = suitLen(shape, ps);
  const name = STRAIN_DISPLAY[ps];
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${WT_2NT_MIN}-${WT_2NT_MAX}`,
    hcpDev(hcp, WT_2NT_MIN, WT_2NT_MAX) * HCP_COST);
  if (support >= WT_RAISE_SUPPORT + 2) {
    pen(p, `${support} ${name}: fit is clear, prefer raising`, WT_LONG_SUPPORT_2NT_COST);
  }
  const ssStrain = findSelfSufficientSuit(hand, ps);
  if (ssStrain) {
    pen(p, `Self-sufficient ${STRAIN_DISPLAY[ssStrain]} suit: bid it directly`, 5);
  }

  let expl;
  if (ssStrain) {
    expl = `Have self-sufficient ${STRAIN_DISPLAY[ssStrain]}: prefer bidding own suit`;
  } else if (hcp >= WT_2NT_MIN && hcp <= WT_2NT_MAX) {
    expl = `${hcp} HCP: 2NT feature ask (game interest)`;
  } else if (hcp < WT_2NT_MIN) {
    expl = `${hcp} HCP: need ${WT_2NT_MIN}+ for 2NT feature ask`;
  } else {
    expl = `${hcp} HCP: above 2NT range, consider bidding game`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Weak Two: Simple Raise (3-level, preemptive, 3+ support) ────────

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ @param {import('../model/bid.js').Strain} ps */
function scoreWTSimpleRaise(bid, eval_, ps) {
  const { hcp, shape } = eval_;
  const support = suitLen(shape, ps);
  const name = STRAIN_DISPLAY[ps];
  const sym = STRAIN_SYMBOLS[ps];
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${support} ${name}, need ${WT_RAISE_SUPPORT}+`,
    Math.max(0, WT_RAISE_SUPPORT - support) * LENGTH_SHORT_COST);
  if (hcp > WT_RAISE_MAX_HCP) {
    pen(p, `${hcp} HCP: too strong for preemptive raise`,
      (hcp - WT_RAISE_MAX_HCP) * HCP_COST);
  }

  let expl;
  if (support < WT_RAISE_SUPPORT) {
    expl = `${support} ${name}: need ${WT_RAISE_SUPPORT}+ to raise`;
  } else if (hcp > WT_RAISE_MAX_HCP) {
    expl = `${hcp} HCP: too strong for preemptive 3${sym}, consider game`;
  } else {
    expl = `${support} ${name} support: preemptive raise to 3${sym}`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Weak Two: 3NT (15-17 HCP, balanced) ─────────────────────────────

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ @param {import('../model/bid.js').Strain} _ps */
function scoreWT3NT(bid, eval_, _ps) {
  const { hcp, shapeClass } = eval_;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${WT_3NT_MIN}-${WT_3NT_MAX}`,
    hcpDev(hcp, WT_3NT_MIN, WT_3NT_MAX) * HCP_COST);
  pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));

  let expl;
  if (hcp >= WT_3NT_MIN && hcp <= WT_3NT_MAX && shapeClass === 'balanced') {
    expl = `${hcp} HCP, balanced: 3NT`;
  } else if (shapeClass !== 'balanced') {
    expl = 'Not balanced for 3NT';
  } else {
    expl = `${hcp} HCP: outside 3NT range (${WT_3NT_MIN}-${WT_3NT_MAX})`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Weak Two: New Suit Forcing (16+ HCP, 5+ suit) ───────────────────

/** @param {import('../model/bid.js').Bid} bid @param {Hand} hand @param {Evaluation} eval_ @param {import('../model/bid.js').Strain} _ps */
function scoreWTNewSuit(bid, hand, eval_, _ps) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];
  const sym = STRAIN_SYMBOLS[strain];
  const selfSuff = isSelfSufficientSuit(hand, strain);
  const minHcp = selfSuff ? 10 : WT_NEW_SUIT_MIN;
  const minLen = selfSuff ? 7 : WT_NEW_SUIT_LEN;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${minHcp}+`,
    Math.max(0, minHcp - hcp) * HCP_COST);
  pen(p, `${len} ${name}, need ${minLen}+`,
    Math.max(0, minLen - len) * LENGTH_SHORT_COST);
  if (!selfSuff && level >= 4) {
    pen(p, `Level ${level}: high for non-self-sufficient suit`, (level - 3) * 3);
  }

  let expl;
  if (selfSuff && hcp >= minHcp) {
    expl = `${hcp} HCP with self-sufficient ${len} ${name}: ${level}${sym}`;
  } else if (hcp >= minHcp && len >= minLen) {
    expl = `${hcp} HCP with ${len} ${name}: ${level}${sym} forcing`;
  } else if (hcp < minHcp) {
    expl = `${hcp} HCP: need ${minHcp}+ for new suit`;
  } else {
    expl = `${len} ${name}: need ${minLen}+ for new suit`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Weak Two: Game Raise (4♥/4♠, 14+ HCP or 5+ support) ────────────

/** @param {import('../model/bid.js').Bid} bid @param {Evaluation} eval_ @param {import('../model/bid.js').Strain} ps */
function scoreWTGameRaise(bid, eval_, ps) {
  const { hcp, shape } = eval_;
  const support = suitLen(shape, ps);
  const name = STRAIN_DISPLAY[ps];
  const sym = STRAIN_SYMBOLS[ps];
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${support} ${name}, need ${WT_GAME_SUPPORT}+`,
    Math.max(0, WT_GAME_SUPPORT - support) * LENGTH_SHORT_COST);
  const minHcp = support >= WT_GAME_PREEMPT_SUPPORT
    ? WT_GAME_PREEMPT_MIN_HCP
    : WT_GAME_MIN_HCP;
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);

  let expl;
  if (support < WT_GAME_SUPPORT) {
    expl = `${support} ${name}: need ${WT_GAME_SUPPORT}+ for game raise`;
  } else if (hcp < minHcp) {
    expl = `${hcp} HCP: need ${minHcp}+ for game raise to 4${sym}`;
  } else if (support >= WT_GAME_PREEMPT_SUPPORT) {
    expl = `${support} ${name} support: preemptive 4${sym}`;
  } else {
    expl = `${hcp} HCP with ${support} ${name}: game raise to 4${sym}`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Weak Two: Generic (unhandled bids over weak two) ─────────────────

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} ps
 * @returns {BidRecommendation}
 */
function scoreGenericWTResponse(bid, eval_, ps) {
  const { hcp, shape, shapeClass } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const minHcp = WT_2NT_MIN + Math.max(0, level - 3) * RESP_HCP_PER_LEVEL;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
  if (strain === Strain.NOTRUMP) {
    pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));
  } else if (strain === ps) {
    const support = suitLen(shape, ps);
    pen(p, `${support} support, need ${WT_RAISE_SUPPORT}+`,
      Math.max(0, WT_RAISE_SUPPORT - support) * LENGTH_SHORT_COST);
  } else {
    const len = suitLen(shape, strain);
    const name = STRAIN_DISPLAY[strain];
    pen(p, `${len} ${name}, need ${WT_NEW_SUIT_LEN}+`,
      Math.max(0, WT_NEW_SUIT_LEN - len) * LENGTH_SHORT_COST);
  }
  const sym = strain === Strain.NOTRUMP ? 'NT' : STRAIN_SYMBOLS[strain];
  const expl = hcp < minHcp
    ? `${hcp} HCP: ${level}${sym} over weak two needs ${minHcp}+ HCP`
    : `${hcp} HCP: non-standard ${level}${sym} over weak two`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Self-sufficient suit detection ───────────────────────────────────

/**
 * Check if a suit is self-sufficient: 7+ cards with 3+ of the top 5 honors.
 * @param {Hand} hand
 * @param {import('../model/bid.js').Strain} strain
 * @returns {boolean}
 */
function isSelfSufficientSuit(hand, strain) {
  const cards = hand.cards.filter(c => c.suit === /** @type {any} */ (strain));
  if (cards.length < 7) return false;
  const topHonors = cards.filter(c => c.rank >= Rank.TEN).length;
  return topHonors >= 3;
}

/**
 * Find a self-sufficient suit (not partner's suit) if one exists.
 * @param {Hand} hand
 * @param {import('../model/bid.js').Strain} partnerStrain
 * @returns {import('../model/bid.js').Strain | null}
 */
function findSelfSufficientSuit(hand, partnerStrain) {
  for (const strain of SHAPE_STRAINS) {
    if (strain === partnerStrain) continue;
    if (isSelfSufficientSuit(hand, strain)) return strain;
  }
  return null;
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

/** Does the hand have a 5+ card suit biddable at the 2-level (below partner's suit)? */
function hasSuitAt2(shape, partnerStrain) {
  for (const strain of SHAPE_STRAINS) {
    if (strain === partnerStrain) continue;
    if (!ranksAbove(strain, partnerStrain) && suitLen(shape, strain) >= 5) {
      return true;
    }
  }
  return false;
}

/**
 * Penalty for bidding a suit that isn't the longest when responding positively to 2♣.
 * All suits are candidates since 2♣ is artificial.
 * @param {import('../model/bid.js').Strain} strain
 * @param {number[]} shape
 */
function posSuitPrefCost(strain, shape) {
  let maxLen = 0;
  for (const s of SHAPE_STRAINS) {
    if (suitLen(shape, s) > maxLen) maxLen = suitLen(shape, s);
  }
  const thisLen = suitLen(shape, strain);
  if (thisLen >= RESP_2C_POS_SUIT_LEN && thisLen < maxLen && maxLen >= RESP_2C_POS_SUIT_LEN) {
    return (maxLen - thisLen) * SUIT_PREF_COST;
  }
  return 0;
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
 * Count unbid suits (excluding partner's suit) that lack a stopper.
 * @param {Hand} hand
 * @param {import('../model/bid.js').Strain} partnerStrain
 * @returns {number}
 */
function countUnstoppedSuits(hand, partnerStrain) {
  let count = 0;
  for (const strain of SHAPE_STRAINS) {
    if (strain === partnerStrain) continue;
    if (!hasStopper(hand, strain)) count++;
  }
  return count;
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
 * With 5+ equal-length suits, SAYC says bid the higher-ranking first
 * so you can show the lower suit on the rebid. Penalizes the lower suit.
 * @param {import('../model/bid.js').Strain} strain
 * @param {number[]} shape
 * @param {import('../model/bid.js').Strain} ps
 */
function equalLenHigherSuitCost(strain, shape, ps) {
  const thisLen = suitLen(shape, strain);
  if (thisLen < 5) return 0;
  for (const s of SHAPE_STRAINS) {
    if (s === ps || s === strain) continue;
    if (suitLen(shape, s) === thisLen && ranksAbove(s, strain)) {
      return SUIT_PREF_COST;
    }
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

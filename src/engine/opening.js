import { contractBid, pass, Strain, STRAIN_ORDER, STRAIN_SYMBOLS } from '../model/bid.js';
import { Rank } from '../model/card.js';
import { pen, penTotal } from './penalty.js';

/**
 * @typedef {import('../model/hand.js').Hand} Hand
 * @typedef {import('./evaluate.js').Evaluation} Evaluation
 * @typedef {import('./penalty.js').PenaltyItem} PenaltyItem
 * @typedef {{
 *   bid: import('../model/bid.js').Bid,
 *   priority: number,
 *   explanation: string,
 *   penalties: PenaltyItem[],
 * }} BidRecommendation
 */

// ── Scoring costs ────────────────────────────────────────────────────
// score = MAX_SCORE - sum(deviation * cost)

const MAX_SCORE = 10;

// Per-unit rates (multiplied by the size of the deviation)
const HCP_COST = 2;                // per HCP outside the ideal range
const LENGTH_SHORT_COST = 3;       // per card below minimum suit length
const LENGTH_LONG_COST = 2;        // per card above maximum suit length
const SUIT_MISMATCH_COST = 1.5;    // per card the best suit is longer than chosen
const LONG_SUIT_PASS_COST = 2.5;   // per card above threshold when passing
const PREEMPT_LEVEL_COST = 4;      // per level away from ideal preempt level

// Fixed costs (applied once when the condition is true)
const SHAPE_SEMI_COST = 6;        // semi-balanced when balanced required
const SHAPE_UNBAL_COST = 10;       // unbalanced when balanced required
const SUIT_QUALITY_COST = 3;       // weak two suit lacks honors
const SUIT_TIEBREAK_COST = 1;      // wrong suit at equal length (convention)
const NT_PREF_COST = 3;           // balanced in 1NT range, opening a suit instead
const NT_2_PREF_COST = 5;          // balanced in 2NT range, opening a suit instead
const MAJOR_NT_DISCOUNT = 1.5;     // discount for 5+ major as alternative to 1NT
const RULE_15_COST = 6;           // opening in 4th seat without Rule of 15

// ── SAYC thresholds ──────────────────────────────────────────────────

const STRONG_2C_MIN = 22;
const OPEN_1NT_MIN = 15;
const OPEN_1NT_MAX = 17;
const OPEN_2NT_MIN = 20;
const OPEN_2NT_MAX = 21;
const OPEN_1_MIN = 13;
const OPEN_1_MAX = 21;
const BORDERLINE_MIN = 11;
const WEAK_TWO_MIN = 5;
const WEAK_TWO_MAX = 11;
const PREEMPT_MAX_HCP = 10;
const PASS_HCP_LIMIT = 12;
const PASS_SUIT_LIMIT = 5;

const MAJOR_OPEN_MIN = 5;
const MINOR_OPEN_MIN = 3;
const WEAK_TWO_LENGTH = 6;
const PREEMPT_MIN_LENGTH = 7;
const PREEMPT_LEVEL_OFFSET = 4;
const MAX_PREEMPT_LEVEL = 4;
const WEAK_TWO_MIN_HONORS = 2;

const LONG_SUIT_LOW_OPEN_COST = 3;  // per card above 7 when opening at 1-level
const STRONG_PREEMPT_HCP_BONUS = 6; // HCP allowance for 8+ card preempts
const WEAK_TWO_SIDE_MAJOR_COST = 2; // per card in side 4+ card major

const RULE_OF_20 = 20;
const RULE_OF_15 = 15;

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
 * Score every plausible opening bid against the hand.
 * Each bid's score = MAX_SCORE minus penalties for deviations from ideal.
 * Returns all scored bids sorted best-first (scores may be negative).
 * @param {Hand} hand
 * @param {Evaluation} evaluation
 * @param {number} seatPos -- 1 = dealer through 4 = fourth seat
 * @returns {BidRecommendation[]}
 */
export function getOpeningBids(hand, evaluation, seatPos) {
  const candidates = openingCandidates();
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(scoreBid(bid, hand, evaluation, seatPos));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

/** All contract bids (levels 1-7) plus Pass. */
function openingCandidates() {
  /** @type {import('../model/bid.js').Bid[]} */
  const bids = [pass()];
  for (let level = 1; level <= 7; level++) {
    for (const strain of STRAIN_ORDER) {
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
 * @param {number} seatPos
 * @returns {BidRecommendation}
 */
function scoreBid(bid, hand, eval_, seatPos) {
  if (bid.type === 'pass') return scorePass(bid, eval_, seatPos);
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;
  if (level === 1 && strain === Strain.NOTRUMP) return score1NT(bid, eval_);
  if (level === 1) return score1Suit(bid, eval_, seatPos);
  if (level === 2 && strain === Strain.CLUBS) return scoreStrong2C(bid, eval_);
  if (level === 2 && strain === Strain.NOTRUMP) return score2NT(bid, eval_);
  if (level === 2) return scoreWeakTwo(bid, hand, eval_, seatPos);
  if (strain === Strain.NOTRUMP) return scoreHighNT(bid, eval_);
  return scorePreempt(bid, eval_, seatPos);
}

// ── Generic penalty helpers ──────────────────────────────────────────

/** Distance in HCP from the ideal range (0 if within range). */
function hcpDev(hcp, min, max) {
  if (hcp < min) return min - hcp;
  if (hcp > max) return hcp - max;
  return 0;
}

/** Shape penalty when balanced is required. */
function shapeCost(shapeClass) {
  if (shapeClass === 'semi-balanced') return SHAPE_SEMI_COST;
  if (shapeClass === 'unbalanced') return SHAPE_UNBAL_COST;
  return 0;
}

/** Penalty for opening a suit that isn't the best choice. */
function suitMismatchCost(strain, shape) {
  const best = selectOpeningSuit(shape);
  if (strain === best) return 0;
  const diff = shape[SHAPE_STRAINS.indexOf(best)] - shape[SHAPE_STRAINS.indexOf(strain)];
  return diff > 0 ? diff * SUIT_MISMATCH_COST : SUIT_TIEBREAK_COST;
}

/** Penalty for opening a suit when 1NT/2NT better describes the hand. */
function ntPrefCost(hcp, shapeClass, isMajor, suitLen) {
  if (shapeClass !== 'balanced') return 0;
  if (hcp >= OPEN_1NT_MIN && hcp <= OPEN_1NT_MAX) {
    return (isMajor && suitLen >= MAJOR_OPEN_MIN)
      ? NT_PREF_COST - MAJOR_NT_DISCOUNT
      : NT_PREF_COST;
  }
  if (hcp >= OPEN_2NT_MIN && hcp <= OPEN_2NT_MAX) return NT_2_PREF_COST;
  return 0;
}

/**
 * Effective minimum HCP for a 1-level opening.
 * Rule of 20 lowers the threshold from 13 to 11 for distributional hands.
 */
function adjusted1HcpMin(hcp, shape) {
  if (hcp >= OPEN_1_MIN || hcp < BORDERLINE_MIN) return OPEN_1_MIN;
  const sorted = [...shape].sort((a, b) => b - a);
  return (hcp + sorted[0] + sorted[1] >= RULE_OF_20) ? BORDERLINE_MIN : OPEN_1_MIN;
}

/** Convert penalty to priority score (can go negative). */
function deduct(penalty) {
  return Math.round((MAX_SCORE - penalty) * 10) / 10;
}

// ── Pass ─────────────────────────────────────────────────────────────

function scorePass(bid, eval_, seatPos) {
  const { hcp, shape } = eval_;
  /** @type {PenaltyItem[]} */
  const p = [];
  const r15Skip = seatPos === 4 && hcp >= OPEN_1_MIN && !meetsRuleOf15(hcp, shape);
  if (!r15Skip) {
    pen(p, `${hcp} HCP above pass limit (${PASS_HCP_LIMIT})`, Math.max(0, hcp - PASS_HCP_LIMIT) * HCP_COST);
  }
  if (seatPos !== 4) {
    const effLen = biddableLongSuitLen(shape);
    pen(p, `${effLen}-card suit worth bidding`, Math.max(0, effLen - PASS_SUIT_LIMIT) * LONG_SUIT_PASS_COST);
  }
  return scored(bid, deduct(penTotal(p)), passExplanation(hcp, shape, r15Skip, penTotal(p)), p);
}

function passExplanation(hcp, shape, r15Skip, penalty) {
  if (r15Skip) return `4th seat, Rule of 15 not met (${hcp + shape[0]}): pass`;
  if (penalty < 0.5) return `${hcp} HCP: correct to pass`;
  const effLen = biddableLongSuitLen(shape);
  if (effLen > PASS_SUIT_LIMIT && hcp <= PASS_HCP_LIMIT) {
    return `${hcp} HCP but ${effLen}-card suit: consider bidding`;
  }
  return `${hcp} HCP: ${hcp - PASS_HCP_LIMIT} above pass threshold`;
}

// ── 1NT ──────────────────────────────────────────────────────────────

function score1NT(bid, eval_) {
  const { hcp, shapeClass } = eval_;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${OPEN_1NT_MIN}-${OPEN_1NT_MAX}`, hcpDev(hcp, OPEN_1NT_MIN, OPEN_1NT_MAX) * HCP_COST);
  pen(p, `${shapeClass} (need balanced)`, shapeCost(shapeClass));
  return scored(bid, deduct(penTotal(p)), ntExplanation(hcp, shapeClass, OPEN_1NT_MIN, OPEN_1NT_MAX, '1NT'), p);
}

// ── 2NT ──────────────────────────────────────────────────────────────

function score2NT(bid, eval_) {
  const { hcp, shapeClass } = eval_;
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${OPEN_2NT_MIN}-${OPEN_2NT_MAX}`, hcpDev(hcp, OPEN_2NT_MIN, OPEN_2NT_MAX) * HCP_COST);
  pen(p, `${shapeClass} (need balanced)`, shapeCost(shapeClass));
  return scored(bid, deduct(penTotal(p)), ntExplanation(hcp, shapeClass, OPEN_2NT_MIN, OPEN_2NT_MAX, '2NT'), p);
}

function ntExplanation(hcp, shapeClass, min, max, label) {
  if (shapeClass !== 'balanced') return `Hand is not balanced for ${label}`;
  const dev = hcpDev(hcp, min, max);
  if (dev === 0) return `${hcp} HCP, balanced: ${label} opening`;
  const dir = hcp < min ? 'below' : 'above';
  return `${hcp} HCP: ${dev} ${dir} ${label} range (${min}-${max})`;
}

// ── Strong 2♣ ────────────────────────────────────────────────────────

function scoreStrong2C(bid, eval_) {
  const { hcp } = eval_;
  const sym = STRAIN_SYMBOLS[Strain.CLUBS];
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${STRONG_2C_MIN}+`, Math.max(0, STRONG_2C_MIN - hcp) * HCP_COST);
  const expl = hcp >= STRONG_2C_MIN
    ? `${hcp} HCP: strong artificial 2${sym} opening`
    : `${hcp} HCP: ${STRONG_2C_MIN - hcp} below 2${sym} threshold (${STRONG_2C_MIN}+)`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── 1 of a Suit ──────────────────────────────────────────────────────

function score1Suit(bid, eval_, seatPos) {
  const { hcp, shape, shapeClass } = eval_;
  const { strain } = bid;
  const idx = SHAPE_STRAINS.indexOf(strain);
  const len = shape[idx];
  const isMajor = idx <= 1;
  const minLen = isMajor ? MAJOR_OPEN_MIN : MINOR_OPEN_MIN;
  const hcpMin = adjusted1HcpMin(hcp, shape);
  const name = STRAIN_DISPLAY[strain];

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${len} ${name}, need ${minLen}+`, Math.max(0, minLen - len) * LENGTH_SHORT_COST);
  pen(p, `${hcp} HCP, need ${hcpMin}-${OPEN_1_MAX}`, hcpDev(hcp, hcpMin, OPEN_1_MAX) * HCP_COST);
  pen(p, `${STRAIN_DISPLAY[selectOpeningSuit(shape)]} is better suit`, suitMismatchCost(strain, shape));
  pen(p, 'Balanced in NT range', ntPrefCost(hcp, shapeClass, isMajor, len));
  if (seatPos === 4 && hcp >= hcpMin && !meetsRuleOf15(hcp, shape)) {
    pen(p, '4th seat: Rule of 15 not met', RULE_15_COST);
  }
  if (len >= 8) {
    pen(p, `${len}-card suit: consider opening higher`, (len - 7) * LONG_SUIT_LOW_OPEN_COST);
  }

  return scored(bid, deduct(penTotal(p)), suit1Explanation(hcp, len, strain, shape, shapeClass), p);
}

function suit1Explanation(hcp, len, strain, shape, shapeClass) {
  const sym = STRAIN_SYMBOLS[strain];
  const name = STRAIN_DISPLAY[strain];
  const isMajor = SHAPE_STRAINS.indexOf(strain) <= 1;
  const minLen = isMajor ? MAJOR_OPEN_MIN : MINOR_OPEN_MIN;

  if (len < minLen) return `${len} ${name}: need ${minLen}+ for 1${sym}`;
  if (hcp >= STRONG_2C_MIN) return `${hcp} HCP: too strong, open 2${STRAIN_SYMBOLS[Strain.CLUBS]}`;
  if (hcp < BORDERLINE_MIN) return `${hcp} HCP: not enough to open`;

  const best = selectOpeningSuit(shape);
  if (strain !== best) return `${len} ${name}: ${STRAIN_DISPLAY[best]} is a better suit`;
  if (shapeClass === 'balanced' && hcp >= OPEN_1NT_MIN && hcp <= OPEN_1NT_MAX) {
    return `${hcp} HCP, balanced: 1NT available`;
  }
  if (shapeClass === 'balanced' && hcp >= OPEN_2NT_MIN) return `${hcp} HCP, balanced: 2NT available`;
  return `${hcp} HCP with ${len} ${name}: open 1${sym}`;
}

// ── Weak Two ─────────────────────────────────────────────────────────

function scoreWeakTwo(bid, hand, eval_, seatPos) {
  const { hcp, shape } = eval_;
  const { strain } = bid;
  const idx = SHAPE_STRAINS.indexOf(strain);
  const len = shape[idx];
  const name = STRAIN_DISPLAY[strain];

  if (seatPos === 4) return scored(bid, 0, 'Weak twos not used in 4th seat');

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${WEAK_TWO_MIN}-${WEAK_TWO_MAX}`, hcpDev(hcp, WEAK_TWO_MIN, WEAK_TWO_MAX) * HCP_COST);
  pen(p, `${len} ${name}, need exactly 6`, len < WEAK_TWO_LENGTH ? (WEAK_TWO_LENGTH - len) * LENGTH_SHORT_COST : 0);
  pen(p, `${len} ${name}, too long for weak two`, len > WEAK_TWO_LENGTH ? (len - WEAK_TWO_LENGTH) * LENGTH_LONG_COST : 0);
  if (len === WEAK_TWO_LENGTH && !hasSuitQuality(hand, strain)) pen(p, 'Poor suit quality', SUIT_QUALITY_COST);

  const sideMajorLen = Math.max(
    strain !== Strain.SPADES ? shape[0] : 0,
    strain !== Strain.HEARTS ? shape[1] : 0
  );
  if (sideMajorLen >= 4) {
    pen(p, `${sideMajorLen}-card side major`, sideMajorLen * WEAK_TWO_SIDE_MAJOR_COST);
  }

  return scored(bid, deduct(penTotal(p)), weakTwoExplanation(hcp, len, strain, penTotal(p), sideMajorLen), p);
}

function weakTwoExplanation(hcp, len, strain, penalty, sideMajorLen) {
  const sym = STRAIN_SYMBOLS[strain];
  const name = STRAIN_DISPLAY[strain];
  if (sideMajorLen >= 4) {
    return `${sideMajorLen}-card side major: avoid weak 2${sym}`;
  }
  if (penalty < 0.5) return `${hcp} HCP with good 6-card ${name}: weak 2${sym}`;
  if (len !== WEAK_TWO_LENGTH) {
    return `${len} ${name}: need exactly 6 for weak 2${sym}`;
  }
  const dev = hcpDev(hcp, WEAK_TWO_MIN, WEAK_TWO_MAX);
  if (dev > 0) return `${hcp} HCP: ${dev} outside weak two range (${WEAK_TWO_MIN}-${WEAK_TWO_MAX})`;
  return `Suit quality is poor for weak 2${sym}`;
}

// ── High NT (3NT+ opening) ───────────────────────────────────────────

/** HCP per level increment, derived from existing 1NT/2NT thresholds. */
const NT_HCP_PER_LEVEL = OPEN_2NT_MIN - OPEN_1NT_MIN;
const NT_HCP_RANGE = OPEN_1NT_MAX - OPEN_1NT_MIN;

function scoreHighNT(bid, eval_) {
  const { hcp, shapeClass } = eval_;
  const { level } = bid;
  const minHcp = OPEN_1NT_MIN + (level - 1) * NT_HCP_PER_LEVEL;
  const maxHcp = minHcp + NT_HCP_RANGE;

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, need ${minHcp}-${maxHcp}`, hcpDev(hcp, minHcp, maxHcp) * HCP_COST);
  pen(p, `${shapeClass} (need balanced)`, shapeCost(shapeClass));
  return scored(bid, deduct(penTotal(p)), highNTExpl(hcp, shapeClass, level, minHcp, maxHcp), p);
}

function highNTExpl(hcp, shapeClass, level, minHcp, maxHcp) {
  if (shapeClass !== 'balanced') return `Not balanced for ${level}NT opening`;
  const dev = hcpDev(hcp, minHcp, maxHcp);
  if (dev === 0) return `${hcp} HCP, balanced: ${level}NT opening`;
  const dir = hcp < minHcp ? 'below' : 'above';
  return `${hcp} HCP: ${dev} ${dir} ${level}NT range (${minHcp}-${maxHcp})`;
}

// ── Preempt (suit bids at 3+ level) ─────────────────────────────────

function scorePreempt(bid, eval_, seatPos) {
  const { hcp, shape } = eval_;
  const { level, strain } = bid;
  const len = shape[SHAPE_STRAINS.indexOf(strain)];
  const name = STRAIN_DISPLAY[strain];

  if (seatPos === 4) return scored(bid, 0, 'Preempts not used in 4th seat');

  const hcpMax = len >= 8 ? PREEMPT_MAX_HCP + STRONG_PREEMPT_HCP_BONUS : PREEMPT_MAX_HCP;

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${hcp} HCP, max ${hcpMax} for preempt`, Math.max(0, hcp - hcpMax) * HCP_COST);
  const ideal = idealPreemptLevel(len);
  if (ideal === 0) {
    pen(p, `${len} ${name}, need ${PREEMPT_MIN_LENGTH}+`, (PREEMPT_MIN_LENGTH - len) * LENGTH_SHORT_COST);
    pen(p, `Level ${level} with short suit`, level * PREEMPT_LEVEL_COST);
  } else {
    pen(p, `Level ${level} vs ideal ${ideal}`, Math.abs(level - ideal) * PREEMPT_LEVEL_COST);
  }
  return scored(bid, deduct(penTotal(p)), preemptExplanation(hcp, len, level, ideal, strain, hcpMax), p);
}

function idealPreemptLevel(suitLen) {
  if (suitLen < PREEMPT_MIN_LENGTH) return 0;
  return Math.min(suitLen - PREEMPT_LEVEL_OFFSET, MAX_PREEMPT_LEVEL);
}

function preemptExplanation(hcp, len, level, ideal, strain, hcpMax) {
  const name = STRAIN_DISPLAY[strain];
  const sym = STRAIN_SYMBOLS[strain];
  if (ideal === 0) return `${len} ${name}: too short for ${level}${sym}`;
  if (level !== ideal) return `${len}-card ${name}: ${ideal}${sym} is more standard than ${level}${sym}`;
  if (hcp > hcpMax) {
    return `${hcp} HCP is too strong for a preempt ${level}${sym}`;
  }
  if (len >= 8 && hcp > PREEMPT_MAX_HCP) {
    return `${hcp} HCP with ${len}-card ${name}: strong ${level}${sym} opening`;
  }
  return `${hcp} HCP with ${len}-card ${name}: ${level}${sym} preempt`;
}

// ── Suit Selection ───────────────────────────────────────────────────

/**
 * Select the best suit to open at the 1-level (SAYC 5-card major system).
 * Majors require 5+ cards; minors require 3+.
 * @param {number[]} shape -- [spades, hearts, diamonds, clubs]
 * @returns {import('../model/bid.js').Strain}
 */
export function selectOpeningSuit(shape) {
  const candidates = buildSuitCandidates(shape);
  if (candidates.length === 0) return Strain.CLUBS;
  const maxLen = Math.max(...candidates.map(c => c.len));
  const tied = candidates.filter(c => c.len === maxLen);
  if (tied.length === 1) return tied[0].strain;
  return breakTie(tied, maxLen);
}

/**
 * @param {number[]} shape
 * @returns {{ strain: import('../model/bid.js').Strain, len: number }[]}
 */
function buildSuitCandidates(shape) {
  /** @type {{ strain: import('../model/bid.js').Strain, len: number }[]} */
  const out = [];
  if (shape[0] >= MAJOR_OPEN_MIN) out.push({ strain: Strain.SPADES, len: shape[0] });
  if (shape[1] >= MAJOR_OPEN_MIN) out.push({ strain: Strain.HEARTS, len: shape[1] });
  if (shape[2] >= MINOR_OPEN_MIN) out.push({ strain: Strain.DIAMONDS, len: shape[2] });
  if (shape[3] >= MINOR_OPEN_MIN) out.push({ strain: Strain.CLUBS, len: shape[3] });
  return out;
}

/**
 * Tiebreak for equally-long suits.
 * Two minors at length 3 -> clubs; at length 4+ -> diamonds (SAYC).
 * Otherwise higher-ranking strain wins.
 * @param {{ strain: import('../model/bid.js').Strain, len: number }[]} tied
 * @param {number} maxLen
 * @returns {import('../model/bid.js').Strain}
 */
function breakTie(tied, maxLen) {
  const minors = tied.filter(
    t => t.strain === Strain.DIAMONDS || t.strain === Strain.CLUBS
  );
  if (minors.length === 2 && tied.length === 2) {
    return maxLen <= 3 ? Strain.CLUBS : Strain.DIAMONDS;
  }
  return tied.sort(
    (a, b) => STRAIN_ORDER.indexOf(b.strain) - STRAIN_ORDER.indexOf(a.strain)
  )[0].strain;
}

// ── Utilities ────────────────────────────────────────────────────────

/**
 * Does the suit contain enough honors (10+) for a weak two opening?
 * @param {Hand} hand
 * @param {import('../model/bid.js').Strain} strain
 * @returns {boolean}
 */
function hasSuitQuality(hand, strain) {
  const suitCards = hand.cards.filter(
    c => c.suit === /** @type {any} */ (strain)
  );
  let honors = 0;
  for (const card of suitCards) {
    if (card.rank >= Rank.TEN) honors++;
  }
  return honors >= WEAK_TWO_MIN_HONORS;
}

/**
 * Effective longest suit length for the pass penalty.
 * 2♣ is artificial (strong) in SAYC, so a 6-card club suit below
 * preempt length doesn't open up a weak-two option the way other
 * suits do.  Use the longest non-club suit in that case.
 * @param {number[]} shape -- [spades, hearts, diamonds, clubs]
 * @returns {number}
 */
function biddableLongSuitLen(shape) {
  const maxLen = Math.max(...shape);
  if (shape[3] >= maxLen && shape[3] < PREEMPT_MIN_LENGTH) {
    return Math.max(shape[0], shape[1], shape[2]);
  }
  return maxLen;
}

/** @param {number} hcp @param {number[]} shape @returns {boolean} */
function meetsRuleOf15(hcp, shape) {
  return hcp + shape[0] >= RULE_OF_15;
}

/**
 * @param {import('../model/bid.js').Bid} bid
 * @param {number} priority
 * @param {string} explanation
 * @param {PenaltyItem[]} [penalties]
 * @returns {BidRecommendation}
 */
function scored(bid, priority, explanation, penalties) {
  return { bid, priority, explanation, penalties: penalties || [] };
}

import {
  Strain, STRAIN_ORDER, STRAIN_SYMBOLS, lastContractBid,
  pen, penTotal,
  MAX_SCORE, HCP_COST, LENGTH_SHORT_COST, FORCING_PASS_COST,
  SHAPE_SEMI_COST, SHAPE_UNBAL_COST, FIT_PREF_COST,
  GAME_REACHED_COST,
  SHAPE_STRAINS, STRAIN_DISPLAY,
  suitLen, isMajor, hcpDev, shapePenalty, deduct, scored,
  isGameLevel, scoreGenericRebid, rebidCandidates,
} from './rebid-shared.js';
import { SEATS } from '../model/deal.js';
import {
  opponentStrains, findPartnerLastBid, findOwnLastBid,
  partnershipMinHcp, seatStrengthFloor,
  findPartnerBid, findOwnBid, isOpener,
  partnerPassCount,
} from './context.js';

/**
 * @typedef {import('../model/hand.js').Hand} Hand
 * @typedef {import('./evaluate.js').Evaluation} Evaluation
 * @typedef {import('../model/bid.js').ContractBid} ContractBid
 * @typedef {import('../model/bid.js').Bid} Bid
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('./opening.js').BidRecommendation} BidRecommendation
 * @typedef {import('./penalty.js').PenaltyItem} PenaltyItem
 */

// ═════════════════════════════════════════════════════════════════════
// CONTINUATION BIDDING (3rd+ bid — context-aware decision module)
// ═════════════════════════════════════════════════════════════════════

/** @type {Readonly<Record<import('../model/deal.js').Seat, import('../model/deal.js').Seat>>} */
const CONT_PARTNER = { N: 'S', S: 'N', E: 'W', W: 'E' };

const CONT_COMBINED_GAME = 25;
const CONT_COMBINED_SLAM = 33;
const CONT_FIT_SUPPORT = 3;
const CONT_OWN_SUIT = 6;
const CONT_NEW_SUIT = 5;
const CONT_GAME_PASS_COST = 5;
const CONT_SLAM_PASS_COST = 3;
const CONT_ABOVE_GAME_COST = 5;
const CONT_FIT_GAME_BONUS = 3;
const CONT_LOW_LEVEL_GAME_COST = 3;

/**
 * Score bids for a player on their third or later turn.
 * Context-aware: detects forcing sequences, estimates combined strength,
 * and prefers bids consistent with the partnership's direction.
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {BidRecommendation[]}
 */
export function getContinuationBids(hand, eval_, auction, seat) {
  const partnerLast = findPartnerLastBid(auction, seat);
  const ownLast = findOwnLastBid(auction, seat);
  const forcing = partnerLast ? contDetectForcing(auction, seat, partnerLast) : false;
  const fitStrain = contFindFit(eval_, auction, seat);
  const pRange = contEstimatePartnerRange(auction, seat);
  const partnerFloor = seatStrengthFloor(auction, CONT_PARTNER[seat]);
  if (partnerFloor > pRange.min) {
    pRange.min = partnerFloor;
    if (pRange.max < pRange.min) pRange.max = pRange.min;
  }
  const combinedMin = eval_.hcp + pRange.min;
  const combinedMax = eval_.hcp + pRange.max;
  const pSuits = contPartnerSuits(auction, seat);
  const pfloor = partnershipMinHcp(auction, seat);
  const last = lastContractBid(auction);
  const currentLevel = last ? last.level : 0;

  const candidates = rebidCandidates(auction);
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(contScore(bid, hand, eval_, partnerLast, ownLast,
      forcing, fitStrain, combinedMin, combinedMax, pSuits, pfloor, currentLevel));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

// ── Forcing detection ────────────────────────────────────────────────

/**
 * Determine if partner's most recent bid creates a forcing obligation.
 * Forcing when: partner introduces a genuinely new suit, partner makes
 * a jump bid in their own suit (showing extras), the partnership is in
 * a 2♣ game-forcing auction below game, or partner bids at the 3-level+
 * in a non-game sequence.
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @param {ContractBid} partnerLast
 * @returns {boolean}
 */
function contDetectForcing(auction, seat, partnerLast) {
  if (isGameLevel(partnerLast)) return false;

  const partner = CONT_PARTNER[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);

  let partnerLastIdx = -1;
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    if (s === partner && auction.bids[i].type === 'contract') {
      partnerLastIdx = i;
      break;
    }
  }

  if (partnerLastIdx >= 0) {
    for (let i = partnerLastIdx + 1; i < auction.bids.length; i++) {
      const s = SEATS[(dealerIdx + i) % SEATS.length];
      if (s === seat && auction.bids[i].type === 'contract') return false;
    }
    // A double after partner's forcing bid relieves the obligation
    for (let i = partnerLastIdx + 1; i < auction.bids.length; i++) {
      if (auction.bids[i].type === 'double') return false;
    }
  }

  const oppSuits = opponentStrains(auction, seat);
  if (partnerLast.strain !== Strain.NOTRUMP && oppSuits.has(partnerLast.strain)) return true;

  if (partnerLast.strain !== Strain.NOTRUMP && partnerLastIdx >= 0) {
    /** @type {Set<import('../model/bid.js').Strain>} */
    const prevStrains = new Set();
    /** @type {ContractBid | null} */
    let partnerPrevInStrain = null;
    for (let i = 0; i < partnerLastIdx; i++) {
      const s = SEATS[(dealerIdx + i) % SEATS.length];
      const b = auction.bids[i];
      if ((s === seat || s === partner) && b.type === 'contract' && b.strain !== Strain.NOTRUMP) {
        prevStrains.add(/** @type {ContractBid} */ (b).strain);
        if (s === partner && /** @type {ContractBid} */ (b).strain === partnerLast.strain) {
          partnerPrevInStrain = /** @type {ContractBid} */ (b);
        }
      }
    }
    if (!prevStrains.has(partnerLast.strain)) return true;

    if (partnerPrevInStrain && partnerLast.level >= partnerPrevInStrain.level + 2) {
      return true;
    }
  }

  const partnerFirst = findPartnerBid(auction, seat);
  if (partnerFirst && partnerFirst.level === 2 && partnerFirst.strain === Strain.CLUBS &&
      isOpener(auction, partner)) {
    return true;
  }
  const ownFirst = findOwnBid(auction, seat);
  if (ownFirst && ownFirst.level === 2 && ownFirst.strain === Strain.CLUBS &&
      isOpener(auction, seat)) {
    return true;
  }

  if (partnerFirst && partnerFirst.level === 2 &&
      partnerFirst.strain !== Strain.NOTRUMP &&
      partnerLast.level >= 3 &&
      !isOpener(auction, partner)) {
    return true;
  }

  return false;
}

// ── Fit analysis ─────────────────────────────────────────────────────

/**
 * Find the best fit strain for the continuation context.
 * Priority: mutual suit > partner suit we can support > null.
 * Filters out strains that belong to the opponents so competitive
 * interference doesn't confuse the fit-finding logic.
 * @param {Evaluation} eval_
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {import('../model/bid.js').Strain | null}
 */
function contFindFit(eval_, auction, seat) {
  const partner = CONT_PARTNER[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  const oppSuits = opponentStrains(auction, seat);

  /** @type {Set<import('../model/bid.js').Strain>} */
  const ownSuits = new Set();
  /** @type {Set<import('../model/bid.js').Strain>} */
  const partnerSuitSet = new Set();

  for (let i = 0; i < auction.bids.length; i++) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    const b = auction.bids[i];
    if (b.type === 'contract' && b.strain !== Strain.NOTRUMP &&
        !oppSuits.has(/** @type {ContractBid} */ (b).strain)) {
      if (s === seat) ownSuits.add(/** @type {ContractBid} */ (b).strain);
      else if (s === partner) partnerSuitSet.add(/** @type {ContractBid} */ (b).strain);
    }
  }

  for (const strain of ownSuits) {
    if (partnerSuitSet.has(strain)) return strain;
  }

  /** @type {import('../model/bid.js').Strain | null} */
  let bestFit = null;
  let bestLen = 0;
  for (const strain of SHAPE_STRAINS) {
    if (!partnerSuitSet.has(strain)) continue;
    const len = suitLen(eval_.shape, strain);
    if (len >= CONT_FIT_SUPPORT) {
      if (!bestFit || (isMajor(strain) && !isMajor(bestFit)) || len > bestLen) {
        bestFit = strain;
        bestLen = len;
      }
    }
  }
  return bestFit;
}

/**
 * Collect all suit strains partner has bid.
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {Set<import('../model/bid.js').Strain>}
 */
function contPartnerSuits(auction, seat) {
  const partner = CONT_PARTNER[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  const oppSuits = opponentStrains(auction, seat);
  /** @type {Set<import('../model/bid.js').Strain>} */
  const suits = new Set();
  for (let i = 0; i < auction.bids.length; i++) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    const b = auction.bids[i];
    if (s === partner && b.type === 'contract' && b.strain !== Strain.NOTRUMP &&
        !oppSuits.has(/** @type {ContractBid} */ (b).strain)) {
      suits.add(/** @type {ContractBid} */ (b).strain);
    }
  }
  return suits;
}

// ── Partner range estimation ─────────────────────────────────────────

/**
 * Estimate partner's HCP range from their bidding history.
 * Uses both the first bid and (if available) the rebid to narrow the
 * range significantly — the original code kept opener at 13-21 in most
 * cases which made combinedMid too low to trigger game-level penalties.
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {{ min: number, max: number }}
 */
function contEstimatePartnerRange(auction, seat) {
  const partner = CONT_PARTNER[seat];
  const partnerFirst = findPartnerBid(auction, seat);
  if (!partnerFirst) return { min: 0, max: 0 };

  const partnerOpened = isOpener(auction, partner);
  const { level, strain } = partnerFirst;

  /** @type {{ min: number, max: number }} */
  let range;

  if (partnerOpened) {
    if (level === 1 && strain === Strain.NOTRUMP) range = { min: 15, max: 17 };
    else if (level === 2 && strain === Strain.NOTRUMP) range = { min: 20, max: 21 };
    else if (level === 2 && strain === Strain.CLUBS) range = { min: 22, max: 37 };
    else if (level === 2) range = { min: 5, max: 11 };
    else if (level >= 3) range = { min: 5, max: 10 };
    else range = { min: 13, max: 21 };
  } else {
    if (strain === Strain.NOTRUMP) {
      if (level === 1) range = { min: 6, max: 10 };
      else if (level === 2) range = { min: 13, max: 15 };
      else range = { min: 13, max: 17 };
    } else {
      const ownFirst = findOwnBid(auction, seat);
      if (ownFirst && ownFirst.level === 1 && ownFirst.strain === Strain.NOTRUMP &&
          isOpener(auction, seat) && level === 2 &&
          (strain === Strain.DIAMONDS || strain === Strain.HEARTS)) {
        range = { min: 0, max: 15 };
      } else if (ownFirst && ownFirst.strain === strain) {
        range = level <= ownFirst.level + 1 ? { min: 6, max: 10 } : { min: 10, max: 12 };
      } else if (level >= 2) {
        range = { min: 10, max: 17 };
      } else {
        range = { min: 6, max: 17 };
      }
    }
  }

  const partnerLast = findPartnerLastBid(auction, seat);
  if (partnerLast &&
      (partnerLast.level !== partnerFirst.level || partnerLast.strain !== partnerFirst.strain)) {
    range = narrowByRebid(range, partnerFirst, partnerLast, partnerOpened);
  }

  range = narrowByPartnerPasses(range, auction, seat);
  return range;
}

/**
 * Apply negative inference when partner passed over competitive action.
 * Each pass over an opponent's bid suggests partner is toward the
 * minimum of their range. A partner who never bid at all (passed hand)
 * is capped well below opening values.
 * @param {{ min: number, max: number }} range
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {{ min: number, max: number }}
 */
function narrowByPartnerPasses(range, auction, seat) {
  const passes = partnerPassCount(auction, seat);
  if (passes === 0) return range;

  const partner = CONT_PARTNER[seat];
  const partnerBid = findPartnerBid(auction, seat);

  if (!partnerBid) {
    return { min: range.min, max: Math.min(range.max, 12) };
  }

  const reduction = passes * 2;
  const newMax = Math.max(range.min, range.max - reduction);
  return { min: range.min, max: newMax };
}

/**
 * Narrow partner's range based on what their second bid reveals.
 * @param {{ min: number, max: number }} base
 * @param {ContractBid} first
 * @param {ContractBid} last
 * @param {boolean} opened
 * @returns {{ min: number, max: number }}
 */
function narrowByRebid(base, first, last, opened) {
  let { min, max } = base;

  if (opened && first.level === 1 && first.strain !== Strain.NOTRUMP) {
    if (last.strain === Strain.NOTRUMP && last.level === 1) {
      return { min: Math.max(min, 12), max: Math.min(max, 14) };
    }
    if (last.strain === first.strain) {
      const isJump = last.level >= first.level + 2;
      if (isJump) return { min: Math.max(min, 17), max };
      return { min, max: Math.min(max, 16) };
    }
    if (last.strain === Strain.NOTRUMP && last.level === 2) {
      return { min: Math.max(min, 18), max: Math.min(max, 19) };
    }
    if (last.strain === Strain.NOTRUMP && last.level >= 3) {
      return { min: Math.max(min, 19), max };
    }
    if (last.strain !== Strain.NOTRUMP && last.strain !== first.strain) {
      const isReverse = last.level === 2 &&
        STRAIN_ORDER.indexOf(last.strain) > STRAIN_ORDER.indexOf(first.strain);
      if (isReverse) return { min: Math.max(min, 17), max };
      if (last.level >= 3 && last.strain !== first.strain) {
        return { min: Math.max(min, 17), max };
      }
      return { min, max: Math.min(max, 18) };
    }
  }

  if (!opened) {
    if (last.strain === Strain.NOTRUMP && last.level === 2) {
      return { min: Math.max(min, 10), max: Math.min(max, 12) };
    }
    if (last.strain === Strain.NOTRUMP && last.level >= 3) {
      return { min: Math.max(min, 13), max };
    }
    if (last.strain !== Strain.NOTRUMP && last.strain === first.strain) {
      const isJump = last.level >= first.level + 2;
      if (isJump) return { min: Math.max(min, 10), max };
      return { min, max: Math.min(max, 10) };
    }
    if (last.strain !== Strain.NOTRUMP && last.strain !== first.strain) {
      return { min: Math.max(min, 10), max };
    }
  }

  // Responder returning to opener's first suit at the cheapest level (preference bid)
  // signals minimum values — cap the top of range
  if (!opened && first.strain !== Strain.NOTRUMP && last.strain !== first.strain) {
    const firstIdx = STRAIN_ORDER.indexOf(first.strain);
    const lastIdx = STRAIN_ORDER.indexOf(last.strain);
    if (last.strain !== Strain.NOTRUMP &&
        ((lastIdx > firstIdx && last.level === first.level) ||
         (lastIdx <= firstIdx && last.level === first.level + 1))) {
      return { min, max: Math.min(max, 10) };
    }
  }

  if (last.level >= first.level + 2 && last.strain === first.strain) {
    min = Math.max(min, min + 2);
  }
  return { min, max };
}

// ── Main continuation scorer ─────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid | null} partnerLast
 * @param {ContractBid | null} ownLast
 * @param {boolean} forcing
 * @param {import('../model/bid.js').Strain | null} fitStrain
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @param {Set<import('../model/bid.js').Strain>} partnerSuits
 * @param {number} partnershipFloor
 * @param {number} currentLevel
 * @returns {BidRecommendation}
 */
function contScore(bid, hand, eval_, partnerLast, ownLast, forcing,
    fitStrain, combinedMin, combinedMax, partnerSuits, partnershipFloor, currentLevel) {

  const gameReached = (partnerLast && isGameLevel(partnerLast)) ||
                      (ownLast && isGameLevel(ownLast));

  if (bid.type === 'pass') {
    if (gameReached && !forcing) {
      return scored(bid, deduct(0), 'Game reached: pass');
    }
    return contScorePass(bid, eval_, partnerLast, forcing, fitStrain,
      combinedMin, combinedMax, partnershipFloor, currentLevel);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  if (gameReached) {
    return contScoreAboveGame(bid, eval_, combinedMin, combinedMax, partnershipFloor);
  }

  const { strain } = bid;

  if (fitStrain && strain === fitStrain) {
    return contScoreFitBid(bid, eval_, fitStrain, combinedMin, combinedMax, partnershipFloor);
  }
  if (partnerSuits.has(strain) && strain !== Strain.NOTRUMP) {
    return contScorePreference(bid, eval_, strain, combinedMin, combinedMax, partnershipFloor);
  }
  if (ownLast && strain === ownLast.strain && strain !== Strain.NOTRUMP) {
    return contScoreRebidOwn(bid, eval_, combinedMin, combinedMax, partnershipFloor);
  }
  if (strain === Strain.NOTRUMP) {
    return contScoreNT(bid, hand, eval_, combinedMin, combinedMax, partnershipFloor);
  }
  return contScoreNewSuit(bid, eval_, fitStrain, combinedMin);
}

// ── Pass ─────────────────────────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid | null} partnerLast
 * @param {boolean} forcing
 * @param {import('../model/bid.js').Strain | null} fitStrain
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @param {number} partnershipFloor
 * @param {number} currentLevel
 * @returns {BidRecommendation}
 */
function contScorePass(bid, eval_, partnerLast, forcing, fitStrain,
    combinedMin, combinedMax, partnershipFloor, currentLevel) {
  const { hcp } = eval_;
  /** @type {PenaltyItem[]} */
  const p = [];
  const effMin = Math.max(combinedMin, partnershipFloor);
  const combinedMid = (effMin + combinedMax) / 2;

  if (forcing) {
    pen(p, 'Partner\'s bid is forcing: must respond', FORCING_PASS_COST);
    return scored(bid, deduct(penTotal(p)), 'Partner\'s bid is forcing: must bid', p);
  }

  if (combinedMid >= CONT_COMBINED_SLAM) {
    pen(p, `Combined ~${effMin}-${combinedMax} pts: slam interest`, CONT_SLAM_PASS_COST);
  }

  if (partnerLast && isGameLevel(partnerLast) && combinedMid < CONT_COMBINED_SLAM) {
    return scored(bid, deduct(penTotal(p)), 'Game reached: pass');
  }

  if (hcp >= 17 && currentLevel <= 3) {
    pen(p, `${hcp} HCP: too strong to sell out at ${currentLevel}-level`,
      (hcp - 16) * 2);
  }

  if (combinedMid >= CONT_COMBINED_GAME) {
    const gamePen = Math.min(CONT_GAME_PASS_COST, (combinedMid - CONT_COMBINED_GAME + 1));
    pen(p, `Combined ~${effMin}-${combinedMax} pts: game values`, gamePen);
    if (fitStrain) {
      pen(p, `Fit in ${STRAIN_DISPLAY[fitStrain]}: should bid game`, CONT_FIT_GAME_BONUS);
      if (!isMajor(fitStrain)) {
        pen(p, 'Minor fit with game values: consider 3NT', 2);
      }
    }
    if (currentLevel <= 2) {
      pen(p, `Only at ${currentLevel}-level with game values`, CONT_LOW_LEVEL_GAME_COST);
    }
  } else if (combinedMid >= CONT_COMBINED_GAME - 2 && currentLevel <= 2) {
    pen(p, `Combined ~${effMin}-${combinedMax}: invitational, only at ${currentLevel}-level`, 2);
    if (fitStrain) pen(p, `Fit in ${STRAIN_DISPLAY[fitStrain]}: consider game try`, 1.5);
  }

  let expl;
  if (penTotal(p) < 0.5) {
    expl = `${hcp} HCP: pass (partscore level)`;
  } else if (combinedMid >= CONT_COMBINED_SLAM) {
    expl = `Combined ${effMin}-${combinedMax}: slam potential, consider exploring`;
  } else if (combinedMid >= CONT_COMBINED_GAME) {
    expl = `Combined ${effMin}-${combinedMax}: game values, should bid on`;
  } else {
    expl = `${hcp} HCP: pass`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Above game (partner already bid game; only slam justifies more) ─

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @returns {BidRecommendation}
 */
function contScoreAboveGame(bid, eval_, combinedMin, combinedMax, partnershipFloor) {
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const sym = strain === Strain.NOTRUMP ? 'NT' : STRAIN_SYMBOLS[strain];
  const effMin = Math.max(combinedMin, partnershipFloor);
  const combinedMid = (effMin + combinedMax) / 2;

  /** @type {PenaltyItem[]} */
  const p = [];
  if (combinedMid < CONT_COMBINED_SLAM) {
    pen(p, `Game reached, combined ~${effMin}-${combinedMax}: below slam values`,
      CONT_ABOVE_GAME_COST * (level - 3));
  }
  if (level >= 6) {
    pen(p, `${level}-level bid carries inherent risk`, (level - 5) * 3);
  }
  if (level === 7 && combinedMid < 37) {
    pen(p, `Combined ~${combinedMid}: far below grand slam values`, (37 - combinedMid) * 1.5);
  }
  return scored(bid, deduct(penTotal(p)),
    combinedMid >= CONT_COMBINED_SLAM
      ? `Combined ${effMin}-${combinedMax}: slam interest, ${level}${sym}`
      : `Game reached: pass is standard`, p);
}

// ── Bid in agreed fit strain ─────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} fitStrain
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @returns {BidRecommendation}
 */
function contScoreFitBid(bid, eval_, fitStrain, combinedMin, combinedMax, partnershipFloor) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const support = suitLen(shape, fitStrain);
  const sym = STRAIN_SYMBOLS[fitStrain];
  const name = STRAIN_DISPLAY[fitStrain];
  const effMin = Math.max(combinedMin, partnershipFloor);
  const combinedMid = (effMin + combinedMax) / 2;
  const gameLevel = isMajor(fitStrain) ? 4 : 5;

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${support} ${name}, need ${CONT_FIT_SUPPORT}+`,
    Math.max(0, CONT_FIT_SUPPORT - support) * LENGTH_SHORT_COST);

  if (level === gameLevel) {
    if (combinedMid < CONT_COMBINED_GAME) {
      pen(p, `Combined ~${effMin}-${combinedMax}: below game values`,
        (CONT_COMBINED_GAME - combinedMid) * 0.5);
    }
    return scored(bid, deduct(penTotal(p)),
      combinedMid >= CONT_COMBINED_GAME
        ? `Combined ${effMin}-${combinedMax}, ${support} ${name}: ${level}${sym} game`
        : `${hcp} HCP: ${level}${sym} may be too high`, p);
  }

  if (level > gameLevel) {
    if (combinedMid < CONT_COMBINED_SLAM) {
      pen(p, `Combined ~${effMin}-${combinedMax}: below slam values`,
        (CONT_COMBINED_SLAM - combinedMid) * 0.5);
    }
    pen(p, `Level ${level} in ${name}: ${level - gameLevel} above game`,
      (level - gameLevel) * 3);
    return scored(bid, deduct(penTotal(p)),
      `${hcp} HCP, ${support} ${name}: ${level}${sym}`, p);
  }

  if (combinedMid >= CONT_COMBINED_GAME) {
    pen(p, `Combined ${effMin}-${combinedMax}: should bid game`, 4);
  } else if (combinedMid >= CONT_COMBINED_GAME - 2) {
    pen(p, `Combined ${effMin}-${combinedMax}: close to game`, 2);
  } else if (level >= 3 && combinedMid < CONT_COMBINED_GAME - 2) {
    pen(p, `Combined ~${effMin}-${combinedMax}: below invitational at level ${level}`,
      (level - 2) * 3);
  }
  const tag = combinedMid >= CONT_COMBINED_GAME - 2 ? 'invitational' : 'competitive';
  return scored(bid, deduct(penTotal(p)),
    `${hcp} HCP, ${support} ${name}: ${level}${sym} (${tag})`, p);
}

// ── Preference to partner's suit (no explicit fit agreed) ────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} strain
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @returns {BidRecommendation}
 */
function contScorePreference(bid, eval_, strain, combinedMin, combinedMax, partnershipFloor) {
  const { hcp, shape } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  const support = suitLen(shape, strain);
  const sym = STRAIN_SYMBOLS[strain];
  const name = STRAIN_DISPLAY[strain];
  const effMin = Math.max(combinedMin, partnershipFloor);
  const combinedMid = (effMin + combinedMax) / 2;
  const gameLevel = strain === Strain.NOTRUMP ? 3 : isMajor(strain) ? 4 : 5;

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${support} ${name}, need 2+`, Math.max(0, 2 - support) * LENGTH_SHORT_COST);
  if (support <= 1) {
    pen(p, `Only ${support} ${name}: singleton/void preference is dangerous`, 6);
  } else if (support < CONT_FIT_SUPPORT) {
    pen(p, `Only ${support} ${name}: thin preference`, (CONT_FIT_SUPPORT - support) * 1.5);
  }
  if (isGameLevel(/** @type {ContractBid} */ (bid)) && combinedMid < CONT_COMBINED_GAME) {
    pen(p, 'Below game values for this level', 2);
  }
  if (level >= 4 && !isGameLevel(/** @type {ContractBid} */ (bid))) {
    pen(p, `Level ${level}: high for preference`, (level - 3) * 3);
  }
  if (level > gameLevel && combinedMid < CONT_COMBINED_SLAM) {
    pen(p, `Level ${level}: ${level - gameLevel} above game without slam values`,
      (level - gameLevel) * CONT_ABOVE_GAME_COST);
  }

  return scored(bid, deduct(penTotal(p)),
    support >= 2
      ? `${support} ${name}: preference to ${level}${sym}`
      : `Only ${support} ${name}: risky preference`, p);
}

// ── Rebid own suit ───────────────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @returns {BidRecommendation}
 */
function contScoreRebidOwn(bid, eval_, combinedMin, combinedMax, partnershipFloor) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const sym = STRAIN_SYMBOLS[strain];
  const name = STRAIN_DISPLAY[strain];
  const effMin = Math.max(combinedMin, partnershipFloor);
  const combinedMid = (effMin + combinedMax) / 2;
  const atGame = isGameLevel(/** @type {ContractBid} */ (bid));
  const gameLevel = isMajor(strain) ? 4 : 5;

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${len} ${name}, need ${CONT_OWN_SUIT}+`,
    Math.max(0, CONT_OWN_SUIT - len) * LENGTH_SHORT_COST);

  if (atGame && combinedMid < CONT_COMBINED_GAME) {
    pen(p, `Combined ~${effMin}-${combinedMax}: below game values`,
      (CONT_COMBINED_GAME - combinedMid) * 0.5);
  }
  if (!atGame && level < gameLevel && combinedMid >= CONT_COMBINED_GAME) {
    pen(p, `Combined ${effMin}-${combinedMax}: should bid game`, 3);
  }
  if (!atGame && level < gameLevel && combinedMid < CONT_COMBINED_GAME && level >= 3) {
    pen(p, `Level ${level} without game values`,
      (level - 2) * 2.5);
  }
  if (level > gameLevel) {
    if (combinedMid < CONT_COMBINED_SLAM) {
      pen(p, `Combined ~${effMin}-${combinedMax}: below slam values`,
        (level - gameLevel) * CONT_ABOVE_GAME_COST);
    }
  }

  return scored(bid, deduct(penTotal(p)),
    len >= CONT_OWN_SUIT
      ? `${hcp} HCP, ${len} ${name}: rebid ${level}${sym}${atGame ? ' game' : ''}`
      : `Need ${CONT_OWN_SUIT}+ to rebid`, p);
}

// ── NT ───────────────────────────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Hand} _hand
 * @param {Evaluation} eval_
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @returns {BidRecommendation}
 */
function contScoreNT(bid, _hand, eval_, combinedMin, combinedMax, partnershipFloor) {
  const { hcp, shapeClass } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  const effMin = Math.max(combinedMin, partnershipFloor);
  const combinedMid = (effMin + combinedMax) / 2;

  /** @type {PenaltyItem[]} */
  const p = [];

  if (level === 3) {
    if (combinedMid >= CONT_COMBINED_GAME) {
      if (shapeClass === 'semi-balanced') pen(p, `${shapeClass}: not ideal for NT`, 2);
      else if (shapeClass === 'unbalanced') pen(p, `${shapeClass}: risky for NT game`, 4);
    } else {
      pen(p, `${shapeClass} (prefer balanced)`, shapePenalty(shapeClass));
      pen(p, `Combined ~${effMin}-${combinedMax}: below game values`,
        (CONT_COMBINED_GAME - combinedMid) * 0.5);
    }
    return scored(bid, deduct(penTotal(p)),
      combinedMid >= CONT_COMBINED_GAME
        ? `${hcp} HCP, combined ${effMin}-${combinedMax}: 3NT game`
        : `${hcp} HCP: below game values for 3NT`, p);
  }

  pen(p, `${shapeClass} (prefer balanced)`, shapePenalty(shapeClass));

  if (level === 2) {
    pen(p, `${hcp} HCP, need 10-12`, hcpDev(hcp, 10, 12) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      hcpDev(hcp, 10, 12) === 0
        ? `${hcp} HCP: 2NT invitational`
        : `${hcp} HCP: outside 2NT invite range`, p);
  }

  if (level >= 4) {
    if (combinedMid < CONT_COMBINED_SLAM) {
      pen(p, `Combined ~${effMin}-${combinedMax}: below slam values`,
        Math.max(0, CONT_COMBINED_SLAM - combinedMid) * 0.5);
    }
    pen(p, `${level}NT: ${level - 3} levels above game`, (level - 3) * CONT_ABOVE_GAME_COST);
  }

  return scored(bid, deduct(penTotal(p)), `${hcp} HCP: ${level}NT`, p);
}

// ── New suit (forcing at this stage) ─────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain | null} fitStrain
 * @param {number} combinedMin
 * @returns {BidRecommendation}
 */
function contScoreNewSuit(bid, eval_, fitStrain, combinedMin) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const sym = STRAIN_SYMBOLS[strain];
  const name = STRAIN_DISPLAY[strain];

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${len} ${name}, need ${CONT_NEW_SUIT}+`,
    Math.max(0, CONT_NEW_SUIT - len) * LENGTH_SHORT_COST);
  if (hcp < 10) {
    pen(p, `${hcp} HCP: need 10+ for new suit at this stage`, (10 - hcp) * HCP_COST);
  }
  if (fitStrain) {
    pen(p, `Have ${STRAIN_DISPLAY[fitStrain]} fit: prefer supporting`, FIT_PREF_COST);
  }
  if (level >= 4) {
    pen(p, `Level ${level}: very high for a new suit`, (level - 3) * 3);
  }

  return scored(bid, deduct(penTotal(p)),
    len >= CONT_NEW_SUIT && hcp >= 10
      ? `${hcp} HCP, ${len} ${name}: ${level}${sym} (forcing)`
      : `${level}${sym}: new suit in continuation`, p);
}

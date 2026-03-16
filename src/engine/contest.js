import { contractBid, pass, dbl, Strain, STRAIN_ORDER, STRAIN_SYMBOLS, lastContractBid, isLegalBid } from '../model/bid.js';
import { SEATS } from '../model/deal.js';
import { Rank } from '../model/card.js';
import { pen, penTotal } from './penalty.js';
import {
  findOwnBid, findPartnerBid, findPartnerLastBid,
  findOpponentBid, isOpener, lastPartnershipContractBid,
  partnershipMinHcp, opponentStrains,
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
 * @typedef {{ strain: import('../model/bid.js').Strain | null, ownLength: number, estimatedPartnerLength: number, totalFit: number, partnerSuits: Set<import('../model/bid.js').Strain> }} FitInfo
 * @typedef {{ min: number, max: number }} HcpRange
 */

// ── Scoring constants ────────────────────────────────────────────────

const MAX_SCORE = 10;

const HCP_COST = 2;
const LENGTH_SHORT_COST = 3;
const STOPPER_COST = 6;

const LOTT_OVER_COST = 4;
const FIVE_LEVEL_COST = 5;
const DONT_SELL_OUT_COST = 3;
const NO_FIT_COMPETE_COST = 3;
const NT_COMPETITIVE_COST = 3;
const OPP_SUIT_COST = 15;
const NEW_SUIT_WITH_FIT_COST = 3;

const DBL_NO_TRUMP_TRICKS_COST = 4;
const DBL_LONG_IN_FIT_COST = 1.5;
const DBL_LOW_LEVEL_FIT_COST = 2;

const GAME_ESTABLISHED_PASS_COST = 6;
const GAME_ESTABLISHED_DBL_BONUS = 4;

const COMBINED_GAME_MIN = 25;
const COMBINED_PARTSCORE_MIN = 20;
const FORCING_PASS_COST = 12;

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
// ENTRY POINT
// ═════════════════════════════════════════════════════════════════════

/**
 * Get bids for competitive reentry: both partners have bid, but
 * opponents have outbid the partnership.
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {BidRecommendation[]}
 */
export function getContestBids(hand, eval_, auction, seat) {
  const oppBid = findOpponentBid(auction, seat);
  if (!oppBid) return [scored(pass(), 10, 'No opponent bid found')];

  const fitInfo = analyzeFit(hand, eval_, auction, seat);
  const partnerRange = estimatePartnerRange(auction, seat);
  const combinedMin = eval_.hcp + partnerRange.min;
  const combinedMax = eval_.hcp + partnerRange.max;
  const gameWasReached = partnershipReachedGame(auction, seat, oppBid);
  const pfloor = partnershipMinHcp(auction, seat);
  const forcing = detectContestForcing(auction, seat);

  const candidates = contestCandidates(auction);
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(scoreContestBid(bid, hand, eval_, oppBid, fitInfo, combinedMin, combinedMax, gameWasReached, pfloor, forcing));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

// ── Forcing detection ────────────────────────────────────────────────

/**
 * Detect if partner's last bid was forcing and we haven't responded yet.
 * Covers: new suit by responder (forcing one round), 2♣ GF sequences.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {boolean}
 */
function detectContestForcing(auction, seat) {
  const partner = PARTNER_SEAT[seat];
  const partnerLast = findPartnerLastBid(auction, seat);
  if (!partnerLast || partnerLast.strain === Strain.NOTRUMP) return false;

  const dealerIdx = SEATS.indexOf(auction.dealer);

  let partnerLastIdx = -1;
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    if (s === partner && auction.bids[i].type === 'contract') {
      partnerLastIdx = i;
      break;
    }
  }
  if (partnerLastIdx < 0) return false;

  for (let i = partnerLastIdx + 1; i < auction.bids.length; i++) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    if (s === seat && auction.bids[i].type === 'contract') return false;
  }

  // An opponent's double relieves the forcing obligation — we can pass
  // the double for penalty instead of being forced to bid.
  for (let i = partnerLastIdx + 1; i < auction.bids.length; i++) {
    if (auction.bids[i].type === 'double') return false;
  }

  const ownBid = findOwnBid(auction, seat);
  if (!ownBid) return false;

  if (partnerLast.strain !== ownBid.strain) return true;

  return false;
}

// ── Candidate generation ─────────────────────────────────────────────

/**
 * @param {Auction} auction
 * @returns {Bid[]}
 */
function contestCandidates(auction) {
  const last = lastContractBid(auction);
  const maxLevel = Math.min(7, (last ? last.level : 0) + 2);
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

// ── Top-level dispatcher ─────────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {FitInfo} fitInfo
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @param {boolean} gameWasReached
 * @param {number} pfloor
 * @returns {BidRecommendation}
 */
function scoreContestBid(bid, hand, eval_, oppBid, fitInfo, combinedMin, combinedMax, gameWasReached, pfloor, forcing) {
  if (bid.type === 'pass') return scoreContestPass(bid, eval_, oppBid, fitInfo, combinedMin, combinedMax, gameWasReached, pfloor, forcing);
  if (bid.type === 'double') return scoreContestDouble(bid, hand, eval_, oppBid, fitInfo, combinedMin, combinedMax, gameWasReached);
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { strain } = bid;

  if (strain === oppBid.strain) {
    /** @type {PenaltyItem[]} */
    const p = [];
    pen(p, `Bidding opponent's ${STRAIN_DISPLAY[strain]}`, OPP_SUIT_COST);
    return scored(bid, deduct(penTotal(p)), `Cannot bid opponent's ${STRAIN_DISPLAY[strain]}`, p);
  }

  if (fitInfo.strain && strain === fitInfo.strain) {
    return scoreContestRaise(bid, eval_, oppBid, fitInfo, combinedMin, combinedMax);
  }
  if (fitInfo.partnerSuits.has(strain)) {
    return scoreContestPreference(bid, eval_, oppBid, fitInfo);
  }
  if (strain === Strain.NOTRUMP) {
    return scoreContestNT(bid, hand, eval_, oppBid, combinedMin);
  }
  return scoreContestNewSuit(bid, eval_, fitInfo);
}

// ═════════════════════════════════════════════════════════════════════
// PASS
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {FitInfo} fitInfo
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @param {boolean} gameWasReached
 * @param {number} pfloor
 * @returns {BidRecommendation}
 */
function scoreContestPass(bid, eval_, oppBid, fitInfo, combinedMin, combinedMax, gameWasReached, pfloor, forcing) {
  const { hcp } = eval_;
  /** @type {PenaltyItem[]} */
  const p = [];
  const effMin = Math.max(combinedMin, pfloor);
  const effMid = (effMin + combinedMax) / 2;

  if (forcing) {
    pen(p, 'Partner\'s bid is forcing: must act despite interference', FORCING_PASS_COST);
    return scored(bid, deduct(penTotal(p)), 'Partner\'s bid is forcing: must bid', p);
  }

  if (gameWasReached) {
    pen(p, 'Partnership already reached game: don\'t let opponents steal',
      GAME_ESTABLISHED_PASS_COST);
  }

  if (fitInfo.strain && fitInfo.totalFit >= 8) {
    const safeLevel = fitInfo.totalFit - 6;
    if (oppBid.level <= safeLevel) {
      pen(p, `${fitInfo.totalFit}-card fit: LOTT safe to ${safeLevel}-level`,
        Math.min(3, (safeLevel - oppBid.level + 1)));
    }

    if (effMid >= COMBINED_GAME_MIN && !gameWasReached) {
      const fitGamePen = DONT_SELL_OUT_COST + 2 + (oppBid.level >= 3 ? 2 : 0);
      pen(p, `Combined ${effMin}-${combinedMax} pts with fit: don't sell out`,
        fitGamePen);
    }
  }

  if (hcp >= 17 && fitInfo.strain) {
    pen(p, `${hcp} HCP with ${STRAIN_DISPLAY[fitInfo.strain]} fit: must not sell out`,
      (hcp - 16) * 2.5 + 3);
  } else if (hcp >= 17) {
    pen(p, `${hcp} HCP: too strong to sell out`, (hcp - 16) * 2);
  }

  if (!gameWasReached) {
    if (effMid >= COMBINED_GAME_MIN) {
      const levelScale = oppBid.level >= 3 ? 1.5 : 1;
      pen(p, `Combined ${effMin}-${combinedMax} pts: game values, consider acting`,
        Math.min(DONT_SELL_OUT_COST + 3, (effMid - COMBINED_GAME_MIN + 1) * levelScale));
    } else if (combinedMax >= COMBINED_PARTSCORE_MIN) {
      pen(p, `Combined ~${combinedMax} pts: competitive values`, 1);
    }
  }

  let expl;
  if (gameWasReached) {
    expl = `${hcp} HCP: must act — partnership already reached game`;
  } else if (penTotal(p) < 0.5) {
    expl = `${hcp} HCP: pass (opponents outbid us)`;
  } else if (effMid >= COMBINED_GAME_MIN && fitInfo.strain) {
    expl = `${hcp} HCP: don't sell out with game values and fit`;
  } else if (effMid >= COMBINED_GAME_MIN) {
    expl = `${hcp} HCP: game values, consider acting`;
  } else if (fitInfo.strain) {
    expl = `${hcp} HCP: consider competing (LOTT)`;
  } else {
    expl = `${hcp} HCP: consider competing`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ═════════════════════════════════════════════════════════════════════
// RAISE (compete in our fit suit)
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {FitInfo} fitInfo
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @returns {BidRecommendation}
 */
function scoreContestRaise(bid, eval_, oppBid, fitInfo, combinedMin, combinedMax) {
  const { hcp } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const sym = STRAIN_SYMBOLS[strain];
  const name = STRAIN_DISPLAY[strain];
  const totalFit = fitInfo.totalFit;
  const safeLevel = totalFit - 6;
  const gameLevel = isMajor(strain) ? 4 : 5;

  /** @type {PenaltyItem[]} */
  const p = [];

  if (level <= safeLevel) {
    if (combinedMin < COMBINED_PARTSCORE_MIN) {
      pen(p, `Combined ~${combinedMin}-${combinedMax} pts: thin values`, 1);
    }
  } else {
    pen(p, `${totalFit}-card fit: LOTT safe to ${safeLevel}-level only`,
      (level - safeLevel) * LOTT_OVER_COST);
  }

  if (level >= 5 && !isMajor(strain)) {
    pen(p, '5-level belongs to opponents: prefer doubling', FIVE_LEVEL_COST);
  } else if (level >= 5 && isMajor(strain) && combinedMax < 30) {
    pen(p, '5-level major: need very strong values', FIVE_LEVEL_COST - 1);
  }
  if (level >= 6) {
    pen(p, `${level}-level: slam territory`, (level - 5) * FIVE_LEVEL_COST);
  }

  if (level >= gameLevel && combinedMin < COMBINED_GAME_MIN) {
    pen(p, `Combined ~${combinedMin} pts: below game values (${COMBINED_GAME_MIN})`,
      Math.max(0, COMBINED_GAME_MIN - combinedMin) * 0.5);
  }

  let expl;
  if (level <= safeLevel && combinedMin >= COMBINED_PARTSCORE_MIN) {
    expl = `${totalFit}-card ${name} fit: compete to ${level}${sym} (LOTT safe)`;
  } else if (level <= safeLevel) {
    expl = `${totalFit}-card ${name} fit: ${level}${sym} (LOTT)`;
  } else if (level >= gameLevel && combinedMax >= COMBINED_GAME_MIN) {
    expl = `Combined values for game: bid ${level}${sym}`;
  } else {
    expl = `${level}${sym}: above safe competitive level`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ═════════════════════════════════════════════════════════════════════
// PREFERENCE (return to partner's suit without explicit fit)
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {FitInfo} fitInfo
 * @returns {BidRecommendation}
 */
function scoreContestPreference(bid, eval_, oppBid, fitInfo) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const support = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];
  const sym = STRAIN_SYMBOLS[strain];

  /** @type {PenaltyItem[]} */
  const p = [];

  pen(p, `${support} ${name}, need 2+`, Math.max(0, 2 - support) * LENGTH_SHORT_COST);
  if (support < 3) {
    pen(p, `Only ${support} ${name}: thin support`, (3 - support) * 1.5);
  }

  if (level >= 4) {
    pen(p, `Level ${level}: high for preference`, (level - 3) * 3);
  }

  let expl;
  if (support >= 2) {
    expl = `${support} ${name}: preference to ${level}${sym}`;
  } else {
    expl = `Only ${support} ${name}: risky preference`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ═════════════════════════════════════════════════════════════════════
// PENALTY / REOPENING DOUBLE
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {FitInfo} fitInfo
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @param {boolean} gameWasReached
 * @returns {BidRecommendation}
 */
function scoreContestDouble(bid, hand, eval_, oppBid, fitInfo, combinedMin, combinedMax, gameWasReached) {
  const { hcp, shape } = eval_;
  const oppLen = suitLen(shape, oppBid.strain);
  const oppName = STRAIN_DISPLAY[oppBid.strain];
  const highLevel = oppBid.level >= 5;

  /** @type {PenaltyItem[]} */
  const p = [];
  let bonus = 0;

  if (gameWasReached) {
    bonus = GAME_ESTABLISHED_DBL_BONUS;
  }

  if (oppBid.strain === Strain.NOTRUMP) {
    if (combinedMax < 23 && !gameWasReached) {
      pen(p, `Combined ~${combinedMin}-${combinedMax}: not enough to penalize NT`,
        (23 - combinedMax) * HCP_COST);
    }
  } else if (highLevel) {
    if (combinedMin < COMBINED_PARTSCORE_MIN && !gameWasReached) {
      pen(p, `Combined ~${combinedMin}: weak for penalty at 5-level`,
        (COMBINED_PARTSCORE_MIN - combinedMin) * 0.5);
    }
  } else if (!gameWasReached) {
    if (!hasTrumpTricks(hand, oppBid.strain)) {
      pen(p, `Weak holding in ${oppName}: need trump tricks to penalize`,
        DBL_NO_TRUMP_TRICKS_COST);
    }
    if (oppLen < 3) {
      pen(p, `Only ${oppLen} ${oppName}: short for penalty`,
        (3 - oppLen) * LENGTH_SHORT_COST);
    }

    if (fitInfo.strain && fitInfo.ownLength >= 4) {
      pen(p, 'Long in own fit: prefer competing in suit', DBL_LONG_IN_FIT_COST);
    }

    if (oppBid.level <= 2 && fitInfo.strain && fitInfo.totalFit >= 8) {
      pen(p, 'Low-level with fit: consider bidding rather than doubling',
        DBL_LOW_LEVEL_FIT_COST);
    }
  }

  let expl;
  if (gameWasReached) {
    expl = `Game was established: penalty double of ${oppBid.level}${STRAIN_SYMBOLS[oppBid.strain]}`;
  } else if (oppBid.strain === Strain.NOTRUMP) {
    expl = combinedMax >= 23
      ? `Combined strength: penalty double of ${oppBid.level}NT`
      : 'Not enough combined strength to penalize NT';
  } else if (highLevel) {
    expl = `5-level belongs to opponents: double`;
  } else if (oppLen >= 3 && hasTrumpTricks(hand, oppBid.strain)) {
    expl = `${oppLen} ${oppName} with honors: penalty double`;
  } else if (oppLen <= 2 && hcp >= 14) {
    expl = `${hcp} HCP, short in ${oppName}: reopening double (partner decides)`;
  } else {
    expl = `Double of ${oppBid.level}${STRAIN_SYMBOLS[oppBid.strain]}`;
  }
  return scored(bid, Math.min(MAX_SCORE, deduct(penTotal(p)) + bonus), expl, p);
}

// ═════════════════════════════════════════════════════════════════════
// NT (rare in competitive reentry)
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} oppBid
 * @param {number} combinedMin
 * @returns {BidRecommendation}
 */
function scoreContestNT(bid, hand, eval_, oppBid, combinedMin) {
  const { hcp, shapeClass } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);

  /** @type {PenaltyItem[]} */
  const p = [];

  const minHcp = 10 + (level - 1) * 3;
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
  if (shapeClass !== 'balanced') {
    pen(p, `${shapeClass}: prefer suit contract in competitive auction`,
      shapeClass === 'semi-balanced' ? 4 : 8);
  }
  if (oppBid.strain !== Strain.NOTRUMP && !hasStopper(hand, oppBid.strain)) {
    pen(p, `No stopper in ${STRAIN_DISPLAY[oppBid.strain]}`, STOPPER_COST);
  }
  pen(p, 'NT unusual in competitive reentry', NT_COMPETITIVE_COST);

  return scored(bid, deduct(penTotal(p)), `${level}NT in competitive auction`, p);
}

// ═════════════════════════════════════════════════════════════════════
// NEW SUIT (unusual in competitive reentry)
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {FitInfo} fitInfo
 * @returns {BidRecommendation}
 */
function scoreContestNewSuit(bid, eval_, fitInfo) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];
  const sym = STRAIN_SYMBOLS[strain];

  /** @type {PenaltyItem[]} */
  const p = [];

  pen(p, `${len} ${name}, need 5+`, Math.max(0, 5 - len) * LENGTH_SHORT_COST);
  pen(p, `${hcp} HCP, need 10+`, Math.max(0, 10 - hcp) * HCP_COST);

  if (fitInfo.strain) {
    pen(p, `Have ${STRAIN_DISPLAY[fitInfo.strain]} fit: prefer raising`, NEW_SUIT_WITH_FIT_COST);
  }

  if (level >= 4) {
    pen(p, `${level}-level new suit is risky`, (level - 3) * 3);
  }

  const expl = (len >= 5 && hcp >= 10)
    ? `${hcp} HCP, ${len} ${name}: ${level}${sym}`
    : `${level}${sym}: new suit in competitive auction`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ═════════════════════════════════════════════════════════════════════
// GAME-LEVEL DETECTION
// ═════════════════════════════════════════════════════════════════════

/**
 * Check whether the partnership had already bid to a game-level contract
 * before the opponent's latest competitive bid.
 * Game = 3NT+, 4M+, 5m+.
 * @param {Auction} auction
 * @param {Seat} seat
 * @param {ContractBid} oppBid
 * @returns {boolean}
 */
function partnershipReachedGame(auction, seat, oppBid) {
  const partner = PARTNER_SEAT[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);

  for (let i = auction.bids.length - 1; i >= 0; i--) {
    const b = auction.bids[i];
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    if (b.type !== 'contract') continue;
    if (s !== seat && s !== partner) continue;
    if (isGameLevel(/** @type {ContractBid} */ (b))) return true;
  }
  return false;
}

/**
 * @param {ContractBid} bid
 * @returns {boolean}
 */
function isGameLevel(bid) {
  if (bid.strain === Strain.NOTRUMP && bid.level >= 3) return true;
  if (isMajor(bid.strain) && bid.level >= 4) return true;
  if (bid.level >= 5) return true;
  return false;
}

// ═════════════════════════════════════════════════════════════════════
// FIT AND PARTNER RANGE ANALYSIS
// ═════════════════════════════════════════════════════════════════════

/**
 * Determine the partnership's fit suit and estimated total fit length.
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {FitInfo}
 */
function analyzeFit(hand, eval_, auction, seat) {
  const partner = PARTNER_SEAT[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  const oppSuits = opponentStrains(auction, seat);

  /** @type {ContractBid[]} */
  const ownSuitBids = [];
  /** @type {ContractBid[]} */
  const partnerSuitBids = [];

  for (let i = 0; i < auction.bids.length; i++) {
    const b = auction.bids[i];
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    if (b.type === 'contract' && b.strain !== Strain.NOTRUMP &&
        !oppSuits.has(/** @type {ContractBid} */ (b).strain)) {
      if (s === seat) ownSuitBids.push(/** @type {ContractBid} */ (b));
      else if (s === partner) partnerSuitBids.push(/** @type {ContractBid} */ (b));
    }
  }

  const partnerStrainSet = new Set(partnerSuitBids.map(b => b.strain));
  const ownStrainSet = new Set(ownSuitBids.map(b => b.strain));
  const noFit = { strain: null, ownLength: 0, estimatedPartnerLength: 0, totalFit: 0, partnerSuits: partnerStrainSet };

  /** @type {import('../model/bid.js').Strain | null} */
  let fitStrain = null;

  for (const strain of ownStrainSet) {
    if (partnerStrainSet.has(strain)) { fitStrain = strain; break; }
  }

  if (!fitStrain) {
    for (let i = partnerSuitBids.length - 1; i >= 0; i--) {
      if (suitLen(eval_.shape, partnerSuitBids[i].strain) >= 3) {
        fitStrain = partnerSuitBids[i].strain;
        break;
      }
    }
  }

  if (!fitStrain) return noFit;

  const ownLength = suitLen(eval_.shape, fitStrain);
  const estimatedPartnerLength = estimatePartnerFitLength(fitStrain, auction, seat);

  return { strain: fitStrain, ownLength, estimatedPartnerLength, totalFit: ownLength + estimatedPartnerLength, partnerSuits: partnerStrainSet };
}

/**
 * Estimate the minimum number of cards partner holds in the fit suit
 * based on their bidding context and style.
 * @param {import('../model/bid.js').Strain} fitStrain
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {number}
 */
function estimatePartnerFitLength(fitStrain, auction, seat) {
  const partner = PARTNER_SEAT[seat];
  const partnerBid = findPartnerBid(auction, seat);
  if (!partnerBid) return 3;

  const partnerOpened = isOpener(auction, partner);

  if (partnerBid.strain === fitStrain) {
    if (partnerOpened) {
      if (partnerBid.level === 2 && fitStrain !== Strain.CLUBS) return 6;
      if (partnerBid.level >= 3) return 7;
      if (isMajor(fitStrain)) return 5;
      return 3;
    }
    if (didPartnerOvercall(auction, seat)) return 5;
    return 4;
  }

  const partnerLastBid = findPartnerLastBid(auction, seat);
  if (partnerLastBid && partnerLastBid.strain === fitStrain) {
    return 3;
  }

  return 3;
}

/**
 * Estimate partner's HCP range based on their bids and auction context.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {HcpRange}
 */
function estimatePartnerRange(auction, seat) {
  const partner = PARTNER_SEAT[seat];
  const partnerBid = findPartnerBid(auction, seat);
  if (!partnerBid) return { min: 0, max: 0 };

  const partnerOpened = isOpener(auction, partner);
  const { level, strain } = partnerBid;

  if (partnerOpened) {
    if (level === 1 && strain === Strain.NOTRUMP) return { min: 15, max: 17 };
    if (level === 2 && strain === Strain.NOTRUMP) return { min: 20, max: 21 };
    if (level === 2 && strain === Strain.CLUBS) return { min: 22, max: 37 };
    if (level === 2) return { min: 5, max: 11 };
    if (level >= 3) return { min: 5, max: 10 };
    return { min: 13, max: 21 };
  }

  if (didPartnerOvercall(auction, seat)) {
    return level >= 2 ? { min: 10, max: 16 } : { min: 8, max: 16 };
  }

  if (strain === Strain.NOTRUMP) {
    if (level === 1) return { min: 6, max: 10 };
    if (level === 2) return { min: 13, max: 15 };
    return { min: 13, max: 17 };
  }

  const myBid = findOwnBid(auction, seat);
  if (myBid && myBid.strain === strain) {
    if (level <= myBid.level + 1) return { min: 6, max: 10 };
    return { min: 10, max: 12 };
  }

  if (level >= 2) return { min: 10, max: 17 };
  return { min: 6, max: 17 };
}

/**
 * Check whether partner's first bid was an overcall (opponents bid first).
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {boolean}
 */
function didPartnerOvercall(auction, seat) {
  const partner = PARTNER_SEAT[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  let oppBidSeen = false;
  for (let i = 0; i < auction.bids.length; i++) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    const b = auction.bids[i];
    if (b.type === 'contract') {
      if (s !== seat && s !== partner) oppBidSeen = true;
      if (s === partner) return oppBidSeen;
    }
  }
  return false;
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
 * Check if hand has trump tricks in the given suit (for penalty doubles).
 * Requires A, or KQ, or Qxx with length.
 * @param {Hand} hand
 * @param {import('../model/bid.js').Strain} strain
 * @returns {boolean}
 */
function hasTrumpTricks(hand, strain) {
  const suitCards = hand.cards.filter(c => c.suit === /** @type {any} */ (strain));
  if (suitCards.length === 0) return false;
  const hasAce = suitCards.some(c => c.rank === Rank.ACE);
  if (hasAce) return true;
  const hasKing = suitCards.some(c => c.rank === Rank.KING);
  const hasQueen = suitCards.some(c => c.rank === Rank.QUEEN);
  if (hasKing && hasQueen) return true;
  if (hasQueen && suitCards.length >= 3) return true;
  return false;
}

/**
 * Check if hand has a stopper in the given suit.
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

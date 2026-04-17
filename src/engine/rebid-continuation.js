import {
  Strain, STRAIN_ORDER, STRAIN_SYMBOLS, lastContractBid,
  pen, penTotal,
  MAX_SCORE, HCP_COST, LENGTH_SHORT_COST, FORCING_PASS_COST,
  SHAPE_SEMI_COST, SHAPE_UNBAL_COST, FIT_PREF_COST,
  GAME_REACHED_COST,
  SHAPE_STRAINS, STRAIN_DISPLAY,
  suitLen, isMajor, hcpDev, shapePenalty, deduct, scored,
  isGameLevel, scoreGenericRebid, rebidCandidates, minBidLevel,
} from './rebid-shared.js';
import { SEATS } from '../model/deal.js';
import {
  opponentStrains, findPartnerLastBid, findOwnLastBid,
  partnershipMinHcp, seatStrengthFloor,
  findPartnerBid, findOwnBid, isOpener,
  partnerPassCount,
} from './context.js';
import {
  firstBidRangeInAuction,
  applyRebidRangeNarrowing,
  applyCompetitiveRaiseCap,
  applyPassRangeNarrowing,
  jacoby2NTOpenerRebidMeaning,
} from './bid-meaning.js';

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
const CONT_COMBINED_MINOR_GAME = 29;
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
 * SAYC 2♣ opening is artificial and should not be treated as a natural
 * club suit when inferring partnership fit/suit preference later.
 * @param {Auction} auction
 * @param {number} bidIndex
 * @returns {boolean}
 */
function isArtificialStrong2COpening(auction, bidIndex) {
  const bid = auction.bids[bidIndex];
  if (!bid || bid.type !== 'contract') return false;
  if (/** @type {ContractBid} */ (bid).level !== 2 ||
      /** @type {ContractBid} */ (bid).strain !== Strain.CLUBS) {
    return false;
  }
  for (let i = 0; i < bidIndex; i++) {
    if (auction.bids[i].type === 'contract') return false;
  }
  return true;
}

/** Combined-point threshold for game in the given strain (29 for minors, 25 otherwise). */
function contGameThreshold(strain) {
  if (!strain || strain === Strain.NOTRUMP || isMajor(strain)) return CONT_COMBINED_GAME;
  return CONT_COMBINED_MINOR_GAME;
}

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

  const ownBidCounts = contOwnBidCounts(auction, seat);
  const candidates = rebidCandidates(auction);
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(contScore(bid, hand, eval_, partnerLast, ownLast,
      forcing, fitStrain, combinedMin, combinedMax, pSuits, pfloor, currentLevel, last, ownBidCounts));
  }

  // B-51: If all non-pass bids are very low confidence (priority ≤ 2),
  // boost pass to prevent selecting dubious new-suit continuations.
  // Skip when pass is deeply negative (forcing auction) — the forced-bid
  // obligation is legitimate.
  let bestNonPassPriority = -Infinity;
  let passIdx = -1;
  for (let i = 0; i < results.length; i++) {
    if (results[i].bid.type === 'pass') {
      passIdx = i;
    } else {
      bestNonPassPriority = Math.max(bestNonPassPriority, results[i].priority);
    }
  }
  if (passIdx >= 0 && bestNonPassPriority <= 2 &&
      results[passIdx].priority >= -2 &&
      results[passIdx].priority < bestNonPassPriority) {
    results[passIdx] = {
      ...results[passIdx],
      priority: bestNonPassPriority + 1,
      explanation: results[passIdx].explanation + ' (low-confidence alternatives: prefer settling)',
    };
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
    if (isArtificialStrong2COpening(auction, i)) continue;
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
    if (isArtificialStrong2COpening(auction, i)) continue;
    if (s === partner && b.type === 'contract' && b.strain !== Strain.NOTRUMP &&
        !oppSuits.has(/** @type {ContractBid} */ (b).strain)) {
      suits.add(/** @type {ContractBid} */ (b).strain);
    }
  }
  return suits;
}

/**
 * Find partner's second-to-last contract bid. Used to detect gradual
 * escalation (1♦→2♦→3♦) vs actual jumps in partner range estimation.
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {ContractBid | null}
 */
function contFindPartnerPrevBid(auction, seat) {
  const partner = CONT_PARTNER[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  let count = 0;
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    if (s === partner && auction.bids[i].type === 'contract') {
      count++;
      if (count === 2) return /** @type {ContractBid} */ (auction.bids[i]);
    }
  }
  return null;
}

/**
 * Find partner's second contract bid (their first rebid).
 * Later continuation bids are often style/pressure-driven and should
 * not be treated as fresh strength promises for range estimation.
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {ContractBid | null}
 */
function contFindPartnerRebid(auction, seat) {
  const partner = CONT_PARTNER[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  let count = 0;
  for (let i = 0; i < auction.bids.length; i++) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    if (s === partner && auction.bids[i].type === 'contract') {
      count++;
      if (count === 2) return /** @type {ContractBid} */ (auction.bids[i]);
    }
  }
  return null;
}

/**
 * Count how many times the player has previously bid each strain.
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {Map<import('../model/bid.js').Strain, number>}
 */
function contOwnBidCounts(auction, seat) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  /** @type {Map<import('../model/bid.js').Strain, number>} */
  const counts = new Map();
  for (let i = 0; i < auction.bids.length; i++) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    const b = auction.bids[i];
    if (isArtificialStrong2COpening(auction, i)) continue;
    if (s === seat && b.type === 'contract') {
      const strain = /** @type {ContractBid} */ (b).strain;
      counts.set(strain, (counts.get(strain) || 0) + 1);
    }
  }
  return counts;
}

/**
 * Collect all suit strains this player has bid.
 * Used to detect preference bids (partner returning to our suit).
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {Set<import('../model/bid.js').Strain>}
 */
function contCollectOwnSuits(auction, seat) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  /** @type {Set<import('../model/bid.js').Strain>} */
  const suits = new Set();
  for (let i = 0; i < auction.bids.length; i++) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    const b = auction.bids[i];
    if (isArtificialStrong2COpening(auction, i)) continue;
    if (s === seat && b.type === 'contract' && /** @type {ContractBid} */ (b).strain !== Strain.NOTRUMP) {
      suits.add(/** @type {ContractBid} */ (b).strain);
    }
  }
  return suits;
}

/**
 * B-50: Detect the cheapest level at which partner could have bid their
 * last strain. Looks at the last opponent contract bid before partner's
 * most recent action. Returns null if no opponent bid preceded partner's
 * last bid (i.e. it wasn't a competitive raise).
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {number | null}
 */
function contDetectCheapestPartnerLevel(auction, seat) {
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
  if (partnerLastIdx < 0) return null;
  const plb = /** @type {ContractBid} */ (auction.bids[partnerLastIdx]);

  /** @type {ContractBid | null} */
  let lastOpp = null;
  for (let i = partnerLastIdx - 1; i >= 0; i--) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    if (s !== seat && s !== partner && auction.bids[i].type === 'contract') {
      lastOpp = /** @type {ContractBid} */ (auction.bids[i]);
      break;
    }
  }
  if (!lastOpp) return null;
  return STRAIN_ORDER.indexOf(plb.strain) > STRAIN_ORDER.indexOf(lastOpp.strain)
    ? lastOpp.level : lastOpp.level + 1;
}

/**
 * B-49: Detect if partner's first bid was a forced advance of our
 * takeout double. Returns the opponent bid that was doubled, or null.
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {ContractBid | null}
 */
function contDetectForcedAdvance(auction, seat) {
  const partner = CONT_PARTNER[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  let weDoubled = false;
  /** @type {ContractBid | null} */
  let lastOppContract = null;
  for (let i = 0; i < auction.bids.length; i++) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    const b = auction.bids[i];
    const isOpp = (s !== seat && s !== partner);
    if (isOpp && b.type === 'contract') {
      lastOppContract = /** @type {ContractBid} */ (b);
    }
    if (s === seat && b.type === 'double' && lastOppContract) {
      weDoubled = true;
    }
    if (weDoubled && s === partner && b.type === 'contract') {
      return lastOppContract;
    }
  }
  return null;
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
  const ownFirst = findOwnBid(auction, seat);
  const { level, strain } = partnerFirst;

  /** @type {{ min: number, max: number }} */
  let range = firstBidRangeInAuction(auction, partner);

  // B-49: if partner was forced to advance our takeout double, the cheapest
  // action can be essentially broke.
  const doubledBid = contDetectForcedAdvance(auction, seat);
  if (doubledBid && !partnerOpened && strain !== Strain.NOTRUMP) {
    const cheapest = STRAIN_ORDER.indexOf(strain) > STRAIN_ORDER.indexOf(doubledBid.strain)
      ? doubledBid.level : doubledBid.level + 1;
    if (level <= cheapest) {
      range = { min: 0, max: 8 };
    } else if (level === cheapest + 1) {
      range = { min: 9, max: 11 };
    } else {
      range = { min: 12, max: 17 };
    }
  }

  // Jacoby 2NT: I responded 2NT to partner's 1M opening.
  // Partner's rebids have specific, narrow meanings that override generic narrowing.
  if (partnerOpened && isMajor(strain) && level === 1 &&
      ownFirst && ownFirst.level === 2 && ownFirst.strain === Strain.NOTRUMP) {
    range = narrowByJacobyContext(range, partnerFirst, auction, seat);
    range = narrowByPartnerPasses(range, auction, seat);
    return range;
  }

  // Mirror: I opened 1M and partner bid Jacoby 2NT.
  // Partner's subsequent bids have Jacoby-specific meanings.
  if (!partnerOpened && ownFirst && ownFirst.level === 1 && isMajor(ownFirst.strain) &&
      isOpener(auction, seat) &&
      partnerFirst.level === 2 && partnerFirst.strain === Strain.NOTRUMP) {
    range = narrowByPartnerJacobyBids(range, auction, seat);
    range = narrowByPartnerPasses(range, auction, seat);
    return range;
  }

  const partnerLast = findPartnerLastBid(auction, seat);

  // B-48: Detect preference to our suit — simple preference shows minimum (6-9),
  // not constructive (10+). A preference bid is when partner returns to one of
  // our previously bid suits at a cheap level.
  if (partnerLast && !partnerOpened &&
      partnerLast.strain !== Strain.NOTRUMP &&
      partnerLast.strain !== partnerFirst.strain) {
    const ownSuits = contCollectOwnSuits(auction, seat);
    if (ownSuits.has(partnerLast.strain)) {
      const isJump = partnerLast.level >= partnerFirst.level + 2;
      if (isJump) {
        range = { min: Math.max(range.min, 10), max: Math.min(range.max, 12) };
      } else {
        range = { min: range.min, max: Math.min(range.max, 10) };
      }
      range = narrowByPartnerPasses(range, auction, seat);
      return range;
    }
  }

  // B-50: In competitive auctions, detect if partner's latest bid was a
  // LOTT-competitive raise (cheapest level in the suit over an opponent's bid).
  // Such raises don't show extras — cap the range.
  if (partnerLast && partnerLast.strain !== Strain.NOTRUMP &&
      partnerLast.level > partnerFirst.level) {
    const ownFirst = findOwnBid(auction, seat);
    const isRaiseOfAgreedSuit =
      partnerLast.strain === partnerFirst.strain ||
      (ownFirst && partnerLast.strain === ownFirst.strain);
    if (isRaiseOfAgreedSuit) {
      const cheapest = contDetectCheapestPartnerLevel(auction, seat);
      if (cheapest !== null && partnerLast.level <= cheapest) {
        range = applyCompetitiveRaiseCap(range);
      }
    }
  }

  const partnerRebid = contFindPartnerRebid(auction, seat);
  if (partnerRebid &&
      (partnerRebid.level !== partnerFirst.level || partnerRebid.strain !== partnerFirst.strain)) {
    const prevLevelInSuit = partnerRebid.strain === partnerFirst.strain
      ? partnerFirst.level : undefined;
    range = applyRebidRangeNarrowing(range, partnerFirst, partnerRebid, partnerOpened, prevLevelInSuit);
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
  return applyPassRangeNarrowing(range, passes);
}

/**
 * Narrow partner's range using the Jacoby 2NT rebid structure.
 * After 1M - 2NT (Jacoby):
 *   3-level new suit = shortness (any strength)
 *   3M = minimum, no shortness (13-15)
 *   3NT = extras, no shortness (15+)
 *   4M = minimum sign-off (13-15)
 * Subsequent bids after cue-bid exchange don't widen the range.
 * @param {{ min: number, max: number }} base
 * @param {ContractBid} partnerFirst
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {{ min: number, max: number }}
 */
function narrowByJacobyContext(base, partnerFirst, auction, seat) {
  const partner = CONT_PARTNER[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  const ps = partnerFirst.strain;
  let { min, max } = base;

  // Find partner's first rebid (the bid right after our Jacoby 2NT)
  let foundOur2NT = false;
  for (let i = 0; i < auction.bids.length; i++) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    const b = auction.bids[i];
    if (s === seat && b.type === 'contract' &&
        /** @type {ContractBid} */ (b).level === 2 &&
        /** @type {ContractBid} */ (b).strain === Strain.NOTRUMP) {
      foundOur2NT = true;
      continue;
    }
    if (foundOur2NT && s === partner && b.type === 'contract') {
      const rebid = /** @type {ContractBid} */ (b);
      const meaning = jacoby2NTOpenerRebidMeaning(ps, rebid);
      const narrowed = {
        min: Math.max(min, meaning.minHcp),
        max: Math.min(max, meaning.maxHcp),
      };
      if (narrowed.max < narrowed.min) narrowed.max = narrowed.min;
      return narrowed;
      break;
    }
  }
  return { min, max };
}

/**
 * Narrow the range of a partner who bid Jacoby 2NT based on their
 * subsequent bids. Cue bids at 4+ level indicate slam interest (16+ HCP).
 * Signing off at 4M suggests minimum GF (13-15).
 * @param {{ min: number, max: number }} base
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {{ min: number, max: number }}
 */
function narrowByPartnerJacobyBids(base, auction, seat) {
  const partner = CONT_PARTNER[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  const ownFirst = findOwnBid(auction, seat);
  if (!ownFirst) return base;
  const agreedMajor = ownFirst.strain;
  let { min, max } = base;

  // Scan partner's bids after their Jacoby 2NT
  let foundJacoby = false;
  for (let i = 0; i < auction.bids.length; i++) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    const b = auction.bids[i];
    if (s === partner && b.type === 'contract') {
      const cb = /** @type {ContractBid} */ (b);
      if (!foundJacoby) {
        if (cb.level === 2 && cb.strain === Strain.NOTRUMP) foundJacoby = true;
        continue;
      }
      // Partner's bids after Jacoby 2NT
      if (cb.strain === agreedMajor && cb.level >= 4) {
        // Sign-off at game in agreed major → minimum GF
        max = Math.min(max, 16);
      } else if (cb.strain !== agreedMajor && cb.strain !== Strain.NOTRUMP &&
                 cb.level >= 4) {
        // Cue bid at 4+ level → slam interest, 16+ HCP
        min = Math.max(min, 16);
      } else if (cb.level === 4 && cb.strain === Strain.NOTRUMP) {
        // Blackwood → slam interest, 16+
        min = Math.max(min, 16);
      }
    }
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
 * @param {ContractBid | null} lastBid
 * @param {Map<import('../model/bid.js').Strain, number>} ownBidCounts
 * @returns {BidRecommendation}
 */
function contScore(bid, hand, eval_, partnerLast, ownLast, forcing,
    fitStrain, combinedMin, combinedMax, partnerSuits, partnershipFloor, currentLevel, lastBid, ownBidCounts) {

  const gameReached = (partnerLast && isGameLevel(partnerLast)) ||
                      (ownLast && isGameLevel(ownLast));

  if (bid.type === 'pass') {
    if (gameReached && !forcing) {
      const effMin = Math.max(combinedMin, partnershipFloor);
      const combinedMid = (effMin + combinedMax) / 2;
      if (combinedMid >= CONT_COMBINED_SLAM) {
        // B-42: At 5+ level already at/near slam — reduce exploration pressure
        const slamPen = currentLevel >= 6 ? 0
                      : currentLevel >= 5 ? 1
                      : CONT_SLAM_PASS_COST;
        if (slamPen > 0) {
          /** @type {PenaltyItem[]} */
          const p = [];
          pen(p, `Combined ~${effMin}-${combinedMax}: slam values, consider exploring`,
            slamPen);
          return scored(bid, deduct(penTotal(p)),
            `Game reached but combined ${effMin}-${combinedMax}: slam potential`, p);
        }
      }
      return scored(bid, deduct(0), 'Game reached: pass');
    }
    return contScorePass(bid, eval_, partnerLast, forcing, fitStrain,
      combinedMin, combinedMax, partnershipFloor, currentLevel);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  if (gameReached) {
    return contScoreAboveGame(bid, eval_, combinedMin, combinedMax, partnershipFloor, fitStrain, ownLast);
  }

  const { strain } = bid;

  if (fitStrain && strain === fitStrain) {
    return contScoreFitBid(bid, eval_, fitStrain, combinedMin, combinedMax, partnershipFloor);
  }
  if (partnerSuits.has(strain) && strain !== Strain.NOTRUMP) {
    return contScorePreference(bid, eval_, strain, combinedMin, combinedMax, partnershipFloor, lastBid,
      ownBidCounts.get(strain) || 0);
  }
  if (ownLast && strain === ownLast.strain && strain !== Strain.NOTRUMP) {
    return contScoreRebidOwn(bid, eval_, combinedMin, combinedMax, partnershipFloor, partnerSuits, fitStrain,
      ownBidCounts.get(strain) || 0);
  }
  if (strain === Strain.NOTRUMP) {
    return contScoreNT(bid, hand, eval_, combinedMin, combinedMax, partnershipFloor);
  }
  return contScoreNewSuit(bid, eval_, fitStrain, combinedMin, combinedMax, partnershipFloor, ownBidCounts);
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
    const forcingCost = hcp <= 7
      ? Math.min(FORCING_PASS_COST, 6 + hcp)
      : FORCING_PASS_COST;
    pen(p, 'Partner\'s bid is forcing: must respond', forcingCost);
    return scored(bid, deduct(penTotal(p)),
      hcp <= 7 ? `Forcing auction but only ${hcp} HCP: consider settling` : 'Partner\'s bid is forcing: must bid', p);
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

  const gameThreshold = contGameThreshold(fitStrain);

  if (combinedMid >= gameThreshold) {
    const gamePen = Math.min(CONT_GAME_PASS_COST, (combinedMid - gameThreshold + 1));
    pen(p, `Combined ~${effMin}-${combinedMax} pts: game values (need ~${gameThreshold})`, gamePen);
    if (fitStrain) {
      pen(p, `Fit in ${STRAIN_DISPLAY[fitStrain]}: should bid game`, CONT_FIT_GAME_BONUS);
    }
    if (currentLevel <= 2) {
      pen(p, `Only at ${currentLevel}-level with game values`, CONT_LOW_LEVEL_GAME_COST);
    }
  } else if (fitStrain && !isMajor(fitStrain) && combinedMid >= CONT_COMBINED_GAME) {
    pen(p, `Minor fit, combined ~${effMin}-${combinedMax}: consider 3NT`, 2);
  } else if (combinedMid >= gameThreshold - 2 && currentLevel <= 2) {
    pen(p, `Combined ~${effMin}-${combinedMax}: invitational, only at ${currentLevel}-level`, 2);
    if (fitStrain) pen(p, `Fit in ${STRAIN_DISPLAY[fitStrain]}: consider game try`, 1.5);
  }

  let expl;
  if (penTotal(p) < 0.5) {
    expl = `${hcp} HCP: pass (partscore level)`;
  } else if (combinedMid >= CONT_COMBINED_SLAM) {
    expl = `Combined ${effMin}-${combinedMax}: slam potential, consider exploring`;
  } else if (combinedMid >= gameThreshold) {
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
 * @param {number} partnershipFloor
 * @param {import('../model/bid.js').Strain | null} fitStrain
 * @param {ContractBid | null} ownLast
 * @returns {BidRecommendation}
 */
function contScoreAboveGame(bid, eval_, combinedMin, combinedMax, partnershipFloor, fitStrain, ownLast) {
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const sym = strain === Strain.NOTRUMP ? 'NT' : STRAIN_SYMBOLS[strain];
  const effMin = Math.max(combinedMin, partnershipFloor);
  const combinedMid = (effMin + combinedMax) / 2;

  // B-42: Distinguish "settling" bids (fit suit, own suit, NT) from new suits
  const isSettling = (fitStrain && strain === fitStrain) ||
                     strain === Strain.NOTRUMP ||
                     (ownLast && strain !== Strain.NOTRUMP && ownLast.strain === strain);

  /** @type {PenaltyItem[]} */
  const p = [];
  if (combinedMid < CONT_COMBINED_SLAM) {
    pen(p, `Game reached, combined ~${effMin}-${combinedMax}: below slam values`,
      CONT_ABOVE_GAME_COST * (level - 3));
    if (level >= 6) {
      pen(p, `${level}-level bid carries inherent risk`, (level - 5) * 3);
    }
  } else {
    if (level === 5) {
      pen(p, `Combined ${effMin}-${combinedMax} with slam values: 5-level is awkward`, 2);
    }
    // B-42: Non-settling bids at 6+ with slam values trigger cue-bid runaway
    if (level >= 6 && !isSettling) {
      pen(p, `New suit at ${level}-level: settle in agreed strain`,
        3 + (level - 5) * 3);
    }
  }
  if (level === 7 && combinedMid < 37) {
    pen(p, `Combined ~${Math.round(combinedMid)}: below grand slam values`,
      (37 - combinedMid) * 1.5);
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
  const gameThreshold = contGameThreshold(fitStrain);

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${support} ${name}, need ${CONT_FIT_SUPPORT}+`,
    Math.max(0, CONT_FIT_SUPPORT - support) * LENGTH_SHORT_COST);

  if (level === gameLevel) {
    if (combinedMid < gameThreshold) {
      pen(p, `Combined ~${effMin}-${combinedMax}: below game values (need ~${gameThreshold})`,
        (gameThreshold - combinedMid) * 0.5);
    }
    // B-43: 5-level minor game is inherently risky — prefer doubling or 3NT
    if (!isMajor(fitStrain)) {
      pen(p, '5-level minor game: high risk, prefer doubling or 3NT', 2);
    }
    return scored(bid, deduct(penTotal(p)),
      combinedMid >= gameThreshold
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

  if (combinedMid >= gameThreshold) {
    pen(p, `Combined ${effMin}-${combinedMax}: should bid game`, 4);
  } else if (combinedMid >= gameThreshold - 2) {
    pen(p, `Combined ${effMin}-${combinedMax}: close to game`, 2);
  } else if (level >= 3 && combinedMid < gameThreshold - 2) {
    pen(p, `Combined ~${effMin}-${combinedMax}: below invitational at level ${level}`,
      (level - 2) * 3);
  }
  const tag = combinedMid >= gameThreshold - 2 ? 'invitational' : 'competitive';
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
 * @param {number} partnershipFloor
 * @param {ContractBid | null} lastBid
 * @param {number} priorCount
 * @returns {BidRecommendation}
 */
function contScorePreference(bid, eval_, strain, combinedMin, combinedMax, partnershipFloor, lastBid, priorCount) {
  const { hcp, shape } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  const support = suitLen(shape, strain);
  const sym = STRAIN_SYMBOLS[strain];
  const name = STRAIN_DISPLAY[strain];
  const effMin = Math.max(combinedMin, partnershipFloor);
  const combinedMid = (effMin + combinedMax) / 2;
  const gameLevel = strain === Strain.NOTRUMP ? 3 : isMajor(strain) ? 4 : 5;
  const gameThreshold = contGameThreshold(strain);
  const isMajorStrain = isMajor(strain);
  const weakMajorPreference = isMajorStrain && level === 3 && hcp <= 7;

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${support} ${name}, need 2+`, Math.max(0, 2 - support) * LENGTH_SHORT_COST);
  if (support <= 1) {
    pen(p, `Only ${support} ${name}: singleton/void preference is dangerous`, 6);
  } else if (support < CONT_FIT_SUPPORT) {
    pen(p, `Only ${support} ${name}: thin preference`, (CONT_FIT_SUPPORT - support) * 2.5);
    if (level >= 3) {
      pen(p, `Thin ${support}-card preference at ${level}-level: often better to settle`, 1.5);
    }
  }
  if (priorCount >= 1) {
    pen(p, `Already showed ${name} preference ${priorCount} time${priorCount > 1 ? 's' : ''}: settle`,
      priorCount * 3);
  }

  const cheapest = lastBid ? minBidLevel(strain, lastBid) : level;
  const jump = level - cheapest;
  if (jump > 0) {
    pen(p, `${jump} level${jump > 1 ? 's' : ''} above cheapest preference (${cheapest}${sym})`,
      jump * 3);
  }
  if (level >= 4) {
    pen(p, `Level ${level}: high for preference`, (level - 3) * 2);
  }
  if (weakMajorPreference) {
    // With weak values in a major preference window, treat 3M as optional
    // rather than mandatory; this avoids over-competing when pass is normal.
    pen(p, `Weak hand (${hcp} HCP): avoid automatic 3-level major preference`, 2);
  }
  if (isGameLevel(/** @type {ContractBid} */ (bid)) && combinedMid < gameThreshold) {
    pen(p, `Below game values (need ~${gameThreshold}) for ${level}${sym}`,
      (gameThreshold - combinedMid) * 0.5);
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
 * @param {number} partnershipFloor
 * @param {Set<import('../model/bid.js').Strain>} partnerSuits
 * @param {import('../model/bid.js').Strain | null} fitStrain
 * @param {number} priorCount
 * @returns {BidRecommendation}
 */
function contScoreRebidOwn(bid, eval_, combinedMin, combinedMax, partnershipFloor, partnerSuits, fitStrain, priorCount) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const sym = STRAIN_SYMBOLS[strain];
  const name = STRAIN_DISPLAY[strain];
  const effMin = Math.max(combinedMin, partnershipFloor);
  const combinedMid = (effMin + combinedMax) / 2;
  const atGame = isGameLevel(/** @type {ContractBid} */ (bid));
  const gameLevel = isMajor(strain) ? 4 : 5;
  const gameThreshold = contGameThreshold(strain);

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${len} ${name}, need ${CONT_OWN_SUIT}+`,
    Math.max(0, CONT_OWN_SUIT - len) * LENGTH_SHORT_COST);

  // B-45: Partner showed different suit(s) with no agreed fit — misfit warning
  const misfit = partnerSuits.size > 0 && !fitStrain && !partnerSuits.has(strain);
  if (misfit && level >= 3) {
    pen(p, 'No fit with partner\'s suit: misfit risk', (level - 2) * 2);
  }
  if (priorCount >= 2) {
    pen(p, `Already bid ${name} ${priorCount} times: repeated rebids don't add information`,
      (priorCount - 1) * 3);
  }

  if (atGame && combinedMid < gameThreshold) {
    const shortfall = gameThreshold - combinedMid;
    pen(p, `Combined ~${effMin}-${combinedMax}: below game values (need ~${gameThreshold})`,
      shortfall * 0.75);
    if (!isMajor(strain) && shortfall >= 5) {
      pen(p, '5-level minor game requires near-game values', 2);
    }
  }
  if (!atGame && level < gameLevel && combinedMid >= gameThreshold) {
    pen(p, `Combined ${effMin}-${combinedMax}: should bid game`, 3);
  }
  if (!atGame && level < gameLevel && combinedMid < gameThreshold && level >= 3) {
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
      if (hcp < 10) {
        pen(p, `Weak hand (${hcp} HCP): prefer cheaper bid over 3NT`, (10 - hcp) * 1.0);
      }
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
 * @param {number} combinedMax
 * @param {number} partnershipFloor
 * @param {Map<import('../model/bid.js').Strain, number>} ownBidCounts
 * @returns {BidRecommendation}
 */
function contScoreNewSuit(bid, eval_, fitStrain, combinedMin, combinedMax, partnershipFloor, ownBidCounts) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const sym = STRAIN_SYMBOLS[strain];
  const name = STRAIN_DISPLAY[strain];
  const effMin = Math.max(combinedMin, partnershipFloor);
  const combinedMid = (effMin + combinedMax) / 2;

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

  // B-51: Penalty for introducing yet another new suit when already showed 2+ suits
  const ownSuitCount = ownBidCounts.size;
  const priorInStrain = ownBidCounts.get(strain) || 0;
  if (ownSuitCount >= 2 && priorInStrain === 0) {
    pen(p, `Already showed ${ownSuitCount} suits: introducing another escalates auction`,
      (ownSuitCount - 1) * 3);
  }

  // B-51: Penalty when combined values don't justify this level
  if (level >= 3 && combinedMid < CONT_COMBINED_GAME) {
    pen(p, `Combined ~${effMin}-${Math.round(combinedMax)}: insufficient for ${level}-level new suit`,
      Math.min(5, (CONT_COMBINED_GAME - combinedMid) * 0.5));
  }

  return scored(bid, deduct(penTotal(p)),
    len >= CONT_NEW_SUIT && hcp >= 10
      ? `${hcp} HCP, ${len} ${name}: ${level}${sym} (forcing)`
      : `${level}${sym}: new suit in continuation`, p);
}

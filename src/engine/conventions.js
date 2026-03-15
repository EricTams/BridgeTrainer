import { contractBid, pass, Strain, STRAIN_ORDER, STRAIN_SYMBOLS, lastContractBid } from '../model/bid.js';
import { SEATS } from '../model/deal.js';
import { Rank } from '../model/card.js';
import { pen, penTotal } from './penalty.js';

/**
 * @typedef {import('../model/hand.js').Hand} Hand
 * @typedef {import('./evaluate.js').Evaluation} Evaluation
 * @typedef {import('../model/bid.js').ContractBid} ContractBid
 * @typedef {import('../model/bid.js').Bid} Bid
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('../model/deal.js').Seat} Seat
 * @typedef {import('./opening.js').BidRecommendation} BidRecommendation
 * @typedef {import('./penalty.js').PenaltyItem} PenaltyItem
 *
 * @typedef {{
 *   myBids: ContractBid[],
 *   partnerBids: ContractBid[],
 *   agreedStrain: import('../model/bid.js').Strain | null,
 *   partnerLastBid: ContractBid | null,
 *   partnerFirstBid: ContractBid | null,
 *   myFirstBid: ContractBid | null,
 *   partnerIsOpener: boolean,
 * }} AuctionAnalysis
 */

// ── Scoring costs ────────────────────────────────────────────────────

const MAX_SCORE = 10;

const WRONG_RESPONSE_COST = 15;
const FORCING_PASS_COST = 20;
const NO_FIT_COST = 12;
const INSUFFICIENT_HCP_COST = 2;
const NO_ACES_BW_COST = 8;
const NO_CONTROL_CUE_COST = 8;
const SLAM_HCP_COST = 2.5;

// ── SAYC thresholds ─────────────────────────────────────────────────

const SLAM_COMBINED_MIN = 33;
const GRAND_COMBINED_MIN = 37;
const CUE_COMBINED_MIN = 29;

// ── Convention response mappings ─────────────────────────────────────

/** Blackwood 4NT ace-showing steps: index = aceCount % 4 */
const BW_RESPONSE_STRAINS = [Strain.CLUBS, Strain.DIAMONDS, Strain.HEARTS, Strain.SPADES];

/** Gerber 4♣ ace-showing steps: index = aceCount % 4 */
const GERBER_RESPONSE_STRAINS = [Strain.DIAMONDS, Strain.HEARTS, Strain.SPADES, Strain.NOTRUMP];

/** 5NT king-ask steps: index = min(kingCount, 3) */
const KING_RESPONSE_STRAINS = [Strain.CLUBS, Strain.DIAMONDS, Strain.HEARTS, Strain.SPADES];

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
const PARTNER_SEAT_MAP = { N: 'S', S: 'N', E: 'W', W: 'E' };

// ═════════════════════════════════════════════════════════════════════
// MAIN EXPORTS
// ═════════════════════════════════════════════════════════════════════

/**
 * Check if a forced slam convention response is required.
 *
 * When partner has bid Blackwood (4NT with suit fit), Gerber (4C over NT),
 * or the 5NT king-ask, the response is forced. Returns scored
 * recommendations for ALL candidate bids (correct response scores highest).
 *
 * @param {Hand} hand
 * @param {Evaluation} _eval
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {BidRecommendation[] | null}
 */
export function getConventionResponse(hand, _eval, auction, seat) {
  const ctx = analyzeAuction(auction, seat);
  if (!ctx.partnerLastBid) return null;

  const plb = ctx.partnerLastBid;
  const partnerSeat = PARTNER_SEAT_MAP[seat];

  if (plb.level === 4 && plb.strain === Strain.NOTRUMP
      && ctx.agreedStrain
      && lastContractBidBySeat(auction) === partnerSeat) {
    return buildBlackwoodResponses(hand, auction, ctx.agreedStrain);
  }

  if (plb.level === 4 && plb.strain === Strain.CLUBS
      && hasNTContext(ctx)
      && lastContractBidBySeat(auction) === partnerSeat) {
    return buildGerberResponses(hand, auction);
  }

  if (plb.level === 5 && plb.strain === Strain.NOTRUMP
      && wasBlackwoodExchange(ctx)
      && lastContractBidBySeat(auction) === partnerSeat) {
    return buildKingAskResponses(hand, auction, ctx.agreedStrain);
  }

  // Stayman continuation: we bid 2♣, partner responded 2♦/2♥/2♠
  if (ctx.myFirstBid
      && ctx.myFirstBid.level === 2 && ctx.myFirstBid.strain === Strain.CLUBS
      && ctx.partnerIsOpener
      && ctx.partnerFirstBid
      && ctx.partnerFirstBid.level === 1 && ctx.partnerFirstBid.strain === Strain.NOTRUMP
      && plb.level === 2
      && (plb.strain === Strain.DIAMONDS || plb.strain === Strain.HEARTS || plb.strain === Strain.SPADES)
      && lastContractBidBySeat(auction) === partnerSeat) {
    return buildStaymanContinuation(_eval, plb, auction);
  }

  return null;
}

/**
 * Get slam initiation candidates to merge with normal recommendations.
 *
 * Returns additional BidRecommendation[] for Blackwood, Gerber, cue bids,
 * and direct slam bids. Only produces candidates when the partnership
 * has enough combined values for slam exploration.
 *
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {BidRecommendation[]}
 */
export function getSlamInitiationBids(hand, eval_, auction, seat) {
  const ctx = analyzeAuction(auction, seat);
  const partnerMin = estimatePartnerMinHCP(ctx);
  const combinedMin = eval_.hcp + partnerMin;

  if (combinedMin < CUE_COMBINED_MIN) return [];

  const last = lastContractBid(auction);
  if (!last) return [];

  /** @type {BidRecommendation[]} */
  const results = [];

  // Blackwood 4NT
  if (ctx.agreedStrain) {
    const bw = contractBid(4, Strain.NOTRUMP);
    if (isHigher(bw, last)) {
      results.push(scoreBlackwoodInit(hand, eval_, ctx.agreedStrain, combinedMin));
    }
  }

  // Gerber 4♣ over partner's NT
  if (isPartnerNTContext(ctx)) {
    const gerber = contractBid(4, Strain.CLUBS);
    if (isHigher(gerber, last)) {
      results.push(scoreGerberInit(eval_, combinedMin));
    }
  }

  // Cue bids (new suit at 4+ level showing a control)
  if (ctx.agreedStrain) {
    const alreadyCued = cuedSuits(ctx.myBids, ctx.agreedStrain);
    for (const strain of SHAPE_STRAINS) {
      if (strain === ctx.agreedStrain) continue;
      if (alreadyCued.has(strain)) continue;
      const level = cheapestCueBidLevel(strain, last);
      if (level > 5) continue;
      const cue = contractBid(level, strain);
      if (isHigher(cue, last)) {
        results.push(scoreCueBidInit(hand, eval_, cue, strain, ctx.agreedStrain, combinedMin));
      }
    }
  }

  // Direct slam bids
  const slamStrain = ctx.agreedStrain || Strain.NOTRUMP;
  for (const level of [6, 7]) {
    const slam = contractBid(level, slamStrain);
    if (isHigher(slam, last)) {
      results.push(scoreDirectSlam(eval_, slam, slamStrain, combinedMin, level));
    }
  }

  return results;
}

// ═════════════════════════════════════════════════════════════════════
// STAYMAN CONTINUATION (we bid 2♣, partner responded)
// ═════════════════════════════════════════════════════════════════════

const STAYMAN_INV_MIN = 8;
const STAYMAN_INV_MAX = 9;
const STAYMAN_GF_MIN = 10;
const STAYMAN_MAJOR_LEN = 4;
const STAYMAN_5CARD_LEN = 5;

/** @param {number[]} shape @param {string} strain */
function suitLen(shape, strain) {
  return shape[SHAPE_STRAINS.indexOf(/** @type {any} */(strain))];
}

/**
 * After 1NT – 2♣ – (2♦/2♥/2♠), score the Stayman bidder's continuation.
 * @param {Evaluation} eval_
 * @param {ContractBid} partnerResp - partner's Stayman response (2D/2H/2S)
 * @param {Auction} auction
 * @returns {BidRecommendation[]}
 */
function buildStaymanContinuation(eval_, partnerResp, auction) {
  const { hcp, shape } = eval_;
  const last = lastContractBid(auction);
  const sp = suitLen(shape, Strain.SPADES);
  const he = suitLen(shape, Strain.HEARTS);
  const resp = partnerResp.strain;

  /** @type {BidRecommendation[]} */
  const results = [];

  // Generate all legal bids
  /** @type {Bid[]} */
  const candidates = [pass()];
  for (let level = 1; level <= 7; level++) {
    for (const strain of STRAIN_ORDER) {
      const bid = contractBid(level, strain);
      if (!last || isHigher(bid, last)) candidates.push(bid);
    }
  }

  const hasFit = (resp === Strain.HEARTS && he >= STAYMAN_MAJOR_LEN) ||
                 (resp === Strain.SPADES && sp >= STAYMAN_MAJOR_LEN);

  for (const bid of candidates) {
    results.push(scoreStaymanCont(bid, eval_, resp, hasFit, sp, he));
  }

  return results.sort((a, b) => b.priority - a.priority);
}

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} resp
 * @param {boolean} hasFit
 * @param {number} sp
 * @param {number} he
 * @returns {BidRecommendation}
 */
function scoreStaymanCont(bid, eval_, resp, hasFit, sp, he) {
  const { hcp } = eval_;

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */
    const p = [];
    if (hcp >= STAYMAN_GF_MIN) {
      pen(p, `${hcp} HCP: game values, must bid`, hcp - STAYMAN_GF_MIN + 4);
    }
    if (hasFit && hcp >= STAYMAN_INV_MIN) {
      pen(p, 'Found major fit: raise', 5);
    }
    if (!hasFit && hcp >= STAYMAN_INV_MIN) {
      pen(p, 'Invitational+ values: bid 2NT or 3NT', 4);
    }
    const expl = hcp < STAYMAN_INV_MIN
      ? `${hcp} HCP: sign off (pass)`
      : `${hcp} HCP: too strong to pass after Stayman`;
    return scored(bid, deduct(penTotal(p)), expl, p);
  }

  if (bid.type !== 'contract') return scored(bid, 0, '');
  const { level, strain } = bid;
  const sym = STRAIN_SYMBOLS[strain];

  // Found a major fit → raise it
  if (hasFit && strain === resp) {
    /** @type {PenaltyItem[]} */
    const p = [];
    if (level === 3) {
      pen(p, `${hcp} HCP, need ${STAYMAN_INV_MIN}-${STAYMAN_INV_MAX}`,
        hcpDev(hcp, STAYMAN_INV_MIN, STAYMAN_INV_MAX) * INSUFFICIENT_HCP_COST);
      return scored(bid, deduct(penTotal(p)),
        `${hcp} HCP with fit: invitational 3${sym}`, p);
    }
    if (level === 4) {
      pen(p, `${hcp} HCP, need ${STAYMAN_GF_MIN}+`,
        Math.max(0, STAYMAN_GF_MIN - hcp) * INSUFFICIENT_HCP_COST);
      return scored(bid, deduct(penTotal(p)),
        `${hcp} HCP with fit: game 4${sym}`, p);
    }
  }

  // No fit in partner's major, but have 5-card spades
  if (resp === Strain.DIAMONDS && sp >= STAYMAN_5CARD_LEN && strain === Strain.SPADES) {
    /** @type {PenaltyItem[]} */
    const p = [];
    if (level === 2) {
      pen(p, `${hcp} HCP, need ${STAYMAN_INV_MIN}+`,
        Math.max(0, STAYMAN_INV_MIN - hcp) * INSUFFICIENT_HCP_COST);
      return scored(bid, deduct(penTotal(p)),
        `${sp} spades: show 5-card suit after Stayman (2${sym})`, p);
    }
    if (level === 3) {
      pen(p, `${hcp} HCP, need ${STAYMAN_GF_MIN}+`,
        Math.max(0, STAYMAN_GF_MIN - hcp) * INSUFFICIENT_HCP_COST);
      return scored(bid, deduct(penTotal(p)),
        `${sp} spades: game-forcing 3${sym} after Stayman`, p);
    }
  }

  // No fit — bid NT
  if (strain === Strain.NOTRUMP) {
    /** @type {PenaltyItem[]} */
    const p = [];
    if (level === 2) {
      pen(p, `${hcp} HCP, need ${STAYMAN_INV_MIN}-${STAYMAN_INV_MAX}`,
        hcpDev(hcp, STAYMAN_INV_MIN, STAYMAN_INV_MAX) * INSUFFICIENT_HCP_COST);
      if (hasFit) pen(p, 'Have major fit: prefer raising', 3);
      return scored(bid, deduct(penTotal(p)),
        `${hcp} HCP: 2NT invitational after Stayman`, p);
    }
    if (level === 3) {
      pen(p, `${hcp} HCP, need ${STAYMAN_GF_MIN}+`,
        Math.max(0, STAYMAN_GF_MIN - hcp) * INSUFFICIENT_HCP_COST);
      if (hasFit) pen(p, 'Have major fit: prefer raising', 3);
      return scored(bid, deduct(penTotal(p)),
        `${hcp} HCP: 3NT game after Stayman`, p);
    }
  }

  // Everything else: generic penalty
  /** @type {PenaltyItem[]} */
  const p = [];
  const minHcp = 13 + (level - 2) * 3;
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * INSUFFICIENT_HCP_COST);
  return scored(bid, deduct(penTotal(p)),
    `${level}${sym}: non-standard Stayman continuation`, p);
}

/** @param {number} hcp @param {number} min @param {number} max */
function hcpDev(hcp, min, max) {
  if (hcp < min) return min - hcp;
  if (hcp > max) return hcp - max;
  return 0;
}

// ═════════════════════════════════════════════════════════════════════
// BLACKWOOD RESPONSE (partner bid 4NT, suit fit established)
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Hand} hand
 * @param {Auction} auction
 * @param {import('../model/bid.js').Strain} agreedStrain
 * @returns {BidRecommendation[]}
 */
function buildBlackwoodResponses(hand, auction, agreedStrain) {
  const aces = countAces(hand);
  const correctIdx = aces % 4;
  const correctStrain = BW_RESPONSE_STRAINS[correctIdx];
  const correctSym = STRAIN_SYMBOLS[correctStrain];

  const last = lastContractBid(auction);
  /** @type {BidRecommendation[]} */
  const results = [];

  results.push(forcedPenalty(pass(),
    `Blackwood is forcing: must show aces (5${correctSym})`));

  for (let level = 4; level <= 7; level++) {
    for (const strain of STRAIN_ORDER) {
      const bid = contractBid(level, strain);
      if (!last || isHigher(bid, last)) {
        results.push(scoreBWCandidate(bid, level, strain, aces, correctStrain, agreedStrain));
      }
    }
  }

  return results.sort((a, b) => b.priority - a.priority);
}

/**
 * @param {ContractBid} bid
 * @param {number} level
 * @param {import('../model/bid.js').Strain} strain
 * @param {number} aces
 * @param {import('../model/bid.js').Strain} correctStrain
 * @param {import('../model/bid.js').Strain} agreedStrain
 * @returns {BidRecommendation}
 */
function scoreBWCandidate(bid, level, strain, aces, correctStrain, agreedStrain) {
  if (level === 5 && /** @type {readonly string[]} */ (BW_RESPONSE_STRAINS).includes(strain)) {
    const respAces = /** @type {readonly string[]} */ (BW_RESPONSE_STRAINS).indexOf(strain);
    const sym = STRAIN_SYMBOLS[strain];
    if (strain === correctStrain) {
      return scored(bid, deduct(0),
        `5${sym}: showing ${aces} ace${aces !== 1 ? 's' : ''} (Blackwood)`, []);
    }
    /** @type {PenaltyItem[]} */
    const p = [];
    pen(p, `Shows ${respAces} aces, have ${aces}`, WRONG_RESPONSE_COST);
    return scored(bid, deduct(penTotal(p)),
      `5${sym}: would show ${respAces} aces (have ${aces})`, p);
  }

  if (level === 5 && strain === Strain.NOTRUMP) {
    /** @type {PenaltyItem[]} */
    const p = [];
    pen(p, '5NT is king-ask, not a Blackwood response', WRONG_RESPONSE_COST);
    return scored(bid, deduct(penTotal(p)),
      '5NT: king-ask (only opener bids this after hearing aces)', p);
  }

  if (level === 6 && strain === agreedStrain) {
    /** @type {PenaltyItem[]} */
    const p = [];
    pen(p, 'Must respond with ace count first', WRONG_RESPONSE_COST * 0.6);
    return scored(bid, deduct(penTotal(p)),
      `6${STRAIN_SYMBOLS[strain]}: show aces first, then decide slam`, p);
  }

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, 'Not a Blackwood response', WRONG_RESPONSE_COST);
  return scored(bid, deduct(penTotal(p)), 'Must respond to Blackwood with ace count', p);
}

// ═════════════════════════════════════════════════════════════════════
// GERBER RESPONSE (partner bid 4♣ over NT)
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Hand} hand
 * @param {Auction} auction
 * @returns {BidRecommendation[]}
 */
function buildGerberResponses(hand, auction) {
  const aces = countAces(hand);
  const correctIdx = aces % 4;
  const correctStrain = GERBER_RESPONSE_STRAINS[correctIdx];
  const correctLabel = correctStrain === Strain.NOTRUMP
    ? '4NT' : `4${STRAIN_SYMBOLS[correctStrain]}`;

  const last = lastContractBid(auction);
  /** @type {BidRecommendation[]} */
  const results = [];

  results.push(forcedPenalty(pass(),
    `Gerber is forcing: must show aces (${correctLabel})`));

  for (let level = 4; level <= 7; level++) {
    for (const strain of STRAIN_ORDER) {
      const bid = contractBid(level, strain);
      if (!last || isHigher(bid, last)) {
        results.push(scoreGerberCandidate(bid, level, strain, aces, correctStrain));
      }
    }
  }

  return results.sort((a, b) => b.priority - a.priority);
}

/**
 * @param {ContractBid} bid
 * @param {number} level
 * @param {import('../model/bid.js').Strain} strain
 * @param {number} aces
 * @param {import('../model/bid.js').Strain} correctStrain
 * @returns {BidRecommendation}
 */
function scoreGerberCandidate(bid, level, strain, aces, correctStrain) {
  if (level === 4 && /** @type {readonly string[]} */ (GERBER_RESPONSE_STRAINS).includes(strain)) {
    const respAces = /** @type {readonly string[]} */ (GERBER_RESPONSE_STRAINS).indexOf(strain);
    const label = strain === Strain.NOTRUMP ? '4NT' : `4${STRAIN_SYMBOLS[strain]}`;
    if (strain === correctStrain) {
      return scored(bid, deduct(0),
        `${label}: showing ${aces} ace${aces !== 1 ? 's' : ''} (Gerber)`, []);
    }
    /** @type {PenaltyItem[]} */
    const p = [];
    pen(p, `Shows ${respAces} aces, have ${aces}`, WRONG_RESPONSE_COST);
    return scored(bid, deduct(penTotal(p)),
      `${label}: would show ${respAces} aces (have ${aces})`, p);
  }

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, 'Not a Gerber response', WRONG_RESPONSE_COST);
  return scored(bid, deduct(penTotal(p)), 'Must respond to Gerber with ace count', p);
}

// ═════════════════════════════════════════════════════════════════════
// KING-ASK RESPONSE (partner bid 5NT after Blackwood exchange)
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Hand} hand
 * @param {Auction} auction
 * @param {import('../model/bid.js').Strain | null} agreedStrain
 * @returns {BidRecommendation[]}
 */
function buildKingAskResponses(hand, auction, agreedStrain) {
  const kings = countKings(hand);
  const correctIdx = Math.min(kings, 3);
  const correctStrain = KING_RESPONSE_STRAINS[correctIdx];
  const correctSym = STRAIN_SYMBOLS[correctStrain];

  const last = lastContractBid(auction);
  /** @type {BidRecommendation[]} */
  const results = [];

  results.push(forcedPenalty(pass(),
    `5NT king-ask is forcing: must show kings (6${correctSym})`));

  for (let level = 5; level <= 7; level++) {
    for (const strain of STRAIN_ORDER) {
      const bid = contractBid(level, strain);
      if (!last || isHigher(bid, last)) {
        results.push(
          scoreKingCandidate(bid, level, strain, kings, correctStrain, agreedStrain));
      }
    }
  }

  return results.sort((a, b) => b.priority - a.priority);
}

/**
 * @param {ContractBid} bid
 * @param {number} level
 * @param {import('../model/bid.js').Strain} strain
 * @param {number} kings
 * @param {import('../model/bid.js').Strain} correctStrain
 * @param {import('../model/bid.js').Strain | null} agreedStrain
 * @returns {BidRecommendation}
 */
function scoreKingCandidate(bid, level, strain, kings, correctStrain, agreedStrain) {
  if (level === 6 && /** @type {readonly string[]} */ (KING_RESPONSE_STRAINS).includes(strain)) {
    const respKings = /** @type {readonly string[]} */ (KING_RESPONSE_STRAINS).indexOf(strain);
    const sym = STRAIN_SYMBOLS[strain];
    if (strain === correctStrain) {
      return scored(bid, deduct(0),
        `6${sym}: showing ${kings} king${kings !== 1 ? 's' : ''} (king-ask)`, []);
    }
    /** @type {PenaltyItem[]} */
    const p = [];
    pen(p, `Shows ${respKings} kings, have ${kings}`, WRONG_RESPONSE_COST);
    return scored(bid, deduct(penTotal(p)),
      `6${STRAIN_SYMBOLS[strain]}: would show ${respKings} kings (have ${kings})`, p);
  }

  if (level === 7 && strain === agreedStrain && kings >= 3) {
    /** @type {PenaltyItem[]} */
    const p = [];
    if (kings < 4) pen(p, `${kings} kings: grand slam is risky`, 3);
    return scored(bid, deduct(penTotal(p)),
      `7${STRAIN_SYMBOLS[strain]}: grand slam with ${kings} kings`, p);
  }

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, 'Not a king-ask response', WRONG_RESPONSE_COST);
  return scored(bid, deduct(penTotal(p)), 'Must respond to 5NT with king count', p);
}

// ═════════════════════════════════════════════════════════════════════
// SLAM INITIATION SCORING
// ═════════════════════════════════════════════════════════════════════

/**
 * Score 4NT as Blackwood initiation.
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} agreedStrain
 * @param {number} combinedMin
 * @returns {BidRecommendation}
 */
function scoreBlackwoodInit(hand, eval_, agreedStrain, combinedMin) {
  const aces = countAces(hand);
  const bid = contractBid(4, Strain.NOTRUMP);
  const agreedName = STRAIN_DISPLAY[agreedStrain];
  /** @type {PenaltyItem[]} */
  const p = [];

  if (combinedMin < SLAM_COMBINED_MIN) {
    pen(p, `Combined ${combinedMin}, need ${SLAM_COMBINED_MIN}+`,
      (SLAM_COMBINED_MIN - combinedMin) * INSUFFICIENT_HCP_COST);
  }
  if (aces === 0) {
    pen(p, 'No aces: dangerous to initiate Blackwood', NO_ACES_BW_COST);
  }

  let expl;
  if (penTotal(p) < 0.5) {
    expl = `${eval_.hcp} HCP, ${agreedName} fit, ${aces} aces: Blackwood 4NT`;
  } else if (combinedMin < SLAM_COMBINED_MIN) {
    expl = `Combined ${combinedMin}: need ${SLAM_COMBINED_MIN}+ for slam`;
  } else {
    expl = `${aces} aces: risky to use Blackwood`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/**
 * Score 4♣ as Gerber initiation over partner's NT.
 * @param {Evaluation} eval_
 * @param {number} combinedMin
 * @returns {BidRecommendation}
 */
function scoreGerberInit(eval_, combinedMin) {
  const bid = contractBid(4, Strain.CLUBS);
  /** @type {PenaltyItem[]} */
  const p = [];

  if (combinedMin < SLAM_COMBINED_MIN) {
    pen(p, `Combined ${combinedMin}, need ${SLAM_COMBINED_MIN}+`,
      (SLAM_COMBINED_MIN - combinedMin) * INSUFFICIENT_HCP_COST);
  }

  const cSym = STRAIN_SYMBOLS[Strain.CLUBS];
  let expl;
  if (penTotal(p) < 0.5) {
    expl = `${eval_.hcp} HCP over partner's NT: Gerber 4${cSym} (asking aces)`;
  } else {
    expl = `Combined ${combinedMin}: need ${SLAM_COMBINED_MIN}+ for Gerber`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/**
 * Score a cue bid (new suit at 4+ level with a first-round control).
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} cueBid
 * @param {import('../model/bid.js').Strain} cueSuit
 * @param {import('../model/bid.js').Strain} agreedStrain
 * @param {number} combinedMin
 * @returns {BidRecommendation}
 */
function scoreCueBidInit(hand, eval_, cueBid, cueSuit, agreedStrain, combinedMin) {
  const hasCtrl = hasFirstRoundControl(hand, cueSuit);
  const { level } = cueBid;
  const sym = STRAIN_SYMBOLS[cueSuit];
  const name = STRAIN_DISPLAY[cueSuit];
  const agreedName = STRAIN_DISPLAY[agreedStrain];
  /** @type {PenaltyItem[]} */
  const p = [];

  if (!hasCtrl) {
    pen(p, `No first-round control in ${name}`, NO_CONTROL_CUE_COST);
  }
  if (combinedMin < CUE_COMBINED_MIN) {
    pen(p, `Combined ${combinedMin}, need ${CUE_COMBINED_MIN}+`,
      (CUE_COMBINED_MIN - combinedMin) * INSUFFICIENT_HCP_COST);
  }

  let expl;
  if (hasCtrl && combinedMin >= CUE_COMBINED_MIN) {
    expl = `Control in ${name}: cue bid ${level}${sym} (${agreedName} fit, slam try)`;
  } else if (!hasCtrl) {
    expl = `No control in ${name}: cannot cue bid`;
  } else {
    expl = `Combined ${combinedMin}: need ${CUE_COMBINED_MIN}+ for cue bid`;
  }
  return scored(cueBid, deduct(penTotal(p)), expl, p);
}

/**
 * Score a direct slam bid (6-level or 7-level).
 * @param {Evaluation} eval_
 * @param {ContractBid} slamBid
 * @param {import('../model/bid.js').Strain} slamStrain
 * @param {number} combinedMin
 * @param {number} level
 * @returns {BidRecommendation}
 */
function scoreDirectSlam(eval_, slamBid, slamStrain, combinedMin, level) {
  const isGrand = level === 7;
  const minCombined = isGrand ? GRAND_COMBINED_MIN : SLAM_COMBINED_MIN;
  const sym = slamStrain === Strain.NOTRUMP ? 'NT' : STRAIN_SYMBOLS[slamStrain];
  /** @type {PenaltyItem[]} */
  const p = [];

  if (combinedMin < minCombined) {
    pen(p, `Combined ${combinedMin}, need ${minCombined}+`,
      (minCombined - combinedMin) * SLAM_HCP_COST);
  }

  let expl;
  if (combinedMin >= minCombined) {
    expl = `Combined ${combinedMin}: ${level}${sym}${isGrand ? ' grand' : ''} slam`;
  } else {
    expl = `Combined ${combinedMin}: need ${minCombined}+ for ${level}${sym}`;
  }
  return scored(slamBid, deduct(penTotal(p)), expl, p);
}

// ═════════════════════════════════════════════════════════════════════
// AUCTION ANALYSIS
// ═════════════════════════════════════════════════════════════════════

/**
 * Extract structured information about the bidding history.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {AuctionAnalysis}
 */
function analyzeAuction(auction, seat) {
  const partner = PARTNER_SEAT_MAP[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);

  /** @type {ContractBid[]} */
  const myBids = [];
  /** @type {ContractBid[]} */
  const partnerBids = [];
  /** @type {Seat | null} */
  let firstBidder = null;

  for (let i = 0; i < auction.bids.length; i++) {
    const bid = auction.bids[i];
    if (bid.type !== 'contract') continue;
    const bidSeat = SEATS[(dealerIdx + i) % SEATS.length];
    if (!firstBidder) firstBidder = bidSeat;
    if (bidSeat === seat) myBids.push(/** @type {ContractBid} */ (bid));
    else if (bidSeat === partner) partnerBids.push(/** @type {ContractBid} */ (bid));
  }

  let agreedStrain = findAgreedStrain(myBids, partnerBids);

  return {
    myBids,
    partnerBids,
    agreedStrain,
    partnerLastBid: partnerBids.length > 0 ? partnerBids[partnerBids.length - 1] : null,
    partnerFirstBid: partnerBids.length > 0 ? partnerBids[0] : null,
    myFirstBid: myBids.length > 0 ? myBids[0] : null,
    partnerIsOpener: firstBidder === partner,
  };
}

/**
 * Find a suit bid by both partners (the agreed trump suit).
 * @param {ContractBid[]} myBids
 * @param {ContractBid[]} partnerBids
 * @returns {import('../model/bid.js').Strain | null}
 */
function findAgreedStrain(myBids, partnerBids) {
  const mySuits = new Set(
    myBids.filter(b => b.strain !== Strain.NOTRUMP).map(b => b.strain));
  const partnerSuits = new Set(
    partnerBids.filter(b => b.strain !== Strain.NOTRUMP).map(b => b.strain));

  for (const suit of mySuits) {
    if (partnerSuits.has(suit)) return suit;
  }
  return null;
}

/**
 * Did we previously open or rebid NT (making partner's 4♣ Gerber)?
 * @param {AuctionAnalysis} ctx
 * @returns {boolean}
 */
function hasNTContext(ctx) {
  return ctx.myBids.some(b => b.strain === Strain.NOTRUMP);
}

/**
 * Did partner open or rebid NT (so we could initiate Gerber)?
 * @param {AuctionAnalysis} ctx
 * @returns {boolean}
 */
function isPartnerNTContext(ctx) {
  return ctx.partnerFirstBid !== null
    && ctx.partnerFirstBid.strain === Strain.NOTRUMP;
}

/**
 * Was there a completed Blackwood exchange (partner 4NT → we 5x)?
 * This makes partner's subsequent 5NT a king-ask.
 * @param {AuctionAnalysis} ctx
 * @returns {boolean}
 */
function wasBlackwoodExchange(ctx) {
  if (ctx.partnerBids.length < 2 || ctx.myBids.length === 0) return false;
  const prev = ctx.partnerBids[ctx.partnerBids.length - 2];
  if (prev.level !== 4 || prev.strain !== Strain.NOTRUMP) return false;

  const myLast = ctx.myBids[ctx.myBids.length - 1];
  if (myLast.level !== 5 || myLast.strain === Strain.NOTRUMP) return false;

  return ctx.agreedStrain !== null;
}

/**
 * Find which seat made the last contract bid in the auction.
 * @param {Auction} auction
 * @returns {Seat | null}
 */
function lastContractBidBySeat(auction) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    if (auction.bids[i].type === 'contract') {
      return SEATS[(dealerIdx + i) % SEATS.length];
    }
  }
  return null;
}

/**
 * Estimate partner's minimum HCP from their first bid and role.
 * @param {AuctionAnalysis} ctx
 * @returns {number}
 */
function estimatePartnerMinHCP(ctx) {
  const pfb = ctx.partnerFirstBid;
  if (!pfb) return 0;

  if (ctx.partnerIsOpener) {
    if (pfb.strain === Strain.NOTRUMP && pfb.level === 1) return 15;
    if (pfb.strain === Strain.NOTRUMP && pfb.level === 2) return 20;
    if (pfb.strain === Strain.CLUBS && pfb.level === 2) return 22;
    if (pfb.level === 1) return 13;
    if (pfb.level === 2) return 5;
    return 5;
  }

  const mfb = ctx.myFirstBid;
  if (pfb.strain === Strain.NOTRUMP && pfb.level === 1) return 6;
  if (pfb.strain === Strain.NOTRUMP && pfb.level === 2) return 13;
  if (mfb && pfb.strain === mfb.strain) {
    if (pfb.level === 2) return 6;
    if (pfb.level === 3) return 10;
    if (pfb.level >= 4) return 13;
  }
  if (pfb.level === 1) return 6;
  if (pfb.level === 2) return 10;
  return 6;
}

// ═════════════════════════════════════════════════════════════════════
// HAND ANALYSIS HELPERS
// ═════════════════════════════════════════════════════════════════════

/** @param {Hand} hand @returns {number} */
function countAces(hand) {
  return hand.cards.filter(c => c.rank === Rank.ACE).length;
}

/** @param {Hand} hand @returns {number} */
function countKings(hand) {
  return hand.cards.filter(c => c.rank === Rank.KING).length;
}

/**
 * Check for first-round control: ace or void in the suit.
 * @param {Hand} hand
 * @param {import('../model/bid.js').Strain} strain
 * @returns {boolean}
 */
function hasFirstRoundControl(hand, strain) {
  const suitCards = hand.cards.filter(
    c => c.suit === /** @type {any} */ (strain));
  if (suitCards.length === 0) return true;
  return suitCards.some(c => c.rank === Rank.ACE);
}

// ═════════════════════════════════════════════════════════════════════
// BID COMPARISON HELPERS
// ═════════════════════════════════════════════════════════════════════

/** @param {ContractBid} a @param {ContractBid} b @returns {boolean} */
function isHigher(a, b) {
  if (a.level !== b.level) return a.level > b.level;
  return STRAIN_ORDER.indexOf(a.strain) > STRAIN_ORDER.indexOf(b.strain);
}

/**
 * Identify suits this player has already cue-bid (level 4+ in a
 * non-agreed, non-NT suit). Prevents redundant re-cue-bids of
 * controls that have already been communicated.
 * @param {ContractBid[]} bids - the player's own bids
 * @param {import('../model/bid.js').Strain} agreedStrain
 * @returns {Set<import('../model/bid.js').Strain>}
 */
function cuedSuits(bids, agreedStrain) {
  /** @type {Set<import('../model/bid.js').Strain>} */
  const suits = new Set();
  for (const b of bids) {
    if (b.level >= 4 && b.strain !== agreedStrain && b.strain !== Strain.NOTRUMP) {
      suits.add(b.strain);
    }
  }
  return suits;
}

/**
 * Cheapest level at which a cue bid in the given strain can be made
 * (at least level 4, above the last contract bid).
 * @param {import('../model/bid.js').Strain} strain
 * @param {ContractBid} lastBid
 * @returns {number}
 */
function cheapestCueBidLevel(strain, lastBid) {
  const base = STRAIN_ORDER.indexOf(strain) > STRAIN_ORDER.indexOf(lastBid.strain)
    ? lastBid.level
    : lastBid.level + 1;
  return Math.max(4, base);
}

// ── Scoring helpers ──────────────────────────────────────────────────

/** @param {number} penalty */
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
 * Create a recommendation with a forcing-pass penalty.
 * @param {Bid} bid
 * @param {string} explanation
 * @returns {BidRecommendation}
 */
function forcedPenalty(bid, explanation) {
  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, explanation, FORCING_PASS_COST);
  return scored(bid, deduct(penTotal(p)), explanation, p);
}

import { SEATS } from '../model/deal.js';
import {
  createAuction, addBid, pass, isComplete, currentSeat,
  isLegalBid, lastContractBid,
} from '../model/bid.js';
import { Rank } from '../model/card.js';
import { evaluate } from '../engine/evaluate.js';
import { getRecommendations } from '../engine/advisor.js';
import {
  classifyAuction, findPartnerBid, findOwnBid, findOpponentBid,
  hasPartnerDoubled, isBalancingSeat,
} from '../engine/context.js';

/**
 * @typedef {import('../model/deal.js').Deal} Deal
 * @typedef {import('../model/deal.js').Seat} Seat
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('../model/bid.js').ContractBid} ContractBid
 * @typedef {import('../engine/evaluate.js').Evaluation} Evaluation
 * @typedef {import('../model/hand.js').Hand} Hand
 *
 * @typedef {{
 *   id: string,
 *   seat: Seat,
 *   bidIndex: number,
 *   phase: 'opening' | 'responding' | 'rebid' | 'competitive',
 * }} ScenarioTag
 */

export const SCENARIO_IDS = [
  'O-1', 'O-2', 'O-3', 'O-4', 'O-5', 'O-6', 'O-7',
  'R-1', 'R-2', 'R-3', 'R-4', 'R-5', 'R-6', 'R-7', 'R-8', 'R-9', 'R-10',
  'RB-1', 'RB-2', 'RB-3', 'RB-4', 'RB-5', 'RB-6', 'RB-7', 'RB-8', 'RB-9',
  'C-1', 'C-2', 'C-3', 'C-4', 'C-5', 'C-6', 'C-7', 'C-8', 'C-9', 'C-10', 'C-11', 'C-12',
  'S-1', 'S-2', 'S-3', 'S-4', 'S-5', 'S-6', 'S-7', 'S-8', 'S-9',
  'X-1', 'X-2', 'X-3',
];

/** @type {Readonly<Record<Seat, Seat>>} */
const PARTNER = { N: 'S', S: 'N', E: 'W', W: 'E' };

/** Strain → shape index (shape order: S, H, D, C). */
const SI = /** @type {Record<string, number>} */ ({ S: 0, H: 1, D: 2, C: 3 });

const MAX_AUCTION_BIDS = 60;

// ═════════════════════════════════════════════════════════════════════
// PUBLIC
// ═════════════════════════════════════════════════════════════════════

/**
 * Simulate a full auction for a deal, tagging each bidding turn with
 * every scenario ID that applies to the situation that seat faces.
 *
 * @param {Deal} hands
 * @param {Seat} dealer
 * @returns {{ fullAuction: Auction, tags: ScenarioTag[] }}
 */
export function classifyDeal(hands, dealer) {
  /** @type {Record<string, Evaluation>} */
  const evals = /** @type {any} */ ({});
  for (const s of SEATS) evals[s] = evaluate(hands[s]);

  let auction = createAuction(dealer);
  /** @type {ScenarioTag[]} */
  const tags = [];
  let count = 0;

  while (!isComplete(auction) && count < MAX_AUCTION_BIDS) {
    try {
      const seat = currentSeat(auction);
      const hand = hands[seat];
      const ev = evals[seat];

      const ctx = classifyAuction(auction, seat);
      /** @type {'opening' | 'responding' | 'rebid' | 'competitive'} */
      const phase = ctx.phase === 'passed-out' ? 'opening' : /** @type {any} */ (ctx.phase);

      const ids = classifySituation(hand, ev, auction, seat, evals);
      for (const id of ids) {
        tags.push({ id, seat, bidIndex: auction.bids.length, phase });
      }

      const recs = getRecommendations(hand, auction, seat);
      let topBid = pass();
      if (recs.length > 0 && isLegalBid(auction, recs[0].bid)) {
        topBid = recs[0].bid;
      }
      auction = addBid(auction, topBid);
    } catch {
      break;
    }
    count++;
  }

  addCrossCutting(tags);
  return { fullAuction: auction, tags };
}

// ═════════════════════════════════════════════════════════════════════
// SITUATION DISPATCHER
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Hand} hand
 * @param {Evaluation} ev
 * @param {Auction} auction
 * @param {Seat} seat
 * @param {Record<string, Evaluation>} allEvals
 * @returns {string[]}
 */
function classifySituation(hand, ev, auction, seat, allEvals) {
  const ids = [];
  const ctx = classifyAuction(auction, seat);

  switch (ctx.phase) {
    case 'opening':
      tagOpening(ev, ctx.seatPosition, ids);
      break;
    case 'responding': {
      const oppBid = findOpponentBid(auction, seat);
      if (oppBid) {
        tagCompetitiveResponse(hand, ev, auction, seat, oppBid, ids);
      } else {
        tagResponding(hand, ev, auction, seat, ids);
      }
      break;
    }
    case 'rebid':
      tagRebid(hand, ev, auction, seat, ids);
      break;
    case 'competitive':
      tagCompetitive(hand, ev, auction, seat, ids);
      break;
  }

  tagSlam(hand, ev, auction, seat, allEvals, ids);
  return ids;
}

// ═════════════════════════════════════════════════════════════════════
// OPENING  (O-1 … O-7)
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Evaluation} ev
 * @param {number} seatPos  1-4
 * @param {string[]} ids
 */
function tagOpening(ev, seatPos, ids) {
  const { hcp, shape, shapeClass } = ev;
  const maxLen = Math.max(...shape);

  if (hcp >= 11 && hcp <= 12) {
    const sorted = [...shape].sort((a, b) => b - a);
    if (hcp + sorted[0] + sorted[1] >= 20) ids.push('O-1');
  }

  if (seatPos === 4 && hcp >= 11 && hcp <= 14) {
    const rule15 = hcp + shape[SI.S];
    if (rule15 >= 13 && rule15 <= 17) ids.push('O-2');
  }

  if (hcp >= 15 && hcp <= 17 && shapeClass === 'balanced') {
    if (shape[SI.S] === 5 || shape[SI.H] === 5) ids.push('O-3');
  }

  if (hcp >= 22 && (shapeClass === 'balanced' || shapeClass === 'semi-balanced')) {
    ids.push('O-4');
  }

  if (hcp >= 5 && hcp <= 11 && maxLen === 6) ids.push('O-5');

  if (hcp >= 5 && hcp <= 10 && maxLen >= 7 && seatPos !== 4) ids.push('O-6');

  if (hcp >= 13 && hcp <= 21 && shape[SI.S] < 5 && shape[SI.H] < 5) {
    if (shape[SI.D] === shape[SI.C] && (shape[SI.D] === 3 || shape[SI.D] === 4)) {
      ids.push('O-7');
    }
  }
}

// ═════════════════════════════════════════════════════════════════════
// RESPONDING — no opponent interference  (R-1 … R-10)
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Hand} _hand
 * @param {Evaluation} ev
 * @param {Auction} auction
 * @param {Seat} seat
 * @param {string[]} ids
 */
function tagResponding(_hand, ev, auction, seat, ids) {
  const { hcp, shape, shapeClass } = ev;
  const partnerBid = findPartnerBid(auction, seat);
  if (!partnerBid) return;
  const ps = partnerBid.strain;
  const pl = partnerBid.level;

  // Partner opened 1NT
  if (pl === 1 && ps === 'NT') {
    if (hcp >= 8 && (shape[SI.S] >= 4 || shape[SI.H] >= 4)) ids.push('R-1');
    if (hcp >= 16 && hcp <= 17 && shapeClass === 'balanced' &&
        shape[SI.S] < 4 && shape[SI.H] < 4) ids.push('R-10');
    return;
  }

  // Partner opened 2C (strong)
  if (pl === 2 && ps === 'C' && isFirstBidBy(auction, PARTNER[seat])) {
    ids.push('R-8');
    return;
  }

  // Partner opened weak two (2D/2H/2S)
  if (pl === 2 && ps !== 'C' && ps !== 'NT' && isFirstBidBy(auction, PARTNER[seat])) {
    ids.push('R-9');
    return;
  }

  // Partner opened 1 of a suit
  if (pl === 1 && ps !== 'NT') {
    const isMajor = ps === 'H' || ps === 'S';
    const support = SI[ps] !== undefined ? shape[SI[ps]] : 0;
    const maxSuit = Math.max(...shape);

    if (hcp >= 4 && hcp <= 6)                                        ids.push('R-2');
    if (hcp >= 10 && hcp <= 12 && maxSuit >= 4)                      ids.push('R-3');
    if (isMajor && hcp >= 9 && hcp <= 11 && support >= 3 && support <= 4) ids.push('R-4');
    if (isMajor && hcp >= 5 && hcp <= 10 && support >= 5 &&
        shapeClass === 'unbalanced')                                  ids.push('R-5');
    if (hcp >= 19 && maxSuit >= 5)                                    ids.push('R-6');
    if (hcp >= 13 && hcp <= 15 && shapeClass === 'balanced' &&
        (!isMajor || support < 3))                                    ids.push('R-7');
  }
}

// ═════════════════════════════════════════════════════════════════════
// COMPETITIVE RESPONSE — partner bid, opponent interfered  (C-8 … C-10)
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Hand} _hand
 * @param {Evaluation} ev
 * @param {Auction} auction
 * @param {Seat} seat
 * @param {ContractBid} oppBid
 * @param {string[]} ids
 */
function tagCompetitiveResponse(_hand, ev, auction, seat, oppBid, ids) {
  const { hcp, shape } = ev;
  const partnerBid = findPartnerBid(auction, seat);
  if (!partnerBid) return;

  const partnerOpened = isFirstBidBy(auction, PARTNER[seat]);

  // Partner overcalled → advancing partner's overcall
  if (!partnerOpened) {
    const support = SI[partnerBid.strain] !== undefined ? shape[SI[partnerBid.strain]] : 0;
    if (hcp >= 11 && support >= 3) ids.push('C-8');
    return;
  }

  // Partner opened, opponent overcalled → negative-double territory
  if (oppBid.strain === 'NT') return;
  const bidded = new Set([partnerBid.strain, oppBid.strain]);
  const hasUnbidMajor =
    (!bidded.has('H') && shape[SI.H] >= 4) ||
    (!bidded.has('S') && shape[SI.S] >= 4);

  if (hasUnbidMajor && hcp >= 6)  ids.push('C-9');
  if (!hasUnbidMajor && hcp >= 8) ids.push('C-10');
}

// ═════════════════════════════════════════════════════════════════════
// REBID  (RB-1 … RB-9)
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Hand} _hand
 * @param {Evaluation} ev
 * @param {Auction} auction
 * @param {Seat} seat
 * @param {string[]} ids
 */
function tagRebid(_hand, ev, auction, seat, ids) {
  const { hcp, shape } = ev;
  const myBid = findOwnBid(auction, seat);
  const partnerBid = findPartnerBid(auction, seat);
  if (!myBid || !partnerBid) return;

  // ── Opened 1NT ──────────────────────────────────────────────────
  if (myBid.level === 1 && myBid.strain === 'NT') {
    if (partnerBid.level === 2 && partnerBid.strain === 'C') {
      if (shape[SI.S] >= 4 && shape[SI.H] >= 4) ids.push('RB-1');
      if (shape[SI.S] < 4 && shape[SI.H] < 4)   ids.push('RB-2');
    }
    if (partnerBid.level === 2 && (partnerBid.strain === 'D' || partnerBid.strain === 'H')) {
      const tgtIdx = partnerBid.strain === 'D' ? SI.H : SI.S;
      if (shape[tgtIdx] >= 4 && hcp >= 17) ids.push('RB-3');
    }
    if (partnerBid.level === 2 && partnerBid.strain === 'NT') {
      if (hcp >= 15 && hcp <= 16) ids.push('RB-4');
    }
    return;
  }

  // ── Opened 1 of a suit ─────────────────────────────────────────
  if (myBid.level === 1 && myBid.strain !== 'NT') {
    const ms = myBid.strain;
    const isMajor = ms === 'H' || ms === 'S';

    // Partner raised my suit
    if (partnerBid.strain === ms) {
      if (isMajor && partnerBid.level === 2 && hcp >= 16 && hcp <= 19) ids.push('RB-6');
      if (isMajor && partnerBid.level === 3 && hcp >= 13 && hcp <= 15) ids.push('RB-7');
    }

    // Partner bid a new suit
    if (partnerBid.strain !== ms && partnerBid.strain !== 'NT') {
      const STRAIN_RANK = ['C', 'D', 'H', 'S'];
      const myRank = STRAIN_RANK.indexOf(ms);
      for (let i = myRank + 1; i < 4; i++) {
        if (shape[SI[STRAIN_RANK[i]]] >= 4 && hcp >= 15 && hcp <= 19) {
          ids.push('RB-5');
          break;
        }
      }
      const myLen = SI[ms] !== undefined ? shape[SI[ms]] : 0;
      const partLen = SI[partnerBid.strain] !== undefined ? shape[SI[partnerBid.strain]] : 0;
      if (myLen >= 6 && partLen >= 4) ids.push('RB-8');
    }

    // Partner bid 2NT (game-forcing)
    if (partnerBid.level === 2 && partnerBid.strain === 'NT') {
      if (hcp >= 13 && hcp <= 14) ids.push('RB-9');
    }
  }
}

// ═════════════════════════════════════════════════════════════════════
// COMPETITIVE — only opponents hold contract bids  (C-1 … C-7, C-11, C-12)
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Hand} _hand
 * @param {Evaluation} ev
 * @param {Auction} auction
 * @param {Seat} seat
 * @param {string[]} ids
 */
function tagCompetitive(_hand, ev, auction, seat, ids) {
  const { hcp, shape, shapeClass } = ev;
  const oppBid = findOpponentBid(auction, seat);
  if (!oppBid || oppBid.strain === 'NT') return;

  const oppLen = shape[SI[oppBid.strain]];
  const maxLen = Math.max(...shape);
  const bal = shapeClass === 'balanced' || shapeClass === 'semi-balanced';

  // ── Partner doubled (advancing) ──
  if (hasPartnerDoubled(auction, seat)) {
    ids.push('C-6');
    if (oppLen >= 5 && hcp >= 8)  ids.push('C-7');
    if (bal && hcp >= 6)          ids.push('C-12');
    return;
  }

  // ── Balancing seat ──
  if (isBalancingSeat(auction) && hcp >= 8 && hcp <= 14) ids.push('C-11');

  // ── Direct competitive ──
  if (hcp >= 8  && hcp <= 10 && maxLen >= 5)  ids.push('C-1');
  if (hcp >= 15 && hcp <= 18 && bal)          ids.push('C-2');
  if (hcp >= 12 && oppLen <= 2)               ids.push('C-3');
  if (hcp >= 12 && hcp <= 16 && maxLen >= 5 && oppLen <= 2) ids.push('C-4');
  if (hcp >= 5  && hcp <= 10 && maxLen >= 6)  ids.push('C-5');
}

// ═════════════════════════════════════════════════════════════════════
// SLAM & CONVENTIONS  (S-1 … S-9)
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Hand} hand
 * @param {Evaluation} ev
 * @param {Auction} auction
 * @param {Seat} seat
 * @param {Record<string, Evaluation>} allEvals
 * @param {string[]} ids
 */
function tagSlam(hand, ev, auction, seat, allEvals, ids) {
  const { hcp } = ev;
  const last = lastContractBid(auction);
  const partnerBid = findPartnerBid(auction, seat);

  // ── Convention responses ──
  if (last) {
    const lastSeat = lastContractBidSeat(auction);
    const fromPartner = lastSeat === PARTNER[seat];

    if (fromPartner && last.level === 4 && last.strain === 'NT') ids.push('S-1');

    if (fromPartner && last.level === 5 && last.strain === 'NT') {
      const kings = hand.cards.filter(c => c.rank === Rank.KING).length;
      ids.push(kings >= 3 ? 'S-3' : 'S-2');
    }

    if (fromPartner && last.level === 4 && last.strain === 'C') {
      const own = findOwnBid(auction, seat);
      if (own && own.strain === 'NT') ids.push('S-4');
    }
  }

  // ── Slam initiation ──
  if (partnerBid) {
    const combined = hcp + allEvals[PARTNER[seat]].hcp;

    if (combined >= 31 && combined <= 36)              ids.push('S-5');
    if (partnerBid.strain === 'NT' && combined >= 31)  ids.push('S-6');
    if (combined >= 33)                                ids.push('S-8');
    if (combined >= 29 && combined <= 32)              ids.push('S-9');
    if (combined >= 29) {
      const aces = hand.cards.filter(c => c.rank === Rank.ACE).length;
      if (aces >= 1) ids.push('S-7');
    }
  }
}

// ═════════════════════════════════════════════════════════════════════
// CROSS-CUTTING (X-1 … X-3)
// ═════════════════════════════════════════════════════════════════════

const X1_IDS = new Set(['RB-1', 'RB-2', 'RB-3', 'RB-9', 'S-1', 'S-2', 'S-4']);
const X2_IDS = new Set(['C-2', 'C-12']);
const X3_IDS = new Set(['O-5', 'C-1', 'C-5']);

/** @param {ScenarioTag[]} tags */
function addCrossCutting(tags) {
  /** @type {ScenarioTag[]} */
  const extra = [];
  for (const t of tags) {
    if (X1_IDS.has(t.id)) extra.push({ ...t, id: 'X-1' });
    if (X2_IDS.has(t.id)) extra.push({ ...t, id: 'X-2' });
    if (X3_IDS.has(t.id)) extra.push({ ...t, id: 'X-3' });
  }
  tags.push(...extra);
}

// ═════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════

/**
 * Which seat placed the last contract bid in the auction?
 * @param {Auction} auction
 * @returns {Seat | null}
 */
function lastContractBidSeat(auction) {
  const di = SEATS.indexOf(auction.dealer);
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    if (auction.bids[i].type === 'contract') {
      return SEATS[(di + i) % SEATS.length];
    }
  }
  return null;
}

/**
 * Was the first contract bid in the auction placed by `seat`?
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {boolean}
 */
function isFirstBidBy(auction, seat) {
  const di = SEATS.indexOf(auction.dealer);
  for (let i = 0; i < auction.bids.length; i++) {
    if (auction.bids[i].type === 'contract') {
      return SEATS[(di + i) % SEATS.length] === seat;
    }
  }
  return false;
}

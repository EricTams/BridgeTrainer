import { deal, SEATS } from '../model/deal.js';
import { createAuction, addBid, pass, dbl, Strain } from '../model/bid.js';
import { evaluate } from '../engine/evaluate.js';
import { getOpeningBids } from '../engine/opening.js';
import { getRespondingBids } from '../engine/responding.js';
import { getCompetitiveBids } from '../engine/competitive.js';
import { seatPosition } from '../engine/context.js';
import { getRecommendations } from '../engine/advisor.js';
import { Pool } from './pool.js';
import { pickScenario, DEFAULT_BALANCE } from './weights.js';

/**
 * @typedef {import('../model/deal.js').Deal} Deal
 * @typedef {import('../model/deal.js').Seat} Seat
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {{
 *   hands: Deal,
 *   auction: Auction,
 *   dealer: Seat,
 *   type: 'opening' | 'responding' | 'rebid' | 'competitive',
 * }} Puzzle
 */

const PLAYER_SEAT = /** @type {Seat} */ ('S');
const PARTNER_SEAT_ID = /** @type {Seat} */ ('N');

/** Dealers where South hasn't bid before North (clean responding position). */
const RESPONDING_DEALERS = /** @type {Seat[]} */ (['N', 'W']);

const MAX_REDEAL_ATTEMPTS = 50;
const MIN_OPENING_PRIORITY = 7;
const MIN_COMPETITIVE_PRIORITY = 5;

// ═════════════════════════════════════════════════════════════════════
// POOL-BASED GENERATION
// ═════════════════════════════════════════════════════════════════════

const INITIAL_POOL_SIZE = 5000;
const REFILL_THRESHOLD = 500;
const REFILL_BATCH_SIZE = 1000;
const MIN_BEST_PRIORITY = 2;
const MAX_POOL_RETRIES = 5;

/** @type {Pool | null} */
let pool = null;

/**
 * Generate a random puzzle using the pre-classified deal pool.
 *
 * On first call the pool is built synchronously (fast — a few hundred ms).
 * Subsequent calls draw from the pool; background refills keep it stocked.
 * Falls back to the legacy generators if the pool can't serve a deal.
 *
 * @returns {Puzzle}
 */
export function generatePuzzle() {
  if (!pool) {
    pool = new Pool();
    pool.build(INITIAL_POOL_SIZE);
  }

  for (let attempt = 0; attempt < MAX_POOL_RETRIES; attempt++) {
    const scenarioId = pickScenario(pool, DEFAULT_BALANCE);
    if (!scenarioId) break;
    const classified = pool.selectDeal(scenarioId);
    if (!classified) continue;
    const puzzle = buildPuzzleFromClassified(classified, scenarioId);
    if (puzzle) {
      scheduleRefill();
      return puzzle;
    }
  }

  scheduleRefill();
  return fallbackPuzzle();
}

/**
 * Build a Puzzle from a classified deal by rotating the seats so
 * that the seat which triggered the chosen scenario becomes South.
 *
 * @param {import('./pool.js').ClassifiedDeal} classified
 * @param {string} scenarioId
 * @returns {Puzzle | null}
 */
function buildPuzzleFromClassified(classified, scenarioId) {
  const tag = classified.tags.find(t => t.id === scenarioId);
  if (!tag) return null;

  const rotation =
    (SEATS.indexOf(PLAYER_SEAT) - SEATS.indexOf(tag.seat) + SEATS.length) % SEATS.length;

  // Rotate hands so the tagged seat becomes South
  /** @type {Partial<Deal>} */
  const rotated = {};
  for (let i = 0; i < SEATS.length; i++) {
    rotated[SEATS[(i + rotation) % SEATS.length]] = classified.hands[SEATS[i]];
  }

  // Rotate dealer the same way
  const rotatedDealer =
    SEATS[(SEATS.indexOf(classified.dealer) + rotation) % SEATS.length];

  // Partial auction: everything up to (but not including) the tagged bid
  const partialBids = classified.fullAuction.bids.slice(0, tag.bidIndex);
  const auction = Object.freeze({
    dealer: rotatedDealer,
    bids: Object.freeze([...partialBids]),
  });

  // Quality gate: reject puzzles where the engine's own best recommendation
  // has a poor priority — these produce confusing scoring for the player.
  const recs = getRecommendations(
    /** @type {Deal} */ (rotated)[PLAYER_SEAT], auction, PLAYER_SEAT);
  if (recs.length === 0 || recs[0].priority < MIN_BEST_PRIORITY) return null;

  /** @type {Puzzle['type']} */
  const type = (tag.phase === 'opening' || tag.phase === 'responding' ||
                tag.phase === 'rebid'   || tag.phase === 'competitive')
    ? tag.phase
    : 'opening';

  return {
    hands: /** @type {Deal} */ (rotated),
    auction,
    dealer: rotatedDealer,
    type,
  };
}

/** Schedule a background pool refill during idle time. */
function scheduleRefill() {
  if (!pool) return;
  const doRefill = () => pool?.refill(REFILL_THRESHOLD, REFILL_BATCH_SIZE);
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(doRefill);
  } else {
    setTimeout(doRefill, 200);
  }
}

// ═════════════════════════════════════════════════════════════════════
// LEGACY FALLBACK GENERATORS
// ═════════════════════════════════════════════════════════════════════

/**
 * Fall back to the original random-generation approach when the pool
 * cannot serve a deal (empty pool or missing scenario).
 * @returns {Puzzle}
 */
function fallbackPuzzle() {
  const r = Math.random();
  if (r < 0.25) return generateOpeningPuzzle();
  if (r < 0.50) return generateRespondingPuzzle();
  if (r < 0.75) return generateRebidPuzzle();
  return generateCompetitivePuzzle();
}

/**
 * Generate an opening-bid puzzle.
 * @returns {Puzzle}
 */
export function generateOpeningPuzzle() {
  const hands = deal();
  const dealer = pickRandomDealer();
  let auction = createAuction(dealer);

  const passCount = passesBeforeSeat(dealer, PLAYER_SEAT);
  for (let i = 0; i < passCount; i++) {
    auction = addBid(auction, pass());
  }

  return { hands, auction, dealer, type: 'opening' };
}

/**
 * Generate a responding puzzle where partner (North) opens at the 1-level.
 * @returns {Puzzle}
 */
export function generateRespondingPuzzle() {
  for (let i = 0; i < MAX_REDEAL_ATTEMPTS; i++) {
    const result = tryRespondingDeal();
    if (result) return result;
  }
  return generateOpeningPuzzle();
}

/** @returns {Puzzle | null} */
function tryRespondingDeal() {
  const hands = deal();
  const dealer = pickRespondingDealer();
  const northPos = seatPosition(dealer, PARTNER_SEAT_ID);
  const northEval = evaluate(hands[PARTNER_SEAT_ID]);
  const recs = getOpeningBids(hands[PARTNER_SEAT_ID], northEval, northPos);

  if (recs.length === 0) return null;
  const top = recs[0];
  if (top.bid.type !== 'contract') return null;
  if (top.bid.level > 2) return null;
  if (top.priority < MIN_OPENING_PRIORITY) return null;

  let auction = createAuction(dealer);

  const passesToNorth = passesBeforeSeat(dealer, PARTNER_SEAT_ID);
  for (let i = 0; i < passesToNorth; i++) {
    auction = addBid(auction, pass());
  }

  auction = addBid(auction, top.bid);

  const passesNorthToSouth = passesBeforeSeat(PARTNER_SEAT_ID, PLAYER_SEAT) - 1;
  for (let i = 0; i < passesNorthToSouth; i++) {
    auction = addBid(auction, pass());
  }

  return { hands, auction, dealer, type: 'responding' };
}

/** @returns {Seat} */
function pickRandomDealer() {
  return SEATS[Math.floor(Math.random() * SEATS.length)];
}

/** @returns {Seat} */
function pickRespondingDealer() {
  return RESPONDING_DEALERS[Math.floor(Math.random() * RESPONDING_DEALERS.length)];
}

/**
 * Generate a rebid puzzle where South opens, North responds, and South rebids.
 * @returns {Puzzle}
 */
export function generateRebidPuzzle() {
  for (let i = 0; i < MAX_REDEAL_ATTEMPTS; i++) {
    const result = tryRebidDeal();
    if (result) return result;
  }
  return generateOpeningPuzzle();
}

/** @returns {Puzzle | null} */
function tryRebidDeal() {
  const hands = deal();
  const dealer = pickRandomDealer();

  const southPos = seatPosition(dealer, PLAYER_SEAT);
  const southEval = evaluate(hands[PLAYER_SEAT]);
  const openingRecs = getOpeningBids(hands[PLAYER_SEAT], southEval, southPos);
  if (openingRecs.length === 0) return null;
  const topOpening = openingRecs[0];
  if (topOpening.bid.type !== 'contract') return null;
  if (topOpening.bid.level !== 1) return null;
  if (topOpening.priority < MIN_OPENING_PRIORITY) return null;

  let auction = createAuction(dealer);
  const passesToSouth = passesBeforeSeat(dealer, PLAYER_SEAT);
  for (let i = 0; i < passesToSouth; i++) {
    auction = addBid(auction, pass());
  }
  auction = addBid(auction, topOpening.bid);

  auction = addBid(auction, pass());

  const northEval = evaluate(hands[PARTNER_SEAT_ID]);
  const respRecs = getRespondingBids(
    hands[PARTNER_SEAT_ID], northEval, /** @type {import('../model/bid.js').ContractBid} */ (topOpening.bid));
  if (respRecs.length === 0) return null;
  const topResp = respRecs[0];
  if (topResp.bid.type !== 'contract') return null;
  if (topResp.bid.level > 3) return null;
  if (topResp.priority < MIN_OPENING_PRIORITY) return null;

  auction = addBid(auction, topResp.bid);

  auction = addBid(auction, pass());

  return { hands, auction, dealer, type: 'rebid' };
}

// ═════════════════════════════════════════════════════════════════════
// COMPETITIVE PUZZLES (legacy fallback)
// ═════════════════════════════════════════════════════════════════════

/**
 * Generate a competitive puzzle.
 * @returns {Puzzle}
 */
export function generateCompetitivePuzzle() {
  const r = Math.random();
  if (r < 0.30) return tryMany(tryDirectCompetitiveDeal);
  if (r < 0.50) return tryMany(tryAdvanceDoubleDeal);
  if (r < 0.65) return tryMany(tryAdvanceOvercallDeal);
  if (r < 0.85) return tryMany(tryNegativeDoubleDeal);
  return tryMany(tryBalancingDeal);
}

/**
 * @param {() => Puzzle | null} tryFn
 * @returns {Puzzle}
 */
function tryMany(tryFn) {
  for (let i = 0; i < MAX_REDEAL_ATTEMPTS; i++) {
    const result = tryFn();
    if (result) return result;
  }
  return generateOpeningPuzzle();
}

/** @returns {Puzzle | null} */
function tryDirectCompetitiveDeal() {
  const hands = deal();
  const dealer = /** @type {Seat} */ ('W');
  const westPos = seatPosition(dealer, 'W');
  const westEval = evaluate(hands['W']);
  const recs = getOpeningBids(hands['W'], westEval, westPos);

  if (recs.length === 0) return null;
  const top = recs[0];
  if (top.bid.type !== 'contract') return null;
  if (top.bid.level > 2) return null;
  if (top.priority < MIN_OPENING_PRIORITY) return null;

  let auction = createAuction(dealer);
  auction = addBid(auction, top.bid);
  auction = addBid(auction, pass());
  auction = addBid(auction, pass());

  return { hands, auction, dealer, type: 'competitive' };
}

/** @returns {Puzzle | null} */
function tryAdvanceDoubleDeal() {
  const hands = deal();
  const dealer = /** @type {Seat} */ ('W');
  const westEval = evaluate(hands['W']);
  const recs = getOpeningBids(hands['W'], westEval, 1);
  if (recs.length === 0) return null;
  const top = recs[0];
  if (top.bid.type !== 'contract') return null;
  if (top.bid.level !== 1) return null;
  if (top.priority < MIN_OPENING_PRIORITY) return null;

  const northEval = evaluate(hands['N']);
  if (northEval.hcp < 12) return null;
  const oppStrain = top.bid.strain;
  const oppLen = northEval.shape[
    [Strain.SPADES, Strain.HEARTS, Strain.DIAMONDS, Strain.CLUBS].indexOf(oppStrain)
  ];
  if (oppLen > 2) return null;

  let auction = createAuction(dealer);
  auction = addBid(auction, top.bid);
  auction = addBid(auction, dbl());
  auction = addBid(auction, pass());

  return { hands, auction, dealer, type: 'competitive' };
}

/** @returns {Puzzle | null} */
function tryAdvanceOvercallDeal() {
  const hands = deal();
  const dealer = /** @type {Seat} */ ('E');
  const eastEval = evaluate(hands['E']);
  const recs = getOpeningBids(hands['E'], eastEval, 1);
  if (recs.length === 0) return null;
  const topOpen = recs[0];
  if (topOpen.bid.type !== 'contract') return null;
  if (topOpen.bid.level !== 1) return null;
  if (topOpen.priority < MIN_OPENING_PRIORITY) return null;

  let auction = createAuction(dealer);
  auction = addBid(auction, topOpen.bid);
  auction = addBid(auction, pass());
  auction = addBid(auction, pass());

  const northEval = evaluate(hands['N']);
  const northRecs = getCompetitiveBids(hands['N'], northEval, auction, 'N');
  if (northRecs.length === 0) return null;
  const topOc = northRecs[0];
  if (topOc.bid.type !== 'contract') return null;
  if (topOc.priority < MIN_COMPETITIVE_PRIORITY) return null;

  auction = addBid(auction, topOc.bid);
  auction = addBid(auction, pass());

  return { hands, auction, dealer, type: 'competitive' };
}

/** @returns {Puzzle | null} */
function tryNegativeDoubleDeal() {
  const hands = deal();
  const dealer = /** @type {Seat} */ ('N');
  const northEval = evaluate(hands['N']);
  const northPos = seatPosition(dealer, 'N');
  const nRecs = getOpeningBids(hands['N'], northEval, northPos);
  if (nRecs.length === 0) return null;
  const topOpen = nRecs[0];
  if (topOpen.bid.type !== 'contract') return null;
  if (topOpen.bid.level !== 1) return null;
  if (topOpen.priority < MIN_OPENING_PRIORITY) return null;

  let auction = createAuction(dealer);
  auction = addBid(auction, topOpen.bid);

  const eastEval = evaluate(hands['E']);
  const eastRecs = getCompetitiveBids(hands['E'], eastEval, auction, 'E');
  if (eastRecs.length === 0) return null;
  const topOc = eastRecs[0];
  if (topOc.bid.type !== 'contract') return null;
  if (topOc.priority < MIN_COMPETITIVE_PRIORITY) return null;

  auction = addBid(auction, topOc.bid);

  return { hands, auction, dealer, type: 'competitive' };
}

/** @returns {Puzzle | null} */
function tryBalancingDeal() {
  const hands = deal();
  const dealer = /** @type {Seat} */ ('W');
  const westEval = evaluate(hands['W']);
  const recs = getOpeningBids(hands['W'], westEval, 1);
  if (recs.length === 0) return null;
  const top = recs[0];
  if (top.bid.type !== 'contract') return null;
  if (top.bid.level !== 1) return null;
  if (top.priority < MIN_OPENING_PRIORITY) return null;

  const southEval = evaluate(hands['S']);
  if (southEval.hcp < 8 || southEval.hcp > 14) return null;

  let auction = createAuction(dealer);
  auction = addBid(auction, top.bid);
  auction = addBid(auction, pass());
  auction = addBid(auction, pass());

  return { hands, auction, dealer, type: 'competitive' };
}

/**
 * Number of passes needed before a given seat gets to bid.
 * @param {Seat} dealer
 * @param {Seat} seat
 * @returns {number}
 */
function passesBeforeSeat(dealer, seat) {
  return (SEATS.indexOf(seat) - SEATS.indexOf(dealer) + SEATS.length) % SEATS.length;
}

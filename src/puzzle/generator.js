import { deal, SEATS } from '../model/deal.js';
import { createAuction, addBid, pass, Strain } from '../model/bid.js';
import { evaluate } from '../engine/evaluate.js';
import { getOpeningBids } from '../engine/opening.js';
import { getRespondingBids } from '../engine/responding.js';
import { seatPosition } from '../engine/context.js';

/**
 * @typedef {import('../model/deal.js').Deal} Deal
 * @typedef {import('../model/deal.js').Seat} Seat
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {{
 *   hands: Deal,
 *   auction: Auction,
 *   dealer: Seat,
 *   type: 'opening' | 'responding' | 'rebid',
 * }} Puzzle
 */

const PLAYER_SEAT = /** @type {Seat} */ ('S');
const PARTNER_SEAT = /** @type {Seat} */ ('N');

/** Dealers where South hasn't bid before North (clean responding position). */
const RESPONDING_DEALERS = /** @type {Seat[]} */ (['N', 'W']);

const MAX_REDEAL_ATTEMPTS = 50;
const MIN_OPENING_PRIORITY = 7;

/**
 * Generate a random puzzle (opening, responding, or rebid).
 * @returns {Puzzle}
 */
export function generatePuzzle() {
  const r = Math.random();
  if (r < 0.33) return generateOpeningPuzzle();
  if (r < 0.66) return generateRespondingPuzzle();
  return generateRebidPuzzle();
}

/**
 * Generate an opening-bid puzzle.
 * Dealer is randomly selected; all seats before South pass,
 * so South faces an opening decision from 1st-4th seat.
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
 * Redeals until North has a clear 1-level opening (suit or 1NT).
 * Falls back to an opening puzzle after MAX_REDEAL_ATTEMPTS.
 * @returns {Puzzle}
 */
export function generateRespondingPuzzle() {
  for (let i = 0; i < MAX_REDEAL_ATTEMPTS; i++) {
    const result = tryRespondingDeal();
    if (result) return result;
  }
  return generateOpeningPuzzle();
}

/**
 * Attempt to build a responding puzzle from a single deal.
 * Returns null if North wouldn't open at the 1-level.
 * @returns {Puzzle | null}
 */
function tryRespondingDeal() {
  const hands = deal();
  const dealer = pickRespondingDealer();
  const northPos = seatPosition(dealer, PARTNER_SEAT);
  const northEval = evaluate(hands[PARTNER_SEAT]);
  const recs = getOpeningBids(hands[PARTNER_SEAT], northEval, northPos);

  if (recs.length === 0) return null;
  const top = recs[0];
  if (top.bid.type !== 'contract') return null;
  if (top.bid.level !== 1) return null;
  if (top.priority < MIN_OPENING_PRIORITY) return null;

  let auction = createAuction(dealer);

  const passesToNorth = passesBeforeSeat(dealer, PARTNER_SEAT);
  for (let i = 0; i < passesToNorth; i++) {
    auction = addBid(auction, pass());
  }

  auction = addBid(auction, top.bid);

  const passesNorthToSouth = passesBeforeSeat(PARTNER_SEAT, PLAYER_SEAT) - 1;
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
 * Redeals until both South has a clear 1-level opening and North has a clear
 * non-pass response. Falls back to an opening puzzle after MAX_REDEAL_ATTEMPTS.
 * @returns {Puzzle}
 */
export function generateRebidPuzzle() {
  for (let i = 0; i < MAX_REDEAL_ATTEMPTS; i++) {
    const result = tryRebidDeal();
    if (result) return result;
  }
  return generateOpeningPuzzle();
}

/**
 * Attempt to build a rebid puzzle from a single deal.
 * @returns {Puzzle | null}
 */
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

  const northEval = evaluate(hands[PARTNER_SEAT]);
  const respRecs = getRespondingBids(
    hands[PARTNER_SEAT], northEval, /** @type {import('../model/bid.js').ContractBid} */ (topOpening.bid));
  if (respRecs.length === 0) return null;
  const topResp = respRecs[0];
  if (topResp.bid.type !== 'contract') return null;
  if (topResp.bid.level > 3) return null;
  if (topResp.priority < MIN_OPENING_PRIORITY) return null;

  auction = addBid(auction, topResp.bid);

  auction = addBid(auction, pass());

  return { hands, auction, dealer, type: 'rebid' };
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

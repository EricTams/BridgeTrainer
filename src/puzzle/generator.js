import { deal, SEATS } from '../model/deal.js';
import { createAuction, addBid, pass, Strain } from '../model/bid.js';
import { evaluate } from '../engine/evaluate.js';
import { getOpeningBids } from '../engine/opening.js';
import { seatPosition } from '../engine/context.js';

/**
 * @typedef {import('../model/deal.js').Deal} Deal
 * @typedef {import('../model/deal.js').Seat} Seat
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {{
 *   hands: Deal,
 *   auction: Auction,
 *   dealer: Seat,
 *   type: 'opening' | 'responding',
 * }} Puzzle
 */

const PLAYER_SEAT = /** @type {Seat} */ ('S');
const PARTNER_SEAT = /** @type {Seat} */ ('N');

/** Dealers where South hasn't bid before North (clean responding position). */
const RESPONDING_DEALERS = /** @type {Seat[]} */ (['N', 'W']);

const MAX_REDEAL_ATTEMPTS = 50;
const MIN_OPENING_PRIORITY = 7;

/**
 * Generate a random puzzle (opening or responding, 50/50).
 * @returns {Puzzle}
 */
export function generatePuzzle() {
  return Math.random() < 0.5
    ? generateOpeningPuzzle()
    : generateRespondingPuzzle();
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
 * Number of passes needed before a given seat gets to bid.
 * @param {Seat} dealer
 * @param {Seat} seat
 * @returns {number}
 */
function passesBeforeSeat(dealer, seat) {
  return (SEATS.indexOf(seat) - SEATS.indexOf(dealer) + SEATS.length) % SEATS.length;
}

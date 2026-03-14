import { SEATS } from '../model/deal.js';
import { isComplete } from '../model/bid.js';

/**
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('../model/deal.js').Seat} Seat
 * @typedef {'opening' | 'responding' | 'rebid' | 'competitive' | 'passed-out'} AuctionPhase
 * @typedef {{ phase: AuctionPhase, seatPosition: number }} AuctionContext
 */

/** @type {Readonly<Record<Seat, Seat>>} */
const PARTNER_SEAT = { N: 'S', S: 'N', E: 'W', W: 'E' };

/**
 * Classify the auction phase for a given seat.
 *
 * - opening: no contract bid yet placed by anyone
 * - responding: partner has made a contract bid, we haven't
 * - rebid: we have already made a contract bid
 * - competitive: only opponents have made contract bids
 * - passed-out: auction is complete
 *
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {AuctionContext}
 */
export function classifyAuction(auction, seat) {
  const pos = seatPosition(auction.dealer, seat);

  if (isComplete(auction)) return { phase: 'passed-out', seatPosition: pos };

  const bidders = contractBidders(auction);

  if (bidders.size === 0) return { phase: 'opening', seatPosition: pos };
  if (bidders.has(seat)) return { phase: 'rebid', seatPosition: pos };
  if (bidders.has(PARTNER_SEAT[seat])) return { phase: 'responding', seatPosition: pos };
  return { phase: 'competitive', seatPosition: pos };
}

/**
 * 1-based seat position relative to dealer.
 * @param {Seat} dealer
 * @param {Seat} seat
 * @returns {number} 1 = dealer, 2 = left of dealer, 3 = across, 4 = right
 */
export function seatPosition(dealer, seat) {
  return ((SEATS.indexOf(seat) - SEATS.indexOf(dealer) + 4) % 4) + 1;
}

/**
 * Find the first contract bid made by the given seat.
 * @param {Auction} auction
 * @param {Seat} playerSeat
 * @returns {import('../model/bid.js').ContractBid | null}
 */
export function findOwnBid(auction, playerSeat) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  for (let i = 0; i < auction.bids.length; i++) {
    const seat = SEATS[(dealerIdx + i) % SEATS.length];
    if (seat === playerSeat && auction.bids[i].type === 'contract') {
      return /** @type {import('../model/bid.js').ContractBid} */ (auction.bids[i]);
    }
  }
  return null;
}

/**
 * Find the first contract bid made by a given seat's partner.
 * @param {Auction} auction
 * @param {Seat} playerSeat
 * @returns {import('../model/bid.js').ContractBid | null}
 */
export function findPartnerBid(auction, playerSeat) {
  const partner = PARTNER_SEAT[playerSeat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  for (let i = 0; i < auction.bids.length; i++) {
    const seat = SEATS[(dealerIdx + i) % SEATS.length];
    if (seat === partner && auction.bids[i].type === 'contract') {
      return /** @type {import('../model/bid.js').ContractBid} */ (auction.bids[i]);
    }
  }
  return null;
}

/**
 * @param {Auction} auction
 * @returns {Set<Seat>}
 */
function contractBidders(auction) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  /** @type {Set<Seat>} */
  const seen = new Set();
  for (let i = 0; i < auction.bids.length; i++) {
    if (auction.bids[i].type === 'contract') {
      seen.add(SEATS[(dealerIdx + i) % SEATS.length]);
    }
  }
  return seen;
}

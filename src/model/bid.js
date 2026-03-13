import { SEATS } from './deal.js';

/**
 * @typedef {'C' | 'D' | 'H' | 'S' | 'NT'} Strain
 *
 * @typedef {{ type: 'contract', level: number, strain: Strain }} ContractBid
 * @typedef {{ type: 'pass' }} PassBid
 * @typedef {{ type: 'double' }} DoubleBid
 * @typedef {{ type: 'redouble' }} RedoubleBid
 * @typedef {ContractBid | PassBid | DoubleBid | RedoubleBid} Bid
 *
 * @typedef {import('./deal.js').Seat} Seat
 *
 * @typedef {{
 *   dealer: Seat,
 *   bids: readonly Bid[],
 * }} Auction
 */

/** @enum {Strain} */
export const Strain = /** @type {const} */ ({
  CLUBS: /** @type {'C'} */ ('C'),
  DIAMONDS: /** @type {'D'} */ ('D'),
  HEARTS: /** @type {'H'} */ ('H'),
  SPADES: /** @type {'S'} */ ('S'),
  NOTRUMP: /** @type {'NT'} */ ('NT'),
});

/** Strains in ascending rank order */
export const STRAIN_ORDER = /** @type {readonly Strain[]} */ ([
  Strain.CLUBS, Strain.DIAMONDS, Strain.HEARTS, Strain.SPADES, Strain.NOTRUMP,
]);

/** @type {Readonly<Record<Strain, string>>} */
export const STRAIN_SYMBOLS = {
  [Strain.CLUBS]: '\u2663',
  [Strain.DIAMONDS]: '\u2666',
  [Strain.HEARTS]: '\u2665',
  [Strain.SPADES]: '\u2660',
  [Strain.NOTRUMP]: 'NT',
};

/** @type {Readonly<Record<Strain, 'red' | 'black'>>} */
export const STRAIN_COLORS = {
  [Strain.CLUBS]: 'black',
  [Strain.DIAMONDS]: 'red',
  [Strain.HEARTS]: 'red',
  [Strain.SPADES]: 'black',
  [Strain.NOTRUMP]: 'black',
};

const MIN_LEVEL = 1;
const MAX_LEVEL = 7;
const PASSES_TO_END = 3;
const ALL_PASS_COUNT = 4;

/** @type {Readonly<Record<Seat, Seat>>} */
const PARTNER = { N: 'S', S: 'N', E: 'W', W: 'E' };

// -- Bid constructors --

/**
 * @param {number} level
 * @param {Strain} strain
 * @returns {ContractBid}
 */
export function contractBid(level, strain) {
  if (level < MIN_LEVEL || level > MAX_LEVEL) {
    throw new Error(`Bid level must be ${MIN_LEVEL}-${MAX_LEVEL}, got ${level}`);
  }
  if (!STRAIN_ORDER.includes(strain)) {
    throw new Error(`Invalid strain: ${strain}`);
  }
  return Object.freeze({ type: 'contract', level, strain });
}

/** @returns {PassBid} */
export function pass() {
  return Object.freeze({ type: 'pass' });
}

/** @returns {DoubleBid} */
export function dbl() {
  return Object.freeze({ type: 'double' });
}

/** @returns {RedoubleBid} */
export function redbl() {
  return Object.freeze({ type: 'redouble' });
}

// -- Auction --

/**
 * @param {Seat} dealer
 * @returns {Auction}
 */
export function createAuction(dealer) {
  return Object.freeze({ dealer, bids: Object.freeze([]) });
}

/**
 * @param {Auction} auction
 * @returns {Seat}
 */
export function currentSeat(auction) {
  const idx = SEATS.indexOf(auction.dealer);
  return SEATS[(idx + auction.bids.length) % SEATS.length];
}

/**
 * @param {Auction} auction
 * @returns {boolean}
 */
export function isComplete(auction) {
  const { bids } = auction;
  if (bids.length < ALL_PASS_COUNT) return false;

  const hasContract = bids.some(b => b.type === 'contract');
  if (!hasContract) {
    return bids.every(b => b.type === 'pass');
  }

  const tail = bids.slice(-PASSES_TO_END);
  return tail.every(b => b.type === 'pass');
}

/**
 * @param {Auction} auction
 * @param {Bid} bid
 * @returns {boolean}
 */
export function isLegalBid(auction, bid) {
  if (isComplete(auction)) return false;

  switch (bid.type) {
    case 'pass': return true;
    case 'contract': return isLegalContractBid(auction, bid);
    case 'double': return isLegalDouble(auction);
    case 'redouble': return isLegalRedouble(auction);
    default: return false;
  }
}

/**
 * Add a bid to the auction. Throws if the bid is illegal.
 * @param {Auction} auction
 * @param {Bid} bid
 * @returns {Auction}
 */
export function addBid(auction, bid) {
  if (!isLegalBid(auction, bid)) {
    throw new Error(`Illegal bid: ${bidToString(bid)}`);
  }
  const newBids = [...auction.bids, bid];
  return Object.freeze({ dealer: auction.dealer, bids: Object.freeze(newBids) });
}

/**
 * @param {Bid} bid
 * @returns {string}
 */
export function bidToString(bid) {
  switch (bid.type) {
    case 'contract': return `${bid.level}${STRAIN_SYMBOLS[bid.strain]}`;
    case 'pass': return 'Pass';
    case 'double': return 'X';
    case 'redouble': return 'XX';
  }
}

/**
 * @param {Auction} auction
 * @returns {ContractBid | null}
 */
export function lastContractBid(auction) {
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    if (auction.bids[i].type === 'contract') {
      return /** @type {ContractBid} */ (auction.bids[i]);
    }
  }
  return null;
}

// -- Internal validation helpers --

/**
 * @param {ContractBid} a
 * @param {ContractBid} b
 * @returns {number}
 */
function compareBids(a, b) {
  if (a.level !== b.level) return a.level - b.level;
  return STRAIN_ORDER.indexOf(a.strain) - STRAIN_ORDER.indexOf(b.strain);
}

/**
 * @param {Auction} auction
 * @param {ContractBid} bid
 * @returns {boolean}
 */
function isLegalContractBid(auction, bid) {
  const last = lastContractBid(auction);
  if (!last) return true;
  return compareBids(bid, last) > 0;
}

/** @param {Auction} auction @returns {{ bid: Bid, seat: Seat } | null} */
function lastNonPassBid(auction) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    if (auction.bids[i].type !== 'pass') {
      const seat = SEATS[(dealerIdx + i) % SEATS.length];
      return { bid: auction.bids[i], seat };
    }
  }
  return null;
}

/**
 * @param {Seat} a
 * @param {Seat} b
 * @returns {boolean}
 */
function isOpponent(a, b) {
  return a !== b && PARTNER[a] !== b;
}

/** @param {Auction} auction @returns {boolean} */
function isLegalDouble(auction) {
  const last = lastNonPassBid(auction);
  if (!last || last.bid.type !== 'contract') return false;
  return isOpponent(currentSeat(auction), last.seat);
}

/** @param {Auction} auction @returns {boolean} */
function isLegalRedouble(auction) {
  const last = lastNonPassBid(auction);
  if (!last || last.bid.type !== 'double') return false;
  return isOpponent(currentSeat(auction), last.seat);
}

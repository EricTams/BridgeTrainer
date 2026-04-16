import {
  contractBid,
  pass,
  Strain,
  STRAIN_ORDER,
  isLegalBid,
} from '../../../model/bid.js';
import {
  isTransferContextDead,
} from '../../../engine/context.js';

/**
 * @typedef {import('../../../model/bid.js').Auction} Auction
 * @typedef {import('../../../model/deal.js').Seat} Seat
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

export const INVITE_MIN = 8;
export const INVITE_MAX = 9;
export const GAME_MIN = 10;
export const TRANSFER_LEN = 5;
export const MAJOR_FIT_LEN = 4;
export const LONG_TRANSFER_RAISE = 6;
export const MINOR_TRANSFER_CORRECT_LEN = 6;

/**
 * @param {Auction} auction
 * @param {import('../../../model/bid.js').ContractBid} myFirst
 * @param {import('../../../model/bid.js').ContractBid} partnerFirst
 * @param {Seat} seat
 * @returns {boolean}
 */
export function isStaleWindow(auction, myFirst, partnerFirst, seat) {
  if (myFirst.level === 1 && myFirst.strain === Strain.NOTRUMP && isTransferContextDead(auction, seat)) {
    return true;
  }
  if (partnerFirst.level === 1 &&
      partnerFirst.strain === Strain.NOTRUMP &&
      isTransferContextDead(auction, partnerSeat(seat))) {
    return true;
  }
  return false;
}

/**
 * @param {Seat} seat
 * @returns {Seat}
 */
export function partnerSeat(seat) {
  if (seat === 'N') return 'S';
  if (seat === 'S') return 'N';
  if (seat === 'E') return 'W';
  return 'E';
}

/**
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {number}
 */
export function contractCountBySeat(auction, seat) {
  const seats = ['N', 'E', 'S', 'W'];
  const dealerIdx = seats.indexOf(auction.dealer);
  let count = 0;
  for (let i = 0; i < auction.bids.length; i++) {
    const bidSeat = seats[(dealerIdx + i) % seats.length];
    if (bidSeat === seat && auction.bids[i].type === 'contract') count++;
  }
  return count;
}

/**
 * @param {Auction} auction
 * @returns {import('../../../model/bid.js').Bid[]}
 */
export function legalCandidates(auction) {
  const bids = [pass()];
  for (let level = 1; level <= 7; level++) {
    for (const strain of STRAIN_ORDER) {
      const bid = contractBid(level, strain);
      if (isLegalBid(auction, bid)) bids.push(bid);
    }
  }
  return bids.filter(bid => isLegalBid(auction, bid));
}

/**
 * @param {number[]} shape
 * @param {'C' | 'D' | 'H' | 'S' | 'NT'} strain
 * @returns {number}
 */
export function suitLen(shape, strain) {
  if (strain === Strain.SPADES) return shape[0];
  if (strain === Strain.HEARTS) return shape[1];
  if (strain === Strain.DIAMONDS) return shape[2];
  if (strain === Strain.CLUBS) return shape[3];
  return 0;
}

/**
 * @param {number} hcp
 * @param {number} min
 * @param {number} max
 * @returns {boolean}
 */
export function inRange(hcp, min, max) {
  return hcp >= min && hcp <= max;
}

/**
 * @param {'D' | 'H'} transferStrain
 * @returns {'H' | 'S'}
 */
export function transferTargetFromCall(transferStrain) {
  return transferStrain === Strain.DIAMONDS ? Strain.HEARTS : Strain.SPADES;
}

/**
 * @param {import('../../../model/bid.js').Bid} bid
 * @param {number} priority
 * @param {string} explanation
 * @returns {BidRecommendation}
 */
export function rec(bid, priority, explanation) {
  return { bid, priority, explanation, penalties: [] };
}

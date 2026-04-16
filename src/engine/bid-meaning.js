import { Strain } from '../model/bid.js';
import { SEATS } from '../model/deal.js';

/**
 * @typedef {import('../model/bid.js').Bid} Bid
 * @typedef {import('../model/bid.js').ContractBid} ContractBid
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('../model/deal.js').Seat} Seat
 *
 * @typedef {'none' | 'one-round' | 'game'} ForcingStatus
 *
 * @typedef {{
 *   role: string,
 *   minHcp: number,
 *   maxHcp: number,
 *   forcing: ForcingStatus,
 * }} BidMeaning
 */

/** @type {Readonly<Record<Seat, Seat>>} */
const PARTNER = { N: 'S', S: 'N', E: 'W', W: 'E' };

/**
 * Canonical meaning for a player's first contract bid.
 * This is the single source for bid-strength floors used by inference paths.
 *
 * @param {ContractBid} bid
 * @param {{
 *   isOpener: boolean,
 *   partnerFirstBid?: ContractBid | null,
 * }} opts
 * @returns {BidMeaning}
 */
export function firstBidMeaning(bid, opts) {
  if (opts.isOpener) return openerFirstBidMeaning(bid);
  return responderFirstBidMeaning(bid, opts.partnerFirstBid || null);
}

/**
 * Canonical meaning for a seat's first contract bid in the full auction
 * context (opener, responder, overcaller, or advancer).
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {BidMeaning}
 */
export function firstBidMeaningInAuction(auction, seat) {
  const first = firstContractBySeat(auction, seat);
  if (!first) return { role: 'no-bid', minHcp: 0, maxHcp: 37, forcing: 'none' };

  const openingSeat = firstContractBidder(auction);
  if (openingSeat === seat) {
    return openerFirstBidMeaning(first.bid);
  }

  const partner = PARTNER[seat];
  const partnerFirst = firstContractBySeat(auction, partner);
  const oppContractBeforeFirst = hasOpponentContractBeforeIndex(
    auction,
    seat,
    first.index
  );

  // Partner opened and opponents have not acted yet -> normal responder.
  if (partnerFirst && partnerFirst.index < first.index && !oppContractBeforeFirst) {
    return responderFirstBidMeaning(first.bid, partnerFirst.bid);
  }

  // Opponents opened and we entered directly -> overcall family.
  if (oppContractBeforeFirst && (!partnerFirst || partnerFirst.index > first.index)) {
    return overcallFirstBidMeaning(first.bid);
  }

  // Partner bid before us in competition -> advancer / competitive response.
  if (partnerFirst && partnerFirst.index < first.index) {
    return competitiveAdvanceMeaning(first.bid, partnerFirst.bid);
  }

  // Fallback to a responder-style interpretation when context is ambiguous.
  return responderFirstBidMeaning(first.bid, partnerFirst ? partnerFirst.bid : null);
}

/**
 * Canonical meaning for a double that already occurred in the auction.
 *
 * @param {Auction} auction
 * @param {number} doubleIndex
 * @returns {BidMeaning}
 */
export function doubleMeaning(auction, doubleIndex) {
  const bid = auction.bids[doubleIndex];
  if (!bid || bid.type !== 'double') return unknownDoubleMeaning();

  const doubled = lastContractBefore(auction, doubleIndex);
  if (!doubled) return unknownDoubleMeaning();

  const doubler = seatAtBidIndex(auction, doubleIndex);
  const partner = PARTNER[doubler];
  const firstContractSeat = firstContractBidder(auction);

  if (doubled.strain === Strain.NOTRUMP) {
    return { role: 'penalty-double', minHcp: 15, maxHcp: 37, forcing: 'none' };
  }

  const doublerHadContract = hasContractBySeatBefore(auction, doubler, doubleIndex);
  const partnerHadContract = hasContractBySeatBefore(auction, partner, doubleIndex);

  if (!doublerHadContract && !partnerHadContract) {
    return {
      role: 'takeout-double',
      minHcp: takeoutMinHcpForLevel(doubled.level),
      maxHcp: 37,
      forcing: 'none',
    };
  }

  if (!doublerHadContract && partnerHadContract && firstContractSeat === partner &&
      doubled.level <= 2) {
    return {
      role: 'negative-double',
      minHcp: negativeDoubleMinHcpForLevel(doubled.level),
      maxHcp: 37,
      forcing: 'none',
    };
  }

  if (doublerHadContract && !partnerHadContract) {
    return {
      role: 'reopening-double',
      minHcp: Math.max(13, takeoutMinHcpForLevel(doubled.level)),
      maxHcp: 37,
      forcing: 'none',
    };
  }

  return { role: 'cooperative-double', minHcp: 12, maxHcp: 37, forcing: 'none' };
}

/**
 * Canonical meaning for a direct (prospective) double action.
 *
 * @param {ContractBid} oppBid
 * @returns {BidMeaning}
 */
export function plannedDoubleMeaning(oppBid) {
  if (oppBid.strain === Strain.NOTRUMP) {
    return { role: 'penalty-double', minHcp: 15, maxHcp: 37, forcing: 'none' };
  }
  return {
    role: 'takeout-double',
    minHcp: takeoutMinHcpForLevel(oppBid.level),
    maxHcp: 37,
    forcing: 'none',
  };
}

/**
 * @param {ContractBid} bid
 * @returns {BidMeaning}
 */
function openerFirstBidMeaning(bid) {
  if (bid.level === 1 && bid.strain === Strain.NOTRUMP) {
    return { role: 'open-1nt', minHcp: 15, maxHcp: 17, forcing: 'none' };
  }
  if (bid.level === 2 && bid.strain === Strain.NOTRUMP) {
    return { role: 'open-2nt', minHcp: 20, maxHcp: 21, forcing: 'none' };
  }
  if (bid.level === 2 && bid.strain === Strain.CLUBS) {
    return { role: 'open-2c-artificial', minHcp: 22, maxHcp: 37, forcing: 'game' };
  }
  if (bid.level === 2 && bid.strain !== Strain.NOTRUMP) {
    return { role: 'open-weak-two', minHcp: 5, maxHcp: 11, forcing: 'none' };
  }
  if (bid.level >= 3 && bid.strain !== Strain.NOTRUMP) {
    return { role: 'open-preempt', minHcp: 5, maxHcp: 10, forcing: 'none' };
  }
  return { role: 'open-one-suit', minHcp: 13, maxHcp: 21, forcing: 'none' };
}

/**
 * @param {ContractBid} bid
 * @param {ContractBid | null} partnerFirstBid
 * @returns {BidMeaning}
 */
function responderFirstBidMeaning(bid, partnerFirstBid) {
  if (partnerFirstBid && partnerFirstBid.level === 2 &&
      partnerFirstBid.strain === Strain.CLUBS &&
      bid.level === 2 && bid.strain === Strain.DIAMONDS) {
    return { role: 'respond-2c-waiting', minHcp: 0, maxHcp: 7, forcing: 'none' };
  }

  if (partnerFirstBid && partnerFirstBid.level === 1 &&
      partnerFirstBid.strain === Strain.NOTRUMP) {
    return respondTo1NTMeaning(bid);
  }

  if (bid.strain === Strain.NOTRUMP && bid.level === 1) {
    return { role: 'respond-1nt', minHcp: 6, maxHcp: 10, forcing: 'one-round' };
  }

  if (bid.strain === Strain.NOTRUMP && bid.level === 2) {
    if (partnerFirstBid &&
        partnerFirstBid.level === 1 &&
        (partnerFirstBid.strain === Strain.HEARTS || partnerFirstBid.strain === Strain.SPADES)) {
      return { role: 'jacoby-2nt', minHcp: 13, maxHcp: 21, forcing: 'game' };
    }
    return { role: 'respond-2nt-invite', minHcp: 11, maxHcp: 12, forcing: 'none' };
  }

  if (bid.strain === Strain.NOTRUMP && bid.level >= 3) {
    return { role: 'respond-nt-game-or-better', minHcp: 13, maxHcp: 37, forcing: 'none' };
  }

  if (partnerFirstBid && bid.strain === partnerFirstBid.strain) {
    if (bid.level === 2) return { role: 'single-raise', minHcp: 6, maxHcp: 10, forcing: 'none' };
    if (bid.level === 3) return { role: 'limit-raise', minHcp: 10, maxHcp: 12, forcing: 'none' };
    if (bid.level >= 4 && isMajor(bid.strain)) {
      return { role: 'preemptive-major-raise', minHcp: 5, maxHcp: 10, forcing: 'none' };
    }
  }

  if (bid.level >= 2) {
    return { role: 'new-suit-two-level-or-higher', minHcp: 10, maxHcp: 17, forcing: 'one-round' };
  }

  return { role: 'new-suit-one-level', minHcp: 6, maxHcp: 17, forcing: 'one-round' };
}

/**
 * @param {ContractBid} bid
 * @returns {BidMeaning}
 */
function overcallFirstBidMeaning(bid) {
  if (bid.strain === Strain.NOTRUMP && bid.level === 1) {
    return { role: 'overcall-1nt', minHcp: 15, maxHcp: 18, forcing: 'none' };
  }
  if (bid.strain !== Strain.NOTRUMP) {
    if (bid.level <= 1) return { role: 'overcall-one-level', minHcp: 8, maxHcp: 16, forcing: 'none' };
    return { role: 'overcall-two-level-plus', minHcp: 10, maxHcp: 16, forcing: 'none' };
  }
  return { role: 'overcall-non-standard', minHcp: 10, maxHcp: 37, forcing: 'none' };
}

/**
 * @param {ContractBid} bid
 * @param {ContractBid} partnerFirstBid
 * @returns {BidMeaning}
 */
function competitiveAdvanceMeaning(bid, partnerFirstBid) {
  if (bid.strain === partnerFirstBid.strain && bid.level === partnerFirstBid.level + 1) {
    return { role: 'advance-raise', minHcp: 8, maxHcp: 10, forcing: 'none' };
  }
  if (bid.strain !== Strain.NOTRUMP && bid.strain !== partnerFirstBid.strain && bid.level >= 2) {
    return { role: 'advance-new-suit', minHcp: 10, maxHcp: 17, forcing: 'one-round' };
  }
  if (bid.strain === Strain.NOTRUMP && bid.level === 1) {
    return { role: 'advance-1nt', minHcp: 8, maxHcp: 12, forcing: 'none' };
  }
  return { role: 'advance-generic', minHcp: 6, maxHcp: 17, forcing: 'none' };
}

/**
 * @param {ContractBid} bid
 * @returns {BidMeaning}
 */
function respondTo1NTMeaning(bid) {
  if (bid.level === 2 && bid.strain === Strain.CLUBS) {
    return { role: 'stayman', minHcp: 8, maxHcp: 17, forcing: 'one-round' };
  }
  if (bid.level === 2 && (bid.strain === Strain.DIAMONDS || bid.strain === Strain.HEARTS)) {
    return { role: 'jacoby-transfer', minHcp: 0, maxHcp: 17, forcing: 'one-round' };
  }
  if (bid.level === 2 && bid.strain === Strain.NOTRUMP) {
    return { role: 'invite-2nt-over-1nt', minHcp: 8, maxHcp: 9, forcing: 'none' };
  }
  if (bid.level === 3 && bid.strain === Strain.NOTRUMP) {
    return { role: 'game-3nt-over-1nt', minHcp: 10, maxHcp: 15, forcing: 'none' };
  }
  if (bid.level === 4 && bid.strain === Strain.NOTRUMP) {
    return { role: 'quantitative-4nt', minHcp: 16, maxHcp: 17, forcing: 'none' };
  }
  return { role: 'non-standard-over-1nt', minHcp: 8, maxHcp: 37, forcing: 'none' };
}

/**
 * @param {number} level
 * @returns {number}
 */
function takeoutMinHcpForLevel(level) {
  return 12 + Math.max(0, level - 1) * 2;
}

/**
 * @param {number} level
 * @returns {number}
 */
function negativeDoubleMinHcpForLevel(level) {
  if (level <= 1) return 6;
  if (level === 2) return 8;
  return 10;
}

/**
 * @returns {BidMeaning}
 */
function unknownDoubleMeaning() {
  return { role: 'unknown-double', minHcp: 0, maxHcp: 37, forcing: 'none' };
}

/**
 * @param {Auction} auction
 * @param {number} index
 * @returns {Seat}
 */
function seatAtBidIndex(auction, index) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  return SEATS[(dealerIdx + index) % SEATS.length];
}

/**
 * @param {Auction} auction
 * @param {number} beforeIndex
 * @returns {ContractBid | null}
 */
function lastContractBefore(auction, beforeIndex) {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    if (auction.bids[i].type === 'contract') {
      return /** @type {ContractBid} */ (auction.bids[i]);
    }
  }
  return null;
}

/**
 * @param {Auction} auction
 * @returns {Seat | null}
 */
function firstContractBidder(auction) {
  for (let i = 0; i < auction.bids.length; i++) {
    if (auction.bids[i].type === 'contract') return seatAtBidIndex(auction, i);
  }
  return null;
}

/**
 * @param {Auction} auction
 * @param {Seat} seat
 * @param {number} beforeIndex
 * @returns {boolean}
 */
function hasContractBySeatBefore(auction, seat, beforeIndex) {
  for (let i = 0; i < beforeIndex; i++) {
    if (seatAtBidIndex(auction, i) === seat && auction.bids[i].type === 'contract') {
      return true;
    }
  }
  return false;
}

/**
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {{ bid: ContractBid, index: number } | null}
 */
function firstContractBySeat(auction, seat) {
  for (let i = 0; i < auction.bids.length; i++) {
    if (seatAtBidIndex(auction, i) === seat && auction.bids[i].type === 'contract') {
      return { bid: /** @type {ContractBid} */ (auction.bids[i]), index: i };
    }
  }
  return null;
}

/**
 * @param {Auction} auction
 * @param {Seat} seat
 * @param {number} beforeIndex
 * @returns {boolean}
 */
function hasOpponentContractBeforeIndex(auction, seat, beforeIndex) {
  const partner = PARTNER[seat];
  for (let i = 0; i < beforeIndex; i++) {
    if (auction.bids[i].type !== 'contract') continue;
    const bidSeat = seatAtBidIndex(auction, i);
    if (bidSeat !== seat && bidSeat !== partner) return true;
  }
  return false;
}

/**
 * @param {import('../model/bid.js').Strain} strain
 * @returns {boolean}
 */
function isMajor(strain) {
  return strain === Strain.SPADES || strain === Strain.HEARTS;
}

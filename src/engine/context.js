import { SEATS } from '../model/deal.js';
import { Strain, isComplete } from '../model/bid.js';

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
 * Find the most recent contract bid made by the given seat.
 * Unlike findOwnBid (which returns the first), this returns the latest.
 * @param {Auction} auction
 * @param {Seat} playerSeat
 * @returns {import('../model/bid.js').ContractBid | null}
 */
export function findOwnLastBid(auction, playerSeat) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  /** @type {import('../model/bid.js').ContractBid | null} */
  let last = null;
  for (let i = 0; i < auction.bids.length; i++) {
    const seat = SEATS[(dealerIdx + i) % SEATS.length];
    if (seat === playerSeat && auction.bids[i].type === 'contract') {
      last = /** @type {import('../model/bid.js').ContractBid} */ (auction.bids[i]);
    }
  }
  return last;
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
 * Find the most recent contract bid made by partner.
 * Unlike findPartnerBid (which returns the first), this returns the latest.
 * @param {Auction} auction
 * @param {Seat} playerSeat
 * @returns {import('../model/bid.js').ContractBid | null}
 */
export function findPartnerLastBid(auction, playerSeat) {
  const partner = PARTNER_SEAT[playerSeat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  /** @type {import('../model/bid.js').ContractBid | null} */
  let last = null;
  for (let i = 0; i < auction.bids.length; i++) {
    const seat = SEATS[(dealerIdx + i) % SEATS.length];
    if (seat === partner && auction.bids[i].type === 'contract') {
      last = /** @type {import('../model/bid.js').ContractBid} */ (auction.bids[i]);
    }
  }
  return last;
}

/**
 * Find the most recent contract bid made by an opponent of the given seat.
 * Returns the latest (not first) opponent bid so competitive evaluations
 * target the current contract rather than the original opening.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {import('../model/bid.js').ContractBid | null}
 */
export function findOpponentBid(auction, seat) {
  const partner = PARTNER_SEAT[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  /** @type {import('../model/bid.js').ContractBid | null} */
  let latest = null;
  for (let i = 0; i < auction.bids.length; i++) {
    const bidSeat = SEATS[(dealerIdx + i) % SEATS.length];
    if (bidSeat !== seat && bidSeat !== partner && auction.bids[i].type === 'contract') {
      latest = /** @type {import('../model/bid.js').ContractBid} */ (auction.bids[i]);
    }
  }
  return latest;
}

/**
 * Check if any opponent has made a contract bid.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {boolean}
 */
export function hasOpponentBids(auction, seat) {
  return findOpponentBid(auction, seat) !== null;
}

/**
 * Check if partner has made a (takeout) double.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {boolean}
 */
export function hasPartnerDoubled(auction, seat) {
  const partner = PARTNER_SEAT[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  for (let i = 0; i < auction.bids.length; i++) {
    const bidSeat = SEATS[(dealerIdx + i) % SEATS.length];
    if (bidSeat === partner && auction.bids[i].type === 'double') return true;
  }
  return false;
}

/**
 * Check if the given seat is in the balancing (passout) position --
 * i.e. the next pass would end the auction.
 * @param {Auction} auction
 * @returns {boolean}
 */
export function isBalancingSeat(auction) {
  const bids = auction.bids;
  if (bids.length < 3) return false;
  if (!bids.some(b => b.type === 'contract')) return false;
  const last2 = bids.slice(-2);
  return last2.every(b => b.type === 'pass');
}

/**
 * Collect all strains bid by opponents of the given seat.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {Set<import('../model/bid.js').Strain>}
 */
export function opponentStrains(auction, seat) {
  const partner = PARTNER_SEAT[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  /** @type {Set<import('../model/bid.js').Strain>} */
  const strains = new Set();
  for (let i = 0; i < auction.bids.length; i++) {
    const b = auction.bids[i];
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    if (s !== seat && s !== partner && b.type === 'contract') {
      strains.add(/** @type {import('../model/bid.js').ContractBid} */ (b).strain);
    }
  }
  return strains;
}

/**
 * True if this seat has played at least one Pass in the auction so far.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {boolean}
 */
export function seatHasPassed(auction, seat) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  for (let i = 0; i < auction.bids.length; i++) {
    if (SEATS[(dealerIdx + i) % SEATS.length] === seat && auction.bids[i].type === 'pass') {
      return true;
    }
  }
  return false;
}

/**
 * True when the seat has passed but not yet made a contract bid — the same
 * "passed hand" situation players use when deciding whether to reopen.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {boolean}
 */
export function reopeningWithoutOwnBid(auction, seat) {
  return seatHasPassed(auction, seat) && findOwnBid(auction, seat) === null;
}

/**
 * Count how many times partner passed when they had an opportunity to act
 * competitively. Each such pass provides negative inference about partner's
 * strength — a hand worth bidding would have entered the auction.
 *
 * Returns 0 when partner never passed over action, 1+ when they did.
 * A passed-hand partner (never bid at all) scores at least 1.
 * A partner who bid once but later passed over opponent action also scores.
 * @param {Auction} auction
 * @param {Seat} playerSeat
 * @returns {number}
 */
export function partnerPassCount(auction, playerSeat) {
  const partner = PARTNER_SEAT[playerSeat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  let count = 0;

  for (let i = 0; i < auction.bids.length; i++) {
    const bidSeat = SEATS[(dealerIdx + i) % SEATS.length];
    if (bidSeat !== partner) continue;
    if (auction.bids[i].type !== 'pass') continue;

    let hadAction = false;
    for (let j = i - 1; j >= 0; j--) {
      const b = auction.bids[j];
      if (b.type === 'contract' || b.type === 'double') {
        hadAction = true;
        break;
      }
    }
    if (hadAction) count++;
  }
  return count;
}

/**
 * True sandwich seat: the player has not yet bid, and *each* opponent has
 * bid at least one real suit (not notrump), so the player is genuinely
 * "sandwiched" between two active suit-bidding opponents.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {boolean}
 */
export function isSandwichBetweenOpponents(auction, seat) {
  if (findOwnBid(auction, seat) !== null) return false;

  const partner = PARTNER_SEAT[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  const oppSeats = SEATS.filter(s => s !== seat && s !== partner);
  const suitsBySeat = new Map(oppSeats.map(s => [s, false]));

  for (let i = 0; i < auction.bids.length; i++) {
    const b = auction.bids[i];
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    if (suitsBySeat.has(s) && b.type === 'contract' &&
        /** @type {import('../model/bid.js').ContractBid} */ (b).strain !== Strain.NOTRUMP) {
      suitsBySeat.set(s, true);
    }
  }

  for (const hasSuit of suitsBySeat.values()) {
    if (!hasSuit) return false;
  }
  return true;
}

/**
 * Prefix for direct competitive recommendations so explanations match the table
 * situation (passed hand, sandwich). Balancing is already woven into scores.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {string}
 */
export function directCompetitiveContextPrefix(auction, seat) {
  const parts = [];
  if (reopeningWithoutOwnBid(auction, seat)) {
    parts.push('passed hand');
  }
  if (isSandwichBetweenOpponents(auction, seat)) {
    parts.push('sandwich');
  }
  if (parts.length === 0) return '';
  return `(${parts.join(', ')}) `;
}

/**
 * Collect all strains naturally bid by the partnership (seat + partner).
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {Set<import('../model/bid.js').Strain>}
 */
export function partnershipStrains(auction, seat) {
  const partner = PARTNER_SEAT[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  /** @type {Set<import('../model/bid.js').Strain>} */
  const strains = new Set();
  for (let i = 0; i < auction.bids.length; i++) {
    const b = auction.bids[i];
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    if ((s === seat || s === partner) && b.type === 'contract') {
      strains.add(/** @type {import('../model/bid.js').ContractBid} */ (b).strain);
    }
  }
  return strains;
}

/**
 * Count how many contract bids a seat has made so far.
 * Used to distinguish first rebid from continuation turns.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {number}
 */
export function countOwnBids(auction, seat) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  let count = 0;
  for (let i = 0; i < auction.bids.length; i++) {
    const bidSeat = SEATS[(dealerIdx + i) % SEATS.length];
    if (bidSeat === seat && auction.bids[i].type === 'contract') count++;
  }
  return count;
}

/**
 * Check whether a seat was the first player to make a contract bid (the opener).
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {boolean}
 */
export function isOpener(auction, seat) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  for (let i = 0; i < auction.bids.length; i++) {
    if (auction.bids[i].type === 'contract') {
      return SEATS[(dealerIdx + i) % SEATS.length] === seat;
    }
  }
  return false;
}

/**
 * Find the contract bid that a given seat doubled.
 * Scans the auction for a double by the given seat, then returns
 * the most recent contract bid preceding that double.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {import('../model/bid.js').ContractBid | null}
 */
export function findDoubledBid(auction, seat) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  for (let i = 0; i < auction.bids.length; i++) {
    const bidSeat = SEATS[(dealerIdx + i) % SEATS.length];
    if (bidSeat === seat && auction.bids[i].type === 'double') {
      for (let j = i - 1; j >= 0; j--) {
        if (auction.bids[j].type === 'contract') {
          return /** @type {import('../model/bid.js').ContractBid} */ (auction.bids[j]);
        }
      }
    }
  }
  return null;
}

/**
 * Check if the given seat has made a double in this auction.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {boolean}
 */
export function hasPlayerDoubled(auction, seat) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  for (let i = 0; i < auction.bids.length; i++) {
    const bidSeat = SEATS[(dealerIdx + i) % SEATS.length];
    if (bidSeat === seat && auction.bids[i].type === 'double') return true;
  }
  return false;
}

/**
 * Check if any double occurred after partner's last contract bid.
 * A double relieves forcing obligations — the partnership can pass
 * for penalty instead of being compelled to bid.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {boolean}
 */
export function hasDoubleAfterPartnerBid(auction, seat) {
  const partner = PARTNER_SEAT[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  let partnerBidIdx = -1;
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    const bidSeat = SEATS[(dealerIdx + i) % SEATS.length];
    if (bidSeat === partner && auction.bids[i].type === 'contract') {
      partnerBidIdx = i;
      break;
    }
  }
  if (partnerBidIdx === -1) return false;
  for (let i = partnerBidIdx + 1; i < auction.bids.length; i++) {
    if (auction.bids[i].type === 'double') return true;
  }
  return false;
}

/**
 * Check whether any opponent made a contract bid after partner's
 * last contract bid. Used to detect interference in forcing sequences.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {boolean}
 */
export function hasInterferenceAfterPartner(auction, seat) {
  const partner = PARTNER_SEAT[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  let partnerBidIdx = -1;
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    const bidSeat = SEATS[(dealerIdx + i) % SEATS.length];
    if (bidSeat === partner && auction.bids[i].type === 'contract') {
      partnerBidIdx = i;
      break;
    }
  }
  if (partnerBidIdx === -1) return false;
  for (let i = partnerBidIdx + 1; i < auction.bids.length; i++) {
    const bidSeat = SEATS[(dealerIdx + i) % SEATS.length];
    if (bidSeat !== seat && bidSeat !== partner && auction.bids[i].type === 'contract') {
      return true;
    }
  }
  return false;
}

/**
 * Check if the last contract bid in the auction belongs to an opponent
 * of the given seat. Used to detect when opponents have outbid the partnership.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {boolean}
 */
export function opponentsOutbidPartnership(auction, seat) {
  const partner = PARTNER_SEAT[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  let lastBidSeat = null;
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    if (auction.bids[i].type === 'contract') {
      lastBidSeat = SEATS[(dealerIdx + i) % SEATS.length];
      break;
    }
  }
  if (!lastBidSeat) return false;
  return lastBidSeat !== seat && lastBidSeat !== partner;
}

/**
 * Find the most recent contract bid made by the partnership (player or partner).
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {import('../model/bid.js').ContractBid | null}
 */
export function lastPartnershipContractBid(auction, seat) {
  const partner = PARTNER_SEAT[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    const bidSeat = SEATS[(dealerIdx + i) % SEATS.length];
    if ((bidSeat === seat || bidSeat === partner) && auction.bids[i].type === 'contract') {
      return /** @type {import('../model/bid.js').ContractBid} */ (auction.bids[i]);
    }
  }
  return null;
}

/**
 * Estimate the minimum combined HCP for the partnership based on the
 * bidding so far.  When both partners have made contract bids, the
 * floor is the sum of the minimum each bid implies.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {number}
 */
export function partnershipMinHcp(auction, seat) {
  const partner = PARTNER_SEAT[seat];
  const ownBid = findOwnBid(auction, seat);
  const partnerBid = findPartnerBid(auction, seat);
  if (!ownBid || !partnerBid) return 0;

  return bidMinHcp(ownBid, isOpener(auction, seat)) +
         bidMinHcp(partnerBid, isOpener(auction, partner));
}

/**
 * Minimum HCP implied by a single contract bid.
 * @param {import('../model/bid.js').ContractBid} bid
 * @param {boolean} opener
 * @returns {number}
 */
function bidMinHcp(bid, opener) {
  const { level, strain } = bid;
  if (opener) {
    if (level === 1 && strain === Strain.NOTRUMP) return 15;
    if (level === 2 && strain === Strain.NOTRUMP) return 20;
    if (level === 2 && strain === Strain.CLUBS) return 22;
    if (level === 2) return 5;
    if (level >= 3) return 5;
    return 13;
  }
  if (strain === Strain.NOTRUMP && level === 1) return 6;
  if (strain === Strain.NOTRUMP && level >= 2) return 10;
  if (level >= 2) return 10;
  return 6;
}

/**
 * Find the contract bid targeted by a given seat's MOST RECENT double.
 * Unlike findDoubledBid (which returns the first), this returns the latest.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {import('../model/bid.js').ContractBid | null}
 */
export function findLastDoubledBid(auction, seat) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    const bidSeat = SEATS[(dealerIdx + i) % SEATS.length];
    if (bidSeat === seat && auction.bids[i].type === 'double') {
      for (let j = i - 1; j >= 0; j--) {
        if (auction.bids[j].type === 'contract') {
          return /** @type {import('../model/bid.js').ContractBid} */ (auction.bids[j]);
        }
      }
    }
  }
  return null;
}

/**
 * Detect when a Jacoby Transfer sequence after 1NT has been disrupted
 * beyond recovery. Returns true when all of:
 *   1. The given seat opened 1NT
 *   2. Partner responded with 2♦ or 2♥ (Jacoby transfer)
 *   3. An opponent made a contract bid after the transfer
 *   4. The opener did NOT complete the transfer on their next turn
 *
 * When true, the engine should exit the transfer scoring path and use
 * normal continuation logic instead.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {boolean}
 */
export function isTransferContextDead(auction, seat) {
  const partner = PARTNER_SEAT[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);

  const myBid = findOwnBid(auction, seat);
  if (!myBid || myBid.level !== 1 || myBid.strain !== Strain.NOTRUMP) return false;
  if (!isOpener(auction, seat)) return false;

  const partnerBid = findPartnerBid(auction, seat);
  if (!partnerBid || partnerBid.level !== 2) return false;
  if (partnerBid.strain !== Strain.DIAMONDS && partnerBid.strain !== Strain.HEARTS) return false;

  const transferTarget = partnerBid.strain === Strain.DIAMONDS
    ? Strain.HEARTS : Strain.SPADES;

  let transferIdx = -1;
  for (let i = 0; i < auction.bids.length; i++) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    if (s === partner && auction.bids[i].type === 'contract') {
      transferIdx = i;
      break;
    }
  }
  if (transferIdx === -1) return false;

  let hasInterference = false;
  for (let i = transferIdx + 1; i < auction.bids.length; i++) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    if (s !== seat && s !== partner && auction.bids[i].type === 'contract') {
      hasInterference = true;
      break;
    }
  }
  if (!hasInterference) return false;

  for (let i = transferIdx + 1; i < auction.bids.length; i++) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    if (s === seat) {
      const bid = auction.bids[i];
      if (bid.type === 'contract') {
        const cb = /** @type {import('../model/bid.js').ContractBid} */ (bid);
        if (cb.strain === transferTarget) return false;
      }
      return true;
    }
  }

  return false;
}

/**
 * Compute the minimum HCP a seat has promised based on all their
 * bids and competitive actions in the auction. Each strength-showing
 * action after the initial bid (penalty/cooperative double, free bid
 * over interference) raises the floor beyond what the first bid promised.
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {number}
 */
export function seatStrengthFloor(auction, seat) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  const partner = PARTNER_SEAT[seat];

  const firstBid = findOwnBid(auction, seat);
  if (!firstBid) return 0;

  const opened = isOpener(auction, seat);
  let floor = bidMinHcp(firstBid, opened);

  let passedFirstBid = false;
  for (let i = 0; i < auction.bids.length; i++) {
    const bidSeat = SEATS[(dealerIdx + i) % SEATS.length];
    if (bidSeat !== seat) continue;

    const bid = auction.bids[i];
    if (!passedFirstBid) {
      if (bid.type === 'contract') passedFirstBid = true;
      continue;
    }

    if (bid.type === 'double') {
      floor += 2;
    }

    if (bid.type === 'contract') {
      let hasOppBetween = false;
      for (let j = i - 1; j >= 0; j--) {
        const jSeat = SEATS[(dealerIdx + j) % SEATS.length];
        if (jSeat === seat) break;
        if (jSeat !== seat && jSeat !== partner && auction.bids[j].type === 'contract') {
          hasOppBetween = true;
          break;
        }
      }
      if (hasOppBetween) floor += 2;
    }
  }

  return floor;
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

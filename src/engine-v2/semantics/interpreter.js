import { Strain } from '../../model/bid.js';
import { SEATS } from '../../model/deal.js';
import {
  classifyAuction,
  findOpponentBid,
  findOwnBid,
  findPartnerBid,
  hasDoubleAfterPartnerBid,
  hasInterferenceAfterPartner,
  isOpener,
} from '../../engine/context.js';
import { firstBidMeaningInAuction } from '../../engine/bid-meaning.js';
import {
  createSeatMeaning,
  createAuctionMeaningState,
  rangeFromMeaning,
} from '../model/semantic-state.js';

/**
 * @typedef {import('../../model/hand.js').Hand} Hand
 * @typedef {import('../../model/bid.js').Auction} Auction
 * @typedef {import('../../model/deal.js').Seat} Seat
 * @typedef {import('../model/semantic-state.js').AuctionMeaningState} AuctionMeaningState
 */

/** @type {Readonly<Record<Seat, Seat>>} */
const PARTNER = { N: 'S', S: 'N', E: 'W', W: 'E' };

/** @type {Readonly<Record<Seat, Seat>>} */
const LHO = { N: 'E', E: 'S', S: 'W', W: 'N' };

/** @type {Readonly<Record<Seat, Seat>>} */
const RHO = { N: 'W', W: 'S', S: 'E', E: 'N' };

/**
 * Build a read-only semantic interpretation for diagnostics.
 * This does not alter bidding decisions yet.
 * @param {Hand} hand
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {AuctionMeaningState}
 */
export function interpretAuctionState(auction, seat, eval_) {
  const myEval = eval_ || null;
  const ctx = classifyAuction(auction, seat);
  const myFirst = findOwnBid(auction, seat);
  const partnerFirst = findPartnerBid(auction, seat);
  const opponentFirst = findOpponentBid(auction, seat);
  const partnerSeat = PARTNER[seat];
  const lhoSeat = LHO[seat];
  const rhoSeat = RHO[seat];

  const myMeaning = firstBidMeaningInAuction(auction, seat);
  const partnerMeaning = firstBidMeaningInAuction(auction, partnerSeat);
  const lhoMeaning = firstBidMeaningInAuction(auction, lhoSeat);
  const rhoMeaning = firstBidMeaningInAuction(auction, rhoSeat);

  const me = createSeatMeaning({
    hcp: rangeFromMeaning(myMeaning),
    balancedLikelihood: myEval && myEval.shapeClass === 'balanced'
      ? 1
      : myEval && myEval.shapeClass === 'semi-balanced' ? 0.6 : 0.2,
    forcing: myMeaning.forcing,
    obligations: collectObligations(auction, seat, myFirst, partnerFirst),
    agreedStrain: inferAgreedStrain(myFirst, partnerFirst),
    role: inferRole(auction, seat, myFirst, partnerFirst),
  });

  const partner = createSeatMeaning({
    hcp: rangeFromMeaning(partnerMeaning),
    forcing: partnerMeaning.forcing,
    role: roleFromMeaning(partnerMeaning.role),
  });

  const lho = createSeatMeaning({
    hcp: rangeFromMeaning(lhoMeaning),
    forcing: lhoMeaning.forcing,
    role: roleFromMeaning(lhoMeaning.role),
  });

  const rho = createSeatMeaning({
    hcp: rangeFromMeaning(rhoMeaning),
    forcing: rhoMeaning.forcing,
    role: roleFromMeaning(rhoMeaning.role),
  });

  const forcingActive = me.obligations.length > 0;
  const activeConventions = detectConventions(myFirst, partnerFirst, opponentFirst, auction, seat);

  return createAuctionMeaningState({
    me,
    partner,
    lho,
    rho,
    phase: ctx.phase,
    forcingActive,
    activeConventions,
  });
}

/**
 * @param {Auction} auction
 * @param {Seat} seat
 * @param {import('../../model/bid.js').ContractBid | null} myFirst
 * @param {import('../../model/bid.js').ContractBid | null} partnerFirst
 * @returns {string[]}
 */
function collectObligations(auction, seat, myFirst, partnerFirst) {
  const obligations = [];
  if (!partnerFirst) return obligations;
  if (hasDoubleAfterPartnerBid(auction, seat)) return obligations;
  const partnerSeat = PARTNER[seat];
  const partnerFirstIdx = firstContractIndexBySeat(auction, partnerSeat);
  if (partnerFirstIdx < 0) return obligations;
  if (firstActionAfterIndex(auction, seat, partnerFirstIdx) >= 0) return obligations;
  if (hasOpponentContractAfterIndex(auction, seat, partnerFirstIdx)) return obligations;

  if (partnerFirst.level === 2 && partnerFirst.strain === Strain.CLUBS &&
      myFirst && myFirst.level === 1 && myFirst.strain === Strain.NOTRUMP &&
      isOpener(auction, seat)) {
    obligations.push('reply-to-stayman-hard');
  }
  if (partnerFirst.level === 2 &&
      (partnerFirst.strain === Strain.DIAMONDS || partnerFirst.strain === Strain.HEARTS) &&
      myFirst && myFirst.level === 1 && myFirst.strain === Strain.NOTRUMP &&
      isOpener(auction, seat)) {
    obligations.push(partnerFirst.strain === Strain.DIAMONDS
      ? 'complete-transfer-hearts-hard'
      : 'complete-transfer-spades-hard');
  }
  return obligations;
}

/**
 * @param {import('../../model/bid.js').ContractBid | null} myFirst
 * @param {import('../../model/bid.js').ContractBid | null} partnerFirst
 * @returns {'C'|'D'|'H'|'S'|'NT'|null}
 */
function inferAgreedStrain(myFirst, partnerFirst) {
  if (!myFirst || !partnerFirst) return null;

  if (myFirst.strain === partnerFirst.strain) {
    return myFirst.strain;
  }
  if (myFirst.level === 1 && myFirst.strain === Strain.NOTRUMP &&
      partnerFirst.level === 2 && partnerFirst.strain === Strain.DIAMONDS) {
    return Strain.HEARTS;
  }
  if (myFirst.level === 1 && myFirst.strain === Strain.NOTRUMP &&
      partnerFirst.level === 2 && partnerFirst.strain === Strain.HEARTS) {
    return Strain.SPADES;
  }
  if (partnerFirst.level === 2 && partnerFirst.strain === Strain.NOTRUMP &&
      (myFirst.strain === Strain.HEARTS || myFirst.strain === Strain.SPADES)) {
    return myFirst.strain;
  }
  return null;
}

/**
 * @param {Auction} auction
 * @param {Seat} seat
 * @param {import('../../model/bid.js').ContractBid | null} myFirst
 * @param {import('../../model/bid.js').ContractBid | null} partnerFirst
 * @returns {'opener'|'responder'|'advancer'|'overcaller'|'unknown'}
 */
function inferRole(auction, seat, myFirst, partnerFirst) {
  if (!myFirst) return 'unknown';
  if (isOpener(auction, seat)) return 'opener';
  if (partnerFirst && isOpener(auction, PARTNER[seat])) return 'responder';
  if (myFirst.level === 1 || myFirst.level === 2) return 'overcaller';
  return 'advancer';
}

/**
 * @param {string} meaningRole
 * @returns {'opener'|'responder'|'advancer'|'overcaller'|'unknown'}
 */
function roleFromMeaning(meaningRole) {
  if (meaningRole.startsWith('open-')) return 'opener';
  if (meaningRole.startsWith('respond-') || meaningRole.startsWith('jacoby-')) return 'responder';
  if (meaningRole.startsWith('advance-')) return 'advancer';
  if (meaningRole.startsWith('overcall-')) return 'overcaller';
  return 'unknown';
}

/**
 * @param {import('../../model/bid.js').ContractBid | null} myFirst
 * @param {import('../../model/bid.js').ContractBid | null} partnerFirst
 * @param {import('../../model/bid.js').ContractBid | null} opponentFirst
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {string[]}
 */
function detectConventions(myFirst, partnerFirst, opponentFirst, auction, seat) {
  const conventions = [];
  if (!myFirst || !partnerFirst) return conventions;

  if (myFirst.level === 1 && myFirst.strain === Strain.NOTRUMP) {
    if (partnerFirst.level === 2 && partnerFirst.strain === Strain.CLUBS) {
      conventions.push(hasInterferenceAfterPartner(auction, seat) ? 'stayman-interference' : 'stayman');
    }
    if (partnerFirst.level === 2 && partnerFirst.strain === Strain.DIAMONDS) {
      conventions.push('jacoby-transfer-hearts');
    }
    if (partnerFirst.level === 2 && partnerFirst.strain === Strain.HEARTS) {
      conventions.push('jacoby-transfer-spades');
    }
    if (partnerFirst.level === 2 && partnerFirst.strain === Strain.SPADES) {
      conventions.push('minor-transfer-clubs');
    }
  }
  if (myFirst.level === 1 &&
      (myFirst.strain === Strain.HEARTS || myFirst.strain === Strain.SPADES) &&
      partnerFirst.level === 2 && partnerFirst.strain === Strain.NOTRUMP) {
    conventions.push('jacoby-2nt');
  }
  if (opponentFirst && opponentFirst.strain === Strain.NOTRUMP) {
    conventions.push('vs-nt-competitive');
  }
  return conventions;
}

/**
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {number}
 */
function firstContractIndexBySeat(auction, seat) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  for (let i = 0; i < auction.bids.length; i++) {
    const bidSeat = SEATS[(dealerIdx + i) % SEATS.length];
    if (bidSeat === seat && auction.bids[i].type === 'contract') return i;
  }
  return -1;
}

/**
 * @param {Auction} auction
 * @param {Seat} seat
 * @param {number} startIdx
 * @returns {number}
 */
function firstActionAfterIndex(auction, seat, startIdx) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  for (let i = startIdx + 1; i < auction.bids.length; i++) {
    const bidSeat = SEATS[(dealerIdx + i) % SEATS.length];
    if (bidSeat === seat) return i;
  }
  return -1;
}

/**
 * @param {Auction} auction
 * @param {Seat} seat
 * @param {number} startIdx
 * @returns {boolean}
 */
function hasOpponentContractAfterIndex(auction, seat, startIdx) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  const partner = PARTNER[seat];
  for (let i = startIdx + 1; i < auction.bids.length; i++) {
    const bidSeat = SEATS[(dealerIdx + i) % SEATS.length];
    const bid = auction.bids[i];
    if (bidSeat !== seat && bidSeat !== partner && bid.type === 'contract') return true;
  }
  return false;
}

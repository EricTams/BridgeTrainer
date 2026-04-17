import {
  classifyAuction,
  findOwnBid,
  findPartnerBid,
  findPartnerLastBid,
  isTransferContextDead,
  isOpener,
} from '../../../engine/context.js';
import { Strain } from '../../../model/bid.js';
import { evaluate } from '../../../engine/evaluate.js';

/**
 * @typedef {import('../../../model/bid.js').Auction} Auction
 * @typedef {import('../../../model/deal.js').Seat} Seat
 * @typedef {import('../../../engine/context.js').AuctionPhase} AuctionPhase
 * @typedef {import('../../../model/bid.js').ContractBid} ContractBid
 *
 * @typedef {{
 *   phase: AuctionPhase,
 *   opener: boolean,
 *   myFirst: ContractBid | null,
 *   partnerFirst: ContractBid | null,
 *   partnerLast: ContractBid | null,
 *   myContractCount: number,
 *   stale: boolean,
 *   hand: import('../../../model/hand.js').Hand,
 *   eval_: import('../../../engine/evaluate.js').Evaluation,
 *   auction: Auction,
 *   seat: Seat,
 * }} ConventionContext
 */

/**
 * Build shared context used by convention packs.
 * @param {Auction} auction
 * @param {Seat} seat
 * @param {import('../../../model/hand.js').Hand} hand
 * @returns {ConventionContext}
 */
export function buildConventionPackContext(auction, seat, hand) {
  const eval_ = evaluate(hand);
  const phase = classifyAuction(auction, seat).phase;
  const myFirst = findOwnBid(auction, seat);
  const partnerFirst = findPartnerBid(auction, seat);
  const partnerLast = findPartnerLastBid(auction, seat);
  const opener = isOpener(auction, seat);
  return {
    phase,
    opener,
    myFirst,
    partnerFirst,
    partnerLast,
    myContractCount: contractCountBySeat(auction, seat),
    stale: isStaleWindow(auction, seat, myFirst, partnerFirst),
    hand,
    eval_,
    auction,
    seat,
  };
}

/**
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {number}
 */
function contractCountBySeat(auction, seat) {
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
 * Common NT-convention preconditions for pack matching.
 * @param {ConventionContext} ctx
 * @returns {boolean}
 */
export function shouldUseNTStaymanTransferPack(ctx) {
  if (ctx.phase !== 'rebid' && ctx.phase !== 'responding') return false;
  if (!ctx.myFirst || !ctx.partnerFirst) return false;
  if (ctx.myContractCount !== 1) return false;
  if (ctx.stale) return false;
  return true;
}

/**
 * Shared stale-window detection for NT transfer families.
 * @param {Auction} auction
 * @param {Seat} seat
 * @param {ContractBid | null} myFirst
 * @param {ContractBid | null} partnerFirst
 * @returns {boolean}
 */
function isStaleWindow(auction, seat, myFirst, partnerFirst) {
  if (!myFirst || !partnerFirst) return false;
  if (myFirst.level === 1 &&
      myFirst.strain === Strain.NOTRUMP &&
      isTransferContextDead(auction, seat)) {
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
function partnerSeat(seat) {
  if (seat === 'N') return 'S';
  if (seat === 'S') return 'N';
  if (seat === 'E') return 'W';
  return 'E';
}

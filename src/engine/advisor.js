import { pass } from '../model/bid.js';
import { evaluate } from './evaluate.js';
import { classifyAuction, findPartnerBid, findOwnBid } from './context.js';
import { getOpeningBids } from './opening.js';
import { getRespondingBids } from './responding.js';
import { getRebidBids } from './rebid.js';

/**
 * @typedef {import('./opening.js').BidRecommendation} BidRecommendation
 * @typedef {import('../model/hand.js').Hand} Hand
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('../model/deal.js').Seat} Seat
 */

/**
 * Get ranked bid recommendations for a hand in the current auction.
 * @param {Hand} hand
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {BidRecommendation[]}
 */
export function getRecommendations(hand, auction, seat) {
  const eval_ = evaluate(hand);
  const ctx = classifyAuction(auction, seat);

  switch (ctx.phase) {
    case 'opening':
      return getOpeningBids(hand, eval_, ctx.seatPosition);
    case 'responding': {
      const partnerBid = findPartnerBid(auction, seat);
      if (!partnerBid) return [{ bid: pass(), priority: 10, explanation: 'No partner bid found' }];
      return getRespondingBids(hand, eval_, partnerBid);
    }
    case 'rebid': {
      const myBid = findOwnBid(auction, seat);
      const partnerBid = findPartnerBid(auction, seat);
      if (!myBid || !partnerBid) {
        return [{ bid: pass(), priority: 10, explanation: 'Cannot determine auction context' }];
      }
      return getRebidBids(hand, eval_, myBid, partnerBid, auction);
    }
    case 'competitive':
      return [{ bid: pass(), priority: 10, explanation: 'Phase not yet implemented' }];
    case 'passed-out':
      return [];
  }
}

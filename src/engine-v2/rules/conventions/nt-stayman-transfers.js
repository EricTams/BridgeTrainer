import {
  classifyAuction,
  findOwnBid,
  findPartnerBid,
  findPartnerLastBid,
  hasInterferenceAfterPartner,
  isOpener,
} from '../../../engine/context.js';
import { evaluate } from '../../../engine/evaluate.js';
import { Strain } from '../../../model/bid.js';
import { scoreOpenerAfterStayman, scoreResponderAfterStaymanReply } from './stayman.js';
import {
  scoreOpenerAfterMajorTransfer,
  scoreOpenerAfterMinorTransfer,
  scoreResponderAfterMajorTransferAccepted,
  scoreResponderAfterMinorTransferAccepted,
} from './transfers.js';
import {
  contractCountBySeat,
  isStaleWindow,
  transferTargetFromCall,
} from './shared.js';

/**
 * @typedef {import('../../../model/hand.js').Hand} Hand
 * @typedef {import('../../../model/bid.js').Auction} Auction
 * @typedef {import('../../../model/deal.js').Seat} Seat
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

/**
 * v2 convention pack for 1NT Stayman/transfer families.
 * Returns null when the auction is outside covered windows.
 * @param {Hand} hand
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {BidRecommendation[] | null}
 */
export function getNTStaymanTransferRuleRecommendations(hand, auction, seat) {
  const ctx = classifyAuction(auction, seat);
  if (ctx.phase !== 'rebid' && ctx.phase !== 'responding') return null;

  const myFirst = findOwnBid(auction, seat);
  const partnerFirst = findPartnerBid(auction, seat);
  if (!myFirst || !partnerFirst) return null;
  if (contractCountBySeat(auction, seat) !== 1) return null;
  if (isStaleWindow(auction, myFirst, partnerFirst, seat)) return null;

  const eval_ = evaluate(hand);
  const opener = isOpener(auction, seat);

  if (opener &&
      myFirst.level === 1 && myFirst.strain === Strain.NOTRUMP &&
      partnerFirst.level === 2) {
    if (partnerFirst.strain === Strain.CLUBS) {
      return scoreOpenerAfterStayman(auction, eval_, hasInterferenceAfterPartner(auction, seat));
    }
    if (partnerFirst.strain === Strain.DIAMONDS || partnerFirst.strain === Strain.HEARTS) {
      return scoreOpenerAfterMajorTransfer(
        auction,
        eval_,
        partnerFirst.strain,
        hasInterferenceAfterPartner(auction, seat),
      );
    }
    if (partnerFirst.strain === Strain.SPADES) {
      return scoreOpenerAfterMinorTransfer(auction);
    }
  }

  if (!opener &&
      partnerFirst.level === 1 && partnerFirst.strain === Strain.NOTRUMP &&
      myFirst.level === 2) {
    const partnerLast = findPartnerLastBid(auction, seat);
    if (!partnerLast) return null;

    if (myFirst.strain === Strain.CLUBS &&
        partnerLast.level === 2 &&
        (partnerLast.strain === Strain.DIAMONDS ||
         partnerLast.strain === Strain.HEARTS ||
         partnerLast.strain === Strain.SPADES)) {
      return scoreResponderAfterStaymanReply(auction, eval_, partnerLast.strain);
    }

    if ((myFirst.strain === Strain.DIAMONDS || myFirst.strain === Strain.HEARTS) &&
        partnerLast.strain === transferTargetFromCall(myFirst.strain)) {
      return scoreResponderAfterMajorTransferAccepted(
        auction,
        eval_,
        transferTargetFromCall(myFirst.strain),
      );
    }

    if (myFirst.strain === Strain.SPADES &&
        partnerLast.level === 3 &&
        partnerLast.strain === Strain.CLUBS) {
      return scoreResponderAfterMinorTransferAccepted(auction, eval_);
    }
  }

  return null;
}

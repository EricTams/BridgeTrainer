import {
  findPartnerLastBid,
  hasInterferenceAfterPartner,
} from '../../../engine/context.js';
import { Strain } from '../../../model/bid.js';
import { scoreOpenerAfterStayman, scoreResponderAfterStaymanReply } from './stayman.js';
import {
  scoreOpenerAfterMajorTransfer,
  scoreOpenerAfterMinorTransfer,
  scoreResponderAfterMajorTransferAccepted,
  scoreResponderAfterMinorTransferAccepted,
} from './transfers.js';
import { transferTargetFromCall } from './shared.js';
import { shouldUseNTStaymanTransferPack } from './context.js';

/**
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

/**
 * v2 convention pack for 1NT Stayman/transfer families.
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[] | null}
 */
function runNTStaymanTransferPack(ctx) {
  if (!shouldUseNTStaymanTransferPack(ctx)) return null;

  const { auction, seat, eval_, opener, myFirst, partnerFirst } = ctx;

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

/**
 * @type {{ id: string, priority: number, when: (ctx: ConventionContext) => boolean, run: (ctx: ConventionContext) => BidRecommendation[] | null }}
 */
export const ntStaymanTransferPack = {
  id: 'nt-stayman-transfers',
  priority: 100,
  when: shouldUseNTStaymanTransferPack,
  run: runNTStaymanTransferPack,
};

/**
 * Back-compat callable form used by existing imports/tests.
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[] | null}
 */
export function getNTStaymanTransferRuleRecommendations(ctx) {
  return ntStaymanTransferPack.run(ctx);
}

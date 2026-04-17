import { dbl, isLegalBid, pass, Strain } from '../../../model/bid.js';
import {
  findOpponentBid,
  hasPartnerDoubled,
  isBalancingSeat,
  reopeningWithoutOwnBid,
} from '../../../engine/context.js';
import { rec, suitLen } from './shared.js';
import {
  qualifiesTakeoutOrStrong,
  hasClassicTakeoutShape,
  takeoutDoubleMinHcp,
} from './advancer-shared.js';

/**
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

const REOPEN_STRONG_HCP = 17;

/**
 * @param {ConventionContext} ctx
 * @returns {boolean}
 */
function shouldUseReopeningDoublePack(ctx) {
  if (ctx.phase !== 'competitive') return false;
  if (ctx.myFirst || ctx.partnerFirst) return false;
  if (!reopeningWithoutOwnBid(ctx.auction, ctx.seat)) return false;
  if (!isBalancingSeat(ctx.auction)) return false;
  if (hasPartnerDoubled(ctx.auction, ctx.seat)) return false;

  const oppBid = findOpponentBid(ctx.auction, ctx.seat);
  if (!oppBid || oppBid.strain === Strain.NOTRUMP) return false;

  const reopeningDouble = dbl();
  if (!isLegalBid(ctx.auction, reopeningDouble)) return false;

  const oppLen = suitLen(ctx.eval_.shape, oppBid.strain);
  const minHcp = takeoutDoubleMinHcp(oppBid.level, oppLen, true);
  return qualifiesTakeoutOrStrong(ctx.eval_.hcp, minHcp, REOPEN_STRONG_HCP, ctx.eval_.shape, oppBid.strain);
}

/**
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[] | null}
 */
function runReopeningDoublePack(ctx) {
  if (!shouldUseReopeningDoublePack(ctx)) return null;

  const oppBid = findOpponentBid(ctx.auction, ctx.seat);
  if (!oppBid) return null;

  const hcp = ctx.eval_.hcp;
  const dblExpl = `${hcp} HCP: reopening double over ${oppBid.level}${oppBid.strain}`;
  const passExpl = `${hcp} HCP: pass as fallback`;
  return [
    rec(dbl(), 10, dblExpl),
    rec(pass(), 4, passExpl),
  ];
}

/**
 * @type {{ id: string, priority: number, when: (ctx: ConventionContext) => boolean, run: (ctx: ConventionContext) => BidRecommendation[] | null }}
 */
export const reopeningDoublePack = {
  id: 'reopening-double',
  priority: 58,
  when: shouldUseReopeningDoublePack,
  run: runReopeningDoublePack,
};

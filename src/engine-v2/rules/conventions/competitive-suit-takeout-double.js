import { dbl, isLegalBid, pass, Strain } from '../../../model/bid.js';
import {
  directCompetitiveContextPrefix,
  findOpponentBid,
  hasPartnerDoubled,
  isBalancingSeat,
} from '../../../engine/context.js';
import { rec, suitLen } from './shared.js';
import {
  hasClassicTakeoutShape,
  takeoutDoubleMinHcp,
} from './advancer-shared.js';

/**
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

const TAKEOUT_STRONG_HCP = 17;

/**
 * @param {ConventionContext} ctx
 * @returns {boolean}
 */
function shouldUseCompetitiveSuitTakeoutDoublePack(ctx) {
  if (ctx.phase !== 'competitive') return false;
  if (ctx.myFirst || ctx.partnerFirst) return false;
  if (hasPartnerDoubled(ctx.auction, ctx.seat)) return false;

  const oppBid = findOpponentBid(ctx.auction, ctx.seat);
  if (!oppBid || oppBid.strain === Strain.NOTRUMP) return false;

  const takeoutDouble = dbl();
  if (!isLegalBid(ctx.auction, takeoutDouble)) return false;

  const minHcp = takeoutDoubleMinHcp(
    oppBid.level,
    suitLen(ctx.eval_.shape, oppBid.strain),
    isBalancingSeat(ctx.auction),
  );
  if (ctx.eval_.hcp < minHcp) return false;

  if (ctx.eval_.hcp >= TAKEOUT_STRONG_HCP) return true;
  return hasClassicTakeoutShape(ctx.eval_.shape, oppBid.strain);
}

/**
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[] | null}
 */
function runCompetitiveSuitTakeoutDoublePack(ctx) {
  if (!shouldUseCompetitiveSuitTakeoutDoublePack(ctx)) return null;

  const oppBid = findOpponentBid(ctx.auction, ctx.seat);
  if (!oppBid) return null;

  const prefix = directCompetitiveContextPrefix(ctx.auction, ctx.seat);
  const hcp = ctx.eval_.hcp;
  const oppLabel = `${oppBid.level}${oppBid.strain}`;
  const dblExpl = `${prefix}${hcp} HCP: takeout double over ${oppLabel}`;
  const passExpl = `${hcp} HCP: pass as fallback`;
  return [
    rec(dbl(), 10, dblExpl),
    rec(pass(), 3, passExpl),
  ];
}

/**
 * @type {{ id: string, priority: number, when: (ctx: ConventionContext) => boolean, run: (ctx: ConventionContext) => BidRecommendation[] | null }}
 */
export const competitiveSuitTakeoutDoublePack = {
  id: 'competitive-suit-takeout-double',
  priority: 55,
  when: shouldUseCompetitiveSuitTakeoutDoublePack,
  run: runCompetitiveSuitTakeoutDoublePack,
};

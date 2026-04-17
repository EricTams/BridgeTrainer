import { dbl, isLegalBid, pass, Strain } from '../../../model/bid.js';
import { directCompetitiveContextPrefix, isBalancingSeat } from '../../../engine/context.js';
import { rec, suitLen } from './shared.js';
import {
  getDirectCompetitiveOvercallWindow,
  hasClassicTakeoutShape,
  qualifiesTakeoutDouble,
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
  const window = getDirectCompetitiveOvercallWindow(ctx, { maxOppLevel: 7 });
  if (!window) return false;
  const { oppBid } = window;

  const takeoutDouble = dbl();
  if (!isLegalBid(ctx.auction, takeoutDouble)) return false;

  return qualifiesTakeoutDouble(
    ctx.eval_.shape,
    ctx.eval_.hcp,
    oppBid.strain,
    takeoutDoubleMinHcp(
      oppBid.level,
      suitLen(ctx.eval_.shape, oppBid.strain),
      isBalancingSeat(ctx.auction),
    ),
    TAKEOUT_STRONG_HCP,
    hasClassicTakeoutShape,
  );
}

/**
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[] | null}
 */
function runCompetitiveSuitTakeoutDoublePack(ctx) {
  if (!shouldUseCompetitiveSuitTakeoutDoublePack(ctx)) return null;

  const window = getDirectCompetitiveOvercallWindow(ctx, { maxOppLevel: 7 });
  if (!window) return null;
  const { oppBid } = window;

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

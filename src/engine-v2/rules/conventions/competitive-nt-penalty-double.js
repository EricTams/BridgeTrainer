import { dbl, isLegalBid, pass, Strain } from '../../../model/bid.js';
import {
  directCompetitiveContextPrefix,
  findOpponentBid,
  hasPartnerDoubled,
  isBalancingSeat,
} from '../../../engine/context.js';
import { rec } from './shared.js';

/**
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

const NT_PENALTY_MIN_HCP = 15;
const BALANCING_DISCOUNT = 3;

/**
 * @param {ConventionContext} ctx
 * @returns {boolean}
 */
function shouldUseCompetitiveNTPenaltyDoublePack(ctx) {
  if (ctx.phase !== 'competitive') return false;
  if (ctx.myFirst || ctx.partnerFirst) return false;
  if (hasPartnerDoubled(ctx.auction, ctx.seat)) return false;

  const oppBid = findOpponentBid(ctx.auction, ctx.seat);
  if (!oppBid || oppBid.strain !== Strain.NOTRUMP) return false;
  if (oppBid.level !== 1 && oppBid.level !== 2) return false;

  const penaltyDouble = dbl();
  if (!isLegalBid(ctx.auction, penaltyDouble)) return false;

  const minHcp = penaltyDoubleMinHcp(isBalancingSeat(ctx.auction));
  return ctx.eval_.hcp >= minHcp;
}

/**
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[] | null}
 */
function runCompetitiveNTPenaltyDoublePack(ctx) {
  if (!shouldUseCompetitiveNTPenaltyDoublePack(ctx)) return null;

  const oppBid = findOpponentBid(ctx.auction, ctx.seat);
  if (!oppBid) return null;

  const prefix = directCompetitiveContextPrefix(ctx.auction, ctx.seat);
  const hcp = ctx.eval_.hcp;
  const dblExpl = `${prefix}${hcp} HCP: penalty double of ${oppBid.level}NT`;
  const passExpl = `${hcp} HCP: pass as fallback`;
  return [
    rec(dbl(), 10, dblExpl),
    rec(pass(), 3, passExpl),
  ];
}

/**
 * @param {boolean} balancing
 * @returns {number}
 */
function penaltyDoubleMinHcp(balancing) {
  if (!balancing) return NT_PENALTY_MIN_HCP;
  return NT_PENALTY_MIN_HCP - BALANCING_DISCOUNT;
}

/**
 * @type {{ id: string, priority: number, when: (ctx: ConventionContext) => boolean, run: (ctx: ConventionContext) => BidRecommendation[] | null }}
 */
export const competitiveNTPenaltyDoublePack = {
  id: 'competitive-nt-penalty-double',
  priority: 60,
  when: shouldUseCompetitiveNTPenaltyDoublePack,
  run: runCompetitiveNTPenaltyDoublePack,
};

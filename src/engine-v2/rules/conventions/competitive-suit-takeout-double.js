import { dbl, isLegalBid, pass, Strain } from '../../../model/bid.js';
import {
  directCompetitiveContextPrefix,
  findOpponentBid,
  hasPartnerDoubled,
  isBalancingSeat,
} from '../../../engine/context.js';
import { rec, suitLen } from './shared.js';

/**
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

const TAKEOUT_BASE_MIN_HCP = 12;
const TAKEOUT_LEVEL_STEP = 2;
const TAKEOUT_STRONG_HCP = 17;
const BALANCING_DISCOUNT = 3;
const VOID_SHAPE_BONUS = 2;
const SINGLETON_SHAPE_BONUS = 1;

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
 * @param {number} oppLevel
 * @param {number} oppLen
 * @param {boolean} balancing
 * @returns {number}
 */
function takeoutDoubleMinHcp(oppLevel, oppLen, balancing) {
  const levelExtra = Math.max(0, oppLevel - 1) * TAKEOUT_LEVEL_STEP;
  const balancingAdj = balancing ? BALANCING_DISCOUNT : 0;
  const shapeAdj = oppLen === 0 ? VOID_SHAPE_BONUS : oppLen === 1 ? SINGLETON_SHAPE_BONUS : 0;
  return Math.max(10, TAKEOUT_BASE_MIN_HCP + levelExtra - balancingAdj - shapeAdj);
}

/**
 * @param {number[]} shape
 * @param {'C'|'D'|'H'|'S'} oppStrain
 * @returns {boolean}
 */
function hasClassicTakeoutShape(shape, oppStrain) {
  const oppLen = suitLen(shape, oppStrain);
  if (oppLen > 2) return false;
  return shortestUnbidSuit(shape, oppStrain) >= 3;
}

/**
 * @param {number[]} shape
 * @param {'C'|'D'|'H'|'S'} oppStrain
 * @returns {number}
 */
function shortestUnbidSuit(shape, oppStrain) {
  const suits = [Strain.SPADES, Strain.HEARTS, Strain.DIAMONDS, Strain.CLUBS];
  let shortest = 13;
  for (const suit of suits) {
    if (suit === oppStrain) continue;
    shortest = Math.min(shortest, suitLen(shape, suit));
  }
  return shortest;
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

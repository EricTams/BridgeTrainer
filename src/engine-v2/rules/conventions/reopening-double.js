import { dbl, isLegalBid, pass, Strain } from '../../../model/bid.js';
import {
  findOpponentBid,
  hasPartnerDoubled,
  isBalancingSeat,
  reopeningWithoutOwnBid,
} from '../../../engine/context.js';
import { rec, suitLen } from './shared.js';

/**
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

const REOPEN_BASE_MIN_HCP = 12;
const REOPEN_LEVEL_STEP = 2;
const REOPEN_BALANCING_DISCOUNT = 3;
const REOPEN_VOID_BONUS = 2;
const REOPEN_SINGLETON_BONUS = 1;
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
  const minHcp = reopeningDoubleMinHcp(oppBid.level, oppLen);
  if (ctx.eval_.hcp < minHcp) return false;
  if (ctx.eval_.hcp >= REOPEN_STRONG_HCP) return true;
  return hasClassicTakeoutShape(ctx.eval_.shape, oppBid.strain);
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
 * @param {number} oppLevel
 * @param {number} oppLen
 * @returns {number}
 */
function reopeningDoubleMinHcp(oppLevel, oppLen) {
  const levelExtra = Math.max(0, oppLevel - 1) * REOPEN_LEVEL_STEP;
  const shapeAdj = oppLen === 0 ? REOPEN_VOID_BONUS : oppLen === 1 ? REOPEN_SINGLETON_BONUS : 0;
  return Math.max(9, REOPEN_BASE_MIN_HCP + levelExtra - REOPEN_BALANCING_DISCOUNT - shapeAdj);
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
export const reopeningDoublePack = {
  id: 'reopening-double',
  priority: 58,
  when: shouldUseReopeningDoublePack,
  run: runReopeningDoublePack,
};

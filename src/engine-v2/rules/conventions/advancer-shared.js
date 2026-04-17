import { Strain, isLegalBid, pass } from '../../../model/bid.js';
import {
  findLastDoubledBid,
  findOpponentBid,
  hasPartnerDoubled,
} from '../../../engine/context.js';

/**
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 */

/**
 * Shared window matcher for first action after partner's active double.
 * @param {ConventionContext} ctx
 * @returns {{ partner: 'N'|'E'|'S'|'W', doubledBid: import('../../../model/bid.js').ContractBid, oppBid: import('../../../model/bid.js').ContractBid } | null}
 */
export function getActivePartnerDoubleContext(ctx) {
  if (ctx.phase !== 'competitive') return null;
  if (ctx.myFirst || ctx.partnerFirst) return null;
  if (!hasPartnerDoubled(ctx.auction, ctx.seat)) return null;
  if (!isLegalBid(ctx.auction, pass())) return null;

  const partner = partnerSeat(ctx.seat);
  const doubledBid = findLastDoubledBid(ctx.auction, partner);
  const oppBid = findOpponentBid(ctx.auction, ctx.seat);
  if (!doubledBid || !oppBid) return null;
  return { partner, doubledBid, oppBid };
}

/**
 * @param {'N'|'E'|'S'|'W'} seat
 * @returns {'N'|'E'|'S'|'W'}
 */
export function partnerSeat(seat) {
  if (seat === 'N') return 'S';
  if (seat === 'S') return 'N';
  if (seat === 'E') return 'W';
  return 'E';
}

const TAKEOUT_BASE_MIN_HCP = 12;
const TAKEOUT_LEVEL_STEP = 2;
const BALANCING_DISCOUNT = 3;
const VOID_SHAPE_BONUS = 2;
const SINGLETON_SHAPE_BONUS = 1;

/**
 * Shared threshold helper used by takeout/reopening-style doubles.
 * @param {number} oppLevel
 * @param {number} oppLen
 * @param {boolean} balancing
 * @returns {number}
 */
export function takeoutDoubleMinHcp(oppLevel, oppLen, balancing) {
  const levelExtra = Math.max(0, oppLevel - 1) * TAKEOUT_LEVEL_STEP;
  const balancingAdj = balancing ? BALANCING_DISCOUNT : 0;
  const shapeAdj = oppLen === 0 ? VOID_SHAPE_BONUS : oppLen === 1 ? SINGLETON_SHAPE_BONUS : 0;
  return Math.max(10, TAKEOUT_BASE_MIN_HCP + levelExtra - balancingAdj - shapeAdj);
}

/**
 * Shared classic takeout-shape gate.
 * @param {number[]} shape
 * @param {'C'|'D'|'H'|'S'} oppStrain
 * @returns {boolean}
 */
export function hasClassicTakeoutShape(shape, oppStrain) {
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
 * @param {number[]} shape
 * @param {'C'|'D'|'H'|'S'} strain
 * @returns {number}
 */
function suitLen(shape, strain) {
  if (strain === Strain.SPADES) return shape[0];
  if (strain === Strain.HEARTS) return shape[1];
  if (strain === Strain.DIAMONDS) return shape[2];
  return shape[3];
}


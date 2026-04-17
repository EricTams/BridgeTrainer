import { Strain, dbl, isLegalBid, pass } from '../../../model/bid.js';
import {
  findLastDoubledBid,
  findOpponentBid,
  hasPartnerDoubled,
  isBalancingSeat,
  seatHasPassed,
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
 * Narrow "direct overcall" style competitive window.
 * Avoids firing convention packs in balancing/passed-hand cleanup auctions.
 * @param {ConventionContext} ctx
 * @param {{ maxOppLevel?: number }} [opts]
 * @returns {{ oppBid: import('../../../model/bid.js').ContractBid } | null}
 */
export function getDirectCompetitiveOvercallWindow(ctx, opts = {}) {
  const maxOppLevel = opts.maxOppLevel ?? 2;
  const oppBid = directCompetitiveOppBid(ctx, maxOppLevel);
  if (!oppBid || oppBid.strain === Strain.NOTRUMP) return null;
  return { oppBid };
}

/**
 * Narrow direct-overcall NT window for penalty-double style packs.
 * @param {ConventionContext} ctx
 * @param {{ maxOppLevel?: number }} [opts]
 * @returns {{ oppBid: import('../../../model/bid.js').ContractBid } | null}
 */
export function getDirectCompetitiveNtWindow(ctx, opts = {}) {
  const maxOppLevel = opts.maxOppLevel ?? 2;
  const oppBid = directCompetitiveOppBid(ctx, maxOppLevel);
  if (!oppBid || oppBid.strain !== Strain.NOTRUMP) return null;
  return { oppBid };
}

/**
 * Shared direct-overcall opp-bid gate.
 * @param {ConventionContext} ctx
 * @param {number} maxOppLevel
 * @returns {import('../../../model/bid.js').ContractBid | null}
 */
function directCompetitiveOppBid(ctx, maxOppLevel) {
  if (ctx.phase !== 'competitive') return null;
  if (ctx.myFirst || ctx.partnerFirst) return null;
  if (hasPartnerDoubled(ctx.auction, ctx.seat)) return null;
  if (seatHasPassed(ctx.auction, ctx.seat)) return null;
  if (isBalancingSeat(ctx.auction)) return null;
  if (countContractBids(ctx.auction) !== 1) return null;
  if (hasAnyDouble(ctx.auction)) return null;

  const oppBid = findOpponentBid(ctx.auction, ctx.seat);
  if (!oppBid) return null;
  if (oppBid.level > maxOppLevel) return null;
  return oppBid;
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
const TAKEOUT_STRONG_HCP = 17;
export const DIRECT_OVERCALL_MIN_TWO_SUITER_HCP = 8;
export const DIRECT_OVERCALL_STRONG_TWO_SUITER_HCP = 16;

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
 * Shared gate for takeout/reopening style doubles.
 * @param {number[]} shape
 * @param {number} hcp
 * @param {import('../../../model/bid.js').ContractBid} oppBid
 * @param {boolean} balancing
 * @returns {boolean}
 */
export function qualifiesTakeoutDoubleProfile(shape, hcp, oppBid, balancing) {
  const oppLen = suitLen(shape, oppBid.strain);
  const minHcp = takeoutDoubleMinHcp(oppBid.level, oppLen, balancing);
  return qualifiesTakeoutOrStrong(hcp, minHcp, TAKEOUT_STRONG_HCP, shape, oppBid.strain);
}

/**
 * Shared takeout/reopening acceptance gate.
 * @param {number} hcp
 * @param {number} minHcp
 * @param {number} strongHcp
 * @param {number[]} shape
 * @param {'C'|'D'|'H'|'S'} oppStrain
 * @returns {boolean}
 */
export function qualifiesTakeoutOrStrong(hcp, minHcp, strongHcp, shape, oppStrain) {
  if (hcp < minHcp) return false;
  if (hcp >= strongHcp) return true;
  return hasClassicTakeoutShape(shape, oppStrain);
}

/**
 * Shared takeout-double gate with optional shape predicate override.
 * @param {number[]} shape
 * @param {number} hcp
 * @param {'C'|'D'|'H'|'S'} oppStrain
 * @param {number} minHcp
 * @param {number} strongHcp
 * @param {(shape: number[], oppStrain: 'C'|'D'|'H'|'S') => boolean} [shapeGate]
 * @returns {boolean}
 */
export function qualifiesTakeoutDouble(shape, hcp, oppStrain, minHcp, strongHcp, shapeGate = hasClassicTakeoutShape) {
  if (hcp < minHcp) return false;
  if (hcp >= strongHcp) return true;
  return shapeGate(shape, oppStrain);
}

/**
 * Shared two-suiter gate for direct competitive convention windows.
 * @param {number[]} shape
 * @param {number} hcp
 * @param {Array<'C'|'D'|'H'|'S'>} suits
 * @param {{
 *   minLenEach: number,
 *   strongLenA: number,
 *   strongLenB: number,
 *   minHcp: number,
 *   maxHcp: number,
 *   strongShapeMinHcp: number
 * }} cfg
 * @returns {boolean}
 */
export function qualifiesTwoSuiterByHcpShape(shape, hcp, suits, cfg) {
  const lenA = suitLen(shape, suits[0]);
  const lenB = suitLen(shape, suits[1]);
  const bothReady = lenA >= cfg.minLenEach && lenB >= cfg.minLenEach;
  if (!bothReady) return false;
  const strongShape = lenA >= cfg.strongLenA && lenB >= cfg.strongLenB;
  if (strongShape) return hcp >= cfg.strongShapeMinHcp;
  return hcp >= cfg.minHcp && hcp <= cfg.maxHcp;
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
 * Shared two-suit length gate used by overcall conventions.
 * @param {number[]} shape
 * @param {'C'|'D'|'H'|'S'} suitA
 * @param {number} minA
 * @param {'C'|'D'|'H'|'S'} suitB
 * @param {number} minB
 * @returns {boolean}
 */
export function hasTwoSuitLengths(shape, suitA, minA, suitB, minB) {
  return suitLen(shape, suitA) >= minA && suitLen(shape, suitB) >= minB;
}

/**
 * Shared negative-double window helper.
 * @param {ConventionContext} ctx
 * @returns {{ oppBid: import('../../../model/bid.js').ContractBid, partnerStrain: 'C'|'D'|'H'|'S' } | null}
 */
export function getNegativeDoubleWindow(ctx) {
  if (ctx.phase !== 'responding') return null;
  if (ctx.myFirst) return null;
  if (!ctx.partnerFirst) return null;
  if (ctx.partnerFirst.level !== 1 || ctx.partnerFirst.strain === Strain.NOTRUMP) return null;
  if (countContractBids(ctx.auction) !== 2) return null;

  const oppBid = findOpponentBid(ctx.auction, ctx.seat);
  if (!oppBid || oppBid.strain === Strain.NOTRUMP) return null;
  if (oppBid.level > 2) return null;
  if (!isLegalBid(ctx.auction, dbl())) return null;
  return {
    oppBid,
    partnerStrain: ctx.partnerFirst.strain,
  };
}

/**
 * Shared helper for unbid majors in negative-double windows.
 * @param {'C'|'D'|'H'|'S'} partnerStrain
 * @param {'C'|'D'|'H'|'S'} oppStrain
 * @returns {Array<'H'|'S'>}
 */
export function unbidMajors(partnerStrain, oppStrain) {
  /** @type {Array<'H'|'S'>} */
  const majors = [Strain.HEARTS, Strain.SPADES];
  return majors.filter(major => major !== partnerStrain && major !== oppStrain);
}

/**
 * Shared level-based negative-double threshold.
 * @param {number} oppLevel
 * @param {number[]} shape
 * @returns {number}
 */
export function negativeDoubleMinHcp(oppLevel, shape) {
  const NEG_DBL_1_MIN_HCP = 6;
  const NEG_DBL_2_MIN_HCP = 8;
  const NEG_DBL_3_MIN_HCP = 10;
  const DIST_SHAPE_DISCOUNT = 1;
  const base = oppLevel === 1 ? NEG_DBL_1_MIN_HCP : oppLevel === 2 ? NEG_DBL_2_MIN_HCP : NEG_DBL_3_MIN_HCP;
  const distAdj = shape.some(len => len === 0) ? DIST_SHAPE_DISCOUNT : 0;
  return Math.max(5, base - distAdj);
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

/**
 * @param {import('../../../model/bid.js').Auction} auction
 * @returns {number}
 */
function countContractBids(auction) {
  let count = 0;
  for (const bid of auction.bids) {
    if (bid.type === 'contract') count++;
  }
  return count;
}

/**
 * @param {import('../../../model/bid.js').Auction} auction
 * @returns {boolean}
 */
function hasAnyDouble(auction) {
  for (const bid of auction.bids) {
    if (bid.type === 'double' || bid.type === 'redouble') return true;
  }
  return false;
}


import { contractBid, isLegalBid, pass, Strain } from '../../../model/bid.js';
import { findOpponentBid, hasPartnerDoubled } from '../../../engine/context.js';
import { rec, suitLen } from './shared.js';

/**
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

const UNUSUAL_NT_MIN_HCP = 10;
const UNUSUAL_NT_MIN_CLUBS = 5;
const UNUSUAL_NT_MIN_DIAMONDS = 5;
const UNUSUAL_NT_MIN_HEARTS = 5;
const UNUSUAL_NT_MIN_SPADES = 5;

/**
 * @param {ConventionContext} ctx
 * @returns {boolean}
 */
function shouldUseUnusualNotrumpPack(ctx) {
  if (ctx.phase !== 'competitive') return false;
  if (ctx.myFirst || ctx.partnerFirst) return false;
  if (hasPartnerDoubled(ctx.auction, ctx.seat)) return false;

  const oppBid = findOpponentBid(ctx.auction, ctx.seat);
  if (!oppBid || oppBid.strain === Strain.NOTRUMP) return false;
  if (oppBid.level !== 1) return false;

  const unusualBid = contractBid(oppBid.level + 1, Strain.NOTRUMP);
  if (!isLegalBid(ctx.auction, unusualBid)) return false;

  return unusualShapeReady(ctx.eval_.shape, oppBid.strain) &&
    ctx.eval_.hcp >= UNUSUAL_NT_MIN_HCP;
}

/**
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[] | null}
 */
function runUnusualNotrumpPack(ctx) {
  if (!shouldUseUnusualNotrumpPack(ctx)) return null;

  const oppBid = findOpponentBid(ctx.auction, ctx.seat);
  if (!oppBid) return null;

  const unusualBid = contractBid(oppBid.level + 1, Strain.NOTRUMP);
  if (!isLegalBid(ctx.auction, unusualBid)) return null;

  const twoSuits = unusualSuitsOver(oppBid.strain);
  const suitText = `${strainName(twoSuits[0])}/${strainName(twoSuits[1])}`;
  const hcp = ctx.eval_.hcp;
  return [
    rec(unusualBid, 10, `${hcp} HCP, ${suitText}: unusual 2NT`),
    rec(pass(), 4, `${hcp} HCP: pass as fallback`),
  ];
}

/**
 * @param {number[]} shape
 * @param {'C'|'D'|'H'|'S'} oppStrain
 * @returns {boolean}
 */
function unusualShapeReady(shape, oppStrain) {
  const suits = unusualSuitsOver(oppStrain);
  return suitLen(shape, suits[0]) >= minLenForUnusual(suits[0]) &&
    suitLen(shape, suits[1]) >= minLenForUnusual(suits[1]);
}

/**
 * @param {'C'|'D'|'H'|'S'} oppStrain
 * @returns {Array<'C'|'D'|'H'|'S'>}
 */
function unusualSuitsOver(oppStrain) {
  if (oppStrain === Strain.CLUBS) return [Strain.DIAMONDS, Strain.HEARTS];
  if (oppStrain === Strain.DIAMONDS) return [Strain.CLUBS, Strain.HEARTS];
  if (oppStrain === Strain.HEARTS) return [Strain.CLUBS, Strain.DIAMONDS];
  return [Strain.CLUBS, Strain.DIAMONDS];
}

/**
 * @param {'C'|'D'|'H'|'S'} strain
 * @returns {number}
 */
function minLenForUnusual(strain) {
  if (strain === Strain.CLUBS) return UNUSUAL_NT_MIN_CLUBS;
  if (strain === Strain.DIAMONDS) return UNUSUAL_NT_MIN_DIAMONDS;
  if (strain === Strain.HEARTS) return UNUSUAL_NT_MIN_HEARTS;
  return UNUSUAL_NT_MIN_SPADES;
}

/**
 * @param {'C'|'D'|'H'|'S'} strain
 * @returns {string}
 */
function strainName(strain) {
  if (strain === Strain.CLUBS) return 'clubs';
  if (strain === Strain.DIAMONDS) return 'diamonds';
  if (strain === Strain.HEARTS) return 'hearts';
  return 'spades';
}

/**
 * @type {{ id: string, priority: number, when: (ctx: ConventionContext) => boolean, run: (ctx: ConventionContext) => BidRecommendation[] | null }}
 */
export const unusualNotrumpPack = {
  id: 'unusual-notrump',
  priority: 56,
  when: shouldUseUnusualNotrumpPack,
  run: runUnusualNotrumpPack,
};

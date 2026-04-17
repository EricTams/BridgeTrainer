import { contractBid, isLegalBid, pass, Strain } from '../../../model/bid.js';
import { rec, suitLen } from './shared.js';
import {
  DIRECT_OVERCALL_MIN_TWO_SUITER_HCP,
  getDirectCompetitiveOvercallWindow,
} from './advancer-shared.js';

/**
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

const UNUSUAL_NT_MIN_HCP = DIRECT_OVERCALL_MIN_TWO_SUITER_HCP;
const UNUSUAL_NT_MIN_CLUBS = 5;
const UNUSUAL_NT_MIN_DIAMONDS = 5;
const UNUSUAL_NT_MIN_HEARTS = 5;
const UNUSUAL_NT_MIN_SPADES = 5;

/**
 * @param {ConventionContext} ctx
 * @returns {boolean}
 */
function shouldUseUnusualNotrumpPack(ctx) {
  const window = getDirectCompetitiveOvercallWindow(ctx, { maxOppLevel: 1 });
  if (!window) return false;
  const { oppBid } = window;

  const unusualBid = contractBid(oppBid.level + 1, Strain.NOTRUMP);
  if (!isLegalBid(ctx.auction, unusualBid)) return false;

  if (ctx.eval_.hcp < UNUSUAL_NT_MIN_HCP) return false;
  return unusualShapeReady(ctx.eval_.shape, oppBid.strain);
}

/**
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[] | null}
 */
function runUnusualNotrumpPack(ctx) {
  if (!shouldUseUnusualNotrumpPack(ctx)) return null;
  const window = getDirectCompetitiveOvercallWindow(ctx, { maxOppLevel: 1 });
  if (!window) return null;
  const { oppBid } = window;

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

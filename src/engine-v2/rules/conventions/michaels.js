import { contractBid, isLegalBid, pass, Strain } from '../../../model/bid.js';
import { findOpponentBid, hasPartnerDoubled } from '../../../engine/context.js';
import { rec, suitLen } from './shared.js';

/**
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

const MICHAELS_MIN_HCP = 8;
const MICHAELS_STRONG_HCP = 16;
const MICHAELS_6_5_HCP = 6;
const MICHAELS_MIN_LEN = 5;
const MICHAELS_STRONG_MINOR_MIN = 5;

/**
 * @param {ConventionContext} ctx
 * @returns {boolean}
 */
function shouldUseMichaelsPack(ctx) {
  if (ctx.phase !== 'competitive') return false;
  if (ctx.myFirst || ctx.partnerFirst) return false;
  if (hasPartnerDoubled(ctx.auction, ctx.seat)) return false;

  const oppBid = findOpponentBid(ctx.auction, ctx.seat);
  if (!oppBid || oppBid.strain === Strain.NOTRUMP) return false;
  if (oppBid.level !== 1) return false;

  const cueBid = michaelsCueBid(oppBid);
  if (!cueBid || !isLegalBid(ctx.auction, cueBid)) return false;
  return qualifiesMichaelsShape(ctx.eval_.shape, ctx.eval_.hcp, oppBid.strain);
}

/**
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[] | null}
 */
function runMichaelsPack(ctx) {
  if (!shouldUseMichaelsPack(ctx)) return null;

  const oppBid = findOpponentBid(ctx.auction, ctx.seat);
  if (!oppBid) return null;

  const cueBid = michaelsCueBid(oppBid);
  if (!cueBid) return null;
  const hcp = ctx.eval_.hcp;
  const shape = ctx.eval_.shape;
  const pairs = michaelsSuitsForOpp(oppBid.strain);
  const pairLabel = pairs.map(strainName).join('/');
  const pairLens = pairs.map(s => suitLen(shape, s)).join('-');
  return [
    rec(
      cueBid,
      10,
      `${hcp} HCP, ${pairLens} in ${pairLabel}: Michaels cue bid`,
    ),
    rec(pass(), 3, `${hcp} HCP: pass as fallback`),
  ];
}

/**
 * @param {import('../../../model/bid.js').ContractBid} oppBid
 * @returns {import('../../../model/bid.js').ContractBid | null}
 */
function michaelsCueBid(oppBid) {
  if (oppBid.level >= 7) return null;
  return contractBid(oppBid.level + 1, oppBid.strain);
}

/**
 * @param {number[]} shape
 * @param {number} hcp
 * @param {'C'|'D'|'H'|'S'} oppStrain
 * @returns {boolean}
 */
function qualifiesMichaelsShape(shape, hcp, oppStrain) {
  const pair = michaelsSuitsForOpp(oppStrain);
  const lenA = suitLen(shape, pair[0]);
  const lenB = suitLen(shape, pair[1]);
  const bothFive = lenA >= MICHAELS_MIN_LEN && lenB >= MICHAELS_MIN_LEN;
  if (!bothFive) return false;

  if (lenA >= 6 && lenB >= MICHAELS_STRONG_MINOR_MIN) {
    return hcp >= MICHAELS_6_5_HCP;
  }
  return hcp >= MICHAELS_MIN_HCP && hcp <= MICHAELS_STRONG_HCP;
}

/**
 * @param {'C'|'D'|'H'|'S'} oppStrain
 * @returns {Array<'H'|'S'|'C'|'D'>}
 */
function michaelsSuitsForOpp(oppStrain) {
  if (oppStrain === Strain.CLUBS || oppStrain === Strain.DIAMONDS) {
    return [Strain.HEARTS, Strain.SPADES];
  }
  return [Strain.CLUBS, Strain.DIAMONDS];
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
export const michaelsPack = {
  id: 'michaels',
  priority: 57,
  when: shouldUseMichaelsPack,
  run: runMichaelsPack,
};

import { contractBid, isLegalBid, pass, Strain } from '../../../model/bid.js';
import { rec, suitLen } from './shared.js';
import {
  getDirectCompetitiveOvercallWindow,
  qualifiesTwoSuiterByHcpShape,
} from './advancer-shared.js';

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
  const window = getDirectCompetitiveOvercallWindow(ctx, { maxOppLevel: 1 });
  if (!window) return false;
  const { oppBid } = window;

  const cueBid = michaelsCueBid(oppBid);
  if (!cueBid || !isLegalBid(ctx.auction, cueBid)) return false;
  return qualifiesTwoSuiterByHcpShape(
    ctx.eval_.shape,
    ctx.eval_.hcp,
    michaelsSuitsForOpp(oppBid.strain),
    {
      minLenEach: MICHAELS_MIN_LEN,
      strongLenA: 6,
      strongLenB: MICHAELS_STRONG_MINOR_MIN,
      minHcp: MICHAELS_MIN_HCP,
      maxHcp: MICHAELS_STRONG_HCP,
      strongShapeMinHcp: MICHAELS_6_5_HCP,
    },
  );
}

/**
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[] | null}
 */
function runMichaelsPack(ctx) {
  if (!shouldUseMichaelsPack(ctx)) return null;

  const window = getDirectCompetitiveOvercallWindow(ctx, { maxOppLevel: 1 });
  if (!window) return null;
  const { oppBid } = window;

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

import { dbl, isLegalBid, pass, Strain } from '../../../model/bid.js';
import { rec, suitLen } from './shared.js';
import {
  getNegativeDoubleWindow,
  negativeDoubleMinHcp,
  unbidMajors,
} from './advancer-shared.js';

/**
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

const NEG_DBL_MAJOR_LEN = 4;
const NATURAL_MAJOR_PREFERENCE_LEN = 5;

/**
 * @param {ConventionContext} ctx
 * @returns {boolean}
 */
function shouldUseNegativeDoublePack(ctx) {
  const window = getNegativeDoubleWindow(ctx);
  if (!window) return false;

  const unbid = unbidMajors(window.partnerStrain, window.oppBid.strain);
  if (unbid.length === 0) return false;
  const bestMajorLen = Math.max(...unbid.map(suit => suitLen(ctx.eval_.shape, suit)));
  if (bestMajorLen < NEG_DBL_MAJOR_LEN) return false;
  if (preferNaturalMajorBid(ctx, window, unbid)) return false;

  const minHcp = negativeDoubleMinHcp(window.oppBid.level, ctx.eval_.shape);
  return ctx.eval_.hcp >= minHcp;
}

/**
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[] | null}
 */
function runNegativeDoublePack(ctx) {
  if (!shouldUseNegativeDoublePack(ctx)) return null;

  const window = getNegativeDoubleWindow(ctx);
  if (!window) return null;

  const unbid = unbidMajors(window.partnerStrain, window.oppBid.strain);
  const shownMajors = unbid.filter(suit => suitLen(ctx.eval_.shape, suit) >= NEG_DBL_MAJOR_LEN);
  const shownLabel = shownMajors.map(majorName).join('/');
  const bestMajorLen = Math.max(...shownMajors.map(suit => suitLen(ctx.eval_.shape, suit)));
  const hcp = ctx.eval_.hcp;

  return [
    rec(dbl(), 10, `${hcp} HCP, ${bestMajorLen}+ ${shownLabel}: negative double`),
    rec(pass(), 3, `${hcp} HCP: pass as fallback`),
  ];
}

/**
 * @param {'H'|'S'} strain
 * @returns {string}
 */
function majorName(strain) {
  return strain === Strain.HEARTS ? 'hearts' : 'spades';
}

/**
 * @type {{ id: string, priority: number, when: (ctx: ConventionContext) => boolean, run: (ctx: ConventionContext) => BidRecommendation[] | null }}
 */
export const negativeDoublePack = {
  id: 'negative-double',
  priority: 50,
  when: shouldUseNegativeDoublePack,
  run: runNegativeDoublePack,
};

/**
 * With a clear 5+ card unbid major that can be bid naturally,
 * prefer that direct major action over a shape-showing negative double.
 * @param {ConventionContext} ctx
 * @param {{ oppBid: import('../../../model/bid.js').ContractBid, partnerStrain: 'C'|'D'|'H'|'S' }} window
 * @param {Array<'H'|'S'>} unbid
 * @returns {boolean}
 */
function preferNaturalMajorBid(ctx, window, unbid) {
  /** @type {Array<'H'|'S'>} */
  const naturalMajors = unbid.filter(s => suitLen(ctx.eval_.shape, s) >= NATURAL_MAJOR_PREFERENCE_LEN);
  if (naturalMajors.length !== 1) return false;
  const major = naturalMajors[0];
  const level = nextLevelForStrain(window.oppBid, major);
  if (level <= 0 || level > 7) return false;
  return isLegalBid(ctx.auction, { type: 'contract', level, strain: major });
}

/**
 * @param {import('../../../model/bid.js').ContractBid} floor
 * @param {'H'|'S'} strain
 * @returns {number}
 */
function nextLevelForStrain(floor, strain) {
  const order = [Strain.CLUBS, Strain.DIAMONDS, Strain.HEARTS, Strain.SPADES, Strain.NOTRUMP];
  const floorIdx = order.indexOf(floor.strain);
  const targetIdx = order.indexOf(strain);
  if (floorIdx < 0 || targetIdx < 0) return 0;
  if (targetIdx > floorIdx) return floor.level;
  return floor.level + 1;
}

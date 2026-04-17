import { dbl, isLegalBid, pass, Strain } from '../../../model/bid.js';
import { findOpponentBid } from '../../../engine/context.js';
import { rec, suitLen } from './shared.js';

/**
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

const NEG_DBL_1_MIN_HCP = 6;
const NEG_DBL_2_MIN_HCP = 8;
const NEG_DBL_3_MIN_HCP = 10;
const NEG_DBL_MAJOR_LEN = 4;
const DIST_SHAPE_DISCOUNT = 1;

/**
 * @param {ConventionContext} ctx
 * @returns {boolean}
 */
function shouldUseNegativeDoublePack(ctx) {
  if (ctx.phase !== 'responding') return false;
  if (ctx.myFirst) return false;
  if (!ctx.partnerFirst) return false;
  if (ctx.partnerFirst.level !== 1 || ctx.partnerFirst.strain === Strain.NOTRUMP) return false;
  if (countContractBids(ctx.auction) !== 2) return false;

  const oppBid = findOpponentBid(ctx.auction, ctx.seat);
  if (!oppBid || oppBid.strain === Strain.NOTRUMP) return false;
  if (oppBid.level > 2) return false;

  const negDouble = dbl();
  if (!isLegalBid(ctx.auction, negDouble)) return false;

  const unbidMajors = getUnbidMajors(ctx.partnerFirst.strain, oppBid.strain);
  if (unbidMajors.length === 0) return false;

  const bestMajorLen = Math.max(...unbidMajors.map(suit => suitLen(ctx.eval_.shape, suit)));
  if (bestMajorLen < NEG_DBL_MAJOR_LEN) return false;

  const minHcp = negativeDoubleMinHcp(oppBid.level, ctx.eval_.shape);
  return ctx.eval_.hcp >= minHcp;
}

/**
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[] | null}
 */
function runNegativeDoublePack(ctx) {
  if (!shouldUseNegativeDoublePack(ctx)) return null;

  const oppBid = findOpponentBid(ctx.auction, ctx.seat);
  if (!oppBid || !ctx.partnerFirst) return null;

  const unbidMajors = getUnbidMajors(ctx.partnerFirst.strain, oppBid.strain);
  const shownMajors = unbidMajors.filter(suit => suitLen(ctx.eval_.shape, suit) >= NEG_DBL_MAJOR_LEN);
  const shownLabel = shownMajors.map(majorName).join('/');
  const bestMajorLen = Math.max(...shownMajors.map(suit => suitLen(ctx.eval_.shape, suit)));
  const hcp = ctx.eval_.hcp;

  return [
    rec(dbl(), 10, `${hcp} HCP, ${bestMajorLen}+ ${shownLabel}: negative double`),
    rec(pass(), 3, `${hcp} HCP: pass as fallback`),
  ];
}

/**
 * @param {number} oppLevel
 * @param {number[]} shape
 * @returns {number}
 */
function negativeDoubleMinHcp(oppLevel, shape) {
  const base = oppLevel === 1 ? NEG_DBL_1_MIN_HCP : oppLevel === 2 ? NEG_DBL_2_MIN_HCP : NEG_DBL_3_MIN_HCP;
  const distAdj = shape.some(len => len === 0) ? DIST_SHAPE_DISCOUNT : 0;
  return Math.max(5, base - distAdj);
}

/**
 * @param {'C'|'D'|'H'|'S'} partnerStrain
 * @param {'C'|'D'|'H'|'S'} oppStrain
 * @returns {Array<'H'|'S'>}
 */
function getUnbidMajors(partnerStrain, oppStrain) {
  /** @type {Array<'H'|'S'>} */
  const majors = [Strain.HEARTS, Strain.SPADES];
  return majors.filter(major => major !== partnerStrain && major !== oppStrain);
}

/**
 * @param {'H'|'S'} strain
 * @returns {string}
 */
function majorName(strain) {
  return strain === Strain.HEARTS ? 'hearts' : 'spades';
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
 * @type {{ id: string, priority: number, when: (ctx: ConventionContext) => boolean, run: (ctx: ConventionContext) => BidRecommendation[] | null }}
 */
export const negativeDoublePack = {
  id: 'negative-double',
  priority: 50,
  when: shouldUseNegativeDoublePack,
  run: runNegativeDoublePack,
};

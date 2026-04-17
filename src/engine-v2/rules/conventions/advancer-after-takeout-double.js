import { contractBid, isLegalBid, pass, Strain } from '../../../model/bid.js';
import { rec, suitLen } from './shared.js';
import { getActivePartnerDoubleContext } from './advancer-shared.js';

/**
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

const ADVANCER_SUIT_MIN_LEN = 4;
const ADVANCER_STRONG_HCP = 12;
const ADVANCER_PASS_MIN_HCP = 8;
const ADVANCER_PASS_MIN_LEN = 5;

/**
 * @param {ConventionContext} ctx
 * @returns {boolean}
 */
function shouldUseAdvancerAfterTakeoutDoublePack(ctx) {
  const window = getActivePartnerDoubleContext(ctx);
  if (!window) return false;
  return window.doubledBid.strain !== Strain.NOTRUMP;
}

/**
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[] | null}
 */
function runAdvancerAfterTakeoutDoublePack(ctx) {
  const window = getActivePartnerDoubleContext(ctx);
  if (!window) return null;
  if (window.doubledBid.strain === Strain.NOTRUMP) return null;

  const { oppBid } = window;
  const hcp = ctx.eval_.hcp;
  const shape = ctx.eval_.shape;
  const oppLen = oppBid.strain === Strain.NOTRUMP ? 0 : suitLen(shape, oppBid.strain);

  /** @type {BidRecommendation[]} */
  const results = [rec(pass(), passPriority(hcp, oppLen), passExplanation(hcp, oppLen, oppBid.strain))];

  const suitBid = bestSuitAdvance(ctx, oppBid);
  if (suitBid) results.push(suitBid);

  const ntBid = ntAdvance(ctx, oppBid);
  if (ntBid) results.push(ntBid);

  const cueBid = cueAdvance(ctx, oppBid);
  if (cueBid) results.push(cueBid);

  return results;
}

/**
 * @param {number} hcp
 * @param {number} oppLen
 * @returns {number}
 */
function passPriority(hcp, oppLen) {
  if (hcp >= ADVANCER_PASS_MIN_HCP && oppLen >= ADVANCER_PASS_MIN_LEN) return 10;
  if (hcp >= ADVANCER_PASS_MIN_HCP) return 6;
  return 4;
}

/**
 * @param {number} hcp
 * @param {number} oppLen
 * @param {'C'|'D'|'H'|'S'|'NT'} oppStrain
 * @returns {string}
 */
function passExplanation(hcp, oppLen, oppStrain) {
  if (oppLen >= ADVANCER_PASS_MIN_LEN && hcp >= ADVANCER_PASS_MIN_HCP) {
    return `${oppLen} ${strainName(oppStrain)} with ${hcp} HCP: convert to penalty`;
  }
  return `${hcp} HCP: pass as fallback after partner's takeout double`;
}

/**
 * @param {ConventionContext} ctx
 * @param {import('../../../model/bid.js').ContractBid} oppBid
 * @returns {BidRecommendation | null}
 */
function bestSuitAdvance(ctx, oppBid) {
  const shape = ctx.eval_.shape;
  const best = bestNonOppSuit(shape, oppBid.strain);
  if (!best) return null;
  const level = cheapestLevelOverBid(oppBid, best);
  if (level <= 0) return null;
  const bid = contractBid(level, best);
  if (!isLegalBid(ctx.auction, bid)) return null;
  return rec(
    bid,
    suitAdvancePriority(ctx.eval_.hcp, suitLen(shape, best)),
    `${ctx.eval_.hcp} HCP, ${suitLen(shape, best)} ${strainName(best)}: minimum advance`,
  );
}

/**
 * @param {number} hcp
 * @param {number} len
 * @returns {number}
 */
function suitAdvancePriority(hcp, len) {
  if (len >= 5 && hcp >= 9) return 10;
  if (len >= ADVANCER_SUIT_MIN_LEN && hcp >= 6) return 8;
  return 5;
}

/**
 * @param {ConventionContext} ctx
 * @param {import('../../../model/bid.js').ContractBid} oppBid
 * @returns {BidRecommendation | null}
 */
function ntAdvance(ctx, oppBid) {
  if (oppBid.strain === Strain.NOTRUMP) return null;
  if (ctx.eval_.shapeClass !== 'balanced' && ctx.eval_.shapeClass !== 'semi-balanced') return null;
  if (ctx.eval_.hcp < ADVANCER_PASS_MIN_HCP) return null;
  const level = cheapestLevelOverBid(oppBid, Strain.NOTRUMP);
  if (level <= 0) return null;
  const bid = contractBid(level, Strain.NOTRUMP);
  if (!isLegalBid(ctx.auction, bid)) return null;
  return rec(bid, 7, `${ctx.eval_.hcp} HCP with stopper posture: ${level}NT advance`);
}

/**
 * @param {ConventionContext} ctx
 * @param {import('../../../model/bid.js').ContractBid} oppBid
 * @returns {BidRecommendation | null}
 */
function cueAdvance(ctx, oppBid) {
  if (ctx.eval_.hcp < ADVANCER_STRONG_HCP) return null;
  const level = cheapestLevelOverBid(oppBid, oppBid.strain);
  if (level <= 0) return null;
  const bid = contractBid(level, oppBid.strain);
  if (!isLegalBid(ctx.auction, bid)) return null;
  return rec(bid, 8, `${ctx.eval_.hcp} HCP: cue bid advance after partner's takeout double`);
}

/**
 * @param {number[]} shape
 * @param {'C'|'D'|'H'|'S'|'NT'} oppStrain
 * @returns {'C'|'D'|'H'|'S'|null}
 */
function bestNonOppSuit(shape, oppStrain) {
  /** @type {Array<'S'|'H'|'D'|'C'>} */
  const suits = [Strain.SPADES, Strain.HEARTS, Strain.DIAMONDS, Strain.CLUBS];
  let bestSuit = null;
  let bestLen = -1;
  for (const suit of suits) {
    if (suit === oppStrain) continue;
    const len = suitLen(shape, suit);
    if (len > bestLen) {
      bestLen = len;
      bestSuit = suit;
    }
  }
  if (!bestSuit || bestLen < ADVANCER_SUIT_MIN_LEN) return null;
  return bestSuit;
}

/**
 * @param {import('../../../model/bid.js').ContractBid} oppBid
 * @param {'C'|'D'|'H'|'S'|'NT'} target
 * @returns {number}
 */
function cheapestLevelOverBid(oppBid, target) {
  const order = [Strain.CLUBS, Strain.DIAMONDS, Strain.HEARTS, Strain.SPADES, Strain.NOTRUMP];
  const oppIdx = order.indexOf(oppBid.strain);
  const targetIdx = order.indexOf(target);
  if (oppIdx < 0 || targetIdx < 0) return 0;
  if (targetIdx > oppIdx) return oppBid.level;
  return oppBid.level + 1;
}

/**
 * @param {'C'|'D'|'H'|'S'|'NT'} strain
 * @returns {string}
 */
function strainName(strain) {
  if (strain === Strain.CLUBS) return 'clubs';
  if (strain === Strain.DIAMONDS) return 'diamonds';
  if (strain === Strain.HEARTS) return 'hearts';
  if (strain === Strain.SPADES) return 'spades';
  return 'notrump';
}

/**
 * @type {{ id: string, priority: number, when: (ctx: ConventionContext) => boolean, run: (ctx: ConventionContext) => BidRecommendation[] | null }}
 */
export const advancerAfterTakeoutDoublePack = {
  id: 'advancer-after-takeout-double',
  priority: 54,
  when: shouldUseAdvancerAfterTakeoutDoublePack,
  run: runAdvancerAfterTakeoutDoublePack,
};

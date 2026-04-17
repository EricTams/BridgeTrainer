import { dbl, isLegalBid, pass, Strain } from '../../../model/bid.js';
import { rec, suitLen } from './shared.js';
import { getActivePartnerDoubleContext } from './advancer-shared.js';

/**
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

const PENALTY_PASS_MIN_HCP = 8;
const PENALTY_PASS_MIN_LEN = 5;
const PENALTY_DOUBLE_MIN_HCP = 8;
const PENALTY_DOUBLE_MIN_LEN = 4;
const PENALTY_SUIT_MIN_LEN = 5;
const PENALTY_SUIT_MIN_HCP = 7;
const PENALTY_NT_MIN_HCP = 8;

/**
 * @param {ConventionContext} ctx
 * @returns {boolean}
 */
function shouldUseAdvancerAfterPenaltyDoublePack(ctx) {
  const dblCtx = getActivePartnerDoubleContext(ctx);
  if (!dblCtx) return false;
  if (dblCtx.doubledBid.strain !== Strain.NOTRUMP) return false;
  return true;
}

/**
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[] | null}
 */
function runAdvancerAfterPenaltyDoublePack(ctx) {
  const dblCtx = getActivePartnerDoubleContext(ctx);
  if (!dblCtx) return null;
  if (dblCtx.doubledBid.strain !== Strain.NOTRUMP) return null;

  const { oppBid } = dblCtx;
  const hcp = ctx.eval_.hcp;
  const shape = ctx.eval_.shape;

  if (oppBid.strain === Strain.NOTRUMP) {
    // Classic conversion when opponents stay in NT after partner's penalty double.
    return [rec(pass(), 10, `${hcp} HCP: pass to convert partner's NT double`)];
  }

  /** @type {BidRecommendation[]} */
  const results = [];
  const oppLen = suitLen(shape, oppBid.strain);
  const passPriority = hcp >= PENALTY_PASS_MIN_HCP && oppLen >= PENALTY_PASS_MIN_LEN ? 10 : 6;
  results.push(rec(pass(), passPriority, `${hcp} HCP: pass after opponent escape`));

  if (isLegalBid(ctx.auction, dbl()) && hcp >= PENALTY_DOUBLE_MIN_HCP && oppLen >= PENALTY_DOUBLE_MIN_LEN) {
    results.push(rec(dbl(), 9, `${oppLen} ${strainName(oppBid.strain)} with ${hcp} HCP: penalty double`));
  }

  const suit = bestNonOppSuit(shape, oppBid.strain);
  if (suit) {
    const level = cheapestLevelOverBid(oppBid, suit);
    const bid = { type: 'contract', level, strain: suit };
    if (isLegalBid(ctx.auction, bid) && suitLen(shape, suit) >= PENALTY_SUIT_MIN_LEN && hcp >= PENALTY_SUIT_MIN_HCP) {
      results.push(rec(bid, 8, `${hcp} HCP, ${suitLen(shape, suit)} ${strainName(suit)}: compete after escape`));
    }
  }

  const ntLevel = cheapestLevelOverBid(oppBid, Strain.NOTRUMP);
  const ntBid = { type: 'contract', level: ntLevel, strain: Strain.NOTRUMP };
  if (
    oppBid.strain !== Strain.NOTRUMP &&
    ntLevel > 0 &&
    isLegalBid(ctx.auction, ntBid) &&
    hcp >= PENALTY_NT_MIN_HCP &&
    (ctx.eval_.shapeClass === 'balanced' || ctx.eval_.shapeClass === 'semi-balanced')
  ) {
    results.push(rec(ntBid, 7, `${hcp} HCP with stopper posture: ${ntLevel}NT`));
  }
  return results;
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
  if (!bestSuit) return null;
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
export const advancerAfterPenaltyDoublePack = {
  id: 'advancer-after-penalty-double',
  priority: 54,
  when: shouldUseAdvancerAfterPenaltyDoublePack,
  run: runAdvancerAfterPenaltyDoublePack,
};

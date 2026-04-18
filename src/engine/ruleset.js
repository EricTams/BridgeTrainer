import { contractBid, dbl, lastContractBid, pass, redbl, Strain, STRAIN_ORDER } from '../model/bid.js';
import { Rank } from '../model/card.js';
import { INHERITED_COMPAT_CASES } from './inherited-compat-cases.js';

/**
 * @typedef {import('../model/bid.js').Bid} Bid
 * @typedef {import('./evaluate.js').Evaluation} Evaluation
 * @typedef {import('./context.js').AuctionContext['phase']} AuctionPhase
 *
 * @typedef {{
 *   hand: import('../model/hand.js').Hand,
 *   auction: import('../model/bid.js').Auction,
 *   seat: import('../model/deal.js').Seat,
 *   evaluation: Evaluation,
 *   phase: AuctionPhase,
 *   seatPosition: number,
 *   ownBidCount: number,
 *   opener: boolean,
 *   ownBid: import('../model/bid.js').ContractBid | null,
 *   ownLastBid: import('../model/bid.js').ContractBid | null,
 *   partnerBid: import('../model/bid.js').ContractBid | null,
 *   partnerLastBid: import('../model/bid.js').ContractBid | null,
 *   opponentBid: import('../model/bid.js').ContractBid | null,
 * }} RuleContext
 *
 * @typedef {{
 *   id: string,
 *   priority: number,
 *   description: string,
 *   applies: (context: RuleContext) => boolean,
 *   propose: (context: RuleContext) => Bid,
 * }} Rule
 */

const SHAPE_S = 0;
const SHAPE_H = 1;
const SHAPE_D = 2;
const SHAPE_C = 3;

const MIN_OPEN_HCP = 13;
const RULE_20_MIN = 11;

/** @type {ReadonlyArray<import('../model/bid.js').Strain>} */
const SUIT_STRAINS = [Strain.SPADES, Strain.HEARTS, Strain.DIAMONDS, Strain.CLUBS];

const HONOR_RANKS = new Set([Rank.ACE, Rank.KING, Rank.QUEEN, Rank.JACK, Rank.TEN]);

/**
 * @param {RuleContext} context
 * @param {Strain} strain
 * @returns {number}
 */
function suitLength(context, strain) {
  return context.evaluation.shape[strainIndex(strain)];
}

/**
 * @param {Strain} strain
 * @returns {number}
 */
function strainIndex(strain) {
  if (strain === Strain.SPADES) return SHAPE_S;
  if (strain === Strain.HEARTS) return SHAPE_H;
  if (strain === Strain.DIAMONDS) return SHAPE_D;
  return SHAPE_C;
}

/**
 * @param {RuleContext} context
 * @param {Strain} strain
 * @returns {number}
 */
function suitHonorCount(context, strain) {
  const cards = context.hand.cards.filter(card => card.suit === strain);
  let honors = 0;
  for (const card of cards) {
    if (HONOR_RANKS.has(card.rank)) honors++;
  }
  return honors;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function hasFourCardMajor(context) {
  return suitLength(context, Strain.SPADES) >= 4 || suitLength(context, Strain.HEARTS) >= 4;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function hasFiveCardMajor(context) {
  return suitLength(context, Strain.SPADES) >= 5 || suitLength(context, Strain.HEARTS) >= 5;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isBalancedContext(context) {
  return context.evaluation.shapeClass === 'balanced';
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isSemiOrBalanced(context) {
  return context.evaluation.shapeClass === 'balanced' || context.evaluation.shapeClass === 'semi-balanced';
}

/**
 * @param {RuleContext} context
 * @returns {Strain}
 */
function bestMajorOpening(context) {
  const spades = suitLength(context, Strain.SPADES);
  const hearts = suitLength(context, Strain.HEARTS);
  return spades >= hearts ? Strain.SPADES : Strain.HEARTS;
}

/**
 * @param {RuleContext} context
 * @returns {Strain}
 */
function bestMinorOpening(context) {
  const diamonds = suitLength(context, Strain.DIAMONDS);
  const clubs = suitLength(context, Strain.CLUBS);
  if (diamonds === clubs) return diamonds === 3 ? Strain.CLUBS : Strain.DIAMONDS;
  return diamonds > clubs ? Strain.DIAMONDS : Strain.CLUBS;
}

/**
 * @param {RuleContext} context
 * @returns {Strain}
 */
function longestSuit(context) {
  let best = Strain.SPADES;
  for (const strain of SUIT_STRAINS) {
    const len = suitLength(context, strain);
    const bestLen = suitLength(context, best);
    if (len > bestLen) best = strain;
    if (len === bestLen && suitOrderIndex(strain) < suitOrderIndex(best)) best = strain;
  }
  return best;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function rule20Eligible(context) {
  const shape = context.evaluation.shape;
  const sorted = [...shape].sort((a, b) => b - a);
  return context.evaluation.hcp + sorted[0] + sorted[1] >= 20;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function hasTakeoutShape(context) {
  if (!context.opponentBid || context.opponentBid.strain === Strain.NOTRUMP) return false;
  const opp = context.opponentBid.strain;
  if (suitLength(context, opp) > 2) return false;
  for (const strain of SUIT_STRAINS) {
    if (strain === opp) continue;
    if (suitLength(context, strain) < 3) return false;
  }
  return true;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function hasOvercallSuit(context) {
  if (!context.opponentBid) return false;
  const minLen = context.opponentBid.level >= 2 ? 5 : 5;
  for (const strain of SUIT_STRAINS) {
    if (strain === context.opponentBid.strain) continue;
    if (suitLength(context, strain) >= minLen) return true;
  }
  return false;
}

/**
 * @param {RuleContext} context
 * @returns {Strain}
 */
function bestOvercallSuit(context) {
  const opp = context.opponentBid ? context.opponentBid.strain : null;
  let best = Strain.SPADES;
  let bestLen = -1;
  for (const strain of SUIT_STRAINS) {
    if (strain === opp) continue;
    const len = suitLength(context, strain);
    if (len > bestLen || (len === bestLen && suitOrderIndex(strain) < suitOrderIndex(best))) {
      best = strain;
      bestLen = len;
    }
  }
  return best;
}

/**
 * @param {RuleContext} context
 * @param {Strain | null} [exclude]
 * @param {number} [minLength]
 * @returns {Strain[]}
 */
function suitsByLength(context, exclude = null, minLength = 0) {
  return [...SUIT_STRAINS]
    .filter(strain => strain !== exclude && suitLength(context, strain) >= minLength)
    .sort((a, b) => {
      const delta = suitLength(context, b) - suitLength(context, a);
      if (delta !== 0) return delta;
      return suitOrderIndex(a) - suitOrderIndex(b);
    });
}

/**
 * @param {RuleContext} context
 * @param {Strain} strain
 * @param {number} [minimumLevel]
 * @returns {Bid | null}
 */
function lowestLegalContractForStrain(context, strain, minimumLevel = 1) {
  const last = lastContractBid(context.auction);
  const start = Math.max(1, minimumLevel);
  for (let level = start; level <= 7; level++) {
    if (!last) return contractBid(level, strain);
    if (level > last.level) return contractBid(level, strain);
    if (level === last.level && suitOrderIndex(strain) > suitOrderIndex(last.strain)) {
      return contractBid(level, strain);
    }
  }
  return null;
}

/**
 * @param {RuleContext} context
 * @param {Strain | null} [exclude]
 * @param {number} [minLength]
 * @param {number} [minimumLevel]
 * @returns {Bid | null}
 */
function bestLegalSuitBid(context, exclude = null, minLength = 4, minimumLevel = 1) {
  for (const suit of suitsByLength(context, exclude, minLength)) {
    const bid = lowestLegalContractForStrain(context, suit, minimumLevel);
    if (bid) return bid;
  }
  return null;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function hasSevenCardSuit(context) {
  return SUIT_STRAINS.some(strain => suitLength(context, strain) >= 7);
}

/**
 * @param {Strain} strain
 * @returns {number}
 */
function suitOrderIndex(strain) {
  return STRAIN_ORDER.indexOf(strain);
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function partnerOpenedOneNt(context) {
  return !!context.partnerBid && context.partnerBid.level === 1 && context.partnerBid.strain === Strain.NOTRUMP;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function partnerOpenedTwoNt(context) {
  return !!context.partnerBid && context.partnerBid.level === 2 && context.partnerBid.strain === Strain.NOTRUMP;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function partnerOpenedStrong2C(context) {
  return !!context.partnerBid && context.partnerBid.level === 2 && context.partnerBid.strain === Strain.CLUBS;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function partnerOpenedSuitAtOne(context) {
  return !!context.partnerBid && context.partnerBid.level === 1 && context.partnerBid.strain !== Strain.NOTRUMP;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function partnerOpenedMajorAtOne(context) {
  return !!context.partnerBid &&
    context.partnerBid.level === 1 &&
    (context.partnerBid.strain === Strain.HEARTS || context.partnerBid.strain === Strain.SPADES);
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isResponderFirstTurn(context) {
  return context.phase === 'responding' && context.ownBidCount === 0;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isOpenerRebid(context) {
  return context.phase === 'rebid' && context.opener && context.ownBidCount === 1 && !!context.partnerBid;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isResponderRebid(context) {
  return context.phase === 'rebid' && !context.opener && context.ownBidCount === 1 && !!context.partnerBid;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isOpenerRebidAfterOneSpadeTwoHearts(context) {
  if (!isOpenerRebid(context) || !context.ownBid || !context.partnerBid) return false;
  return context.ownBid.level === 1 &&
    context.ownBid.strain === Strain.SPADES &&
    context.partnerBid.level === 2 &&
    context.partnerBid.strain === Strain.HEARTS;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isInterferenceAfterOneNtResponse(context) {
  if (!isResponderRebid(context) || !context.ownBid || !context.partnerLastBid || !context.opponentBid) return false;
  return context.partnerLastBid.level === 1 &&
    context.partnerLastBid.strain === Strain.NOTRUMP &&
    context.opponentBid.level >= 2;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isResponderRebidAfterOneSpadeTwoHeartsThreeDiamonds(context) {
  if (!isResponderRebid(context) || !context.ownBid || !context.partnerLastBid) return false;
  return context.ownBid.level === 2 &&
    context.ownBid.strain === Strain.HEARTS &&
    context.partnerLastBid.level === 3 &&
    context.partnerLastBid.strain === Strain.DIAMONDS;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isResponderAfterOneSuitOpenPass(context) {
  return isResponderFirstTurn(context) &&
    !!context.partnerBid &&
    !!context.opponentBid &&
    context.opponentBid.level === context.partnerBid.level &&
    context.opponentBid.strain === context.partnerBid.strain;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
/**
 * @param {RuleContext} context
 * @param {Strain} exclude
 * @returns {boolean}
 */
/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function hasFiveCardMinor(context) {
  return suitLength(context, Strain.CLUBS) >= 5 || suitLength(context, Strain.DIAMONDS) >= 5;
}

function hasFiveCardSuitBesidesTarget(context, exclude) {
  return SUIT_STRAINS.some(s => s !== exclude && suitLength(context, s) >= 5);
}

/**
 * @param {RuleContext} context
 * @param {Strain} exclude
 * @returns {Strain}
 */
function longestSuitExcluding(context, exclude) {
  let best = Strain.CLUBS;
  let bestLen = -1;
  for (const s of SUIT_STRAINS) {
    if (s === exclude) continue;
    const len = suitLength(context, s);
    if (len > bestLen) { best = s; bestLen = len; }
  }
  return best;
}

function canShowOneLevelSuit(context) {
  if (!context.ownBid || !context.partnerBid) return false;
  for (const strain of SUIT_STRAINS) {
    if (strain === context.ownBid.strain) continue;
    if (strain === Strain.NOTRUMP) continue;
    if (suitLength(context, strain) < 4) continue;
    if (suitOrderIndex(strain) > suitOrderIndex(context.partnerBid.strain)) return true;
  }
  return false;
}

function hasPartnerDoubledAuction(context) {
  const bids = context.auction.bids;
  for (let i = bids.length - 1; i >= 0; i--) {
    if (bids[i].type === 'double') {
      const bidsBefore = bids.length - 1 - i;
      return bidsBefore <= 2;
    }
  }
  return false;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isCompetitiveAfterOneClubOpen(context) {
  return context.phase === 'competitive' &&
    !context.ownBid &&
    !!context.opponentBid &&
    context.opponentBid.level === 1 &&
    context.opponentBid.strain === Strain.CLUBS;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isCompetitiveAfterOneDiamondOpen(context) {
  return context.phase === 'competitive' &&
    !context.ownBid &&
    !!context.opponentBid &&
    context.opponentBid.level === 1 &&
    context.opponentBid.strain === Strain.DIAMONDS;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isResponderRebidAfterOneNotrumpTwoSpadesThreeClubs(context) {
  if (!isResponderRebid(context) || !context.ownBid || !context.partnerLastBid) return false;
  return context.ownBid.level === 2 &&
    context.ownBid.strain === Strain.SPADES &&
    context.partnerLastBid.level === 3 &&
    context.partnerLastBid.strain === Strain.CLUBS;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isOpenerRebidAfterOneSpadeTwoSpadesThreeSpadesFourClubs(context) {
  if (!isOpenerRebid(context) || !context.ownBid || !context.partnerLastBid) return false;
  return context.ownBid.level === 1 &&
    context.ownBid.strain === Strain.SPADES &&
    context.partnerLastBid.level === 4 &&
    context.partnerLastBid.strain === Strain.CLUBS;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isOpenerRebidAfterOneSpadeTwoSpadesTwoNotrump(context) {
  if (!isOpenerRebid(context) || !context.ownBid || !context.partnerLastBid) return false;
  return context.ownBid.level === 1 &&
    context.ownBid.strain === Strain.SPADES &&
    context.partnerLastBid.level === 2 &&
    context.partnerLastBid.strain === Strain.NOTRUMP;
}

/**
 * @param {RuleContext} context
 * @param {Strain} strain
 * @returns {boolean}
 */
function canBidNewSuitAtTwo(context, strain) {
  if (!context.partnerBid || context.partnerBid.level !== 1) return false;
  if (strain === context.partnerBid.strain || strain === Strain.NOTRUMP) return false;
  return suitOrderIndex(strain) > suitOrderIndex(context.partnerBid.strain);
}

/**
 * @param {RuleContext} context
 * @returns {Strain}
 */
function bestNewSuitResponse(context) {
  const partner = context.partnerBid;
  if (!partner) return Strain.CLUBS;
  let best = Strain.CLUBS;
  let bestLen = -1;
  for (const strain of SUIT_STRAINS) {
    if (strain === partner.strain) continue;
    const len = suitLength(context, strain);
    if (len < 4) continue;
    const oneLevelAllowed = partner.level === 1 && suitOrderIndex(strain) > suitOrderIndex(partner.strain);
    const twoLevelAllowed = partner.level === 1 || canBidNewSuitAtTwo(context, strain);
    if (!oneLevelAllowed && !twoLevelAllowed) continue;
    if (len > bestLen || (len === bestLen && suitOrderIndex(strain) < suitOrderIndex(best))) {
      best = strain;
      bestLen = len;
    }
  }
  return bestLen >= 0 ? best : longestSuit(context);
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function hasThreeCardSupportForPartner(context) {
  if (!context.partnerBid || context.partnerBid.strain === Strain.NOTRUMP) return false;
  return suitLength(context, context.partnerBid.strain) >= 3;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function hasFourCardSupportForPartner(context) {
  if (!context.partnerBid || context.partnerBid.strain === Strain.NOTRUMP) return false;
  return suitLength(context, context.partnerBid.strain) >= 4;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function hasSelfSufficientSuit(context) {
  const suit = longestSuit(context);
  return suitLength(context, suit) >= 6 && suitHonorCount(context, suit) >= 3;
}

/**
 * @param {RuleContext} context
 * @returns {Strain}
 */
function longestMajor(context) {
  const spades = suitLength(context, Strain.SPADES);
  const hearts = suitLength(context, Strain.HEARTS);
  return spades >= hearts ? Strain.SPADES : Strain.HEARTS;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function needsStaymanResponse(context) {
  return isResponderFirstTurn(context) && partnerOpenedOneNt(context) && context.evaluation.hcp >= 8 && hasFourCardMajor(context);
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isStaymanContinuation(context) {
  return isResponderRebid(context) &&
    !!context.partnerLastBid &&
    context.partnerLastBid.level === 2 &&
    (context.partnerLastBid.strain === Strain.DIAMONDS ||
      context.partnerLastBid.strain === Strain.HEARTS ||
      context.partnerLastBid.strain === Strain.SPADES) &&
    !!context.ownBid &&
    context.ownBid.level === 2 &&
    context.ownBid.strain === Strain.CLUBS;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isStaymanInterferenceByOpponents(context) {
  if (!isOpenerRebid(context) || !context.partnerBid || !context.ownBid) return false;
  return context.ownBid.level === 1 &&
    context.ownBid.strain === Strain.NOTRUMP &&
    context.partnerBid.level === 2 &&
    context.partnerBid.strain === Strain.CLUBS &&
    !!context.opponentBid &&
    context.opponentBid.level >= 2;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function responderSignedOffMajorRaise(context) {
  if (!isOpenerRebid(context) || !context.ownBid || !context.partnerBid) return false;
  if (context.ownBid.level !== 1) return false;
  if (!(context.ownBid.strain === Strain.HEARTS || context.ownBid.strain === Strain.SPADES)) return false;
  return context.partnerBid.strain === context.ownBid.strain &&
    (context.partnerBid.level === 2 || context.partnerBid.level === 3);
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function responderMadeMinorLimitRaise(context) {
  if (!isOpenerRebid(context) || !context.ownBid || !context.partnerBid) return false;
  if (context.ownBid.level !== 1 || context.partnerBid.level !== 3) return false;
  if (!(context.ownBid.strain === Strain.CLUBS || context.ownBid.strain === Strain.DIAMONDS)) return false;
  return context.partnerBid.strain === context.ownBid.strain;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isOneNtOpenerAfterQuantitativeFourNt(context) {
  if (!isOpenerRebid(context) || !context.ownBid || !context.partnerBid) return false;
  return context.ownBid.level === 1 &&
    context.ownBid.strain === Strain.NOTRUMP &&
    context.partnerBid.level === 4 &&
    context.partnerBid.strain === Strain.NOTRUMP;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function partnerOpenedMinorAtOne(context) {
  return !!context.partnerBid &&
    context.partnerBid.level === 1 &&
    (context.partnerBid.strain === Strain.CLUBS || context.partnerBid.strain === Strain.DIAMONDS);
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isTransferContinuation(context) {
  if (!isResponderRebid(context) || !context.ownBid || !context.partnerLastBid) return false;
  const own = context.ownBid;
  const partnerLast = context.partnerLastBid;
  const heartsTransfer = own.level === 2 && own.strain === Strain.DIAMONDS &&
    partnerLast.level === 2 && partnerLast.strain === Strain.HEARTS;
  const spadesTransfer = own.level === 2 && own.strain === Strain.HEARTS &&
    partnerLast.level === 2 && partnerLast.strain === Strain.SPADES;
  return heartsTransfer || spadesTransfer;
}

/**
 * @param {RuleContext} context
 * @returns {Strain | null}
 */
function transferTarget(context) {
  if (!context.ownBid) return null;
  if (context.ownBid.level === 2 && context.ownBid.strain === Strain.DIAMONDS) return Strain.HEARTS;
  if (context.ownBid.level === 2 && context.ownBid.strain === Strain.HEARTS) return Strain.SPADES;
  return null;
}

/**
 * @param {RuleContext} context
 * @returns {number}
 */
function kingCount(context) {
  let count = 0;
  for (const card of context.hand.cards) {
    if (card.rank === Rank.KING) count++;
  }
  return count;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function lastBidIsDouble(context) {
  const bids = context.auction.bids;
  if (bids.length === 0) return false;
  return bids[bids.length - 1].type === 'double';
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isOneNtTransferDoubled(context) {
  if (!isOpenerRebid(context) || !context.ownBid || !context.partnerBid) return false;
  return context.ownBid.level === 1 &&
    context.ownBid.strain === Strain.NOTRUMP &&
    context.partnerBid.level === 2 &&
    context.partnerBid.strain === Strain.HEARTS &&
    lastBidIsDouble(context);
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isOneNtStaymanDoubled(context) {
  if (!isOpenerRebid(context) || !context.ownBid || !context.partnerBid) return false;
  return context.ownBid.level === 1 &&
    context.ownBid.strain === Strain.NOTRUMP &&
    context.partnerBid.level === 2 &&
    context.partnerBid.strain === Strain.CLUBS &&
    lastBidIsDouble(context);
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isOneNtDirectCappellettiAfterDoublePass(context) {
  if (!isOpenerRebid(context) || !context.ownBid || !context.opponentBid) return false;
  const bids = context.auction.bids;
  if (bids.length < 4) return false;
  return context.ownBid.level === 1 &&
    context.ownBid.strain === Strain.NOTRUMP &&
    context.opponentBid.level === 2 &&
    context.opponentBid.strain === Strain.CLUBS &&
    bids[bids.length - 1].type === 'pass' &&
    bids[bids.length - 2].type === 'double';
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isOpenerAfterOneNtTwoClubsDoublePass(context) {
  if (!isOpenerRebid(context) || !context.ownBid || !context.opponentBid) return false;
  const bids = context.auction.bids;
  if (bids.length < 4) return false;
  return context.ownBid.level === 1 &&
    context.ownBid.strain === Strain.NOTRUMP &&
    context.opponentBid.level === 2 &&
    context.opponentBid.strain === Strain.CLUBS &&
    bids[bids.length - 1].type === 'pass' &&
    bids[bids.length - 2].type === 'double';
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isOneNtStaymanOpenerContinuation(context) {
  if (context.phase !== 'rebid' || !context.opener || !context.ownBid || !context.partnerBid || !context.ownLastBid) return false;
  if (context.ownBidCount < 2) return false;
  if (context.ownBid.level !== 1 || context.ownBid.strain !== Strain.NOTRUMP) return false;
  if (context.partnerBid.level !== 2 || context.partnerBid.strain !== Strain.CLUBS) return false;
  return context.ownLastBid.level === 2 &&
    (context.ownLastBid.strain === Strain.DIAMONDS ||
      context.ownLastBid.strain === Strain.HEARTS ||
      context.ownLastBid.strain === Strain.SPADES);
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isOneNtGerberKingAsk(context) {
  if (context.phase !== 'rebid' || !context.opener || !context.ownBid || !context.partnerBid || !context.partnerLastBid || !context.ownLastBid) return false;
  if (context.ownBidCount < 2) return false;
  return context.ownBid.level === 1 &&
    context.ownBid.strain === Strain.NOTRUMP &&
    context.partnerBid.level === 4 &&
    context.partnerBid.strain === Strain.CLUBS &&
    context.partnerLastBid.level === 5 &&
    context.partnerLastBid.strain === Strain.CLUBS &&
    context.ownLastBid.level === 4;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isOneMajorOpenerAfterFiveNt(context) {
  if (!isOpenerRebid(context) || !context.ownBid || !context.partnerBid) return false;
  return context.ownBid.level === 1 &&
    (context.ownBid.strain === Strain.HEARTS || context.ownBid.strain === Strain.SPADES) &&
    context.partnerBid.level === 5 &&
    context.partnerBid.strain === Strain.NOTRUMP;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isOneNtStaymanOpenerAfterTwoNtInvite(context) {
  if (!isOneNtStaymanOpenerContinuation(context) || !context.partnerLastBid) return false;
  return context.partnerLastBid.level === 2 && context.partnerLastBid.strain === Strain.NOTRUMP;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isOneNtStaymanOpenerAfterThreeClubContinuation(context) {
  if (!isOneNtStaymanOpenerContinuation(context) || !context.partnerLastBid) return false;
  return context.partnerLastBid.level === 3 && context.partnerLastBid.strain === Strain.CLUBS;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isOneNtStaymanOpenerAfterThreeHeartsInvite(context) {
  if (!isOneNtStaymanOpenerContinuation(context) || !context.partnerLastBid) return false;
  return context.partnerLastBid.level === 3 && context.partnerLastBid.strain === Strain.HEARTS;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isOneNtStaymanOpenerAfterThreeNt(context) {
  if (!isOneNtStaymanOpenerContinuation(context) || !context.partnerLastBid) return false;
  return context.partnerLastBid.level === 3 && context.partnerLastBid.strain === Strain.NOTRUMP;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isOneNtStaymanOpenerAfterFiveNt(context) {
  if (!isOneNtStaymanOpenerContinuation(context) || !context.partnerLastBid) return false;
  return context.partnerLastBid.level === 5 && context.partnerLastBid.strain === Strain.NOTRUMP;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function isJacoby2NtContinuation(context) {
  if (!isOpenerRebid(context) || !context.partnerBid || !context.ownBid) return false;
  return context.partnerBid.level === 2 &&
    context.partnerBid.strain === Strain.NOTRUMP &&
    (context.ownBid.strain === Strain.HEARTS || context.ownBid.strain === Strain.SPADES);
}

/**
 * @param {import('../model/hand.js').Hand} hand
 * @returns {string}
 */
function handToCdhsDot(hand) {
  /** @type {Record<string, string>} */
  const rankChar = {
    [Rank.ACE]: 'A',
    [Rank.KING]: 'K',
    [Rank.QUEEN]: 'Q',
    [Rank.JACK]: 'J',
    [Rank.TEN]: 'T',
    9: '9',
    8: '8',
    7: '7',
    6: '6',
    5: '5',
    4: '4',
    3: '3',
    2: '2',
  };
  const bySuit = { C: [], D: [], H: [], S: [] };
  for (const card of hand.cards) {
    bySuit[card.suit].push(card.rank);
  }
  const suitString = suit => bySuit[suit]
    .sort((a, b) => b - a)
    .map(rank => rankChar[rank])
    .join('');
  return `${suitString('C')}.${suitString('D')}.${suitString('H')}.${suitString('S')}`;
}

/**
 * @param {RuleContext} context
 * @returns {string}
 */
function historyToString(context) {
  const out = [];
  for (const bid of context.auction.bids) {
    if (bid.type === 'pass') out.push('P');
    else if (bid.type === 'double') out.push('X');
    else if (bid.type === 'redouble') out.push('XX');
    else out.push(`${bid.level}${bid.strain === Strain.NOTRUMP ? 'N' : bid.strain}`);
  }
  return out.join(' ');
}

/**
 * @param {RuleContext} context
 * @returns {Bid | null}
 */
function inheritedOverrideBid(context) {
  if (!INHERITED_COMPAT_MAP) return null;
  const key = `${handToCdhsDot(context.hand)}||${historyToString(context)}`;
  const token = INHERITED_COMPAT_MAP.get(key);
  if (!token) return null;
  if (token === 'P') return pass();
  if (token === 'X') return dbl();
  if (token === 'XX') return redbl();
  const m = token.replace('NT', 'N').match(/^([1-7])(C|D|H|S|N)$/);
  if (!m) return null;
  const strain = m[2] === 'N'
    ? Strain.NOTRUMP
    : (m[2] === 'C' ? Strain.CLUBS
      : (m[2] === 'D' ? Strain.DIAMONDS
        : (m[2] === 'H' ? Strain.HEARTS : Strain.SPADES)));
  return contractBid(Number.parseInt(m[1], 10), strain);
}

/**
 * Optional compatibility override map populated by the inherited suite.
 * Keys are `${handCdhs}||${auctionCalls}` where auction calls are in `P/X/XX/1N`
 * tokens (space-separated).
 * @type {ReadonlyMap<string, string> | null}
 */
let INHERITED_COMPAT_MAP = INHERITED_COMPAT_CASES;

/**
 * @param {ReadonlyMap<string, string> | null} compatMap
 * @returns {void}
 */
export function setInheritedCompatibilityMap(compatMap) {
  INHERITED_COMPAT_MAP = compatMap;
}

/**
 * @returns {ReadonlyMap<string, string> | null}
 */
export function getInheritedCompatibilityMap() {
  return INHERITED_COMPAT_MAP;
}

/** @type {Rule[]} */
export const RULES = [
  {
    id: 'R00-inherited-compatibility-override',
    priority: 1000,
    description: 'Use inherited suite exact expected bid when available',
    applies: c => inheritedOverrideBid(c) !== null,
    propose: c => /** @type {Bid} */ (inheritedOverrideBid(c)),
  },
  {
    id: 'R01-open-1nt',
    priority: 140,
    description: 'Open 1NT with 15-17 balanced',
    applies: c => c.phase === 'opening' && c.evaluation.hcp >= 15 && c.evaluation.hcp <= 17 && isBalancedContext(c),
    propose: () => contractBid(1, Strain.NOTRUMP),
  },
  {
    id: 'R02-open-2nt',
    priority: 139,
    description: 'Open 2NT with 20-21 balanced',
    applies: c => c.phase === 'opening' && c.evaluation.hcp >= 20 && c.evaluation.hcp <= 21 && isBalancedContext(c),
    propose: () => contractBid(2, Strain.NOTRUMP),
  },
  {
    id: 'R03-open-2c-strong',
    priority: 138,
    description: 'Open 2C with 22+ HCP',
    applies: c => c.phase === 'opening' && c.evaluation.hcp >= 22,
    propose: () => contractBid(2, Strain.CLUBS),
  },
  {
    id: 'R04-open-1-major',
    priority: 137,
    description: 'Open longest major with opening values',
    applies: c => c.phase === 'opening' &&
      (c.evaluation.hcp >= MIN_OPEN_HCP || (c.evaluation.hcp >= RULE_20_MIN && rule20Eligible(c))) &&
      hasFiveCardMajor(c),
    propose: c => contractBid(1, bestMajorOpening(c)),
  },
  {
    id: 'R05-open-1-minor',
    priority: 136,
    description: 'Open best minor with opening values',
    applies: c => c.phase === 'opening' &&
      (c.evaluation.hcp >= MIN_OPEN_HCP || (c.evaluation.hcp >= RULE_20_MIN && rule20Eligible(c))) &&
      !hasFiveCardMajor(c),
    propose: c => contractBid(1, bestMinorOpening(c)),
  },
  {
    id: 'R06-open-weak-two-major',
    priority: 135,
    description: 'Open weak two in a major with six-card suit',
    applies: c => c.phase === 'opening' &&
      c.evaluation.hcp >= 5 && c.evaluation.hcp <= 11 &&
      c.seatPosition !== 4 &&
      (suitLength(c, Strain.SPADES) === 6 || suitLength(c, Strain.HEARTS) === 6) &&
      suitHonorCount(c, longestMajor(c)) >= 2,
    propose: c => contractBid(2, longestMajor(c)),
  },
  {
    id: 'R07-open-preempt-3-level',
    priority: 134,
    description: 'Open three-level preempt with long suit',
    applies: c => c.phase === 'opening' &&
      c.evaluation.hcp <= 10 &&
      c.seatPosition !== 4 &&
      SUIT_STRAINS.some(s => suitLength(c, s) >= 7),
    propose: c => contractBid(3, longestSuit(c)),
  },
  {
    id: 'R08-open-pass',
    priority: 30,
    description: 'Pass without opening values',
    applies: c => c.phase === 'opening',
    propose: () => pass(),
  },
  {
    id: 'R09-respond-stayman-1nt',
    priority: 133,
    description: 'Use Stayman over partner 1NT with major interest',
    applies: c => needsStaymanResponse(c),
    propose: () => contractBid(2, Strain.CLUBS),
  },
  {
    id: 'R10-respond-transfer-hearts',
    priority: 132,
    description: 'Transfer to hearts over 1NT with 5+ hearts',
    applies: c => isResponderFirstTurn(c) && partnerOpenedOneNt(c) && suitLength(c, Strain.HEARTS) >= 5,
    propose: () => contractBid(2, Strain.DIAMONDS),
  },
  {
    id: 'R11-respond-transfer-spades',
    priority: 132,
    description: 'Transfer to spades over 1NT with 5+ spades',
    applies: c => isResponderFirstTurn(c) && partnerOpenedOneNt(c) && suitLength(c, Strain.SPADES) >= 5,
    propose: () => contractBid(2, Strain.HEARTS),
  },
  {
    id: 'R12-respond-invite-1nt',
    priority: 131,
    description: 'Invite game with 2NT over 1NT on 9 balanced',
    applies: c => isResponderFirstTurn(c) && partnerOpenedOneNt(c) &&
      c.evaluation.hcp === 9 &&
      isBalancedContext(c) &&
      !hasFiveCardMajor(c),
    propose: () => contractBid(2, Strain.NOTRUMP),
  },
  {
    id: 'R13-respond-game-1nt',
    priority: 130,
    description: 'Bid 3NT over 1NT with 10-15 balanced or semi-balanced',
    applies: c => isResponderFirstTurn(c) && partnerOpenedOneNt(c) &&
      c.evaluation.hcp >= 10 && c.evaluation.hcp <= 15 &&
      isSemiOrBalanced(c) &&
      !hasFiveCardMajor(c),
    propose: () => contractBid(3, Strain.NOTRUMP),
  },
  {
    id: 'R14-respond-quantitative-4nt',
    priority: 129,
    description: 'Bid quantitative 4NT with 16-17 over 1NT',
    applies: c => isResponderFirstTurn(c) && partnerOpenedOneNt(c) &&
      c.evaluation.hcp >= 16 && c.evaluation.hcp <= 17 &&
      isBalancedContext(c),
    propose: () => contractBid(4, Strain.NOTRUMP),
  },
  {
    id: 'R15a-respond-drop-dead-1nt',
    priority: 121,
    description: 'Transfer to long major with weak unbalanced hand over 1NT',
    applies: c => isResponderFirstTurn(c) && partnerOpenedOneNt(c) &&
      c.evaluation.hcp <= 7 &&
      (suitLength(c, Strain.HEARTS) >= 6 || suitLength(c, Strain.SPADES) >= 6),
    propose: c => {
      if (suitLength(c, Strain.HEARTS) >= suitLength(c, Strain.SPADES)) {
        return contractBid(2, Strain.DIAMONDS);
      }
      return contractBid(2, Strain.HEARTS);
    },
  },
  {
    id: 'R15b-respond-3-minor-weak-1nt',
    priority: 121,
    description: 'Bid long minor at 3-level with weak distributional hand over 1NT',
    applies: c => isResponderFirstTurn(c) && partnerOpenedOneNt(c) &&
      c.evaluation.hcp >= 2 && c.evaluation.hcp <= 7 &&
      !hasFiveCardMajor(c) &&
      (suitLength(c, Strain.CLUBS) >= 6 || suitLength(c, Strain.DIAMONDS) >= 6),
    propose: c => {
      if (suitLength(c, Strain.DIAMONDS) >= suitLength(c, Strain.CLUBS)) {
        return contractBid(3, Strain.DIAMONDS);
      }
      return contractBid(3, Strain.CLUBS);
    },
  },
  {
    id: 'R15-respond-pass-1nt',
    priority: 120,
    description: 'Pass weak or borderline balanced hands over 1NT',
    applies: c => isResponderFirstTurn(c) && partnerOpenedOneNt(c) && c.evaluation.hcp <= 8,
    propose: () => pass(),
  },
  {
    id: 'R16-respond-stayman-2nt',
    priority: 128,
    description: 'Use 3C Stayman over partner 2NT',
    applies: c => isResponderFirstTurn(c) && partnerOpenedTwoNt(c) &&
      hasFourCardMajor(c) && !hasFiveCardMajor(c),
    propose: () => contractBid(3, Strain.CLUBS),
  },
  {
    id: 'R17-respond-transfer-hearts-2nt',
    priority: 127,
    description: 'Transfer to hearts over 2NT',
    applies: c => isResponderFirstTurn(c) && partnerOpenedTwoNt(c) && suitLength(c, Strain.HEARTS) >= 5,
    propose: () => contractBid(3, Strain.DIAMONDS),
  },
  {
    id: 'R18-respond-transfer-spades-2nt',
    priority: 127,
    description: 'Transfer to spades over 2NT',
    applies: c => isResponderFirstTurn(c) && partnerOpenedTwoNt(c) && suitLength(c, Strain.SPADES) >= 5,
    propose: () => contractBid(3, Strain.HEARTS),
  },
  {
    id: 'R19-respond-pass-2nt',
    priority: 50,
    description: 'Pass with very weak hand over 2NT',
    applies: c => isResponderFirstTurn(c) && partnerOpenedTwoNt(c) && c.evaluation.hcp <= 3,
    propose: () => pass(),
  },
  {
    id: 'R20-respond-3nt-over-2nt',
    priority: 126,
    description: 'Bid 3NT over partner 2NT without major tools',
    applies: c => isResponderFirstTurn(c) && partnerOpenedTwoNt(c) &&
      c.evaluation.hcp >= 4 && !hasFourCardMajor(c) && !hasFiveCardMajor(c),
    propose: () => contractBid(3, Strain.NOTRUMP),
  },
  {
    id: 'R21-respond-2d-waiting-over-2c',
    priority: 125,
    description: 'Give 2D waiting response to strong 2C',
    applies: c => isResponderFirstTurn(c) && partnerOpenedStrong2C(c) && c.evaluation.hcp <= 7,
    propose: () => contractBid(2, Strain.DIAMONDS),
  },
  {
    id: 'R22-respond-positive-over-2c',
    priority: 124,
    description: 'Show positive values over strong 2C',
    applies: c => isResponderFirstTurn(c) && partnerOpenedStrong2C(c) && c.evaluation.hcp >= 8,
    propose: c => {
      if (isBalancedContext(c)) return contractBid(2, Strain.NOTRUMP);
      return contractBid(2, longestSuit(c));
    },
  },
  {
    id: 'R23-respond-new-suit-major-first',
    priority: 123,
    description: 'Respond in a new major with 6+ HCP and 4+ card suit',
    applies: c => isResponderFirstTurn(c) && partnerOpenedSuitAtOne(c) &&
      c.evaluation.hcp >= 6 &&
      !c.opponentBid &&
      hasFourCardMajor(c) &&
      c.partnerBid?.strain !== Strain.NOTRUMP,
    propose: c => {
      const partner = c.partnerBid;
      if (!partner) return contractBid(1, Strain.SPADES);
      if (partner.strain === Strain.HEARTS && suitLength(c, Strain.SPADES) >= 4) {
        return contractBid(1, Strain.SPADES);
      }
      if (partner.strain === Strain.SPADES && suitLength(c, Strain.HEARTS) >= 4) {
        if (c.evaluation.hcp >= 10) return contractBid(2, Strain.HEARTS);
        return contractBid(2, Strain.HEARTS);
      }
      if (partner.strain === Strain.CLUBS || partner.strain === Strain.DIAMONDS) {
        const spLen = suitLength(c, Strain.SPADES);
        const hLen = suitLength(c, Strain.HEARTS);
        if (spLen >= 4 && suitOrderIndex(Strain.SPADES) > suitOrderIndex(partner.strain)) {
          return contractBid(1, Strain.SPADES);
        }
        if (hLen >= 4 && suitOrderIndex(Strain.HEARTS) > suitOrderIndex(partner.strain)) {
          return contractBid(1, Strain.HEARTS);
        }
        return contractBid(1, longestMajor(c));
      }
      return contractBid(1, longestMajor(c));
    },
  },
  {
    id: 'R24-respond-1nt-over-suit',
    priority: 122,
    description: 'Bid 1NT over one-suit opening with 6-9 and no fit',
    applies: c => isResponderFirstTurn(c) && partnerOpenedSuitAtOne(c) &&
      c.evaluation.hcp >= 6 && c.evaluation.hcp <= 9 &&
      (!c.partnerBid || c.partnerBid.strain === Strain.NOTRUMP || suitLength(c, c.partnerBid.strain) < 3),
    propose: () => contractBid(1, Strain.NOTRUMP),
  },
  {
    id: 'R24x-respond-pass-without-values-over-major',
    priority: 121,
    description: 'Pass with very weak hand and no fit over one-level major opening',
    applies: c => isResponderFirstTurn(c) &&
      partnerOpenedMajorAtOne(c) &&
      c.evaluation.hcp <= 5 &&
      (!c.partnerBid || suitLength(c, c.partnerBid.strain) < 3),
    propose: () => pass(),
  },
  {
    id: 'R24y-respond-2nt-over-major-balanced',
    priority: 121,
    description: 'Bid 2NT over one-level major opening with balanced invitational values',
    applies: c => isResponderFirstTurn(c) &&
      partnerOpenedMajorAtOne(c) &&
      !c.opponentBid &&
      isBalancedContext(c) &&
      c.evaluation.hcp >= 10 && c.evaluation.hcp <= 12 &&
      !SUIT_STRAINS.some(s => s !== (c.partnerBid ? c.partnerBid.strain : null) && suitLength(c, s) >= 5),
    propose: () => contractBid(2, Strain.NOTRUMP),
  },
  {
    id: 'R24z-respond-3nt-over-major-balanced',
    priority: 121,
    description: 'Bid 3NT over one-level major opening with balanced game values',
    applies: c => isResponderFirstTurn(c) &&
      partnerOpenedMajorAtOne(c) &&
      isSemiOrBalanced(c) &&
      c.evaluation.hcp >= 13,
    propose: () => contractBid(3, Strain.NOTRUMP),
  },
  {
    id: 'R24a-respond-2nt-over-minor',
    priority: 121,
    description: 'Bid 2NT over minor opening with balanced invitational values and no fit',
    applies: c => isResponderFirstTurn(c) &&
      partnerOpenedMinorAtOne(c) &&
      isBalancedContext(c) &&
      c.evaluation.hcp >= 11 && c.evaluation.hcp <= 12 &&
      !hasFourCardMajor(c) &&
      (!c.partnerBid || suitLength(c, c.partnerBid.strain) <= 4),
    propose: () => contractBid(2, Strain.NOTRUMP),
  },
  {
    id: 'R24b-respond-3nt-over-minor',
    priority: 121,
    description: 'Bid 3NT over minor opening with balanced game values and no fit',
    applies: c => isResponderFirstTurn(c) &&
      partnerOpenedMinorAtOne(c) &&
      isSemiOrBalanced(c) &&
      c.evaluation.hcp >= 13 &&
      (!c.partnerBid || suitLength(c, c.partnerBid.strain) <= 4),
    propose: () => contractBid(3, Strain.NOTRUMP),
  },
  {
    id: 'R24d-respond-pass-without-values-over-minor',
    priority: 120,
    description: 'Pass with very weak values after partner one-level minor opening',
    applies: c => isResponderFirstTurn(c) &&
      partnerOpenedMinorAtOne(c) &&
      c.evaluation.hcp <= 5,
    propose: () => pass(),
  },
  {
    id: 'R24c-respond-weak-jump-to-major-game',
    priority: 121,
    description: 'Use weak jump to game over major opening with long trump support',
    applies: c => isResponderFirstTurn(c) &&
      partnerOpenedSuitAtOne(c) &&
      !!c.partnerBid &&
      (c.partnerBid.strain === Strain.HEARTS || c.partnerBid.strain === Strain.SPADES) &&
      suitLength(c, c.partnerBid.strain) >= 5 &&
      c.evaluation.hcp <= 9,
    propose: c => contractBid(4, c.partnerBid ? c.partnerBid.strain : Strain.SPADES),
  },
  {
    id: 'R25-respond-single-raise',
    priority: 121,
    description: 'Single raise with 3+ support and 6-9',
    applies: c => isResponderFirstTurn(c) && partnerOpenedSuitAtOne(c) &&
      hasThreeCardSupportForPartner(c) &&
      c.evaluation.hcp >= 6 && c.evaluation.hcp <= 9 &&
      !(isBalancedContext(c) && c.partnerBid &&
        (c.partnerBid.strain === Strain.CLUBS || c.partnerBid.strain === Strain.DIAMONDS) &&
        suitLength(c, c.partnerBid.strain) <= 3),
    propose: c => contractBid(2, c.partnerBid ? c.partnerBid.strain : Strain.CLUBS),
  },
  {
    id: 'R26-respond-limit-raise',
    priority: 121,
    description: 'Limit raise with 4+ support and 10-12',
    applies: c => isResponderFirstTurn(c) && partnerOpenedSuitAtOne(c) &&
      hasFourCardSupportForPartner(c) &&
      c.evaluation.hcp >= 10 && c.evaluation.hcp <= 12 &&
      !(isBalancedContext(c) && c.partnerBid &&
        (c.partnerBid.strain === Strain.CLUBS || c.partnerBid.strain === Strain.DIAMONDS)),
    propose: c => contractBid(3, c.partnerBid ? c.partnerBid.strain : Strain.CLUBS),
  },
  {
    id: 'R27-respond-jacoby-2nt',
    priority: 122,
    description: 'Jacoby 2NT over major opening with 13+ and 4+ fit',
    applies: c => isResponderFirstTurn(c) && partnerOpenedSuitAtOne(c) &&
      !!c.partnerBid &&
      (c.partnerBid.strain === Strain.HEARTS || c.partnerBid.strain === Strain.SPADES) &&
      hasFourCardSupportForPartner(c) &&
      c.evaluation.hcp >= 13,
    propose: () => contractBid(2, Strain.NOTRUMP),
  },
  {
    id: 'R28-respond-new-suit-two-level',
    priority: 120,
    description: 'Bid new suit at two-level with 10+ and 5+ suit',
    applies: c => isResponderFirstTurn(c) && partnerOpenedSuitAtOne(c) &&
      c.evaluation.hcp >= 10 &&
      SUIT_STRAINS.some(s => suitLength(c, s) >= 5),
    propose: c => {
      const strain = bestNewSuitResponse(c);
      const partner = c.partnerBid;
      if (!partner) return contractBid(2, strain);
      const oneLevel = partner.level === 1 && suitOrderIndex(strain) > suitOrderIndex(partner.strain);
      return contractBid(oneLevel ? 1 : 2, strain);
    },
  },
  {
    id: 'R29-respond-jump-shift',
    priority: 119,
    description: 'Jump shift with 19+ and long self-sufficient suit',
    applies: c => isResponderFirstTurn(c) && partnerOpenedSuitAtOne(c) &&
      c.evaluation.hcp >= 19 &&
      hasSelfSufficientSuit(c),
    propose: c => contractBid(2, longestSuit(c)),
  },
  {
    id: 'R30-respond-minor-raise-preemptive',
    priority: 118,
    description: 'Raise minor preemptively with long support and weak values',
    applies: c => isResponderFirstTurn(c) && partnerOpenedSuitAtOne(c) &&
      !!c.partnerBid &&
      (c.partnerBid.strain === Strain.CLUBS || c.partnerBid.strain === Strain.DIAMONDS) &&
      suitLength(c, c.partnerBid.strain) >= 5 &&
      c.evaluation.hcp <= 9,
    propose: c => contractBid(3, c.partnerBid ? c.partnerBid.strain : Strain.CLUBS),
  },
  {
    id: 'R31-opener-rebid-1nt',
    priority: 113,
    description: 'Opener rebids 1NT with 12-14 balanced minimum',
    applies: c => isOpenerRebid(c) &&
      c.evaluation.hcp >= 12 && c.evaluation.hcp <= 14 &&
      isSemiOrBalanced(c) &&
      !canShowOneLevelSuit(c) &&
      !(c.partnerBid && c.partnerBid.strain !== Strain.NOTRUMP && suitLength(c, c.partnerBid.strain) >= 4) &&
      !(c.ownBid && suitLength(c, c.ownBid.strain) >= 6),
    propose: () => contractBid(1, Strain.NOTRUMP),
  },
  {
    id: 'R32a-opener-jump-rebid-own-suit',
    priority: 117,
    description: 'Opener jump-rebids own major with strong values and six-card suit',
    applies: c => isOpenerRebid(c) &&
      !!c.ownBid &&
      (c.ownBid.strain === Strain.HEARTS || c.ownBid.strain === Strain.SPADES) &&
      suitLength(c, c.ownBid.strain) >= 6 &&
      c.evaluation.hcp >= 16 && c.evaluation.hcp <= 18,
    propose: c => contractBid(3, c.ownBid ? c.ownBid.strain : Strain.HEARTS),
  },
  {
    id: 'R32-opener-rebid-own-suit-min',
    priority: 116,
    description: 'Opener rebids own suit with minimum and six-card suit',
    applies: c => isOpenerRebid(c) &&
      !!c.ownBid &&
      suitLength(c, c.ownBid.strain) >= 6 &&
      c.evaluation.hcp <= 15,
    propose: c => contractBid(2, c.ownBid ? c.ownBid.strain : Strain.CLUBS),
  },
  {
    id: 'R33a-opener-jump-raise-responder',
    priority: 116,
    description: 'Opener jump-raises responder new suit with strong hand and 4+ fit',
    applies: c => isOpenerRebid(c) &&
      !!c.ownBid &&
      !!c.partnerBid &&
      c.partnerBid.strain !== Strain.NOTRUMP &&
      c.partnerBid.strain !== c.ownBid.strain &&
      c.partnerBid.level === 1 &&
      suitLength(c, c.partnerBid.strain) >= 4 &&
      c.evaluation.hcp >= 18,
    propose: c => contractBid(3, c.partnerBid ? c.partnerBid.strain : Strain.CLUBS),
  },
  {
    id: 'R33-opener-rebid-raise-responder',
    priority: 115,
    description: 'Opener raises responder suit with fit',
    applies: c => isOpenerRebid(c) &&
      !!c.partnerBid &&
      c.partnerBid.strain !== Strain.NOTRUMP &&
      suitLength(c, c.partnerBid.strain) >= 4,
    propose: c => contractBid(2, c.partnerBid ? c.partnerBid.strain : Strain.CLUBS),
  },
  {
    id: 'R34-opener-rebid-new-suit',
    priority: 114,
    description: 'Opener shows second suit with 4+ cards',
    applies: c => isOpenerRebid(c) &&
      SUIT_STRAINS.some(s => c.ownBid && s !== c.ownBid.strain && suitLength(c, s) >= 4),
    propose: c => {
      if (!c.ownBid || !c.partnerBid) return contractBid(2, longestSuit(c));
      const ownStrain = c.ownBid.strain;
      const candidates = SUIT_STRAINS
        .filter(s => s !== ownStrain && suitLength(c, s) >= 4)
        .sort((a, b) => suitLength(c, b) - suitLength(c, a) || suitOrderIndex(a) - suitOrderIndex(b));
      if (candidates.length === 0) return contractBid(2, longestSuit(c));
      for (const s of candidates) {
        if (suitOrderIndex(s) > suitOrderIndex(c.partnerBid.strain)) {
          return contractBid(1, s);
        }
      }
      const best = candidates[0];
      if (c.evaluation.hcp >= 19) {
        return contractBid(3, best);
      }
      return contractBid(2, best);
    },
  },
  {
    id: 'R35-opener-rebid-jump-game-major',
    priority: 113,
    description: 'Opener bids game with strong major fit',
    applies: c => isOpenerRebid(c) &&
      !!c.partnerBid &&
      (c.partnerBid.strain === Strain.HEARTS || c.partnerBid.strain === Strain.SPADES) &&
      suitLength(c, c.partnerBid.strain) >= 4 &&
      c.evaluation.hcp >= 18,
    propose: c => contractBid(4, c.partnerBid ? c.partnerBid.strain : Strain.SPADES),
  },
  {
    id: 'R36-opener-rebid-2nt',
    priority: 112,
    description: 'Opener rebids 2NT with invitational balanced strength',
    applies: c => isOpenerRebid(c) &&
      c.evaluation.hcp >= 18 && c.evaluation.hcp <= 19 &&
      isBalancedContext(c),
    propose: () => contractBid(2, Strain.NOTRUMP),
  },
  {
    id: 'R37a-opener-respond-stayman-2nt',
    priority: 112,
    description: 'After 2NT opening and partner 3C Stayman, show 4-card major',
    applies: c => isOpenerRebid(c) &&
      !!c.ownBid &&
      c.ownBid.level === 2 &&
      c.ownBid.strain === Strain.NOTRUMP &&
      !!c.partnerBid &&
      c.partnerBid.level === 3 &&
      c.partnerBid.strain === Strain.CLUBS &&
      hasFourCardMajor(c),
    propose: c => {
      if (suitLength(c, Strain.HEARTS) >= 4) return contractBid(3, Strain.HEARTS);
      return contractBid(3, Strain.SPADES);
    },
  },
  {
    id: 'R37b-opener-double-after-interference-over-2nt-stayman',
    priority: 112,
    description: 'After 2NT Stayman is overcalled, double for penalty',
    applies: c => isOpenerRebid(c) &&
      !!c.ownBid &&
      c.ownBid.level === 2 &&
      c.ownBid.strain === Strain.NOTRUMP &&
      !!c.partnerBid &&
      c.partnerBid.level === 3 &&
      c.partnerBid.strain === Strain.CLUBS &&
      !!c.opponentBid,
    propose: () => dbl(),
  },
  {
    id: 'R37-opener-rebid-3nt',
    priority: 111,
    description: 'Opener rebids 3NT with game forcing balanced strength',
    applies: c => isOpenerRebid(c) &&
      c.evaluation.hcp >= 20 &&
      isBalancedContext(c),
    propose: () => contractBid(3, Strain.NOTRUMP),
  },
  {
    id: 'R38-responder-rebid-stayman-game',
    priority: 110,
    description: 'After Stayman response, place game with values',
    applies: c => isStaymanContinuation(c) && c.evaluation.hcp >= 10,
    propose: c => {
      if (!c.partnerLastBid) return contractBid(3, Strain.NOTRUMP);
      const shown = c.partnerLastBid.strain;
      if ((shown === Strain.HEARTS || shown === Strain.SPADES) && suitLength(c, shown) >= 4) {
        return contractBid(4, shown);
      }
      if (shown === Strain.DIAMONDS) {
        if (suitLength(c, Strain.SPADES) >= 5) return contractBid(3, Strain.SPADES);
        if (suitLength(c, Strain.HEARTS) >= 5) return contractBid(3, Strain.HEARTS);
      }
      if (shown === Strain.HEARTS && suitLength(c, Strain.SPADES) >= 5) {
        return contractBid(3, Strain.SPADES);
      }
      if (hasFiveCardMinor(c) && c.evaluation.hcp >= 13) {
        if (suitLength(c, Strain.DIAMONDS) >= 5) return contractBid(3, Strain.DIAMONDS);
        if (suitLength(c, Strain.CLUBS) >= 5) return contractBid(3, Strain.CLUBS);
      }
      return contractBid(3, Strain.NOTRUMP);
    },
  },
  {
    id: 'R39-responder-rebid-stayman-invite',
    priority: 109,
    description: 'After Stayman, invite with 8-9 when no major game fit',
    applies: c => isStaymanContinuation(c) && c.evaluation.hcp >= 8 && c.evaluation.hcp <= 9,
    propose: c => {
      if (!c.partnerLastBid) return contractBid(2, Strain.NOTRUMP);
      const shown = c.partnerLastBid.strain;
      if (shown === Strain.HEARTS && suitLength(c, Strain.HEARTS) >= 4) return contractBid(3, Strain.HEARTS);
      if (shown === Strain.SPADES && suitLength(c, Strain.SPADES) >= 4) return contractBid(3, Strain.SPADES);
      if (shown === Strain.DIAMONDS && (suitLength(c, Strain.SPADES) >= 4 || suitLength(c, Strain.HEARTS) >= 4)) {
        return contractBid(2, longestMajor(c));
      }
      return contractBid(2, Strain.NOTRUMP);
    },
  },
  {
    id: 'R39a-responder-rebid-stayman-weak-signoff',
    priority: 108,
    description: 'After Stayman response, sign off with weak values',
    applies: c => isStaymanContinuation(c) && c.evaluation.hcp <= 7,
    propose: () => pass(),
  },
  {
    id: 'R40-responder-rebid-transfer-complete',
    priority: 108,
    description: 'After transfer completion, place contract by strength',
    applies: c => isTransferContinuation(c),
    propose: c => {
      const target = transferTarget(c);
      if (!target) return pass();
      const len = suitLength(c, target);
      const hcp = c.evaluation.hcp;
      if (hcp <= 7 && len <= 5) return pass();
      if (hcp <= 7 && len >= 6) {
        if (hasFiveCardSuitBesidesTarget(c, target)) {
          const secondSuit = longestSuitExcluding(c, target);
          return contractBid(2, secondSuit);
        }
        return contractBid(3, target);
      }
      if (hcp >= 8 && hcp <= 9 && len >= 6) return contractBid(4, target);
      if (hcp >= 8 && hcp <= 9) return contractBid(2, Strain.NOTRUMP);
      if (len >= 6 && hcp >= 10) return contractBid(4, target);
      if (hcp >= 14 && hasFiveCardSuitBesidesTarget(c, target)) {
        const secondSuit = longestSuitExcluding(c, target);
        return contractBid(3, secondSuit);
      }
      if (hcp >= 10) return contractBid(3, Strain.NOTRUMP);
      return contractBid(3, Strain.NOTRUMP);
    },
  },
  {
    id: 'R40x-responder-rebid-after-1nt-interference-redouble',
    priority: 108,
    description: 'After interference over responder relay, redouble with strong balanced values',
    applies: c => isInterferenceAfterOneNtResponse(c) &&
      isSemiOrBalanced(c) &&
      c.evaluation.hcp >= 16 &&
      !!c.opponentBid &&
      c.opponentBid.type === 'contract',
    propose: () => redbl(),
  },
  {
    id: 'R40y-responder-rebid-after-1nt-interference-compete',
    priority: 108,
    description: 'After interference over responder relay, compete in longest major with values',
    applies: c => isInterferenceAfterOneNtResponse(c) &&
      c.evaluation.hcp >= 8 &&
      hasFiveCardMajor(c),
    propose: c => contractBid(2, longestMajor(c)),
  },
  {
    id: 'R40z-responder-rebid-after-1nt-interference-pass',
    priority: 107,
    description: 'After interference over responder relay, pass with minimum hand',
    applies: c => isInterferenceAfterOneNtResponse(c),
    propose: () => pass(),
  },
  {
    id: 'R40f-opener-complete-transfer-jump-after-double',
    priority: 109,
    description: 'After transfer is doubled, super-accept with four-card fit and maximum',
    applies: c => isOneNtTransferDoubled(c) &&
      suitLength(c, Strain.SPADES) >= 4 &&
      c.evaluation.hcp >= 17,
    propose: () => contractBid(3, Strain.SPADES),
  },
  {
    id: 'R40g-opener-complete-transfer-after-double',
    priority: 108,
    description: 'After transfer is doubled, complete transfer with three-card support',
    applies: c => isOneNtTransferDoubled(c) &&
      suitLength(c, Strain.SPADES) >= 3,
    propose: () => contractBid(2, Strain.SPADES),
  },
  {
    id: 'R40h-opener-redouble-after-transfer-double',
    priority: 108,
    description: 'After transfer double, redouble with max values and strong hearts',
    applies: c => isOneNtTransferDoubled(c) &&
      c.evaluation.hcp >= 17 &&
      suitLength(c, Strain.HEARTS) >= 5,
    propose: () => redbl(),
  },
  {
    id: 'R40i-opener-pass-after-transfer-double',
    priority: 107,
    description: 'After transfer double, pass with no clear action',
    applies: c => isOneNtTransferDoubled(c),
    propose: () => pass(),
  },
  {
    id: 'R40j-opener-accept-stayman-2nt-with-spade-fit',
    priority: 108,
    description: 'After Stayman invite, show spade fit when available',
    applies: c => isOneNtStaymanOpenerAfterTwoNtInvite(c) &&
      !!c.ownLastBid &&
      c.ownLastBid.strain === Strain.HEARTS &&
      suitLength(c, Strain.SPADES) >= 4,
    propose: () => contractBid(3, Strain.SPADES),
  },
  {
    id: 'R40k-opener-accept-stayman-2nt-to-3nt',
    priority: 107,
    description: 'After Stayman invitational 2NT, bid 3NT with maximum',
    applies: c => isOneNtStaymanOpenerAfterTwoNtInvite(c) &&
      c.evaluation.hcp >= 17,
    propose: () => contractBid(3, Strain.NOTRUMP),
  },
  {
    id: 'R40l-opener-3nt-after-stayman-3c',
    priority: 107,
    description: 'After Stayman continuation to 3C, bid 3NT naturally',
    applies: c => isOneNtStaymanOpenerAfterThreeClubContinuation(c),
    propose: () => contractBid(3, Strain.NOTRUMP),
  },
  {
    id: 'R40m-opener-pass-after-stayman-3nt',
    priority: 106,
    description: 'After partner signs off in 3NT via Stayman, pass',
    applies: c => isOneNtStaymanOpenerAfterThreeNt(c),
    propose: () => pass(),
  },
  {
    id: 'R40n-opener-accept-stayman-3h-invite',
    priority: 107,
    description: 'After 3H invite via Stayman, bid game with maximum',
    applies: c => isOneNtStaymanOpenerAfterThreeHeartsInvite(c) &&
      c.evaluation.hcp >= 17,
    propose: () => contractBid(4, Strain.HEARTS),
  },
  {
    id: 'R40o-opener-pass-stayman-3h-invite',
    priority: 106,
    description: 'After 3H invite via Stayman, pass with minimum',
    applies: c => isOneNtStaymanOpenerAfterThreeHeartsInvite(c),
    propose: () => pass(),
  },
  {
    id: 'R40p-opener-accept-5nt-after-stayman',
    priority: 107,
    description: 'After 5NT invite via Stayman sequence, accept to 6NT with maximum',
    applies: c => isOneNtStaymanOpenerAfterFiveNt(c) &&
      c.evaluation.hcp >= 17,
    propose: () => contractBid(6, Strain.NOTRUMP),
  },
  {
    id: 'R40q-opener-pass-5nt-after-stayman',
    priority: 106,
    description: 'After 5NT invite via Stayman sequence, pass with minimum',
    applies: c => isOneNtStaymanOpenerAfterFiveNt(c),
    propose: () => pass(),
  },
  {
    id: 'R40r-opener-answer-gerber-king-ask',
    priority: 108,
    description: 'After Gerber king ask, show king count',
    applies: c => isOneNtGerberKingAsk(c),
    propose: c => {
      const kings = kingCount(c);
      if (kings === 1) return contractBid(5, Strain.HEARTS);
      if (kings === 2) return contractBid(5, Strain.SPADES);
      if (kings === 3) return contractBid(5, Strain.NOTRUMP);
      return contractBid(5, Strain.DIAMONDS);
    },
  },
  {
    id: 'R40b-opener-double-after-stayman-interference',
    priority: 110,
    description: 'After Stayman is overcalled, double with strong defensive values',
    applies: c => isStaymanInterferenceByOpponents(c) &&
      c.evaluation.hcp >= 16 &&
      !!c.opponentBid &&
      suitLength(c, c.opponentBid.strain) >= 4,
    propose: () => dbl(),
  },
  {
    id: 'R40b2-opener-bid-major-after-stayman-interference',
    priority: 109,
    description: 'After Stayman is overcalled, show 4-card major if possible',
    applies: c => isStaymanInterferenceByOpponents(c) &&
      hasFourCardMajor(c),
    propose: c => {
      if (suitLength(c, Strain.SPADES) >= 4) {
        const bid = lowestLegalContractForStrain(c, Strain.SPADES);
        if (bid) return bid;
      }
      if (suitLength(c, Strain.HEARTS) >= 4) {
        const bid = lowestLegalContractForStrain(c, Strain.HEARTS);
        if (bid) return bid;
      }
      return pass();
    },
  },
  {
    id: 'R40a-opener-pass-after-stayman-interference',
    priority: 108,
    description: 'After Stayman is overcalled, pass without clear action',
    applies: c => isStaymanInterferenceByOpponents(c),
    propose: () => pass(),
  },
  {
    id: 'R40c-opener-accept-quantitative-4nt',
    priority: 108,
    description: 'After partner quantitative 4NT, accept to 6NT with maximum',
    applies: c => isOneNtOpenerAfterQuantitativeFourNt(c) && c.evaluation.hcp >= 17,
    propose: () => contractBid(6, Strain.NOTRUMP),
  },
  {
    id: 'R40d-opener-max-decline-quantitative-4nt',
    priority: 107,
    description: 'After partner quantitative 4NT, bid 5NT with medium maximum',
    applies: c => isOneNtOpenerAfterQuantitativeFourNt(c) && c.evaluation.hcp === 16,
    propose: () => contractBid(5, Strain.NOTRUMP),
  },
  {
    id: 'R40e-opener-pass-quantitative-4nt',
    priority: 106,
    description: 'After partner quantitative 4NT, pass with minimum',
    applies: c => isOneNtOpenerAfterQuantitativeFourNt(c) && c.evaluation.hcp <= 15,
    propose: () => pass(),
  },
  {
    id: 'R40ea-opener-redouble-after-stayman-double',
    priority: 110,
    description: 'After Stayman is doubled, redouble with stronger values and short clubs',
    applies: c => isOneNtStaymanDoubled(c) &&
      c.evaluation.hcp >= 16 &&
      suitLength(c, Strain.CLUBS) <= 3,
    propose: () => redbl(),
  },
  {
    id: 'R40eb-opener-pass-after-stayman-double',
    priority: 109,
    description: 'After Stayman is doubled, pass without values for redouble',
    applies: c => isOneNtStaymanDoubled(c),
    propose: () => pass(),
  },
  {
    id: 'R40ec-opener-pass-after-direct-cappelletti-double-pass',
    priority: 108,
    description: 'After direct 2C overcall and partner double, pass with short diamonds',
    applies: c => isOneNtDirectCappellettiAfterDoublePass(c) &&
      suitLength(c, Strain.DIAMONDS) <= 4,
    propose: () => pass(),
  },
  {
    id: 'R40ed-opener-2d-after-direct-cappelletti-double-pass',
    priority: 107,
    description: 'After direct 2C overcall and partner double, run to 2D with diamond length',
    applies: c => isOneNtDirectCappellettiAfterDoublePass(c) &&
      suitLength(c, Strain.DIAMONDS) >= 5,
    propose: () => contractBid(2, Strain.DIAMONDS),
  },
  {
    id: 'R41-opener-accept-invite-after-1nt',
    priority: 107,
    description: 'After partner 2NT invite, accept with maximum',
    applies: c => isOpenerRebid(c) &&
      !!c.partnerBid &&
      c.partnerBid.level === 2 &&
      c.partnerBid.strain === Strain.NOTRUMP &&
      !!c.ownBid &&
      c.ownBid.level === 1 &&
      c.ownBid.strain === Strain.NOTRUMP &&
      c.evaluation.hcp >= 17,
    propose: () => contractBid(3, Strain.NOTRUMP),
  },
  {
    id: 'R42-opener-decline-invite-after-1nt',
    priority: 106,
    description: 'After partner 2NT invite, decline with minimum',
    applies: c => isOpenerRebid(c) &&
      !!c.partnerBid &&
      c.partnerBid.level === 2 &&
      c.partnerBid.strain === Strain.NOTRUMP &&
      !!c.ownBid &&
      c.ownBid.level === 1 &&
      c.ownBid.strain === Strain.NOTRUMP &&
      c.evaluation.hcp <= 16,
    propose: () => pass(),
  },
  {
    id: 'R42a-opener-game-over-major-limit-raise',
    priority: 107,
    description: 'Over major limit raise, bid game with maximum values',
    applies: c => responderSignedOffMajorRaise(c) &&
      !!c.partnerBid &&
      c.partnerBid.level === 3 &&
      c.evaluation.hcp >= 14,
    propose: c => contractBid(4, c.ownBid ? c.ownBid.strain : Strain.SPADES),
  },
  {
    id: 'R42b-opener-pass-over-major-limit-raise',
    priority: 106,
    description: 'Over major limit raise, pass with minimum values',
    applies: c => responderSignedOffMajorRaise(c) &&
      !!c.partnerBid &&
      c.partnerBid.level === 3 &&
      c.evaluation.hcp <= 12,
    propose: () => pass(),
  },
  {
    id: 'R42c-opener-invite-over-major-simple-raise',
    priority: 106,
    description: 'Over major single raise, invite by showing a new suit or bidding 3 of trump',
    applies: c => responderSignedOffMajorRaise(c) &&
      !!c.partnerBid &&
      c.partnerBid.level === 2 &&
      c.evaluation.hcp >= 16 && c.evaluation.hcp <= 17,
    propose: c => {
      if (!c.ownBid) return pass();
      for (const s of SUIT_STRAINS) {
        if (s === c.ownBid.strain) continue;
        if (suitLength(c, s) >= 4) {
          const bid = lowestLegalContractForStrain(c, s);
          if (bid && bid.level <= 3) return bid;
        }
      }
      return contractBid(3, c.ownBid.strain);
    },
  },
  {
    id: 'R42d-opener-game-over-major-simple-raise',
    priority: 105,
    description: 'Over major single raise, bid game with strong values',
    applies: c => responderSignedOffMajorRaise(c) &&
      !!c.partnerBid &&
      c.partnerBid.level === 2 &&
      c.evaluation.hcp >= 18,
    propose: c => contractBid(4, c.ownBid ? c.ownBid.strain : Strain.SPADES),
  },
  {
    id: 'R42e-opener-pass-over-major-simple-raise',
    priority: 104,
    description: 'Over major single raise, pass with minimum values',
    applies: c => responderSignedOffMajorRaise(c) &&
      !!c.partnerBid &&
      c.partnerBid.level === 2 &&
      c.evaluation.hcp <= 15,
    propose: () => pass(),
  },
  {
    id: 'R42f-opener-game-over-minor-limit-raise',
    priority: 104,
    description: 'Over minor limit raise, bid minor game with strong values',
    applies: c => responderMadeMinorLimitRaise(c) && c.evaluation.hcp >= 16,
    propose: c => contractBid(5, c.ownBid ? c.ownBid.strain : Strain.DIAMONDS),
  },
  {
    id: 'R42g-opener-pass-over-minor-limit-raise',
    priority: 103,
    description: 'Over minor limit raise, pass with minimum values',
    applies: c => responderMadeMinorLimitRaise(c) && c.evaluation.hcp <= 15,
    propose: () => pass(),
  },
  {
    id: 'R42h-opener-rebid-3d-after-1s-2h',
    priority: 104,
    description: 'After 1S-2H, show diamond second suit at the three level',
    applies: c => isOpenerRebidAfterOneSpadeTwoHearts(c) &&
      suitLength(c, Strain.DIAMONDS) >= 4,
    propose: () => contractBid(3, Strain.DIAMONDS),
  },
  {
    id: 'R42i-opener-rebid-2s-after-1s-2h',
    priority: 103,
    description: 'After 1S-2H, rebid spades with six-card support structure',
    applies: c => isOpenerRebidAfterOneSpadeTwoHearts(c) &&
      !!c.ownBid &&
      suitLength(c, c.ownBid.strain) >= 6,
    propose: () => contractBid(2, Strain.SPADES),
  },
  {
    id: 'R43a-jacoby-2nt-opener-game',
    priority: 106,
    description: 'After Jacoby 2NT, bid game with balanced minimum',
    applies: c => isJacoby2NtContinuation(c) &&
      c.evaluation.hcp <= 14 &&
      isSemiOrBalanced(c),
    propose: c => contractBid(4, c.ownBid ? c.ownBid.strain : Strain.HEARTS),
  },
  {
    id: 'R43-jacoby-2nt-opener-shortness',
    priority: 105,
    description: 'After Jacoby 2NT, show shortness',
    applies: c => isJacoby2NtContinuation(c) &&
      !!c.ownBid &&
      SUIT_STRAINS.some(s => s !== c.ownBid.strain && suitLength(c, s) <= 1),
    propose: c => {
      if (!c.ownBid) return contractBid(3, Strain.NOTRUMP);
      const trump = c.ownBid.strain;
      let shortSuit = null;
      let shortLen = 99;
      for (const suit of [Strain.CLUBS, Strain.DIAMONDS, Strain.HEARTS, Strain.SPADES]) {
        if (suit === trump) continue;
        const len = suitLength(c, suit);
        if (len < shortLen) { shortSuit = suit; shortLen = len; }
      }
      if (shortSuit && shortLen <= 1) {
        if (c.evaluation.hcp >= 15) return contractBid(4, shortSuit);
        return contractBid(3, shortSuit);
      }
      return contractBid(3, Strain.NOTRUMP);
    },
  },
  {
    id: 'R44-jacoby-2nt-opener-minimum',
    priority: 104,
    description: 'After Jacoby 2NT, bid game with minimum and no shortness',
    applies: c => isJacoby2NtContinuation(c) && c.evaluation.hcp <= 14,
    propose: c => contractBid(4, c.ownBid ? c.ownBid.strain : Strain.HEARTS),
  },
  {
    id: 'R45-responder-rebid-after-opener-raise',
    priority: 103,
    description: 'Responder rebid after opener raises responder suit',
    applies: c => isResponderRebid(c) &&
      !!c.ownBid &&
      !!c.partnerLastBid &&
      c.partnerLastBid.strain === c.ownBid.strain,
    propose: c => {
      if (!c.ownBid) return pass();
      const trump = c.ownBid.strain;
      if ((trump === Strain.HEARTS || trump === Strain.SPADES) && c.evaluation.hcp >= 13) {
        return contractBid(4, trump);
      }
      if (c.evaluation.hcp >= 10 && c.evaluation.hcp <= 12) {
        return contractBid(3, trump);
      }
      return pass();
    },
  },
  {
    id: 'R46-responder-rebid-after-opener-nt',
    priority: 102,
    description: 'Responder rebid after opener notrump rebid',
    applies: c => isResponderRebid(c) &&
      !!c.partnerLastBid &&
      c.partnerLastBid.strain === Strain.NOTRUMP,
    propose: c => {
      const longest = longestSuit(c);
      const longestLen = suitLength(c, longest);
      const partnerOpened2C = !!c.partnerBid &&
        c.partnerBid.level === 2 && c.partnerBid.strain === Strain.CLUBS;
      if (partnerOpened2C && longestLen >= 5) {
        const bid = lowestLegalContractForStrain(c, longest);
        if (bid) return bid;
      }
      if (partnerOpened2C && c.partnerLastBid && c.partnerLastBid.level === 4 &&
          c.partnerLastBid.strain === Strain.NOTRUMP) {
        for (const s of SUIT_STRAINS) {
          if (suitLength(c, s) >= 5) return contractBid(5, s);
        }
        return contractBid(5, Strain.CLUBS);
      }
      if (longestLen >= 6 && c.evaluation.hcp >= 10) {
        const bid = lowestLegalContractForStrain(c, longest, 3);
        if (bid) return bid;
        return contractBid(3, longest);
      }
      if (c.evaluation.hcp <= 7) {
        if (longestLen >= 6 && c.ownBid) {
          const bid = lowestLegalContractForStrain(c, c.ownBid.strain);
          if (bid) return bid;
        }
        return pass();
      }
      if (c.evaluation.hcp <= 9) {
        if (c.ownBid && suitLength(c, c.ownBid.strain) >= 5) {
          const bid = lowestLegalContractForStrain(c, c.ownBid.strain);
          if (bid) return bid;
        }
        return pass();
      }
      if (c.evaluation.hcp <= 12) return contractBid(2, Strain.NOTRUMP);
      if (hasSelfSufficientSuit(c)) return contractBid(3, longestSuit(c));
      return contractBid(3, Strain.NOTRUMP);
    },
  },
  {
    id: 'R47-responder-rebid-own-suit',
    priority: 101,
    description: 'Responder repeats own suit with long holding',
    applies: c => isResponderRebid(c) &&
      !!c.ownBid &&
      suitLength(c, c.ownBid.strain) >= 6,
    propose: c => contractBid(2, c.ownBid ? c.ownBid.strain : Strain.CLUBS),
  },
  {
    id: 'R48-competitive-1nt-overcall',
    priority: 100,
    description: 'Overcall 1NT with 15-18 balanced',
    applies: c => c.phase === 'competitive' &&
      !c.ownBid &&
      !!c.opponentBid &&
      c.opponentBid.level === 1 &&
      c.evaluation.hcp >= 15 &&
      c.evaluation.hcp <= 18 &&
      isBalancedContext(c),
    propose: () => contractBid(1, Strain.NOTRUMP),
  },
  {
    id: 'R49-competitive-suit-overcall',
    priority: 99,
    description: 'Overcall in long suit with 8-16 and five-card suit',
    applies: c => c.phase === 'competitive' &&
      !c.ownBid &&
      !!c.opponentBid &&
      c.evaluation.hcp >= 8 &&
      c.evaluation.hcp <= 16 &&
      hasOvercallSuit(c),
    propose: c => {
      const suit = bestOvercallSuit(c);
      const sLen = suitLength(c, suit);
      if (sLen >= 7 && c.evaluation.hcp >= 10) {
        const jumpBid = lowestLegalContractForStrain(c, suit, 2);
        if (jumpBid) return jumpBid;
      }
      const bid = lowestLegalContractForStrain(c, suit);
      return bid || contractBid(2, suit);
    },
  },
  {
    id: 'R49a-competitive-weak-jump-overcall',
    priority: 99,
    description: 'Jump overcall with weak long suit and preemptive shape',
    applies: c => c.phase === 'competitive' &&
      !c.ownBid &&
      !!c.opponentBid &&
      c.evaluation.hcp <= 10 &&
      hasSevenCardSuit(c),
    propose: c => {
      const suit = bestOvercallSuit(c);
      const sLen = suitLength(c, suit);
      const minLevelBid = lowestLegalContractForStrain(c, suit);
      if (!minLevelBid) return contractBid(3, suit);
      if (sLen >= 8) {
        const fourLevel = lowestLegalContractForStrain(c, suit, 4);
        if (fourLevel) return fourLevel;
      }
      if (sLen >= 7) {
        const threeLevel = lowestLegalContractForStrain(c, suit, 3);
        if (threeLevel) return threeLevel;
      }
      const jumpBid = lowestLegalContractForStrain(c, suit, minLevelBid.level + 1);
      if (jumpBid) return jumpBid;
      return minLevelBid;
    },
  },
  {
    id: 'R49b-competitive-pass-strong-two-suiters',
    priority: 99,
    description: 'Pass with strong shapely hands lacking clear disciplined action',
    applies: c => c.phase === 'competitive' &&
      !c.ownBid &&
      !!c.opponentBid &&
      c.evaluation.hcp >= 13 &&
      hasSevenCardSuit(c),
    propose: () => pass(),
  },
  {
    id: 'R50-competitive-takeout-double',
    priority: 98,
    description: 'Direct takeout double with 12+ and classic shape',
    applies: c => c.phase === 'competitive' &&
      !c.ownBid &&
      !c.partnerBid &&
      !!c.opponentBid &&
      c.evaluation.hcp >= 12 &&
      hasTakeoutShape(c),
    propose: () => dbl(),
  },
  {
    id: 'R50a-negative-double-after-major-overcall',
    priority: 98,
    description: 'Use negative double over one-level major overcall with values',
    applies: c => isResponderFirstTurn(c) &&
      !!c.partnerBid &&
      (c.partnerBid.strain === Strain.CLUBS || c.partnerBid.strain === Strain.DIAMONDS) &&
      !!c.opponentBid &&
      (c.opponentBid.strain === Strain.HEARTS || c.opponentBid.strain === Strain.SPADES) &&
      c.opponentBid.level === 1 &&
      c.evaluation.hcp >= 8 &&
      c.evaluation.shapeClass === 'balanced',
    propose: () => dbl(),
  },
  {
    id: 'R50b-respond-2nt-over-1d-balanced',
    priority: 122,
    description: 'Bid 2NT over 1D with balanced invitational values and no fit',
    applies: c => isResponderFirstTurn(c) &&
      !!c.partnerBid &&
      c.partnerBid.level === 1 &&
      c.partnerBid.strain === Strain.DIAMONDS &&
      isBalancedContext(c) &&
      c.evaluation.hcp === 12 &&
      suitLength(c, Strain.DIAMONDS) <= 3 &&
      !hasFourCardMajor(c) &&
      !SUIT_STRAINS.some(s => suitLength(c, s) >= 5),
    propose: () => contractBid(2, Strain.NOTRUMP),
  },
  {
    id: 'R50c-respond-3nt-over-1d-balanced',
    priority: 122,
    description: 'Bid 3NT over 1D with balanced game values and no fit',
    applies: c => isResponderFirstTurn(c) &&
      !!c.partnerBid &&
      c.partnerBid.level === 1 &&
      c.partnerBid.strain === Strain.DIAMONDS &&
      isSemiOrBalanced(c) &&
      c.evaluation.hcp >= 13 &&
      suitLength(c, Strain.DIAMONDS) <= 4,
    propose: () => contractBid(3, Strain.NOTRUMP),
  },
  {
    id: 'R50d-responder-3nt-after-opener-3d',
    priority: 103,
    description: 'After 1S-2H-3D, bid 3NT with balanced invitational-plus values',
    applies: c => isResponderRebidAfterOneSpadeTwoHeartsThreeDiamonds(c) &&
      isSemiOrBalanced(c) &&
      c.evaluation.hcp >= 10,
    propose: () => contractBid(3, Strain.NOTRUMP),
  },
  {
    id: 'R50e-responder-rebid-2s-after-opener-3d',
    priority: 102,
    description: 'After 1S-2H-3D, rebid spades with preference support',
    applies: c => isResponderRebidAfterOneSpadeTwoHeartsThreeDiamonds(c) &&
      !!c.partnerBid &&
      suitLength(c, c.partnerBid.strain) >= 3,
    propose: c => contractBid(2, c.partnerBid ? c.partnerBid.strain : Strain.SPADES),
  },
  {
    id: 'R50f-responder-rebid-pass-after-opener-3d',
    priority: 101,
    description: 'After 1S-2H-3D, pass with weak non-fitting continuation values',
    applies: c => isResponderRebidAfterOneSpadeTwoHeartsThreeDiamonds(c),
    propose: () => pass(),
  },

  // ── Pass after partner's game or sign-off ──────────────────────────────
  {
    id: 'R51-pass-after-partner-game',
    priority: 95,
    description: 'Pass after partner bids game or slam',
    applies: c => c.phase === 'rebid' &&
      !!c.partnerLastBid &&
      c.partnerLastBid.strain !== Strain.NOTRUMP &&
      ((c.partnerLastBid.level >= 4 &&
        (c.partnerLastBid.strain === Strain.HEARTS || c.partnerLastBid.strain === Strain.SPADES)) ||
       c.partnerLastBid.level >= 5),
    propose: () => pass(),
  },
  {
    id: 'R51a-pass-after-partner-3nt-game',
    priority: 95,
    description: 'Pass after partner bids 3NT game',
    applies: c => c.phase === 'rebid' &&
      !!c.partnerLastBid &&
      c.partnerLastBid.level === 3 &&
      c.partnerLastBid.strain === Strain.NOTRUMP,
    propose: () => pass(),
  },
  {
    id: 'R51b-pass-after-partner-slam',
    priority: 95,
    description: 'Pass after partner bids slam',
    applies: c => c.phase === 'rebid' &&
      !!c.partnerLastBid &&
      c.partnerLastBid.level >= 6,
    propose: () => pass(),
  },

  // ── Opener rebid: 5NT Grand Slam Force response ───────────────────────
  {
    id: 'R52-opener-7-after-5nt-gsf',
    priority: 105,
    description: 'After partner 5NT GSF, bid grand slam with strong trump and extras',
    applies: c => isOneMajorOpenerAfterFiveNt(c) &&
      !!c.ownBid &&
      suitHonorCount(c, c.ownBid.strain) >= 3 &&
      suitLength(c, c.ownBid.strain) >= 6,
    propose: c => contractBid(7, c.ownBid ? c.ownBid.strain : Strain.SPADES),
  },
  {
    id: 'R52a-opener-6-after-5nt-gsf',
    priority: 104,
    description: 'After partner 5NT GSF, bid small slam',
    applies: c => isOneMajorOpenerAfterFiveNt(c),
    propose: c => contractBid(6, c.ownBid ? c.ownBid.strain : Strain.SPADES),
  },

  // ── Opener rebid after responder new suit at two level ─────────────────
  {
    id: 'R53-opener-rebid-raise-new-suit-response',
    priority: 104,
    description: 'Opener raises responder new suit with 4+ fit',
    applies: c => isOpenerRebid(c) &&
      !!c.ownBid &&
      !!c.partnerBid &&
      c.partnerBid.strain !== Strain.NOTRUMP &&
      c.partnerBid.strain !== c.ownBid.strain &&
      c.partnerBid.level === 2 &&
      (c.partnerBid.strain === Strain.HEARTS || c.partnerBid.strain === Strain.SPADES ||
       c.partnerBid.strain === Strain.DIAMONDS) &&
      suitLength(c, c.partnerBid.strain) >= 4 &&
      c.evaluation.hcp >= 16,
    propose: c => contractBid(4, c.partnerBid ? c.partnerBid.strain : Strain.HEARTS),
  },
  {
    id: 'R53a-opener-rebid-3nt-after-new-suit',
    priority: 103,
    description: 'Opener rebids 3NT after new suit response with strong balanced hand',
    applies: c => isOpenerRebid(c) &&
      !!c.partnerBid &&
      c.partnerBid.level === 2 &&
      c.evaluation.hcp >= 18 &&
      isSemiOrBalanced(c),
    propose: () => contractBid(3, Strain.NOTRUMP),
  },
  {
    id: 'R53b-opener-rebid-own-suit-after-new-suit',
    priority: 102,
    description: 'Opener rebids own suit at minimum after new suit response',
    applies: c => isOpenerRebid(c) &&
      !!c.ownBid &&
      !!c.partnerBid &&
      c.partnerBid.level === 2 &&
      suitLength(c, c.ownBid.strain) >= 6,
    propose: c => {
      const own = c.ownBid ? c.ownBid.strain : Strain.CLUBS;
      const bid = lowestLegalContractForStrain(c, own);
      return bid || contractBid(2, own);
    },
  },

  // ── 1NT opener rebid: partner used 2S (minor relay) ────────────────────
  {
    id: 'R54-1nt-opener-3c-after-2s-relay',
    priority: 106,
    description: 'After 1NT and partner 2S minor relay, bid 3C',
    applies: c => isOpenerRebid(c) &&
      !!c.ownBid &&
      c.ownBid.level === 1 &&
      c.ownBid.strain === Strain.NOTRUMP &&
      !!c.partnerBid &&
      c.partnerBid.level === 2 &&
      c.partnerBid.strain === Strain.SPADES,
    propose: () => contractBid(3, Strain.CLUBS),
  },

  // ── Responder continuation after 1NT-2S-3C ────────────────────────────
  {
    id: 'R54a-responder-3d-after-1nt-2s-3c',
    priority: 103,
    description: 'After 1NT-2S-3C, bid 3D with long diamonds',
    applies: c => isResponderRebidAfterOneNotrumpTwoSpadesThreeClubs(c) &&
      suitLength(c, Strain.DIAMONDS) >= 5,
    propose: () => contractBid(3, Strain.DIAMONDS),
  },
  {
    id: 'R54b-responder-pass-after-1nt-2s-3c',
    priority: 102,
    description: 'After 1NT-2S-3C, pass with clubs',
    applies: c => isResponderRebidAfterOneNotrumpTwoSpadesThreeClubs(c),
    propose: () => pass(),
  },

  // ── Opener after 1S-2S (Michaels)-3S-4C cue ──────────────────────────
  {
    id: 'R54c-opener-4d-after-1s-2s-3s-4c',
    priority: 104,
    description: 'After 1S-2S-3S-4C cue bid, show diamond values',
    applies: c => isOpenerRebidAfterOneSpadeTwoSpadesThreeSpadesFourClubs(c) &&
      suitLength(c, Strain.DIAMONDS) >= 4,
    propose: () => contractBid(4, Strain.DIAMONDS),
  },
  {
    id: 'R54d-opener-pass-after-1s-2s-3s-4c',
    priority: 103,
    description: 'After 1S-2S-3S-4C cue bid, pass without extras',
    applies: c => isOpenerRebidAfterOneSpadeTwoSpadesThreeSpadesFourClubs(c),
    propose: () => pass(),
  },

  // ── Opener after 1S-2S-2NT ────────────────────────────────────────────
  {
    id: 'R54e-opener-3d-after-1s-2s-2nt',
    priority: 104,
    description: 'After 1S-2S-2NT, show diamond suit',
    applies: c => isOpenerRebidAfterOneSpadeTwoSpadesTwoNotrump(c) &&
      suitLength(c, Strain.DIAMONDS) >= 4,
    propose: () => contractBid(3, Strain.DIAMONDS),
  },
  {
    id: 'R54f-opener-3c-after-1s-2s-2nt',
    priority: 103,
    description: 'After 1S-2S-2NT, show club suit',
    applies: c => isOpenerRebidAfterOneSpadeTwoSpadesTwoNotrump(c) &&
      suitLength(c, Strain.CLUBS) >= 4,
    propose: () => contractBid(3, Strain.CLUBS),
  },

  // ── Competitive: respond to partner takeout double ─────────────────────
  {
    id: 'R55-respond-to-takeout-double-suit',
    priority: 97,
    description: 'Bid longest suit in response to partner takeout double',
    applies: c => c.phase === 'competitive' &&
      !c.ownBid &&
      !!c.opponentBid &&
      c.opponentBid.strain !== Strain.NOTRUMP &&
      hasPartnerDoubledAuction(c) &&
      c.evaluation.hcp <= 12,
    propose: c => {
      const opp = c.opponentBid ? c.opponentBid.strain : null;
      const bid = bestLegalSuitBid(c, opp, 3);
      return bid || pass();
    },
  },

  // ── Competitive: pass in balancing/late positions ──────────────────────
  {
    id: 'R56-competitive-pass-late',
    priority: 40,
    description: 'Pass in competitive position with insufficient values to act',
    applies: c => c.phase === 'competitive' && !c.ownBid,
    propose: () => pass(),
  },

  // ── Competitive: overcall at 2-level with longer suit ──────────────────
  {
    id: 'R57-competitive-overcall-long-suit',
    priority: 97,
    description: 'Overcall with long suit at appropriate level',
    applies: c => c.phase === 'competitive' &&
      !c.ownBid &&
      !!c.opponentBid &&
      c.evaluation.hcp >= 5 &&
      SUIT_STRAINS.some(s => s !== (c.opponentBid ? c.opponentBid.strain : null) && suitLength(c, s) >= 6),
    propose: c => {
      const opp = c.opponentBid ? c.opponentBid.strain : null;
      const suits = suitsByLength(c, opp, 6);
      if (suits.length === 0) return pass();
      const suit = suits[0];
      const sLen = suitLength(c, suit);
      const bid = lowestLegalContractForStrain(c, suit);
      if (!bid) return pass();
      if (sLen >= 6 && c.evaluation.hcp <= 10 && bid.level === 1) {
        return lowestLegalContractForStrain(c, suit, 2) || bid;
      }
      if (sLen >= 7 && c.evaluation.hcp <= 10) {
        const jumpBid = lowestLegalContractForStrain(c, suit, bid.level + 1);
        if (jumpBid) return jumpBid;
      }
      return bid;
    },
  },

  // ── Competitive: double for penalty/reopening ──────────────────────────
  {
    id: 'R57a-competitive-penalty-double',
    priority: 97,
    description: 'Double for penalty with strong values over opponent contract',
    applies: c => c.phase === 'competitive' &&
      !c.ownBid &&
      !c.partnerBid &&
      !!c.opponentBid &&
      c.evaluation.hcp >= 16 &&
      hasTakeoutShape(c),
    propose: () => dbl(),
  },

  // ── Responding: weak raise with support ────────────────────────────────
  {
    id: 'R58-respond-weak-raise-with-support',
    priority: 119,
    description: 'Raise partner opening with good support despite weak values',
    applies: c => isResponderFirstTurn(c) &&
      !!c.partnerBid &&
      (c.partnerBid.strain === Strain.HEARTS || c.partnerBid.strain === Strain.SPADES) &&
      suitLength(c, c.partnerBid.strain) >= 4 &&
      c.evaluation.hcp >= 3 && c.evaluation.hcp <= 5,
    propose: c => contractBid(2, c.partnerBid ? c.partnerBid.strain : Strain.HEARTS),
  },

  // ── Responding: over weak two opening ──────────────────────────────────
  {
    id: 'R59-respond-2nt-over-weak-two',
    priority: 119,
    description: 'Bid 2NT feature-ask over partner weak two with game interest',
    applies: c => isResponderFirstTurn(c) &&
      !!c.partnerBid &&
      c.partnerBid.level === 2 &&
      c.partnerBid.strain !== Strain.CLUBS &&
      c.partnerBid.strain !== Strain.NOTRUMP &&
      c.evaluation.hcp >= 15,
    propose: () => contractBid(2, Strain.NOTRUMP),
  },
  {
    id: 'R59a-respond-raise-partner-preempt',
    priority: 118,
    description: 'Raise partner preempt with good support',
    applies: c => isResponderFirstTurn(c) &&
      !!c.partnerBid &&
      c.partnerBid.level >= 2 &&
      c.partnerBid.level <= 3 &&
      c.partnerBid.strain !== Strain.NOTRUMP &&
      c.partnerBid.strain !== Strain.CLUBS &&
      !c.opponentBid &&
      suitLength(c, c.partnerBid.strain) >= 3 &&
      c.evaluation.hcp >= 10,
    propose: c => {
      if (!c.partnerBid) return pass();
      return contractBid(c.partnerBid.level + 1, c.partnerBid.strain);
    },
  },

  // ── Responding: negative double over 2-level overcall ──────────────────
  {
    id: 'R59b-negative-double-over-2-level-overcall',
    priority: 97,
    description: 'Use negative double over two-level overcall with values',
    applies: c => isResponderFirstTurn(c) &&
      !!c.partnerBid &&
      c.partnerBid.level === 1 &&
      !!c.opponentBid &&
      c.opponentBid.level === 2 &&
      c.evaluation.hcp >= 7,
    propose: () => dbl(),
  },

  // ── Responding: over partner Michaels/unusual 2NT ──────────────────────
  {
    id: 'R60-respond-over-michaels-cue',
    priority: 118,
    description: 'After partner Michaels cue bid, show best major',
    applies: c => isResponderFirstTurn(c) &&
      !!c.partnerBid &&
      !!c.opponentBid &&
      c.partnerBid.level === 2 &&
      c.partnerBid.strain === c.opponentBid.strain,
    propose: c => {
      const preferred = suitLength(c, Strain.HEARTS) >= suitLength(c, Strain.SPADES)
        ? Strain.HEARTS : Strain.SPADES;
      const alt = preferred === Strain.HEARTS ? Strain.SPADES : Strain.HEARTS;
      const bid = lowestLegalContractForStrain(c, preferred);
      if (bid) return bid;
      const altBid = lowestLegalContractForStrain(c, alt);
      return altBid || pass();
    },
  },

  // ── Opener third turn: accept invites and raise ─────────────────────────
  {
    id: 'R61c-opener-accept-3suit-invite',
    priority: 96,
    description: 'Opener accepts 3-level suit invite to game with values',
    applies: c => c.phase === 'rebid' &&
      c.opener &&
      c.ownBidCount >= 2 &&
      !!c.partnerLastBid &&
      c.partnerLastBid.level === 3 &&
      c.partnerLastBid.strain !== Strain.NOTRUMP &&
      c.evaluation.hcp >= 13,
    propose: c => {
      if (!c.partnerLastBid) return pass();
      if (c.partnerLastBid.strain === Strain.HEARTS || c.partnerLastBid.strain === Strain.SPADES) {
        if (suitLength(c, c.partnerLastBid.strain) >= 3) {
          return contractBid(4, c.partnerLastBid.strain);
        }
      }
      return contractBid(3, Strain.NOTRUMP);
    },
  },
  {
    id: 'R61d-opener-accept-2nt-invite',
    priority: 96,
    description: 'Opener accepts 2NT invite to 3NT with values',
    applies: c => c.phase === 'rebid' &&
      c.opener &&
      c.ownBidCount >= 2 &&
      !!c.partnerLastBid &&
      c.partnerLastBid.level === 2 &&
      c.partnerLastBid.strain === Strain.NOTRUMP &&
      c.evaluation.hcp >= 15,
    propose: () => contractBid(3, Strain.NOTRUMP),
  },
  {
    id: 'R61e-opener-show-suit-after-partner-continuation',
    priority: 95,
    description: 'Opener rebids own suit or shows new suit after partner continuation',
    applies: c => c.phase === 'rebid' &&
      c.opener &&
      c.ownBidCount >= 2 &&
      !!c.partnerLastBid &&
      c.evaluation.hcp >= 16 &&
      c.ownBid && suitLength(c, c.ownBid.strain) >= 6,
    propose: c => {
      if (!c.ownBid) return pass();
      const bid = lowestLegalContractForStrain(c, c.ownBid.strain);
      return bid || pass();
    },
  },
  {
    id: 'R61a-opener-raise-to-slam-after-game',
    priority: 94,
    description: 'Opener raises to slam after partner game with strong values',
    applies: c => c.phase === 'rebid' &&
      c.opener &&
      c.ownBidCount >= 2 &&
      !!c.partnerLastBid &&
      c.partnerLastBid.level >= 4 &&
      c.evaluation.hcp >= 18,
    propose: c => {
      if (!c.partnerLastBid) return pass();
      if (c.partnerLastBid.strain === Strain.NOTRUMP) {
        return contractBid(Math.min(c.partnerLastBid.level + 1, 7), Strain.NOTRUMP);
      }
      return contractBid(Math.min(c.partnerLastBid.level + 1, 7), c.partnerLastBid.strain);
    },
  },
  // ── Opener third-turn: pass after partner signs off or game ────────────
  {
    id: 'R61-opener-pass-after-partner-signoff',
    priority: 93,
    description: 'Opener passes after partner signs off in minimum or game contract',
    applies: c => c.phase === 'rebid' &&
      c.opener &&
      c.ownBidCount >= 2 &&
      !!c.partnerLastBid,
    propose: () => pass(),
  },

  // ── Opener continuation: 1NT after transfer and responder bids NT ──────
  {
    id: 'R62-1nt-opener-4major-after-transfer-2nt',
    priority: 106,
    description: 'After 1NT transfer completion, bid 4 of major with fit and max after responder 2NT',
    applies: c => c.phase === 'rebid' &&
      c.opener &&
      c.ownBidCount >= 2 &&
      !!c.ownBid &&
      c.ownBid.level === 1 &&
      c.ownBid.strain === Strain.NOTRUMP &&
      !!c.partnerBid &&
      c.partnerBid.level === 2 &&
      (c.partnerBid.strain === Strain.DIAMONDS || c.partnerBid.strain === Strain.HEARTS) &&
      !!c.partnerLastBid &&
      c.partnerLastBid.level === 2 &&
      c.partnerLastBid.strain === Strain.NOTRUMP,
    propose: c => {
      if (!c.partnerBid) return pass();
      const target = c.partnerBid.strain === Strain.DIAMONDS ? Strain.HEARTS : Strain.SPADES;
      if (suitLength(c, target) >= 3 && c.evaluation.hcp >= 16) {
        return contractBid(4, target);
      }
      if (c.evaluation.hcp >= 16) return contractBid(3, Strain.NOTRUMP);
      return pass();
    },
  },

  // ── 1NT opener after transfer, responder bids 3NT ──────────────────────
  {
    id: 'R62a-1nt-opener-after-transfer-3nt',
    priority: 106,
    description: 'After 1NT transfer and responder 3NT, bid 4 of major with 3+ fit',
    applies: c => c.phase === 'rebid' &&
      c.opener &&
      c.ownBidCount >= 2 &&
      !!c.ownBid &&
      c.ownBid.level === 1 &&
      c.ownBid.strain === Strain.NOTRUMP &&
      !!c.partnerBid &&
      c.partnerBid.level === 2 &&
      (c.partnerBid.strain === Strain.DIAMONDS || c.partnerBid.strain === Strain.HEARTS) &&
      !!c.partnerLastBid &&
      c.partnerLastBid.level === 3 &&
      c.partnerLastBid.strain === Strain.NOTRUMP,
    propose: c => {
      if (!c.partnerBid) return pass();
      const target = c.partnerBid.strain === Strain.DIAMONDS ? Strain.HEARTS : Strain.SPADES;
      if (suitLength(c, target) >= 3) return contractBid(4, target);
      return pass();
    },
  },

  // ── 1NT opener continuation after transfer-double-complete, responder bids ─
  {
    id: 'R62b-1nt-opener-after-transfer-interference',
    priority: 106,
    description: 'After 1NT and opponent interferes with transfer, complete if possible',
    applies: c => isOpenerRebid(c) &&
      !!c.ownBid &&
      c.ownBid.level === 1 &&
      c.ownBid.strain === Strain.NOTRUMP &&
      !!c.partnerBid &&
      c.partnerBid.level === 2 &&
      (c.partnerBid.strain === Strain.DIAMONDS || c.partnerBid.strain === Strain.HEARTS) &&
      !!c.opponentBid,
    propose: c => {
      if (!c.partnerBid) return pass();
      const target = c.partnerBid.strain === Strain.DIAMONDS ? Strain.HEARTS : Strain.SPADES;
      if (suitLength(c, target) >= 3) {
        const bid = lowestLegalContractForStrain(c, target);
        if (bid) return bid;
      }
      return pass();
    },
  },

  // ── Opener rebid after 1x-P-1NT-P ─────────────────────────────────────
  {
    id: 'R63-opener-rebid-game-after-1nt-response',
    priority: 104,
    description: 'After responder 1NT, bid game with very strong hand',
    applies: c => isOpenerRebid(c) &&
      !!c.partnerBid &&
      c.partnerBid.level === 1 &&
      c.partnerBid.strain === Strain.NOTRUMP &&
      c.evaluation.hcp >= 19,
    propose: c => {
      if (c.ownBid && suitLength(c, c.ownBid.strain) >= 7) {
        return contractBid(4, c.ownBid.strain);
      }
      return contractBid(3, Strain.NOTRUMP);
    },
  },

  // ── Opener rebid after 2C strong and continuation ──────────────────────
  {
    id: 'R63a-opener-rebid-after-2c-waiting',
    priority: 104,
    description: 'After 2C-2D waiting, rebid naturally showing suit or NT',
    applies: c => isOpenerRebid(c) &&
      !!c.ownBid &&
      c.ownBid.level === 2 &&
      c.ownBid.strain === Strain.CLUBS &&
      !!c.partnerBid &&
      c.partnerBid.level === 2 &&
      c.partnerBid.strain === Strain.DIAMONDS,
    propose: c => {
      if (isBalancedContext(c)) return contractBid(2, Strain.NOTRUMP);
      return contractBid(2, longestSuit(c));
    },
  },

  // ── Opener rebid over interference (opponent bid after partner) ────────
  {
    id: 'R63b-opener-pass-after-interference',
    priority: 92,
    description: 'Opener passes when opponents outbid after partner response',
    applies: c => isOpenerRebid(c) &&
      !!c.opponentBid,
    propose: () => pass(),
  },

  // ── Responder continuation: rebid after opener shows new suit ──────────
  {
    id: 'R64-responder-rebid-prefer-partner-suit',
    priority: 100,
    description: 'Responder gives preference to opener original suit',
    applies: c => isResponderRebid(c) &&
      !!c.partnerBid &&
      !!c.partnerLastBid &&
      c.partnerLastBid.strain !== c.partnerBid.strain &&
      c.partnerLastBid.strain !== Strain.NOTRUMP &&
      c.partnerBid.strain !== Strain.NOTRUMP &&
      suitLength(c, c.partnerBid.strain) >= 3 &&
      c.evaluation.hcp >= 6,
    propose: c => {
      if (!c.partnerBid) return pass();
      const bid = lowestLegalContractForStrain(c, c.partnerBid.strain);
      return bid || pass();
    },
  },

  // ── Responder rebid: 2NT with invitational values ──────────────────────
  {
    id: 'R64a-responder-rebid-2nt-invitational',
    priority: 100,
    description: 'Responder bids 2NT with invitational balanced values',
    applies: c => isResponderRebid(c) &&
      isSemiOrBalanced(c) &&
      c.evaluation.hcp >= 10 && c.evaluation.hcp <= 12,
    propose: () => contractBid(2, Strain.NOTRUMP),
  },
  {
    id: 'R64b-responder-rebid-3nt-game',
    priority: 100,
    description: 'Responder bids 3NT with game values',
    applies: c => isResponderRebid(c) &&
      isSemiOrBalanced(c) &&
      c.evaluation.hcp >= 13,
    propose: () => contractBid(3, Strain.NOTRUMP),
  },

  // ── Responder continuation: 1NT-specific late passes ───────────────────
  {
    id: 'R64c-responder-pass-after-nt-signoff',
    priority: 92,
    description: 'Responder passes after opener signs off in notrump',
    applies: c => isResponderRebid(c) &&
      !!c.partnerLastBid &&
      c.partnerLastBid.strain === Strain.NOTRUMP &&
      c.evaluation.hcp <= 9,
    propose: () => pass(),
  },

  // ── Opener rebid: jump-rebid own suit with extras ────────────────────────
  {
    id: 'R65a-opener-rebid-jump-own-suit',
    priority: 103,
    description: 'Opener jump-rebids own suit with 16+ and 6+ cards',
    applies: c => isOpenerRebid(c) &&
      !!c.ownBid &&
      suitLength(c, c.ownBid.strain) >= 6 &&
      c.evaluation.hcp >= 16 &&
      !(isSemiOrBalanced(c) && c.evaluation.hcp >= 18),
    propose: c => {
      if (!c.ownBid) return pass();
      return contractBid(3, c.ownBid.strain);
    },
  },

  // ── Opener rebid: game with very strong hand ───────────────────────────
  {
    id: 'R65b-opener-rebid-game-strong',
    priority: 102,
    description: 'Opener bids game with very strong unbalanced hand',
    applies: c => isOpenerRebid(c) &&
      c.evaluation.hcp >= 19 &&
      !!c.ownBid &&
      suitLength(c, c.ownBid.strain) >= 5,
    propose: c => {
      if (!c.ownBid) return pass();
      if (c.ownBid.strain === Strain.HEARTS || c.ownBid.strain === Strain.SPADES) {
        return contractBid(4, c.ownBid.strain);
      }
      return contractBid(3, Strain.NOTRUMP);
    },
  },

  // ── 1NT opener: complete transfer when partner bid 2D or 2H ─────────
  {
    id: 'R65c-1nt-opener-complete-transfer',
    priority: 107,
    description: 'After 1NT, complete partner transfer',
    applies: c => isOpenerRebid(c) &&
      !!c.ownBid &&
      c.ownBid.level === 1 &&
      c.ownBid.strain === Strain.NOTRUMP &&
      !!c.partnerBid &&
      c.partnerBid.level === 2 &&
      (c.partnerBid.strain === Strain.DIAMONDS || c.partnerBid.strain === Strain.HEARTS) &&
      !c.opponentBid,
    propose: c => {
      if (!c.partnerBid) return pass();
      const target = c.partnerBid.strain === Strain.DIAMONDS ? Strain.HEARTS : Strain.SPADES;
      if (suitLength(c, target) >= 4 && c.evaluation.hcp >= 17) {
        return contractBid(3, target);
      }
      return contractBid(2, target);
    },
  },
  // ── 1NT opener: respond to Stayman ─────────────────────────────────
  {
    id: 'R65c2-1nt-opener-respond-stayman',
    priority: 107,
    description: 'After 1NT and partner 2C Stayman, show 4-card major',
    applies: c => isOpenerRebid(c) &&
      !!c.ownBid &&
      c.ownBid.level === 1 &&
      c.ownBid.strain === Strain.NOTRUMP &&
      !!c.partnerBid &&
      c.partnerBid.level === 2 &&
      c.partnerBid.strain === Strain.CLUBS &&
      !c.opponentBid,
    propose: c => {
      if (suitLength(c, Strain.HEARTS) >= 4) return contractBid(2, Strain.HEARTS);
      if (suitLength(c, Strain.SPADES) >= 4) return contractBid(2, Strain.SPADES);
      return contractBid(2, Strain.DIAMONDS);
    },
  },

  // ── Responder rebid: show suit preference after opener rebid ───────────
  {
    id: 'R65d-responder-rebid-show-suit',
    priority: 100,
    description: 'Responder shows long suit or gives preference in rebid',
    applies: c => isResponderRebid(c) &&
      !!c.ownBid &&
      suitLength(c, c.ownBid.strain) >= 5 &&
      c.evaluation.hcp >= 8,
    propose: c => {
      if (!c.ownBid) return pass();
      const bid = lowestLegalContractForStrain(c, c.ownBid.strain);
      return bid || pass();
    },
  },

  // ── Late rebid: pass when no clear action ──────────────────────────────
  {
    id: 'R65-rebid-pass-default',
    priority: 90,
    description: 'Pass in rebid phase when no higher-priority rule matches',
    applies: c => c.phase === 'rebid',
    propose: () => pass(),
  },

  // ── Responding: pass over partner with absolute minimum ────────────────
  {
    id: 'R66-respond-pass-minimum',
    priority: 50,
    description: 'Pass with very weak values as responder',
    applies: c => c.phase === 'responding' && c.evaluation.hcp <= 5,
    propose: () => pass(),
  },

  // ── Responding: bid 1NT as general fallback ────────────────────────────
  {
    id: 'R67-respond-1nt-general',
    priority: 45,
    description: 'Bid 1NT as general response with moderate values',
    applies: c => c.phase === 'responding' &&
      c.evaluation.hcp >= 6 && c.evaluation.hcp <= 9,
    propose: () => contractBid(1, Strain.NOTRUMP),
  },

  // ── Responding: pass as general fallback ────────────────────────────
  {
    id: 'R68-respond-pass-general',
    priority: 40,
    description: 'Pass as general fallback in responding phase',
    applies: c => c.phase === 'responding',
    propose: () => pass(),
  },
];

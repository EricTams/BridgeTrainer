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
    description: 'Invite game with 2NT over 1NT on 8-9 balanced',
    applies: c => isResponderFirstTurn(c) && partnerOpenedOneNt(c) &&
      c.evaluation.hcp >= 8 && c.evaluation.hcp <= 9 &&
      isBalancedContext(c) &&
      !hasFiveCardMajor(c),
    propose: () => contractBid(2, Strain.NOTRUMP),
  },
  {
    id: 'R13-respond-game-1nt',
    priority: 130,
    description: 'Bid 3NT over 1NT with 10-15 balanced',
    applies: c => isResponderFirstTurn(c) && partnerOpenedOneNt(c) &&
      c.evaluation.hcp >= 10 && c.evaluation.hcp <= 15 &&
      isBalancedContext(c) &&
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
    id: 'R15-respond-pass-1nt',
    priority: 120,
    description: 'Pass weak balanced hands over 1NT',
    applies: c => isResponderFirstTurn(c) && partnerOpenedOneNt(c) && c.evaluation.hcp <= 7,
    propose: () => pass(),
  },
  {
    id: 'R16-respond-stayman-2nt',
    priority: 128,
    description: 'Use 3C Stayman over partner 2NT',
    applies: c => isResponderFirstTurn(c) && partnerOpenedTwoNt(c) && hasFourCardMajor(c),
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
    description: 'Respond in a new major with 6+ and 4+ card suit',
    applies: c => isResponderFirstTurn(c) && partnerOpenedSuitAtOne(c) &&
      c.evaluation.hcp >= 6 &&
      hasFourCardMajor(c) &&
      c.partnerBid?.strain !== Strain.NOTRUMP,
    propose: c => {
      const partner = c.partnerBid;
      if (!partner) return contractBid(1, Strain.SPADES);
      if (partner.strain === Strain.HEARTS && suitLength(c, Strain.SPADES) >= 4) {
        return contractBid(1, Strain.SPADES);
      }
      if (partner.strain === Strain.SPADES && suitLength(c, Strain.HEARTS) >= 4) {
        return contractBid(2, Strain.HEARTS);
      }
      if (partner.strain === Strain.CLUBS || partner.strain === Strain.DIAMONDS) {
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
    id: 'R24a-respond-2nt-over-minor',
    priority: 121,
    description: 'Bid 2NT over minor opening with balanced invitational values and no fit',
    applies: c => isResponderFirstTurn(c) &&
      partnerOpenedMinorAtOne(c) &&
      isSemiOrBalanced(c) &&
      c.evaluation.hcp >= 10 && c.evaluation.hcp <= 12 &&
      !hasFourCardMajor(c) &&
      (!c.partnerBid || suitLength(c, c.partnerBid.strain) < 4),
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
      !hasFourCardMajor(c) &&
      (!c.partnerBid || suitLength(c, c.partnerBid.strain) < 4),
    propose: () => contractBid(3, Strain.NOTRUMP),
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
      c.evaluation.hcp >= 6 && c.evaluation.hcp <= 9,
    propose: c => contractBid(2, c.partnerBid ? c.partnerBid.strain : Strain.CLUBS),
  },
  {
    id: 'R26-respond-limit-raise',
    priority: 121,
    description: 'Limit raise with 4+ support and 10-12',
    applies: c => isResponderFirstTurn(c) && partnerOpenedSuitAtOne(c) &&
      hasFourCardSupportForPartner(c) &&
      c.evaluation.hcp >= 10 && c.evaluation.hcp <= 12,
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
    priority: 117,
    description: 'Opener rebids 1NT with 12-14 balanced minimum',
    applies: c => isOpenerRebid(c) &&
      c.evaluation.hcp >= 12 && c.evaluation.hcp <= 14 &&
      isSemiOrBalanced(c),
    propose: () => contractBid(1, Strain.NOTRUMP),
  },
  {
    id: 'R32-opener-rebid-own-suit-min',
    priority: 116,
    description: 'Opener rebids own suit with minimum and six-card suit',
    applies: c => isOpenerRebid(c) &&
      !!c.ownBid &&
      suitLength(c, c.ownBid.strain) >= 6 &&
      c.evaluation.hcp <= 16,
    propose: c => contractBid(2, c.ownBid ? c.ownBid.strain : Strain.CLUBS),
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
      if (!c.ownBid) return contractBid(2, longestSuit(c));
      let best = longestSuit(c);
      if (best === c.ownBid.strain) {
        for (const s of SUIT_STRAINS) {
          if (s !== c.ownBid.strain && suitLength(c, s) >= 4) {
            best = s;
            break;
          }
        }
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
      if (c.evaluation.hcp <= 7) return pass();
      if (c.evaluation.hcp <= 9) return contractBid(2, Strain.NOTRUMP);
      if (c.evaluation.hcp <= 12 && suitLength(c, target) >= 6) return contractBid(3, target);
      if (c.evaluation.hcp >= 13 && suitLength(c, target) >= 5) return contractBid(4, target);
      return contractBid(3, Strain.NOTRUMP);
    },
  },
  {
    id: 'R40a-opener-pass-after-stayman-interference',
    priority: 108,
    description: 'After Stayman is overcalled, pass with minimum and no penalty double',
    applies: c => isStaymanInterferenceByOpponents(c) && c.evaluation.hcp <= 16,
    propose: () => pass(),
  },
  {
    id: 'R40b-opener-double-after-stayman-interference',
    priority: 109,
    description: 'After Stayman is overcalled, double with strength for penalty',
    applies: c => isStaymanInterferenceByOpponents(c) && c.evaluation.hcp >= 17,
    propose: () => dbl(),
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
      c.evaluation.hcp >= 16,
    propose: c => contractBid(4, c.ownBid ? c.ownBid.strain : Strain.SPADES),
  },
  {
    id: 'R42b-opener-pass-over-major-limit-raise',
    priority: 106,
    description: 'Over major limit raise, pass with minimum values',
    applies: c => responderSignedOffMajorRaise(c) &&
      !!c.partnerBid &&
      c.partnerBid.level === 3 &&
      c.evaluation.hcp <= 15,
    propose: () => pass(),
  },
  {
    id: 'R42c-opener-invite-over-major-simple-raise',
    priority: 106,
    description: 'Over major single raise, invite with notrump on stronger balanced hands',
    applies: c => responderSignedOffMajorRaise(c) &&
      !!c.partnerBid &&
      c.partnerBid.level === 2 &&
      isSemiOrBalanced(c) &&
      c.evaluation.hcp >= 16 && c.evaluation.hcp <= 17,
    propose: () => contractBid(2, Strain.NOTRUMP),
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
    id: 'R43-jacoby-2nt-opener-shortness',
    priority: 105,
    description: 'After Jacoby 2NT, show shortness with strong hand',
    applies: c => isJacoby2NtContinuation(c) && c.evaluation.hcp >= 15,
    propose: c => {
      if (!c.ownBid) return contractBid(3, Strain.NOTRUMP);
      const trump = c.ownBid.strain;
      for (const suit of SUIT_STRAINS) {
        if (suit === trump) continue;
        if (suitLength(c, suit) <= 1) return contractBid(3, suit);
      }
      return contractBid(3, Strain.NOTRUMP);
    },
  },
  {
    id: 'R44-jacoby-2nt-opener-minimum',
    priority: 104,
    description: 'After Jacoby 2NT, show minimum without shortness',
    applies: c => isJacoby2NtContinuation(c) && c.evaluation.hcp <= 14,
    propose: c => contractBid(3, c.ownBid ? c.ownBid.strain : Strain.HEARTS),
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
      if (c.evaluation.hcp <= 9) return pass();
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
      const level = c.opponentBid && c.opponentBid.level >= 2 ? 2 : 1;
      return contractBid(level, suit);
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
      const level = c.opponentBid && c.opponentBid.level >= 2 ? 3 : 2;
      return contractBid(level, suit);
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
      isSemiOrBalanced(c) &&
      c.evaluation.hcp >= 10 && c.evaluation.hcp <= 12 &&
      !hasFourCardMajor(c) &&
      suitLength(c, Strain.DIAMONDS) <= 3,
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
      !hasFourCardMajor(c) &&
      suitLength(c, Strain.DIAMONDS) <= 3,
    propose: () => contractBid(3, Strain.NOTRUMP),
  },
  {
    id: 'R50d-responder-3nt-after-opener-3d',
    priority: 103,
    description: 'After 1S-2H-3D, bid 3NT with balanced invitational-plus values',
    applies: c => isResponderRebid(c) &&
      !!c.ownBid &&
      !!c.partnerLastBid &&
      c.ownBid.level === 2 &&
      c.ownBid.strain === Strain.HEARTS &&
      c.partnerLastBid.level === 3 &&
      c.partnerLastBid.strain === Strain.DIAMONDS &&
      isSemiOrBalanced(c) &&
      c.evaluation.hcp >= 10,
    propose: () => contractBid(3, Strain.NOTRUMP),
  },
  {
    id: 'R90-natural-pass-competitive',
    priority: 1,
    description: 'Natural pass in competitive auctions when no explicit action applies',
    applies: c => c.phase === 'competitive',
    propose: () => pass(),
  },
  {
    id: 'R91-natural-pass-rebid',
    priority: 1,
    description: 'Natural rebid pass when no explicit continuation applies',
    applies: c => c.phase === 'rebid',
    propose: () => pass(),
  },
  {
    id: 'R92-natural-pass-responding',
    priority: 1,
    description: 'Natural responding pass when no explicit response applies',
    applies: c => c.phase === 'responding',
    propose: () => pass(),
  },
  {
    id: 'R93-emergency-pass',
    priority: 0,
    description: 'Emergency legal pass',
    applies: c => c.phase !== 'passed-out',
    propose: () => pass(),
  },
];

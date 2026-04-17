import { contractBid, dbl, pass, Strain } from '../model/bid.js';
import { Rank } from '../model/card.js';

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
 *   ownBid: import('../model/bid.js').ContractBid | null,
 *   partnerBid: import('../model/bid.js').ContractBid | null,
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

const HONOR_RANKS = new Set([Rank.ACE, Rank.KING, Rank.QUEEN, Rank.JACK, Rank.TEN]);

/**
 * @param {Evaluation} evaluation
 * @returns {boolean}
 */
function isBalanced(evaluation) {
  return evaluation.shapeClass === 'balanced';
}

/**
 * @param {Evaluation} evaluation
 * @returns {Strain}
 */
function bestMajorOpening(evaluation) {
  const spades = evaluation.shape[SHAPE_S];
  const hearts = evaluation.shape[SHAPE_H];
  return spades >= hearts ? Strain.SPADES : Strain.HEARTS;
}

/**
 * @param {Evaluation} evaluation
 * @returns {Strain}
 */
function bestMinorOpening(evaluation) {
  const diamonds = evaluation.shape[SHAPE_D];
  const clubs = evaluation.shape[SHAPE_C];
  if (diamonds === clubs) return diamonds === 3 ? Strain.CLUBS : Strain.DIAMONDS;
  return diamonds > clubs ? Strain.DIAMONDS : Strain.CLUBS;
}

/**
 * @param {RuleContext} context
 * @returns {Strain}
 */
function bestWeakTwoSuit(context) {
  const shape = context.evaluation.shape;
  if (shape[SHAPE_S] === 6) return Strain.SPADES;
  if (shape[SHAPE_H] === 6) return Strain.HEARTS;
  return Strain.DIAMONDS;
}

/**
 * @param {RuleContext} context
 * @returns {Strain}
 */
function bestPreemptSuit(context) {
  const shape = context.evaluation.shape;
  const strains = [Strain.SPADES, Strain.HEARTS, Strain.DIAMONDS, Strain.CLUBS];
  let best = strains[0];
  for (const strain of strains) {
    if (shape[strainIndex(strain)] > shape[strainIndex(best)]) best = strain;
  }
  return best;
}

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
  const suitCards = context.hand.cards.filter(card => card.suit === strain);
  let honors = 0;
  for (const card of suitCards) {
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
 * @returns {Strain}
 */
function bestOneLevelResponseMajor(context) {
  const spades = suitLength(context, Strain.SPADES);
  const hearts = suitLength(context, Strain.HEARTS);
  return spades >= hearts ? Strain.SPADES : Strain.HEARTS;
}

/**
 * @param {RuleContext} context
 * @returns {boolean}
 */
function hasTakeoutShape(context) {
  if (!context.opponentBid || context.opponentBid.strain === Strain.NOTRUMP) return false;
  const oppStrain = context.opponentBid.strain;
  if (suitLength(context, oppStrain) > 2) return false;
  return context.evaluation.shape.some(len => len >= 3);
}

/** @type {Rule[]} */
export const RULES = [
  {
    id: 'R01-open-1nt',
    priority: 100,
    description: 'Open 1NT with 15-17 balanced',
    applies: c => c.phase === 'opening' && c.evaluation.hcp >= 15 && c.evaluation.hcp <= 17 && isBalanced(c.evaluation),
    propose: () => contractBid(1, Strain.NOTRUMP),
  },
  {
    id: 'R02-open-2nt',
    priority: 99,
    description: 'Open 2NT with 20-21 balanced',
    applies: c => c.phase === 'opening' && c.evaluation.hcp >= 20 && c.evaluation.hcp <= 21 && isBalanced(c.evaluation),
    propose: () => contractBid(2, Strain.NOTRUMP),
  },
  {
    id: 'R03-open-2c-strong',
    priority: 98,
    description: 'Open 2C with 22+ points',
    applies: c => c.phase === 'opening' && c.evaluation.hcp >= 22,
    propose: () => contractBid(2, Strain.CLUBS),
  },
  {
    id: 'R04-open-1-major',
    priority: 97,
    description: 'Open longest major with 13+',
    applies: c => c.phase === 'opening' && c.evaluation.hcp >= 13 &&
      (suitLength(c, Strain.SPADES) >= 5 || suitLength(c, Strain.HEARTS) >= 5),
    propose: c => contractBid(1, bestMajorOpening(c.evaluation)),
  },
  {
    id: 'R05-open-1-minor',
    priority: 96,
    description: 'Open best minor with 13+',
    applies: c => c.phase === 'opening' && c.evaluation.hcp >= 13 &&
      suitLength(c, Strain.SPADES) < 5 && suitLength(c, Strain.HEARTS) < 5,
    propose: c => contractBid(1, bestMinorOpening(c.evaluation)),
  },
  {
    id: 'R06-open-weak-two',
    priority: 95,
    description: 'Open weak two with good six-card suit',
    applies: c => c.phase === 'opening' && c.evaluation.hcp >= 6 && c.evaluation.hcp <= 10 &&
      c.seatPosition !== 4 &&
      (suitLength(c, Strain.SPADES) === 6 || suitLength(c, Strain.HEARTS) === 6 || suitLength(c, Strain.DIAMONDS) === 6) &&
      suitHonorCount(c, bestWeakTwoSuit(c)) >= 2,
    propose: c => contractBid(2, bestWeakTwoSuit(c)),
  },
  {
    id: 'R07-open-preempt',
    priority: 94,
    description: 'Open three-level preempt with seven-card suit',
    applies: c => c.phase === 'opening' && c.evaluation.hcp <= 10 && c.seatPosition !== 4 &&
      [Strain.SPADES, Strain.HEARTS, Strain.DIAMONDS, Strain.CLUBS].some(s => suitLength(c, s) >= 7),
    propose: c => contractBid(3, bestPreemptSuit(c)),
  },
  {
    id: 'R08-open-pass',
    priority: 80,
    description: 'Pass when no opening meets requirements',
    applies: c => c.phase === 'opening',
    propose: () => pass(),
  },
  {
    id: 'R09-respond-stayman',
    priority: 93,
    description: 'Use Stayman with 8+ and four-card major',
    applies: c => c.phase === 'responding' && !c.opponentBid &&
      c.partnerBid?.level === 1 && c.partnerBid.strain === Strain.NOTRUMP &&
      c.evaluation.hcp >= 8 && hasFourCardMajor(c),
    propose: () => contractBid(2, Strain.CLUBS),
  },
  {
    id: 'R10-respond-transfer-hearts',
    priority: 94,
    description: 'Transfer to hearts over 1NT',
    applies: c => c.phase === 'responding' && !c.opponentBid &&
      c.partnerBid?.level === 1 && c.partnerBid.strain === Strain.NOTRUMP &&
      suitLength(c, Strain.HEARTS) >= 5,
    propose: () => contractBid(2, Strain.DIAMONDS),
  },
  {
    id: 'R11-respond-transfer-spades',
    priority: 94,
    description: 'Transfer to spades over 1NT',
    applies: c => c.phase === 'responding' && !c.opponentBid &&
      c.partnerBid?.level === 1 && c.partnerBid.strain === Strain.NOTRUMP &&
      suitLength(c, Strain.SPADES) >= 5,
    propose: () => contractBid(2, Strain.HEARTS),
  },
  {
    id: 'R12-respond-1nt-invite',
    priority: 92,
    description: 'Invite with 2NT over partner 1NT',
    applies: c => c.phase === 'responding' && !c.opponentBid &&
      c.partnerBid?.level === 1 && c.partnerBid.strain === Strain.NOTRUMP &&
      c.evaluation.hcp >= 8 && c.evaluation.hcp <= 9 &&
      !hasFourCardMajor(c) && !hasFiveCardMajor(c) && isBalanced(c.evaluation),
    propose: () => contractBid(2, Strain.NOTRUMP),
  },
  {
    id: 'R13-respond-1nt-game',
    priority: 91,
    description: 'Bid 3NT with game values over 1NT',
    applies: c => c.phase === 'responding' && !c.opponentBid &&
      c.partnerBid?.level === 1 && c.partnerBid.strain === Strain.NOTRUMP &&
      c.evaluation.hcp >= 10 && isBalanced(c.evaluation) && !hasFiveCardMajor(c),
    propose: () => contractBid(3, Strain.NOTRUMP),
  },
  {
    id: 'R14-respond-1nt-pass',
    priority: 88,
    description: 'Pass weak hands over 1NT',
    applies: c => c.phase === 'responding' && !c.opponentBid &&
      c.partnerBid?.level === 1 && c.partnerBid.strain === Strain.NOTRUMP &&
      c.evaluation.hcp <= 7 && !hasFiveCardMajor(c),
    propose: () => pass(),
  },
  {
    id: 'R15-respond-single-raise-major',
    priority: 90,
    description: 'Single-raise partner major with support',
    applies: c => c.phase === 'responding' && !c.opponentBid &&
      c.partnerBid?.level === 1 &&
      (c.partnerBid.strain === Strain.HEARTS || c.partnerBid.strain === Strain.SPADES) &&
      suitLength(c, c.partnerBid.strain) >= 3 &&
      c.evaluation.hcp >= 6 && c.evaluation.hcp <= 9,
    propose: c => contractBid(2, c.partnerBid.strain),
  },
  {
    id: 'R16-respond-limit-raise-major',
    priority: 91,
    description: 'Limit-raise partner major with 10-12',
    applies: c => c.phase === 'responding' && !c.opponentBid &&
      c.partnerBid?.level === 1 &&
      (c.partnerBid.strain === Strain.HEARTS || c.partnerBid.strain === Strain.SPADES) &&
      suitLength(c, c.partnerBid.strain) >= 4 &&
      c.evaluation.hcp >= 10 && c.evaluation.hcp <= 12,
    propose: c => contractBid(3, c.partnerBid.strain),
  },
  {
    id: 'R17-respond-jacoby-2nt',
    priority: 92,
    description: 'Jacoby 2NT with 13+ and major fit',
    applies: c => c.phase === 'responding' && !c.opponentBid &&
      c.partnerBid?.level === 1 &&
      (c.partnerBid.strain === Strain.HEARTS || c.partnerBid.strain === Strain.SPADES) &&
      suitLength(c, c.partnerBid.strain) >= 4 &&
      c.evaluation.hcp >= 13,
    propose: () => contractBid(2, Strain.NOTRUMP),
  },
  {
    id: 'R18-respond-new-major-one-level',
    priority: 89,
    description: 'Bid one-level major after minor opening',
    applies: c => c.phase === 'responding' && !c.opponentBid &&
      c.partnerBid?.level === 1 &&
      (c.partnerBid.strain === Strain.CLUBS || c.partnerBid.strain === Strain.DIAMONDS) &&
      c.evaluation.hcp >= 6 &&
      (suitLength(c, Strain.SPADES) >= 4 || suitLength(c, Strain.HEARTS) >= 4),
    propose: c => contractBid(1, bestOneLevelResponseMajor(c)),
  },
  {
    id: 'R19-competitive-takeout-double',
    priority: 87,
    description: 'Direct takeout double with values and shape',
    applies: c => c.phase === 'competitive' && !c.ownBid && !c.partnerBid &&
      !!c.opponentBid && c.opponentBid.level <= 3 &&
      c.evaluation.hcp >= 12 && hasTakeoutShape(c),
    propose: () => dbl(),
  },
  {
    id: 'R20-default-pass',
    priority: 1,
    description: 'Default pass when no higher-priority rule applies',
    applies: c => c.phase !== 'passed-out',
    propose: () => pass(),
  },
];

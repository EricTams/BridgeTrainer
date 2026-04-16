import { createCard, Rank, Suit } from './src/model/card.js';
import { createHand } from './src/model/hand.js';
import {
  addBid,
  contractBid,
  createAuction,
  pass,
  Strain,
} from './src/model/bid.js';
import { evaluate } from './src/engine/evaluate.js';
import { interpretAuctionState } from './src/engine-v2/semantics/interpreter.js';
import { applyForcingConstraints } from './src/engine-v2/constraints/forcing.js';

/**
 * @typedef {import('./src/engine/opening.js').BidRecommendation} BidRecommendation
 */

const DUMMY_HAND = createHand([
  createCard(Suit.SPADES, Rank.ACE),
  createCard(Suit.SPADES, Rank.KING),
  createCard(Suit.SPADES, Rank.QUEEN),
  createCard(Suit.SPADES, Rank.JACK),
  createCard(Suit.HEARTS, Rank.ACE),
  createCard(Suit.HEARTS, Rank.KING),
  createCard(Suit.HEARTS, Rank.QUEEN),
  createCard(Suit.DIAMONDS, Rank.ACE),
  createCard(Suit.DIAMONDS, Rank.KING),
  createCard(Suit.DIAMONDS, Rank.QUEEN),
  createCard(Suit.CLUBS, Rank.ACE),
  createCard(Suit.CLUBS, Rank.KING),
  createCard(Suit.CLUBS, Rank.QUEEN),
]);

/**
 * @param {import('./src/model/bid.js').Bid} bid
 * @param {number} priority
 * @returns {BidRecommendation}
 */
function rec(bid, priority = 10) {
  return { bid, priority, explanation: 'test', penalties: [] };
}

/**
 * @param {string} name
 * @param {boolean} ok
 * @param {string} detail
 * @returns {number}
 */
function report(name, ok, detail) {
  if (ok) {
    console.log(`[PASS] ${name}`);
    return 0;
  }
  console.log(`[FAIL] ${name} :: ${detail}`);
  return 1;
}

let failures = 0;

// Invariant 1: Hard transfer obligation should force class-correct completion.
{
  let a = createAuction('N');
  a = addBid(a, contractBid(1, Strain.NOTRUMP));
  a = addBid(a, pass());
  a = addBid(a, contractBid(2, Strain.DIAMONDS));
  a = addBid(a, pass());

  const m = interpretAuctionState(a, 'N', evaluate(DUMMY_HAND));
  const scored = applyForcingConstraints([
    rec(pass(), 10),
    rec(contractBid(2, Strain.HEARTS), 9),
    rec(contractBid(3, Strain.NOTRUMP), 9.5),
  ], m).sort((x, y) => y.priority - x.priority);

  const top = scored[0].bid;
  const topIsHeart = top.type === 'contract' && top.strain === Strain.HEARTS;
  failures += report(
    'hard transfer completion class gate',
    topIsHeart,
    `expected top to be hearts completion, got ${JSON.stringify(top)}`
  );
}

// Invariant 2: Hard Stayman reply should not allow Pass/2NT as top.
{
  let a = createAuction('N');
  a = addBid(a, contractBid(1, Strain.NOTRUMP));
  a = addBid(a, pass());
  a = addBid(a, contractBid(2, Strain.CLUBS));
  a = addBid(a, pass());

  const m = interpretAuctionState(a, 'N', evaluate(DUMMY_HAND));
  const scored = applyForcingConstraints([
    rec(pass(), 10),
    rec(contractBid(2, Strain.DIAMONDS), 8),
    rec(contractBid(2, Strain.NOTRUMP), 9),
  ], m).sort((x, y) => y.priority - x.priority);

  const top = scored[0].bid;
  const topIsStaymanReply = top.type === 'contract' &&
    top.level === 2 &&
    (top.strain === Strain.DIAMONDS || top.strain === Strain.HEARTS || top.strain === Strain.SPADES);
  failures += report(
    'hard Stayman reply class gate',
    topIsStaymanReply,
    `expected top to be 2D/2H/2S, got ${JSON.stringify(top)}`
  );
}

// Invariant 3: Transfer completion obligation should NOT persist after
// opener already acted and auction advanced.
{
  let a = createAuction('N');
  a = addBid(a, contractBid(1, Strain.NOTRUMP)); // N
  a = addBid(a, pass());                         // E
  a = addBid(a, contractBid(2, Strain.DIAMONDS)); // S transfer
  a = addBid(a, contractBid(2, Strain.SPADES)); // W interference
  a = addBid(a, pass());                         // N
  a = addBid(a, pass());                         // E
  a = addBid(a, contractBid(3, Strain.HEARTS)); // S continuation
  a = addBid(a, pass());                         // W

  const m = interpretAuctionState(a, 'N', evaluate(DUMMY_HAND));
  const hasHardTransfer = m.me.obligations.some(o => o.includes('transfer') && o.includes('hard'));
  failures += report(
    'no stale transfer hard obligation after continuation',
    !hasHardTransfer,
    `unexpected hard transfer obligations still active: ${m.me.obligations.join(',')}`
  );
}

console.log('\nV2 invariant summary');
console.log(`Failures: ${failures}`);
if (failures > 0) process.exit(1);

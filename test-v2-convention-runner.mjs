import { createCard, Rank, Suit } from './src/model/card.js';
import { createHand } from './src/model/hand.js';
import {
  addBid,
  contractBid,
  createAuction,
  currentSeat,
  pass,
  Strain,
} from './src/model/bid.js';
import {
  conventionPackCount,
  getConventionRuleRecommendations,
} from './src/engine-v2/rules/conventions/runner.js';

/**
 * @typedef {import('./src/model/bid.js').Auction} Auction
 * @typedef {import('./src/model/deal.js').Seat} Seat
 * @typedef {import('./src/engine/opening.js').BidRecommendation} BidRecommendation
 */

const STAYMAN_HAND = createHand([
  createCard(Suit.SPADES, Rank.KING),
  createCard(Suit.SPADES, Rank.QUEEN),
  createCard(Suit.SPADES, Rank.FIVE),
  createCard(Suit.HEARTS, Rank.ACE),
  createCard(Suit.HEARTS, Rank.KING),
  createCard(Suit.HEARTS, Rank.QUEEN),
  createCard(Suit.HEARTS, Rank.TEN),
  createCard(Suit.DIAMONDS, Rank.ACE),
  createCard(Suit.DIAMONDS, Rank.KING),
  createCard(Suit.CLUBS, Rank.QUEEN),
  createCard(Suit.CLUBS, Rank.JACK),
  createCard(Suit.CLUBS, Rank.TEN),
  createCard(Suit.CLUBS, Rank.NINE),
]);

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

// Test 1: registry should include both real pack and fallback noop pack.
{
  const count = conventionPackCount();
  failures += report(
    'registry exposes multiple packs',
    count >= 2,
    `expected >=2 packs, got ${count}`,
  );
}

// Test 2: active Stayman window should be served by high-priority NT pack.
{
  let auction = createAuction('N');
  auction = addBid(auction, contractBid(1, Strain.NOTRUMP));
  auction = addBid(auction, pass());
  auction = addBid(auction, contractBid(2, Strain.CLUBS));
  auction = addBid(auction, pass());
  /** @type {Seat} */
  const seat = currentSeat(auction);
  const recs = getConventionRuleRecommendations(STAYMAN_HAND, auction, seat) || [];
  const hasStaymanClass = recs.some(r =>
    r.bid.type === 'contract' &&
    r.bid.level === 2 &&
    (r.bid.strain === Strain.DIAMONDS || r.bid.strain === Strain.HEARTS || r.bid.strain === Strain.SPADES)
  );
  failures += report(
    'priority picks nt pack over fallback',
    hasStaymanClass,
    `missing stayman-class recommendations in active window: ${JSON.stringify(recs[0] || null)}`
  );
}

// Test 3: outside any convention window, dispatcher should return null.
{
  let auction = createAuction('N');
  auction = addBid(auction, contractBid(1, Strain.SPADES));
  auction = addBid(auction, pass());
  /** @type {Seat} */
  const seat = currentSeat(auction);
  const recs = getConventionRuleRecommendations(STAYMAN_HAND, auction, seat) || [];
  failures += report(
    'fallback pack remains no-op on unmatched context',
    recs.length === 0,
    `expected null/no recommendations for unmatched context, got ${JSON.stringify(recs[0] || null)}`
  );
}

console.log('\nV2 convention runner summary');
console.log(`Failures: ${failures}`);
if (failures > 0) process.exit(1);

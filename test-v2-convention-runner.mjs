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
  conventionPackMeta,
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

const STRONG_BALANCED_HAND = createHand([
  createCard(Suit.SPADES, Rank.ACE),
  createCard(Suit.SPADES, Rank.KING),
  createCard(Suit.SPADES, Rank.QUEEN),
  createCard(Suit.HEARTS, Rank.KING),
  createCard(Suit.HEARTS, Rank.JACK),
  createCard(Suit.HEARTS, Rank.NINE),
  createCard(Suit.DIAMONDS, Rank.ACE),
  createCard(Suit.DIAMONDS, Rank.KING),
  createCard(Suit.DIAMONDS, Rank.TEN),
  createCard(Suit.CLUBS, Rank.ACE),
  createCard(Suit.CLUBS, Rank.QUEEN),
  createCard(Suit.CLUBS, Rank.JACK),
  createCard(Suit.CLUBS, Rank.EIGHT),
]);

const WEAK_BALANCED_HAND = createHand([
  createCard(Suit.SPADES, Rank.QUEEN),
  createCard(Suit.SPADES, Rank.JACK),
  createCard(Suit.SPADES, Rank.TEN),
  createCard(Suit.HEARTS, Rank.JACK),
  createCard(Suit.HEARTS, Rank.TEN),
  createCard(Suit.HEARTS, Rank.NINE),
  createCard(Suit.DIAMONDS, Rank.KING),
  createCard(Suit.DIAMONDS, Rank.QUEEN),
  createCard(Suit.DIAMONDS, Rank.TEN),
  createCard(Suit.CLUBS, Rank.KING),
  createCard(Suit.CLUBS, Rank.JACK),
  createCard(Suit.CLUBS, Rank.NINE),
  createCard(Suit.CLUBS, Rank.EIGHT),
]);

const STRONG_TAKEOUT_SHAPE_HAND = createHand([
  createCard(Suit.SPADES, Rank.ACE),
  createCard(Suit.SPADES, Rank.KING),
  createCard(Suit.SPADES, Rank.JACK),
  createCard(Suit.SPADES, Rank.NINE),
  createCard(Suit.HEARTS, Rank.ACE),
  createCard(Suit.HEARTS, Rank.QUEEN),
  createCard(Suit.HEARTS, Rank.TEN),
  createCard(Suit.DIAMONDS, Rank.KING),
  createCard(Suit.DIAMONDS, Rank.JACK),
  createCard(Suit.DIAMONDS, Rank.FIVE),
  createCard(Suit.CLUBS, Rank.THREE),
  createCard(Suit.CLUBS, Rank.TWO),
  createCard(Suit.CLUBS, Rank.FOUR),
]);

const NONCLASSIC_TAKEOUT_SHAPE_HAND = createHand([
  createCard(Suit.SPADES, Rank.ACE),
  createCard(Suit.SPADES, Rank.KING),
  createCard(Suit.SPADES, Rank.NINE),
  createCard(Suit.SPADES, Rank.EIGHT),
  createCard(Suit.HEARTS, Rank.KING),
  createCard(Suit.HEARTS, Rank.QUEEN),
  createCard(Suit.HEARTS, Rank.JACK),
  createCard(Suit.HEARTS, Rank.THREE),
  createCard(Suit.DIAMONDS, Rank.SEVEN),
  createCard(Suit.DIAMONDS, Rank.TWO),
  createCard(Suit.CLUBS, Rank.EIGHT),
  createCard(Suit.CLUBS, Rank.FIVE),
  createCard(Suit.CLUBS, Rank.FOUR),
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
  const meta = conventionPackMeta();
  const hasCompetitivePack = meta.some(m => m.id === 'competitive-nt-penalty-double');
  const hasSuitTakeoutPack = meta.some(m => m.id === 'competitive-suit-takeout-double');
  failures += report(
    'registry exposes multiple packs',
    count >= 4 && hasCompetitivePack && hasSuitTakeoutPack,
    `expected >=4 packs and competitive packs present, got count=${count} meta=${JSON.stringify(meta)}`,
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

// Test 4: in direct competitive vs 1NT with strong values, pack should prefer penalty double.
{
  let auction = createAuction('S');
  auction = addBid(auction, pass()); // S
  auction = addBid(auction, contractBid(1, Strain.NOTRUMP)); // W
  /** @type {Seat} */
  const seat = currentSeat(auction); // N to act (direct competitive)
  const recs = getConventionRuleRecommendations(STRONG_BALANCED_HAND, auction, seat) || [];
  const top = recs[0] || null;
  const topIsPenaltyDouble = !!top && top.bid.type === 'double';
  failures += report(
    'competitive nt penalty-double pack recommends double',
    topIsPenaltyDouble,
    `expected top recommendation double, got ${JSON.stringify(top)}`,
  );
}

// Test 5: same window with weaker hand should not trigger penalty-double pack.
{
  let auction = createAuction('S');
  auction = addBid(auction, pass()); // S
  auction = addBid(auction, contractBid(1, Strain.NOTRUMP)); // W
  /** @type {Seat} */
  const seat = currentSeat(auction); // N to act (direct competitive)
  const recs = getConventionRuleRecommendations(WEAK_BALANCED_HAND, auction, seat);
  failures += report(
    'competitive nt penalty-double pack is gated by values',
    recs === null,
    `expected null for weak hand in same window, got ${JSON.stringify(recs)}`,
  );
}

// Test 6: direct competitive vs suit opening with takeout shape should prefer double.
{
  let auction = createAuction('S');
  auction = addBid(auction, pass()); // S
  auction = addBid(auction, contractBid(1, Strain.HEARTS)); // W
  /** @type {Seat} */
  const seat = currentSeat(auction); // N to act
  const recs = getConventionRuleRecommendations(STRONG_TAKEOUT_SHAPE_HAND, auction, seat) || [];
  const top = recs[0] || null;
  const topIsTakeoutDouble = !!top && top.bid.type === 'double';
  failures += report(
    'competitive suit takeout pack recommends double',
    topIsTakeoutDouble,
    `expected top recommendation double, got ${JSON.stringify(top)}`,
  );
}

// Test 7: with non-classic shape below strong threshold, suit takeout pack should not trigger.
{
  let auction = createAuction('S');
  auction = addBid(auction, pass()); // S
  auction = addBid(auction, contractBid(1, Strain.HEARTS)); // W
  /** @type {Seat} */
  const seat = currentSeat(auction); // N to act
  const recs = getConventionRuleRecommendations(NONCLASSIC_TAKEOUT_SHAPE_HAND, auction, seat);
  failures += report(
    'competitive suit takeout pack is shape-gated',
    recs === null,
    `expected null for non-classic shape, got ${JSON.stringify(recs)}`,
  );
}

console.log('\nV2 convention runner summary');
console.log(`Failures: ${failures}`);
if (failures > 0) process.exit(1);

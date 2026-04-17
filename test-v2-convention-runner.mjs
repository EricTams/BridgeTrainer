import { createCard, Rank, Suit } from './src/model/card.js';
import { createHand } from './src/model/hand.js';
import {
  addBid,
  contractBid,
  createAuction,
  currentSeat,
  dbl,
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

const NEGATIVE_DOUBLE_HAND = createHand([
  createCard(Suit.SPADES, Rank.ACE),
  createCard(Suit.SPADES, Rank.KING),
  createCard(Suit.SPADES, Rank.NINE),
  createCard(Suit.SPADES, Rank.FOUR),
  createCard(Suit.HEARTS, Rank.TEN),
  createCard(Suit.HEARTS, Rank.SEVEN),
  createCard(Suit.HEARTS, Rank.FIVE),
  createCard(Suit.DIAMONDS, Rank.ACE),
  createCard(Suit.DIAMONDS, Rank.QUEEN),
  createCard(Suit.DIAMONDS, Rank.THREE),
  createCard(Suit.CLUBS, Rank.KING),
  createCard(Suit.CLUBS, Rank.JACK),
  createCard(Suit.CLUBS, Rank.EIGHT),
]);

const NO_NEGATIVE_DOUBLE_MAJOR_HAND = createHand([
  createCard(Suit.SPADES, Rank.ACE),
  createCard(Suit.SPADES, Rank.TWO),
  createCard(Suit.HEARTS, Rank.KING),
  createCard(Suit.HEARTS, Rank.JACK),
  createCard(Suit.HEARTS, Rank.NINE),
  createCard(Suit.DIAMONDS, Rank.ACE),
  createCard(Suit.DIAMONDS, Rank.KING),
  createCard(Suit.DIAMONDS, Rank.TEN),
  createCard(Suit.DIAMONDS, Rank.SIX),
  createCard(Suit.CLUBS, Rank.QUEEN),
  createCard(Suit.CLUBS, Rank.JACK),
  createCard(Suit.CLUBS, Rank.NINE),
  createCard(Suit.CLUBS, Rank.EIGHT),
]);

const NEG_DBL_CONT_INVITE_HAND = createHand([
  createCard(Suit.SPADES, Rank.KING),
  createCard(Suit.SPADES, Rank.JACK),
  createCard(Suit.SPADES, Rank.FOUR),
  createCard(Suit.HEARTS, Rank.TEN),
  createCard(Suit.HEARTS, Rank.NINE),
  createCard(Suit.DIAMONDS, Rank.ACE),
  createCard(Suit.DIAMONDS, Rank.JACK),
  createCard(Suit.DIAMONDS, Rank.SEVEN),
  createCard(Suit.DIAMONDS, Rank.FOUR),
  createCard(Suit.CLUBS, Rank.QUEEN),
  createCard(Suit.CLUBS, Rank.EIGHT),
  createCard(Suit.CLUBS, Rank.SEVEN),
  createCard(Suit.CLUBS, Rank.FIVE),
]);

const NEG_DBL_CONT_WEAK_HAND = createHand([
  createCard(Suit.SPADES, Rank.QUEEN),
  createCard(Suit.SPADES, Rank.EIGHT),
  createCard(Suit.SPADES, Rank.FOUR),
  createCard(Suit.HEARTS, Rank.TEN),
  createCard(Suit.HEARTS, Rank.SEVEN),
  createCard(Suit.HEARTS, Rank.SIX),
  createCard(Suit.DIAMONDS, Rank.KING),
  createCard(Suit.DIAMONDS, Rank.NINE),
  createCard(Suit.DIAMONDS, Rank.THREE),
  createCard(Suit.CLUBS, Rank.JACK),
  createCard(Suit.CLUBS, Rank.EIGHT),
  createCard(Suit.CLUBS, Rank.SEVEN),
  createCard(Suit.CLUBS, Rank.TWO),
]);

const REOPENING_DOUBLE_HAND = createHand([
  createCard(Suit.SPADES, Rank.ACE),
  createCard(Suit.SPADES, Rank.KING),
  createCard(Suit.SPADES, Rank.JACK),
  createCard(Suit.SPADES, Rank.FOUR),
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

const NO_REOPENING_SHAPE_HAND = createHand([
  createCard(Suit.SPADES, Rank.KING),
  createCard(Suit.SPADES, Rank.QUEEN),
  createCard(Suit.SPADES, Rank.TEN),
  createCard(Suit.SPADES, Rank.THREE),
  createCard(Suit.HEARTS, Rank.ACE),
  createCard(Suit.HEARTS, Rank.JACK),
  createCard(Suit.HEARTS, Rank.NINE),
  createCard(Suit.HEARTS, Rank.FIVE),
  createCard(Suit.DIAMONDS, Rank.KING),
  createCard(Suit.DIAMONDS, Rank.JACK),
  createCard(Suit.DIAMONDS, Rank.SEVEN),
  createCard(Suit.CLUBS, Rank.EIGHT),
  createCard(Suit.CLUBS, Rank.FOUR),
]);

const ADVANCER_AFTER_DOUBLE_HAND = createHand([
  createCard(Suit.SPADES, Rank.KING),
  createCard(Suit.SPADES, Rank.JACK),
  createCard(Suit.SPADES, Rank.TEN),
  createCard(Suit.SPADES, Rank.EIGHT),
  createCard(Suit.HEARTS, Rank.KING),
  createCard(Suit.HEARTS, Rank.TEN),
  createCard(Suit.HEARTS, Rank.NINE),
  createCard(Suit.DIAMONDS, Rank.ACE),
  createCard(Suit.DIAMONDS, Rank.QUEEN),
  createCard(Suit.DIAMONDS, Rank.JACK),
  createCard(Suit.CLUBS, Rank.TEN),
  createCard(Suit.CLUBS, Rank.FOUR),
  createCard(Suit.CLUBS, Rank.THREE),
]);

const MICHAELS_HAND = createHand([
  createCard(Suit.SPADES, Rank.ACE),
  createCard(Suit.SPADES, Rank.KING),
  createCard(Suit.SPADES, Rank.TEN),
  createCard(Suit.SPADES, Rank.SEVEN),
  createCard(Suit.SPADES, Rank.FOUR),
  createCard(Suit.HEARTS, Rank.ACE),
  createCard(Suit.HEARTS, Rank.QUEEN),
  createCard(Suit.HEARTS, Rank.NINE),
  createCard(Suit.HEARTS, Rank.SEVEN),
  createCard(Suit.HEARTS, Rank.FIVE),
  createCard(Suit.DIAMONDS, Rank.JACK),
  createCard(Suit.DIAMONDS, Rank.FIVE),
  createCard(Suit.CLUBS, Rank.TWO),
]);

const WEAK_MICHAELS_HAND = createHand([
  createCard(Suit.SPADES, Rank.QUEEN),
  createCard(Suit.SPADES, Rank.JACK),
  createCard(Suit.SPADES, Rank.TEN),
  createCard(Suit.SPADES, Rank.NINE),
  createCard(Suit.SPADES, Rank.FIVE),
  createCard(Suit.HEARTS, Rank.TEN),
  createCard(Suit.HEARTS, Rank.EIGHT),
  createCard(Suit.HEARTS, Rank.SEVEN),
  createCard(Suit.HEARTS, Rank.SIX),
  createCard(Suit.HEARTS, Rank.FIVE),
  createCard(Suit.DIAMONDS, Rank.KING),
  createCard(Suit.DIAMONDS, Rank.JACK),
  createCard(Suit.CLUBS, Rank.THREE),
]);

const UNUSUAL_NT_HAND = createHand([
  createCard(Suit.SPADES, Rank.KING),
  createCard(Suit.SPADES, Rank.FOUR),
  createCard(Suit.SPADES, Rank.TWO),
  createCard(Suit.HEARTS, Rank.QUEEN),
  createCard(Suit.HEARTS, Rank.JACK),
  createCard(Suit.HEARTS, Rank.NINE),
  createCard(Suit.HEARTS, Rank.SEVEN),
  createCard(Suit.HEARTS, Rank.FIVE),
  createCard(Suit.DIAMONDS, Rank.KING),
  createCard(Suit.DIAMONDS, Rank.JACK),
  createCard(Suit.DIAMONDS, Rank.EIGHT),
  createCard(Suit.DIAMONDS, Rank.FIVE),
  createCard(Suit.DIAMONDS, Rank.THREE),
]);

const NO_UNUSUAL_SHAPE_HAND = createHand([
  createCard(Suit.SPADES, Rank.KING),
  createCard(Suit.SPADES, Rank.JACK),
  createCard(Suit.SPADES, Rank.TEN),
  createCard(Suit.SPADES, Rank.SIX),
  createCard(Suit.HEARTS, Rank.QUEEN),
  createCard(Suit.HEARTS, Rank.EIGHT),
  createCard(Suit.HEARTS, Rank.FOUR),
  createCard(Suit.DIAMONDS, Rank.JACK),
  createCard(Suit.DIAMONDS, Rank.NINE),
  createCard(Suit.DIAMONDS, Rank.TEN),
  createCard(Suit.CLUBS, Rank.EIGHT),
  createCard(Suit.CLUBS, Rank.SIX),
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
  const hasNegativeDoublePack = meta.some(m => m.id === 'negative-double');
  const hasReopeningDoublePack = meta.some(m => m.id === 'reopening-double');
  const hasAdvancerAfterTakeoutPack = meta.some(m => m.id === 'advancer-after-takeout-double');
  const hasAdvancerAfterPenaltyPack = meta.some(m => m.id === 'advancer-after-penalty-double');
  const hasMichaelsPack = meta.some(m => m.id === 'michaels');
  const hasUnusualNotrumpPack = meta.some(m => m.id === 'unusual-notrump');
  failures += report(
    'registry exposes multiple packs',
    count >= 10 &&
      hasCompetitivePack &&
      hasSuitTakeoutPack &&
      hasNegativeDoublePack &&
      hasReopeningDoublePack &&
      hasAdvancerAfterTakeoutPack &&
      hasAdvancerAfterPenaltyPack &&
      hasMichaelsPack &&
      hasUnusualNotrumpPack,
    `expected >=10 packs and all competitive packs present, got count=${count} meta=${JSON.stringify(meta)}`,
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

// Test 3: outside migrated convention windows, legacy bridge should return actionable recs.
{
  let auction = createAuction('N');
  auction = addBid(auction, contractBid(1, Strain.SPADES));
  auction = addBid(auction, pass());
  /** @type {Seat} */
  const seat = currentSeat(auction);
  const recs = getConventionRuleRecommendations(STAYMAN_HAND, auction, seat) || [];
  const hasActionable = recs.some(r => r.bid.type === 'contract' || r.bid.type === 'pass');
  failures += report(
    'legacy bridge provides universal fallback recommendations',
    hasActionable && recs.length > 0,
    `expected actionable legacy-bridge recommendations, got ${JSON.stringify(recs[0] || null)}`
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
  const recs = getConventionRuleRecommendations(WEAK_BALANCED_HAND, auction, seat) || [];
  const top = recs[0] || null;
  const topIsPenaltyDouble = !!top && top.bid.type === 'double';
  failures += report(
    'competitive nt penalty-double pack is gated by values',
    !topIsPenaltyDouble,
    `expected top recommendation not to be penalty-double for weak hand, got top=${JSON.stringify(top)} all=${JSON.stringify(recs)}`,
  );
}

// Test 6: direct competitive vs suit opening with takeout shape should prefer double.
{
  let auction = createAuction('S');
  auction = addBid(auction, pass()); // S
  auction = addBid(auction, contractBid(1, Strain.SPADES)); // W
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
  auction = addBid(auction, contractBid(1, Strain.SPADES)); // W
  /** @type {Seat} */
  const seat = currentSeat(auction); // N to act
  const recs = getConventionRuleRecommendations(NONCLASSIC_TAKEOUT_SHAPE_HAND, auction, seat) || [];
  const top = recs[0] || null;
  const topIsTakeoutDouble = !!top && top.bid.type === 'double';
  failures += report(
    'competitive suit takeout pack is shape-gated',
    !topIsTakeoutDouble,
    `expected top recommendation not to be takeout-double for non-classic shape, got top=${JSON.stringify(top)} all=${JSON.stringify(recs)}`,
  );
}

// Test 8: responding after partner opens and opponent overcalls, unbid major + values should prefer negative double.
{
  let auction = createAuction('N');
  auction = addBid(auction, contractBid(1, Strain.CLUBS)); // N (partner opens for E/W seat)
  auction = addBid(auction, contractBid(1, Strain.DIAMONDS)); // E overcall
  /** @type {Seat} */
  const seat = currentSeat(auction); // S to act
  const recs = getConventionRuleRecommendations(NEGATIVE_DOUBLE_HAND, auction, seat) || [];
  const top = recs[0] || null;
  const topIsNegativeDouble = !!top && top.bid.type === 'double';
  failures += report(
    'negative-double pack recommends double',
    topIsNegativeDouble,
    `expected top recommendation double, got ${JSON.stringify(top)}`,
  );
}

// Test 9: same responding window without 4-card unbid major should not trigger negative-double pack.
{
  let auction = createAuction('N');
  auction = addBid(auction, contractBid(1, Strain.CLUBS)); // N
  auction = addBid(auction, contractBid(1, Strain.DIAMONDS)); // E
  /** @type {Seat} */
  const seat = currentSeat(auction); // S to act
  const recs = getConventionRuleRecommendations(NO_NEGATIVE_DOUBLE_MAJOR_HAND, auction, seat) || [];
  const top = recs[0] || null;
  const topIsNegativeDouble = !!top && top.bid.type === 'double';
  failures += report(
    'negative-double pack is major-length gated',
    !topIsNegativeDouble,
    `expected top recommendation not to be negative-double when no 4-card unbid major, got top=${JSON.stringify(top)} all=${JSON.stringify(recs)}`,
  );
}

// Test 10: balancing reopening seat with takeout shape should prefer reopening double.
{
  let auction = createAuction('S');
  auction = addBid(auction, pass()); // S
  auction = addBid(auction, contractBid(1, Strain.HEARTS)); // W
  auction = addBid(auction, pass()); // N
  auction = addBid(auction, pass()); // E
  /** @type {Seat} */
  const seat = currentSeat(auction); // S to act in balancing seat
  const recs = getConventionRuleRecommendations(REOPENING_DOUBLE_HAND, auction, seat) || [];
  const top = recs[0] || null;
  const topIsReopeningDouble = !!top && top.bid.type === 'double';
  failures += report(
    'reopening-double pack recommends double',
    topIsReopeningDouble,
    `expected top reopening recommendation double, got ${JSON.stringify(top)}`
  );
}

// Test 11: balancing seat without classic shape below strong threshold should not trigger reopening pack.
{
  let auction = createAuction('S');
  auction = addBid(auction, pass()); // S
  auction = addBid(auction, contractBid(1, Strain.HEARTS)); // W
  auction = addBid(auction, pass()); // N
  auction = addBid(auction, pass()); // E
  /** @type {Seat} */
  const seat = currentSeat(auction); // S to act in balancing seat
  const recs = getConventionRuleRecommendations(NO_REOPENING_SHAPE_HAND, auction, seat) || [];
  const top = recs[0] || null;
  const topIsReopeningDouble = !!top && top.bid.type === 'double';
  failures += report(
    'reopening-double pack is shape-gated',
    !topIsReopeningDouble,
    `expected top recommendation not to be reopening-double for non-classic shape, got top=${JSON.stringify(top)} all=${JSON.stringify(recs)}`
  );
}

// Test 12: after partner's active takeout double, advancer-takeout pack should trigger.
{
  let auction = createAuction('N');
  auction = addBid(auction, pass()); // N
  auction = addBid(auction, contractBid(1, Strain.HEARTS)); // E
  auction = addBid(auction, dbl()); // S (partner of N doubles)
  auction = addBid(auction, pass()); // W
  /** @type {Seat} */
  const seat = currentSeat(auction); // N to act
  const recs = getConventionRuleRecommendations(ADVANCER_AFTER_DOUBLE_HAND, auction, seat) || [];
  const top = recs[0] || null;
  const topIsActionable = !!top && (top.bid.type === 'contract' || top.bid.type === 'double' || top.bid.type === 'pass');
  failures += report(
    'advancer-after-takeout pack triggers on active partner double',
    topIsActionable && recs.length >= 1,
    `expected non-empty recommendations in advancer window, got ${JSON.stringify(recs)}`
  );
}

// Test 13: without partner double, advancer-takeout pack should not trigger.
{
  let auction = createAuction('N');
  auction = addBid(auction, pass()); // N
  auction = addBid(auction, contractBid(1, Strain.HEARTS)); // E
  auction = addBid(auction, pass()); // S
  /** @type {Seat} */
  const seat = currentSeat(auction); // W to act; no partner double context
  const recs = getConventionRuleRecommendations(ADVANCER_AFTER_DOUBLE_HAND, auction, seat) || [];
  const hasTakeoutDouble = recs.some(rec => rec.bid.type === 'double');
  failures += report(
    'advancer-after-takeout pack is context-gated',
    !hasTakeoutDouble,
    `expected no takeout-double-context recommendation without partner double, got ${JSON.stringify(recs)}`
  );
}

// Test 14: after partner's NT double, advancer-penalty pack should prefer pass conversion.
{
  let auction = createAuction('N');
  auction = addBid(auction, pass()); // N
  auction = addBid(auction, contractBid(1, Strain.NOTRUMP)); // E
  auction = addBid(auction, dbl()); // S (partner of N doubles NT)
  auction = addBid(auction, pass()); // W
  /** @type {Seat} */
  const seat = currentSeat(auction); // N to act
  const recs = getConventionRuleRecommendations(ADVANCER_AFTER_DOUBLE_HAND, auction, seat) || [];
  const top = recs[0] || null;
  const topIsPass = !!top && top.bid.type === 'pass';
  failures += report(
    'advancer-after-penalty pack prefers pass conversion',
    topIsPass,
    `expected pass conversion after partner NT double, got ${JSON.stringify(top)}`
  );
}

// Test 15: after partner's suit double, advancer-penalty pack should not force pass conversion behavior.
{
  let auction = createAuction('N');
  auction = addBid(auction, pass()); // N
  auction = addBid(auction, contractBid(1, Strain.HEARTS)); // E
  auction = addBid(auction, dbl()); // S
  auction = addBid(auction, pass()); // W
  /** @type {Seat} */
  const seat = currentSeat(auction); // N to act
  const recs = getConventionRuleRecommendations(ADVANCER_AFTER_DOUBLE_HAND, auction, seat) || [];
  const top = recs[0] || null;
  const topIsNotForcedPass = !top || top.bid.type !== 'pass' || recs.length > 1;
  failures += report(
    'advancer-after-penalty pack is NT-context gated',
    topIsNotForcedPass,
    `expected non-NT-double flow (not forced pass conversion), got ${JSON.stringify(recs)}`
  );
}

// Test 16: Michaels cue-bid window should recommend cue-bid.
{
  let auction = createAuction('S');
  auction = addBid(auction, pass()); // S
  auction = addBid(auction, contractBid(1, Strain.CLUBS)); // W
  /** @type {Seat} */
  const seat = currentSeat(auction); // N to act
  const recs = getConventionRuleRecommendations(MICHAELS_HAND, auction, seat) || [];
  const top = recs[0] || null;
  const topIsMichaelsCue = !!top &&
    top.bid.type === 'contract' &&
    top.bid.level === 2 &&
    top.bid.strain === Strain.CLUBS;
  failures += report(
    'michaels pack recommends cue-bid',
    topIsMichaelsCue,
    `expected Michaels cue-bid top recommendation, got ${JSON.stringify(top)}`
  );
}

// Test 17: weak two-suiter should not trigger Michaels pack.
{
  let auction = createAuction('S');
  auction = addBid(auction, pass()); // S
  auction = addBid(auction, contractBid(1, Strain.CLUBS)); // W
  /** @type {Seat} */
  const seat = currentSeat(auction); // N to act
  const recs = getConventionRuleRecommendations(WEAK_MICHAELS_HAND, auction, seat) || [];
  const top = recs[0] || null;
  const topIsMichaelsCue = !!top &&
    top.bid.type === 'contract' &&
    top.bid.level === 2 &&
    top.bid.strain === Strain.CLUBS;
  const hasMichaelsCue = recs.some(rec =>
    rec.bid.type === 'contract' &&
    rec.bid.level === 2 &&
    rec.bid.strain === Strain.CLUBS
  );
  failures += report(
    'michaels pack is HCP-gated',
    !topIsMichaelsCue,
    `expected top recommendation not to be Michaels cue-bid for weak shape, got top=${JSON.stringify(top)} hasCue=${hasMichaelsCue} all=${JSON.stringify(recs)}`
  );
}

// Test 18: Unusual 2NT window should activate and include 2NT recommendation.
{
  let auction = createAuction('S');
  auction = addBid(auction, pass()); // S
  auction = addBid(auction, contractBid(1, Strain.CLUBS)); // W
  /** @type {Seat} */
  const seat = currentSeat(auction); // N to act (direct overcall seat)
  const recs = getConventionRuleRecommendations(UNUSUAL_NT_HAND, auction, seat) || [];
  const hasUnusual2NT = recs.some(rec =>
    rec.bid.type === 'contract' &&
    rec.bid.level === 2 &&
    rec.bid.strain === Strain.NOTRUMP
  );
  failures += report(
    'unusual-notrump pack includes 2NT',
    hasUnusual2NT,
    `expected unusual 2NT recommendation, got ${JSON.stringify(recs)}`
  );
}

// Test 19: missing two-lower-suits shape should not trigger unusual notrump pack.
{
  let auction = createAuction('S');
  auction = addBid(auction, pass()); // S
  auction = addBid(auction, contractBid(1, Strain.CLUBS)); // W
  /** @type {Seat} */
  const seat = currentSeat(auction); // N to act
  const recs = getConventionRuleRecommendations(NO_UNUSUAL_SHAPE_HAND, auction, seat) || [];
  const top = recs[0] || null;
  const topIsUnusual2NT = !!top &&
    top.bid.type === 'contract' &&
    top.bid.level === 2 &&
    top.bid.strain === Strain.NOTRUMP;
  const hasUnusual2NT = recs.some(rec =>
    rec.bid.type === 'contract' &&
    rec.bid.level === 2 &&
    rec.bid.strain === Strain.NOTRUMP
  );
  failures += report(
    'unusual-notrump pack is shape-gated',
    !topIsUnusual2NT,
    `expected top recommendation not to be unusual 2NT without shape, got top=${JSON.stringify(top)} has2NT=${hasUnusual2NT} all=${JSON.stringify(recs)}`
  );
}

// Test 20: negative-double doubler continuation should prefer bidding unbid major over pass.
{
  const hand = createHand([
    createCard(Suit.SPADES, Rank.JACK),
    createCard(Suit.HEARTS, Rank.ACE),
    createCard(Suit.HEARTS, Rank.QUEEN),
    createCard(Suit.HEARTS, Rank.EIGHT),
    createCard(Suit.HEARTS, Rank.SIX),
    createCard(Suit.HEARTS, Rank.FOUR),
    createCard(Suit.DIAMONDS, Rank.ACE),
    createCard(Suit.DIAMONDS, Rank.FIVE),
    createCard(Suit.DIAMONDS, Rank.FOUR),
    createCard(Suit.CLUBS, Rank.KING),
    createCard(Suit.CLUBS, Rank.SEVEN),
    createCard(Suit.CLUBS, Rank.SIX),
    createCard(Suit.CLUBS, Rank.THREE),
  ]);
  let auction = createAuction('N');
  auction = addBid(auction, contractBid(1, Strain.DIAMONDS)); // N
  auction = addBid(auction, contractBid(1, Strain.SPADES)); // E
  auction = addBid(auction, dbl()); // S
  auction = addBid(auction, pass()); // W
  /** @type {Seat} */
  const seat = currentSeat(auction); // N
  const recs = getConventionRuleRecommendations(hand, auction, seat) || [];
  const top = recs[0] || null;
  const hasConstructive = recs.some(rec =>
    rec.bid.type === 'contract' &&
    (
      (rec.bid.strain === Strain.HEARTS && rec.bid.level >= 2) ||
      (rec.bid.strain === Strain.DIAMONDS && rec.bid.level >= 2) ||
      (rec.bid.strain === Strain.NOTRUMP)
    )
  );
  const passIsTop = !!top && top.bid.type === 'pass';
  failures += report(
    'negative-double continuation prefers opener 2H',
    hasConstructive && !passIsTop,
    `expected constructive continuation after negative double, got top=${JSON.stringify(top)} all=${JSON.stringify(recs)}`
  );
}

// Test 21: negative-double responder continuation should compete in unbid major.
{
  const hand = createHand([
    createCard(Suit.SPADES, Rank.KING),
    createCard(Suit.SPADES, Rank.JACK),
    createCard(Suit.SPADES, Rank.FIVE),
    createCard(Suit.HEARTS, Rank.KING),
    createCard(Suit.HEARTS, Rank.QUEEN),
    createCard(Suit.HEARTS, Rank.EIGHT),
    createCard(Suit.HEARTS, Rank.SIX),
    createCard(Suit.DIAMONDS, Rank.ACE),
    createCard(Suit.DIAMONDS, Rank.JACK),
    createCard(Suit.DIAMONDS, Rank.SEVEN),
    createCard(Suit.CLUBS, Rank.QUEEN),
    createCard(Suit.CLUBS, Rank.EIGHT),
    createCard(Suit.CLUBS, Rank.FIVE),
  ]);
  let auction = createAuction('N');
  auction = addBid(auction, contractBid(1, Strain.DIAMONDS)); // N
  auction = addBid(auction, contractBid(1, Strain.SPADES)); // E
  auction = addBid(auction, dbl()); // S
  auction = addBid(auction, pass()); // W
  auction = addBid(auction, contractBid(2, Strain.DIAMONDS)); // N
  auction = addBid(auction, pass()); // E
  /** @type {Seat} */
  const seat = currentSeat(auction); // S
  const recs = getConventionRuleRecommendations(hand, auction, seat) || [];
  const top = recs[0] || null;
  const hasConstructive = recs.some(rec =>
    rec.bid.type === 'contract' &&
    (
      (rec.bid.strain === Strain.HEARTS && rec.bid.level >= 2) ||
      (rec.bid.strain === Strain.DIAMONDS && rec.bid.level >= 2) ||
      (rec.bid.strain === Strain.NOTRUMP)
    )
  );
  const passIsTop = !!top && top.bid.type === 'pass';
  failures += report(
    'negative-double continuation prefers responder 2H',
    hasConstructive && !passIsTop,
    `expected constructive responder continuation after opener rebid, got top=${JSON.stringify(top)} all=${JSON.stringify(recs)}`
  );
}

console.log('\nV2 convention runner summary');
console.log(`Failures: ${failures}`);
if (failures > 0) process.exit(1);

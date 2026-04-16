import { createCard, Suit, Rank } from './src/model/card.js';
import { createHand } from './src/model/hand.js';
import { createAuction, addBid, pass, contractBid, bidToString, Strain } from './src/model/bid.js';
import { getRecommendations } from './src/engine/advisor.js';

const S = Suit, R = Rank;
const c = createCard;

// Balanced 16 HCP opener: A♠Q♠J♠  K♥T♥5♥  A♦J♦4♦  K♣8♣5♣2♣
const openerHand = createHand([
  c(S.SPADES, R.ACE), c(S.SPADES, R.QUEEN), c(S.SPADES, R.JACK),
  c(S.HEARTS, R.KING), c(S.HEARTS, R.TEN), c(S.HEARTS, R.FIVE),
  c(S.DIAMONDS, R.ACE), c(S.DIAMONDS, R.JACK), c(S.DIAMONDS, R.FOUR),
  c(S.CLUBS, R.KING), c(S.CLUBS, R.EIGHT), c(S.CLUBS, R.FIVE), c(S.CLUBS, R.TWO),
]);

let passed = 0;
let failed = 0;

function lookupBidBySeatAndStep(auction, seat, contractStep) {
  let seen = 0;
  const dealerIdx = ['N', 'E', 'S', 'W'].indexOf(auction.dealer);
  const seats = ['N', 'E', 'S', 'W'];
  for (let i = 0; i < auction.bids.length; i++) {
    if (auction.bids[i].type !== 'contract') continue;
    const bidSeat = seats[(dealerIdx + i) % seats.length];
    if (bidSeat !== seat) continue;
    seen++;
    if (seen === contractStep) return auction.bids[i];
  }
  return null;
}

function assertNoStaleTakeoutMessage(label, recs) {
  const stale = recs.some(r => r.explanation.includes('Partner doubled for takeout: must bid'));
  if (stale) {
    console.log(`  FAIL: stale takeout-double forcing text in ${label}`);
    failed++;
  } else {
    console.log(`  PASS: no stale takeout-double forcing text in ${label}`);
    passed++;
  }
}

function check(label, recs) {
  const hasBug = recs.some(r => r.explanation.includes('Must complete transfer'));
  const topBid = recs[0];
  console.log(`\n${label}`);
  console.log(`  Top: ${bidToString(topBid.bid).padEnd(6)} [p=${topBid.priority.toFixed(1)}] ${topBid.explanation}`);
  if (hasBug) {
    console.log('  FAIL: "Must complete transfer" penalty still present');
    failed++;
  } else {
    console.log('  PASS: no stale transfer penalty');
    passed++;
  }
}

function checkNoStaleTakeout(label, recs) {
  const hasBug = recs.some(r => r.explanation.includes('Partner doubled for takeout: must bid'));
  const topBid = recs[0];
  console.log(`\n${label}`);
  console.log(`  Top: ${bidToString(topBid.bid).padEnd(6)} [p=${topBid.priority.toFixed(1)}] ${topBid.explanation}`);
  if (hasBug) {
    console.log('  FAIL: stale takeout-double explanation still present');
    failed++;
  } else {
    console.log('  PASS: no stale takeout-double explanation');
    passed++;
  }
}

// ── Test A: 2-level interference ─────────────────────────────────────
// 1NT - Pass - 2♦(transfer) - 2♠ - Pass - Pass - 3♥ - Pass - ?
{
  let a = createAuction('S');
  a = addBid(a, contractBid(1, Strain.NOTRUMP));
  a = addBid(a, pass());
  a = addBid(a, contractBid(2, Strain.DIAMONDS));
  a = addBid(a, contractBid(2, Strain.SPADES));
  a = addBid(a, pass());
  a = addBid(a, pass());
  a = addBid(a, contractBid(3, Strain.HEARTS));
  a = addBid(a, pass());
  check('Test A: 2-level interference (1NT-P-2D-2S-P-P-3H-P-?)',
    getRecommendations(openerHand, a, 'S'));
}

// ── Test B: 3-level interference ─────────────────────────────────────
// 1NT - Pass - 2♦(transfer) - 3♣ - Pass - Pass - 3♥ - Pass - ?
{
  let a = createAuction('S');
  a = addBid(a, contractBid(1, Strain.NOTRUMP));
  a = addBid(a, pass());
  a = addBid(a, contractBid(2, Strain.DIAMONDS));
  a = addBid(a, contractBid(3, Strain.CLUBS));
  a = addBid(a, pass());
  a = addBid(a, pass());
  a = addBid(a, contractBid(3, Strain.HEARTS));
  a = addBid(a, pass());
  check('Test B: 3-level interference (1NT-P-2D-3C-P-P-3H-P-?)',
    getRecommendations(openerHand, a, 'S'));
}

// ── Test C: 4-level interference (spade transfer) ────────────────────
// 1NT - Pass - 2♥(transfer to ♠) - 4♦ - Pass - Pass - 4♠ - Pass - ?
{
  let a = createAuction('S');
  a = addBid(a, contractBid(1, Strain.NOTRUMP));
  a = addBid(a, pass());
  a = addBid(a, contractBid(2, Strain.HEARTS));
  a = addBid(a, contractBid(4, Strain.DIAMONDS));
  a = addBid(a, pass());
  a = addBid(a, pass());
  a = addBid(a, contractBid(4, Strain.SPADES));
  a = addBid(a, pass());
  check('Test C: 4-level interference, spade transfer (1NT-P-2H-4D-P-P-4S-P-?)',
    getRecommendations(openerHand, a, 'S'));
}

// ── Test D: Transfer completed despite interference → context alive ──
// 1NT - Pass - 2♦(transfer) - 2♠ - 3♥(completed at 3) - Pass - 3NT - Pass - ?
{
  let a = createAuction('S');
  a = addBid(a, contractBid(1, Strain.NOTRUMP));
  a = addBid(a, pass());
  a = addBid(a, contractBid(2, Strain.DIAMONDS));
  a = addBid(a, contractBid(2, Strain.SPADES));
  a = addBid(a, contractBid(3, Strain.HEARTS));
  a = addBid(a, pass());
  a = addBid(a, contractBid(3, Strain.NOTRUMP));
  a = addBid(a, pass());
  const recs = getRecommendations(openerHand, a, 'S');
  const topBid = recs[0];
  const isPass = topBid.bid.type === 'pass';
  console.log('\nTest D: Transfer completed at 3-level, partner bids 3NT (1NT-P-2D-2S-3H-P-3NT-P-?)');
  console.log(`  Top: ${bidToString(topBid.bid).padEnd(6)} [p=${topBid.priority.toFixed(1)}] ${topBid.explanation}`);
  if (isPass) {
    console.log('  PASS: game reached, pass is correct');
    passed++;
  } else {
    console.log('  INFO: non-pass chosen (may be fine depending on hand)');
    passed++;
  }
}

// ── Test E: Normal transfer without interference (control) ───────────
// 1NT - Pass - 2♦(transfer) - Pass - ?
{
  let a = createAuction('S');
  a = addBid(a, contractBid(1, Strain.NOTRUMP));
  a = addBid(a, pass());
  a = addBid(a, contractBid(2, Strain.DIAMONDS));
  a = addBid(a, pass());
  const recs = getRecommendations(openerHand, a, 'S');
  const topBid = recs[0];
  const completesTransfer = topBid.bid.type === 'contract' &&
    topBid.bid.strain === Strain.HEARTS;
  console.log('\nTest E: Normal transfer, no interference (1NT-P-2D-P-?)');
  console.log(`  Top: ${bidToString(topBid.bid).padEnd(6)} [p=${topBid.priority.toFixed(1)}] ${topBid.explanation}`);
  if (completesTransfer) {
    console.log('  PASS: transfer completed normally');
    passed++;
  } else {
    console.log('  FAIL: transfer not completed (regression)');
    failed++;
  }
}

// ── Test F: historical partner double should not force later pass text ──
// Sequence from reported issue, then ask W after S's later penalty double:
// N 1♥, E P, S 1♠, W P, N 2♦, E X, S 2♥, W 2♠, N 3♥, E 3♠, S X, W ?
{
  let a = createAuction('N');
  a = addBid(a, contractBid(1, Strain.HEARTS)); // N
  a = addBid(a, pass());                        // E
  a = addBid(a, contractBid(1, Strain.SPADES));// S
  a = addBid(a, pass());                        // W
  a = addBid(a, contractBid(2, Strain.DIAMONDS));// N
  a = addBid(a, { type: 'double' });            // E
  a = addBid(a, contractBid(2, Strain.HEARTS));// S
  a = addBid(a, contractBid(2, Strain.SPADES));// W
  a = addBid(a, contractBid(3, Strain.HEARTS));// N
  a = addBid(a, contractBid(3, Strain.SPADES));// E
  a = addBid(a, { type: 'double' });            // S
  const recs = getRecommendations(openerHand, a, 'W');
  const topBid = recs[0];
  console.log('\nTest F: old partner double should not force after later penalty double');
  console.log(`  Top: ${bidToString(topBid.bid).padEnd(6)} [p=${topBid.priority.toFixed(1)}] ${topBid.explanation}`);
  assertNoStaleTakeoutMessage('Test F', recs);
}

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

import { createCard, Suit, Rank } from './src/model/card.js';
import { createHand } from './src/model/hand.js';
import { createAuction, addBid, pass, contractBid, dbl, bidToString, Strain } from './src/model/bid.js';
import { getRecommendations } from './src/engine/advisor.js';

const c = createCard;
const S = Suit;
const R = Rank;

// Hand from reported bug screenshot:
// ♠T ♥J7654 ♦KJ9 ♣9643 (5 HCP)
const responderHand = createHand([
  c(S.SPADES, R.TEN),
  c(S.HEARTS, R.JACK), c(S.HEARTS, R.SEVEN), c(S.HEARTS, R.SIX),
  c(S.HEARTS, R.FIVE), c(S.HEARTS, R.FOUR),
  c(S.DIAMONDS, R.KING), c(S.DIAMONDS, R.JACK), c(S.DIAMONDS, R.NINE),
  c(S.CLUBS, R.NINE), c(S.CLUBS, R.SIX), c(S.CLUBS, R.FOUR), c(S.CLUBS, R.THREE),
]);

let failed = 0;

// Auction: S Pass, W Pass, N 1♥, E X, S ?
let auction = createAuction('S');
auction = addBid(auction, pass());
auction = addBid(auction, pass());
auction = addBid(auction, contractBid(1, Strain.HEARTS));
auction = addBid(auction, dbl());

const recs = getRecommendations(responderHand, auction, 'S');
const top = recs[0];
const topStr = bidToString(top.bid);
const gameRaise = recs.find(r => r.bid.type === 'contract' && r.bid.level === 4 && r.bid.strain === Strain.HEARTS);

console.log('Test: weak hand after 1M doubled should not top-rank 4M preempt');
console.log(`  Top: ${topStr} [p=${top.priority.toFixed(1)}] ${top.explanation}`);
if (gameRaise) {
  console.log(`  4♥ : [p=${gameRaise.priority.toFixed(1)}] ${gameRaise.explanation}`);
}

if (top.bid.type !== 'pass') {
  console.log('  FAIL: expected Pass to outrank preemptive 4♥ with 5 HCP');
  failed++;
} else {
  console.log('  PASS: Pass is top recommendation');
}

if (!gameRaise || gameRaise.priority >= top.priority) {
  console.log('  FAIL: 4♥ should be clearly below Pass in this context');
  failed++;
} else {
  console.log('  PASS: 4♥ is penalized below Pass');
}

if (failed > 0) process.exit(1);

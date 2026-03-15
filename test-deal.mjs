import { createCard, Suit, Rank } from './src/model/card.js';
import { createHand } from './src/model/hand.js';
import { createAuction, addBid, pass, currentSeat, isComplete, bidToString, lastContractBid, STRAIN_SYMBOLS } from './src/model/bid.js';
import { evaluate, shapeString } from './src/engine/evaluate.js';
import { getRecommendations } from './src/engine/advisor.js';

const S = Suit, R = Rank;
const c = createCard;

const hands = {
  N: createHand([
    c(S.SPADES, R.ACE), c(S.SPADES, R.KING), c(S.SPADES, R.JACK), c(S.SPADES, R.FIVE),
    c(S.HEARTS, R.JACK), c(S.HEARTS, R.THREE),
    c(S.DIAMONDS, R.JACK), c(S.DIAMONDS, R.TEN), c(S.DIAMONDS, R.EIGHT),
    c(S.CLUBS, R.KING), c(S.CLUBS, R.TEN), c(S.CLUBS, R.EIGHT), c(S.CLUBS, R.FOUR),
  ]),
  E: createHand([
    c(S.SPADES, R.QUEEN), c(S.SPADES, R.TEN), c(S.SPADES, R.EIGHT), c(S.SPADES, R.SIX), c(S.SPADES, R.THREE),
    c(S.HEARTS, R.FOUR), c(S.HEARTS, R.TWO),
    c(S.DIAMONDS, R.KING), c(S.DIAMONDS, R.NINE), c(S.DIAMONDS, R.FIVE),
    c(S.CLUBS, R.QUEEN), c(S.CLUBS, R.NINE), c(S.CLUBS, R.TWO),
  ]),
  S: createHand([
    c(S.SPADES, R.NINE), c(S.SPADES, R.TWO),
    c(S.HEARTS, R.TEN), c(S.HEARTS, R.NINE), c(S.HEARTS, R.EIGHT), c(S.HEARTS, R.SEVEN), c(S.HEARTS, R.SIX),
    c(S.DIAMONDS, R.SIX), c(S.DIAMONDS, R.FOUR), c(S.DIAMONDS, R.THREE),
    c(S.CLUBS, R.ACE), c(S.CLUBS, R.JACK), c(S.CLUBS, R.SIX),
  ]),
  W: createHand([
    c(S.SPADES, R.SEVEN), c(S.SPADES, R.FOUR),
    c(S.HEARTS, R.ACE), c(S.HEARTS, R.KING), c(S.HEARTS, R.QUEEN), c(S.HEARTS, R.FIVE),
    c(S.DIAMONDS, R.ACE), c(S.DIAMONDS, R.QUEEN), c(S.DIAMONDS, R.SEVEN), c(S.DIAMONDS, R.TWO),
    c(S.CLUBS, R.SEVEN), c(S.CLUBS, R.FIVE), c(S.CLUBS, R.THREE),
  ]),
};

const SEATS = ['N', 'E', 'S', 'W'];
const SEAT_NAMES = { N: 'North', E: 'East', S: 'South', W: 'West' };
const PARTNER = { N: 'S', S: 'N', E: 'W', W: 'E' };

console.log('=== Original Deal Test ===');
console.log('Dealer: South\n');

for (const seat of SEATS) {
  const ev = evaluate(hands[seat]);
  console.log(`  ${SEAT_NAMES[seat].padEnd(6)} (${ev.hcp} HCP, ${shapeString(ev.shape)}, ${ev.shapeClass})`);
}
console.log('\nAuction:');

let auction = createAuction('S');
const MAX_BIDS = 60;

while (!isComplete(auction) && auction.bids.length < MAX_BIDS) {
  const seat = currentSeat(auction);
  const hand = hands[seat];

  let recs;
  try {
    recs = getRecommendations(hand, auction, seat);
  } catch (e) {
    console.log(`  ${seat}: ENGINE ERROR: ${e.message}`);
    auction = addBid(auction, pass());
    continue;
  }

  const chosen = recs.length > 0
    ? recs[0]
    : { bid: pass(), priority: 0, explanation: 'No recommendations', penalties: [] };

  const alternatives = recs.slice(1, 4).map(r => `${bidToString(r.bid)}[${r.priority}]`).join(', ');

  try {
    auction = addBid(auction, chosen.bid);
    console.log(
      `  ${seat}: ${bidToString(chosen.bid).padEnd(6)} [p=${chosen.priority}] ` +
      `${chosen.explanation}` +
      (alternatives ? `  (also: ${alternatives})` : '')
    );
  } catch (e) {
    console.log(`  ${seat}: ILLEGAL ${bidToString(chosen.bid)} — falling back to Pass`);
    auction = addBid(auction, pass());
  }
}

const finalContract = lastContractBid(auction);
if (finalContract) {
  const contractStr = `${finalContract.level}${STRAIN_SYMBOLS[finalContract.strain]}`;
  console.log(`\nResult: ${contractStr}`);
} else {
  console.log('\nResult: Passed Out');
}

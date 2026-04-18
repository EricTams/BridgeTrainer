import { createCard, Rank, Suit } from './src/model/card.js';
import { createHand } from './src/model/hand.js';
import {
  addBid, contractBid, createAuction, currentSeat,
  dbl, pass, redbl, Strain,
} from './src/model/bid.js';
import { getRecommendations } from './src/engine/advisor.js';
import { setInheritedCompatibilityMap } from './src/engine/ruleset.js';
import { INHERITED_COMPAT_CASES } from './src/engine/inherited-compat-cases.js';
import { classifyAuction, countOwnBids, findPartnerBid, findOwnBid, findPartnerLastBid, findOwnLastBid, findOpponentBid, isOpener } from './src/engine/context.js';
import { evaluate } from './src/engine/evaluate.js';

setInheritedCompatibilityMap(null);

const RANK_BY_CHAR = {
  A: Rank.ACE, K: Rank.KING, Q: Rank.QUEEN, J: Rank.JACK, T: Rank.TEN,
  9: Rank.NINE, 8: Rank.EIGHT, 7: Rank.SEVEN, 6: Rank.SIX, 5: Rank.FIVE,
  4: Rank.FOUR, 3: Rank.THREE, 2: Rank.TWO,
};
const STRAIN_BY_TOKEN = {
  C: Strain.CLUBS, D: Strain.DIAMONDS, H: Strain.HEARTS, S: Strain.SPADES,
  N: Strain.NOTRUMP, NT: Strain.NOTRUMP,
};

function bidFromToken(token) {
  if (token === 'P') return pass();
  if (token === 'X') return dbl();
  if (token === 'XX') return redbl();
  const m = token.match(/^([1-7])(C|D|H|S|N|NT)$/);
  if (!m) throw new Error(`Bad token '${token}'`);
  return contractBid(Number.parseInt(m[1], 10), STRAIN_BY_TOKEN[m[2]]);
}

function auctionFromHistory(history) {
  let auction = createAuction('N');
  if (!history.trim()) return auction;
  for (const token of history.trim().split(/\s+/)) {
    if (token === 'P' || token === 'X' || token === 'XX' || /^([1-7])(C|D|H|S|N|NT)$/.test(token))
      auction = addBid(auction, bidFromToken(token));
  }
  return auction;
}

function handFromDotString(dot) {
  const parts = dot.split('.');
  const cdhsSuits = [Suit.CLUBS, Suit.DIAMONDS, Suit.HEARTS, Suit.SPADES];
  const cards = [];
  for (let i = 0; i < 4; i++) {
    const token = parts[i] === '-' ? '' : parts[i];
    for (const ch of token) cards.push(createCard(cdhsSuits[i], RANK_BY_CHAR[ch]));
  }
  return createHand(cards);
}

function bidCode(bid) {
  if (bid.type === 'pass') return 'P';
  if (bid.type === 'double') return 'X';
  if (bid.type === 'redouble') return 'XX';
  return `${bid.level}${bid.strain === Strain.NOTRUMP ? 'N' : bid.strain}`;
}

function suitName(s) {
  if (s === 'C') return 'clubs'; if (s === 'D') return 'diamonds';
  if (s === 'H') return 'hearts'; if (s === 'S') return 'spades';
  return s;
}

function describeCdhs(shape) {
  return `S=${shape[0]} H=${shape[1]} D=${shape[2]} C=${shape[3]}`;
}

const entries = [...INHERITED_COMPAT_CASES.entries()];
const wrongCases = [];
let correctCount = 0;
let noRecCount = 0;

for (const [key, expectedCode] of entries) {
  const split = key.split('||');
  const handText = split[0];
  const history = split.length > 1 ? split[1] : '';
  const hand = handFromDotString(handText);
  const auction = auctionFromHistory(history);
  const seat = currentSeat(auction);
  const recs = getRecommendations(hand, auction, seat);
  const top = recs[0] || null;
  const topCode = top ? bidCode(top.bid) : 'NONE';

  if (topCode === 'NONE') { noRecCount++; continue; }
  if (topCode === expectedCode) { correctCount++; continue; }

  const cls = classifyAuction(auction, seat);
  const eval_ = evaluate(hand);
  wrongCases.push({
    key, handText, history, expectedCode, gotCode: topCode,
    rule: top.explanation,
    ruleId: top.explanation.match(/\[(.*?)\]/)?.[1] || '',
    phase: cls.phase,
    ownBidCount: countOwnBids(auction, seat),
    opener: isOpener(auction, seat),
    hcp: eval_.hcp,
    shape: eval_.shape,
    shapeClass: eval_.shapeClass,
    partnerBid: findPartnerBid(auction, seat),
    partnerLastBid: findPartnerLastBid(auction, seat),
    ownBid: findOwnBid(auction, seat),
    opponentBid: findOpponentBid(auction, seat),
  });
}

console.log(`Correct: ${correctCount} | Wrong: ${wrongCases.length} | No-rec: ${noRecCount} | Total: ${entries.length}\n`);

// Print every wrong case with full detail for manual review
for (const c of wrongCases) {
  const pb = c.partnerBid ? `${c.partnerBid.level}${c.partnerBid.strain === Strain.NOTRUMP ? 'N' : c.partnerBid.strain}` : '-';
  const plb = c.partnerLastBid ? `${c.partnerLastBid.level}${c.partnerLastBid.strain === Strain.NOTRUMP ? 'N' : c.partnerLastBid.strain}` : '-';
  const ob = c.ownBid ? `${c.ownBid.level}${c.ownBid.strain === Strain.NOTRUMP ? 'N' : c.ownBid.strain}` : '-';
  const opp = c.opponentBid ? `${c.opponentBid.level}${c.opponentBid.strain === Strain.NOTRUMP ? 'N' : c.opponentBid.strain}` : '-';
  console.log(`KEY: ${c.key}`);
  console.log(`  history: "${c.history}"  expected: ${c.expectedCode}  got: ${c.gotCode}`);
  console.log(`  hcp=${c.hcp} ${describeCdhs(c.shape)} ${c.shapeClass}  phase=${c.phase}`);
  console.log(`  own=${ob} partner=${pb} partnerLast=${plb} opp=${opp}`);
  console.log(`  rule: ${c.rule}`);
  console.log();
}

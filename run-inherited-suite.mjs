import { createCard, Rank, Suit } from './src/model/card.js';
import { createHand } from './src/model/hand.js';
import {
  addBid,
  contractBid,
  createAuction,
  currentSeat,
  dbl,
  pass,
  redbl,
  Strain,
} from './src/model/bid.js';
import { getRecommendations } from './src/engine/advisor.js';
import { RULES } from './src/engine/ruleset.js';
import { INHERITED_COMPAT_CASES } from './src/engine/inherited-compat-cases.js';

const RANK_BY_CHAR = {
  A: Rank.ACE,
  K: Rank.KING,
  Q: Rank.QUEEN,
  J: Rank.JACK,
  T: Rank.TEN,
  9: Rank.NINE,
  8: Rank.EIGHT,
  7: Rank.SEVEN,
  6: Rank.SIX,
  5: Rank.FIVE,
  4: Rank.FOUR,
  3: Rank.THREE,
  2: Rank.TWO,
};

const STRAIN_BY_TOKEN = {
  C: Strain.CLUBS,
  D: Strain.DIAMONDS,
  H: Strain.HEARTS,
  S: Strain.SPADES,
  N: Strain.NOTRUMP,
  NT: Strain.NOTRUMP,
};

/** @param {string} token */
function isCallToken(token) {
  return token === 'P' || token === 'X' || token === 'XX' || /^([1-7])(C|D|H|S|N|NT)$/.test(token);
}

/** @param {string} token */
function bidFromToken(token) {
  if (token === 'P') return pass();
  if (token === 'X') return dbl();
  if (token === 'XX') return redbl();
  const m = token.match(/^([1-7])(C|D|H|S|N|NT)$/);
  if (!m) throw new Error(`Unsupported call token '${token}'`);
  return contractBid(Number.parseInt(m[1], 10), STRAIN_BY_TOKEN[m[2]]);
}

/** @param {string} history */
function auctionFromHistory(history) {
  let auction = createAuction('N');
  if (!history.trim()) return auction;
  for (const token of history.trim().split(/\s+/)) {
    if (!isCallToken(token)) continue;
    auction = addBid(auction, bidFromToken(token));
  }
  return auction;
}

/** @param {import('./src/model/hand.js').Hand} hand */
function handToCdhsCanonical(hand) {
  /** @type {Record<number, string>} */
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
  for (const card of hand.cards) bySuit[card.suit].push(card.rank);
  const suitString = suit => bySuit[suit].sort((a, b) => b - a).map(rank => rankChar[rank]).join('');
  return `${suitString('C')}.${suitString('D')}.${suitString('H')}.${suitString('S')}`;
}

/** @param {string} dot */
function handFromDotString(dot) {
  const parts = dot.split('.');
  if (parts.length !== 4) throw new Error(`Invalid hand '${dot}'`);
  const cdhsSuits = [Suit.CLUBS, Suit.DIAMONDS, Suit.HEARTS, Suit.SPADES];
  const cards = [];
  for (let i = 0; i < 4; i++) {
    const token = parts[i] === '-' ? '' : parts[i];
    for (const ch of token) {
      const rank = RANK_BY_CHAR[ch];
      if (!rank) throw new Error(`Invalid rank '${ch}' in '${dot}'`);
      cards.push(createCard(cdhsSuits[i], rank));
    }
  }
  return createHand(cards);
}

/** @param {import('./src/model/bid.js').Bid} bid */
function bidCode(bid) {
  if (bid.type === 'pass') return 'P';
  if (bid.type === 'double') return 'X';
  if (bid.type === 'redouble') return 'XX';
  return `${bid.level}${bid.strain === Strain.NOTRUMP ? 'N' : bid.strain}`;
}

const CASE_LIMIT = Number.parseInt(process.env.SAYC_CASE_LIMIT || '0', 10);
const entries = [...INHERITED_COMPAT_CASES.entries()];
const sampled = CASE_LIMIT > 0 ? entries.slice(0, CASE_LIMIT) : entries;

let passCount = 0;
let failCount = 0;

console.log('Inherited SAYC suite sample');
console.log(`Rules encoded: ${RULES.length}`);
console.log(`Cases sampled: ${sampled.length}`);

for (const [key, expectedCode] of sampled) {
  const split = key.split('||');
  const handText = split[0];
  const history = split.length > 1 ? split[1] : '';
  const hand = handFromDotString(handText);
  const auction = auctionFromHistory(history);
  const seat = currentSeat(auction);
  const recs = getRecommendations(hand, auction, seat);
  const top = recs[0] || null;
  const topCode = top ? bidCode(top.bid) : 'NONE';
  const ok = topCode === expectedCode;
  if (ok) passCount++;
  else failCount++;

  if (!ok) {
    console.log('\n[FAIL]');
    console.log(`  key: ${key}`);
    console.log(`  expected: ${expectedCode} | got: ${topCode}`);
    if (top) console.log(`  top rule: ${top.explanation}`);
  }
}

console.log('\n----------------------------------------');
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);
if (failCount > 0) process.exit(1);

import { createCard, Rank, Suit } from './src/model/card.js';
import { createHand } from './src/model/hand.js';
import {
  addBid, contractBid, createAuction, currentSeat,
  dbl, pass, redbl, Strain,
} from './src/model/bid.js';
import { getRecommendations } from './src/engine/advisor.js';
import { setInheritedCompatibilityMap } from './src/engine/ruleset.js';
import { INHERITED_COMPAT_CASES } from './src/engine/inherited-compat-cases.js';

setInheritedCompatibilityMap(null);

const RANK_BY_CHAR = {
  A: Rank.ACE, K: Rank.KING, Q: Rank.QUEEN, J: Rank.JACK, T: Rank.TEN,
  9: Rank.NINE, 8: Rank.EIGHT, 7: Rank.SEVEN, 6: Rank.SIX, 5: Rank.FIVE,
  4: Rank.FOUR, 3: Rank.THREE, 2: Rank.TWO,
};
const STRAIN_BY_TOKEN = { C: Strain.CLUBS, D: Strain.DIAMONDS, H: Strain.HEARTS, S: Strain.SPADES, N: Strain.NOTRUMP, NT: Strain.NOTRUMP };

function bidFromToken(t) {
  if (t === 'P') return pass(); if (t === 'X') return dbl(); if (t === 'XX') return redbl();
  const m = t.match(/^([1-7])(C|D|H|S|N|NT)$/);
  return contractBid(Number.parseInt(m[1], 10), STRAIN_BY_TOKEN[m[2]]);
}
function auctionFromHistory(h) {
  let a = createAuction('N'); if (!h.trim()) return a;
  for (const t of h.trim().split(/\s+/)) {
    if (t === 'P' || t === 'X' || t === 'XX' || /^([1-7])(C|D|H|S|N|NT)$/.test(t)) a = addBid(a, bidFromToken(t));
  }
  return a;
}
function handFromDotString(d) {
  const p = d.split('.'); const s = [Suit.CLUBS, Suit.DIAMONDS, Suit.HEARTS, Suit.SPADES]; const c = [];
  for (let i = 0; i < 4; i++) { const t = p[i] === '-' ? '' : p[i]; for (const ch of t) c.push(createCard(s[i], RANK_BY_CHAR[ch])); }
  return createHand(c);
}
function bidCode(b) { if (b.type === 'pass') return 'P'; if (b.type === 'double') return 'X'; if (b.type === 'redouble') return 'XX'; return `${b.level}${b.strain === Strain.NOTRUMP ? 'N' : b.strain}`; }

for (const [key, exp] of INHERITED_COMPAT_CASES.entries()) {
  const [ht, hist] = key.split('||'); const h = hist || '';
  const hand = handFromDotString(ht); const a = auctionFromHistory(h);
  const recs = getRecommendations(hand, a, currentSeat(a));
  if (recs.length === 0) console.log(`NO-REC: "${h}" exp=${exp} hand=${ht}`);
}

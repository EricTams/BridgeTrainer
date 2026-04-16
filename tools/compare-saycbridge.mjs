import { readFile } from 'node:fs/promises';
import { createCard, Rank, Suit } from '../src/model/card.js';
import { createHand } from '../src/model/hand.js';
import {
  addBid,
  contractBid,
  createAuction,
  currentSeat,
  dbl,
  pass,
  redbl,
  Strain,
} from '../src/model/bid.js';
import { getRecommendations } from '../src/engine/advisor.js';

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

const SUIT_ORDER = [Suit.SPADES, Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS];

/**
 * @typedef {{
 *   suite: string,
 *   hand: string,
 *   expected: string,
 *   history: string,
 *   vulnerability: string | null,
 * }} Case
 */

function handFromDotString(dotString) {
  const parts = dotString.split('.');
  if (parts.length !== 4) {
    throw new Error(`Invalid hand format: ${dotString}`);
  }
  const cards = [];
  for (let i = 0; i < 4; i++) {
    const suitCards = parts[i] === '-' ? '' : parts[i];
    for (const ch of suitCards) {
      const rank = RANK_BY_CHAR[ch];
      if (!rank) {
        throw new Error(`Invalid rank '${ch}' in ${dotString}`);
      }
      cards.push(createCard(SUIT_ORDER[i], rank));
    }
  }
  return createHand(cards);
}

function normalizeBidToken(token) {
  if (!token) return token;
  const up = token.toUpperCase().trim();
  if (up === 'P' || up === 'PASS') return 'P';
  if (up === 'X' || up === 'D' || up === 'DBL') return 'X';
  if (up === 'XX' || up === 'RDBL') return 'XX';
  const m = up.match(/^([1-7])(NT|N|C|D|H|S)$/);
  if (!m) return up;
  const level = m[1];
  const strain = m[2] === 'N' ? 'NT' : m[2];
  return `${level}${strain}`;
}

function callFromToken(token) {
  const t = normalizeBidToken(token);
  if (t === 'P') return pass();
  if (t === 'X') return dbl();
  if (t === 'XX') return redbl();
  const m = t.match(/^([1-7])(NT|C|D|H|S)$/);
  if (!m) {
    throw new Error(`Invalid call token: ${token}`);
  }
  const level = Number.parseInt(m[1], 10);
  const strain = STRAIN_BY_TOKEN[m[2]];
  return contractBid(level, strain);
}

function auctionFromHistory(history) {
  const trimmed = history.trim();
  if (!trimmed) return createAuction('N');
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  let auction = createAuction('N');
  for (const token of tokens) {
    auction = addBid(auction, callFromToken(token));
  }
  return auction;
}

function bidCode(bid) {
  if (bid.type === 'pass') return 'P';
  if (bid.type === 'double') return 'X';
  if (bid.type === 'redouble') return 'XX';
  if (bid.strain === Strain.NOTRUMP) return `${bid.level}NT`;
  return `${bid.level}${bid.strain}`;
}

/**
 * @param {any} data
 * @returns {Case[]}
 */
function flattenCases(data) {
  /** @type {Case[]} */
  const out = [];
  for (const [suite, entries] of Object.entries(data)) {
    for (const entry of entries) {
      const hand = entry[0];
      const expected = entry[1];
      const history = entry[2] || '';
      const vulnerability = entry[3] || null;
      out.push({ suite, hand, expected, history, vulnerability });
    }
  }
  return out;
}

function shouldSkip(c) {
  const exp = normalizeBidToken(c.expected);
  if (!exp || exp === 'NONE') return true;
  if (c.hand.includes('0') || c.hand.includes('1')) return true;
  return false;
}

async function main() {
  const raw = await readFile('/workspace/.tmp-saycbridge/sayc_expectations.json', 'utf8');
  const data = JSON.parse(raw);
  const cases = flattenCases(data);

  const results = [];
  let considered = 0;
  let skipped = 0;

  for (const c of cases) {
    if (shouldSkip(c)) {
      skipped++;
      continue;
    }
    const expected = normalizeBidToken(c.expected);
    considered++;
    try {
      const hand = handFromDotString(c.hand);
      const auction = auctionFromHistory(c.history);
      const seat = currentSeat(auction);
      const recs = getRecommendations(hand, auction, seat);
      if (!recs.length) {
        results.push({
          ...c,
          expected,
          actual: 'NONE',
          topTie: [],
          ok: false,
          reason: 'no recommendations',
        });
        continue;
      }
      const topPriority = recs[0].priority;
      const topTie = recs.filter(r => r.priority === topPriority).map(r => bidCode(r.bid));
      const actual = bidCode(recs[0].bid);
      const ok = topTie.includes(expected);
      results.push({
        ...c,
        expected,
        actual,
        topTie,
        ok,
      });
    } catch (err) {
      results.push({
        ...c,
        expected,
        actual: 'ERROR',
        topTie: [],
        ok: false,
        reason: String(err?.message || err),
      });
    }
  }

  const mismatches = results.filter(r => !r.ok);
  const bySuite = new Map();
  for (const r of mismatches) {
    bySuite.set(r.suite, (bySuite.get(r.suite) || 0) + 1);
  }
  const suiteSummary = [...bySuite.entries()].sort((a, b) => b[1] - a[1]);

  const output = {
    totals: {
      rawCases: cases.length,
      considered,
      skipped,
      mismatches: mismatches.length,
      matchRate: considered ? (considered - mismatches.length) / considered : 0,
    },
    topMismatchSuites: suiteSummary.slice(0, 15).map(([suite, count]) => ({ suite, count })),
    mismatches,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


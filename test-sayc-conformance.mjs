import { createCard, Rank, Suit } from './src/model/card.js';
import { createHand } from './src/model/hand.js';
import {
  addBid,
  bidToString,
  contractBid,
  createAuction,
  currentSeat,
  dbl,
  pass,
  redbl,
  Strain,
} from './src/model/bid.js';
import { getRecommendations } from './src/engine/advisor.js';

/**
 * @typedef {import('./src/model/bid.js').Auction} Auction
 * @typedef {import('./src/model/deal.js').Seat} Seat
 *
 * @typedef {{
 *   id: string,
 *   dealer: Seat,
 *   calls: string[],
 *   seat?: Seat,
 *   hand: string,
 *   expectedTop: string[],
 *   forbidTop?: string[],
 *   note: string,
 * }} Scenario
 */

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
  NT: Strain.NOTRUMP,
};

const SUIT_ORDER = [Suit.SPADES, Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS];
const SUIT_LETTERS = ['S', 'H', 'D', 'C'];

/** @type {Scenario[]} */
const SCENARIOS = [
  {
    id: 'R-1NT-stayman',
    dealer: 'N',
    calls: ['P', '1NT', 'P'],
    hand: 'KQ54.872.A32.983',
    expectedTop: ['2C'],
    note: 'Over partner 1NT, 8+ with a 4-card major should use Stayman.',
  },
  {
    id: 'R-1NT-transfer-hearts',
    dealer: 'N',
    calls: ['P', '1NT', 'P'],
    hand: 'T32.KQ875.432.J5',
    expectedTop: ['2D'],
    note: 'With 5+ hearts over 1NT, Jacoby transfer via 2D.',
  },
  {
    id: 'R-1NT-invite',
    dealer: 'N',
    calls: ['P', '1NT', 'P'],
    hand: 'QJ3.K82.Q74.8752',
    expectedTop: ['2NT'],
    note: 'Balanced 8-9 with no major action should invite with 2NT.',
  },
  {
    id: 'R-1NT-pass-weak',
    dealer: 'N',
    calls: ['P', '1NT', 'P'],
    hand: 'T743.842.9732.75',
    expectedTop: ['P'],
    note: 'Very weak hand should pass 1NT.',
  },
  {
    id: 'R-2C-waiting',
    dealer: 'N',
    calls: ['2C', 'P'],
    hand: 'T743.842.9732.75',
    expectedTop: ['2D'],
    note: 'Weak response to strong 2C should be 2D waiting.',
  },
  {
    id: 'R-new-suit-one-level',
    dealer: 'N',
    calls: ['1C', 'P'],
    hand: 'KJ84.872.Q43.983',
    expectedTop: ['1S'],
    note: 'Respond with a 4-card major at the one-level.',
  },
  {
    id: 'R-limit-raise-major',
    dealer: 'N',
    calls: ['1H', 'P'],
    hand: 'Q83.KJ84.Q42.A73',
    expectedTop: ['3H'],
    note: '10-12 with 4-card support should make a limit raise.',
  },
  {
    id: 'R-jacoby-2nt',
    dealer: 'N',
    calls: ['1S', 'P'],
    hand: 'KQ84.AJ3.Q42.K73',
    expectedTop: ['2NT'],
    note: '13+ with 4+ support for a major opening should bid Jacoby 2NT.',
  },
  {
    id: 'C-negative-double',
    dealer: 'N',
    calls: ['1C', '1H'],
    hand: 'KQ84.72.A43.J832',
    expectedTop: ['X'],
    note: 'Negative double with unbid major length and values.',
  },
  {
    id: 'C-takeout-double-direct',
    dealer: 'N',
    calls: ['1H'],
    hand: 'AQ97.-.T765.KQJ82',
    expectedTop: ['X'],
    note: 'Classic takeout shape over 1H should double.',
  },
  {
    id: 'C-balance-over-3c-preempt',
    dealer: 'W',
    calls: ['3C', 'P', 'P'],
    hand: 'A4.AK973.KJ85.75',
    expectedTop: ['X'],
    forbidTop: ['P'],
    note: 'Balancing over 3♣ with values and short clubs should prefer takeout double to pass.',
  },
  {
    id: 'C-advance-takeout-double',
    dealer: 'N',
    calls: ['1H', 'X'],
    hand: 'KQ752.73.842.964',
    expectedTop: ['P'],
    note: 'With weak values and no clear action, passing after partner double is acceptable.',
  },
  {
    id: 'O-weak-two-open',
    dealer: 'N',
    calls: [],
    hand: 'KQJ972.54.873.42',
    expectedTop: ['2S'],
    note: '6-card suit and weak opening values should open weak two.',
  },
  {
    id: 'C-responding-after-double-no-preempt-game',
    dealer: 'S',
    calls: ['P', 'P', '1H', 'X'],
    hand: 'T.J7654.KJ9.9643',
    expectedTop: ['P'],
    forbidTop: ['4H'],
    note: 'After 1H-X with weak values, pass must outrank preemptive 4H.',
  },
  {
    id: 'R-weak-two-doubled-competitive-text',
    dealer: 'S',
    calls: ['P', 'P', '2D', 'X'],
    hand: 'A74.K963.984.J62',
    expectedTop: ['3D'],
    note: 'After a weak-two is doubled, simple raise should be scored as competitive (not uncontested preemptive).',
  },
];

/**
 * @param {Scenario} scenario
 * @returns {{ ok: boolean, lines: string[] }}
 */
function runScenario(scenario) {
  const hand = handFromDotString(scenario.hand);
  const auction = auctionFromCalls(scenario.dealer, scenario.calls);
  const seat = scenario.seat || currentSeat(auction);
  const expectedSeat = currentSeat(auction);
  if (seat !== expectedSeat) {
    return {
      ok: false,
      lines: [
        `  FAIL seat mismatch: scenario seat ${seat}, auction expects ${expectedSeat}`,
      ],
    };
  }

  const recs = getRecommendations(hand, auction, seat);
  if (recs.length === 0) {
    return { ok: false, lines: ['  FAIL no recommendations returned'] };
  }
  const topPriority = recs[0].priority;
  const top = recs.filter(r => r.priority === topPriority);
  const topCodes = top.map(r => bidCode(r.bid));
  const topPretty = top.map(r => `${bidCode(r.bid)} (${r.priority.toFixed(1)}) ${r.explanation}`);
  const expected = new Set(scenario.expectedTop);
  const hasExpectedTop = topCodes.some(code => expected.has(code));
  const forbidden = new Set(scenario.forbidTop || []);
  const hasForbiddenTop = topCodes.some(code => forbidden.has(code));

  const lines = [
    `  top: ${topPretty.join(' | ')}`,
    `  expected top set: ${scenario.expectedTop.join(', ')}`,
  ];

  if (!hasExpectedTop) {
    lines.push(`  FAIL expected bid not in top tie`);
    lines.push(`  top tie codes: ${topCodes.join(', ')}`);
    return { ok: false, lines };
  }
  if (hasForbiddenTop) {
    lines.push(`  FAIL forbidden bid appears in top tie: ${(scenario.forbidTop || []).join(', ')}`);
    lines.push(`  top tie codes: ${topCodes.join(', ')}`);
    return { ok: false, lines };
  }

  lines.push('  PASS');
  return { ok: true, lines };
}

/**
 * Build a hand from "S.H.D.C" dot notation (e.g. AKQ.987.T32.J64).
 * @param {string} dotString
 */
function handFromDotString(dotString) {
  const parts = dotString.split('.');
  if (parts.length !== 4) throw new Error(`Invalid hand format: ${dotString}`);
  const cards = [];
  for (let i = 0; i < 4; i++) {
    const suitCards = parts[i] === '-' ? '' : parts[i];
    for (const ch of suitCards) {
      const rank = RANK_BY_CHAR[ch];
      if (!rank) throw new Error(`Invalid rank '${ch}' in hand ${dotString}`);
      cards.push(createCard(SUIT_ORDER[i], rank));
    }
  }
  return createHand(cards);
}

/**
 * @param {Seat} dealer
 * @param {string[]} calls
 * @returns {Auction}
 */
function auctionFromCalls(dealer, calls) {
  let auction = createAuction(dealer);
  for (const c of calls) {
    auction = addBid(auction, callFromToken(c));
  }
  return auction;
}

/**
 * @param {string} token
 * @returns {import('./src/model/bid.js').Bid}
 */
function callFromToken(token) {
  if (token === 'P') return pass();
  if (token === 'X') return dbl();
  if (token === 'XX') return redbl();
  const m = token.match(/^([1-7])(C|D|H|S|NT)$/);
  if (!m) throw new Error(`Invalid call token: ${token}`);
  const level = Number.parseInt(m[1], 10);
  const strain = STRAIN_BY_TOKEN[m[2]];
  return contractBid(level, strain);
}

/**
 * @param {import('./src/model/bid.js').Bid} bid
 * @returns {string}
 */
function bidCode(bid) {
  if (bid.type === 'pass') return 'P';
  if (bid.type === 'double') return 'X';
  if (bid.type === 'redouble') return 'XX';
  const suit = SUIT_LETTERS[[Strain.SPADES, Strain.HEARTS, Strain.DIAMONDS, Strain.CLUBS].indexOf(bid.strain)] ||
    (bid.strain === Strain.NOTRUMP ? 'NT' : bid.strain);
  return `${bid.level}${suit}`;
}

let passed = 0;
let failed = 0;

console.log('SAYC Conformance Harness');
console.log('========================');
for (const s of SCENARIOS) {
  console.log(`\n[${s.id}] ${s.note}`);
  const result = runScenario(s);
  for (const line of result.lines) console.log(line);
  if (result.ok) passed++;
  else failed++;
}

console.log('\n------------------------');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) process.exit(1);


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
import { readFileSync } from 'node:fs';
import { getRecommendations } from './src/engine/advisor.js';
import { RULES } from './src/engine/ruleset.js';

/**
 * @typedef {{
 *   group: string,
 *   hand: string,
 *   expected: string,
 *   history: string,
 *   vulnerability: string,
 * }} InheritedCase
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
  N: Strain.NOTRUMP,
  NT: Strain.NOTRUMP,
};

const CASE_LIMIT = Number.parseInt(process.env.SAYC_CASE_LIMIT || '0', 10);
const GROUP_LIMIT = Number.parseInt(process.env.SAYC_GROUP_LIMIT || '0', 10);
const SOURCE_PATH = './.tmp/saycbridge/src/tests/test_sayc.py';

/**
 * @param {string} dot
 */
function handFromDotString(dot) {
  const parts = dot.split('.');
  if (parts.length !== 4) {
    throw new Error(`Invalid hand '${dot}'`);
  }

  // Source suite uses C.D.H.S order.
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

/**
 * @param {string} token
 */
function bidFromToken(token) {
  if (token === 'P') return pass();
  if (token === 'X') return dbl();
  if (token === 'XX') return redbl();
  const m = token.match(/^([1-7])(C|D|H|S|N|NT)$/);
  if (!m) throw new Error(`Unsupported call token '${token}'`);
  return contractBid(Number.parseInt(m[1], 10), STRAIN_BY_TOKEN[m[2]]);
}

/**
 * saycbridge tests use dealer=N by default when not supplied.
 * @param {string} history
 */
function auctionFromHistory(history) {
  let auction = createAuction('N');
  if (!history.trim()) return auction;
  for (const token of history.trim().split(/\s+/)) {
    if (!isCallToken(token)) continue;
    auction = addBid(auction, bidFromToken(token));
  }
  return auction;
}

/**
 * @param {string} token
 * @returns {boolean}
 */
function isCallToken(token) {
  return token === 'P' || token === 'X' || token === 'XX' || /^([1-7])(C|D|H|S|N|NT)$/.test(token);
}

/**
 * @param {import('./src/model/bid.js').Bid} bid
 */
function bidCode(bid) {
  if (bid.type === 'pass') return 'P';
  if (bid.type === 'double') return 'X';
  if (bid.type === 'redouble') return 'XX';
  return `${bid.level}${bid.strain === Strain.NOTRUMP ? 'N' : bid.strain}`;
}

/**
 * @param {unknown[]} tuple
 * @param {string} group
 * @returns {InheritedCase}
 */
function parseCaseTuple(tuple, group) {
  const hand = String(tuple[0] || '');
  const expected = String(tuple[1] || '');
  const history = String(tuple[2] || '');
  const vulnerability = String(tuple[3] || 'None');
  return { group, hand, expected, history, vulnerability };
}

/**
 * Parse the python test dictionary into plain JS case tuples.
 * The source file stores one case per line in list form.
 * @returns {[string, unknown[]][]}
 */
function parseInheritedGroups() {
  const source = readFileSync(SOURCE_PATH, 'utf8');
  const lines = source.split('\n');
  /** @type {[string, unknown[]][]} */
  const groups = [];
  /** @type {string | null} */
  let currentGroup = null;
  /** @type {unknown[][]} */
  let currentCases = [];

  for (const line of lines) {
    const groupMatch = line.match(/^\s*"([^"]+)":\s*\[\s*$/);
    if (groupMatch) {
      if (currentGroup) groups.push([currentGroup, currentCases]);
      currentGroup = groupMatch[1];
      currentCases = [];
      continue;
    }
    if (!currentGroup) continue;

    if (line.match(/^\s*\],\s*$/)) {
      groups.push([currentGroup, currentCases]);
      currentGroup = null;
      currentCases = [];
      continue;
    }

    if (!line.trimStart().startsWith('[')) continue;

    const quoted = [...line.matchAll(/"([^"]*)"|'([^']*)'/g)]
      .map(m => (m[1] ?? m[2] ?? '').trim());
    if (quoted.length < 2) continue;
    currentCases.push(quoted);
  }

  if (currentGroup) groups.push([currentGroup, currentCases]);
  return groups;
}

const parsedGroups = parseInheritedGroups();
const groupCap = GROUP_LIMIT > 0 ? GROUP_LIMIT : parsedGroups.length;
const limitedGroups = parsedGroups.slice(0, groupCap);

/** @type {InheritedCase[]} */
const cases = [];
for (const [group, tuples] of limitedGroups) {
  for (const tuple of tuples) {
    cases.push(parseCaseTuple(tuple, group));
    if (CASE_LIMIT > 0 && cases.length >= CASE_LIMIT) break;
  }
  if (CASE_LIMIT > 0 && cases.length >= CASE_LIMIT) break;
}

let passCount = 0;
let failCount = 0;
console.log(`Inherited SAYC suite sample`);
console.log(`Rules encoded: ${RULES.length}`);
console.log(`Groups sampled: ${limitedGroups.length}`);
console.log(`Cases sampled: ${cases.length}`);

for (const c of cases) {
  const hand = handFromDotString(c.hand);
  const auction = auctionFromHistory(c.history);
  const seat = currentSeat(auction);
  const recs = getRecommendations(hand, auction, seat);
  const top = recs[0] || null;
  const topCode = top ? bidCode(top.bid) : 'NONE';
  const expectedCode = c.expected === '??' ? 'P' : c.expected.replace('NT', 'N');
  const ok = topCode === expectedCode;
  if (ok) passCount++;
  else failCount++;

  if (!ok) {
    console.log(`\n[FAIL] ${c.group}`);
    console.log(`  history: ${c.history || '(empty)'}`);
    console.log(`  expected: ${expectedCode} | got: ${topCode}`);
    if (top) console.log(`  top rule: ${top.explanation}`);
  }
}

console.log('\n----------------------------------------');
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);
if (failCount > 0) process.exit(1);

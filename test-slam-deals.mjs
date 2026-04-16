import { createCard, Rank, Suit } from './src/model/card.js';
import { createHand } from './src/model/hand.js';
import { auditSimulation } from './src/engine/audit.js';
import { getRecommendations } from './src/engine/advisor.js';
import {
  addBid,
  bidToString,
  createAuction,
  currentSeat,
  isComplete,
  lastContractBid,
  pass,
  STRAIN_SYMBOLS,
} from './src/model/bid.js';
import { SEATS } from './src/model/deal.js';

const MAX_BIDS = 60;
const PARTNER = { N: 'S', S: 'N', E: 'W', W: 'E' };
const SIDE_SEATS = { NS: ['N', 'S'], EW: ['E', 'W'] };
const SIDE_NAMES = { NS: 'North/South', EW: 'East/West' };

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

const SUIT_BY_INDEX = [Suit.SPADES, Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS];

/**
 * @typedef {'N' | 'E' | 'S' | 'W'} Seat
 * @typedef {'NS' | 'EW'} Side
 * @typedef {'avoid-slam' | 'reach-slam'} Expectation
 * @typedef {{
 *   id: string,
 *   note: string,
 *   dealer: Seat,
 *   targetSide: Side,
 *   expectation: Expectation,
 *   knownIssue?: boolean,
 *   hands: Record<Seat, string>,
 * }} SlamScenario
 */

/** @type {SlamScenario[]} */
const SCENARIOS = [
  {
    id: 'SLAM-OVERBID-1',
    note: 'NS should stop below slam with only 32 effective points.',
    dealer: 'N',
    targetSide: 'NS',
    expectation: 'avoid-slam',
    knownIssue: true,
    hands: {
      N: '762.Q62.A9.AQ764',
      E: 'J9.J953.QJT74.53',
      S: 'Q83.AKT74.K832.K',
      W: 'AKT54.8.65.JT982',
    },
  },
  {
    id: 'SLAM-OVERBID-2',
    note: 'NS has 28 effective points and should not launch 6-level clubs.',
    dealer: 'N',
    targetSide: 'NS',
    expectation: 'avoid-slam',
    knownIssue: true,
    hands: {
      N: 'A8.AQJ2.AJ75.AK9',
      E: 'J964.T43.-.QJ8753',
      S: 'QT732.K85.98.T64',
      W: 'K5.976.KQT6432.2',
    },
  },
  {
    id: 'SLAM-OVERBID-3',
    note: 'NS should stay below 6NT with a 32-point ceiling.',
    dealer: 'S',
    targetSide: 'NS',
    expectation: 'avoid-slam',
    knownIssue: true,
    hands: {
      N: 'A3.Q97.AK8.AKT96',
      E: 'J875.AJT54.943.2',
      S: 'KT2.K3.Q652.J874',
      W: 'Q964.862.JT7.Q53',
    },
  },
  {
    id: 'SLAM-OVERBID-4',
    note: 'NS should never reach grand with only 29 effective points.',
    dealer: 'N',
    targetSide: 'NS',
    expectation: 'avoid-slam',
    knownIssue: true,
    hands: {
      N: 'A52.Q4.K432.AJT5',
      E: '9864.985.9865.94',
      S: 'Q73.762.AQJ.KQ87',
      W: 'KJT.AKJT3.T7.632',
    },
  },
  {
    id: 'SLAM-OVERBID-5',
    note: 'NS at 29 effective points should stop below 6♣.',
    dealer: 'W',
    targetSide: 'NS',
    expectation: 'avoid-slam',
    knownIssue: true,
    hands: {
      N: 'AJ.QJ93.AQJT4.AK',
      E: 'QT975.T2.873.843',
      S: 'K864.865.K.QT976',
      W: '32.AK74.9652.J52',
    },
  },
  {
    id: 'SLAM-OVERBID-6',
    note: 'NS at 29 effective points should not jump to 6NT.',
    dealer: 'W',
    targetSide: 'NS',
    expectation: 'avoid-slam',
    knownIssue: true,
    hands: {
      N: 'JT7.432.Q2.KT863',
      E: 'Q865.T95.9873.74',
      S: 'K42.AK7.AT6.AQJ5',
      W: 'A93.QJ86.KJ54.92',
    },
  },
  {
    id: 'SLAM-OVERBID-7',
    note: 'EW with 28 effective points should stop below 6♣.',
    dealer: 'N',
    targetSide: 'EW',
    expectation: 'avoid-slam',
    knownIssue: true,
    hands: {
      N: '864.J8.KJ7.T8754',
      E: 'AKQT2.5.Q954.963',
      S: '975.Q9743.T863.A',
      W: 'J3.AKT62.A2.KQJ2',
    },
  },
  {
    id: 'SLAM-OVERBID-8',
    note: 'NS with 28 effective points should not drive to 6♠.',
    dealer: 'N',
    targetSide: 'NS',
    expectation: 'avoid-slam',
    knownIssue: true,
    hands: {
      N: 'AT862.KT96.JT9.K',
      E: 'QJ93.73.K642.T96',
      S: 'K5.A5.A75.AQJ753',
      W: '74.QJ842.Q83.842',
    },
  },
  {
    id: 'SLAM-OVERBID-9',
    note: 'EW with 28 effective points should avoid 6♠.',
    dealer: 'S',
    targetSide: 'EW',
    expectation: 'avoid-slam',
    knownIssue: true,
    hands: {
      N: 'Q65.8764.T974.Q3',
      E: 'AKJT9.AJ5.8.JT72',
      S: '872.Q2.QJ32.K954',
      W: '43.KT93.AK65.A86',
    },
  },
  {
    id: 'SLAM-OVERBID-10',
    note: 'NS with only 27 effective points should stop below 6♠.',
    dealer: 'W',
    targetSide: 'NS',
    expectation: 'avoid-slam',
    knownIssue: true,
    hands: {
      N: '52.AK4.AJ4.98532',
      E: 'J83.Q985.753.J64',
      S: 'AQ976.T3.K982.AQ',
      W: 'KT4.J762.QT6.KT7',
    },
  },
  {
    id: 'SLAM-OVERBID-11',
    note: 'NS with 27 effective points should not jump to 6NT.',
    dealer: 'S',
    targetSide: 'NS',
    expectation: 'avoid-slam',
    knownIssue: true,
    hands: {
      N: 'AJ9.KJ3.AKT2.AT6',
      E: 'KQT5.AT87.4.KQ87',
      S: '843.Q62.QJ763.95',
      W: '762.954.985.J432',
    },
  },
  {
    id: 'SLAM-OVERBID-12',
    note: 'EW at 27 effective points should avoid 6♥.',
    dealer: 'E',
    targetSide: 'EW',
    expectation: 'avoid-slam',
    knownIssue: true,
    hands: {
      N: 'QT54.K765.8752.3',
      E: 'A63.T3.Q63.AQJ64',
      S: 'J2.942.AT9.K9752',
      W: 'K987.AQJ8.KJ4.T8',
    },
  },
  {
    id: 'SLAM-OVERBID-13',
    note: 'EW with only 27 effective points should not bid 6NT.',
    dealer: 'N',
    targetSide: 'EW',
    expectation: 'avoid-slam',
    knownIssue: true,
    hands: {
      N: 'T.AJ7.KQ95.QJT73',
      E: 'K74.9865.T876.84',
      S: 'QJ9532.4.J432.96',
      W: 'A86.KQT32.A.AK52',
    },
  },
  {
    id: 'SLAM-GOOD-1',
    note: 'EW has proper slam values; should be able to bid a small slam.',
    dealer: 'E',
    targetSide: 'EW',
    expectation: 'reach-slam',
    hands: {
      N: '83.KJ.T8743.T754',
      E: 'A542.AT743.2.AJ3',
      S: 'KJ9.Q865.J965.62',
      W: 'QT76.92.AKQ.KQ98',
    },
  },
  {
    id: 'SLAM-GOOD-2',
    note: 'Strong NS values should still be able to reach 6NT.',
    dealer: 'N',
    targetSide: 'NS',
    expectation: 'reach-slam',
    hands: {
      N: 'AQ.AKQJ3.K75.AK4',
      E: '865.T9.AT83.9852',
      S: 'J3.654.Q642.QJT6',
      W: 'KT9742.872.J9.73',
    },
  },
  {
    id: 'SLAM-GOOD-3',
    note: 'Strong NS fit with controls should reach a slam safely.',
    dealer: 'E',
    targetSide: 'NS',
    expectation: 'reach-slam',
    hands: {
      N: 'AKQ8.JT8.KQJ7.KQ',
      E: 'J97.432.T632.654',
      S: '6542.AKQ9.-.AJ973',
      W: 'T3.765.A9854.T82',
    },
  },
];

function main() {
  const strict = process.argv.includes('--strict');
  let passing = 0;
  let knownFalls = 0;
  let unexpected = 0;

  console.log('Slam Dealt-Hand Harness');
  console.log('=======================');
  console.log('Use --strict to fail on known issues.\n');

  for (const scenario of SCENARIOS) {
    const result = runScenario(scenario);
    printScenarioResult(scenario, result);
    if (result.ok) passing++;
    else if (scenario.knownIssue) knownFalls++;
    else unexpected++;
  }

  console.log('-----------------------');
  console.log(`Passing: ${passing}`);
  console.log(`Known fall downs: ${knownFalls}`);
  console.log(`Unexpected failures: ${unexpected}`);

  const shouldFail = unexpected > 0 || (strict && knownFalls > 0);
  if (shouldFail) process.exit(1);
}

/**
 * @param {SlamScenario} scenario
 */
function runScenario(scenario) {
  const sim = simulateAuctionForScenario(scenario);
  const audit = auditSimulation(sim);
  const contract = sim.finalContract;
  const contractStr = contract ? `${contract.level}${STRAIN_SYMBOLS[contract.strain]}` : 'Passed Out';
  const declaringSide = sideForSeat(sim.declarer);
  const sideStats = scenario.targetSide === 'NS' ? audit.nsAnalysis : audit.ewAnalysis;
  const threshold = contract ? pointsNeededForContract(contract.level, contract.strain) : 0;
  const shortfall = threshold - sideStats.combinedEffectivePts;
  const ok = meetsExpectation(scenario, contract, declaringSide);

  return { ok, sim, contractStr, declaringSide, sideStats, threshold, shortfall };
}

/**
 * @param {SlamScenario} scenario
 * @param {import('./src/model/bid.js').ContractBid | null} contract
 * @param {Side | null} declaringSide
 */
function meetsExpectation(scenario, contract, declaringSide) {
  if (scenario.expectation === 'avoid-slam') {
    return !(declaringSide === scenario.targetSide && contract && contract.level >= 6);
  }
  return declaringSide === scenario.targetSide && !!contract && contract.level >= 6;
}

/**
 * @param {SlamScenario} scenario
 * @param {{
 *   ok: boolean,
 *   sim: ReturnType<typeof simulateAuctionForScenario>,
 *   contractStr: string,
 *   declaringSide: Side | null,
 *   sideStats: import('./src/engine/audit.js').PartnershipAnalysis,
 *   threshold: number,
 *   shortfall: number,
 * }} result
 */
function printScenarioResult(scenario, result) {
  const status = result.ok ? 'PASS' : (scenario.knownIssue ? 'KNOWN ISSUE' : 'FAIL');
  console.log(`[${scenario.id}] ${status}`);
  console.log(`  ${scenario.note}`);
  console.log(`  Contract: ${result.contractStr} (${result.declaringSide || 'none'} declarer side)`);
  console.log(
    `  ${SIDE_NAMES[scenario.targetSide]}: ${result.sideStats.combinedHcp} HCP, ` +
    `${result.sideStats.combinedEffectivePts} effective points`
  );
  if (result.sim.finalContract) {
    console.log(
      `  Contract threshold: ~${result.threshold}, shortfall=${result.shortfall > 0 ? result.shortfall : 0}`
    );
  }
  if (!result.ok) {
    const auction = result.sim.bidLog.map(e => `${e.seat}:${e.bidStr}`).join(' ');
    console.log(`  Auction: ${auction}`);
  }
  console.log('');
}

/**
 * @param {SlamScenario} scenario
 */
function simulateAuctionForScenario(scenario) {
  const hands = buildDeal(scenario.hands);
  let auction = createAuction(scenario.dealer);
  const bidLog = [];

  while (!isComplete(auction) && auction.bids.length < MAX_BIDS) {
    const seat = currentSeat(auction);
    const recs = safeRecommendations(hands[seat], auction, seat, bidLog);
    const chosen = recs[0] || { bid: pass(), priority: 0, explanation: 'No recommendations' };
    auction = safeAddBid(auction, chosen, seat, bidLog);
  }

  const finalContract = lastContractBid(auction);
  return {
    hands,
    dealer: scenario.dealer,
    auction,
    bidLog,
    finalContract,
    declarer: finalContract ? findDeclarer(auction, finalContract) : null,
    aborted: auction.bids.length >= MAX_BIDS && !isComplete(auction),
  };
}

function safeRecommendations(hand, auction, seat, bidLog) {
  try {
    return getRecommendations(hand, auction, seat);
  } catch (error) {
    bidLog.push({ seat, bidStr: 'Pass', explanation: `ENGINE EXCEPTION: ${error.message}` });
    return [{ bid: pass(), priority: 0, explanation: 'Engine exception' }];
  }
}

function safeAddBid(auction, chosen, seat, bidLog) {
  try {
    const next = addBid(auction, chosen.bid);
    bidLog.push({ seat, bidStr: bidToString(chosen.bid), explanation: chosen.explanation });
    return next;
  } catch (error) {
    const fallback = addBid(auction, pass());
    bidLog.push({ seat, bidStr: 'Pass', explanation: `ILLEGAL BID: ${error.message}` });
    return fallback;
  }
}

/**
 * @param {Record<Seat, string>} dotHands
 */
function buildDeal(dotHands) {
  return {
    N: handFromDotString(dotHands.N),
    E: handFromDotString(dotHands.E),
    S: handFromDotString(dotHands.S),
    W: handFromDotString(dotHands.W),
  };
}

/**
 * @param {string} dotString
 */
function handFromDotString(dotString) {
  const parts = dotString.split('.');
  if (parts.length !== 4) throw new Error(`Invalid hand format: ${dotString}`);
  const cards = [];
  for (let i = 0; i < 4; i++) addSuitCards(cards, parts[i], SUIT_BY_INDEX[i], dotString);
  return createHand(cards);
}

function addSuitCards(cards, suitText, suit, original) {
  const ranks = suitText === '-' ? '' : suitText;
  for (const ch of ranks) {
    const rank = RANK_BY_CHAR[ch];
    if (!rank) throw new Error(`Invalid rank '${ch}' in hand ${original}`);
    cards.push(createCard(suit, rank));
  }
}

function sideForSeat(seat) {
  if (!seat) return null;
  return SIDE_SEATS.NS.includes(seat) ? 'NS' : 'EW';
}

function pointsNeededForContract(level, strain) {
  if (level === 7) return 37;
  if (level === 6) return 33;
  if (level === 5 && (strain === 'C' || strain === 'D')) return 29;
  if (level === 4 && (strain === 'H' || strain === 'S')) return 26;
  if (level === 3 && strain === 'NT') return 25;
  if (level >= 4 && strain === 'NT') return 25 + (level - 3) * 3;
  if (level >= 4 && (strain === 'H' || strain === 'S')) return 26 + (level - 4) * 3;
  if (level >= 5 && (strain === 'C' || strain === 'D')) return 29 + (level - 5) * 3;
  if (level === 3) return 23;
  if (level === 2) return 20;
  return 0;
}

function findDeclarer(auction, contract) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  const lastContractSeat = findLastContractSeat(auction, dealerIdx);
  if (!lastContractSeat) return null;

  const declaringSide = [lastContractSeat, PARTNER[lastContractSeat]];
  for (let i = 0; i < auction.bids.length; i++) {
    const bid = auction.bids[i];
    const seat = SEATS[(dealerIdx + i) % SEATS.length];
    if (bid.type === 'contract' && bid.strain === contract.strain && declaringSide.includes(seat)) {
      return seat;
    }
  }
  return null;
}

function findLastContractSeat(auction, dealerIdx) {
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    if (auction.bids[i].type === 'contract') {
      return SEATS[(dealerIdx + i) % SEATS.length];
    }
  }
  return null;
}

main();

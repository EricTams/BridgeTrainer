import { SEATS } from '../model/deal.js';
import {
  STRAIN_SYMBOLS, STRAIN_ORDER, lastContractBid,
  createAuction, addBid, pass, bidToString,
} from '../model/bid.js';
import { evaluate } from './evaluate.js';
import { groupBySuit } from '../model/hand.js';
import { SUIT_ORDER } from '../model/card.js';
import { getRecommendations } from './advisor.js';

/**
 * @typedef {import('../model/deal.js').Deal} Deal
 * @typedef {import('../model/deal.js').Seat} Seat
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('../model/bid.js').ContractBid} ContractBid
 * @typedef {import('../model/hand.js').Hand} Hand
 * @typedef {import('./evaluate.js').Evaluation} Evaluation
 * @typedef {import('../testing/simulator.js').SimulationResult} SimulationResult
 * @typedef {import('../testing/simulator.js').BidLogEntry} BidLogEntry
 */

/**
 * @typedef {'NS' | 'EW'} Partnership
 *
 * @typedef {{
 *   partnership: Partnership,
 *   seats: [Seat, Seat],
 *   combinedHcp: number,
 *   combinedTotalPts: number,
 *   bestFitSuit: import('../model/card.js').Suit,
 *   bestFitLength: number,
 *   hasMajorFit: boolean,
 *   expectedLevel: string,
 *   suitFits: { suit: import('../model/card.js').Suit, length: number }[],
 * }} PartnershipAnalysis
 *
 * @typedef {{ bidIndex: number, seat: Seat, actual: string, desired: string }} BlockedBid
 *
 * @typedef {{
 *   blockedBids: BlockedBid[],
 *   interferenceBids: number,
 * }} InterferenceStats
 *
 * @typedef {{
 *   nsAnalysis: PartnershipAnalysis,
 *   ewAnalysis: PartnershipAnalysis,
 *   winningSide: Partnership | null,
 *   actualContract: string,
 *   declarer: Seat | null,
 *   expectedForWinner: string,
 *   verdict: string,
 *   bidIssues: string[],
 *   interferenceStats: InterferenceStats | null,
 * }} AuditResult
 */

/** @type {Record<Seat, Seat>} */
const PARTNER = { N: 'S', S: 'N', E: 'W', W: 'E' };
const SEAT_NAMES = /** @type {Record<Seat, string>} */ ({ N: 'North', E: 'East', S: 'South', W: 'West' });

/**
 * Audit a completed simulation, comparing actual result to expected.
 * @param {SimulationResult} sim
 * @returns {AuditResult}
 */
export function auditSimulation(sim) {
  const nsAnalysis = analyzePartnership('NS', ['N', 'S'], sim.hands);
  const ewAnalysis = analyzePartnership('EW', ['E', 'W'], sim.hands);

  const winningSide = sim.declarer
    ? (sim.declarer === 'N' || sim.declarer === 'S' ? 'NS' : 'EW')
    : null;

  const actualContract = sim.finalContract
    ? `${sim.finalContract.level}${STRAIN_SYMBOLS[sim.finalContract.strain]}`
    : 'Passed Out';

  const winnerAnalysis = winningSide === 'NS' ? nsAnalysis : winningSide === 'EW' ? ewAnalysis : null;
  const expectedForWinner = winnerAnalysis ? winnerAnalysis.expectedLevel : 'Pass';

  const verdict = computeVerdict(sim, winningSide, winnerAnalysis, nsAnalysis, ewAnalysis);
  const bidIssues = findBidIssues(sim.bidLog);

  /** @type {InterferenceStats | null} */
  let interferenceStats = null;
  if (winningSide && (verdict.startsWith('INTERFERENCE') || verdict.startsWith('PREEMPT'))) {
    const losingSide = winningSide === 'NS' ? 'EW' : 'NS';
    interferenceStats = analyzeInterference(sim, losingSide, winningSide);
  }

  return {
    nsAnalysis,
    ewAnalysis,
    winningSide,
    actualContract,
    declarer: sim.declarer,
    expectedForWinner,
    verdict,
    bidIssues,
    interferenceStats,
  };
}

/**
 * Analyze a partnership's combined strength and expected contract level.
 * @param {Partnership} partnership
 * @param {Seat[]} seats
 * @param {Deal} hands
 * @returns {PartnershipAnalysis}
 */
function analyzePartnership(partnership, seats, hands) {
  const eval0 = evaluate(hands[seats[0]]);
  const eval1 = evaluate(hands[seats[1]]);

  const combinedHcp = eval0.hcp + eval1.hcp;
  const combinedTotalPts = eval0.totalPoints + eval1.totalPoints;

  const suitFits = computeFits(hands[seats[0]], hands[seats[1]]);

  const majorFits = suitFits.filter(f => (f.suit === 'S' || f.suit === 'H') && f.length >= 8);
  const hasMajorFit = majorFits.length > 0;

  const bestFit = suitFits[0];

  const expectedLevel = computeExpectedLevel(combinedHcp, combinedTotalPts, hasMajorFit, bestFit);

  return {
    partnership,
    seats: /** @type {[Seat, Seat]} */ (seats),
    combinedHcp,
    combinedTotalPts,
    bestFitSuit: bestFit.suit,
    bestFitLength: bestFit.length,
    hasMajorFit,
    expectedLevel,
    suitFits,
  };
}

/**
 * Compute combined suit lengths for a partnership, sorted by length desc.
 * Majors break ties over minors at equal length.
 * @param {Hand} hand1
 * @param {Hand} hand2
 * @returns {{ suit: import('../model/card.js').Suit, length: number }[]}
 */
function computeFits(hand1, hand2) {
  const g1 = groupBySuit(hand1);
  const g2 = groupBySuit(hand2);

  const fits = SUIT_ORDER.map(suit => ({
    suit,
    length: /** @type {import('../model/card.js').Card[]} */ (g1.get(suit)).length +
            /** @type {import('../model/card.js').Card[]} */ (g2.get(suit)).length,
  }));

  fits.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const majorOrder = ['S', 'H', 'D', 'C'];
    return majorOrder.indexOf(a.suit) - majorOrder.indexOf(b.suit);
  });

  return fits;
}

/**
 * Determine the expected contract level based on combined strength.
 * @param {number} hcp
 * @param {number} totalPts
 * @param {boolean} hasMajorFit
 * @param {{ suit: import('../model/card.js').Suit, length: number }} bestFit
 * @returns {string}
 */
function computeExpectedLevel(hcp, totalPts, hasMajorFit, bestFit) {
  if (totalPts >= 37) {
    if (hasMajorFit) return '7M (grand slam in major)';
    return '7NT (grand slam)';
  }
  if (totalPts >= 33) {
    if (hasMajorFit) return '6M (small slam in major)';
    return '6NT (small slam)';
  }
  if (totalPts >= 26) {
    if (hasMajorFit) return '4M (major game)';
    if (bestFit.length >= 9 && (bestFit.suit === 'D' || bestFit.suit === 'C')) {
      return '5m (minor game)';
    }
    return '3NT (notrump game)';
  }
  if (totalPts >= 23) {
    return 'Invitational (partial or game)';
  }
  if (totalPts >= 20) {
    return 'Partscore';
  }
  return 'Pass / low partscore';
}

/**
 * For each bid by the losing (stronger) side, rebuild the auction with the
 * immediately preceding opponent bid replaced by a Pass, re-run the engine,
 * and check if the recommended bid differs from what was actually played.
 * @param {SimulationResult} sim
 * @param {Partnership} losingSide
 * @param {Partnership} winningSide
 * @returns {InterferenceStats}
 */
function analyzeInterference(sim, losingSide, winningSide) {
  const loserSeats = losingSide === 'NS' ? ['N', 'S'] : ['E', 'W'];
  const winnerSeats = winningSide === 'NS' ? ['N', 'S'] : ['E', 'W'];
  const bids = sim.auction.bids;
  const dealerIdx = SEATS.indexOf(sim.auction.dealer);

  let interferenceBids = 0;
  /** @type {BlockedBid[]} */
  const blockedBids = [];

  for (let i = 0; i < sim.bidLog.length; i++) {
    const entry = sim.bidLog[i];

    if (winnerSeats.includes(entry.seat) &&
        entry.bidStr !== 'Pass' && entry.bidStr !== 'X' && entry.bidStr !== 'XX') {
      interferenceBids++;
    }

    if (!loserSeats.includes(entry.seat)) continue;
    if (i === 0) continue;

    const prev = sim.bidLog[i - 1];
    if (prev.bidStr === 'Pass' || prev.bidStr === 'X' || prev.bidStr === 'XX') continue;
    if (!winnerSeats.includes(prev.seat)) continue;

    // Rebuild auction up to i-1 with that bid replaced by Pass
    let cleanAuction = createAuction(sim.auction.dealer);
    try {
      for (let j = 0; j < i - 1; j++) {
        cleanAuction = addBid(cleanAuction, bids[j]);
      }
      cleanAuction = addBid(cleanAuction, pass());
    } catch (_) {
      continue;
    }

    const seat = /** @type {Seat} */ (entry.seat);
    let recs;
    try {
      recs = getRecommendations(sim.hands[seat], cleanAuction, seat);
    } catch (_) {
      continue;
    }
    if (recs.length === 0) continue;

    const desired = bidToString(recs[0].bid);
    if (desired !== entry.bidStr) {
      blockedBids.push({ bidIndex: i, seat, actual: entry.bidStr, desired });
    }
  }

  return { blockedBids, interferenceBids };
}

/**
 * Detect whether the winning side's first action was a preemptive opening or
 * overcall (weak 2, 3+ level bid, or explanation containing "weak"/"preempt").
 * @param {BidLogEntry[]} bidLog
 * @param {Partnership} winningSide
 * @returns {boolean}
 */
function didSidePreempt(bidLog, winningSide) {
  const sideSeats = winningSide === 'NS' ? ['N', 'S'] : ['E', 'W'];

  for (const entry of bidLog) {
    if (!sideSeats.includes(entry.seat)) continue;
    if (entry.bidStr === 'Pass') continue;

    const levelMatch = entry.bidStr.match(/^(\d)/);
    if (!levelMatch) return false;

    const level = parseInt(levelMatch[1]);
    if (level >= 3) return true;

    if (level === 2 && !entry.bidStr.includes('\u2663')) {
      const expl = entry.explanation.toLowerCase();
      if (expl.includes('weak') || expl.includes('preempt')) return true;
    }

    return false;
  }
  return false;
}

/**
 * Detect whether both sides made at least one contract bid (not just
 * pass/double/redouble), indicating a contested auction.
 * @param {BidLogEntry[]} bidLog
 * @returns {boolean}
 */
function wasCompetitiveAuction(bidLog) {
  let nsBid = false;
  let ewBid = false;
  for (const entry of bidLog) {
    if (entry.bidStr === 'Pass' || entry.bidStr === 'X' || entry.bidStr === 'XX') continue;
    if (entry.seat === 'N' || entry.seat === 'S') nsBid = true;
    else ewBid = true;
    if (nsBid && ewBid) return true;
  }
  return false;
}

/**
 * Produce a verdict comparing actual contract to expected.
 * @param {SimulationResult} sim
 * @param {Partnership | null} winningSide
 * @param {PartnershipAnalysis | null} winnerAnalysis
 * @param {PartnershipAnalysis} nsAnalysis
 * @param {PartnershipAnalysis} ewAnalysis
 * @returns {string}
 */
function computeVerdict(sim, winningSide, winnerAnalysis, nsAnalysis, ewAnalysis) {
  if (sim.aborted) return 'ABORTED: Auction exceeded max bids (likely engine loop)';

  if (!sim.finalContract) {
    const strongerSide = nsAnalysis.combinedHcp >= ewAnalysis.combinedHcp ? nsAnalysis : ewAnalysis;
    if (strongerSide.combinedTotalPts >= 20) {
      return `UNDERBID: Passed out but ${strongerSide.partnership} has ${strongerSide.combinedHcp} combined HCP (${strongerSide.combinedTotalPts} total pts) — expected ${strongerSide.expectedLevel}`;
    }
    return 'REASONABLE: Passed out with neither side having clear values';
  }

  if (!winnerAnalysis || !winningSide) return 'Unable to determine winner';

  const level = sim.finalContract.level;
  const strain = sim.finalContract.strain;
  const pts = winnerAnalysis.combinedTotalPts;
  const hcp = winnerAnalysis.combinedHcp;

  const isGame = (strain === 'NT' && level >= 3) ||
                 ((strain === 'H' || strain === 'S') && level >= 4) ||
                 ((strain === 'C' || strain === 'D') && level >= 5);
  const isSlam = level >= 6;
  const isGrand = level === 7;

  const loserAnalysis = winningSide === 'NS' ? ewAnalysis : nsAnalysis;
  const competitive = wasCompetitiveAuction(sim.bidLog);

  if (loserAnalysis.combinedTotalPts > winnerAnalysis.combinedTotalPts + 3) {
    const ptDiff = loserAnalysis.combinedTotalPts - winnerAnalysis.combinedTotalPts;
    const preempted = didSidePreempt(sim.bidLog, winningSide);
    const loserPts = loserAnalysis.combinedTotalPts;

    if (ptDiff <= 5 && loserPts < 26) {
      return 'REASONABLE: Competitive hand — both sides have similar values';
    }

    if (preempted) {
      if (loserPts >= 33) {
        return `PREEMPT: ${winningSide} shut out ${loserAnalysis.partnership} slam (${loserAnalysis.combinedHcp} HCP, ${loserPts} pts) — opponents should overcome`;
      }
      if (loserPts >= 26) {
        return `PREEMPT: ${winningSide} disrupted ${loserAnalysis.partnership} game (${loserAnalysis.combinedHcp} HCP, ${loserPts} pts)`;
      }
      return `PREEMPT: ${winningSide} effective — ${loserAnalysis.partnership} (${loserAnalysis.combinedHcp} HCP) lacked game values`;
    }

    if (loserPts < 26) {
      return `ACCEPTABLE: ${winningSide} competed well; ${loserAnalysis.partnership} (${loserAnalysis.combinedHcp} HCP) lacks game values`;
    }

    if (competitive) {
      return `INTERFERENCE: ${loserAnalysis.partnership} (${loserAnalysis.combinedHcp} HCP) outbid in competitive auction`;
    }

    return `WRONG SIDE: ${loserAnalysis.partnership} has more strength (${loserAnalysis.combinedHcp} HCP) but lost the auction to ${winningSide}`;
  }

  if (isGrand) {
    if (pts < 37) return competitive
      ? `INTERFERENCE: Grand slam overbid in contested auction (${pts} pts)`
      : `OVERBID: Grand slam with only ${pts} total pts (need ~37)`;
    return 'EXCELLENT: Grand slam reached with appropriate strength';
  }

  if (isSlam) {
    if (pts < 33) return competitive
      ? `INTERFERENCE: Slam overbid in contested auction (${pts} pts)`
      : `OVERBID: Slam with only ${pts} total pts (need ~33)`;
    return 'GOOD: Slam reached with appropriate strength';
  }

  if (isGame) {
    if (pts < 23) return competitive
      ? `INTERFERENCE: Game overbid in contested auction (${pts} pts)`
      : `OVERBID: Game contract with only ${pts} total pts`;
    if (pts >= 26) return 'GOOD: Game reached with game-level values';
    return 'ACCEPTABLE: Game reached on invitational values';
  }

  if (pts >= 26) {
    const fitNote = winnerAnalysis.hasMajorFit
      ? ` (${winnerAnalysis.partnership} has ${winnerAnalysis.bestFitLength}-card ${winnerAnalysis.bestFitSuit === 'S' ? 'spade' : 'heart'} fit)`
      : '';
    return competitive
      ? `INTERFERENCE: ${winningSide} underbid in contested auction (${pts} pts)${fitNote}`
      : `UNDERBID: Stopped at partscore with ${pts} total pts — expected ${winnerAnalysis.expectedLevel}${fitNote}`;
  }

  if (pts >= 23) return 'REASONABLE: Partscore on invitational values (game was close)';

  return 'REASONABLE: Partscore level consistent with combined strength';
}

/**
 * Find notable issues in the bid log.
 * @param {BidLogEntry[]} bidLog
 * @returns {string[]}
 */
function findBidIssues(bidLog) {
  /** @type {string[]} */
  const issues = [];

  for (let i = 0; i < bidLog.length; i++) {
    const entry = bidLog[i];

    if (entry.explanation.includes('ENGINE EXCEPTION')) {
      issues.push(`Bid ${i + 1} (${entry.seat}): Engine crashed — ${entry.explanation}`);
    }
    if (entry.explanation.includes('ILLEGAL BID')) {
      issues.push(`Bid ${i + 1} (${entry.seat}): Illegal bid recommended — ${entry.explanation}`);
    }
    if (entry.explanation.includes('No recommendations')) {
      issues.push(`Bid ${i + 1} (${entry.seat}): Engine produced no recommendations`);
    }
    if (entry.priority <= 2 && entry.bidStr !== 'Pass') {
      issues.push(`Bid ${i + 1} (${entry.seat}): Low confidence ${entry.bidStr} (priority ${entry.priority})`);
    }
  }

  return issues;
}

/**
 * Format a full audit report as readable text.
 * @param {SimulationResult} sim
 * @param {AuditResult} audit
 * @returns {string}
 */
export function formatAuditReport(sim, audit) {
  const lines = [];
  const SUIT_SYM = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };

  lines.push('╔══════════════════════════════════════════════════════════════════╗');
  lines.push('║                    BRIDGE AUCTION ANALYSIS                      ║');
  lines.push('╚══════════════════════════════════════════════════════════════════╝');
  lines.push('');

  lines.push(`Dealer: ${SEAT_NAMES[sim.dealer]}`);
  lines.push('');

  lines.push('── Hands ──────────────────────────────────────────────────────────');
  const { formatHandLine } = handFormatter();
  for (const seat of SEATS) {
    lines.push(formatHandLine(seat, sim.hands[seat]));
  }
  lines.push('');

  lines.push('── Partnership Strength ───────────────────────────────────────────');
  for (const a of [audit.nsAnalysis, audit.ewAnalysis]) {
    const fitDesc = a.suitFits
      .filter(f => f.length >= 7)
      .map(f => `${SUIT_SYM[f.suit]}${f.length}`)
      .join(', ');
    lines.push(
      `  ${a.partnership}: ${a.combinedHcp} HCP, ${a.combinedTotalPts} total pts` +
      `  |  Fits: ${fitDesc || 'none ≥7'}` +
      `  |  Expected: ${a.expectedLevel}`
    );
  }
  lines.push('');

  lines.push('── Auction ────────────────────────────────────────────────────────');
  lines.push(formatAuctionTable(sim));
  lines.push('');

  const blockedByIndex = new Map();
  if (audit.interferenceStats) {
    for (const b of audit.interferenceStats.blockedBids) {
      blockedByIndex.set(b.bidIndex, b);
    }
  }

  lines.push('── Bid Detail ─────────────────────────────────────────────────────');
  for (let i = 0; i < sim.bidLog.length; i++) {
    const e = sim.bidLog[i];
    const alts = e.alternatives.length > 0
      ? `  [also: ${e.alternatives.map(a => `${a.bidStr}(${a.priority})`).join(', ')}]`
      : '';
    const blocked = blockedByIndex.get(i);
    const blockedTag = blocked ? `  \u25C4 wanted ${blocked.desired}` : '';
    lines.push(`  ${String(i + 1).padStart(2)}. ${e.seat} ${e.bidStr.padEnd(6)} p=${String(e.priority).padEnd(4)} ${e.explanation}${alts}${blockedTag}`);
  }
  lines.push('');

  if (audit.interferenceStats && audit.interferenceStats.blockedBids.length > 0) {
    const stats = audit.interferenceStats;
    lines.push('── Interference ───────────────────────────────────────────────────');
    lines.push(`  ${stats.interferenceBids} interference bid(s), ${stats.blockedBids.length} bid(s) blocked:`);
    for (const b of stats.blockedBids) {
      lines.push(`    Bid ${b.bidIndex + 1} (${b.seat}): played ${b.actual}, wanted ${b.desired}`);
    }
    lines.push('');
  }

  if (audit.bidIssues.length > 0) {
    lines.push('── Issues ─────────────────────────────────────────────────────────');
    for (const issue of audit.bidIssues) {
      lines.push(`  \u26A0 ${issue}`);
    }
    lines.push('');
  }

  lines.push('── Result ─────────────────────────────────────────────────────────');
  if (sim.aborted) {
    lines.push('  ABORTED (auction exceeded max bids)');
  } else if (sim.finalContract && sim.declarer) {
    const contractStr = `${sim.finalContract.level}${STRAIN_SYMBOLS[sim.finalContract.strain]}`;
    lines.push(`  Contract: ${contractStr} by ${SEAT_NAMES[sim.declarer]}`);
  } else {
    lines.push('  Passed Out');
  }
  lines.push('');

  lines.push('── Verdict ────────────────────────────────────────────────────────');
  lines.push(`  ${audit.verdict}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Format the auction as a traditional bridge bidding table.
 * @param {SimulationResult} sim
 * @returns {string}
 */
function formatAuctionTable(sim) {
  const cols = SEATS.map(s => SEAT_NAMES[s].slice(0, 5));
  const header = `  ${cols.map(c => c.padEnd(8)).join('')}`;
  const divider = `  ${'-'.repeat(32)}`;

  const startIdx = SEATS.indexOf(sim.dealer);
  const paddedBids = [];
  for (let i = 0; i < startIdx; i++) paddedBids.push('');
  for (const entry of sim.bidLog) paddedBids.push(entry.bidStr);

  const rows = [];
  for (let i = 0; i < paddedBids.length; i += 4) {
    const row = [];
    for (let j = 0; j < 4; j++) {
      row.push((paddedBids[i + j] ?? '').padEnd(8));
    }
    rows.push(`  ${row.join('')}`);
  }

  return [header, divider, ...rows].join('\n');
}

/**
 * Create a hand formatter using the evaluate + groupBySuit utilities.
 */
function handFormatter() {
  const SUIT_SYM = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663' };
  const RANK_NAMES = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: 'T', 9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2' };

  /**
   * @param {Seat} seat
   * @param {Hand} hand
   * @returns {string}
   */
  function formatHandLine(seat, hand) {
    const ev = evaluate(hand);
    const groups = groupBySuit(hand);
    const suitStrs = SUIT_ORDER.map(s => {
      const cards = /** @type {import('../model/card.js').Card[]} */ (groups.get(s));
      return `${SUIT_SYM[s]}${cards.map(c => RANK_NAMES[c.rank]).join('')}`;
    });

    return `  ${SEAT_NAMES[seat].padEnd(6)} ${suitStrs.join(' ').padEnd(28)} (${ev.hcp} HCP, ${ev.shape.join('-')}, ${ev.shapeClass})`;
  }

  return { formatHandLine };
}

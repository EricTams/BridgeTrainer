import { simulateAuction } from './src/testing/simulator.js';
import { auditSimulation, formatAuditReport } from './src/engine/audit.js';
import { evaluate, shapeString } from './src/engine/evaluate.js';
import { STRAIN_SYMBOLS } from './src/model/bid.js';
import { groupBySuit } from './src/model/hand.js';
import { SUIT_ORDER, SUIT_SYMBOLS, RANK_NAMES } from './src/model/card.js';
import { SEATS } from './src/model/deal.js';

const N = parseInt(process.argv[2] || '100', 10);
const verbose = process.argv.includes('--verbose');

const PARTNER = { N: 'S', S: 'N', E: 'W', W: 'E' };
const SEAT_NAMES = { N: 'North', E: 'East', S: 'South', W: 'West' };

const LEVEL_THRESHOLDS = [
  { level: 7, strain: 'suit', pts: 37, label: 'Grand Slam (suit)' },
  { level: 7, strain: 'NT',   pts: 37, label: 'Grand Slam (NT)' },
  { level: 6, strain: 'suit', pts: 33, label: 'Small Slam (suit)' },
  { level: 6, strain: 'NT',   pts: 33, label: 'Small Slam (NT)' },
  { level: 5, strain: 'minor', pts: 29, label: 'Minor Game' },
  { level: 4, strain: 'major', pts: 26, label: 'Major Game' },
  { level: 3, strain: 'NT',   pts: 25, label: '3NT Game' },
  { level: 3, strain: 'suit', pts: 23, label: '3-level (invitational)' },
  { level: 2, strain: 'suit', pts: 20, label: '2-level (partscore)' },
];

function tricksNeeded(level) {
  return level + 6;
}

function pointsNeededForLevel(level, strain) {
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

function formatHand(hand) {
  const groups = groupBySuit(hand);
  return SUIT_ORDER.map(s => {
    const cards = groups.get(s);
    return `${SUIT_SYMBOLS[s]}${cards.map(c => RANK_NAMES[c.rank]).join('') || '-'}`;
  }).join(' ');
}

function classifyOverbid(contract, declarerSide) {
  const { level, strain } = contract;
  const pts = declarerSide.combinedEffectivePts;
  const hcp = declarerSide.combinedHcp;
  const needed = pointsNeededForLevel(level, strain);
  const deficit = needed - pts;

  if (deficit <= 0) return null;

  let severity;
  if (deficit >= 10) severity = 'SEVERE';
  else if (deficit >= 6) severity = 'MAJOR';
  else if (deficit >= 3) severity = 'MODERATE';
  else severity = 'MINOR';

  return {
    severity,
    deficit,
    needed,
    actual: pts,
    hcp,
    tricks: tricksNeeded(level),
    contractStr: `${level}${STRAIN_SYMBOLS[strain]}`,
  };
}

let errors = 0;
let aborted = 0;
let passedOut = 0;
let totalContracts = 0;
const overbids = [];
const allResults = [];

for (let i = 0; i < N; i++) {
  let sim, audit;
  try {
    sim = simulateAuction();
    audit = auditSimulation(sim);
  } catch (e) {
    errors++;
    continue;
  }

  if (sim.aborted) { aborted++; continue; }
  if (!sim.finalContract || !sim.declarer) { passedOut++; continue; }

  totalContracts++;

  const winningSide = (sim.declarer === 'N' || sim.declarer === 'S') ? 'NS' : 'EW';
  const declarerSide = winningSide === 'NS' ? audit.nsAnalysis : audit.ewAnalysis;
  const contract = sim.finalContract;

  const ob = classifyOverbid(contract, declarerSide);
  if (ob) {
    overbids.push({ index: i + 1, sim, audit, overbid: ob, declarerSide, winningSide });
  }

  allResults.push({ index: i + 1, sim, audit, overbid: ob, declarerSide, winningSide });
}

console.log(`\n${'='.repeat(68)}`);
console.log('  OVERBID DETECTION — Bridge Auction Simulation');
console.log(`${'='.repeat(68)}`);
console.log(`  Hands dealt:       ${N}`);
console.log(`  Reached contract:  ${totalContracts}`);
console.log(`  Passed out:        ${passedOut}`);
console.log(`  Aborted:           ${aborted}`);
console.log(`  Engine errors:     ${errors}`);
console.log(`  Overbids found:    ${overbids.length}  (${(overbids.length / Math.max(totalContracts, 1) * 100).toFixed(1)}%)`);
console.log('');

const severityCounts = { SEVERE: 0, MAJOR: 0, MODERATE: 0, MINOR: 0 };
for (const { overbid } of overbids) {
  severityCounts[overbid.severity]++;
}
console.log('── Overbid Severity Breakdown ─────────────────────────────────────');
for (const [sev, count] of Object.entries(severityCounts)) {
  if (count > 0) {
    const bar = '█'.repeat(Math.round(count / Math.max(totalContracts, 1) * 50));
    console.log(`  ${sev.padEnd(10)} ${String(count).padStart(4)}  ${bar}`);
  }
}
console.log('');

const contractBuckets = {};
for (const { overbid } of overbids) {
  const key = overbid.contractStr;
  contractBuckets[key] = (contractBuckets[key] || 0) + 1;
}
if (Object.keys(contractBuckets).length > 0) {
  console.log('── Overbid by Contract Level ──────────────────────────────────────');
  const sorted = Object.entries(contractBuckets).sort((a, b) => b[1] - a[1]);
  for (const [contract, count] of sorted) {
    console.log(`  ${contract.padEnd(6)} ${String(count).padStart(4)} overbid(s)`);
  }
  console.log('');
}

if (overbids.length > 0) {
  console.log(`${'='.repeat(68)}`);
  console.log(`  OVERBID DETAILS (${overbids.length} hand${overbids.length !== 1 ? 's' : ''})`);
  console.log(`${'='.repeat(68)}\n`);

  for (const { index, sim, audit, overbid: ob, declarerSide, winningSide } of overbids) {
    const contract = sim.finalContract;
    const contractStr = `${contract.level}${STRAIN_SYMBOLS[contract.strain]}`;

    console.log(`──── Hand #${index} ────────────────────────────────────────────────`);
    console.log(`  Contract: ${contractStr} by ${SEAT_NAMES[sim.declarer]} (${winningSide})`);
    console.log(`  Severity: ${ob.severity} (need ~${ob.needed} pts, have ${ob.actual} effective pts, deficit ${ob.deficit})`);
    console.log(`  Combined HCP: ${ob.hcp}  |  Tricks needed: ${ob.tricks}`);
    console.log('');

    const seats = declarerSide.seats;
    for (const seat of seats) {
      const hand = sim.hands[seat];
      const ev = evaluate(hand);
      console.log(`  ${SEAT_NAMES[seat].padEnd(6)} ${formatHand(hand)}  (${ev.hcp} HCP, ${shapeString(ev.shape)}, ${ev.shapeClass})`);
    }

    const fitDesc = declarerSide.suitFits
      .filter(f => f.length >= 7)
      .map(f => `${SUIT_SYMBOLS[f.suit]}${f.length}`)
      .join(', ');
    console.log(`  Fit: ${fitDesc || 'none ≥7'}  |  Best: ${SUIT_SYMBOLS[declarerSide.bestFitSuit]}${declarerSide.bestFitLength}`);
    console.log(`  Expected: ${declarerSide.expectedLevel}`);
    console.log('');

    console.log('  Auction:');
    for (const entry of sim.bidLog) {
      const marker = declarerSide.seats.includes(entry.seat) ? '»' : ' ';
      console.log(`    ${marker} ${entry.seat}: ${entry.bidStr.padEnd(6)} ${entry.explanation}`);
    }
    console.log('');

    if (verbose) {
      console.log(formatAuditReport(sim, audit));
      console.log('');
    }
  }
}

if (overbids.length === 0) {
  console.log('No overbids detected in this run. The engine is bidding conservatively.\n');
} else {
  console.log(`${'='.repeat(68)}`);
  console.log('  SUMMARY');
  console.log(`${'='.repeat(68)}`);
  console.log(`  ${overbids.length} of ${totalContracts} contracts were overbids (${(overbids.length / totalContracts * 100).toFixed(1)}%)`);

  const worstDeficit = overbids.reduce((max, o) => Math.max(max, o.overbid.deficit), 0);
  const worst = overbids.find(o => o.overbid.deficit === worstDeficit);
  if (worst) {
    console.log(`  Worst overbid: Hand #${worst.index} — ${worst.overbid.contractStr} with ${worst.overbid.actual} pts (deficit ${worst.overbid.deficit})`);
  }

  const avgDeficit = overbids.reduce((sum, o) => sum + o.overbid.deficit, 0) / overbids.length;
  console.log(`  Average point deficit: ${avgDeficit.toFixed(1)}`);
  console.log('');
}

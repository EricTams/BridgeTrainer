#!/usr/bin/env node

/**
 * Run a single bridge game: deal random hands, run the full auction via the
 * engine, then display every hand, the bidding, and an evaluation of how
 * the auction went.
 *
 * Usage:
 *   node run-game.mjs           — one random deal
 *   node run-game.mjs 5         — five random deals
 *   node run-game.mjs --verbose — include bid-by-bid detail
 */

import { simulateAuction } from './src/testing/simulator.js';
import { auditSimulation, formatAuditReport } from './src/engine/audit.js';

const args = process.argv.slice(2);
const count = Math.max(1, parseInt(args.find(a => /^\d+$/.test(a)) ?? '1', 10));
const verbose = args.includes('--verbose') || args.includes('-v');

let totalGood = 0;
let totalAcceptable = 0;
let totalBad = 0;
let totalErrors = 0;

for (let i = 0; i < count; i++) {
  if (count > 1) {
    console.log(`\n${'='.repeat(68)}`);
    console.log(`  DEAL ${i + 1} of ${count}`);
    console.log(`${'='.repeat(68)}`);
  }

  let sim;
  try {
    sim = simulateAuction();
  } catch (e) {
    console.error(`Deal ${i + 1}: simulation crashed — ${e.message}`);
    totalErrors++;
    continue;
  }

  const audit = auditSimulation(sim);

  if (verbose || count === 1) {
    console.log(formatAuditReport(sim, audit));
  } else {
    printCompactSummary(i + 1, sim, audit);
  }

  if (audit.verdict.startsWith('GOOD') || audit.verdict.startsWith('EXCELLENT') || audit.verdict.startsWith('REASONABLE')) {
    totalGood++;
  } else if (audit.verdict.startsWith('ACCEPTABLE')) {
    totalAcceptable++;
  } else {
    totalBad++;
  }
}

if (count > 1) {
  console.log('\n' + '='.repeat(68));
  console.log('  SUMMARY');
  console.log('='.repeat(68));
  console.log(`  Deals:      ${count}`);
  console.log(`  Good:       ${totalGood}`);
  console.log(`  Acceptable: ${totalAcceptable}`);
  console.log(`  Issues:     ${totalBad}`);
  if (totalErrors > 0) console.log(`  Errors:     ${totalErrors}`);
  console.log('');
}

/**
 * @param {number} n
 * @param {import('./src/testing/simulator.js').SimulationResult} sim
 * @param {import('./src/engine/audit.js').AuditResult} audit
 */
function printCompactSummary(n, sim, audit) {
  const STRAIN_SYM = { C: '♣', D: '♦', H: '♥', S: '♠', NT: 'NT' };
  const contract = sim.finalContract
    ? `${sim.finalContract.level}${STRAIN_SYM[sim.finalContract.strain]}`
    : 'Pass';
  const declarer = sim.declarer ?? '-';
  const nsHcp = audit.nsAnalysis.combinedHcp;
  const ewHcp = audit.ewAnalysis.combinedHcp;
  const issues = audit.bidIssues.length > 0 ? `  [${audit.bidIssues.length} issues]` : '';

  console.log(
    `  #${String(n).padStart(2)}  ${contract.padEnd(5)} by ${declarer}  ` +
    `NS:${String(nsHcp).padStart(2)} EW:${String(ewHcp).padStart(2)}  ` +
    `${audit.verdict}${issues}`
  );
}

import { simulateAuction } from './src/testing/simulator.js';
import { auditSimulation, formatAuditReport } from './src/engine/audit.js';

const showUnblocked = process.argv.includes('--show-unblocked');
const N = 1000;
const verdictCounts = {};
const issueCounts = {};
let errors = 0;
let aborted = 0;

const problemDeals = [];
const interferenceDeals = [];

for (let i = 0; i < N; i++) {
  let sim, audit;
  try {
    sim = simulateAuction();
    audit = auditSimulation(sim);
  } catch (e) {
    errors++;
    continue;
  }

  if (sim.aborted) aborted++;

  const verdictTag = audit.verdict.split(':')[0].trim();
  verdictCounts[verdictTag] = (verdictCounts[verdictTag] || 0) + 1;

  for (const issue of audit.bidIssues) {
    const tag = issue.replace(/Bid \d+/, 'Bid N').replace(/\(.*?\)/g, '(...)');
    issueCounts[tag] = (issueCounts[tag] || 0) + 1;
  }

  if (audit.interferenceStats) {
    interferenceDeals.push({ sim, audit });
  }

  const isProblem = verdictTag === 'OVERBID' || verdictTag === 'UNDERBID' ||
                    verdictTag === 'WRONG SIDE' || verdictTag === 'ABORTED' ||
                    audit.bidIssues.length > 0;

  if (isProblem && problemDeals.length < 10) {
    problemDeals.push({ sim, audit });
  }
}

console.log(`\n${'='.repeat(64)}`);
console.log(`  BRIDGE AUCTION AUDIT — ${N} deals`);
console.log(`${'='.repeat(64)}\n`);

console.log(`Errors (engine crash): ${errors}`);
console.log(`Aborted (bid loop):    ${aborted}\n`);

console.log('── Verdict Distribution ───────────────────────────────────────');
const sortedVerdicts = Object.entries(verdictCounts).sort((a, b) => b[1] - a[1]);
for (const [tag, count] of sortedVerdicts) {
  const pct = ((count / N) * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(count / N * 50));
  console.log(`  ${tag.padEnd(14)} ${String(count).padStart(5)}  (${pct.padStart(5)}%)  ${bar}`);
}
console.log('');

const goodTags = ['GOOD', 'EXCELLENT', 'REASONABLE', 'ACCEPTABLE', 'PREEMPT', 'INTERFERENCE'];
const goodCount = sortedVerdicts
  .filter(([tag]) => goodTags.includes(tag))
  .reduce((sum, [, c]) => sum + c, 0);
const totalAudited = N - errors;
console.log(`Overall quality: ${goodCount}/${totalAudited} good/acceptable (${((goodCount / totalAudited) * 100).toFixed(1)}%)\n`);

if (Object.keys(issueCounts).length > 0) {
  console.log('── Issue Breakdown ────────────────────────────────────────────');
  const sortedIssues = Object.entries(issueCounts).sort((a, b) => b[1] - a[1]);
  for (const [tag, count] of sortedIssues) {
    console.log(`  ${String(count).padStart(4)}x  ${tag}`);
  }
  console.log('');
}

const unblockedDeals = interferenceDeals.filter(d => d.audit.interferenceStats.blockedBids.length === 0);

if (interferenceDeals.length > 0) {
  console.log('── Interference Summary ────────────────────────────────────────');
  const totalIntBids = interferenceDeals.reduce((s, d) => s + d.audit.interferenceStats.interferenceBids, 0);
  const totalBlocked = interferenceDeals.reduce((s, d) => s + d.audit.interferenceStats.blockedBids.length, 0);
  const threePlus = interferenceDeals.filter(d => d.audit.interferenceStats.blockedBids.length >= 3).length;

  console.log(`  Deals with interference analysis:  ${interferenceDeals.length}`);
  console.log(`  Avg interference bids/deal:        ${(totalIntBids / interferenceDeals.length).toFixed(1)}`);
  console.log(`  Avg blocked bids/deal:             ${(totalBlocked / interferenceDeals.length).toFixed(1)}`);
  console.log(`  Deals with 0 blocked bids:         ${unblockedDeals.length}  (stronger side had chances)`);
  console.log(`  Deals with 3+ blocked bids:        ${threePlus}  (effective disruption)`);
  console.log('');
}

if (showUnblocked && unblockedDeals.length > 0) {
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  0-BLOCKED INTERFERENCE DEALS (${unblockedDeals.length} found)`);
  console.log(`${'='.repeat(64)}\n`);
  for (let i = 0; i < unblockedDeals.length; i++) {
    const { sim, audit } = unblockedDeals[i];
    console.log(`──── Unblocked Deal ${i + 1} ────`);
    console.log(formatAuditReport(sim, audit));
    console.log('');
  }
} else if (problemDeals.length > 0) {
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  SAMPLE PROBLEM DEALS (${problemDeals.length} shown)`);
  console.log(`${'='.repeat(64)}\n`);
  for (let i = 0; i < problemDeals.length; i++) {
    const { sim, audit } = problemDeals[i];
    console.log(`──── Problem Deal ${i + 1} ────`);
    console.log(formatAuditReport(sim, audit));
    console.log('');
  }
}

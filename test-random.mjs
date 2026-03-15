import { simulateAuction, formatSimulations } from './src/testing/simulator.js';

const results = [];
const N = 20;
let errors = 0;
for (let i = 0; i < N; i++) {
  try {
    results.push(simulateAuction());
  } catch (e) {
    errors++;
    console.error(`Deal ${i+1} crashed: ${e.message}`);
  }
}

console.log(formatSimulations(results.slice(0, 3)));
console.log(`\n${N} deals simulated, ${errors} errors, ${results.filter(r => r.aborted).length} aborted.`);

/**
 * @typedef {import('./pool.js').Pool} Pool
 */

/**
 * Default balance factor.
 * 0 = natural frequency, 1 = uniform, 0.7 = biased toward rare scenarios.
 */
export const DEFAULT_BALANCE = 0.7;

/**
 * Weighted-random selection of a scenario ID from the pool.
 *
 *   weight(s) = natural(s) * (1 - bf) + uniform * bf
 *
 * where natural(s) = bucketSize(s) / totalDeals,
 *       uniform    = 1 / scenarioCount
 *
 * @param {Pool} pool
 * @param {number} [balanceFactor]
 * @returns {string | null}  scenario ID, or null if pool is empty
 */
export function pickScenario(pool, balanceFactor = DEFAULT_BALANCE) {
  const available = pool.availableScenarios();
  if (available.length === 0) return null;

  const sizes = pool.bucketSizes();
  let totalDeals = 0;
  for (const id of available) totalDeals += sizes.get(id) ?? 0;
  if (totalDeals === 0) return null;

  const uniform = 1 / available.length;

  /** @type {Array<{ id: string, weight: number }>} */
  const entries = [];
  let weightSum = 0;

  for (const id of available) {
    const n = sizes.get(id) ?? 0;
    if (n === 0) continue;
    const natural = n / totalDeals;
    const w = natural * (1 - balanceFactor) + uniform * balanceFactor;
    entries.push({ id, weight: w });
    weightSum += w;
  }

  if (entries.length === 0) return null;

  let r = Math.random() * weightSum;
  for (const { id, weight } of entries) {
    r -= weight;
    if (r <= 0) return id;
  }
  return entries[entries.length - 1].id;
}

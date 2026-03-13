/** @typedef {{ label: string, amount: number }} PenaltyItem */

/**
 * Record a penalty if the rounded amount is positive.
 * @param {PenaltyItem[]} items
 * @param {string} label
 * @param {number} rawAmount
 */
export function pen(items, label, rawAmount) {
  const amount = Math.round(rawAmount * 10) / 10;
  if (amount > 0) items.push({ label, amount });
}

/**
 * Sum all tracked penalty amounts.
 * @param {PenaltyItem[]} items
 * @returns {number}
 */
export function penTotal(items) {
  let sum = 0;
  for (const p of items) sum += p.amount;
  return sum;
}

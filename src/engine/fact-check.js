import { evaluate } from './evaluate.js';
import { SUIT_SYMBOLS } from '../model/card.js';

/**
 * @typedef {import('../model/hand.js').Hand} Hand
 * @typedef {import('../model/bid.js').Bid} Bid
 * @typedef {import('../model/bid.js').ContractBid} ContractBid
 *
 * @typedef {{
 *   hcp?: { claimed: number, actual: number },
 *   combined?: { claimedMin: number, claimedMax: number | null, actual: number },
 *   fit?: { suitSymbol: string, combined: number },
 * }} FactCheckResult
 */

/** @type {Readonly<Record<string, import('../model/card.js').Suit>>} */
const STRAIN_TO_SUIT = { S: 'S', H: 'H', D: 'D', C: 'C' };

const HCP_LIE_THRESHOLD = 1;
const COMBINED_LIE_THRESHOLD = 2;

/**
 * Verify claims made in a bid explanation against the actual hands.
 *
 * @param {Hand} hand         - the bidder's hand
 * @param {Hand} partnerHand  - partner's hand
 * @param {Bid} bid
 * @param {string} explanation
 * @returns {FactCheckResult | null} null when nothing is wrong
 */
export function factCheckBid(hand, partnerHand, bid, explanation) {
  if (!explanation) return null;

  const eval_ = evaluate(hand);
  const partnerEval = evaluate(partnerHand);
  /** @type {FactCheckResult} */
  const result = {};
  let hasLie = false;

  // --- Individual HCP claim (appears at start of explanation) ---
  const hcpMatch = explanation.match(/^(\d+) HCP/);
  if (hcpMatch) {
    const claimed = parseInt(hcpMatch[1], 10);
    if (Math.abs(claimed - eval_.hcp) >= HCP_LIE_THRESHOLD) {
      result.hcp = { claimed, actual: eval_.hcp };
      hasLie = true;
    }
  }

  // --- Combined HCP claim ("Combined X" or "Combined X-Y") ---
  const combinedMatch = explanation.match(/Combined ~?(\d+)(?:\s*-\s*(\d+))?/);
  if (combinedMatch) {
    const claimedMin = parseInt(combinedMatch[1], 10);
    const claimedMax = combinedMatch[2] ? parseInt(combinedMatch[2], 10) : null;
    const actualCombined = eval_.hcp + partnerEval.hcp;

    const offLow = actualCombined < claimedMin - COMBINED_LIE_THRESHOLD;
    const offHigh = claimedMax !== null && actualCombined > claimedMax + COMBINED_LIE_THRESHOLD;

    if (offLow || offHigh) {
      result.combined = { claimedMin, claimedMax, actual: actualCombined };
      hasLie = true;
    }
  }

  // --- Fit claim: suit contract where explanation mentions fit/support/raise ---
  if (bid.type === 'contract' && bid.strain !== 'NT') {
    const suit = STRAIN_TO_SUIT[bid.strain];
    if (suit) {
      const myLen = suitLength(hand, suit);
      const partnerLen = suitLength(partnerHand, suit);
      const combined = myLen + partnerLen;

      const mentionsFit = /\bfit\b|\bsupport\b|\braise\b|\btrump\b/i.test(explanation);
      if (mentionsFit && combined < 8) {
        result.fit = { suitSymbol: SUIT_SYMBOLS[suit], combined };
        hasLie = true;
      }
    }
  }

  return hasLie ? result : null;
}

/**
 * Format a FactCheckResult into a human-readable string for display.
 * @param {FactCheckResult} fc
 * @returns {string}
 */
export function formatFactCheck(fc) {
  const parts = [];

  if (fc.hcp) {
    parts.push(`${fc.hcp.actual} HCP`);
  }

  if (fc.combined) {
    parts.push(`real: ${fc.combined.actual}`);
  }

  if (fc.fit) {
    parts.push(`${fc.fit.combined}${fc.fit.suitSymbol}`);
  }

  return parts.join(', ');
}

/**
 * @param {Hand} hand
 * @param {import('../model/card.js').Suit} suit
 * @returns {number}
 */
function suitLength(hand, suit) {
  let count = 0;
  for (const card of hand.cards) {
    if (card.suit === suit) count++;
  }
  return count;
}

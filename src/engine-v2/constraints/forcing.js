/**
 * @typedef {import('../../engine/opening.js').BidRecommendation} BidRecommendation
 * @typedef {import('../model/semantic-state.js').AuctionMeaningState} AuctionMeaningState
 */

const FORCING_PENALTY = 20;
const OBLIGATION_PENALTY = 15;

/**
 * Apply hard-ish forcing constraints to recommendation list.
 * This phase intentionally starts with pass suppression in forcing windows.
 * @param {BidRecommendation[]} recs
 * @param {AuctionMeaningState} meaning
 * @returns {BidRecommendation[]}
 */
export function applyForcingConstraints(recs, meaning) {
  if (!recs.length) return recs;
  if (!meaning.forcingActive) return recs;

  return recs.map(rec => {
    if (rec.bid.type !== 'pass') return rec;

    const reasons = forcingLabels(meaning);
    const penalty = forcingPenalty(meaning);
    return {
      ...rec,
      priority: rec.priority - penalty,
      explanation: reasons.join('; '),
      penalties: [
        ...rec.penalties,
        { label: reasons.join(' + '), amount: penalty },
      ],
    };
  });
}

/**
 * @param {AuctionMeaningState} meaning
 * @returns {number}
 */
function forcingPenalty(meaning) {
  if (meaning.me.obligations.length > 0) return OBLIGATION_PENALTY;
  return FORCING_PENALTY;
}

/**
 * @param {AuctionMeaningState} meaning
 * @returns {string[]}
 */
function forcingLabels(meaning) {
  const labels = [];
  for (const obligation of meaning.me.obligations) {
    if (obligation === 'reply-to-stayman') {
      labels.push('Stayman is forcing: pass not allowed');
    } else if (obligation === 'complete-transfer') {
      labels.push('Transfer completion required: pass not allowed');
    }
  }
  if (labels.length === 0) labels.push('Forcing auction: pass not allowed');
  return labels;
}


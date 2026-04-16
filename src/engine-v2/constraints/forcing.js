/**
 * @typedef {import('../../engine/opening.js').BidRecommendation} BidRecommendation
 * @typedef {import('../model/semantic-state.js').AuctionMeaningState} AuctionMeaningState
 */

const FORCING_PENALTY = 20;
const OBLIGATION_PENALTY = 15;
const HARD_FILTER_PENALTY = 100;
const SOFT_CLASS_PENALTY = 8;

/**
 * Apply hard-ish forcing constraints to recommendation list.
 * This phase intentionally starts with pass suppression in forcing windows.
 * @param {BidRecommendation[]} recs
 * @param {AuctionMeaningState} meaning
 * @returns {BidRecommendation[]}
 */
export function applyForcingConstraints(recs, meaning) {
  if (!recs.length) return recs;
  if (!meaning.forcingActive && meaning.me.obligations.length === 0) return recs;

  return recs.map(rec => {
    const violation = obligationViolation(rec, meaning);
    if (violation) {
      const penalty = violation.hard ? HARD_FILTER_PENALTY : SOFT_CLASS_PENALTY;
      return {
        ...rec,
        priority: rec.priority - penalty,
        explanation: violation.reason,
        penalties: [
          ...rec.penalties,
          { label: violation.reason, amount: penalty },
        ],
      };
    }

    if (!meaning.forcingActive || rec.bid.type !== 'pass') return rec;
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
    if (obligation === 'reply-to-stayman-hard') {
      labels.push('Stayman is forcing: pass not allowed');
    } else if (obligation === 'complete-transfer-hearts-hard' ||
               obligation === 'complete-transfer-spades-hard' ||
               obligation === 'complete-minor-transfer-clubs-hard') {
      labels.push('Transfer completion required: pass not allowed');
    }
  }
  if (labels.length === 0) labels.push('Forcing auction: pass not allowed');
  return labels;
}

/**
 * @param {BidRecommendation} rec
 * @param {AuctionMeaningState} meaning
 * @returns {{ reason: string, hard: boolean } | null}
 */
function obligationViolation(rec, meaning) {
  for (const obligation of meaning.me.obligations) {
    if (obligation === 'reply-to-stayman-hard') {
      if (rec.bid.type === 'pass') {
        return { reason: 'Stayman reply required: cannot pass', hard: true };
      }
      if (rec.bid.type !== 'contract') {
        return { reason: 'Stayman reply requires contract bid', hard: true };
      }
      const legal = (
        (rec.bid.level === 2 && rec.bid.strain === 'D') ||
        (rec.bid.level === 2 && rec.bid.strain === 'H') ||
        (rec.bid.level === 2 && rec.bid.strain === 'S')
      );
      if (!legal) return { reason: 'Stayman reply must be 2D/2H/2S', hard: true };
    } else if (obligation === 'complete-transfer-hearts-hard') {
      if (rec.bid.type !== 'contract' || rec.bid.strain !== 'H' ||
          (rec.bid.level !== 2 && rec.bid.level !== 3)) {
        return { reason: 'Transfer obligation: must bid hearts (2H/3H)', hard: true };
      }
    } else if (obligation === 'complete-transfer-spades-hard') {
      if (rec.bid.type !== 'contract' || rec.bid.strain !== 'S' ||
          (rec.bid.level !== 2 && rec.bid.level !== 3)) {
        return { reason: 'Transfer obligation: must bid spades (2S/3S)', hard: true };
      }
    } else if (obligation === 'complete-minor-transfer-clubs-hard') {
      if (rec.bid.type !== 'contract' || rec.bid.level !== 3 || rec.bid.strain !== 'C') {
        return { reason: 'Minor transfer obligation: must bid 3C', hard: true };
      }
    } else if (obligation === 'reply-to-stayman-soft') {
      if (rec.bid.type === 'pass') {
        return { reason: 'Stayman continuation usually acts (pass discouraged)', hard: false };
      }
    } else if (obligation === 'complete-transfer-hearts-soft') {
      if (rec.bid.type === 'pass') {
        return { reason: 'Transfer continuation usually acts in hearts (pass discouraged)', hard: false };
      }
    } else if (obligation === 'complete-transfer-spades-soft') {
      if (rec.bid.type === 'pass') {
        return { reason: 'Transfer continuation usually acts in spades (pass discouraged)', hard: false };
      }
    } else if (obligation === 'complete-minor-transfer-clubs-soft') {
      if (rec.bid.type === 'pass') {
        return { reason: 'Minor transfer continuation usually acts (pass discouraged)', hard: false };
      }
    }
  }
  return null;
}


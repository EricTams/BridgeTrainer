/**
 * @typedef {import('../../engine/opening.js').BidRecommendation} BidRecommendation
 * @typedef {import('../model/semantic-state.js').AuctionMeaningState} AuctionMeaningState
 */

const FORCING_PENALTY = 20;
const OBLIGATION_PENALTY = 15;
const HARD_FILTER_PENALTY = 100;

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
  const hasHardObligation = meaning.me.obligations.length > 0;

  return recs.map(rec => {
    const blocked = hasHardObligation ? obligationViolation(rec, meaning) : null;
    if (!blocked) {
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
    }

    const reasons = [blocked];
    const penalty = HARD_FILTER_PENALTY;
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

/**
 * @param {BidRecommendation} rec
 * @param {AuctionMeaningState} meaning
 * @returns {string | null}
 */
function obligationViolation(rec, meaning) {
  for (const obligation of meaning.me.obligations) {
    if (obligation === 'reply-to-stayman') {
      if (rec.bid.type === 'pass') return 'Stayman reply required: cannot pass';
      if (rec.bid.type !== 'contract') return 'Stayman reply requires contract bid';
      const legal = (
        (rec.bid.level === 2 && rec.bid.strain === 'D') ||
        (rec.bid.level === 2 && rec.bid.strain === 'H') ||
        (rec.bid.level === 2 && rec.bid.strain === 'S')
      );
      if (!legal) return 'Stayman reply must be 2D/2H/2S';
    } else if (obligation === 'complete-transfer-hearts') {
      if (rec.bid.type !== 'contract' || rec.bid.strain !== 'H' ||
          (rec.bid.level !== 2 && rec.bid.level !== 3)) {
        return 'Transfer obligation: must bid hearts (2H/3H)';
      }
    } else if (obligation === 'complete-transfer-spades') {
      if (rec.bid.type !== 'contract' || rec.bid.strain !== 'S' ||
          (rec.bid.level !== 2 && rec.bid.level !== 3)) {
        return 'Transfer obligation: must bid spades (2S/3S)';
      }
    } else if (obligation === 'complete-minor-transfer-clubs') {
      if (rec.bid.type !== 'contract' || rec.bid.level !== 3 || rec.bid.strain !== 'C') {
        return 'Minor transfer obligation: must bid 3C';
      }
    }
  }
  return null;
}


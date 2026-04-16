import { contractBid, isLegalBid, Strain } from '../../model/bid.js';

/**
 * @typedef {import('../../engine/opening.js').BidRecommendation} BidRecommendation
 * @typedef {import('../model/semantic-state.js').AuctionMeaningState} AuctionMeaningState
 * @typedef {import('../../model/bid.js').Auction} Auction
 */

const FORCING_PENALTY = 20;
const OBLIGATION_PENALTY = 15;
const HARD_FILTER_PENALTY = 100;
const SOFT_CLASS_PENALTY = 8;

/**
 * Scope candidate list to hard-obligation classes before scoring.
 * @param {BidRecommendation[]} recs
 * @param {AuctionMeaningState} meaning
 * @param {Auction} [auction]
 * @returns {BidRecommendation[]}
 */
export function scopeCandidatesByHardObligations(recs, meaning, auction) {
  if (!recs.length) return recs;
  const validators = hardObligationValidators(meaning.me.obligations);
  if (validators.length === 0) return recs;

  const scoped = recs.filter(rec => validators.every(v => v(rec.bid)));
  if (scoped.length > 0) return scoped;
  if (!auction) return recs;

  const generated = generateRequiredCandidates(meaning, auction, validators);
  return generated.length > 0 ? generated : recs;
}

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
 * @param {Array<string | { id: string, mode?: 'hard' | 'soft' }>} obligations
 * @returns {Array<(bid: BidRecommendation['bid']) => boolean>}
 */
function hardObligationValidators(obligations) {
  const validators = [];
  for (const obligation of obligations) {
    const { id, mode } = parseObligation(obligation);
    if (mode !== 'hard') continue;
    const validator = validatorForObligation(id);
    if (validator) validators.push(validator);
  }
  return validators;
}

/**
 * @param {string} id
 * @returns {((bid: BidRecommendation['bid']) => boolean) | null}
 */
function validatorForObligation(id) {
  if (id === 'reply-to-stayman') {
    return bid => bid.type === 'contract' &&
      bid.level === 2 &&
      (bid.strain === 'D' || bid.strain === 'H' || bid.strain === 'S');
  }
  if (id === 'complete-transfer-hearts') {
    return bid => bid.type === 'contract' &&
      bid.strain === 'H' &&
      (bid.level === 2 || bid.level === 3);
  }
  if (id === 'complete-transfer-spades') {
    return bid => bid.type === 'contract' &&
      bid.strain === 'S' &&
      (bid.level === 2 || bid.level === 3);
  }
  if (id === 'complete-minor-transfer-clubs') {
    return bid => bid.type === 'contract' &&
      bid.level === 3 &&
      bid.strain === 'C';
  }
  return null;
}

/**
 * @param {AuctionMeaningState} meaning
 * @param {Auction} auction
 * @param {Array<(bid: BidRecommendation['bid']) => boolean>} validators
 * @returns {BidRecommendation[]}
 */
function generateRequiredCandidates(meaning, auction, validators) {
  const hardIds = hardObligationIds(meaning.me.obligations);
  if (hardIds.length === 0) return [];

  const bids = hardIds.flatMap(obligationBidSet);
  const seen = new Set();
  const generated = [];
  for (const bid of bids) {
    const key = `${bid.level}${bid.strain}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!isLegalBid(auction, bid)) continue;
    if (!validators.every(v => v(bid))) continue;
    generated.push({
      bid,
      priority: 8,
      explanation: 'Generated from hard obligation class',
      penalties: [],
    });
  }
  return generated;
}

/**
 * @param {Array<string | { id: string, mode?: 'hard' | 'soft' }>} obligations
 * @returns {string[]}
 */
function hardObligationIds(obligations) {
  const ids = [];
  for (const obligation of obligations) {
    const parsed = parseObligation(obligation);
    if (parsed.mode === 'hard') ids.push(parsed.id);
  }
  return ids;
}

/**
 * @param {string} id
 * @returns {BidRecommendation['bid'][]}
 */
function obligationBidSet(id) {
  if (id === 'reply-to-stayman') {
    return [
      contractBid(2, Strain.DIAMONDS),
      contractBid(2, Strain.HEARTS),
      contractBid(2, Strain.SPADES),
    ];
  }
  if (id === 'complete-transfer-hearts') {
    return [contractBid(2, Strain.HEARTS), contractBid(3, Strain.HEARTS)];
  }
  if (id === 'complete-transfer-spades') {
    return [contractBid(2, Strain.SPADES), contractBid(3, Strain.SPADES)];
  }
  if (id === 'complete-minor-transfer-clubs') {
    return [contractBid(3, Strain.CLUBS)];
  }
  return [];
}

/**
 * @param {string | { id: string, mode?: 'hard' | 'soft' }} obligation
 * @returns {{ id: string, mode: 'hard' | 'soft' }}
 */
function parseObligation(obligation) {
  if (typeof obligation === 'string') {
    if (obligation.endsWith('-soft')) {
      return { id: obligation.slice(0, -5), mode: 'soft' };
    }
    if (obligation.endsWith('-hard')) {
      return { id: obligation.slice(0, -5), mode: 'hard' };
    }
    return { id: obligation, mode: 'hard' };
  }
  return {
    id: obligation.id,
    mode: obligation.mode === 'soft' ? 'soft' : 'hard',
  };
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
    const { id, mode } = parseObligation(obligation);
    if (id === 'reply-to-stayman' && mode === 'hard') {
      labels.push('Stayman is forcing: pass not allowed');
    } else if (mode === 'hard' &&
      (id === 'complete-transfer-hearts' ||
       id === 'complete-transfer-spades' ||
       id === 'complete-minor-transfer-clubs')) {
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
    const { id, mode } = parseObligation(obligation);
    if (id === 'reply-to-stayman' && mode === 'hard') {
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
    } else if (id === 'complete-transfer-hearts' && mode === 'hard') {
      if (rec.bid.type !== 'contract' || rec.bid.strain !== 'H' ||
          (rec.bid.level !== 2 && rec.bid.level !== 3)) {
        return { reason: 'Transfer obligation: must bid hearts (2H/3H)', hard: true };
      }
    } else if (id === 'complete-transfer-spades' && mode === 'hard') {
      if (rec.bid.type !== 'contract' || rec.bid.strain !== 'S' ||
          (rec.bid.level !== 2 && rec.bid.level !== 3)) {
        return { reason: 'Transfer obligation: must bid spades (2S/3S)', hard: true };
      }
    } else if (id === 'complete-minor-transfer-clubs' && mode === 'hard') {
      if (rec.bid.type !== 'contract' || rec.bid.level !== 3 || rec.bid.strain !== 'C') {
        return { reason: 'Minor transfer obligation: must bid 3C', hard: true };
      }
    } else if (id === 'reply-to-stayman' && mode === 'soft') {
      if (rec.bid.type === 'pass') {
        return { reason: 'Stayman continuation usually acts (pass discouraged)', hard: false };
      }
    } else if (id === 'complete-transfer-hearts' && mode === 'soft') {
      if (rec.bid.type === 'pass') {
        return { reason: 'Transfer continuation usually acts in hearts (pass discouraged)', hard: false };
      }
    } else if (id === 'complete-transfer-spades' && mode === 'soft') {
      if (rec.bid.type === 'pass') {
        return { reason: 'Transfer continuation usually acts in spades (pass discouraged)', hard: false };
      }
    } else if (id === 'complete-minor-transfer-clubs' && mode === 'soft') {
      if (rec.bid.type === 'pass') {
        return { reason: 'Minor transfer continuation usually acts (pass discouraged)', hard: false };
      }
    }
  }
  return null;
}


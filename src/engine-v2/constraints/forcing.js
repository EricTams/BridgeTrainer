import { isLegalBid } from '../../model/bid.js';
import { getObligationRule, parseObligation } from './obligation-rules.js';

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
    const rule = getObligationRule(id);
    if (!rule) continue;
    validators.push(bid => rule.allowBid(bid));
  }
  return validators;
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

  const bids = hardIds.flatMap(id => {
    const rule = getObligationRule(id);
    return rule ? rule.generateBids() : [];
  });
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
    if (parsed.mode !== 'hard') continue;
    const rule = getObligationRule(parsed.id);
    if (!rule) continue;
    ids.push(parsed.id);
  }
  return ids;
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
    if (mode !== 'hard') continue;
    const rule = getObligationRule(id);
    if (!rule) continue;
    labels.push(rule.passLabel);
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
    const rule = getObligationRule(id);
    if (!rule) continue;
    if (mode === 'hard') {
      const reason = rule.hardViolation(rec.bid);
      if (reason) return { reason, hard: true };
      continue;
    }
    const reason = rule.softViolation(rec.bid);
    if (reason) return { reason, hard: false };
  }
  return null;
}


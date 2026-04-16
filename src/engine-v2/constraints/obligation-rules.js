import { contractBid, Strain } from '../../model/bid.js';

/**
 * @typedef {import('../../model/bid.js').Bid} Bid
 * @typedef {'hard' | 'soft'} ObligationMode
 * @typedef {string | { id: string, mode?: ObligationMode }} ObligationInput
 *
 * @typedef {{
 *   id: string,
 *   passLabel: string,
 *   allowBid: (bid: Bid) => boolean,
 *   generateBids: () => Bid[],
 *   hardViolation: (bid: Bid) => string | null,
 *   softViolation: (bid: Bid) => string | null,
 * }} ObligationRule
 */

const STAYMAN_REPLY_BIDS = [
  contractBid(2, Strain.DIAMONDS),
  contractBid(2, Strain.HEARTS),
  contractBid(2, Strain.SPADES),
];

const TRANSFER_HEARTS_BIDS = [
  contractBid(2, Strain.HEARTS),
  contractBid(3, Strain.HEARTS),
];

const TRANSFER_SPADES_BIDS = [
  contractBid(2, Strain.SPADES),
  contractBid(3, Strain.SPADES),
];

const TRANSFER_CLUBS_BIDS = [
  contractBid(3, Strain.CLUBS),
];

/** @type {Readonly<Record<string, ObligationRule>>} */
const OBLIGATION_RULES = Object.freeze({
  'reply-to-stayman': Object.freeze({
    id: 'reply-to-stayman',
    passLabel: 'Stayman is forcing: pass not allowed',
    allowBid: bid =>
      bid.type === 'contract' &&
      bid.level === 2 &&
      (bid.strain === Strain.DIAMONDS || bid.strain === Strain.HEARTS || bid.strain === Strain.SPADES),
    generateBids: () => STAYMAN_REPLY_BIDS,
    hardViolation: bid => {
      if (bid.type === 'pass') return 'Stayman reply required: cannot pass';
      if (bid.type !== 'contract') return 'Stayman reply requires contract bid';
      if (bid.level !== 2) return 'Stayman reply must be 2D/2H/2S';
      if (bid.strain === Strain.DIAMONDS || bid.strain === Strain.HEARTS || bid.strain === Strain.SPADES) {
        return null;
      }
      return 'Stayman reply must be 2D/2H/2S';
    },
    softViolation: bid => bid.type === 'pass'
      ? 'Stayman continuation usually acts (pass discouraged)'
      : null,
  }),
  'complete-transfer-hearts': Object.freeze({
    id: 'complete-transfer-hearts',
    passLabel: 'Transfer completion required: pass not allowed',
    allowBid: bid =>
      bid.type === 'contract' &&
      bid.strain === Strain.HEARTS &&
      (bid.level === 2 || bid.level === 3),
    generateBids: () => TRANSFER_HEARTS_BIDS,
    hardViolation: bid => (
      bid.type !== 'contract' ||
      bid.strain !== Strain.HEARTS ||
      (bid.level !== 2 && bid.level !== 3)
    ) ? 'Transfer obligation: must bid hearts (2H/3H)' : null,
    softViolation: bid => bid.type === 'pass'
      ? 'Transfer continuation usually acts in hearts (pass discouraged)'
      : null,
  }),
  'complete-transfer-spades': Object.freeze({
    id: 'complete-transfer-spades',
    passLabel: 'Transfer completion required: pass not allowed',
    allowBid: bid =>
      bid.type === 'contract' &&
      bid.strain === Strain.SPADES &&
      (bid.level === 2 || bid.level === 3),
    generateBids: () => TRANSFER_SPADES_BIDS,
    hardViolation: bid => (
      bid.type !== 'contract' ||
      bid.strain !== Strain.SPADES ||
      (bid.level !== 2 && bid.level !== 3)
    ) ? 'Transfer obligation: must bid spades (2S/3S)' : null,
    softViolation: bid => bid.type === 'pass'
      ? 'Transfer continuation usually acts in spades (pass discouraged)'
      : null,
  }),
  'complete-minor-transfer-clubs': Object.freeze({
    id: 'complete-minor-transfer-clubs',
    passLabel: 'Transfer completion required: pass not allowed',
    allowBid: bid =>
      bid.type === 'contract' &&
      bid.level === 3 &&
      bid.strain === Strain.CLUBS,
    generateBids: () => TRANSFER_CLUBS_BIDS,
    hardViolation: bid => (
      bid.type !== 'contract' ||
      bid.level !== 3 ||
      bid.strain !== Strain.CLUBS
    ) ? 'Minor transfer obligation: must bid 3C' : null,
    softViolation: bid => bid.type === 'pass'
      ? 'Minor transfer continuation usually acts (pass discouraged)'
      : null,
  }),
});

/**
 * @param {ObligationInput} obligation
 * @returns {{ id: string, mode: ObligationMode }}
 */
export function parseObligation(obligation) {
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
 * @param {string} obligationId
 * @returns {ObligationRule | null}
 */
export function getObligationRule(obligationId) {
  return OBLIGATION_RULES[obligationId] ?? null;
}

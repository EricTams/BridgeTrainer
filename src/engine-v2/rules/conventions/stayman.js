import { Strain } from '../../../model/bid.js';
import { legalCandidates, rec, suitLen, inRange } from './shared.js';

const INVITE_MIN = 8;
const INVITE_MAX = 9;
const GAME_MIN = 10;
const TRANSFER_LEN = 5;
const MAJOR_FIT_LEN = 4;

/**
 * @typedef {import('../../../model/bid.js').Auction} Auction
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

/**
 * @param {Auction} auction
 * @param {ReturnType<import('../../../engine/evaluate.js').evaluate>} eval_
 * @param {boolean} interfered
 * @returns {BidRecommendation[]}
 */
export function scoreOpenerAfterStayman(auction, eval_, interfered) {
  const candidates = legalCandidates(auction);
  const spades = suitLen(eval_.shape, Strain.SPADES);
  const hearts = suitLen(eval_.shape, Strain.HEARTS);
  return candidates.map(bid => {
    if (interfered) {
      if (bid.type === 'pass') {
        return rec(bid, hearts >= 4 || spades >= 4 ? 6 : 9,
          hearts >= 4 || spades >= 4
            ? 'Interference over Stayman: major available, consider bidding'
            : 'Interference over Stayman: pass denies 4-card major');
      }
      if (bid.type === 'double') return rec(bid, 8, 'Penalty double over interference');
      if (bid.type === 'contract' && bid.strain === Strain.HEARTS) {
        return rec(bid, hearts >= 4 ? 10 : 4,
          hearts >= 4 ? 'Show hearts after Stayman interference' : 'Insufficient hearts to show');
      }
      if (bid.type === 'contract' && bid.strain === Strain.SPADES) {
        return rec(bid, spades >= 4 ? 10 : 4,
          spades >= 4 ? 'Show spades after Stayman interference' : 'Insufficient spades to show');
      }
      return rec(bid, 2, 'Non-standard over Stayman interference');
    }

    if (bid.type === 'pass') return rec(bid, 0, 'Stayman is forcing: must respond');
    if (bid.type !== 'contract') return rec(bid, 0, 'Non-contract not used for Stayman reply');
    if (bid.level !== 2) return rec(bid, 1, 'Stayman reply should remain at 2-level');

    if (bid.strain === Strain.HEARTS) {
      return rec(bid, hearts >= 4 ? 10 : 2,
        hearts >= 4 ? '2H: showing 4+ hearts' : 'Cannot bid 2H without four hearts');
    }
    if (bid.strain === Strain.SPADES) {
      if (spades < 4) return rec(bid, 2, 'Cannot bid 2S without four spades');
      if (hearts >= 4) return rec(bid, 6, 'With both majors, 2H is preferred');
      return rec(bid, 10, '2S: showing 4+ spades');
    }
    if (bid.strain === Strain.DIAMONDS) {
      return rec(bid, hearts >= 4 || spades >= 4 ? 5 : 9,
        hearts >= 4 || spades >= 4 ? 'Have major available: denying with 2D is inaccurate' : '2D: no 4-card major');
    }
    return rec(bid, 1, 'Stayman reply must be 2D/2H/2S');
  });
}

/**
 * @param {Auction} auction
 * @param {ReturnType<import('../../../engine/evaluate.js').evaluate>} eval_
 * @param {'D'|'H'|'S'} staymanReply
 * @returns {BidRecommendation[]}
 */
export function scoreResponderAfterStaymanReply(auction, eval_, staymanReply) {
  const candidates = legalCandidates(auction);
  const spades = suitLen(eval_.shape, Strain.SPADES);
  const hearts = suitLen(eval_.shape, Strain.HEARTS);
  const fit = (staymanReply === Strain.HEARTS && hearts >= MAJOR_FIT_LEN) ||
    (staymanReply === Strain.SPADES && spades >= MAJOR_FIT_LEN);
  return candidates.map(bid => {
    if (bid.type === 'pass') return rec(bid, eval_.hcp < INVITE_MIN ? 9 : 3,
      eval_.hcp < INVITE_MIN ? `${eval_.hcp} HCP: minimum, can pass` : 'Too strong to pass after Stayman');
    if (bid.type !== 'contract') return rec(bid, 0, 'Only contract continuations apply');

    if (fit && bid.strain === staymanReply) {
      if (bid.level === 3) return rec(bid, inRange(eval_.hcp, INVITE_MIN, INVITE_MAX) ? 10 : 6, 'Invitational raise with major fit');
      if (bid.level === 4) return rec(bid, eval_.hcp >= GAME_MIN ? 10 : 5, 'Game raise with major fit');
    }

    if (staymanReply === Strain.DIAMONDS && bid.strain === Strain.SPADES) {
      if (bid.level === 2) return rec(bid, spades >= TRANSFER_LEN && eval_.hcp >= INVITE_MIN ? 10 : 5, 'Show 5-card spade suit');
      if (bid.level === 3) return rec(bid, spades >= TRANSFER_LEN && eval_.hcp >= GAME_MIN ? 9 : 4, 'Game-forcing spade continuation');
    }

    if (bid.strain === Strain.NOTRUMP) {
      if (bid.level === 2) return rec(bid, inRange(eval_.hcp, INVITE_MIN, INVITE_MAX) ? 9 : 5, '2NT invitational');
      if (bid.level === 3) return rec(bid, eval_.hcp >= GAME_MIN ? 9 : 5, '3NT game continuation');
    }
    return rec(bid, 2, 'Non-standard Stayman continuation');
  });
}

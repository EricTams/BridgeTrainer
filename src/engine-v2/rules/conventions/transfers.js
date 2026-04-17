import { pass, Strain } from '../../../model/bid.js';
import {
  TRANSFER_LEN,
  INVITE_MIN,
  INVITE_MAX,
  GAME_MIN,
  LONG_TRANSFER_RAISE,
  MINOR_TRANSFER_CORRECT_LEN,
  legalCandidates,
  suitLen,
  inRange,
  transferTargetFromCall,
  rec,
} from './shared.js';

/**
 * @typedef {import('../../../model/bid.js').Auction} Auction
 * @typedef {import('../../../engine/evaluate.js').Evaluation} Evaluation
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

/**
 * @param {Auction} auction
 * @param {Evaluation} eval_
 * @param {'D' | 'H'} transferCall
 * @param {boolean} interfered
 * @returns {BidRecommendation[]}
 */
export function scoreOpenerAfterMajorTransfer(auction, eval_, transferCall, interfered) {
  const target = transferTargetFromCall(transferCall);
  const targetLen = suitLen(eval_.shape, target);
  const candidates = legalCandidates(auction);
  return candidates.map(bid => {
    if (interfered) {
      if (bid.type === 'pass') {
        return rec(bid, targetLen >= 4 ? 6 : 8,
          targetLen >= 4
            ? `Interference over transfer: ${targetLen}-card support, consider completing`
            : 'Interference over transfer: pass acceptable');
      }
      if (bid.type === 'double') {
        return rec(bid, 8, 'Penalty double over transfer interference');
      }
      if (bid.type === 'contract' && bid.strain === target) {
        return rec(bid, targetLen >= 3 ? 10 : 3,
          targetLen >= 3
            ? `Complete transfer despite interference in ${bid.level}${target}`
            : 'Too short for a comfortable transfer completion');
      }
      return rec(bid, 2, 'Non-standard over transfer interference');
    }

    if (bid.type === 'pass') return rec(bid, 0, 'Transfer is forcing: must complete');
    if (bid.type !== 'contract') return rec(bid, 0, 'Non-contract not used for transfer completion');
    if (bid.strain !== target) return rec(bid, 1, `Must complete transfer to ${target}`);
    if (bid.level === 2) {
      const superAcceptReady = targetLen >= 4 && eval_.hcp >= 17;
      return rec(bid, superAcceptReady ? 8 : 10,
        superAcceptReady ? `2${target} is fine; 3${target} super-accept also available` : `2${target}: completing transfer`);
    }
    if (bid.level === 3) {
      return rec(bid, targetLen >= 4 && eval_.hcp >= 17 ? 10 : 4,
        targetLen >= 4 && eval_.hcp >= 17
          ? `3${target}: super-accept with ${targetLen}-card support`
          : `3${target} super-accept requires 4+ support and max values`);
    }
    return rec(bid, 1, `Transfer completion should be 2${target} or 3${target}`);
  });
}

/**
 * @param {Auction} auction
 * @returns {BidRecommendation[]}
 */
export function scoreOpenerAfterMinorTransfer(auction) {
  const candidates = legalCandidates(auction);
  return candidates.map(bid => {
    if (bid.type === 'contract' && bid.level === 3 && bid.strain === Strain.CLUBS) {
      return rec(bid, 10, '3C: accept minor transfer');
    }
    if (bid.type === 'pass') return rec(bid, 0, 'Minor transfer: pass is non-standard');
    return rec(bid, 1, 'Minor transfer should be completed with 3C');
  });
}

/**
 * @param {Auction} auction
 * @param {Evaluation} eval_
 * @param {'H' | 'S'} target
 * @returns {BidRecommendation[]}
 */
export function scoreResponderAfterMajorTransferAccepted(auction, eval_, target) {
  const candidates = legalCandidates(auction);
  const targetLen = suitLen(eval_.shape, target);
  const other = target === Strain.HEARTS ? Strain.SPADES : Strain.HEARTS;
  const otherLen = suitLen(eval_.shape, other);
  return candidates.map(bid => {
    if (bid.type === 'pass') return rec(bid, eval_.hcp < INVITE_MIN ? 9 : 3,
      eval_.hcp < INVITE_MIN ? 'Weak hand: pass after transfer acceptance' : 'Invitational+ values should continue');
    if (bid.type !== 'contract') return rec(bid, 0, 'Contract continuation required');

    if (bid.strain === target && bid.level === 3) {
      return rec(bid, inRange(eval_.hcp, INVITE_MIN, 10) ? 10 : 6, 'Invitational raise after transfer');
    }
    if (bid.strain === target && bid.level === 4) {
      const minGame = targetLen >= LONG_TRANSFER_RAISE ? INVITE_MIN : GAME_MIN;
      return rec(bid, eval_.hcp >= minGame ? 10 : 5, 'Game raise after transfer');
    }
    if (target === Strain.HEARTS &&
        bid.strain === Strain.SPADES &&
        bid.level === 2) {
      return rec(bid, otherLen >= 4 && eval_.hcp >= INVITE_MIN ? 10 : 4, 'Second major pattern after heart transfer');
    }
    if (bid.strain === Strain.NOTRUMP && bid.level === 2) {
      return rec(bid, inRange(eval_.hcp, INVITE_MIN, 10) ? 9 : 5, '2NT invitational after transfer');
    }
    if (bid.strain === Strain.NOTRUMP && bid.level === 3) {
      return rec(bid, eval_.hcp >= GAME_MIN ? 9 : 5, '3NT game after transfer');
    }
    return rec(bid, 2, 'Non-standard transfer continuation');
  });
}

/**
 * @param {Auction} auction
 * @param {Evaluation} eval_
 * @returns {BidRecommendation[]}
 */
export function scoreResponderAfterMinorTransferAccepted(auction, eval_) {
  const candidates = legalCandidates(auction);
  const clubs = suitLen(eval_.shape, Strain.CLUBS);
  const diamonds = suitLen(eval_.shape, Strain.DIAMONDS);
  return candidates.map(bid => {
    if (bid.type === 'pass') {
      const shouldCorrect = diamonds >= MINOR_TRANSFER_CORRECT_LEN && diamonds > clubs;
      return rec(bid, shouldCorrect ? 5 : 9,
        shouldCorrect ? 'Longer diamonds suggest correcting to 3D' : 'Pass 3C');
    }
    if (bid.type !== 'contract') return rec(bid, 0, 'Contract continuation required');
    if (bid.level === 3 && bid.strain === Strain.DIAMONDS) {
      return rec(bid, diamonds >= MINOR_TRANSFER_CORRECT_LEN ? 10 : 5, 'Correct to 3D with longer diamonds');
    }
    if (bid.level === 3 && bid.strain === Strain.NOTRUMP) {
      return rec(bid, eval_.hcp >= GAME_MIN ? 9 : 5, '3NT over minor transfer acceptance');
    }
    return rec(bid, 2, 'Non-standard minor transfer continuation');
  });
}

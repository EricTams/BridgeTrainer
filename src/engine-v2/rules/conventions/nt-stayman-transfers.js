import {
  contractBid,
  pass,
  Strain,
  STRAIN_ORDER,
  isLegalBid,
} from '../../../model/bid.js';
import {
  classifyAuction,
  findOwnBid,
  findPartnerBid,
  findPartnerLastBid,
  isTransferContextDead,
  hasInterferenceAfterPartner,
  isOpener,
} from '../../../engine/context.js';
import { evaluate } from '../../../engine/evaluate.js';

/**
 * @typedef {import('../../../model/hand.js').Hand} Hand
 * @typedef {import('../../../model/bid.js').Auction} Auction
 * @typedef {import('../../../model/deal.js').Seat} Seat
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 */

const INVITE_MIN = 8;
const INVITE_MAX = 9;
const GAME_MIN = 10;
const TRANSFER_LEN = 5;
const MAJOR_FIT_LEN = 4;
const LONG_TRANSFER_RAISE = 6;
const MINOR_TRANSFER_CORRECT_LEN = 6;

/**
 * v2 rule-pack override for 1NT Stayman / transfer families.
 * Returns null when the auction is outside covered windows.
 * @param {Hand} hand
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {BidRecommendation[] | null}
 */
export function getNTStaymanTransferRuleRecommendations(hand, auction, seat) {
  const ctx = classifyAuction(auction, seat);
  if (ctx.phase !== 'rebid' && ctx.phase !== 'responding') return null;

  const myFirst = findOwnBid(auction, seat);
  const partnerFirst = findPartnerBid(auction, seat);
  if (!myFirst || !partnerFirst) return null;
  const myContracts = contractCountBySeat(auction, seat);
  // This pack currently covers the first convention window only.
  if (myContracts !== 1) return null;
  if (isStaleWindow(auction, seat, myFirst, partnerFirst)) return null;

  const eval_ = evaluate(hand);
  const opener = isOpener(auction, seat);

  // Opener reply to responder Stayman / transfer over 1NT.
  if (opener &&
      myFirst.level === 1 && myFirst.strain === Strain.NOTRUMP &&
      partnerFirst.level === 2) {
    if (partnerFirst.strain === Strain.CLUBS) {
      return scoreOpenerAfterStayman(auction, eval_, hasInterferenceAfterPartner(auction, seat));
    }
    if (partnerFirst.strain === Strain.DIAMONDS || partnerFirst.strain === Strain.HEARTS) {
      return scoreOpenerAfterMajorTransfer(auction, eval_, partnerFirst.strain, hasInterferenceAfterPartner(auction, seat));
    }
    if (partnerFirst.strain === Strain.SPADES) {
      return scoreOpenerAfterMinorTransfer(auction);
    }
  }

  // Responder continuation after opener accepted transfer / replied Stayman.
  if (!opener &&
      partnerFirst.level === 1 && partnerFirst.strain === Strain.NOTRUMP &&
      myFirst.level === 2) {
    const partnerLast = findPartnerLastBid(auction, seat);
    if (!partnerLast) return null;

    if (myFirst.strain === Strain.CLUBS &&
        partnerLast.level === 2 &&
        (partnerLast.strain === Strain.DIAMONDS ||
         partnerLast.strain === Strain.HEARTS ||
         partnerLast.strain === Strain.SPADES)) {
      return scoreResponderAfterStaymanReply(auction, eval_, partnerLast.strain);
    }

    if ((myFirst.strain === Strain.DIAMONDS || myFirst.strain === Strain.HEARTS) &&
        partnerLast.strain === transferTargetFromCall(myFirst.strain)) {
      return scoreResponderAfterMajorTransferAccepted(auction, eval_, transferTargetFromCall(myFirst.strain));
    }

    if (myFirst.strain === Strain.SPADES &&
        partnerLast.level === 3 &&
        partnerLast.strain === Strain.CLUBS) {
      return scoreResponderAfterMinorTransferAccepted(auction, eval_);
    }
  }

  return null;
}

/**
 * Prevents applying 1NT convention windows once the sequence moved on.
 * @param {Auction} auction
 * @param {Seat} seat
 * @param {import('../../../model/bid.js').ContractBid} myFirst
 * @param {import('../../../model/bid.js').ContractBid} partnerFirst
 * @returns {boolean}
 */
function isStaleWindow(auction, seat, myFirst, partnerFirst) {
  if (myFirst.level === 1 && myFirst.strain === Strain.NOTRUMP && isTransferContextDead(auction, seat)) {
    return true;
  }
  if (partnerFirst.level === 1 && partnerFirst.strain === Strain.NOTRUMP && isTransferContextDead(auction, partnerSeat(seat))) {
    return true;
  }
  return false;
}

/**
 * @param {Seat} seat
 * @returns {Seat}
 */
function partnerSeat(seat) {
  if (seat === 'N') return 'S';
  if (seat === 'S') return 'N';
  if (seat === 'E') return 'W';
  return 'E';
}

/**
 * @param {Auction} auction
 * @param {Seat} seat
 * @returns {number}
 */
function contractCountBySeat(auction, seat) {
  const seats = ['N', 'E', 'S', 'W'];
  const dealerIdx = seats.indexOf(auction.dealer);
  let count = 0;
  for (let i = 0; i < auction.bids.length; i++) {
    const bidSeat = seats[(dealerIdx + i) % seats.length];
    if (bidSeat === seat && auction.bids[i].type === 'contract') count++;
  }
  return count;
}

/**
 * @param {Auction} auction
 * @param {ReturnType<typeof evaluate>} eval_
 * @param {boolean} interfered
 * @returns {BidRecommendation[]}
 */
function scoreOpenerAfterStayman(auction, eval_, interfered) {
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
      if (bid.type === 'double') {
        return rec(bid, 8, 'Penalty double over interference');
      }
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
 * @param {ReturnType<typeof evaluate>} eval_
 * @param {'D' | 'H'} transferCall
 * @param {boolean} interfered
 * @returns {BidRecommendation[]}
 */
function scoreOpenerAfterMajorTransfer(auction, eval_, transferCall, interfered) {
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
function scoreOpenerAfterMinorTransfer(auction) {
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
 * @param {ReturnType<typeof evaluate>} eval_
 * @param {'D' | 'H' | 'S'} staymanReply
 * @returns {BidRecommendation[]}
 */
function scoreResponderAfterStaymanReply(auction, eval_, staymanReply) {
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

/**
 * @param {Auction} auction
 * @param {ReturnType<typeof evaluate>} eval_
 * @param {'H' | 'S'} target
 * @returns {BidRecommendation[]}
 */
function scoreResponderAfterMajorTransferAccepted(auction, eval_, target) {
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
 * @param {ReturnType<typeof evaluate>} eval_
 * @returns {BidRecommendation[]}
 */
function scoreResponderAfterMinorTransferAccepted(auction, eval_) {
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

/**
 * @param {Auction} auction
 * @returns {import('../../../model/bid.js').Bid[]}
 */
function legalCandidates(auction) {
  const bids = [pass()];
  for (let level = 1; level <= 7; level++) {
    for (const strain of STRAIN_ORDER) {
      const bid = contractBid(level, strain);
      if (isLegalBid(auction, bid)) bids.push(bid);
    }
  }
  return bids.filter(bid => isLegalBid(auction, bid));
}

/**
 * @param {number[]} shape
 * @param {'C' | 'D' | 'H' | 'S' | 'NT'} strain
 * @returns {number}
 */
function suitLen(shape, strain) {
  if (strain === Strain.SPADES) return shape[0];
  if (strain === Strain.HEARTS) return shape[1];
  if (strain === Strain.DIAMONDS) return shape[2];
  if (strain === Strain.CLUBS) return shape[3];
  return 0;
}

/**
 * @param {number} hcp
 * @param {number} min
 * @param {number} max
 * @returns {boolean}
 */
function inRange(hcp, min, max) {
  return hcp >= min && hcp <= max;
}

/**
 * @param {'D' | 'H'} transferStrain
 * @returns {'H' | 'S'}
 */
function transferTargetFromCall(transferStrain) {
  return transferStrain === Strain.DIAMONDS ? Strain.HEARTS : Strain.SPADES;
}

/**
 * @param {import('../../../model/bid.js').Bid} bid
 * @param {number} priority
 * @param {string} explanation
 * @returns {BidRecommendation}
 */
function rec(bid, priority, explanation) {
  return { bid, priority, explanation, penalties: [] };
}

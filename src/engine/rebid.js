import {
  Strain, STRAIN_SYMBOLS,
  pen, penTotal,
  HCP_COST, FORCING_PASS_COST, LENGTH_SHORT_COST,
  MISS_SUPER_ACCEPT_COST, WRONG_SUPER_ACCEPT_COST, MISS_TRANSFER_COST,
  STAYMAN_WRONG_BID_COST, DENY_WITH_MAJOR_COST, WRONG_MAJOR_ORDER_COST,
  GAME_REACHED_COST,
  SUPER_ACCEPT_SUPPORT, SUPER_ACCEPT_HCP, NT_ACCEPT_HCP,
  STRAIN_DISPLAY,
  suitLen, deduct, scored, dbl,
  scoreGenericRebid, rebidCandidates, resolvePartnerBid,
} from './rebid-shared.js';
import { hasInterferenceAfterPartner, opponentStrains, seatStrengthFloor } from './context.js';
import { score1SuitRebid, scoreWeakTwoRebid, scorePreemptRebid } from './rebid-opener-suit.js';
import { getResponderRebidBids } from './rebid-responder.js';
import { getContinuationBids } from './rebid-continuation.js';

/**
 * @typedef {import('../model/hand.js').Hand} Hand
 * @typedef {import('./evaluate.js').Evaluation} Evaluation
 * @typedef {import('../model/bid.js').ContractBid} ContractBid
 * @typedef {import('../model/bid.js').Bid} Bid
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('./opening.js').BidRecommendation} BidRecommendation
 * @typedef {import('./penalty.js').PenaltyItem} PenaltyItem
 */

// ── Public API (re-exports) ──────────────────────────────────────────

export { getResponderRebidBids, getContinuationBids };

// ── Main ─────────────────────────────────────────────────────────────

/**
 * Score every plausible rebid for the opener.
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid - opener's first bid
 * @param {ContractBid} partnerBid - responder's bid
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} [seat] - bidder's seat (for cue-bid detection)
 * @param {boolean} [opener] - true if this player was the opening bidder
 * @returns {BidRecommendation[]}
 */
export function getRebidBids(hand, eval_, myBid, partnerBid, auction, seat, opener) {
  const oppSuits = seat ? opponentStrains(auction, seat) : new Set();
  const effectivePartnerBid = resolvePartnerBid(partnerBid, myBid, oppSuits);

  const interf = seat ? hasInterferenceAfterPartner(auction, seat) : false;
  const strengthFloor = seat ? seatStrengthFloor(auction, seat) : 0;
  const candidates = rebidCandidates(auction);
  if (interf) candidates.push(dbl());
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(scoreRebid(bid, hand, eval_, myBid, effectivePartnerBid, !!opener, interf, strengthFloor));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

// ── Top-level dispatcher ─────────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @param {ContractBid} partnerBid
 * @param {boolean} opener
 * @param {boolean} interf - true if opponents bid after partner
 * @param {number} strengthFloor - minimum HCP shown through competitive actions
 * @returns {BidRecommendation}
 */
function scoreRebid(bid, hand, eval_, myBid, partnerBid, opener, interf, strengthFloor) {
  if (myBid.level === 1 && myBid.strain === Strain.NOTRUMP) {
    return score1NTRebid(bid, hand, eval_, partnerBid, interf);
  }
  if (myBid.level === 1) {
    return score1SuitRebid(bid, eval_, myBid, partnerBid, opener, strengthFloor);
  }
  if (myBid.level === 2 && myBid.strain !== Strain.CLUBS && myBid.strain !== Strain.NOTRUMP) {
    return scoreWeakTwoRebid(bid, hand, eval_, myBid, partnerBid);
  }
  if (myBid.level >= 3 && myBid.strain !== Strain.NOTRUMP) {
    return scorePreemptRebid(bid, eval_, myBid, partnerBid);
  }
  return scoreGenericRebid(bid, eval_);
}

// ═════════════════════════════════════════════════════════════════════
// 1NT OPENER REBIDS
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} partnerBid
 * @param {boolean} interf - true if opponents bid after partner's bid
 * @returns {BidRecommendation}
 */
function score1NTRebid(bid, hand, eval_, partnerBid, interf) {
  const { level, strain } = partnerBid;
  if (level === 2 && strain === Strain.CLUBS) {
    return interf
      ? scoreAfterStaymanWithInterference(bid, eval_)
      : scoreAfterStayman(bid, eval_);
  }
  if (level === 2 && strain === Strain.DIAMONDS) {
    return interf
      ? scoreAfterTransferWithInterference(bid, hand, eval_, Strain.HEARTS)
      : scoreAfterTransfer(bid, eval_, Strain.HEARTS);
  }
  if (level === 2 && strain === Strain.HEARTS) {
    return interf
      ? scoreAfterTransferWithInterference(bid, hand, eval_, Strain.SPADES)
      : scoreAfterTransfer(bid, eval_, Strain.SPADES);
  }
  if (level === 2 && strain === Strain.SPADES) {
    return scoreAfterMinorTransferToClubs(bid, eval_);
  }
  if (level === 2 && strain === Strain.NOTRUMP) return scoreAfter2NTInvite(bid, eval_);
  if (level === 3 && strain === Strain.NOTRUMP) return scoreAfterGame(bid, 3);
  return scoreGenericRebid(bid, eval_);
}

// ── After Stayman (partner bid 2♣ over 1NT) ─────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @returns {BidRecommendation}
 */
function scoreAfterStayman(bid, eval_) {
  const { shape } = eval_;
  const sp = suitLen(shape, Strain.SPADES);
  const he = suitLen(shape, Strain.HEARTS);

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, 'Stayman is forcing', FORCING_PASS_COST);
    return scored(bid, deduct(penTotal(p)), 'Stayman is forcing: must respond', p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (level === 2 && strain === Strain.DIAMONDS) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (he >= 4) pen(p, `Have ${he} hearts: show major`, DENY_WITH_MAJOR_COST);
    else if (sp >= 4) pen(p, `Have ${sp} spades: show major`, DENY_WITH_MAJOR_COST);
    const expl = (he >= 4 || sp >= 4)
      ? 'Have 4-card major: should show it'
      : `2${STRAIN_SYMBOLS[Strain.DIAMONDS]}: no 4-card major`;
    return scored(bid, deduct(penTotal(p)), expl, p);
  }

  if (level === 2 && strain === Strain.HEARTS) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (he < 4) pen(p, `Only ${he} hearts`, STAYMAN_WRONG_BID_COST);
    const expl = he >= 4
      ? `2${STRAIN_SYMBOLS[Strain.HEARTS]}: showing 4+ hearts`
      : `Only ${he} hearts: cannot bid 2${STRAIN_SYMBOLS[Strain.HEARTS]}`;
    return scored(bid, deduct(penTotal(p)), expl, p);
  }

  if (level === 2 && strain === Strain.SPADES) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (sp < 4) pen(p, `Only ${sp} spades`, STAYMAN_WRONG_BID_COST);
    if (sp >= 4 && he >= 4) pen(p, 'Both majors: bid hearts first', WRONG_MAJOR_ORDER_COST);
    let expl;
    if (sp < 4) expl = `Only ${sp} spades: cannot bid 2${STRAIN_SYMBOLS[Strain.SPADES]}`;
    else if (he >= 4) expl = 'Have both 4-card majors: bid hearts first';
    else expl = `2${STRAIN_SYMBOLS[Strain.SPADES]}: showing 4+ spades`;
    return scored(bid, deduct(penTotal(p)), expl, p);
  }

  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, 'Not a valid Stayman response', STAYMAN_WRONG_BID_COST);
  const sym = STRAIN_SYMBOLS[strain];
  return scored(bid, deduct(penTotal(p)), `${level}${sym}: not a standard Stayman response`, p);
}

// ── After Stayman with interference (partner bid 2♣, opponent bid) ───

const STAYMAN_INTERF_DENY_COST = 3;

/**
 * When opponents interfere after partner's Stayman 2♣, the conventional
 * forcing obligation is broken. Pass now denies a 4-card major (replaces
 * the 2♦ deny), double is for penalty, and bidding a major is natural
 * (showing 4+ cards in that suit).
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @returns {BidRecommendation}
 */
function scoreAfterStaymanWithInterference(bid, eval_) {
  const { shape, hcp } = eval_;
  const sp = suitLen(shape, Strain.SPADES);
  const he = suitLen(shape, Strain.HEARTS);
  const hasMajor = he >= 4 || sp >= 4;

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    if (hasMajor) {
      pen(p, 'Have 4-card major: consider showing despite interference', STAYMAN_INTERF_DENY_COST);
    }
    const expl = hasMajor
      ? 'Interference over Stayman: have 4-card major, consider bidding'
      : 'Interference over Stayman: no 4-card major, pass denies';
    return scored(bid, deduct(penTotal(p)), expl, p);
  }

  if (bid.type === 'double') {
    return scored(bid, deduct(0), 'Penalty double of interference over Stayman');
  }

  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (strain === Strain.HEARTS) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (he < 4) pen(p, `Only ${he} hearts`, STAYMAN_WRONG_BID_COST);
    const levelCost = Math.max(0, level - 2) * HCP_COST;
    if (levelCost > 0) pen(p, `Showing hearts at ${level}-level costs bidding space`, levelCost);
    const expl = he >= 4
      ? `${level}${STRAIN_SYMBOLS[Strain.HEARTS]}: showing 4+ hearts despite interference`
      : `Only ${he} hearts: cannot show hearts`;
    return scored(bid, deduct(penTotal(p)), expl, p);
  }

  if (strain === Strain.SPADES) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (sp < 4) pen(p, `Only ${sp} spades`, STAYMAN_WRONG_BID_COST);
    if (sp >= 4 && he >= 4) pen(p, 'Both majors: bid hearts first', WRONG_MAJOR_ORDER_COST);
    const levelCost = Math.max(0, level - 2) * HCP_COST;
    if (levelCost > 0) pen(p, `Showing spades at ${level}-level costs bidding space`, levelCost);
    let expl;
    if (sp < 4) expl = `Only ${sp} spades: cannot show spades`;
    else if (he >= 4) expl = 'Have both 4-card majors: bid hearts first';
    else expl = `${level}${STRAIN_SYMBOLS[Strain.SPADES]}: showing 4+ spades despite interference`;
    return scored(bid, deduct(penTotal(p)), expl, p);
  }

  if (strain === Strain.NOTRUMP) {
    /** @type {PenaltyItem[]} */ const p = [];
    const minHcp = 15 + (level - 2) * 3;
    pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      `${level}NT: natural bid over interference`, p);
  }

  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, 'Non-standard bid after interference over Stayman', 5);
  return scored(bid, deduct(penTotal(p)), 'Non-standard response to interference over Stayman', p);
}

// ── After Jacoby Transfer ───────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} target - the major partner is transferring to
 * @returns {BidRecommendation}
 */
function scoreAfterTransfer(bid, eval_, target) {
  const { shape, hcp } = eval_;
  const support = suitLen(shape, target);
  const tSym = STRAIN_SYMBOLS[target];
  const tName = STRAIN_DISPLAY[target];

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, 'Transfer is forcing', FORCING_PASS_COST);
    return scored(bid, deduct(penTotal(p)), 'Transfer is forcing: must complete', p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (level === 2 && strain === target) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (support >= SUPER_ACCEPT_SUPPORT && hcp >= SUPER_ACCEPT_HCP) {
      pen(p, `${support} ${tName} + max: super-accept available`, MISS_SUPER_ACCEPT_COST);
    }
    return scored(bid, deduct(penTotal(p)), `2${tSym}: completing the transfer`, p);
  }

  if (level === 3 && strain === target) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (support < SUPER_ACCEPT_SUPPORT) {
      pen(p, `Only ${support} ${tName}, need ${SUPER_ACCEPT_SUPPORT}+`, WRONG_SUPER_ACCEPT_COST);
    }
    if (hcp < SUPER_ACCEPT_HCP) {
      pen(p, `${hcp} HCP, need ${SUPER_ACCEPT_HCP}`, (SUPER_ACCEPT_HCP - hcp) * HCP_COST);
    }
    const ok = support >= SUPER_ACCEPT_SUPPORT && hcp >= SUPER_ACCEPT_HCP;
    const expl = ok
      ? `3${tSym}: super-accept with ${support} ${tName} and ${hcp} HCP`
      : `Super-accept needs ${SUPER_ACCEPT_SUPPORT}+ ${tName} and ${SUPER_ACCEPT_HCP} HCP`;
    return scored(bid, deduct(penTotal(p)), expl, p);
  }

  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, 'Must complete the transfer', MISS_TRANSFER_COST);
  return scored(bid, deduct(penTotal(p)), `Must complete transfer to ${tSym}`, p);
}

// ── After Jacoby Transfer with interference ─────────────────────────

/**
 * When opponents interfere after partner's transfer bid, the transfer
 * is no longer strictly forcing. Opener can pass, complete the transfer
 * at a higher level (showing support), double for penalty, or bid NT.
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} target
 * @returns {BidRecommendation}
 */
function scoreAfterTransferWithInterference(bid, hand, eval_, target) {
  const { shape, hcp } = eval_;
  const support = suitLen(shape, target);
  const tSym = STRAIN_SYMBOLS[target];
  const tName = STRAIN_DISPLAY[target];

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    if (support >= 4) {
      pen(p, `${support} ${tName}: consider completing transfer`, 1.5);
    }
    const expl = support >= 4
      ? `${support} ${tName}: consider showing support despite interference`
      : 'Interference over transfer: pass is acceptable';
    return scored(bid, deduct(penTotal(p)), expl, p);
  }
  if (bid.type === 'double') {
    return scored(bid, deduct(0), 'Penalty double of interference');
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (strain === target) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (support < 3) {
      pen(p, `Only ${support} ${tName}: need 3+ to complete after interference`,
        (3 - support) * LENGTH_SHORT_COST);
    }
    const expl = support >= 3
      ? `${support} ${tName}: completing transfer despite interference (${level}${tSym})`
      : `Only ${support} ${tName}: risky to complete transfer at ${level}-level`;
    return scored(bid, deduct(penTotal(p)), expl, p);
  }

  if (strain === Strain.NOTRUMP) {
    /** @type {PenaltyItem[]} */ const p = [];
    const minHcp = 15 + (level - 2) * 3;
    pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      `${hcp} HCP: ${level}NT over interference`, p);
  }

  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, 'Non-standard bid after interference over transfer', 5);
  return scored(bid, deduct(penTotal(p)), 'Non-standard response to interference', p);
}

// ── After Minor Transfer (1NT - 2♠, transfer to clubs) ──────────────

/**
 * Minor transfer treatment used in SAYCBridge corpus:
 * opener should accept 2♠ by bidding 3♣ as the default completion.
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @returns {BidRecommendation}
 */
function scoreAfterMinorTransferToClubs(bid, eval_) {
  const { hcp } = eval_;
  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, 'Transfer action expected: complete to 3♣', FORCING_PASS_COST);
    return scored(bid, deduct(penTotal(p)), 'Transfer to clubs: pass is non-standard', p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;
  if (level === 3 && strain === Strain.CLUBS) {
    return scored(bid, deduct(0), '3♣: accept transfer to clubs');
  }

  /** @type {PenaltyItem[]} */ const p = [];
  if (strain === Strain.NOTRUMP) {
    pen(p, `${level}NT skips transfer acceptance`, 6);
    if (level === 2) {
      pen(p, `${hcp} HCP: better to describe shape first with 3♣`, HCP_COST);
    }
  } else {
    pen(p, `Non-standard over transfer to clubs`, 8);
  }
  return scored(bid, deduct(penTotal(p)), 'Prefer completing minor transfer with 3♣', p);
}

// ── After 2NT invite over 1NT ───────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @returns {BidRecommendation}
 */
function scoreAfter2NTInvite(bid, eval_) {
  const { hcp } = eval_;

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    if (hcp >= NT_ACCEPT_HCP) {
      pen(p, `${hcp} HCP: should accept (${NT_ACCEPT_HCP}+)`, (hcp - NT_ACCEPT_HCP + 1) * HCP_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      hcp < NT_ACCEPT_HCP ? `${hcp} HCP: decline invitation` : `${hcp} HCP: should accept`, p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  if (bid.level === 3 && bid.strain === Strain.NOTRUMP) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (hcp < NT_ACCEPT_HCP) {
      pen(p, `${hcp} HCP, need ${NT_ACCEPT_HCP}+`, (NT_ACCEPT_HCP - hcp) * HCP_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      hcp >= NT_ACCEPT_HCP ? `${hcp} HCP: accept, bid 3NT` : `${hcp} HCP: below accept range`, p);
  }

  return scoreGenericRebid(bid, eval_);
}

// ── After 3NT (game already reached) ────────────────────────────────

/**
 * @param {Bid} bid
 * @param {number} reachedLevel
 * @returns {BidRecommendation}
 */
function scoreAfterGame(bid, reachedLevel) {
  if (bid.type === 'pass') {
    return scored(bid, deduct(0), 'Game reached: pass');
  }
  const levelsAbove = bid.type === 'contract' ? Math.max(1, bid.level - reachedLevel) : 1;
  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, `${levelsAbove} level(s) above game`, levelsAbove * GAME_REACHED_COST);
  return scored(bid, deduct(penTotal(p)), 'Game reached: pass is standard', p);
}

import { contractBid, pass, Strain, STRAIN_ORDER, STRAIN_SYMBOLS, lastContractBid } from '../model/bid.js';
import { Rank } from '../model/card.js';
import { SEATS } from '../model/deal.js';
import {
  opponentStrains, hasInterferenceAfterPartner,
  findPartnerBid, findPartnerLastBid, findOwnBid, findOwnLastBid, isOpener,
  partnershipMinHcp,
} from './context.js';
import { pen, penTotal } from './penalty.js';

/**
 * @typedef {import('../model/hand.js').Hand} Hand
 * @typedef {import('./evaluate.js').Evaluation} Evaluation
 * @typedef {import('../model/bid.js').ContractBid} ContractBid
 * @typedef {import('../model/bid.js').Bid} Bid
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('./opening.js').BidRecommendation} BidRecommendation
 * @typedef {import('./penalty.js').PenaltyItem} PenaltyItem
 */

// ── Scoring costs ────────────────────────────────────────────────────

const MAX_SCORE = 10;

const HCP_COST = 2;
const LENGTH_SHORT_COST = 3;
const FORCING_PASS_COST = 15;
const SHAPE_SEMI_COST = 4;
const SHAPE_UNBAL_COST = 8;
const FIT_PREF_COST = 2;
const LONG_SUIT_PREF_COST = 2;
const MAJOR_FIT_GAME_COST = 3;

const STAYMAN_WRONG_BID_COST = 10;
const DENY_WITH_MAJOR_COST = 8;
const WRONG_MAJOR_ORDER_COST = 6;

const MISS_SUPER_ACCEPT_COST = 2;
const WRONG_SUPER_ACCEPT_COST = 5;
const MISS_TRANSFER_COST = 15;

const GAME_REACHED_COST = 5;

// ── SAYC thresholds ─────────────────────────────────────────────────

const REBID_1NT_MIN = 12;
const REBID_1NT_MAX = 14;

const MIN_MIN = 13;
const MIN_MAX = 16;
const INV_MIN = 17;
const INV_MAX = 18;
const GF_MIN = 19;

const REBID_2NT_MIN = 18;
const REBID_2NT_MAX = 19;
const REVERSE_MIN = 17;

const FIT_MIN = 4;
const REBID_SUIT_MIN = 6;
const NEW_SUIT_MIN = 4;

const SUPER_ACCEPT_SUPPORT = 4;
const SUPER_ACCEPT_HCP = 17;
const NT_ACCEPT_HCP = 16;

const RAISE_PASS_MAX = 16;
const RAISE_INV_MIN = 17;
const RAISE_INV_MAX = 18;
const RAISE_GAME_MIN = 19;

const LIMIT_ACCEPT_MIN = 14;

// ── Display ──────────────────────────────────────────────────────────

const SHAPE_STRAINS = [Strain.SPADES, Strain.HEARTS, Strain.DIAMONDS, Strain.CLUBS];

/** @type {Readonly<Record<import('../model/bid.js').Strain, string>>} */
const STRAIN_DISPLAY = {
  [Strain.CLUBS]: 'clubs',
  [Strain.DIAMONDS]: 'diamonds',
  [Strain.HEARTS]: 'hearts',
  [Strain.SPADES]: 'spades',
  [Strain.NOTRUMP]: 'notrump',
};

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
  const candidates = rebidCandidates(auction);
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(scoreRebid(bid, hand, eval_, myBid, effectivePartnerBid, !!opener, interf));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

/**
 * If partner's bid is in the opponents' suit, treat it as a cue-bid
 * raise of our suit (mapped to an equivalent level raise).
 * @param {ContractBid} partnerBid
 * @param {ContractBid} myBid
 * @param {Set<import('../model/bid.js').Strain>} oppSuits
 * @returns {ContractBid}
 */
function resolvePartnerBid(partnerBid, myBid, oppSuits) {
  if (!oppSuits.has(partnerBid.strain)) return partnerBid;
  return contractBid(partnerBid.level, myBid.strain);
}

// ── Candidate generation ─────────────────────────────────────────────

/**
 * @param {Auction} auction
 * @returns {Bid[]}
 */
function rebidCandidates(auction) {
  const last = lastContractBid(auction);
  /** @type {Bid[]} */
  const bids = [pass()];
  for (let level = 1; level <= 7; level++) {
    for (const strain of STRAIN_ORDER) {
      const bid = contractBid(level, strain);
      if (!last || isHigher(bid, last)) bids.push(bid);
    }
  }
  return bids;
}

/** @param {ContractBid} a @param {ContractBid} b */
function isHigher(a, b) {
  if (a.level !== b.level) return a.level > b.level;
  return STRAIN_ORDER.indexOf(a.strain) > STRAIN_ORDER.indexOf(b.strain);
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
 * @returns {BidRecommendation}
 */
function scoreRebid(bid, hand, eval_, myBid, partnerBid, opener, interf) {
  if (myBid.level === 1 && myBid.strain === Strain.NOTRUMP) {
    return score1NTRebid(bid, hand, eval_, partnerBid, interf);
  }
  if (myBid.level === 1) {
    return score1SuitRebid(bid, eval_, myBid, partnerBid, opener);
  }
  if (myBid.level === 2 && myBid.strain !== Strain.CLUBS && myBid.strain !== Strain.NOTRUMP) {
    return scoreWeakTwoRebid(bid, hand, eval_, myBid, partnerBid);
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
  if (level === 2 && strain === Strain.CLUBS) return scoreAfterStayman(bid, eval_);
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
  if (level === 2 && strain === Strain.NOTRUMP) return scoreAfter2NTInvite(bid, eval_);
  if (level === 3 && strain === Strain.NOTRUMP) return scoreAfterGame(bid);
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
 * @returns {BidRecommendation}
 */
function scoreAfterGame(bid) {
  if (bid.type === 'pass') {
    return scored(bid, deduct(0), 'Game reached: pass');
  }
  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, 'Game already reached', GAME_REACHED_COST);
  return scored(bid, deduct(penTotal(p)), 'Game reached: pass is standard', p);
}

// ═════════════════════════════════════════════════════════════════════
// 1-SUIT OPENER REBIDS
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @param {ContractBid} partnerBid
 * @param {boolean} opener
 * @returns {BidRecommendation}
 */
function score1SuitRebid(bid, eval_, myBid, partnerBid, opener) {
  const ms = myBid.strain;
  const ps = partnerBid.strain;
  const pl = partnerBid.level;

  if (ps === ms && pl === 2) return scoreAfterSingleRaise(bid, eval_, myBid);
  if (ps === ms && pl === 3) return scoreAfterLimitRaise(bid, eval_, myBid);
  if (ps === Strain.NOTRUMP && pl === 1) return scoreAfter1NTResp(bid, eval_, myBid);
  if (ps === Strain.NOTRUMP && pl === 2) return scoreAfter2NTResp(bid, eval_, myBid);
  return scoreAfterNewSuit(bid, eval_, myBid, partnerBid, opener);
}

// ── After new suit response (forcing one round) ─────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @param {ContractBid} partnerBid
 * @param {boolean} opener - only the opener is forced to rebid after responder's new suit
 * @returns {BidRecommendation}
 */
function scoreAfterNewSuit(bid, eval_, myBid, partnerBid, opener) {
  if (bid.type === 'pass') {
    if (opener) {
      /** @type {PenaltyItem[]} */ const p = [];
      pen(p, 'New suit is forcing', FORCING_PASS_COST);
      return scored(bid, deduct(penTotal(p)), 'New suit is forcing: must bid', p);
    }
    return scored(bid, deduct(0), 'Pass');
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;
  const ms = myBid.strain;
  const ps = partnerBid.strain;

  if (level === 1 && strain === Strain.NOTRUMP) return scoreNS_1NT(bid, eval_, ms, ps);
  if (level === 1) return scoreNS_newSuit1(bid, eval_, ps);
  if (strain === ms) return scoreNS_rebidOwn(bid, eval_, ps);
  if (strain === ps) return scoreNS_raisePartner(bid, eval_, ps);
  if (strain === Strain.NOTRUMP) return scoreNS_nt(bid, eval_);
  if (level === 2 && ranksAbove(strain, ms)) return scoreNS_reverse(bid, eval_);
  return scoreNS_newSuit(bid, eval_, ps);
}

/** 1NT rebid (12-14 balanced) after partner's new suit. */
function scoreNS_1NT(bid, eval_, ms, ps) {
  const { hcp, shape, shapeClass } = eval_;
  const myLen = suitLen(shape, ms);
  const pSup = suitLen(shape, ps);
  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, `${hcp} HCP, need ${REBID_1NT_MIN}-${REBID_1NT_MAX}`,
    hcpDev(hcp, REBID_1NT_MIN, REBID_1NT_MAX) * HCP_COST);
  pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));
  if (pSup >= FIT_MIN && isMajor(ps)) {
    pen(p, `${pSup} ${STRAIN_DISPLAY[ps]}: prefer raise`, FIT_PREF_COST);
  }
  if (myLen >= REBID_SUIT_MIN) {
    pen(p, `${myLen}-card suit: prefer rebidding`, LONG_SUIT_PREF_COST);
  }
  let expl;
  if (shapeClass !== 'balanced') expl = 'Not balanced for 1NT rebid';
  else if (hcpDev(hcp, REBID_1NT_MIN, REBID_1NT_MAX) > 0) {
    expl = `${hcp} HCP: outside 1NT rebid range (${REBID_1NT_MIN}-${REBID_1NT_MAX})`;
  } else expl = `${hcp} HCP, balanced: 1NT rebid`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/** New suit at 1-level (e.g. 1♣ – 1♦ – 1♥). */
function scoreNS_newSuit1(bid, eval_, ps) {
  const { shape } = eval_;
  const strain = /** @type {ContractBid} */ (bid).strain;
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];
  const sym = STRAIN_SYMBOLS[strain];
  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, `${len} ${name}, need ${NEW_SUIT_MIN}+`,
    Math.max(0, NEW_SUIT_MIN - len) * LENGTH_SHORT_COST);
  const pSup = suitLen(shape, ps);
  if (pSup >= FIT_MIN && isMajor(ps)) {
    pen(p, `${pSup} ${STRAIN_DISPLAY[ps]}: prefer raise`, FIT_PREF_COST);
  }
  const expl = len < NEW_SUIT_MIN
    ? `${len} ${name}: need ${NEW_SUIT_MIN}+`
    : `${len} ${name}: bid 1${sym}`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/** Rebid own suit (level determines minimum vs invitational vs game). */
function scoreNS_rebidOwn(bid, eval_, ps) {
  const { hcp, totalPoints, shape } = eval_;
  const tp = totalPoints;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];
  const sym = STRAIN_SYMBOLS[strain];
  const pSup = suitLen(shape, ps);
  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, `${len} ${name}, need ${REBID_SUIT_MIN}+`,
    Math.max(0, REBID_SUIT_MIN - len) * LENGTH_SHORT_COST);
  if (level <= 2) {
    pen(p, `${tp} total pts, need ${MIN_MIN}-${MIN_MAX}`, hcpDev(tp, MIN_MIN, MIN_MAX) * HCP_COST);
  } else if (level === 3) {
    pen(p, `${tp} total pts, need ${INV_MIN}-${INV_MAX}`, hcpDev(tp, INV_MIN, INV_MAX) * HCP_COST);
  } else {
    pen(p, `${tp} total pts, need ${GF_MIN}+`, Math.max(0, GF_MIN - tp) * HCP_COST);
  }
  if (pSup >= FIT_MIN && isMajor(ps)) {
    pen(p, `${pSup} ${STRAIN_DISPLAY[ps]}: prefer raise`, FIT_PREF_COST);
  }
  const tag = level <= 2 ? 'minimum' : level === 3 ? 'invitational' : 'game';
  const expl = len < REBID_SUIT_MIN
    ? `${len} ${name}: need ${REBID_SUIT_MIN}+ to rebid`
    : `${hcp} HCP (${tp} total), ${len} ${name}: ${level}${sym} (${tag})`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/** Raise partner's suit (level determines minimum vs invitational vs game). */
function scoreNS_raisePartner(bid, eval_, ps) {
  const { hcp, shape } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  const sup = suitLen(shape, ps);
  const name = STRAIN_DISPLAY[ps];
  const sym = STRAIN_SYMBOLS[ps];
  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, `${sup} ${name}, need ${FIT_MIN}+`, Math.max(0, FIT_MIN - sup) * LENGTH_SHORT_COST);
  if (level <= 2) {
    pen(p, `${hcp} HCP, need ${MIN_MIN}-${MIN_MAX}`, hcpDev(hcp, MIN_MIN, MIN_MAX) * HCP_COST);
  } else if (level === 3) {
    pen(p, `${hcp} HCP, need ${INV_MIN}-${INV_MAX}`, hcpDev(hcp, INV_MIN, INV_MAX) * HCP_COST);
  } else {
    pen(p, `${hcp} HCP, need ${GF_MIN}+`, Math.max(0, GF_MIN - hcp) * HCP_COST);
  }
  const tag = level <= 2 ? 'minimum raise' : level === 3 ? 'invitational raise' : 'game raise';
  const expl = sup < FIT_MIN
    ? `${sup} ${name}: need ${FIT_MIN}+ to raise`
    : `${hcp} HCP, ${sup} ${name}: ${level}${sym} (${tag})`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/** NT rebid at 2+ level after partner's new suit. */
function scoreNS_nt(bid, eval_) {
  const { hcp, shapeClass } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));
  if (level === 2) {
    pen(p, `${hcp} HCP, need ${REBID_2NT_MIN}-${REBID_2NT_MAX}`,
      hcpDev(hcp, REBID_2NT_MIN, REBID_2NT_MAX) * HCP_COST);
  } else {
    pen(p, `${hcp} HCP, need ${GF_MIN}+`, Math.max(0, GF_MIN - hcp) * HCP_COST);
  }
  const range = level === 2 ? `${REBID_2NT_MIN}-${REBID_2NT_MAX}` : `${GF_MIN}+`;
  const expl = shapeClass !== 'balanced'
    ? `Not balanced for ${level}NT`
    : `${hcp} HCP, balanced: ${level}NT (${range})`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/** Reverse: new suit ranking above opening suit at 2-level (17+). */
function scoreNS_reverse(bid, eval_) {
  const { hcp, shape } = eval_;
  const { strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];
  const sym = STRAIN_SYMBOLS[strain];
  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, `${hcp} HCP, need ${REVERSE_MIN}+`, Math.max(0, REVERSE_MIN - hcp) * HCP_COST);
  pen(p, `${len} ${name}, need ${NEW_SUIT_MIN}+`,
    Math.max(0, NEW_SUIT_MIN - len) * LENGTH_SHORT_COST);
  let expl;
  if (hcp < REVERSE_MIN) expl = `${hcp} HCP: reverse needs ${REVERSE_MIN}+`;
  else if (len < NEW_SUIT_MIN) expl = `${len} ${name}: need ${NEW_SUIT_MIN}+`;
  else expl = `${hcp} HCP, ${len} ${name}: reverse to 2${sym}`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/** New suit at 2+ level (not own suit, not partner's, not a level-2 reverse). */
function scoreNS_newSuit(bid, eval_, ps) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];
  const sym = STRAIN_SYMBOLS[strain];
  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, `${len} ${name}, need ${NEW_SUIT_MIN}+`,
    Math.max(0, NEW_SUIT_MIN - len) * LENGTH_SHORT_COST);
  if (level <= 2) {
    pen(p, `${hcp} HCP, need ${MIN_MIN}-${MIN_MAX}`, hcpDev(hcp, MIN_MIN, MIN_MAX) * HCP_COST);
  } else if (level === 3) {
    pen(p, `${hcp} HCP, need ${INV_MIN}-${INV_MAX}`, hcpDev(hcp, INV_MIN, INV_MAX) * HCP_COST);
  } else {
    pen(p, `${hcp} HCP, need ${GF_MIN}+`, Math.max(0, GF_MIN - hcp) * HCP_COST);
  }
  const pSup = suitLen(shape, ps);
  if (pSup >= FIT_MIN && isMajor(ps)) {
    pen(p, `${pSup} ${STRAIN_DISPLAY[ps]}: prefer raise`, FIT_PREF_COST);
  }
  const tag = level <= 2 ? 'new suit' : level === 3 ? 'jump shift' : 'game forcing';
  const expl = len < NEW_SUIT_MIN
    ? `${len} ${name}: need ${NEW_SUIT_MIN}+`
    : `${hcp} HCP, ${len} ${name}: ${level}${sym} (${tag})`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── After single raise (partner raised to 2, shows 6-10) ────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @returns {BidRecommendation}
 */
function scoreAfterSingleRaise(bid, eval_, myBid) {
  const { hcp, totalPoints } = eval_;
  const tp = totalPoints;
  const ms = myBid.strain;
  const sym = STRAIN_SYMBOLS[ms];
  const isMaj = isMajor(ms);

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${tp} total pts above pass threshold`,
      Math.max(0, tp - RAISE_PASS_MAX) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      tp <= RAISE_PASS_MAX ? `${hcp} HCP (${tp} total): minimum, pass` : `${hcp} HCP (${tp} total): too strong to pass`, p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (level === 3 && strain === ms) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${tp} total pts, need ${RAISE_INV_MIN}-${RAISE_INV_MAX}`,
      hcpDev(tp, RAISE_INV_MIN, RAISE_INV_MAX) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      hcpDev(tp, RAISE_INV_MIN, RAISE_INV_MAX) === 0
        ? `${hcp} HCP (${tp} total): invite with 3${sym}`
        : `${hcp} HCP (${tp} total): outside invite range (${RAISE_INV_MIN}-${RAISE_INV_MAX})`, p);
  }

  if (level === 4 && strain === ms && isMaj) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${tp} total pts, need ${RAISE_GAME_MIN}+`,
      Math.max(0, RAISE_GAME_MIN - tp) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      tp >= RAISE_GAME_MIN
        ? `${hcp} HCP (${tp} total): bid game 4${sym}`
        : `${hcp} HCP (${tp} total): need ${RAISE_GAME_MIN}+ for game`, p);
  }

  if (level === 3 && strain === Strain.NOTRUMP) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${RAISE_GAME_MIN}+`,
      Math.max(0, RAISE_GAME_MIN - hcp) * HCP_COST);
    pen(p, `${eval_.shapeClass} (prefer balanced)`, shapePenalty(eval_.shapeClass));
    if (isMaj) pen(p, 'Have major fit: prefer 4 of major', MAJOR_FIT_GAME_COST);
    return scored(bid, deduct(penTotal(p)), `${hcp} HCP: 3NT as game alternative`, p);
  }

  return scoreGenericRebid(bid, eval_);
}

// ── After limit raise (partner raised to 3, shows 10-12) ────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @returns {BidRecommendation}
 */
function scoreAfterLimitRaise(bid, eval_, myBid) {
  const { hcp } = eval_;
  const ms = myBid.strain;
  const sym = STRAIN_SYMBOLS[ms];
  const isMaj = isMajor(ms);

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    if (hcp >= LIMIT_ACCEPT_MIN) {
      pen(p, `${hcp} HCP: should accept (${LIMIT_ACCEPT_MIN}+)`,
        (hcp - LIMIT_ACCEPT_MIN + 1) * HCP_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      hcp < LIMIT_ACCEPT_MIN
        ? `${hcp} HCP: decline invitation`
        : `${hcp} HCP: should accept game`, p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (level === 4 && strain === ms && isMaj) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (hcp < LIMIT_ACCEPT_MIN) {
      pen(p, `${hcp} HCP, need ${LIMIT_ACCEPT_MIN}+`,
        (LIMIT_ACCEPT_MIN - hcp) * HCP_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      hcp >= LIMIT_ACCEPT_MIN
        ? `${hcp} HCP: accept, bid 4${sym}`
        : `${hcp} HCP: too weak to accept`, p);
  }

  if (level === 3 && strain === Strain.NOTRUMP && !isMaj) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (hcp < LIMIT_ACCEPT_MIN) {
      pen(p, `${hcp} HCP, need ${LIMIT_ACCEPT_MIN}+`,
        (LIMIT_ACCEPT_MIN - hcp) * HCP_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      hcp >= LIMIT_ACCEPT_MIN ? `${hcp} HCP: 3NT game` : `${hcp} HCP: too weak for game`, p);
  }

  if (level === 5 && strain === ms && !isMaj) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (hcp < LIMIT_ACCEPT_MIN) {
      pen(p, `${hcp} HCP, need ${LIMIT_ACCEPT_MIN}+`,
        (LIMIT_ACCEPT_MIN - hcp) * HCP_COST);
    }
    return scored(bid, deduct(penTotal(p)), `${hcp} HCP: 5${sym} game`, p);
  }

  return scoreGenericRebid(bid, eval_);
}

// ── After 1NT response (6-10, not forcing) ───────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @returns {BidRecommendation}
 */
function scoreAfter1NTResp(bid, eval_, myBid) {
  const { hcp, totalPoints, shape, shapeClass } = eval_;
  const tp = totalPoints;
  const ms = myBid.strain;
  const myLen = suitLen(shape, ms);
  const sym = STRAIN_SYMBOLS[ms];
  const name = STRAIN_DISPLAY[ms];

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    if (myLen >= REBID_SUIT_MIN) pen(p, `${myLen}-card suit`, LONG_SUIT_PREF_COST);
    if (tp >= INV_MIN) pen(p, `${hcp} HCP (${tp} total): too strong to pass`, (tp - MIN_MAX) * HCP_COST);
    if (shapeClass === 'unbalanced') {
      pen(p, 'Unbalanced: risky for 1NT', 5);
    } else if (shapeClass === 'semi-balanced') {
      pen(p, 'Semi-balanced: consider rebidding', 2);
    }
    let expl;
    if (tp >= INV_MIN) {
      expl = `${hcp} HCP (${tp} total): too strong to pass`;
    } else if (shapeClass !== 'balanced') {
      expl = `${shapeClass}: consider rebidding rather than 1NT`;
    } else if (tp <= MIN_MAX && myLen < REBID_SUIT_MIN) {
      expl = `${hcp} HCP, balanced minimum: pass`;
    } else {
      expl = `${hcp} HCP: consider bidding`;
    }
    return scored(bid, deduct(penTotal(p)), expl, p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (level === 2 && strain === ms) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${myLen} ${name}, need ${REBID_SUIT_MIN}+`,
      Math.max(0, REBID_SUIT_MIN - myLen) * LENGTH_SHORT_COST);
    return scored(bid, deduct(penTotal(p)),
      myLen >= REBID_SUIT_MIN
        ? `${myLen} ${name}: rebid 2${sym}`
        : `${myLen} ${name}: need ${REBID_SUIT_MIN}+`, p);
  }

  if (level === 2 && strain !== Strain.NOTRUMP && strain !== ms) {
    const sLen = suitLen(shape, strain);
    const sName = STRAIN_DISPLAY[strain];
    const sSym = STRAIN_SYMBOLS[strain];
    const isRev = ranksAbove(strain, ms);
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${sLen} ${sName}, need ${NEW_SUIT_MIN}+`,
      Math.max(0, NEW_SUIT_MIN - sLen) * LENGTH_SHORT_COST);
    if (isRev) {
      pen(p, `${hcp} HCP, need ${REVERSE_MIN}+ for reverse`,
        Math.max(0, REVERSE_MIN - hcp) * HCP_COST);
    }
    return scored(bid, deduct(penTotal(p)), `${sLen} ${sName}: 2${sSym}`, p);
  }

  if (level === 2 && strain === Strain.NOTRUMP) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${REBID_2NT_MIN}-${REBID_2NT_MAX}`,
      hcpDev(hcp, REBID_2NT_MIN, REBID_2NT_MAX) * HCP_COST);
    pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));
    return scored(bid, deduct(penTotal(p)),
      (hcp >= REBID_2NT_MIN && hcp <= REBID_2NT_MAX && shapeClass === 'balanced')
        ? `${hcp} HCP, balanced: 2NT`
        : `${hcp} HCP: outside 2NT range`, p);
  }

  return scoreGenericRebid(bid, eval_);
}

// ── After 2NT response (13-15, game forcing) ─────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @returns {BidRecommendation}
 */
function scoreAfter2NTResp(bid, eval_, myBid) {
  const { hcp, shape } = eval_;
  const ms = myBid.strain;
  const myLen = suitLen(shape, ms);
  const sym = STRAIN_SYMBOLS[ms];
  const name = STRAIN_DISPLAY[ms];

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, '2NT is game-forcing', FORCING_PASS_COST);
    return scored(bid, deduct(penTotal(p)), '2NT is game-forcing: must bid', p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (level === 3 && strain === Strain.NOTRUMP) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (myLen >= REBID_SUIT_MIN) pen(p, `${myLen}-card suit: consider showing`, LONG_SUIT_PREF_COST);
    return scored(bid, deduct(penTotal(p)), `${hcp} HCP: 3NT`, p);
  }

  if (level === 3 && strain === ms) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${myLen} ${name}, need ${REBID_SUIT_MIN}+`,
      Math.max(0, REBID_SUIT_MIN - myLen) * LENGTH_SHORT_COST);
    return scored(bid, deduct(penTotal(p)),
      myLen >= REBID_SUIT_MIN
        ? `${myLen} ${name}: rebid 3${sym}`
        : `${myLen} ${name}: need ${REBID_SUIT_MIN}+`, p);
  }

  if (level === 3 && strain !== Strain.NOTRUMP) {
    const sLen = suitLen(shape, strain);
    const sName = STRAIN_DISPLAY[strain];
    const sSym = STRAIN_SYMBOLS[strain];
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${sLen} ${sName}, need ${NEW_SUIT_MIN}+`,
      Math.max(0, NEW_SUIT_MIN - sLen) * LENGTH_SHORT_COST);
    return scored(bid, deduct(penTotal(p)), `${sLen} ${sName}: 3${sSym}`, p);
  }

  if (level === 4 && strain === ms && isMajor(ms)) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${myLen} ${name}, need ${REBID_SUIT_MIN}+`,
      Math.max(0, REBID_SUIT_MIN - myLen) * LENGTH_SHORT_COST);
    return scored(bid, deduct(penTotal(p)), `${myLen} ${name}: 4${sym} game`, p);
  }

  return scoreGenericRebid(bid, eval_);
}

// ═════════════════════════════════════════════════════════════════════
// WEAK TWO REBIDS
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @param {ContractBid} partnerBid
 * @returns {BidRecommendation}
 */
function scoreWeakTwoRebid(bid, hand, eval_, myBid, partnerBid) {
  const ms = myBid.strain;
  const ps = partnerBid.strain;
  const pl = partnerBid.level;

  if (ps === Strain.NOTRUMP && pl === 2) return scoreAfterWT2NT(bid, hand, eval_, myBid);
  if (ps === ms && pl === 3) return scoreAfterWTRaise(bid);
  if (ps === ms && pl >= 4) return scoreAfterGame(bid);
  if (ps === Strain.NOTRUMP && pl === 3) return scoreAfterGame(bid);
  if (ps !== ms && ps !== Strain.NOTRUMP) return scoreAfterWTNewSuit(bid, eval_, myBid, partnerBid);
  return scoreGenericRebid(bid, eval_);
}

// ── After 2NT feature ask (forcing) ──────────────────────────────────

const WT_REBID_MAX_HCP = 10;
const WT_REBID_FEATURE_COST = 3;
const WT_REBID_NO_FEATURE_COST = 2;
const WT_REBID_GAME_MIN = 9;

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @returns {BidRecommendation}
 */
function scoreAfterWT2NT(bid, hand, eval_, myBid) {
  const { hcp, shape } = eval_;
  const ms = myBid.strain;
  const mSym = STRAIN_SYMBOLS[ms];
  const feature = findFeatureSuit(hand, ms);

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, '2NT feature ask is forcing', FORCING_PASS_COST);
    return scored(bid, deduct(penTotal(p)), '2NT feature ask is forcing: must respond', p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (level === 3 && strain === ms) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (feature) {
      pen(p, `Have ${STRAIN_DISPLAY[feature]} feature: should show it`, WT_REBID_NO_FEATURE_COST);
    }
    const expl = feature
      ? `Have feature in ${STRAIN_DISPLAY[feature]}: consider showing it`
      : `No outside feature: rebid 3${mSym} (minimum)`;
    return scored(bid, deduct(penTotal(p)), expl, p);
  }

  if (level === 3 && strain !== ms && strain !== Strain.NOTRUMP) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (!feature || feature !== strain) {
      pen(p, `No feature in ${STRAIN_DISPLAY[strain]}`, WT_REBID_FEATURE_COST * 2);
    }
    const name = STRAIN_DISPLAY[strain];
    const expl = (feature && feature === strain)
      ? `Showing ${name} feature (A or K)`
      : `No feature in ${name}`;
    return scored(bid, deduct(penTotal(p)), expl, p);
  }

  if (level === 4 && strain === ms && isMajor(ms)) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (hcp < WT_REBID_GAME_MIN) {
      pen(p, `${hcp} HCP: need ${WT_REBID_GAME_MIN}+ (max) for game jump`,
        (WT_REBID_GAME_MIN - hcp) * HCP_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      hcp >= WT_REBID_GAME_MIN
        ? `${hcp} HCP maximum: jump to 4${mSym}`
        : `${hcp} HCP: not maximum for game`, p);
  }

  return scoreGenericRebid(bid, eval_);
}

// ── After preemptive raise to 3 (pass) ───────────────────────────────

/**
 * @param {Bid} bid
 * @returns {BidRecommendation}
 */
function scoreAfterWTRaise(bid) {
  if (bid.type === 'pass') {
    return scored(bid, deduct(0), 'Partner raised preemptively: pass');
  }
  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, 'Partner raised preemptively: pass is standard', GAME_REACHED_COST);
  return scored(bid, deduct(penTotal(p)), 'Preemptive raise: pass is standard', p);
}

// ── After new suit forcing ───────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @param {ContractBid} partnerBid
 * @returns {BidRecommendation}
 */
function scoreAfterWTNewSuit(bid, eval_, myBid, partnerBid) {
  const { hcp, shape } = eval_;
  const ms = myBid.strain;
  const ps = partnerBid.strain;

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, 'New suit over weak two is forcing', FORCING_PASS_COST);
    return scored(bid, deduct(penTotal(p)), 'New suit is forcing: must bid', p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (strain === ms) {
    /** @type {PenaltyItem[]} */ const p = [];
    const sup = suitLen(shape, ps);
    if (sup >= 3) {
      pen(p, `${sup} ${STRAIN_DISPLAY[ps]}: prefer raising partner`, FIT_PREF_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      `Rebid ${STRAIN_SYMBOLS[ms]}: no support for partner's suit`, p);
  }

  if (strain === ps) {
    const sup = suitLen(shape, ps);
    /** @type {PenaltyItem[]} */ const p = [];
    if (sup < 3) {
      pen(p, `Only ${sup} ${STRAIN_DISPLAY[ps]}: need 3+ to raise`,
        (3 - sup) * LENGTH_SHORT_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      sup >= 3
        ? `${sup} ${STRAIN_DISPLAY[ps]}: raise partner's suit`
        : `Only ${sup} ${STRAIN_DISPLAY[ps]}: need 3+ to raise`, p);
  }

  return scoreGenericRebid(bid, eval_);
}

/**
 * Find the first side suit (not the weak-two suit) containing an Ace or King.
 * @param {Hand} hand
 * @param {import('../model/bid.js').Strain} weakSuit
 * @returns {import('../model/bid.js').Strain | null}
 */
function findFeatureSuit(hand, weakSuit) {
  for (const strain of SHAPE_STRAINS) {
    if (strain === weakSuit) continue;
    const hasFeat = hand.cards.some(
      c => c.suit === /** @type {any} */ (strain) &&
           (c.rank === Rank.ACE || c.rank === Rank.KING)
    );
    if (hasFeat) return strain;
  }
  return null;
}

// ═════════════════════════════════════════════════════════════════════
// RESPONDER'S REBID
// ═════════════════════════════════════════════════════════════════════

const RR_MIN_MAX = 9;
const RR_INV_MIN = 10;
const RR_INV_MAX = 12;
const RR_GF_MIN = 13;

const RR_FIT = 3;
const RR_OWN_SUIT = 5;
const RR_NEW_SUIT = 4;
const RR_FSF_MIN = 13;

const RR_REVERSE_PASS_COST = 12;
const RR_GF_PASS_COST = 15;

/**
 * Minimum HCP the responder already showed with their first bid.
 * @param {ContractBid} myBid
 * @param {ContractBid} openerOpen
 * @returns {number}
 */
function responderMinShown(myBid, openerOpen) {
  if (myBid.strain === Strain.NOTRUMP) return myBid.level >= 2 ? 13 : 6;
  if (myBid.strain === openerOpen.strain) return myBid.level >= 3 ? 10 : 6;
  return myBid.level >= 2 ? 10 : 6;
}

/**
 * Whether the partnership is game-forced by responder's first bid.
 * @param {ContractBid} myBid
 * @param {ContractBid} openerOpen
 * @returns {boolean}
 */
function isRespGF(myBid, openerOpen) {
  if (myBid.strain === Strain.NOTRUMP && myBid.level >= 2) return true;
  if (myBid.strain !== openerOpen.strain && myBid.strain !== Strain.NOTRUMP && myBid.level >= 3) return true;
  return false;
}

/** @param {ContractBid} bid */
function isGameLevel(bid) {
  if (bid.strain === Strain.NOTRUMP) return bid.level >= 3;
  if (isMajor(bid.strain)) return bid.level >= 4;
  return bid.level >= 5;
}

/**
 * Cheapest level at which `strain` can be legally bid over `afterBid`.
 * @param {import('../model/bid.js').Strain} strain
 * @param {ContractBid} afterBid
 * @returns {number}
 */
function minBidLevel(strain, afterBid) {
  if (strain !== afterBid.strain && ranksAbove(strain, afterBid.strain)) {
    return afterBid.level;
  }
  return afterBid.level + 1;
}

/**
 * Score every plausible rebid for the responder.
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid - responder's first bid
 * @param {ContractBid} openerOpen - opener's first bid (the opening)
 * @param {ContractBid} openerRebid - opener's second bid (the rebid)
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {BidRecommendation[]}
 */
export function getResponderRebidBids(hand, eval_, myBid, openerOpen, openerRebid, auction, seat) {
  const candidates = rebidCandidates(auction);
  const respMin = responderMinShown(myBid, openerOpen);
  const gf = isRespGF(myBid, openerOpen);
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(scoreResponderRebid(bid, eval_, myBid, openerOpen, openerRebid, respMin, gf));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @param {ContractBid} openerOpen
 * @param {ContractBid} openerRebid
 * @param {number} respMin
 * @param {boolean} gf
 * @returns {BidRecommendation}
 */
function scoreResponderRebid(bid, eval_, myBid, openerOpen, openerRebid, respMin, gf) {
  const rs = openerRebid.strain;
  const ms = myBid.strain;
  const os = openerOpen.strain;

  if (rs === ms && ms !== Strain.NOTRUMP) {
    const isGameTry = os === ms && openerRebid.level === myBid.level + 1;
    return scoreRR_afterRaise(bid, eval_, myBid, openerRebid, respMin, gf, isGameTry);
  }
  if (rs === Strain.NOTRUMP) {
    return scoreRR_afterNT(bid, eval_, myBid, openerOpen, openerRebid, respMin, gf);
  }
  if (rs === os) {
    return scoreRR_afterRebidSuit(bid, eval_, myBid, openerOpen, openerRebid, respMin, gf);
  }
  if (openerRebid.level === 2 && ranksAbove(rs, os)) {
    return scoreRR_afterReverse(bid, eval_, myBid, openerOpen, openerRebid);
  }
  return scoreRR_afterNewSuit(bid, eval_, myBid, openerOpen, openerRebid, respMin, gf);
}

// ── After opener raises responder's suit ─────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @param {ContractBid} openerRebid
 * @param {number} _respMin
 * @param {boolean} gf
 * @param {boolean} [isGameTry] - opener re-raised the agreed suit (game invitation)
 * @returns {BidRecommendation}
 */
function scoreRR_afterRaise(bid, eval_, myBid, openerRebid, _respMin, gf, isGameTry) {
  const { hcp } = eval_;
  const ms = myBid.strain;
  const sym = STRAIN_SYMBOLS[ms];
  const isMaj = isMajor(ms);
  const rl = openerRebid.level;
  const isJump = rl > myBid.level + 1;
  const gameLevel = isMaj ? 4 : 5;

  if (rl >= gameLevel) return scoreAfterGame(bid);

  const gameHcp = isJump ? 8 : isGameTry ? 8 : RR_GF_MIN;
  const invHcp = isJump ? 6 : isGameTry ? 7 : RR_INV_MIN;
  const invMax = isJump ? 7 : isGameTry ? 7 : RR_INV_MAX;

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    if (gf && !isGameLevel(openerRebid)) {
      pen(p, 'Game-forcing: must bid to game', RR_GF_PASS_COST);
    } else if (hcp >= gameHcp) {
      pen(p, `${hcp} HCP: enough for game (${gameHcp}+)`, (hcp - gameHcp + 1) * HCP_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      hcp < gameHcp ? `${hcp} HCP: pass ${rl}${sym}` : `${hcp} HCP: should bid game`, p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (strain === ms && level === rl + 1 && level < gameLevel) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${invHcp}-${invMax}`,
      hcpDev(hcp, invHcp, invMax) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      hcpDev(hcp, invHcp, invMax) === 0
        ? `${hcp} HCP: invite with ${level}${sym}`
        : `${hcp} HCP: outside invite range (${invHcp}-${invMax})`, p);
  }

  if (strain === ms && level === gameLevel) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${gameHcp}+`, Math.max(0, gameHcp - hcp) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      hcp >= gameHcp ? `${hcp} HCP: game ${level}${sym}` : `${hcp} HCP: need ${gameHcp}+ for game`, p);
  }

  if (strain === Strain.NOTRUMP && level === 3) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${gameHcp}+`, Math.max(0, gameHcp - hcp) * HCP_COST);
    pen(p, `${eval_.shapeClass} (prefer balanced)`, shapePenalty(eval_.shapeClass));
    if (isMaj) pen(p, `Have major fit: prefer ${gameLevel}${sym}`, MAJOR_FIT_GAME_COST);
    return scored(bid, deduct(penTotal(p)), `${hcp} HCP: 3NT`, p);
  }

  return scoreGenericRebid(bid, eval_);
}

// ── After opener rebids own suit ─────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @param {ContractBid} openerOpen
 * @param {ContractBid} openerRebid
 * @param {number} _respMin
 * @param {boolean} gf
 * @returns {BidRecommendation}
 */
function scoreRR_afterRebidSuit(bid, eval_, myBid, openerOpen, openerRebid, _respMin, gf) {
  if (isGameLevel(openerRebid)) return scoreAfterGame(bid);

  const { hcp, shape, shapeClass } = eval_;
  const os = openerOpen.strain;
  const ms = myBid.strain;
  const oSym = STRAIN_SYMBOLS[os];
  const mSym = ms !== Strain.NOTRUMP ? STRAIN_SYMBOLS[ms] : 'NT';
  const oSup = suitLen(shape, os);
  const myLen = ms !== Strain.NOTRUMP ? suitLen(shape, ms) : 0;
  const cheapest = minBidLevel(os, myBid);
  const isJump = openerRebid.level > cheapest;
  const gameHcp = isJump ? 8 : RR_GF_MIN;

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    if (gf && !isGameLevel(openerRebid)) {
      pen(p, 'Game-forcing: must bid to game', RR_GF_PASS_COST);
    } else {
      if (hcp >= gameHcp) pen(p, `${hcp} HCP: enough for game`, (hcp - gameHcp + 1) * HCP_COST);
      if (!isJump && oSup >= RR_FIT && hcp >= RR_INV_MIN) {
        pen(p, `${oSup} ${STRAIN_DISPLAY[os]} support: consider raising`, 1.5);
      }
      if (!isJump && myLen >= RR_OWN_SUIT && hcp >= RR_INV_MIN) {
        pen(p, `${myLen}-card suit: consider rebidding`, 1);
      }
    }
    return scored(bid, deduct(penTotal(p)),
      hcp < (isJump ? 8 : RR_INV_MIN) && oSup < RR_FIT
        ? `${hcp} HCP: minimum, pass`
        : `${hcp} HCP: consider bidding`, p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (strain === os) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${oSup} ${STRAIN_DISPLAY[os]}, need ${RR_FIT}+`,
      Math.max(0, RR_FIT - oSup) * LENGTH_SHORT_COST);
    if (!isGameLevel({ level, strain })) {
      pen(p, `${hcp} HCP, need ${RR_INV_MIN}-${RR_INV_MAX}`,
        hcpDev(hcp, RR_INV_MIN, RR_INV_MAX) * HCP_COST);
      return scored(bid, deduct(penTotal(p)),
        oSup >= RR_FIT
          ? `${hcp} HCP, ${oSup} ${STRAIN_DISPLAY[os]}: invite ${level}${oSym}`
          : `${oSup} ${STRAIN_DISPLAY[os]}: need ${RR_FIT}+ to raise`, p);
    }
    if (isMajor(os) && level === 4) {
      pen(p, `${hcp} HCP, need ${gameHcp}+`, Math.max(0, gameHcp - hcp) * HCP_COST);
      return scored(bid, deduct(penTotal(p)),
        oSup >= RR_FIT && hcp >= gameHcp
          ? `${hcp} HCP, ${oSup} ${STRAIN_DISPLAY[os]}: game 4${oSym}`
          : `Need more for game`, p);
    }
    return scoreGenericRebid(bid, eval_);
  }

  if (strain === Strain.NOTRUMP && level === 2 && !isJump) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${RR_INV_MIN}-${RR_INV_MAX}`,
      hcpDev(hcp, RR_INV_MIN, RR_INV_MAX) * HCP_COST);
    pen(p, `${shapeClass} (prefer balanced)`, shapePenalty(shapeClass));
    return scored(bid, deduct(penTotal(p)),
      (hcp >= RR_INV_MIN && hcp <= RR_INV_MAX)
        ? `${hcp} HCP: 2NT invitational`
        : `${hcp} HCP: outside 2NT range`, p);
  }

  if (strain === Strain.NOTRUMP && level === 3) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${gameHcp}+`, Math.max(0, gameHcp - hcp) * HCP_COST);
    pen(p, `${shapeClass} (prefer balanced)`, shapePenalty(shapeClass));
    if (oSup >= RR_FIT && isMajor(os)) pen(p, 'Fit for opener: prefer major game', FIT_PREF_COST);
    return scored(bid, deduct(penTotal(p)),
      hcp >= gameHcp ? `${hcp} HCP: 3NT` : `${hcp} HCP: need ${gameHcp}+ for 3NT`, p);
  }

  if (ms !== Strain.NOTRUMP && strain === ms) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${myLen} ${STRAIN_DISPLAY[ms]}, need ${RR_OWN_SUIT}+`,
      Math.max(0, RR_OWN_SUIT - myLen) * LENGTH_SHORT_COST);
    pen(p, `${hcp} HCP, need ${RR_INV_MIN}+`, Math.max(0, RR_INV_MIN - hcp) * HCP_COST);
    if (oSup >= RR_FIT && isMajor(os)) pen(p, 'Fit for opener: prefer supporting', FIT_PREF_COST);
    const gameLevel = isMajor(ms) ? 4 : 5;
    if (level > gameLevel) {
      pen(p, `${level}${mSym}: ${level - gameLevel} above game`, (level - gameLevel) * GAME_REACHED_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      myLen >= RR_OWN_SUIT
        ? `${myLen} ${STRAIN_DISPLAY[ms]}: rebid ${level}${mSym}`
        : `Need ${RR_OWN_SUIT}+ to rebid`, p);
  }

  if (strain !== Strain.NOTRUMP && strain !== os && (ms === Strain.NOTRUMP || strain !== ms)) {
    const len = suitLen(shape, strain);
    const sName = STRAIN_DISPLAY[strain];
    const sSym = STRAIN_SYMBOLS[strain];
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${len} ${sName}, need ${RR_NEW_SUIT}+`,
      Math.max(0, RR_NEW_SUIT - len) * LENGTH_SHORT_COST);
    pen(p, `${hcp} HCP, need ${RR_INV_MIN}+`, Math.max(0, RR_INV_MIN - hcp) * HCP_COST);
    const newGameLevel = isMajor(strain) ? 4 : 5;
    if (level > newGameLevel) {
      pen(p, `${level}${sSym}: ${level - newGameLevel} above game`, (level - newGameLevel) * GAME_REACHED_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      len >= RR_NEW_SUIT && hcp >= RR_INV_MIN
        ? `${hcp} HCP, ${len} ${sName}: ${level}${sSym} (forcing)`
        : `${level}${sSym}`, p);
  }

  return scoreGenericRebid(bid, eval_);
}

// ── After opener bids NT ─────────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @param {ContractBid} _openerOpen
 * @param {ContractBid} openerRebid
 * @param {number} _respMin
 * @param {boolean} gf
 * @returns {BidRecommendation}
 */
function scoreRR_afterNT(bid, eval_, myBid, _openerOpen, openerRebid, _respMin, gf) {
  if (isGameLevel(openerRebid)) return scoreAfterGame(bid);

  const { hcp, shape, shapeClass } = eval_;
  const ms = myBid.strain;
  const myLen = ms !== Strain.NOTRUMP ? suitLen(shape, ms) : 0;
  const ntLevel = openerRebid.level;
  const highNT = ntLevel >= 2;
  const gameHcp = highNT ? 7 : RR_GF_MIN;

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    if (gf && !isGameLevel(openerRebid)) {
      pen(p, 'Game-forcing: must bid to game', RR_GF_PASS_COST);
    } else if (highNT && hcp >= gameHcp) {
      pen(p, `${hcp} HCP over ${ntLevel}NT: should bid game`, (hcp - gameHcp + 1) * HCP_COST);
    } else if (!highNT && hcp >= RR_INV_MIN) {
      pen(p, `${hcp} HCP: too strong to pass 1NT`, (hcp - RR_MIN_MAX) * HCP_COST);
    }
    if (!highNT && myLen >= RR_OWN_SUIT && hcp <= RR_MIN_MAX) {
      pen(p, `${myLen}-card suit: consider signing off in suit`, 1);
    }
    return scored(bid, deduct(penTotal(p)),
      (highNT ? hcp < gameHcp : hcp <= RR_MIN_MAX)
        ? `${hcp} HCP: pass ${ntLevel}NT`
        : `${hcp} HCP: should bid`, p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (!highNT && level === 2 && strain === Strain.NOTRUMP) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${RR_INV_MIN}-${RR_INV_MAX}`,
      hcpDev(hcp, RR_INV_MIN, RR_INV_MAX) * HCP_COST);
    pen(p, `${shapeClass} (prefer balanced)`, shapePenalty(shapeClass));
    return scored(bid, deduct(penTotal(p)),
      hcpDev(hcp, RR_INV_MIN, RR_INV_MAX) === 0
        ? `${hcp} HCP: 2NT invite`
        : `${hcp} HCP: outside 2NT range`, p);
  }

  if (level === 3 && strain === Strain.NOTRUMP) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${gameHcp}+`, Math.max(0, gameHcp - hcp) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      hcp >= gameHcp ? `${hcp} HCP: 3NT game` : `${hcp} HCP: need ${gameHcp}+ for game`, p);
  }

  if (ms !== Strain.NOTRUMP && strain === ms) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${myLen} ${STRAIN_DISPLAY[ms]}, need ${RR_OWN_SUIT}+`,
      Math.max(0, RR_OWN_SUIT - myLen) * LENGTH_SHORT_COST);
    if (level <= 2 && hcp >= RR_INV_MIN) {
      pen(p, `${hcp} HCP: too strong for sign-off`, (hcp - RR_MIN_MAX) * HCP_COST);
    }
    if (level === 3 && hcpDev(hcp, RR_INV_MIN, RR_INV_MAX) > 0) {
      pen(p, `${hcp} HCP: outside invitational range`,
        hcpDev(hcp, RR_INV_MIN, RR_INV_MAX) * HCP_COST);
    }
    const tag = hcp <= RR_MIN_MAX ? 'sign-off' : hcp <= RR_INV_MAX ? 'invitational' : 'game-forcing';
    return scored(bid, deduct(penTotal(p)),
      myLen >= RR_OWN_SUIT
        ? `${myLen} ${STRAIN_DISPLAY[ms]}: ${level}${STRAIN_SYMBOLS[ms]} (${tag})`
        : `Need ${RR_OWN_SUIT}+ to rebid`, p);
  }

  if (strain !== Strain.NOTRUMP && (ms === Strain.NOTRUMP || strain !== ms)) {
    const len = suitLen(shape, strain);
    const sName = STRAIN_DISPLAY[strain];
    const sSym = STRAIN_SYMBOLS[strain];
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${len} ${sName}, need ${RR_NEW_SUIT}+`,
      Math.max(0, RR_NEW_SUIT - len) * LENGTH_SHORT_COST);
    if (level >= 3 && hcp < RR_INV_MIN) {
      pen(p, `${hcp} HCP: need ${RR_INV_MIN}+ at 3-level`, (RR_INV_MIN - hcp) * HCP_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      len >= RR_NEW_SUIT
        ? `${hcp} HCP, ${len} ${sName}: ${level}${sSym}`
        : `Need ${RR_NEW_SUIT}+ ${sName}`, p);
  }

  return scoreGenericRebid(bid, eval_);
}

// ── After opener reverses ────────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @param {ContractBid} openerOpen
 * @param {ContractBid} openerRebid
 * @returns {BidRecommendation}
 */
function scoreRR_afterReverse(bid, eval_, myBid, openerOpen, openerRebid) {
  if (isGameLevel(openerRebid)) return scoreAfterGame(bid);

  const { hcp, shape, shapeClass } = eval_;
  const os = openerOpen.strain;
  const rs = openerRebid.strain;
  const ms = myBid.strain;
  const myLen = ms !== Strain.NOTRUMP ? suitLen(shape, ms) : 0;

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, 'Reverse is forcing: must bid', RR_REVERSE_PASS_COST);
    return scored(bid, deduct(penTotal(p)), 'Opener reversed (17+): forcing, must bid', p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (strain === os && level <= 3) {
    const oSup = suitLen(shape, os);
    /** @type {PenaltyItem[]} */ const p = [];
    return scored(bid, deduct(penTotal(p)),
      `${oSup} ${STRAIN_DISPLAY[os]}: preference to ${level}${STRAIN_SYMBOLS[os]} (minimum)`, p);
  }

  if (ms !== Strain.NOTRUMP && strain === ms && level <= 3) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${myLen} ${STRAIN_DISPLAY[ms]}, need ${RR_OWN_SUIT}+`,
      Math.max(0, RR_OWN_SUIT - myLen) * LENGTH_SHORT_COST);
    return scored(bid, deduct(penTotal(p)),
      myLen >= RR_OWN_SUIT
        ? `${myLen} ${STRAIN_DISPLAY[ms]}: ${level}${STRAIN_SYMBOLS[ms]} (forcing)`
        : `Need ${RR_OWN_SUIT}+ to rebid`, p);
  }

  if (strain === rs) {
    const rSup = suitLen(shape, rs);
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${rSup} ${STRAIN_DISPLAY[rs]}, need ${RR_FIT}+`,
      Math.max(0, RR_FIT - rSup) * LENGTH_SHORT_COST);
    if (hcp < RR_INV_MIN) pen(p, `${hcp} HCP: need extras to raise`, (RR_INV_MIN - hcp) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      rSup >= RR_FIT
        ? `${rSup} ${STRAIN_DISPLAY[rs]}: raise to ${level}${STRAIN_SYMBOLS[rs]}`
        : `Need ${RR_FIT}+ support`, p);
  }

  if (strain === Strain.NOTRUMP && level === 2) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${shapeClass} (prefer balanced)`, shapePenalty(shapeClass));
    return scored(bid, deduct(penTotal(p)), `${hcp} HCP: 2NT (minimum, forcing)`, p);
  }

  if (strain === Strain.NOTRUMP && level === 3) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${shapeClass} (prefer balanced)`, shapePenalty(shapeClass));
    return scored(bid, deduct(penTotal(p)), `${hcp} HCP: 3NT game`, p);
  }

  if (level === 4 && isMajor(strain)) {
    const sup = suitLen(shape, strain);
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${sup} ${STRAIN_DISPLAY[strain]}, need ${RR_FIT}+`,
      Math.max(0, RR_FIT - sup) * LENGTH_SHORT_COST);
    return scored(bid, deduct(penTotal(p)),
      `${sup} ${STRAIN_DISPLAY[strain]}: 4${STRAIN_SYMBOLS[strain]} game`, p);
  }

  return scoreGenericRebid(bid, eval_);
}

// ── After opener shows a new suit ────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @param {ContractBid} openerOpen
 * @param {ContractBid} openerRebid
 * @param {number} _respMin
 * @param {boolean} gf
 * @returns {BidRecommendation}
 */
function scoreRR_afterNewSuit(bid, eval_, myBid, openerOpen, openerRebid, _respMin, gf) {
  if (isGameLevel(openerRebid)) return scoreAfterGame(bid);

  const { hcp, shape, shapeClass } = eval_;
  const os = openerOpen.strain;
  const ns = openerRebid.strain;
  const ms = myBid.strain;
  const myLen = ms !== Strain.NOTRUMP ? suitLen(shape, ms) : 0;

  const bidSuits = new Set([os, ns]);
  if (ms !== Strain.NOTRUMP) bidSuits.add(ms);
  /** @type {import('../model/bid.js').Strain | null} */
  let fourthSuit = null;
  if (bidSuits.size === 3) {
    for (const s of SHAPE_STRAINS) {
      if (!bidSuits.has(s)) { fourthSuit = s; break; }
    }
  }

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    if (gf && !isGameLevel(openerRebid)) {
      pen(p, 'Game-forcing: must bid to game', RR_GF_PASS_COST);
    } else {
      if (hcp >= RR_INV_MIN) pen(p, `${hcp} HCP: should bid`, (hcp - RR_MIN_MAX) * HCP_COST);
      const o1Sup = suitLen(shape, os);
      const o2Sup = suitLen(shape, ns);
      if (o1Sup >= RR_FIT || o2Sup >= RR_FIT) pen(p, 'Fit in opener\'s suit', 1.5);
    }
    return scored(bid, deduct(penTotal(p)),
      hcp <= RR_MIN_MAX ? `${hcp} HCP: minimum, pass` : `${hcp} HCP: should bid`, p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (strain === os) {
    const oSup = suitLen(shape, os);
    /** @type {PenaltyItem[]} */ const p = [];
    const cheapPref = minBidLevel(os, openerRebid);
    if (level <= cheapPref) {
      if (hcp >= RR_GF_MIN) pen(p, `${hcp} HCP: consider stronger action`, 1.5);
      return scored(bid, deduct(penTotal(p)),
        `${oSup} ${STRAIN_DISPLAY[os]}: preference to ${level}${STRAIN_SYMBOLS[os]}`, p);
    }
    pen(p, `${oSup} ${STRAIN_DISPLAY[os]}, need ${RR_FIT}+`,
      Math.max(0, RR_FIT - oSup) * LENGTH_SHORT_COST);
    pen(p, `${hcp} HCP, need ${RR_INV_MIN}+`, Math.max(0, RR_INV_MIN - hcp) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      `${oSup} ${STRAIN_DISPLAY[os]}: ${level}${STRAIN_SYMBOLS[os]} (invitational)`, p);
  }

  if (strain === ns) {
    const nSup = suitLen(shape, ns);
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${nSup} ${STRAIN_DISPLAY[ns]}, need ${RR_FIT + 1}+`,
      Math.max(0, RR_FIT + 1 - nSup) * LENGTH_SHORT_COST);
    pen(p, `${hcp} HCP, need ${RR_INV_MIN}+`, Math.max(0, RR_INV_MIN - hcp) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      nSup >= RR_FIT + 1
        ? `${nSup} ${STRAIN_DISPLAY[ns]}: raise to ${level}${STRAIN_SYMBOLS[ns]}`
        : `Need ${RR_FIT + 1}+ to raise`, p);
  }

  if (fourthSuit && strain === fourthSuit && level <= 3) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${RR_FSF_MIN}+`, Math.max(0, RR_FSF_MIN - hcp) * HCP_COST);
    const fSym = STRAIN_SYMBOLS[fourthSuit];
    return scored(bid, deduct(penTotal(p)),
      hcp >= RR_FSF_MIN
        ? `${hcp} HCP: fourth-suit forcing ${level}${fSym} (artificial, game-forcing)`
        : `${hcp} HCP: need ${RR_FSF_MIN}+ for fourth-suit forcing`, p);
  }

  if (strain === Strain.NOTRUMP) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${shapeClass} (prefer balanced)`, shapePenalty(shapeClass));
    if (level === 2) {
      pen(p, `${hcp} HCP, need ${RR_INV_MIN}-${RR_INV_MAX}`,
        hcpDev(hcp, RR_INV_MIN, RR_INV_MAX) * HCP_COST);
      return scored(bid, deduct(penTotal(p)),
        hcpDev(hcp, RR_INV_MIN, RR_INV_MAX) === 0
          ? `${hcp} HCP: 2NT invite`
          : `${hcp} HCP: outside 2NT range`, p);
    }
    if (level === 3) {
      pen(p, `${hcp} HCP, need ${RR_GF_MIN}+`, Math.max(0, RR_GF_MIN - hcp) * HCP_COST);
      return scored(bid, deduct(penTotal(p)),
        hcp >= RR_GF_MIN ? `${hcp} HCP: 3NT` : `${hcp} HCP: need ${RR_GF_MIN}+ for 3NT`, p);
    }
    return scoreGenericRebid(bid, eval_);
  }

  if (ms !== Strain.NOTRUMP && strain === ms) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${myLen} ${STRAIN_DISPLAY[ms]}, need ${RR_OWN_SUIT}+`,
      Math.max(0, RR_OWN_SUIT - myLen) * LENGTH_SHORT_COST);
    if (level >= 3) pen(p, `${hcp} HCP, need ${RR_INV_MIN}+`, Math.max(0, RR_INV_MIN - hcp) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      myLen >= RR_OWN_SUIT
        ? `${myLen} ${STRAIN_DISPLAY[ms]}: rebid ${level}${STRAIN_SYMBOLS[ms]}`
        : `Need ${RR_OWN_SUIT}+ to rebid`, p);
  }

  return scoreGenericRebid(bid, eval_);
}

// ═════════════════════════════════════════════════════════════════════
// CONTINUATION BIDDING (3rd+ bid — context-aware decision module)
// ═════════════════════════════════════════════════════════════════════

/** @type {Readonly<Record<import('../model/deal.js').Seat, import('../model/deal.js').Seat>>} */
const CONT_PARTNER = { N: 'S', S: 'N', E: 'W', W: 'E' };

const CONT_COMBINED_GAME = 25;
const CONT_COMBINED_SLAM = 33;
const CONT_FIT_SUPPORT = 3;
const CONT_OWN_SUIT = 6;
const CONT_NEW_SUIT = 5;
const CONT_GAME_PASS_COST = 5;
const CONT_SLAM_PASS_COST = 3;
const CONT_ABOVE_GAME_COST = 5;
const CONT_FIT_GAME_BONUS = 3;
const CONT_LOW_LEVEL_GAME_COST = 3;

/**
 * Score bids for a player on their third or later turn.
 * Context-aware: detects forcing sequences, estimates combined strength,
 * and prefers bids consistent with the partnership's direction.
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {BidRecommendation[]}
 */
export function getContinuationBids(hand, eval_, auction, seat) {
  const partnerLast = findPartnerLastBid(auction, seat);
  const ownLast = findOwnLastBid(auction, seat);
  const forcing = partnerLast ? contDetectForcing(auction, seat, partnerLast) : false;
  const fitStrain = contFindFit(eval_, auction, seat);
  const pRange = contEstimatePartnerRange(auction, seat);
  const combinedMin = eval_.hcp + pRange.min;
  const combinedMax = eval_.hcp + pRange.max;
  const pSuits = contPartnerSuits(auction, seat);
  const pfloor = partnershipMinHcp(auction, seat);
  const last = lastContractBid(auction);
  const currentLevel = last ? last.level : 0;

  const candidates = rebidCandidates(auction);
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(contScore(bid, hand, eval_, partnerLast, ownLast,
      forcing, fitStrain, combinedMin, combinedMax, pSuits, pfloor, currentLevel));
  }
  return results.sort((a, b) => b.priority - a.priority);
}

// ── Forcing detection ────────────────────────────────────────────────

/**
 * Determine if partner's most recent bid creates a forcing obligation.
 * Forcing when: partner introduces a genuinely new suit, partner makes
 * a jump bid in their own suit (showing extras), the partnership is in
 * a 2♣ game-forcing auction below game, or partner bids at the 3-level+
 * in a non-game sequence.
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @param {ContractBid} partnerLast
 * @returns {boolean}
 */
function contDetectForcing(auction, seat, partnerLast) {
  if (isGameLevel(partnerLast)) return false;

  const oppSuits = opponentStrains(auction, seat);
  if (partnerLast.strain !== Strain.NOTRUMP && oppSuits.has(partnerLast.strain)) return true;

  const partner = CONT_PARTNER[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);

  let partnerLastIdx = -1;
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    if (s === partner && auction.bids[i].type === 'contract') {
      partnerLastIdx = i;
      break;
    }
  }

  if (partnerLastIdx >= 0) {
    for (let i = partnerLastIdx + 1; i < auction.bids.length; i++) {
      const s = SEATS[(dealerIdx + i) % SEATS.length];
      if (s === seat && auction.bids[i].type === 'contract') return false;
    }
  }

  if (partnerLast.strain !== Strain.NOTRUMP && partnerLastIdx >= 0) {
    /** @type {Set<import('../model/bid.js').Strain>} */
    const prevStrains = new Set();
    /** @type {ContractBid | null} */
    let partnerPrevInStrain = null;
    for (let i = 0; i < partnerLastIdx; i++) {
      const s = SEATS[(dealerIdx + i) % SEATS.length];
      const b = auction.bids[i];
      if ((s === seat || s === partner) && b.type === 'contract' && b.strain !== Strain.NOTRUMP) {
        prevStrains.add(/** @type {ContractBid} */ (b).strain);
        if (s === partner && /** @type {ContractBid} */ (b).strain === partnerLast.strain) {
          partnerPrevInStrain = /** @type {ContractBid} */ (b);
        }
      }
    }
    if (!prevStrains.has(partnerLast.strain)) return true;

    if (partnerPrevInStrain && partnerLast.level >= partnerPrevInStrain.level + 2) {
      return true;
    }
  }

  const partnerFirst = findPartnerBid(auction, seat);
  if (partnerFirst && partnerFirst.level === 2 && partnerFirst.strain === Strain.CLUBS &&
      isOpener(auction, partner)) {
    return true;
  }
  const ownFirst = findOwnBid(auction, seat);
  if (ownFirst && ownFirst.level === 2 && ownFirst.strain === Strain.CLUBS &&
      isOpener(auction, seat)) {
    return true;
  }

  return false;
}

// ── Fit analysis ─────────────────────────────────────────────────────

/**
 * Find the best fit strain for the continuation context.
 * Priority: mutual suit > partner suit we can support > null.
 * Filters out strains that belong to the opponents so competitive
 * interference doesn't confuse the fit-finding logic.
 * @param {Evaluation} eval_
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {import('../model/bid.js').Strain | null}
 */
function contFindFit(eval_, auction, seat) {
  const partner = CONT_PARTNER[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  const oppSuits = opponentStrains(auction, seat);

  /** @type {Set<import('../model/bid.js').Strain>} */
  const ownSuits = new Set();
  /** @type {Set<import('../model/bid.js').Strain>} */
  const partnerSuitSet = new Set();

  for (let i = 0; i < auction.bids.length; i++) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    const b = auction.bids[i];
    if (b.type === 'contract' && b.strain !== Strain.NOTRUMP &&
        !oppSuits.has(/** @type {ContractBid} */ (b).strain)) {
      if (s === seat) ownSuits.add(/** @type {ContractBid} */ (b).strain);
      else if (s === partner) partnerSuitSet.add(/** @type {ContractBid} */ (b).strain);
    }
  }

  for (const strain of ownSuits) {
    if (partnerSuitSet.has(strain)) return strain;
  }

  /** @type {import('../model/bid.js').Strain | null} */
  let bestFit = null;
  let bestLen = 0;
  for (const strain of SHAPE_STRAINS) {
    if (!partnerSuitSet.has(strain)) continue;
    const len = suitLen(eval_.shape, strain);
    if (len >= CONT_FIT_SUPPORT) {
      if (!bestFit || (isMajor(strain) && !isMajor(bestFit)) || len > bestLen) {
        bestFit = strain;
        bestLen = len;
      }
    }
  }
  return bestFit;
}

/**
 * Collect all suit strains partner has bid.
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {Set<import('../model/bid.js').Strain>}
 */
function contPartnerSuits(auction, seat) {
  const partner = CONT_PARTNER[seat];
  const dealerIdx = SEATS.indexOf(auction.dealer);
  const oppSuits = opponentStrains(auction, seat);
  /** @type {Set<import('../model/bid.js').Strain>} */
  const suits = new Set();
  for (let i = 0; i < auction.bids.length; i++) {
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    const b = auction.bids[i];
    if (s === partner && b.type === 'contract' && b.strain !== Strain.NOTRUMP &&
        !oppSuits.has(/** @type {ContractBid} */ (b).strain)) {
      suits.add(/** @type {ContractBid} */ (b).strain);
    }
  }
  return suits;
}

// ── Partner range estimation ─────────────────────────────────────────

/**
 * Estimate partner's HCP range from their bidding history.
 * Uses both the first bid and (if available) the rebid to narrow the
 * range significantly — the original code kept opener at 13-21 in most
 * cases which made combinedMid too low to trigger game-level penalties.
 * @param {Auction} auction
 * @param {import('../model/deal.js').Seat} seat
 * @returns {{ min: number, max: number }}
 */
function contEstimatePartnerRange(auction, seat) {
  const partner = CONT_PARTNER[seat];
  const partnerFirst = findPartnerBid(auction, seat);
  if (!partnerFirst) return { min: 0, max: 0 };

  const partnerOpened = isOpener(auction, partner);
  const { level, strain } = partnerFirst;

  /** @type {{ min: number, max: number }} */
  let range;

  if (partnerOpened) {
    if (level === 1 && strain === Strain.NOTRUMP) range = { min: 15, max: 17 };
    else if (level === 2 && strain === Strain.NOTRUMP) range = { min: 20, max: 21 };
    else if (level === 2 && strain === Strain.CLUBS) range = { min: 22, max: 37 };
    else if (level === 2) range = { min: 5, max: 11 };
    else if (level >= 3) range = { min: 5, max: 10 };
    else range = { min: 13, max: 21 };
  } else {
    if (strain === Strain.NOTRUMP) {
      if (level === 1) range = { min: 6, max: 10 };
      else if (level === 2) range = { min: 13, max: 15 };
      else range = { min: 13, max: 17 };
    } else {
      const ownFirst = findOwnBid(auction, seat);
      if (ownFirst && ownFirst.strain === strain) {
        range = level <= ownFirst.level + 1 ? { min: 6, max: 10 } : { min: 10, max: 12 };
      } else if (level >= 2) {
        range = { min: 10, max: 17 };
      } else {
        range = { min: 6, max: 17 };
      }
    }
  }

  const partnerLast = findPartnerLastBid(auction, seat);
  if (partnerLast &&
      (partnerLast.level !== partnerFirst.level || partnerLast.strain !== partnerFirst.strain)) {
    range = narrowByRebid(range, partnerFirst, partnerLast, partnerOpened);
  }

  return range;
}

/**
 * Narrow partner's range based on what their second bid reveals.
 * @param {{ min: number, max: number }} base
 * @param {ContractBid} first
 * @param {ContractBid} last
 * @param {boolean} opened
 * @returns {{ min: number, max: number }}
 */
function narrowByRebid(base, first, last, opened) {
  let { min, max } = base;

  if (opened && first.level === 1 && first.strain !== Strain.NOTRUMP) {
    if (last.strain === Strain.NOTRUMP && last.level === 1) {
      return { min: Math.max(min, 12), max: Math.min(max, 14) };
    }
    if (last.strain === first.strain) {
      const isJump = last.level >= first.level + 2;
      if (isJump) return { min: Math.max(min, 17), max };
      return { min, max: Math.min(max, 16) };
    }
    if (last.strain === Strain.NOTRUMP && last.level === 2) {
      return { min: Math.max(min, 18), max: Math.min(max, 19) };
    }
    if (last.strain === Strain.NOTRUMP && last.level >= 3) {
      return { min: Math.max(min, 19), max };
    }
    if (last.strain !== Strain.NOTRUMP && last.strain !== first.strain) {
      const isReverse = last.level === 2 &&
        STRAIN_ORDER.indexOf(last.strain) > STRAIN_ORDER.indexOf(first.strain);
      if (isReverse) return { min: Math.max(min, 17), max };
      if (last.level >= 3 && last.strain !== first.strain) {
        return { min: Math.max(min, 17), max };
      }
      return { min, max: Math.min(max, 18) };
    }
  }

  if (!opened) {
    if (last.strain === Strain.NOTRUMP && last.level === 2) {
      return { min: Math.max(min, 10), max: Math.min(max, 12) };
    }
    if (last.strain === Strain.NOTRUMP && last.level >= 3) {
      return { min: Math.max(min, 13), max };
    }
    if (last.strain !== Strain.NOTRUMP && last.strain === first.strain) {
      const isJump = last.level >= first.level + 2;
      if (isJump) return { min: Math.max(min, 10), max };
      return { min, max: Math.min(max, 10) };
    }
    if (last.strain !== Strain.NOTRUMP && last.strain !== first.strain) {
      return { min: Math.max(min, 10), max };
    }
  }

  if (last.level >= first.level + 2 && last.strain === first.strain) {
    min = Math.max(min, min + 2);
  }
  return { min, max };
}

// ── Main continuation scorer ─────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Hand} hand
 * @param {Evaluation} eval_
 * @param {ContractBid | null} partnerLast
 * @param {ContractBid | null} ownLast
 * @param {boolean} forcing
 * @param {import('../model/bid.js').Strain | null} fitStrain
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @param {Set<import('../model/bid.js').Strain>} partnerSuits
 * @param {number} partnershipFloor
 * @param {number} currentLevel
 * @returns {BidRecommendation}
 */
function contScore(bid, hand, eval_, partnerLast, ownLast, forcing,
    fitStrain, combinedMin, combinedMax, partnerSuits, partnershipFloor, currentLevel) {

  const gameReached = (partnerLast && isGameLevel(partnerLast)) ||
                      (ownLast && isGameLevel(ownLast));

  if (bid.type === 'pass') {
    if (gameReached && !forcing) {
      return scored(bid, deduct(0), 'Game reached: pass');
    }
    return contScorePass(bid, eval_, partnerLast, forcing, fitStrain,
      combinedMin, combinedMax, partnershipFloor, currentLevel);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  if (gameReached) {
    return contScoreAboveGame(bid, eval_, combinedMin, combinedMax, partnershipFloor);
  }

  const { strain } = bid;

  if (fitStrain && strain === fitStrain) {
    return contScoreFitBid(bid, eval_, fitStrain, combinedMin, combinedMax, partnershipFloor);
  }
  if (partnerSuits.has(strain) && strain !== Strain.NOTRUMP) {
    return contScorePreference(bid, eval_, strain, combinedMin, combinedMax, partnershipFloor);
  }
  if (ownLast && strain === ownLast.strain && strain !== Strain.NOTRUMP) {
    return contScoreRebidOwn(bid, eval_, combinedMin, combinedMax, partnershipFloor);
  }
  if (strain === Strain.NOTRUMP) {
    return contScoreNT(bid, hand, eval_, combinedMin, combinedMax, partnershipFloor);
  }
  return contScoreNewSuit(bid, eval_, fitStrain, combinedMin);
}

// ── Pass ─────────────────────────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid | null} partnerLast
 * @param {boolean} forcing
 * @param {import('../model/bid.js').Strain | null} fitStrain
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @param {number} partnershipFloor
 * @param {number} currentLevel
 * @returns {BidRecommendation}
 */
function contScorePass(bid, eval_, partnerLast, forcing, fitStrain,
    combinedMin, combinedMax, partnershipFloor, currentLevel) {
  const { hcp } = eval_;
  /** @type {PenaltyItem[]} */
  const p = [];
  const effMin = Math.max(combinedMin, partnershipFloor);
  const combinedMid = (effMin + combinedMax) / 2;

  if (forcing) {
    pen(p, 'Partner\'s bid is forcing: must respond', FORCING_PASS_COST);
    return scored(bid, deduct(penTotal(p)), 'Partner\'s bid is forcing: must bid', p);
  }

  if (combinedMid >= CONT_COMBINED_SLAM) {
    pen(p, `Combined ~${effMin}-${combinedMax} pts: slam interest`, CONT_SLAM_PASS_COST);
  }

  if (partnerLast && isGameLevel(partnerLast) && combinedMid < CONT_COMBINED_SLAM) {
    return scored(bid, deduct(penTotal(p)), 'Game reached: pass');
  }

  if (hcp >= 17 && currentLevel <= 3) {
    pen(p, `${hcp} HCP: too strong to sell out at ${currentLevel}-level`,
      (hcp - 16) * 2);
  }

  if (combinedMid >= CONT_COMBINED_GAME) {
    const gamePen = Math.min(CONT_GAME_PASS_COST, (combinedMid - CONT_COMBINED_GAME + 1));
    pen(p, `Combined ~${effMin}-${combinedMax} pts: game values`, gamePen);
    if (fitStrain) {
      pen(p, `Fit in ${STRAIN_DISPLAY[fitStrain]}: should bid game`, CONT_FIT_GAME_BONUS);
      if (!isMajor(fitStrain)) {
        pen(p, 'Minor fit with game values: consider 3NT', 2);
      }
    }
    if (currentLevel <= 2) {
      pen(p, `Only at ${currentLevel}-level with game values`, CONT_LOW_LEVEL_GAME_COST);
    }
  } else if (combinedMid >= CONT_COMBINED_GAME - 2 && currentLevel <= 2) {
    pen(p, `Combined ~${effMin}-${combinedMax}: invitational, only at ${currentLevel}-level`, 2);
    if (fitStrain) pen(p, `Fit in ${STRAIN_DISPLAY[fitStrain]}: consider game try`, 1.5);
  }

  let expl;
  if (penTotal(p) < 0.5) {
    expl = `${hcp} HCP: pass (partscore level)`;
  } else if (combinedMid >= CONT_COMBINED_SLAM) {
    expl = `Combined ${effMin}-${combinedMax}: slam potential, consider exploring`;
  } else if (combinedMid >= CONT_COMBINED_GAME) {
    expl = `Combined ${effMin}-${combinedMax}: game values, should bid on`;
  } else {
    expl = `${hcp} HCP: pass`;
  }
  return scored(bid, deduct(penTotal(p)), expl, p);
}

// ── Above game (partner already bid game; only slam justifies more) ─

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @returns {BidRecommendation}
 */
function contScoreAboveGame(bid, eval_, combinedMin, combinedMax, partnershipFloor) {
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const sym = strain === Strain.NOTRUMP ? 'NT' : STRAIN_SYMBOLS[strain];
  const effMin = Math.max(combinedMin, partnershipFloor);
  const combinedMid = (effMin + combinedMax) / 2;

  /** @type {PenaltyItem[]} */
  const p = [];
  if (combinedMid < CONT_COMBINED_SLAM) {
    pen(p, `Game reached, combined ~${effMin}-${combinedMax}: below slam values`,
      CONT_ABOVE_GAME_COST * (level - 3));
  }
  if (level >= 6) {
    pen(p, `${level}-level bid carries inherent risk`, (level - 5) * 3);
  }
  if (level === 7 && combinedMid < 37) {
    pen(p, `Combined ~${combinedMid}: far below grand slam values`, (37 - combinedMid) * 1.5);
  }
  return scored(bid, deduct(penTotal(p)),
    combinedMid >= CONT_COMBINED_SLAM
      ? `Combined ${effMin}-${combinedMax}: slam interest, ${level}${sym}`
      : `Game reached: pass is standard`, p);
}

// ── Bid in agreed fit strain ─────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} fitStrain
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @returns {BidRecommendation}
 */
function contScoreFitBid(bid, eval_, fitStrain, combinedMin, combinedMax, partnershipFloor) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const support = suitLen(shape, fitStrain);
  const sym = STRAIN_SYMBOLS[fitStrain];
  const name = STRAIN_DISPLAY[fitStrain];
  const effMin = Math.max(combinedMin, partnershipFloor);
  const combinedMid = (effMin + combinedMax) / 2;
  const gameLevel = isMajor(fitStrain) ? 4 : 5;

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${support} ${name}, need ${CONT_FIT_SUPPORT}+`,
    Math.max(0, CONT_FIT_SUPPORT - support) * LENGTH_SHORT_COST);

  if (level === gameLevel) {
    if (combinedMid < CONT_COMBINED_GAME) {
      pen(p, `Combined ~${effMin}-${combinedMax}: below game values`,
        (CONT_COMBINED_GAME - combinedMid) * 0.5);
    }
    return scored(bid, deduct(penTotal(p)),
      combinedMid >= CONT_COMBINED_GAME
        ? `Combined ${effMin}-${combinedMax}, ${support} ${name}: ${level}${sym} game`
        : `${hcp} HCP: ${level}${sym} may be too high`, p);
  }

  if (level > gameLevel) {
    if (combinedMid < CONT_COMBINED_SLAM) {
      pen(p, `Combined ~${effMin}-${combinedMax}: below slam values`,
        (CONT_COMBINED_SLAM - combinedMid) * 0.5);
    }
    pen(p, `Level ${level} in ${name}: ${level - gameLevel} above game`,
      (level - gameLevel) * 3);
    return scored(bid, deduct(penTotal(p)),
      `${hcp} HCP, ${support} ${name}: ${level}${sym}`, p);
  }

  if (combinedMid >= CONT_COMBINED_GAME) {
    pen(p, `Combined ${effMin}-${combinedMax}: should bid game`, 4);
  } else if (combinedMid >= CONT_COMBINED_GAME - 2) {
    pen(p, `Combined ${effMin}-${combinedMax}: close to game`, 2);
  }
  const tag = combinedMid >= CONT_COMBINED_GAME - 2 ? 'invitational' : 'competitive';
  return scored(bid, deduct(penTotal(p)),
    `${hcp} HCP, ${support} ${name}: ${level}${sym} (${tag})`, p);
}

// ── Preference to partner's suit (no explicit fit agreed) ────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain} strain
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @returns {BidRecommendation}
 */
function contScorePreference(bid, eval_, strain, combinedMin, combinedMax, partnershipFloor) {
  const { hcp, shape } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  const support = suitLen(shape, strain);
  const sym = STRAIN_SYMBOLS[strain];
  const name = STRAIN_DISPLAY[strain];
  const effMin = Math.max(combinedMin, partnershipFloor);
  const combinedMid = (effMin + combinedMax) / 2;
  const gameLevel = strain === Strain.NOTRUMP ? 3 : isMajor(strain) ? 4 : 5;

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${support} ${name}, need 2+`, Math.max(0, 2 - support) * LENGTH_SHORT_COST);
  if (support < CONT_FIT_SUPPORT) {
    pen(p, `Only ${support} ${name}: thin preference`, (CONT_FIT_SUPPORT - support) * 1.5);
  }
  if (isGameLevel(/** @type {ContractBid} */ (bid)) && combinedMid < CONT_COMBINED_GAME) {
    pen(p, 'Below game values for this level', 2);
  }
  if (level >= 4 && !isGameLevel(/** @type {ContractBid} */ (bid))) {
    pen(p, `Level ${level}: high for preference`, (level - 3) * 3);
  }
  if (level > gameLevel && combinedMid < CONT_COMBINED_SLAM) {
    pen(p, `Level ${level}: ${level - gameLevel} above game without slam values`,
      (level - gameLevel) * CONT_ABOVE_GAME_COST);
  }

  return scored(bid, deduct(penTotal(p)),
    support >= 2
      ? `${support} ${name}: preference to ${level}${sym}`
      : `Only ${support} ${name}: risky preference`, p);
}

// ── Rebid own suit ───────────────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @returns {BidRecommendation}
 */
function contScoreRebidOwn(bid, eval_, combinedMin, combinedMax, partnershipFloor) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const sym = STRAIN_SYMBOLS[strain];
  const name = STRAIN_DISPLAY[strain];
  const effMin = Math.max(combinedMin, partnershipFloor);
  const combinedMid = (effMin + combinedMax) / 2;
  const atGame = isGameLevel(/** @type {ContractBid} */ (bid));
  const gameLevel = isMajor(strain) ? 4 : 5;

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${len} ${name}, need ${CONT_OWN_SUIT}+`,
    Math.max(0, CONT_OWN_SUIT - len) * LENGTH_SHORT_COST);

  if (atGame && combinedMid < CONT_COMBINED_GAME) {
    pen(p, `Combined ~${effMin}-${combinedMax}: below game values`,
      (CONT_COMBINED_GAME - combinedMid) * 0.5);
  }
  if (!atGame && level < gameLevel && combinedMid >= CONT_COMBINED_GAME) {
    pen(p, `Combined ${effMin}-${combinedMax}: should bid game`, 3);
  }
  if (level > gameLevel) {
    if (combinedMid < CONT_COMBINED_SLAM) {
      pen(p, `Combined ~${effMin}-${combinedMax}: below slam values`,
        (level - gameLevel) * CONT_ABOVE_GAME_COST);
    }
  }

  return scored(bid, deduct(penTotal(p)),
    len >= CONT_OWN_SUIT
      ? `${hcp} HCP, ${len} ${name}: rebid ${level}${sym}${atGame ? ' game' : ''}`
      : `Need ${CONT_OWN_SUIT}+ to rebid`, p);
}

// ── NT ───────────────────────────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Hand} _hand
 * @param {Evaluation} eval_
 * @param {number} combinedMin
 * @param {number} combinedMax
 * @returns {BidRecommendation}
 */
function contScoreNT(bid, _hand, eval_, combinedMin, combinedMax, partnershipFloor) {
  const { hcp, shapeClass } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  const effMin = Math.max(combinedMin, partnershipFloor);
  const combinedMid = (effMin + combinedMax) / 2;

  /** @type {PenaltyItem[]} */
  const p = [];

  if (level === 3) {
    if (combinedMid >= CONT_COMBINED_GAME) {
      if (shapeClass === 'semi-balanced') pen(p, `${shapeClass}: not ideal for NT`, 2);
      else if (shapeClass === 'unbalanced') pen(p, `${shapeClass}: risky for NT game`, 4);
    } else {
      pen(p, `${shapeClass} (prefer balanced)`, shapePenalty(shapeClass));
      pen(p, `Combined ~${effMin}-${combinedMax}: below game values`,
        (CONT_COMBINED_GAME - combinedMid) * 0.5);
    }
    return scored(bid, deduct(penTotal(p)),
      combinedMid >= CONT_COMBINED_GAME
        ? `${hcp} HCP, combined ${effMin}-${combinedMax}: 3NT game`
        : `${hcp} HCP: below game values for 3NT`, p);
  }

  pen(p, `${shapeClass} (prefer balanced)`, shapePenalty(shapeClass));

  if (level === 2) {
    pen(p, `${hcp} HCP, need 10-12`, hcpDev(hcp, 10, 12) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      hcpDev(hcp, 10, 12) === 0
        ? `${hcp} HCP: 2NT invitational`
        : `${hcp} HCP: outside 2NT invite range`, p);
  }

  if (level >= 4) {
    if (combinedMid < CONT_COMBINED_SLAM) {
      pen(p, `Combined ~${effMin}-${combinedMax}: below slam values`,
        Math.max(0, CONT_COMBINED_SLAM - combinedMid) * 0.5);
    }
    pen(p, `${level}NT: ${level - 3} levels above game`, (level - 3) * CONT_ABOVE_GAME_COST);
  }

  return scored(bid, deduct(penTotal(p)), `${hcp} HCP: ${level}NT`, p);
}

// ── New suit (forcing at this stage) ─────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {import('../model/bid.js').Strain | null} fitStrain
 * @param {number} combinedMin
 * @returns {BidRecommendation}
 */
function contScoreNewSuit(bid, eval_, fitStrain, combinedMin) {
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const sym = STRAIN_SYMBOLS[strain];
  const name = STRAIN_DISPLAY[strain];

  /** @type {PenaltyItem[]} */
  const p = [];
  pen(p, `${len} ${name}, need ${CONT_NEW_SUIT}+`,
    Math.max(0, CONT_NEW_SUIT - len) * LENGTH_SHORT_COST);
  if (hcp < 10) {
    pen(p, `${hcp} HCP: need 10+ for new suit at this stage`, (10 - hcp) * HCP_COST);
  }
  if (fitStrain) {
    pen(p, `Have ${STRAIN_DISPLAY[fitStrain]} fit: prefer supporting`, FIT_PREF_COST);
  }
  if (level >= 4) {
    pen(p, `Level ${level}: very high for a new suit`, (level - 3) * 3);
  }

  return scored(bid, deduct(penTotal(p)),
    len >= CONT_NEW_SUIT && hcp >= 10
      ? `${hcp} HCP, ${len} ${name}: ${level}${sym} (forcing)`
      : `${level}${sym}: new suit in continuation`, p);
}

// ── Generic rebid fallback ───────────────────────────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @returns {BidRecommendation}
 */
function scoreGenericRebid(bid, eval_) {
  if (bid.type === 'pass') return scored(bid, deduct(0), 'Pass');
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { hcp } = eval_;
  const { level, strain } = bid;
  const minHcp = MIN_MIN + (level - 1) * 3;
  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, `${hcp} HCP, need ${minHcp}+`, Math.max(0, minHcp - hcp) * HCP_COST);
  const sym = strain === Strain.NOTRUMP ? 'NT' : STRAIN_SYMBOLS[strain];
  return scored(bid, deduct(penTotal(p)), `${level}${sym}: non-standard rebid`, p);
}

// ── Helpers ──────────────────────────────────────────────────────────

/** @param {number[]} shape @param {import('../model/bid.js').Strain} strain */
function suitLen(shape, strain) {
  return shape[SHAPE_STRAINS.indexOf(strain)];
}

/** @param {import('../model/bid.js').Strain} strain */
function isMajor(strain) {
  return strain === Strain.SPADES || strain === Strain.HEARTS;
}

/**
 * @param {import('../model/bid.js').Strain} a
 * @param {import('../model/bid.js').Strain} b
 */
function ranksAbove(a, b) {
  return STRAIN_ORDER.indexOf(a) > STRAIN_ORDER.indexOf(b);
}

function hcpDev(hcp, min, max) {
  if (hcp < min) return min - hcp;
  if (hcp > max) return hcp - max;
  return 0;
}

function shapePenalty(sc) {
  if (sc === 'semi-balanced') return SHAPE_SEMI_COST;
  if (sc === 'unbalanced') return SHAPE_UNBAL_COST;
  return 0;
}

function deduct(penalty) {
  return Math.round((MAX_SCORE - penalty) * 10) / 10;
}

/**
 * @param {Bid} bid
 * @param {number} priority
 * @param {string} explanation
 * @param {PenaltyItem[]} [penalties]
 * @returns {BidRecommendation}
 */
function scored(bid, priority, explanation, penalties) {
  return { bid, priority, explanation, penalties: penalties || [] };
}

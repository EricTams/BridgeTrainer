import { contractBid, pass, Strain, STRAIN_ORDER, STRAIN_SYMBOLS, lastContractBid } from '../model/bid.js';
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
 * @param {Hand} _hand
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid - opener's first bid
 * @param {ContractBid} partnerBid - responder's bid
 * @param {Auction} auction
 * @returns {BidRecommendation[]}
 */
export function getRebidBids(_hand, eval_, myBid, partnerBid, auction) {
  const candidates = rebidCandidates(auction);
  /** @type {BidRecommendation[]} */
  const results = [];
  for (const bid of candidates) {
    results.push(scoreRebid(bid, eval_, myBid, partnerBid));
  }
  return results.sort((a, b) => b.priority - a.priority);
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
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @param {ContractBid} partnerBid
 * @returns {BidRecommendation}
 */
function scoreRebid(bid, eval_, myBid, partnerBid) {
  if (myBid.level === 1 && myBid.strain === Strain.NOTRUMP) {
    return score1NTRebid(bid, eval_, partnerBid);
  }
  if (myBid.level === 1) {
    return score1SuitRebid(bid, eval_, myBid, partnerBid);
  }
  return scoreGenericRebid(bid, eval_);
}

// ═════════════════════════════════════════════════════════════════════
// 1NT OPENER REBIDS
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} partnerBid
 * @returns {BidRecommendation}
 */
function score1NTRebid(bid, eval_, partnerBid) {
  const { level, strain } = partnerBid;
  if (level === 2 && strain === Strain.CLUBS) return scoreAfterStayman(bid, eval_);
  if (level === 2 && strain === Strain.DIAMONDS) return scoreAfterTransfer(bid, eval_, Strain.HEARTS);
  if (level === 2 && strain === Strain.HEARTS) return scoreAfterTransfer(bid, eval_, Strain.SPADES);
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
 * @returns {BidRecommendation}
 */
function score1SuitRebid(bid, eval_, myBid, partnerBid) {
  const ms = myBid.strain;
  const ps = partnerBid.strain;
  const pl = partnerBid.level;

  if (ps === ms && pl === 2) return scoreAfterSingleRaise(bid, eval_, myBid);
  if (ps === ms && pl === 3) return scoreAfterLimitRaise(bid, eval_, myBid);
  if (ps === Strain.NOTRUMP && pl === 1) return scoreAfter1NTResp(bid, eval_, myBid);
  if (ps === Strain.NOTRUMP && pl === 2) return scoreAfter2NTResp(bid, eval_, myBid);
  return scoreAfterNewSuit(bid, eval_, myBid, partnerBid);
}

// ── After new suit response (forcing one round) ─────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @param {ContractBid} partnerBid
 * @returns {BidRecommendation}
 */
function scoreAfterNewSuit(bid, eval_, myBid, partnerBid) {
  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, 'New suit is forcing', FORCING_PASS_COST);
    return scored(bid, deduct(penTotal(p)), 'New suit is forcing: must bid', p);
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
  const { hcp, shape } = eval_;
  const { level, strain } = /** @type {ContractBid} */ (bid);
  const len = suitLen(shape, strain);
  const name = STRAIN_DISPLAY[strain];
  const sym = STRAIN_SYMBOLS[strain];
  const pSup = suitLen(shape, ps);
  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, `${len} ${name}, need ${REBID_SUIT_MIN}+`,
    Math.max(0, REBID_SUIT_MIN - len) * LENGTH_SHORT_COST);
  if (level <= 2) {
    pen(p, `${hcp} HCP, need ${MIN_MIN}-${MIN_MAX}`, hcpDev(hcp, MIN_MIN, MIN_MAX) * HCP_COST);
  } else if (level === 3) {
    pen(p, `${hcp} HCP, need ${INV_MIN}-${INV_MAX}`, hcpDev(hcp, INV_MIN, INV_MAX) * HCP_COST);
  } else {
    pen(p, `${hcp} HCP, need ${GF_MIN}+`, Math.max(0, GF_MIN - hcp) * HCP_COST);
  }
  if (pSup >= FIT_MIN && isMajor(ps)) {
    pen(p, `${pSup} ${STRAIN_DISPLAY[ps]}: prefer raise`, FIT_PREF_COST);
  }
  const tag = level <= 2 ? 'minimum' : level === 3 ? 'invitational' : 'game';
  const expl = len < REBID_SUIT_MIN
    ? `${len} ${name}: need ${REBID_SUIT_MIN}+ to rebid`
    : `${hcp} HCP, ${len} ${name}: ${level}${sym} (${tag})`;
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
  const { hcp } = eval_;
  const ms = myBid.strain;
  const sym = STRAIN_SYMBOLS[ms];
  const isMaj = isMajor(ms);

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP above pass threshold`,
      Math.max(0, hcp - RAISE_PASS_MAX) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      hcp <= RAISE_PASS_MAX ? `${hcp} HCP: minimum, pass` : `${hcp} HCP: too strong to pass`, p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (level === 3 && strain === ms) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${RAISE_INV_MIN}-${RAISE_INV_MAX}`,
      hcpDev(hcp, RAISE_INV_MIN, RAISE_INV_MAX) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      hcpDev(hcp, RAISE_INV_MIN, RAISE_INV_MAX) === 0
        ? `${hcp} HCP: invite with 3${sym}`
        : `${hcp} HCP: outside invite range (${RAISE_INV_MIN}-${RAISE_INV_MAX})`, p);
  }

  if (level === 4 && strain === ms && isMaj) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${RAISE_GAME_MIN}+`,
      Math.max(0, RAISE_GAME_MIN - hcp) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      hcp >= RAISE_GAME_MIN
        ? `${hcp} HCP: bid game 4${sym}`
        : `${hcp} HCP: need ${RAISE_GAME_MIN}+ for game`, p);
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
  const { hcp, shape, shapeClass } = eval_;
  const ms = myBid.strain;
  const myLen = suitLen(shape, ms);
  const sym = STRAIN_SYMBOLS[ms];
  const name = STRAIN_DISPLAY[ms];

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    if (myLen >= REBID_SUIT_MIN) pen(p, `${myLen}-card suit`, LONG_SUIT_PREF_COST);
    if (hcp >= INV_MIN) pen(p, `${hcp} HCP: too strong to pass`, (hcp - MIN_MAX) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      (hcp <= MIN_MAX && myLen < REBID_SUIT_MIN)
        ? `${hcp} HCP, balanced minimum: pass`
        : `${hcp} HCP: consider bidding`, p);
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

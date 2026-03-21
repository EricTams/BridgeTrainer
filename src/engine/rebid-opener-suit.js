import {
  Strain, STRAIN_SYMBOLS,
  pen, penTotal,
  HCP_COST, LENGTH_SHORT_COST, FORCING_PASS_COST,
  SHAPE_SEMI_COST, SHAPE_UNBAL_COST, FIT_PREF_COST, LONG_SUIT_PREF_COST,
  MAJOR_FIT_GAME_COST, GAME_REACHED_COST,
  REBID_1NT_MIN, REBID_1NT_MAX,
  MIN_MIN, MIN_MAX, INV_MIN, INV_MAX, GF_MIN,
  REBID_2NT_MIN, REBID_2NT_MAX, REVERSE_MIN,
  FIT_MIN, REBID_SUIT_MIN, NEW_SUIT_MIN,
  RAISE_PASS_MAX, RAISE_INV_MIN, RAISE_INV_MAX, RAISE_GAME_MIN,
  LIMIT_ACCEPT_MIN,
  SHAPE_STRAINS, STRAIN_DISPLAY,
  suitLen, isMajor, ranksAbove, hcpDev, shapePenalty, deduct, scored,
  isGameLevel, scoreGenericRebid, minBidLevel,
} from './rebid-shared.js';
import { Rank } from '../model/card.js';

/**
 * @typedef {import('../model/hand.js').Hand} Hand
 * @typedef {import('./evaluate.js').Evaluation} Evaluation
 * @typedef {import('../model/bid.js').ContractBid} ContractBid
 * @typedef {import('../model/bid.js').Bid} Bid
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('./opening.js').BidRecommendation} BidRecommendation
 * @typedef {import('./penalty.js').PenaltyItem} PenaltyItem
 */

// ═════════════════════════════════════════════════════════════════════
// 1-SUIT OPENER REBIDS
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @param {ContractBid} partnerBid
 * @param {boolean} opener
 * @param {number} strengthFloor
 * @returns {BidRecommendation}
 */
export function score1SuitRebid(bid, eval_, myBid, partnerBid, opener, strengthFloor) {
  const ms = myBid.strain;
  const ps = partnerBid.strain;
  const pl = partnerBid.level;

  if (ps === ms && pl === 2) return scoreAfterSingleRaise(bid, eval_, myBid, strengthFloor);
  if (ps === ms && pl === 3) return scoreAfterLimitRaise(bid, eval_, myBid, strengthFloor);
  if (ps === Strain.NOTRUMP && pl === 1) return scoreAfter1NTResp(bid, eval_, myBid);
  if (ps === Strain.NOTRUMP && pl === 2) return scoreAfter2NTResp(bid, eval_, myBid);
  return scoreAfterNewSuit(bid, eval_, myBid, partnerBid, opener, strengthFloor);
}

// ── After new suit response (forcing one round) ─────────────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @param {ContractBid} partnerBid
 * @param {boolean} opener - only the opener is forced to rebid after responder's new suit
 * @param {number} strengthFloor
 * @returns {BidRecommendation}
 */
function scoreAfterNewSuit(bid, eval_, myBid, partnerBid, opener, strengthFloor) {
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
  if (strain === ps) return scoreNS_raisePartner(bid, eval_, ps, strengthFloor);
  if (strain === Strain.NOTRUMP) return scoreNS_nt(bid, eval_, partnerBid.level);
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
function scoreNS_raisePartner(bid, eval_, ps, strengthFloor) {
  const { hcp, shape } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  const sup = suitLen(shape, ps);
  const name = STRAIN_DISPLAY[ps];
  const sym = STRAIN_SYMBOLS[ps];

  const shownExtras = Math.min(4, Math.max(0, (strengthFloor || 0) - MIN_MIN));
  const effInvMin = INV_MIN - shownExtras;
  const effInvMax = Math.max(effInvMin, INV_MAX - shownExtras);
  const effGFMin = GF_MIN - shownExtras;

  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, `${sup} ${name}, need ${FIT_MIN}+`, Math.max(0, FIT_MIN - sup) * LENGTH_SHORT_COST);
  if (level <= 2) {
    pen(p, `${hcp} HCP, need ${MIN_MIN}-${MIN_MAX}`, hcpDev(hcp, MIN_MIN, MIN_MAX) * HCP_COST);
  } else if (level === 3) {
    pen(p, `${hcp} HCP, need ${effInvMin}-${effInvMax}`, hcpDev(hcp, effInvMin, effInvMax) * HCP_COST);
  } else {
    pen(p, `${hcp} HCP, need ${effGFMin}+`, Math.max(0, effGFMin - hcp) * HCP_COST);
  }
  const tag = level <= 2 ? 'minimum raise' : level === 3 ? 'invitational raise' : 'game raise';
  const expl = sup < FIT_MIN
    ? `${sup} ${name}: need ${FIT_MIN}+ to raise`
    : `${hcp} HCP, ${sup} ${name}: ${level}${sym} (${tag})`;
  return scored(bid, deduct(penTotal(p)), expl, p);
}

/**
 * NT rebid at 2+ level after partner's new suit.
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {number} partnerLevel - level of partner's new-suit response
 */
function scoreNS_nt(bid, eval_, partnerLevel) {
  const { hcp, shapeClass } = eval_;
  const { level } = /** @type {ContractBid} */ (bid);
  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, `${shapeClass} (need balanced)`, shapePenalty(shapeClass));

  const isJump2NT = level === 2 && partnerLevel <= 1;
  if (level === 2) {
    const minHcp = isJump2NT ? REBID_2NT_MIN : REBID_1NT_MIN;
    const maxHcp = isJump2NT ? REBID_2NT_MAX : REBID_1NT_MAX;
    pen(p, `${hcp} HCP, need ${minHcp}-${maxHcp}`,
      hcpDev(hcp, minHcp, maxHcp) * HCP_COST);
  } else {
    pen(p, `${hcp} HCP, need ${GF_MIN}+`, Math.max(0, GF_MIN - hcp) * HCP_COST);
  }

  let range;
  if (isJump2NT) range = `${REBID_2NT_MIN}-${REBID_2NT_MAX}`;
  else if (level === 2) range = `${REBID_1NT_MIN}-${REBID_1NT_MAX}`;
  else range = `${GF_MIN}+`;

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
 * @param {number} strengthFloor
 * @returns {BidRecommendation}
 */
const HSGT_MIN_LEN = 3;
const HSGT_LONG_TRUMP_COST = 2;

function scoreAfterSingleRaise(bid, eval_, myBid, strengthFloor) {
  const { hcp, shape } = eval_;
  const ms = myBid.strain;
  const sym = STRAIN_SYMBOLS[ms];
  const isMaj = isMajor(ms);

  const shownExtras = Math.min(4, Math.max(0, (strengthFloor || 0) - MIN_MIN));
  const effPassMax = RAISE_PASS_MAX - shownExtras;
  const effInvMin = RAISE_INV_MIN - shownExtras;
  const effInvMax = Math.max(effInvMin, RAISE_INV_MAX - shownExtras);
  const effGameMin = RAISE_GAME_MIN - shownExtras;

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP above pass threshold`,
      Math.max(0, hcp - effPassMax) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      hcp <= effPassMax ? `${hcp} HCP: minimum, pass` : `${hcp} HCP: too strong to pass`, p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (level === 3 && strain === ms) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${effInvMin}-${effInvMax}`,
      hcpDev(hcp, effInvMin, effInvMax) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      hcpDev(hcp, effInvMin, effInvMax) === 0
        ? `${hcp} HCP: invite with 3${sym}`
        : `${hcp} HCP: outside invite range (${effInvMin}-${effInvMax})`, p);
  }

  if (level === 4 && strain === ms && isMaj) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${effGameMin}+`,
      Math.max(0, effGameMin - hcp) * HCP_COST);
    return scored(bid, deduct(penTotal(p)),
      hcp >= effGameMin
        ? `${hcp} HCP: bid game 4${sym}`
        : `${hcp} HCP: need ${effGameMin}+ for game`, p);
  }

  if (level === 3 && strain === Strain.NOTRUMP) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${effGameMin}+`,
      Math.max(0, effGameMin - hcp) * HCP_COST);
    pen(p, `${eval_.shapeClass} (prefer balanced)`, shapePenalty(eval_.shapeClass));
    if (isMaj) pen(p, 'Have major fit: prefer 4 of major', MAJOR_FIT_GAME_COST);
    return scored(bid, deduct(penTotal(p)), `${hcp} HCP: 3NT as game alternative`, p);
  }

  if (level === 2 && strain === Strain.NOTRUMP) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${REBID_2NT_MIN}-${REBID_2NT_MAX}`,
      hcpDev(hcp, REBID_2NT_MIN, REBID_2NT_MAX) * HCP_COST);
    pen(p, `${eval_.shapeClass} (need balanced)`, shapePenalty(eval_.shapeClass));
    if (isMaj) pen(p, 'Major fit agreed: prefer raising', MAJOR_FIT_GAME_COST);
    return scored(bid, deduct(penTotal(p)),
      isMaj ? 'Major fit: prefer raising over 2NT' : `${hcp} HCP: 2NT rebid`, p);
  }

  if (isMaj && strain !== ms && strain !== Strain.NOTRUMP && level <= 3) {
    const helpLen = suitLen(shape, strain);
    const helpName = STRAIN_DISPLAY[strain];
    const helpSym = STRAIN_SYMBOLS[strain];
    const myLen = suitLen(shape, ms);
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${effInvMin}-${effInvMax}`,
      hcpDev(hcp, effInvMin, effInvMax) * HCP_COST);
    if (helpLen < HSGT_MIN_LEN) {
      pen(p, `${helpLen} ${helpName}: need ${HSGT_MIN_LEN}+ for game try`,
        (HSGT_MIN_LEN - helpLen) * LENGTH_SHORT_COST);
    }
    if (myLen >= REBID_SUIT_MIN) {
      pen(p, `${myLen} trumps: consider direct 3${sym} invite`, HSGT_LONG_TRUMP_COST);
    }
    let expl;
    if (hcpDev(hcp, effInvMin, effInvMax) > 0) {
      expl = `${hcp} HCP: outside invite range (${effInvMin}-${effInvMax}) for game try`;
    } else if (helpLen < HSGT_MIN_LEN) {
      expl = `${helpLen} ${helpName}: need ${HSGT_MIN_LEN}+ for help-suit game try`;
    } else {
      expl = `${hcp} HCP, ${helpLen} ${helpName}: help-suit game try ${level}${helpSym} — asking partner for help in ${helpName}`;
    }
    return scored(bid, deduct(penTotal(p)), expl, p);
  }

  return scoreGenericRebid(bid, eval_);
}

// ── After limit raise (partner raised to 3, shows 10-12) ────────────

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @param {number} strengthFloor
 * @returns {BidRecommendation}
 */
function scoreAfterLimitRaise(bid, eval_, myBid, strengthFloor) {
  const { hcp } = eval_;
  const ms = myBid.strain;
  const sym = STRAIN_SYMBOLS[ms];
  const isMaj = isMajor(ms);

  const shownExtras = Math.min(4, Math.max(0, (strengthFloor || 0) - MIN_MIN));
  const effAcceptMin = LIMIT_ACCEPT_MIN - shownExtras;

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    if (hcp >= effAcceptMin) {
      pen(p, `${hcp} HCP: should accept (${effAcceptMin}+)`,
        (hcp - effAcceptMin + 1) * HCP_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      hcp < effAcceptMin
        ? `${hcp} HCP: decline invitation`
        : `${hcp} HCP: should accept game`, p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (level === 4 && strain === ms && isMaj) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (hcp < effAcceptMin) {
      pen(p, `${hcp} HCP, need ${effAcceptMin}+`,
        (effAcceptMin - hcp) * HCP_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      hcp >= effAcceptMin
        ? `${hcp} HCP: accept, bid 4${sym}`
        : `${hcp} HCP: too weak to accept`, p);
  }

  if (level === 3 && strain === Strain.NOTRUMP && !isMaj) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (hcp < effAcceptMin) {
      pen(p, `${hcp} HCP, need ${effAcceptMin}+`,
        (effAcceptMin - hcp) * HCP_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      hcp >= effAcceptMin ? `${hcp} HCP: 3NT game` : `${hcp} HCP: too weak for game`, p);
  }

  if (level === 5 && strain === ms && !isMaj) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (hcp < effAcceptMin) {
      pen(p, `${hcp} HCP, need ${effAcceptMin}+`,
        (effAcceptMin - hcp) * HCP_COST);
    }
    return scored(bid, deduct(penTotal(p)), `${hcp} HCP: 5${sym} game`, p);
  }

  return scoreGenericRebid(bid, eval_);
}

// ── After 1NT response ────────────────────────────────────────────────
// Over a major: semi-forcing (opener must bid with unbalanced hand).
// Over a minor: non-forcing (opener may pass freely).

const SEMI_FORCING_UNBAL_COST = 8;
const SEMI_FORCING_SEMI_BAL_COST = 3;
const NON_FORCING_UNBAL_COST = 2;

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @returns {BidRecommendation}
 */
function scoreAfter1NTResp(bid, eval_, myBid) {
  const { hcp, totalPoints, ntPoints, shape, shapeClass } = eval_;
  const tp = totalPoints;
  const ntp = ntPoints;
  const ms = myBid.strain;
  const myLen = suitLen(shape, ms);
  const sym = STRAIN_SYMBOLS[ms];
  const name = STRAIN_DISPLAY[ms];
  const isMaj = isMajor(ms);

  const JUMP_3M_INV_MIN = 16;
  const JUMP_3M_INV_MAX = 18;

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    if (myLen >= REBID_SUIT_MIN) pen(p, `${myLen}-card suit`, LONG_SUIT_PREF_COST);
    if (ntp >= INV_MIN) pen(p, `${hcp} HCP (${ntp} NT pts): too strong to pass`, (ntp - MIN_MAX) * HCP_COST);
    if (isMaj) {
      if (shapeClass === 'unbalanced') {
        pen(p, '1NT semi-forcing: must bid with unbalanced hand', SEMI_FORCING_UNBAL_COST);
      } else if (shapeClass === 'semi-balanced') {
        pen(p, '1NT semi-forcing: consider rebidding with semi-balanced hand', SEMI_FORCING_SEMI_BAL_COST);
      }
    } else {
      if (shapeClass === 'unbalanced') {
        pen(p, 'Unbalanced: consider rebidding', NON_FORCING_UNBAL_COST);
      }
    }
    let expl;
    if (ntp >= INV_MIN) {
      expl = `${hcp} HCP (${ntp} NT pts): too strong to pass`;
    } else if (isMaj && shapeClass === 'unbalanced') {
      expl = `Unbalanced: 1NT over ${sym} is semi-forcing — must bid`;
    } else if (isMaj && shapeClass === 'semi-balanced') {
      expl = `Semi-balanced: 1NT over ${sym} is semi-forcing — consider rebidding`;
    } else if (isMaj && shapeClass === 'balanced' && ntp <= MIN_MAX && myLen < REBID_SUIT_MIN) {
      expl = `${hcp} HCP, balanced minimum: pass (semi-forcing allows pass with balanced min)`;
    } else if (!isMaj && ntp <= MIN_MAX && myLen < REBID_SUIT_MIN) {
      expl = `${hcp} HCP, balanced minimum: pass (1NT over minor is non-forcing)`;
    } else if (!isMaj && shapeClass !== 'balanced') {
      expl = `${shapeClass}: consider rebidding (1NT over minor is non-forcing)`;
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
    if (myLen >= REBID_SUIT_MIN && hcp >= JUMP_3M_INV_MIN) {
      pen(p, `${hcp} HCP: strong enough for invitational 3${sym}`, LONG_SUIT_PREF_COST);
    }
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

  if (level === 3 && strain === ms) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${myLen} ${name}, need ${REBID_SUIT_MIN}+`,
      Math.max(0, REBID_SUIT_MIN - myLen) * LENGTH_SHORT_COST);
    pen(p, `${hcp} HCP, need ${JUMP_3M_INV_MIN}-${JUMP_3M_INV_MAX}`,
      hcpDev(hcp, JUMP_3M_INV_MIN, JUMP_3M_INV_MAX) * HCP_COST);
    let expl;
    if (myLen < REBID_SUIT_MIN) {
      expl = `${myLen} ${name}: need ${REBID_SUIT_MIN}+ for jump rebid`;
    } else if (hcpDev(hcp, JUMP_3M_INV_MIN, JUMP_3M_INV_MAX) > 0) {
      expl = `${hcp} HCP: outside invitational range (${JUMP_3M_INV_MIN}-${JUMP_3M_INV_MAX})`;
    } else {
      expl = `${hcp} HCP, ${myLen} ${name}: invitational jump to 3${sym}`;
    }
    return scored(bid, deduct(penTotal(p)), expl, p);
  }

  return scoreGenericRebid(bid, eval_);
}

// ── After 2NT response (Jacoby 2NT over major / natural GF over minor) ──

const JACOBY_EXTRAS_MIN = 15;
const JACOBY_SHORTNESS_MISS_COST = 3;
const JACOBY_JUMP_TO_GAME_COST = 1.5;

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @returns {BidRecommendation}
 */
function scoreAfter2NTResp(bid, eval_, myBid) {
  if (isMajor(myBid.strain)) return scoreAfterJacoby2NTResp(bid, eval_, myBid);
  return scoreAfterNatural2NTResp(bid, eval_, myBid);
}

/**
 * Opener's rebid after Jacoby 2NT (1M–2NT). GF established, fit agreed.
 * Rebid chart: new suit = shortness, 3M = minimum, 3NT = extras, 4M = signoff.
 */
function scoreAfterJacoby2NTResp(bid, eval_, myBid) {
  const { hcp, shape } = eval_;
  const ms = myBid.strain;
  const sym = STRAIN_SYMBOLS[ms];

  let shortSuit = null;
  for (const s of SHAPE_STRAINS) {
    if (s === ms) continue;
    if (suitLen(shape, s) <= 1) { shortSuit = s; break; }
  }
  const hasShortness = shortSuit !== null;

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, 'Jacoby 2NT is game-forcing', FORCING_PASS_COST);
    return scored(bid, deduct(penTotal(p)), 'Jacoby 2NT is game-forcing: must bid', p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  if (level === 3 && strain !== ms && strain !== Strain.NOTRUMP) {
    const shortLen = suitLen(shape, strain);
    const sName = STRAIN_DISPLAY[strain];
    /** @type {PenaltyItem[]} */ const p = [];
    if (shortLen > 1) {
      pen(p, `${shortLen} ${sName}: need singleton or void`,
        (shortLen - 1) * LENGTH_SHORT_COST);
    }
    const expl = shortLen <= 1
      ? `${shortLen === 0 ? 'Void' : 'Singleton'} in ${sName}: showing shortness after Jacoby 2NT`
      : `${shortLen} ${sName}: need singleton/void for shortness-showing bid`;
    return scored(bid, deduct(penTotal(p)), expl, p);
  }

  if (level === 3 && strain === ms) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (hcp >= JACOBY_EXTRAS_MIN) {
      pen(p, `${hcp} HCP: extras, consider 3NT`,
        (hcp - JACOBY_EXTRAS_MIN + 1) * HCP_COST);
    }
    if (hasShortness) {
      pen(p, `Have shortness in ${STRAIN_DISPLAY[shortSuit]}: show it first`,
        JACOBY_SHORTNESS_MISS_COST);
    }
    let expl;
    if (hasShortness) expl = `Have shortness in ${STRAIN_DISPLAY[shortSuit]}: show it before 3${sym}`;
    else if (hcp >= JACOBY_EXTRAS_MIN) expl = `${hcp} HCP: extras — consider 3NT instead of 3${sym}`;
    else expl = `${hcp} HCP, minimum, no shortness: 3${sym}`;
    return scored(bid, deduct(penTotal(p)), expl, p);
  }

  if (level === 3 && strain === Strain.NOTRUMP) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${hcp} HCP, need ${JACOBY_EXTRAS_MIN}+`,
      Math.max(0, JACOBY_EXTRAS_MIN - hcp) * HCP_COST);
    if (hasShortness) {
      pen(p, `Have shortness in ${STRAIN_DISPLAY[shortSuit]}: show it instead`,
        JACOBY_SHORTNESS_MISS_COST);
    }
    let expl;
    if (hasShortness) expl = `Have shortness in ${STRAIN_DISPLAY[shortSuit]}: show it with a new-suit bid`;
    else if (hcp < JACOBY_EXTRAS_MIN) expl = `${hcp} HCP: need ${JACOBY_EXTRAS_MIN}+ for 3NT extras`;
    else expl = `${hcp} HCP, extras, no shortness: 3NT after Jacoby 2NT`;
    return scored(bid, deduct(penTotal(p)), expl, p);
  }

  if (level === 4 && strain === ms) {
    /** @type {PenaltyItem[]} */ const p = [];
    if (hcp >= JACOBY_EXTRAS_MIN) {
      pen(p, `${hcp} HCP: extras, explore slam via 3NT`,
        (hcp - JACOBY_EXTRAS_MIN + 1) * HCP_COST);
    }
    if (hasShortness) {
      pen(p, `Have shortness: show it at 3-level first`,
        JACOBY_SHORTNESS_MISS_COST - 1);
    }
    pen(p, 'Jumps past 3-level bidding space', JACOBY_JUMP_TO_GAME_COST);
    let expl;
    if (hcp >= JACOBY_EXTRAS_MIN) expl = `${hcp} HCP: too strong for sign-off — explore slam`;
    else if (hasShortness) expl = 'Have shortness: show it at 3-level first';
    else expl = `${hcp} HCP, minimum: sign off in 4${sym}`;
    return scored(bid, deduct(penTotal(p)), expl, p);
  }

  return scoreGenericRebid(bid, eval_);
}

/**
 * Opener's rebid after natural 2NT response to a minor (invitational 11-12).
 * Pre-existing behavior preserved; minor 2NT forcing status is a known issue.
 */
function scoreAfterNatural2NTResp(bid, eval_, myBid) {
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
export function scoreWeakTwoRebid(bid, hand, eval_, myBid, partnerBid) {
  const ms = myBid.strain;
  const ps = partnerBid.strain;
  const pl = partnerBid.level;

  if (ps === Strain.NOTRUMP && pl === 2) return scoreAfterWT2NT(bid, hand, eval_, myBid);
  if (ps === ms && pl === 3) return scoreAfterWTRaise(bid);
  if (ps === ms && pl >= 4) return scoreAfterGame(bid, pl);
  if (ps === Strain.NOTRUMP && pl === 3) return scoreAfterGame(bid, 3);
  if (ps !== ms && ps !== Strain.NOTRUMP) return scoreAfterWTNewSuit(bid, eval_, myBid, partnerBid);
  return scoreGenericRebid(bid, eval_);
}

/** Helper used for game-reached situations — penalty scales with levels above game */
function scoreAfterGame(bid, reachedLevel) {
  if (bid.type === 'pass') {
    return scored(bid, deduct(0), 'Game reached: pass');
  }
  const levelsAbove = bid.type === 'contract' ? Math.max(1, bid.level - reachedLevel) : 1;
  /** @type {PenaltyItem[]} */ const p = [];
  pen(p, `${levelsAbove} level(s) above game`, levelsAbove * GAME_REACHED_COST);
  return scored(bid, deduct(penTotal(p)), 'Game reached: pass is standard', p);
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
    const cheapest = minBidLevel(ms, partnerBid);
    const levelsAbove = level - cheapest;
    if (levelsAbove > 0) {
      pen(p, `Level ${level}: ${levelsAbove} above cheapest rebid`, levelsAbove * HCP_COST);
    }
    const sup = suitLen(shape, ps);
    if (sup >= 3) {
      pen(p, `${sup} ${STRAIN_DISPLAY[ps]}: prefer raising partner`, FIT_PREF_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      `Rebid ${STRAIN_SYMBOLS[ms]}: no support for partner's suit`, p);
  }

  if (strain === ps) {
    const sup = suitLen(shape, ps);
    const cheapest = minBidLevel(ps, partnerBid);
    const levelsAbove = level - cheapest;
    /** @type {PenaltyItem[]} */ const p = [];
    if (sup < 3) {
      pen(p, `Only ${sup} ${STRAIN_DISPLAY[ps]}: need 3+ to raise`,
        (3 - sup) * LENGTH_SHORT_COST);
    }
    if (levelsAbove > 0) {
      pen(p, `Level ${level}: ${levelsAbove} above cheapest raise`, levelsAbove * HCP_COST);
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
// PREEMPT REBIDS (3-level+ openers)
// ═════════════════════════════════════════════════════════════════════

/**
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} myBid
 * @param {ContractBid} partnerBid
 * @returns {BidRecommendation}
 */
export function scorePreemptRebid(bid, eval_, myBid, partnerBid) {
  const ms = myBid.strain;
  const ps = partnerBid.strain;
  const pl = partnerBid.level;

  if (ps === ms) return scoreAfterWTRaise(bid);
  if (ps === Strain.NOTRUMP && pl >= 3) return scoreAfterGame(bid, pl);
  if (isGameLevel(partnerBid)) return scoreAfterGame(bid, partnerBid.level);

  if (ps !== ms && ps !== Strain.NOTRUMP) {
    const { shape } = eval_;
    if (bid.type === 'pass') {
      /** @type {PenaltyItem[]} */ const p = [];
      pen(p, 'New suit over preempt is forcing', FORCING_PASS_COST);
      return scored(bid, deduct(penTotal(p)), 'New suit over preempt is forcing: must bid', p);
    }
    if (bid.type !== 'contract') return scored(bid, 0, '');

    const { level, strain } = bid;

    if (strain === ms) {
      /** @type {PenaltyItem[]} */ const p = [];
      const cheapest = minBidLevel(ms, partnerBid);
      const levelsAbove = level - cheapest;
      if (levelsAbove > 0) {
        pen(p, `Level ${level}: ${levelsAbove} above cheapest rebid`, levelsAbove * HCP_COST);
      }
      const sup = suitLen(shape, ps);
      if (sup >= 3) pen(p, `${sup} ${STRAIN_DISPLAY[ps]}: prefer raising partner`, FIT_PREF_COST);
      return scored(bid, deduct(penTotal(p)),
        `Rebid ${STRAIN_SYMBOLS[ms]}: no support for partner's suit`, p);
    }

    if (strain === ps) {
      const sup = suitLen(shape, ps);
      const cheapest = minBidLevel(ps, partnerBid);
      const levelsAbove = level - cheapest;
      /** @type {PenaltyItem[]} */ const p = [];
      if (sup < 3) pen(p, `Only ${sup} ${STRAIN_DISPLAY[ps]}: need 3+ to raise`,
        (3 - sup) * LENGTH_SHORT_COST);
      if (levelsAbove > 0) {
        pen(p, `Level ${level}: ${levelsAbove} above cheapest raise`, levelsAbove * HCP_COST);
      }
      return scored(bid, deduct(penTotal(p)),
        sup >= 3
          ? `${sup} ${STRAIN_DISPLAY[ps]}: raise partner's suit`
          : `Only ${sup} ${STRAIN_DISPLAY[ps]}: need 3+ to raise`, p);
    }

    if (strain === Strain.NOTRUMP && level === 3) {
      /** @type {PenaltyItem[]} */ const p = [];
      return scored(bid, deduct(penTotal(p)), '3NT: game', p);
    }

    return scoreGenericRebid(bid, eval_);
  }

  return scoreGenericRebid(bid, eval_);
}

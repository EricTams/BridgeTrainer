import {
  Strain, STRAIN_SYMBOLS,
  pen, penTotal,
  HCP_COST, LENGTH_SHORT_COST, FORCING_PASS_COST,
  FIT_PREF_COST, MAJOR_FIT_GAME_COST, GAME_REACHED_COST,
  SHAPE_STRAINS, STRAIN_DISPLAY,
  suitLen, isMajor, ranksAbove, hcpDev, shapePenalty, deduct, scored,
  isGameLevel, scoreGenericRebid, rebidCandidates, minBidLevel,
} from './rebid-shared.js';
import { firstBidMeaning, jacoby2NTOpenerRebidMeaning } from './bid-meaning.js';

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
  const meaning = firstBidMeaning(myBid, {
    isOpener: false,
    partnerFirstBid: openerOpen,
  });
  return meaning.minHcp;
}

/**
 * Whether the partnership is game-forced by responder's first bid.
 * @param {ContractBid} myBid
 * @param {ContractBid} openerOpen
 * @returns {boolean}
 */
function isRespGF(myBid, openerOpen) {
  const meaning = firstBidMeaning(myBid, {
    isOpener: false,
    partnerFirstBid: openerOpen,
  });
  return meaning.forcing === 'game';
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

  // Jacoby 2NT continuation: I bid 2NT over partner's 1M, partner rebid
  // with 3M (minimum), 3NT (extras), or shortness bid
  if (ms === Strain.NOTRUMP && myBid.level === 2 &&
      openerOpen.level === 1 && isMajor(os) &&
      (rs === os ||
       (rs === Strain.NOTRUMP && openerRebid.level === 3) ||
       (openerRebid.level === 3 && rs !== os && rs !== Strain.NOTRUMP))) {
    return scoreRR_afterJacoby2NT(bid, eval_, openerOpen, openerRebid);
  }

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

  if (rl >= gameLevel) return scoreAfterGame(bid, rl);

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

// ── After Jacoby 2NT (1M - 2NT - 3M/3NT/4M) ────────────────────────

const JACOBY_SLAM_TRY_MIN = 16;

/**
 * Responder's continuation after Jacoby 2NT.
 * Hearts are the agreed trump suit. Opener has shown their hand type
 * via the rebid (3M = min, 3NT = extras, shortness bid, 4M = min sign-off).
 *
 * Responder actions:
 *   13-15 HCP: bid 4M game (minimum GF)
 *   16+ HCP: slam exploration (cue bids, Blackwood handled by conventions.js)
 *   4M game when opener showed minimum: only penalized if responder is very strong
 *
 * @param {Bid} bid
 * @param {Evaluation} eval_
 * @param {ContractBid} openerOpen
 * @param {ContractBid} openerRebid
 * @returns {BidRecommendation}
 */
function scoreRR_afterJacoby2NT(bid, eval_, openerOpen, openerRebid) {
  const { hcp, shape } = eval_;
  const os = openerOpen.strain;
  const oSym = STRAIN_SYMBOLS[os];
  const oSup = suitLen(shape, os);
  const openerMeaning = jacoby2NTOpenerRebidMeaning(os, openerRebid);
  const combinedMin = hcp + openerMeaning.minHcp;
  const combinedMax = hcp + openerMeaning.maxHcp;
  const SLAM_COMBINED = 33;

  if (isGameLevel(openerRebid)) return scoreAfterGame(bid, openerRebid.level);

  if (bid.type === 'pass') {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, 'Jacoby 2NT is game-forcing: must bid to game', RR_GF_PASS_COST);
    return scored(bid, deduct(penTotal(p)), 'Game-forcing auction: must bid', p);
  }
  if (bid.type !== 'contract') return scored(bid, 0, '');

  const { level, strain } = bid;

  // 4M game — correct with minimum GF values, underbid with slam potential
  if (strain === os && level === 4) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${oSup} ${STRAIN_DISPLAY[os]}, need 4+`,
      Math.max(0, 4 - oSup) * LENGTH_SHORT_COST);
    if (combinedMin >= SLAM_COMBINED) {
      pen(p, `Combined ${combinedMin}-${combinedMax}: slam values, explore before settling`,
        Math.min(5, (combinedMin - SLAM_COMBINED + 1) * 1.5));
    }
    return scored(bid, deduct(penTotal(p)),
      combinedMin >= SLAM_COMBINED
        ? `${hcp} HCP: 4${oSym} may be too conservative (combined ${combinedMin}+)`
        : `${hcp} HCP, ${oSup} ${STRAIN_DISPLAY[os]}: 4${oSym} game`, p);
  }

  // 3NT — rarely correct after Jacoby; may be quantitative
  if (strain === Strain.NOTRUMP && level === 3) {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, 'Have major fit: 3NT unusual after Jacoby 2NT', MAJOR_FIT_GAME_COST + 2);
    return scored(bid, deduct(penTotal(p)), `${hcp} HCP: 3NT (prefer major game)`, p);
  }

  // New suit at 4-level: cue bid showing control for slam exploration
  if (strain !== os && strain !== Strain.NOTRUMP && level >= 4 && level <= 5) {
    const sSym = STRAIN_SYMBOLS[strain];
    /** @type {PenaltyItem[]} */ const p = [];

    if (hcp < JACOBY_SLAM_TRY_MIN) {
      pen(p, `${hcp} HCP: need ${JACOBY_SLAM_TRY_MIN}+ for slam try`,
        (JACOBY_SLAM_TRY_MIN - hcp) * HCP_COST);
    }
    if (combinedMin < SLAM_COMBINED - 4) {
      pen(p, `Combined ${combinedMin}-${combinedMax}: below slam exploration range`,
        (SLAM_COMBINED - 4 - combinedMin) * 1.5);
    }
    if (level >= 5) {
      pen(p, `${level}-level cue: high, carries risk`, (level - 4) * 3);
    }

    return scored(bid, deduct(penTotal(p)),
      hcp >= JACOBY_SLAM_TRY_MIN
        ? `${hcp} HCP: ${level}${sSym} cue bid (${STRAIN_DISPLAY[os]} fit, slam try)`
        : `${hcp} HCP: need ${JACOBY_SLAM_TRY_MIN}+ for slam exploration`, p);
  }

  // Any other bid (3-level new suit, high NT, etc.) — non-standard in Jacoby context
  {
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, 'Non-standard after Jacoby 2NT: prefer 4M game or slam exploration', 5);
    const sym = strain === Strain.NOTRUMP ? 'NT' : STRAIN_SYMBOLS[strain];
    return scored(bid, deduct(penTotal(p)),
      `${level}${sym}: non-standard after Jacoby 2NT`, p);
  }
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
  if (isGameLevel(openerRebid)) return scoreAfterGame(bid, openerRebid.level);

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
  if (isGameLevel(openerRebid)) return scoreAfterGame(bid, openerRebid.level);

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
  if (isGameLevel(openerRebid)) return scoreAfterGame(bid, openerRebid.level);

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
    const rSym = STRAIN_SYMBOLS[rs];
    const gameLevel = isMajor(rs) ? 4 : 5;
    const hcpMin = level >= gameLevel ? RR_GF_MIN : RR_INV_MIN;
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${rSup} ${STRAIN_DISPLAY[rs]}, need ${RR_FIT}+`,
      Math.max(0, RR_FIT - rSup) * LENGTH_SHORT_COST);
    if (hcp < hcpMin) pen(p, `${hcp} HCP: need ${hcpMin}+ to raise to ${level}`, (hcpMin - hcp) * HCP_COST);
    if (level > gameLevel) {
      pen(p, `${level}${rSym}: ${level - gameLevel} above game`, (level - gameLevel) * GAME_REACHED_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      rSup >= RR_FIT
        ? `${rSup} ${STRAIN_DISPLAY[rs]}: raise to ${level}${rSym}`
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
  if (isGameLevel(openerRebid)) return scoreAfterGame(bid, openerRebid.level);

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
    const nSym = STRAIN_SYMBOLS[ns];
    const cheapRaise = openerRebid.level + 1;
    const gameLevel = isMajor(ns) ? 4 : 5;
    const hcpMin = level >= gameLevel ? RR_GF_MIN : RR_INV_MIN;
    /** @type {PenaltyItem[]} */ const p = [];
    pen(p, `${nSup} ${STRAIN_DISPLAY[ns]}, need ${RR_FIT + 1}+`,
      Math.max(0, RR_FIT + 1 - nSup) * LENGTH_SHORT_COST);
    pen(p, `${hcp} HCP, need ${hcpMin}+`, Math.max(0, hcpMin - hcp) * HCP_COST);
    if (level > gameLevel) {
      pen(p, `${level}${nSym}: ${level - gameLevel} above game`, (level - gameLevel) * GAME_REACHED_COST);
    }
    return scored(bid, deduct(penTotal(p)),
      nSup >= RR_FIT + 1
        ? `${nSup} ${STRAIN_DISPLAY[ns]}: raise to ${level}${nSym}`
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

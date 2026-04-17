import { contractBid, isLegalBid, pass, Strain, STRAIN_ORDER } from '../../../model/bid.js';
import { SEATS } from '../../../model/deal.js';
import { rec, suitLen } from './shared.js';

/**
 * @typedef {import('./context.js').ConventionContext} ConventionContext
 * @typedef {import('../../../engine/opening.js').BidRecommendation} BidRecommendation
 * @typedef {import('../../../model/bid.js').ContractBid} ContractBid
 */

const NEG_DBL_CONTINUE_INVITE_HCP = 8;
const NEG_DBL_CONTINUE_GAME_HCP = 11;
const NEG_DBL_CONTINUE_STRONG_HCP = 13;
const NEG_DBL_SHOW_MAJOR_LEN = 4;
const NEG_DBL_SUPPORT_LEN = 3;

/**
 * @param {ConventionContext} ctx
 * @returns {boolean}
 */
function shouldUseNegativeDoubleContinuationsPack(ctx) {
  return getNegativeDoubleContinuationWindow(ctx) !== null;
}

/**
 * @param {ConventionContext} ctx
 * @returns {BidRecommendation[] | null}
 */
function runNegativeDoubleContinuationsPack(ctx) {
  const window = getNegativeDoubleContinuationWindow(ctx);
  if (!window) return null;
  const legal = legalContracts(ctx.auction);
  if (legal.length === 0) return null;

  if (window.actor === 'responder') {
    return scoreResponderAfterNegativeDouble(ctx, window, legal);
  }
  return scoreOpenerAfterNegativeDouble(ctx, window, legal);
}

/**
 * @param {ConventionContext} ctx
 * @param {NegativeDoubleContinuationWindow} window
 * @param {ContractBid[]} legal
 * @returns {BidRecommendation[] | null}
 */
function scoreResponderAfterNegativeDouble(ctx, window, legal) {
  const shape = ctx.eval_.shape;
  const hcp = ctx.eval_.hcp;
  const hasM4 = suitLen(shape, window.unbidMajor) >= NEG_DBL_SHOW_MAJOR_LEN;
  const results = [];
  const partnerMajor = partnerMajorContract(window.partnerLastContract);

  if (partnerMajor) {
    const support = suitLen(shape, partnerMajor);
    if (support >= NEG_DBL_SUPPORT_LEN) {
      const raiseLevel = nextLevelForStrain(window.lastContract, partnerMajor);
      const raiseBid = legalContractAtOrAbove(legal, raiseLevel, partnerMajor);
      if (raiseBid) {
        const pr = hcp >= NEG_DBL_CONTINUE_GAME_HCP ? 10 : hcp >= NEG_DBL_CONTINUE_INVITE_HCP ? 9 : 7;
        results.push(
          rec(
            raiseBid,
            pr,
            `${hcp} HCP, ${support} support: raise partner major`,
          ),
        );
      }
    }

    if (support >= NEG_DBL_SHOW_MAJOR_LEN && hcp >= NEG_DBL_CONTINUE_INVITE_HCP) {
      const cueLevel = nextLevelForStrain(window.lastContract, window.oppStrain);
      const cueBid = legalContractAtOrAbove(legal, cueLevel, window.oppStrain);
      if (cueBid) {
        results.push(
          rec(
            cueBid,
            10,
            `${hcp} HCP, ${support} support: cue-bid continuation after negative double`,
          ),
        );
      }
    }
  }

  const minMajorLevel = nextLevelForStrain(window.lastContract, window.unbidMajor);
  if (hasM4 && minMajorLevel > 0) {
    const majorBid = legalContractAtOrAbove(legal, minMajorLevel, window.unbidMajor);
    if (majorBid) {
      const pr = hcp >= NEG_DBL_CONTINUE_GAME_HCP ? 10 : hcp >= NEG_DBL_CONTINUE_INVITE_HCP ? 9 : 7;
      results.push(
        rec(
          majorBid,
          pr,
          `${hcp} HCP, ${suitLen(shape, window.unbidMajor)} ${strainName(window.unbidMajor)}: continue in unbid major`,
        ),
      );
    }
  }

  const ntBid = legalContractAtOrAbove(legal, nextLevelForStrain(window.lastContract, Strain.NOTRUMP), Strain.NOTRUMP);
  if (ntBid && hcp >= NEG_DBL_CONTINUE_INVITE_HCP && hasStopperPosture(shape, window.oppStrain)) {
    results.push(rec(ntBid, 8, `${hcp} HCP with stopper posture: notrump continuation`));
  }

  const partnerBid = legalContractAtOrAbove(
    legal,
    nextLevelForStrain(window.lastContract, window.partnerStrain),
    window.partnerStrain,
  );
  if (partnerBid && suitLen(shape, window.partnerStrain) >= NEG_DBL_SUPPORT_LEN) {
    const pr = hcp >= NEG_DBL_CONTINUE_STRONG_HCP ? 8 : 6;
    results.push(
      rec(
        partnerBid,
        pr,
        `${hcp} HCP, ${suitLen(shape, window.partnerStrain)} support: raise partner`,
      ),
    );
  }

  results.push(rec(pass(), passPriority(hcp), `${hcp} HCP: pass as fallback`));
  return sortUnique(results);
}

/**
 * @param {ConventionContext} ctx
 * @param {NegativeDoubleContinuationWindow} window
 * @param {ContractBid[]} legal
 * @returns {BidRecommendation[] | null}
 */
function scoreOpenerAfterNegativeDouble(ctx, window, legal) {
  const shape = ctx.eval_.shape;
  const hcp = ctx.eval_.hcp;
  const results = [];

  const support = suitLen(shape, window.unbidMajor);
  if (support >= NEG_DBL_SUPPORT_LEN) {
    const level = nextLevelForStrain(window.lastContract, window.unbidMajor);
    const bid = legalContractAtOrAbove(legal, level, window.unbidMajor);
    if (bid && hcp >= NEG_DBL_CONTINUE_STRONG_HCP) {
      const pr = hcp >= NEG_DBL_CONTINUE_GAME_HCP ? 9 : 8;
      results.push(
        rec(
          bid,
          pr,
          `${hcp} HCP, ${support} support: raise responder major`,
        ),
      );
    }
  }

  const cheapestPartner = legalContractAtOrAbove(
    legal,
    nextLevelForStrain(window.lastContract, window.partnerStrain),
    window.partnerStrain,
  );
  if (cheapestPartner) {
    results.push(
      rec(
        cheapestPartner,
        9,
        `${hcp} HCP: compete in partner suit`,
      ),
    );
  }

  const nt = legalContractAtOrAbove(
    legal,
    nextLevelForStrain(window.lastContract, Strain.NOTRUMP),
    Strain.NOTRUMP,
  );
  if (nt && hcp >= NEG_DBL_CONTINUE_INVITE_HCP && hasStopperPosture(shape, window.oppStrain)) {
    const ntPriority = support >= NEG_DBL_SUPPORT_LEN ? 8 : 8;
    results.push(rec(nt, ntPriority, `${hcp} HCP with stopper posture: notrump continuation`));
  }

  results.push(rec(pass(), passPriority(hcp), `${hcp} HCP: pass as fallback`));
  return sortUnique(results);
}

/**
 * @typedef {{
 *   actor: 'responder' | 'opener',
 *   partnerStrain: 'C'|'D'|'H'|'S',
 *   oppStrain: 'C'|'D'|'H'|'S',
 *   unbidMajor: 'H'|'S',
 *   lastContract: ContractBid,
 *   partnerLastContract: ContractBid | null
 * }} NegativeDoubleContinuationWindow
 */

/**
 * @param {ConventionContext} ctx
 * @returns {NegativeDoubleContinuationWindow | null}
 */
function getNegativeDoubleContinuationWindow(ctx) {
  if (ctx.phase !== 'rebid' && ctx.phase !== 'responding') return null;

  const events = auctionEvents(ctx.auction);
  const xIdx = lastNegativeDoubleIndex(events);
  if (xIdx < 0) return null;
  if (actedSince(events, xIdx, ctx.seat)) return null;

  const dblSeat = events[xIdx].seat;
  const openerSeat = events[xIdx - 2]?.seat || null;
  if (!openerSeat) return null;

  const actor =
    ctx.seat === dblSeat ? 'responder'
      : partnerOf(dblSeat) === ctx.seat ? 'opener'
        : null;
  if (!actor) return null;

  const partnerStrain = events[xIdx - 2]?.bid?.type === 'contract'
    ? events[xIdx - 2].bid.strain
    : null;
  const oppStrain = events[xIdx - 1]?.bid?.type === 'contract'
    ? events[xIdx - 1].bid.strain
    : null;
  if (!partnerStrain || !oppStrain) return null;
  if (partnerStrain === Strain.NOTRUMP || oppStrain === Strain.NOTRUMP) return null;

  const unbid = unbidMajors(partnerStrain, oppStrain);
  if (unbid.length !== 1) return null;

  const lastContract = lastContractFrom(events);
  if (!lastContract) return null;
  const partnerLastContract = lastContractBySeat(events, partnerOf(ctx.seat));

  return {
    actor,
    partnerStrain,
    oppStrain,
    unbidMajor: unbid[0],
    lastContract,
    partnerLastContract,
  };
}

/**
 * @param {Array<{ seat: import('../../../model/deal.js').Seat, bid: import('../../../model/bid.js').Bid }>} events
 * @returns {number}
 */
function lastNegativeDoubleIndex(events) {
  for (let i = events.length - 1; i >= 2; i--) {
    const self = events[i];
    const opp = events[i - 1];
    const partner = events[i - 2];
    if (self.bid.type !== 'double') continue;
    if (opp.bid.type !== 'contract' || opp.bid.strain === Strain.NOTRUMP) continue;
    if (partner.bid.type !== 'contract' || partner.bid.strain === Strain.NOTRUMP) continue;
    if (!arePartners(self.seat, partner.seat)) continue;
    if (arePartners(self.seat, opp.seat)) continue;
    return i;
  }
  return -1;
}

/**
 * @param {Array<{ seat: import('../../../model/deal.js').Seat, bid: import('../../../model/bid.js').Bid }>} events
 * @param {number} index
 * @param {import('../../../model/deal.js').Seat} seat
 * @returns {boolean}
 */
function actedSince(events, index, seat) {
  for (let i = index + 1; i < events.length; i++) {
    if (events[i].seat === seat) return true;
  }
  return false;
}

/**
 * @param {Array<{ seat: import('../../../model/deal.js').Seat, bid: import('../../../model/bid.js').Bid }>} events
 * @returns {ContractBid | null}
 */
function lastContractFrom(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].bid.type === 'contract') return events[i].bid;
  }
  return null;
}

/**
 * @param {Array<{ seat: import('../../../model/deal.js').Seat, bid: import('../../../model/bid.js').Bid }>} events
 * @param {import('../../../model/deal.js').Seat} seat
 * @returns {ContractBid | null}
 */
function lastContractBySeat(events, seat) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].seat !== seat) continue;
    if (events[i].bid.type === 'contract') return events[i].bid;
  }
  return null;
}

/**
 * @param {import('../../../model/bid.js').Auction} auction
 * @returns {Array<{ seat: import('../../../model/deal.js').Seat, bid: import('../../../model/bid.js').Bid }>}
 */
function auctionEvents(auction) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  return auction.bids.map((bid, i) => ({
    seat: SEATS[(dealerIdx + i) % SEATS.length],
    bid,
  }));
}

/**
 * @param {import('../../../model/deal.js').Seat} a
 * @param {import('../../../model/deal.js').Seat} b
 * @returns {boolean}
 */
function arePartners(a, b) {
  return (a === 'N' && b === 'S') ||
    (a === 'S' && b === 'N') ||
    (a === 'E' && b === 'W') ||
    (a === 'W' && b === 'E');
}

/**
 * @param {import('../../../model/deal.js').Seat} seat
 * @returns {import('../../../model/deal.js').Seat}
 */
function partnerOf(seat) {
  if (seat === 'N') return 'S';
  if (seat === 'S') return 'N';
  if (seat === 'E') return 'W';
  return 'E';
}

/**
 * @param {'C'|'D'|'H'|'S'} partnerStrain
 * @param {'C'|'D'|'H'|'S'} oppStrain
 * @returns {Array<'H'|'S'>}
 */
function unbidMajors(partnerStrain, oppStrain) {
  /** @type {Array<'H'|'S'>} */
  const majors = [Strain.HEARTS, Strain.SPADES];
  return majors.filter(major => major !== partnerStrain && major !== oppStrain);
}

/**
 * @param {import('../../../model/bid.js').Auction} auction
 * @returns {ContractBid[]}
 */
function legalContracts(auction) {
  /** @type {ContractBid[]} */
  const out = [];
  for (let level = 1; level <= 7; level++) {
    for (const strain of STRAIN_ORDER) {
      const bid = contractBid(level, strain);
      if (isLegalBid(auction, bid)) out.push(bid);
    }
  }
  return out;
}

/**
 * @param {ContractBid} floor
 * @param {'C'|'D'|'H'|'S'|'NT'} strain
 * @returns {number}
 */
function nextLevelForStrain(floor, strain) {
  const floorIdx = STRAIN_ORDER.indexOf(floor.strain);
  const targetIdx = STRAIN_ORDER.indexOf(strain);
  if (targetIdx < 0 || floorIdx < 0) return 0;
  if (targetIdx > floorIdx) return floor.level;
  return floor.level + 1;
}

/**
 * @param {ContractBid[]} legal
 * @param {number} minLevel
 * @param {'C'|'D'|'H'|'S'|'NT'} strain
 * @returns {ContractBid | null}
 */
function legalContractAtOrAbove(legal, minLevel, strain) {
  for (const bid of legal) {
    if (bid.strain === strain && bid.level >= minLevel) return bid;
  }
  return null;
}

/**
 * @param {number[]} shape
 * @param {'C'|'D'|'H'|'S'} oppStrain
 * @returns {boolean}
 */
function hasStopperPosture(shape, oppStrain) {
  return suitLen(shape, oppStrain) >= 2;
}

/**
 * @param {number} hcp
 * @returns {number}
 */
function passPriority(hcp) {
  if (hcp >= NEG_DBL_CONTINUE_GAME_HCP) return 4;
  if (hcp >= NEG_DBL_CONTINUE_INVITE_HCP) return 5;
  return 8;
}

/**
 * @param {BidRecommendation[]} rows
 * @returns {BidRecommendation[]}
 */
function sortUnique(rows) {
  /** @type {Map<string, BidRecommendation>} */
  const byBid = new Map();
  for (const row of rows) {
    const k = bidKey(row.bid);
    const cur = byBid.get(k);
    if (!cur || row.priority > cur.priority) byBid.set(k, row);
  }
  return [...byBid.values()].sort((a, b) => b.priority - a.priority);
}

/**
 * @param {import('../../../model/bid.js').Bid} bid
 * @returns {string}
 */
function bidKey(bid) {
  if (bid.type === 'contract') return `${bid.level}${bid.strain}`;
  return bid.type;
}

/**
 * @param {'C'|'D'|'H'|'S'|'NT'} strain
 * @returns {string}
 */
function strainName(strain) {
  if (strain === Strain.CLUBS) return 'clubs';
  if (strain === Strain.DIAMONDS) return 'diamonds';
  if (strain === Strain.HEARTS) return 'hearts';
  if (strain === Strain.SPADES) return 'spades';
  return 'notrump';
}

/**
 * @param {ContractBid | null} bid
 * @returns {'H'|'S'|null}
 */
function partnerMajorContract(bid) {
  if (!bid) return null;
  if (bid.strain === Strain.HEARTS) return Strain.HEARTS;
  if (bid.strain === Strain.SPADES) return Strain.SPADES;
  return null;
}

/**
 * @type {{ id: string, priority: number, when: (ctx: ConventionContext) => boolean, run: (ctx: ConventionContext) => BidRecommendation[] | null }}
 */
export const negativeDoubleContinuationsPack = {
  id: 'negative-double-continuations',
  priority: 53,
  when: shouldUseNegativeDoubleContinuationsPack,
  run: runNegativeDoubleContinuationsPack,
};

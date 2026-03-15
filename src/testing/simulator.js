import { deal, SEATS } from '../model/deal.js';
import {
  createAuction, addBid, pass, isComplete, currentSeat,
  bidToString, lastContractBid, STRAIN_SYMBOLS,
} from '../model/bid.js';
import { evaluate, shapeString } from '../engine/evaluate.js';
import { getRecommendations } from '../engine/advisor.js';
import { groupBySuit } from '../model/hand.js';
import { SUIT_SYMBOLS, RANK_NAMES, SUIT_ORDER } from '../model/card.js';

/**
 * @typedef {import('../model/deal.js').Deal} Deal
 * @typedef {import('../model/deal.js').Seat} Seat
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('../model/bid.js').Bid} Bid
 * @typedef {import('../model/hand.js').Hand} Hand
 */

const MAX_BIDS = 60;
const SEAT_NAMES = /** @type {Record<Seat, string>} */ ({ N: 'North', E: 'East', S: 'South', W: 'West' });
/** @type {Record<Seat, Seat>} */
const PARTNER = { N: 'S', S: 'N', E: 'W', W: 'E' };

/**
 * @typedef {{
 *   seat: Seat,
 *   bidStr: string,
 *   priority: number,
 *   explanation: string,
 *   alternatives: { bidStr: string, priority: number }[],
 * }} BidLogEntry
 *
 * @typedef {{
 *   hands: Deal,
 *   dealer: Seat,
 *   auction: Auction,
 *   bidLog: BidLogEntry[],
 *   finalContract: import('../model/bid.js').ContractBid | null,
 *   declarer: Seat | null,
 *   aborted: boolean,
 * }} SimulationResult
 */

/**
 * Simulate a single full auction from deal to conclusion.
 * Each seat bids using the engine's getRecommendations, picking the top result.
 * @returns {SimulationResult}
 */
export function simulateAuction() {
  const hands = deal();
  const dealer = SEATS[Math.floor(Math.random() * SEATS.length)];
  let auction = createAuction(dealer);

  /** @type {BidLogEntry[]} */
  const bidLog = [];

  while (!isComplete(auction) && auction.bids.length < MAX_BIDS) {
    const seat = currentSeat(auction);
    const hand = hands[seat];

    let recs;
    try {
      recs = getRecommendations(hand, auction, seat);
    } catch (e) {
      recs = [];
      bidLog.push({
        seat,
        bidStr: 'Pass',
        priority: 0,
        explanation: `ENGINE EXCEPTION in getRecommendations: ${e.message}`,
        alternatives: [],
      });
      auction = addBid(auction, pass());
      continue;
    }

    const chosen = recs.length > 0
      ? recs[0]
      : { bid: pass(), priority: 0, explanation: 'No recommendations (defaulting to pass)', penalties: [] };

    const alternatives = recs.slice(1, 4).map(r => ({
      bidStr: bidToString(r.bid),
      priority: r.priority,
    }));

    try {
      auction = addBid(auction, chosen.bid);
      bidLog.push({
        seat,
        bidStr: bidToString(chosen.bid),
        priority: chosen.priority,
        explanation: chosen.explanation,
        alternatives,
      });
    } catch (e) {
      bidLog.push({
        seat,
        bidStr: 'Pass',
        priority: 0,
        explanation: `ILLEGAL BID ${bidToString(chosen.bid)} recommended (${chosen.explanation}) — fell back to Pass`,
        alternatives,
      });
      auction = addBid(auction, pass());
    }
  }

  const finalContract = lastContractBid(auction);
  const declarer = finalContract ? findDeclarer(auction, finalContract) : null;

  return {
    hands,
    dealer,
    auction,
    bidLog,
    finalContract,
    declarer,
    aborted: auction.bids.length >= MAX_BIDS && !isComplete(auction),
  };
}

/**
 * Find the declarer: the first player on the winning side to bid the final strain.
 * @param {Auction} auction
 * @param {import('../model/bid.js').ContractBid} contract
 * @returns {Seat | null}
 */
function findDeclarer(auction, contract) {
  const dealerIdx = SEATS.indexOf(auction.dealer);

  let lastContractSeat = null;
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    if (auction.bids[i].type === 'contract') {
      lastContractSeat = SEATS[(dealerIdx + i) % SEATS.length];
      break;
    }
  }
  if (!lastContractSeat) return null;

  const declaringSide = [lastContractSeat, PARTNER[lastContractSeat]];
  for (let i = 0; i < auction.bids.length; i++) {
    const b = auction.bids[i];
    const s = SEATS[(dealerIdx + i) % SEATS.length];
    if (b.type === 'contract' && b.strain === contract.strain && declaringSide.includes(s)) {
      return s;
    }
  }
  return null;
}

/**
 * @param {Hand} hand
 * @returns {string}
 */
function formatHand(hand) {
  const groups = groupBySuit(hand);
  const parts = [];
  for (const suit of SUIT_ORDER) {
    const cards = /** @type {import('../model/card.js').Card[]} */ (groups.get(suit));
    const ranks = cards.map(c => RANK_NAMES[c.rank]).join('');
    parts.push(`${SUIT_SYMBOLS[suit]}${ranks || '-'}`);
  }
  return parts.join(' ');
}

/**
 * Format simulation results as readable text suitable for pasting into a chat for analysis.
 * @param {SimulationResult[]} results
 * @returns {string}
 */
export function formatSimulations(results) {
  const lines = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    lines.push(`=== Deal ${i + 1} ===`);
    lines.push(`Dealer: ${SEAT_NAMES[r.dealer]}`);
    lines.push('');

    for (const seat of SEATS) {
      const hand = r.hands[seat];
      const ev = evaluate(hand);
      lines.push(
        `  ${SEAT_NAMES[seat].padEnd(6)} ${formatHand(hand)}  ` +
        `(${ev.hcp} HCP, ${shapeString(ev.shape)}, ${ev.shapeClass})`
      );
    }
    lines.push('');

    lines.push('Auction:');
    for (const entry of r.bidLog) {
      const altStr = entry.alternatives.length > 0
        ? `  (also: ${entry.alternatives.map(a => `${a.bidStr}[${a.priority}]`).join(', ')})`
        : '';
      lines.push(
        `  ${entry.seat}: ${entry.bidStr.padEnd(6)} [p=${entry.priority}] ` +
        `${entry.explanation}${altStr}`
      );
    }
    lines.push('');

    if (r.aborted) {
      lines.push('Result: AUCTION ABORTED (exceeded max bids — possible engine loop)');
    } else if (r.finalContract) {
      const contractStr = `${r.finalContract.level}${STRAIN_SYMBOLS[r.finalContract.strain]}`;
      const declarerStr = r.declarer ? SEAT_NAMES[r.declarer] : '?';
      lines.push(`Result: ${contractStr} by ${declarerStr}`);
    } else {
      lines.push('Result: Passed Out');
    }

    lines.push('');
    lines.push('');
  }

  return lines.join('\n');
}

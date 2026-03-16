import { STRAIN_SYMBOLS, STRAIN_COLORS } from '../model/bid.js';
import { SEATS } from '../model/deal.js';

/**
 * @typedef {import('../model/deal.js').Seat} Seat
 * @typedef {import('../model/bid.js').Bid} Bid
 * @typedef {import('../model/bid.js').ContractBid} ContractBid
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {{
 *   seat: Seat,
 *   bid: Bid,
 *   explanation: string,
 *   isPlayer: boolean,
 * }} BidAnnotation
 */

const SEAT_NAMES = { N: 'North', E: 'East', S: 'South', W: 'West' };
/** @type {Record<Seat, Seat>} */
const PARTNER = { N: 'S', S: 'N', E: 'W', W: 'E' };

/**
 * Render the post-bidding breakdown showing what each player was thinking.
 * @param {{
 *   annotations: BidAnnotation[],
 *   completedAuction: Auction,
 *   playerSeat: Seat,
 *   handVisible: boolean,
 *   onToggleHand: () => void,
 * }} opts
 * @param {HTMLElement} container
 */
export function renderBreakdown({ annotations, completedAuction, playerSeat, handVisible, onToggleHand }, container) {
  container.innerHTML = '';
  container.className = 'breakdown-display';

  const header = document.createElement('div');
  header.className = 'breakdown-header';

  const heading = document.createElement('div');
  heading.className = 'breakdown-heading';
  heading.textContent = 'Bidding Analysis';
  header.appendChild(heading);

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'tools-btn breakdown-toggle-btn';
  toggleBtn.textContent = handVisible ? 'Hide Hand' : 'Show Hand';
  toggleBtn.addEventListener('click', onToggleHand);
  header.appendChild(toggleBtn);

  container.appendChild(header);

  const list = document.createElement('div');
  list.className = 'breakdown-list';

  for (const ann of annotations) {
    list.appendChild(buildAnnotationRow(ann));
  }

  container.appendChild(list);
  container.appendChild(buildContractSummary(completedAuction));
}

/**
 * @param {BidAnnotation} ann
 * @returns {HTMLElement}
 */
function buildAnnotationRow(ann) {
  const row = document.createElement('div');
  row.className = 'breakdown-row';
  if (ann.isPlayer) row.classList.add('breakdown-row-player');

  const isNS = ann.seat === 'N' || ann.seat === 'S';
  row.classList.add(isNS ? 'breakdown-team-ns' : 'breakdown-team-ew');

  const seatEl = document.createElement('span');
  seatEl.className = 'breakdown-seat';
  seatEl.textContent = ann.seat;
  row.appendChild(seatEl);

  const bidEl = document.createElement('span');
  bidEl.className = 'breakdown-bid';
  renderBidInline(bidEl, ann.bid);
  row.appendChild(bidEl);

  const explEl = document.createElement('span');
  explEl.className = 'breakdown-explanation';
  explEl.textContent = ann.explanation;
  row.appendChild(explEl);

  if (ann.isPlayer) {
    const tag = document.createElement('span');
    tag.className = 'breakdown-you-tag';
    tag.textContent = 'You';
    row.appendChild(tag);
  }

  return row;
}

/**
 * @param {HTMLElement} el
 * @param {Bid} bid
 */
function renderBidInline(el, bid) {
  switch (bid.type) {
    case 'contract': {
      el.appendChild(document.createTextNode(String(bid.level)));
      const sym = document.createElement('span');
      sym.textContent = STRAIN_SYMBOLS[bid.strain];
      sym.className = `bid-strain-${STRAIN_COLORS[bid.strain]}`;
      el.appendChild(sym);
      break;
    }
    case 'pass':
      el.textContent = 'Pass';
      el.classList.add('bid-pass');
      break;
    case 'double':
      el.textContent = 'X';
      el.classList.add('bid-double');
      break;
    case 'redouble':
      el.textContent = 'XX';
      el.classList.add('bid-redouble');
      break;
  }
}

/**
 * @param {Auction} auction
 * @returns {HTMLElement}
 */
function buildContractSummary(auction) {
  const div = document.createElement('div');
  div.className = 'breakdown-contract';

  const lastContract = findLastContract(auction);
  if (!lastContract) {
    div.textContent = 'Passed out';
    return div;
  }

  const declarerSeat = findDeclarer(auction, lastContract.bid);

  div.appendChild(document.createTextNode('Final contract: '));

  const contractEl = document.createElement('span');
  contractEl.className = 'breakdown-contract-value';
  contractEl.appendChild(document.createTextNode(String(lastContract.bid.level)));
  const sym = document.createElement('span');
  sym.textContent = STRAIN_SYMBOLS[lastContract.bid.strain];
  sym.className = `bid-strain-${STRAIN_COLORS[lastContract.bid.strain]}`;
  contractEl.appendChild(sym);
  div.appendChild(contractEl);

  if (declarerSeat) {
    div.appendChild(document.createTextNode(` by ${SEAT_NAMES[declarerSeat]}`));
  }

  return div;
}

/**
 * @param {Auction} auction
 * @returns {{ bid: ContractBid, seat: Seat } | null}
 */
function findLastContract(auction) {
  const dealerIdx = SEATS.indexOf(auction.dealer);
  for (let i = auction.bids.length - 1; i >= 0; i--) {
    if (auction.bids[i].type === 'contract') {
      return {
        bid: /** @type {ContractBid} */ (auction.bids[i]),
        seat: SEATS[(dealerIdx + i) % SEATS.length],
      };
    }
  }
  return null;
}

/**
 * @param {Auction} auction
 * @param {ContractBid} contract
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

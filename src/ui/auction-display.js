import { STRAIN_COLORS, STRAIN_SYMBOLS } from '../model/bid.js';

/**
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('../model/bid.js').Bid} Bid
 * @typedef {import('../model/bid.js').ContractBid} ContractBid
 */

/** @type {readonly import('../model/deal.js').Seat[]} */
const DISPLAY_SEATS = ['W', 'N', 'E', 'S'];

const COLUMNS = DISPLAY_SEATS.length;

/** Index of the player's column (South) */
const PLAYER_COL = DISPLAY_SEATS.indexOf('S');

/**
 * Render an auction as a 4-column table (W / N / E / S).
 * The player's column (South) is visually highlighted.
 * @param {Auction} auction
 * @param {HTMLElement} container
 */
export function renderAuction(auction, container) {
  container.innerHTML = '';
  container.classList.add('auction-display');

  const table = document.createElement('table');
  table.className = 'auction-table';

  table.appendChild(buildHead());
  table.appendChild(buildBody(auction));

  container.appendChild(table);
}

/** @returns {HTMLTableSectionElement} */
function buildHead() {
  const thead = document.createElement('thead');
  const row = document.createElement('tr');
  for (let i = 0; i < DISPLAY_SEATS.length; i++) {
    const th = document.createElement('th');
    th.textContent = DISPLAY_SEATS[i];
    if (i === PLAYER_COL) th.classList.add('auction-player-col');
    row.appendChild(th);
  }
  thead.appendChild(row);
  return thead;
}

/**
 * @param {Auction} auction
 * @returns {HTMLTableSectionElement}
 */
function buildBody(auction) {
  const tbody = document.createElement('tbody');
  const offset = DISPLAY_SEATS.indexOf(auction.dealer);
  const cells = [
    ...new Array(offset).fill(null),
    ...auction.bids,
  ];

  while (cells.length % COLUMNS !== 0) cells.push(null);

  for (let i = 0; i < cells.length; i += COLUMNS) {
    const tr = document.createElement('tr');
    for (let j = 0; j < COLUMNS; j++) {
      const td = document.createElement('td');
      if (j === PLAYER_COL) td.classList.add('auction-player-col');
      const bid = cells[i + j];
      if (bid) renderBidCell(td, bid);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  return tbody;
}

/**
 * @param {HTMLTableCellElement} td
 * @param {Bid} bid
 */
function renderBidCell(td, bid) {
  switch (bid.type) {
    case 'contract':
      renderContractBid(td, /** @type {ContractBid} */ (bid));
      break;
    case 'pass':
      td.textContent = 'Pass';
      td.classList.add('bid-pass');
      break;
    case 'double':
      td.textContent = 'X';
      td.classList.add('bid-double');
      break;
    case 'redouble':
      td.textContent = 'XX';
      td.classList.add('bid-redouble');
      break;
  }
}

/**
 * @param {HTMLTableCellElement} td
 * @param {ContractBid} bid
 */
function renderContractBid(td, bid) {
  const level = document.createTextNode(String(bid.level));
  td.appendChild(level);

  const symbol = document.createElement('span');
  symbol.textContent = STRAIN_SYMBOLS[bid.strain];
  symbol.className = `bid-strain-${STRAIN_COLORS[bid.strain]}`;
  td.appendChild(symbol);
}

import {
  STRAIN_ORDER, STRAIN_SYMBOLS, STRAIN_COLORS,
  contractBid, pass, dbl, redbl, isLegalBid,
} from '../model/bid.js';

/**
 * @typedef {import('../model/bid.js').Auction} Auction
 * @typedef {import('../model/bid.js').Bid} Bid
 * @callback OnBidSelected
 * @param {Bid} bid
 * @returns {void}
 */

const MIN_LEVEL = 1;
const MAX_LEVEL = 7;

/**
 * Render the bid selector: a 7x5 grid of contract bids plus Pass / X / XX.
 * Illegal bids are grayed out. Clicking a legal bid invokes `onBid`.
 * @param {Auction} auction
 * @param {HTMLElement} container
 * @param {OnBidSelected} onBid
 */
export function renderBidSelector(auction, container, onBid) {
  container.innerHTML = '';
  container.classList.add('bid-selector');

  container.appendChild(buildContractGrid(auction, onBid));
  container.appendChild(buildSpecialRow(auction, onBid));
}

/**
 * @param {Auction} auction
 * @param {OnBidSelected} onBid
 * @returns {HTMLElement}
 */
function buildContractGrid(auction, onBid) {
  const grid = document.createElement('div');
  grid.className = 'bid-grid';

  for (let level = MIN_LEVEL; level <= MAX_LEVEL; level++) {
    for (const strain of STRAIN_ORDER) {
      const bid = contractBid(level, strain);
      const legal = isLegalBid(auction, bid);
      grid.appendChild(createBidButton(bid, legal, formatContractBid(level, strain), onBid));
    }
  }

  return grid;
}

/**
 * @param {number} level
 * @param {import('../model/bid.js').Strain} strain
 * @returns {{ text: string, colorClass: string }}
 */
function formatContractBid(level, strain) {
  return {
    text: `${level}${STRAIN_SYMBOLS[strain]}`,
    colorClass: `bid-strain-${STRAIN_COLORS[strain]}`,
  };
}

/**
 * @param {Auction} auction
 * @param {OnBidSelected} onBid
 * @returns {HTMLElement}
 */
function buildSpecialRow(auction, onBid) {
  const row = document.createElement('div');
  row.className = 'bid-special-row';

  const specials = [
    { bid: pass(), label: 'Pass', cls: 'bid-btn-pass' },
    { bid: dbl(), label: 'X', cls: 'bid-btn-double' },
    { bid: redbl(), label: 'XX', cls: 'bid-btn-redouble' },
  ];

  for (const { bid, label, cls } of specials) {
    const legal = isLegalBid(auction, bid);
    const btn = createBidButton(bid, legal, { text: label, colorClass: '' }, onBid);
    btn.classList.add(cls);
    row.appendChild(btn);
  }

  return row;
}

/**
 * @param {Bid} bid
 * @param {boolean} legal
 * @param {{ text: string, colorClass: string }} display
 * @param {OnBidSelected} onBid
 * @returns {HTMLButtonElement}
 */
function createBidButton(bid, legal, display, onBid) {
  const btn = document.createElement('button');
  btn.className = 'bid-btn';
  btn.disabled = !legal;

  if (display.colorClass) {
    const span = document.createElement('span');
    span.className = display.colorClass;
    span.textContent = display.text;
    btn.appendChild(span);
  } else {
    btn.textContent = display.text;
  }

  if (legal) {
    btn.addEventListener('click', () => onBid(bid));
  }

  return btn;
}

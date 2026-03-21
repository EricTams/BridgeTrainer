import { SUIT_ORDER, SUIT_SYMBOLS, SUIT_COLORS, RANK_NAMES } from '../model/card.js';
import { evaluate } from '../engine/evaluate.js';
import { groupBySuit } from '../model/hand.js';

/**
 * @typedef {import('../model/hand.js').Hand} Hand
 */

/**
 * Render a bridge hand into the given container element.
 * Shows one row per suit with the suit symbol and card ranks.
 * @param {Hand} hand
 * @param {HTMLElement} container
 */
export function renderHand(hand, container) {
  container.innerHTML = '';
  container.classList.add('hand-display');

  const hcpEl = document.createElement('div');
  hcpEl.className = 'hand-hcp-total';
  hcpEl.textContent = `${evaluate(hand).hcp} HCP`;
  container.appendChild(hcpEl);

  const groups = groupBySuit(hand);

  for (const suit of SUIT_ORDER) {
    const row = document.createElement('div');
    row.className = 'hand-suit-row';

    const color = SUIT_COLORS[suit];

    const symbolEl = document.createElement('span');
    symbolEl.className = `suit-symbol suit-${color}`;
    symbolEl.textContent = SUIT_SYMBOLS[suit];
    row.appendChild(symbolEl);

    const cards = /** @type {import('../model/card.js').Card[]} */ (groups.get(suit));
    const ranksText = cards.map(c => RANK_NAMES[c.rank]).join(' ');

    const ranksEl = document.createElement('span');
    ranksEl.className = 'suit-cards';
    ranksEl.textContent = ranksText || '\u2014';
    row.appendChild(ranksEl);

    container.appendChild(row);
  }
}

/**
 * Single-line hand: suit symbols with ranks run together (compact), for overview UIs.
 * @param {Hand} hand
 * @returns {HTMLElement}
 */
export function createCondensedHandLine(hand) {
  const row = document.createElement('span');
  row.className = 'hand-condensed-line';

  const groups = groupBySuit(hand);

  for (let i = 0; i < SUIT_ORDER.length; i++) {
    const suit = SUIT_ORDER[i];
    if (i > 0) row.appendChild(document.createTextNode(' '));

    const seg = document.createElement('span');
    seg.className = 'hand-condensed-suit-seg';

    const sym = document.createElement('span');
    sym.className = `suit-symbol suit-${SUIT_COLORS[suit]}`;
    sym.textContent = SUIT_SYMBOLS[suit];
    seg.appendChild(sym);

    const cards = /** @type {import('../model/card.js').Card[]} */ (groups.get(suit));
    const ranksText = cards.map(c => RANK_NAMES[c.rank]).join('');
    const ranksEl = document.createElement('span');
    ranksEl.className = `hand-condensed-ranks suit-${SUIT_COLORS[suit]}`;
    ranksEl.textContent = ranksText || '\u2014';
    seg.appendChild(ranksEl);

    row.appendChild(seg);
  }

  return row;
}

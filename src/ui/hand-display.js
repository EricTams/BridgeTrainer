import { SUIT_ORDER, SUIT_SYMBOLS, SUIT_COLORS, RANK_NAMES } from '../model/card.js';
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

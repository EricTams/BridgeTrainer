import { SUIT_ORDER } from './card.js';

/**
 * @typedef {import('./card.js').Card} Card
 * @typedef {import('./card.js').Suit} Suit
 * @typedef {{ cards: readonly Card[] }} Hand
 */

/**
 * @param {Card[]} cards -- exactly 13 cards
 * @returns {Hand}
 */
export function createHand(cards) {
  if (cards.length !== 13) {
    throw new Error(`Hand must have 13 cards, got ${cards.length}`);
  }
  const sorted = sortCards([...cards]);
  return Object.freeze({ cards: Object.freeze(sorted) });
}

/**
 * Sort cards by suit (spades first) then by rank descending within each suit.
 * @param {Card[]} cards
 * @returns {Card[]}
 */
function sortCards(cards) {
  return cards.sort((a, b) => {
    const suitDiff = SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;
    return b.rank - a.rank;
  });
}

/**
 * Group a hand's cards by suit, preserving rank order within each group.
 * @param {Hand} hand
 * @returns {Map<Suit, Card[]>}
 */
export function groupBySuit(hand) {
  /** @type {Map<Suit, Card[]>} */
  const groups = new Map();
  for (const suit of SUIT_ORDER) {
    groups.set(suit, []);
  }
  for (const card of hand.cards) {
    /** @type {Card[]} */ (groups.get(card.suit)).push(card);
  }
  return groups;
}

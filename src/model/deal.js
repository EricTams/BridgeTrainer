import { createDeck } from './card.js';
import { createHand } from './hand.js';

/**
 * @typedef {import('./hand.js').Hand} Hand
 * @typedef {'N' | 'E' | 'S' | 'W'} Seat
 * @typedef {Record<Seat, Hand>} Deal
 */

const HAND_SIZE = 13;

/** @type {readonly Seat[]} */
export const SEATS = /** @type {const} */ (['N', 'E', 'S', 'W']);

/**
 * Fisher-Yates (Knuth) shuffle -- mutates in place and returns the array.
 * @template T
 * @param {T[]} array
 * @returns {T[]}
 */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Deal a full 52-card deck into 4 hands of 13 (N, E, S, W).
 * @returns {Deal}
 */
export function deal() {
  const deck = shuffle(createDeck());
  /** @type {Partial<Deal>} */
  const hands = {};
  for (let i = 0; i < SEATS.length; i++) {
    const start = i * HAND_SIZE;
    hands[SEATS[i]] = createHand(deck.slice(start, start + HAND_SIZE));
  }
  return /** @type {Deal} */ (hands);
}

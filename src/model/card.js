/**
 * @typedef {'S' | 'H' | 'D' | 'C'} Suit
 * @typedef {2|3|4|5|6|7|8|9|10|11|12|13|14} Rank
 * @typedef {{ suit: Suit, rank: Rank }} Card
 */

/** @enum {Suit} */
export const Suit = /** @type {const} */ ({
  SPADES: /** @type {'S'} */ ('S'),
  HEARTS: /** @type {'H'} */ ('H'),
  DIAMONDS: /** @type {'D'} */ ('D'),
  CLUBS: /** @type {'C'} */ ('C'),
});

/** @enum {Rank} */
export const Rank = /** @type {const} */ ({
  TWO: /** @type {2} */ (2),
  THREE: /** @type {3} */ (3),
  FOUR: /** @type {4} */ (4),
  FIVE: /** @type {5} */ (5),
  SIX: /** @type {6} */ (6),
  SEVEN: /** @type {7} */ (7),
  EIGHT: /** @type {8} */ (8),
  NINE: /** @type {9} */ (9),
  TEN: /** @type {10} */ (10),
  JACK: /** @type {11} */ (11),
  QUEEN: /** @type {12} */ (12),
  KING: /** @type {13} */ (13),
  ACE: /** @type {14} */ (14),
});

/** Bridge display order: spades (high) to clubs (low) */
export const SUIT_ORDER = /** @type {readonly Suit[]} */ ([
  Suit.SPADES, Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS,
]);

/** @type {Readonly<Record<Suit, string>>} */
export const SUIT_SYMBOLS = {
  [Suit.SPADES]: '\u2660',
  [Suit.HEARTS]: '\u2665',
  [Suit.DIAMONDS]: '\u2666',
  [Suit.CLUBS]: '\u2663',
};

/** @type {Readonly<Record<Suit, 'red' | 'black'>>} */
export const SUIT_COLORS = {
  [Suit.SPADES]: 'black',
  [Suit.HEARTS]: 'red',
  [Suit.DIAMONDS]: 'red',
  [Suit.CLUBS]: 'black',
};

/** @type {Readonly<Record<Rank, string>>} */
export const RANK_NAMES = {
  [Rank.TWO]: '2',
  [Rank.THREE]: '3',
  [Rank.FOUR]: '4',
  [Rank.FIVE]: '5',
  [Rank.SIX]: '6',
  [Rank.SEVEN]: '7',
  [Rank.EIGHT]: '8',
  [Rank.NINE]: '9',
  [Rank.TEN]: '10',
  [Rank.JACK]: 'J',
  [Rank.QUEEN]: 'Q',
  [Rank.KING]: 'K',
  [Rank.ACE]: 'A',
};

/**
 * @param {Suit} suit
 * @param {Rank} rank
 * @returns {Card}
 */
export function createCard(suit, rank) {
  return Object.freeze({ suit, rank });
}

/** @returns {Card[]} A full 52-card deck (unshuffled) */
export function createDeck() {
  /** @type {Card[]} */
  const deck = [];
  for (const suit of SUIT_ORDER) {
    for (const rank of /** @type {Rank[]} */ (Object.values(Rank))) {
      deck.push(createCard(suit, rank));
    }
  }
  return deck;
}

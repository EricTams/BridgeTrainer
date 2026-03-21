import { Rank, SUIT_ORDER } from '../model/card.js';
import { groupBySuit } from '../model/hand.js';

/**
 * @typedef {import('../model/hand.js').Hand} Hand
 * @typedef {import('../model/card.js').Suit} Suit
 *
 * @typedef {'balanced' | 'semi-balanced' | 'unbalanced'} ShapeClass
 *
 * @typedef {{
 *   hcp: number,
 *   shortPoints: number,
 *   longPoints: number,
 *   totalPoints: number,
 *   suitPoints: number,
 *   ntPoints: number,
 *   shape: number[],
 *   shapeClass: ShapeClass,
 * }} Evaluation
 */

/** @type {Readonly<Record<number, number>>} */
const HCP_TABLE = {
  [Rank.ACE]: 4,
  [Rank.KING]: 3,
  [Rank.QUEEN]: 2,
  [Rank.JACK]: 1,
};

const LONG_SUIT_THRESHOLD = 4;

/**
 * @param {Hand} hand
 * @returns {Evaluation}
 */
export function evaluate(hand) {
  const groups = groupBySuit(hand);
  const lengths = suitLengths(groups);

  const hcp = calcHcp(hand);
  const shortPoints = calcShortPoints(lengths);
  const longPoints = calcLongPoints(lengths);

  const totalPoints = hcp + shortPoints + longPoints;
  return {
    hcp,
    shortPoints,
    longPoints,
    totalPoints,
    suitPoints: totalPoints,
    ntPoints: hcp + longPoints,
    shape: lengths,
    shapeClass: classifyShape(lengths),
  };
}

/** @param {Hand} hand */
function calcHcp(hand) {
  let total = 0;
  for (const card of hand.cards) {
    total += HCP_TABLE[card.rank] ?? 0;
  }
  return total;
}

/**
 * Short-suit points: void = 3, singleton = 2, doubleton = 1.
 * @param {number[]} lengths
 */
function calcShortPoints(lengths) {
  let pts = 0;
  for (const len of lengths) {
    if (len === 0) pts += 3;
    else if (len === 1) pts += 2;
    else if (len === 2) pts += 1;
  }
  return pts;
}

/**
 * Long-suit points: 1 point per card beyond 4 in any suit.
 * @param {number[]} lengths
 */
function calcLongPoints(lengths) {
  let pts = 0;
  for (const len of lengths) {
    if (len > LONG_SUIT_THRESHOLD) {
      pts += len - LONG_SUIT_THRESHOLD;
    }
  }
  return pts;
}

/**
 * Suit lengths in SUIT_ORDER (spades, hearts, diamonds, clubs).
 * @param {Map<Suit, import('../model/card.js').Card[]>} groups
 * @returns {number[]}
 */
function suitLengths(groups) {
  return SUIT_ORDER.map(s => /** @type {import('../model/card.js').Card[]} */ (groups.get(s)).length);
}

/**
 * Classify hand shape.
 * Balanced: 4-3-3-3, 4-4-3-2, 5-3-3-2
 * Semi-balanced: 5-4-2-2, 6-3-2-2, 4-4-4-1
 * Unbalanced: everything else
 * @param {number[]} lengths
 * @returns {ShapeClass}
 */
function classifyShape(lengths) {
  const sorted = [...lengths].sort((a, b) => b - a);
  const key = sorted.join('-');

  const BALANCED = new Set(['4-3-3-3', '4-4-3-2', '5-3-3-2']);
  const SEMI_BALANCED = new Set(['5-4-2-2', '6-3-2-2', '4-4-4-1']);

  if (BALANCED.has(key)) return 'balanced';
  if (SEMI_BALANCED.has(key)) return 'semi-balanced';
  return 'unbalanced';
}

/**
 * Human-readable shape string like "5=4=3=1".
 * @param {number[]} shape -- lengths in suit order (S, H, D, C)
 * @returns {string}
 */
export function shapeString(shape) {
  return shape.join('=');
}

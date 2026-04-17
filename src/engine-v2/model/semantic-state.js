/**
 * @typedef {'C' | 'D' | 'H' | 'S'} SuitKey
 * @typedef {{ min: number, max: number }} NumericRange
 * @typedef {{ min: number, max: number }} SuitLengthRange
 * @typedef {'none' | 'one-round' | 'game'} ForcingStatus
 * @typedef {{ id: string, mode: 'hard' | 'soft' }} Obligation
 *
 * @typedef {{
 *   hcp: NumericRange,
 *   suit: Record<SuitKey, SuitLengthRange>,
 *   balancedLikelihood: number,
 *   forcing: 'none' | 'one-round' | 'game',
 *   obligations: Obligation[],
 *   agreedStrain: 'C' | 'D' | 'H' | 'S' | 'NT' | null,
 *   role: string,
 * }} SeatMeaning
 *
 * @typedef {{
 *   me: SeatMeaning,
 *   partner: SeatMeaning,
 *   lho: SeatMeaning,
 *   rho: SeatMeaning,
 *   phase: 'opening' | 'responding' | 'rebid' | 'competitive' | 'passed-out',
 *   vulnerability: 'none' | 'ns' | 'ew' | 'both' | null,
 *   forcingActive: boolean,
 *   activeConventions: string[],
 * }} AuctionMeaningState
 */

/** @type {readonly SuitKey[]} */
export const SUIT_KEYS = /** @type {const} */ (['C', 'D', 'H', 'S']);

/**
 * @param {number} min
 * @param {number} max
 * @returns {NumericRange}
 */
export function createNumericRange(min, max) {
  return { min, max };
}

/**
 * @returns {Record<SuitKey, SuitLengthRange>}
 */
export function createUnknownSuitRanges() {
  return {
    C: createNumericRange(0, 13),
    D: createNumericRange(0, 13),
    H: createNumericRange(0, 13),
    S: createNumericRange(0, 13),
  };
}

/**
 * @param {{
 *   role?: string,
 *   hcp?: NumericRange,
 *   minHcp?: number,
 *   maxHcp?: number,
 *   forcing?: ForcingStatus,
 *   obligations?: string[],
 *   agreedStrain?: 'C' | 'D' | 'H' | 'S' | 'NT' | null,
 *   balancedLikelihood?: number,
 * }} [options]
 * @returns {SeatMeaning}
 */
export function createSeatMeaning(options = {}) {
  const role = options.role ?? 'unknown';
  const hcp = options.hcp ?? createNumericRange(options.minHcp ?? 0, options.maxHcp ?? 37);
  const forcing = options.forcing ?? 'none';
  const obligations = options.obligations ?? [];
  const agreedStrain = options.agreedStrain ?? null;
  const balancedLikelihood = options.balancedLikelihood ?? 0.5;
  return {
    hcp,
    suit: createUnknownSuitRanges(),
    balancedLikelihood,
    forcing,
    obligations: [...obligations],
    agreedStrain,
    role,
  };
}

/**
 * @param {{
 *   phase: 'opening' | 'responding' | 'rebid' | 'competitive' | 'passed-out',
 *   me?: SeatMeaning,
 *   partner?: SeatMeaning,
 *   lho?: SeatMeaning,
 *   rho?: SeatMeaning,
 *   vulnerability?: 'none' | 'ns' | 'ew' | 'both' | null,
 *   forcingActive?: boolean,
 *   activeConventions?: string[],
 * }} options
 * @returns {AuctionMeaningState}
 */
export function createSemanticState(options) {
  return {
    me: options.me ?? createSeatMeaning(),
    partner: options.partner ?? createSeatMeaning(),
    lho: options.lho ?? createSeatMeaning(),
    rho: options.rho ?? createSeatMeaning(),
    phase: options.phase,
    vulnerability: options.vulnerability ?? null,
    forcingActive: options.forcingActive ?? false,
    activeConventions: options.activeConventions ?? [],
  };
}

/** @deprecated Use createSemanticState instead. */
export const createAuctionMeaningState = createSemanticState;

/**
 * @param {SeatMeaning} meaning
 * @param {SuitKey} suit
 * @param {number} min
 * @returns {void}
 */
export function setSuitRangeMin(meaning, suit, min) {
  meaning.suit[suit].min = Math.max(meaning.suit[suit].min, min);
}

/**
 * @param {SeatMeaning} meaning
 * @param {SuitKey} suit
 * @param {number} max
 * @returns {void}
 */
export function setSuitRangeMax(meaning, suit, max) {
  meaning.suit[suit].max = Math.min(meaning.suit[suit].max, max);
}

/**
 * @param {SeatMeaning} meaning
 * @param {SuitKey} suit
 * @param {number} len
 * @returns {void}
 */
export function setSuitRangeExact(meaning, suit, len) {
  meaning.suit[suit] = createNumericRange(len, len);
}

/**
 * @param {SeatMeaning} meaning
 * @param {number} value
 * @returns {void}
 */
export function setBalancedLikelihood(meaning, value) {
  meaning.balancedLikelihood = Math.max(0, Math.min(1, value));
}

/**
 * @param {SeatMeaning} meaning
 * @param {string} obligationId
 * @param {'hard' | 'soft'} [mode]
 * @returns {void}
 */
export function addSeatObligation(meaning, obligationId, mode = 'hard') {
  const exists = meaning.obligations.some(o => o.id === obligationId);
  if (!exists) meaning.obligations.push({ id: obligationId, mode });
}

/**
 * @param {'C' | 'D' | 'H' | 'S' | 'NT'} strain
 * @returns {SuitKey | null}
 */
export function suitKeyFromStrain(strain) {
  if (strain === 'NT') return null;
  return strain;
}

/**
 * @param {{ minHcp: number, maxHcp: number }} meaning
 * @returns {NumericRange}
 */
export function rangeFromMeaning(meaning) {
  return createNumericRange(meaning.minHcp, meaning.maxHcp);
}

/**
 * @param {ForcingStatus} forcing
 * @returns {boolean}
 */
export function forcingToBool(forcing) {
  return forcing !== 'none';
}

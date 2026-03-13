/**
 * @typedef {{
 *   totalPoints: number,
 *   puzzleCount: number,
 * }} Rating
 */

const STORAGE_KEY = 'bridge-trainer-rating';

/** @returns {Rating} */
export function getRating() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultRating();
    return JSON.parse(raw);
  } catch {
    return defaultRating();
  }
}

/**
 * Record a puzzle result and return the updated rating.
 * @param {number} points
 * @returns {Rating}
 */
export function addResult(points) {
  const rating = getRating();
  rating.totalPoints += points;
  rating.puzzleCount += 1;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rating));
  return rating;
}

/** @returns {Rating} */
function defaultRating() {
  return { totalPoints: 0, puzzleCount: 0 };
}

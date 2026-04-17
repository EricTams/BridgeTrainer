import { bidToString } from '../model/bid.js';

/**
 * @typedef {import('../model/bid.js').Bid} Bid
 * @typedef {import('../engine/advisor.js').BidRecommendation} BidRecommendation
 */

const MAX_RECS_SHOWN = 5;
const MIN_RECS_SHOWN = 3;
const MIN_DISPLAY_PRIORITY = 4;

const SCORE_CLASSES = [
  { min: 10, cls: 'result-perfect' },
  { min: 7, cls: 'result-good' },
  { min: 4, cls: 'result-ok' },
  { min: 0, cls: 'result-poor' },
];

/**
 * Render the result panel after the player bids.
 * @param {{
 *   playerBid: Bid,
 *   points: number,
 *   recommendations: BidRecommendation[],
 *   onNext: () => void,
 * }} opts
 * @param {HTMLElement} container
 */
export function renderResult({ playerBid, points, recommendations, onNext }, container) {
  container.innerHTML = '';
  container.classList.add('result-display');

  const playerRec = findPlayerRec(playerBid, recommendations);
  container.appendChild(buildScoreSection(playerBid, points, playerRec));
  container.appendChild(buildRecsSection(recommendations));
  container.appendChild(buildNextButton(onNext));
}

/**
 * @param {Bid} playerBid
 * @param {number} points
 * @param {BidRecommendation | null} playerRec
 * @returns {HTMLElement}
 */
function buildScoreSection(playerBid, points, playerRec) {
  const section = document.createElement('div');
  section.className = 'result-score-section';

  const bidLabel = document.createElement('div');
  bidLabel.className = 'result-your-bid';
  bidLabel.textContent = `Your bid: ${bidToString(playerBid)}`;
  section.appendChild(bidLabel);

  const pointsEl = document.createElement('div');
  pointsEl.className = `result-points ${scoreClass(points)}`;
  const label = Number.isInteger(points) ? String(points) : points.toFixed(1);
  pointsEl.textContent = points >= 0 ? `+${label}` : label;
  section.appendChild(pointsEl);

  section.appendChild(buildPlayerExplRow(playerRec));

  return section;
}

/**
 * @param {BidRecommendation | null} rec
 * @returns {HTMLElement}
 */
function buildPlayerExplRow(rec) {
  const wrapper = document.createElement('div');
  wrapper.className = 'result-your-bid-explanation';

  if (!rec) {
    wrapper.textContent = 'Bid not covered by current engine rules';
    return wrapper;
  }

  if (rec.penalties && rec.penalties.length > 0) {
    wrapper.appendChild(buildPenaltyList(rec.penalties));
  } else {
    wrapper.textContent = rec.explanation;
  }

  return wrapper;
}

/**
 * @param {import('../engine/penalty.js').PenaltyItem[]} penalties
 * @returns {HTMLElement}
 */
function buildPenaltyList(penalties) {
  const list = document.createElement('div');
  list.className = 'result-penalty-list';
  for (const { label, amount } of penalties) {
    const row = document.createElement('div');
    row.className = 'result-penalty-item';

    const labelEl = document.createElement('span');
    labelEl.className = 'result-penalty-label';
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const amountEl = document.createElement('span');
    amountEl.className = 'result-penalty-amount';
    const fmt = Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
    amountEl.textContent = `−${fmt}`;
    row.appendChild(amountEl);

    list.appendChild(row);
  }
  return list;
}

/** @param {BidRecommendation[]} recs @returns {HTMLElement} */
function buildRecsSection(recs) {
  const section = document.createElement('div');
  section.className = 'result-recs-section';

  const heading = document.createElement('div');
  heading.className = 'result-recs-heading';
  heading.textContent = 'Recommended bids';
  section.appendChild(heading);

  const viable = recs.filter(r => r.priority >= MIN_DISPLAY_PRIORITY);
  const shown = viable.length >= MIN_RECS_SHOWN
    ? viable.slice(0, MAX_RECS_SHOWN)
    : recs.slice(0, MIN_RECS_SHOWN);

  for (const rec of shown) {
    section.appendChild(recRow(rec));
  }

  if (shown.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'result-recs-empty';
    empty.textContent = 'No strong recommendations';
    section.appendChild(empty);
  }

  return section;
}

/** @param {BidRecommendation} rec @returns {HTMLElement} */
function recRow(rec) {
  const row = document.createElement('div');
  row.className = 'result-rec-row';

  const bidEl = document.createElement('span');
  bidEl.className = 'result-rec-bid';
  bidEl.textContent = bidToString(rec.bid);
  row.appendChild(bidEl);

  const scoreEl = document.createElement('span');
  scoreEl.className = 'result-rec-score';
  scoreEl.textContent = String(rec.priority);
  row.appendChild(scoreEl);

  const explEl = document.createElement('span');
  explEl.className = 'result-rec-explanation';
  explEl.textContent = rec.explanation;
  row.appendChild(explEl);

  return row;
}

/** @param {() => void} onNext @returns {HTMLElement} */
function buildNextButton(onNext) {
  const btn = document.createElement('button');
  btn.className = 'next-puzzle-btn';
  btn.textContent = 'Next Puzzle';
  btn.addEventListener('click', onNext);
  return btn;
}

/**
 * Find the engine's scored recommendation for the player's actual bid.
 * @param {Bid} playerBid
 * @param {BidRecommendation[]} recs
 * @returns {BidRecommendation | null}
 */
function findPlayerRec(playerBid, recs) {
  const label = bidToString(playerBid);
  return recs.find(r => bidToString(r.bid) === label) ?? null;
}

/** @param {number} points @returns {string} */
function scoreClass(points) {
  for (const { min, cls } of SCORE_CLASSES) {
    if (points >= min) return cls;
  }
  return 'result-wrong';
}

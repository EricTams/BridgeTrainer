import { addBid, bidToString } from '../model/bid.js';
import { evaluate } from '../engine/evaluate.js';
import { seatPosition } from '../engine/context.js';
import { getRecommendations } from '../engine/advisor.js';
import { generatePuzzle } from '../puzzle/generator.js';
import { scoreBid } from '../scoring/scorer.js';
import { getRating, addResult } from '../scoring/rating.js';
import { renderHand } from './hand-display.js';
import { renderEval } from './eval-display.js';
import { renderAuction } from './auction-display.js';
import { renderBidSelector } from './bid-selector.js';
import { renderResult } from './result-display.js';

/**
 * @typedef {import('../puzzle/generator.js').Puzzle} Puzzle
 * @typedef {import('../scoring/scorer.js').ScoreResult} ScoreResult
 * @typedef {import('../model/bid.js').Bid} Bid
 */

const PLAYER_SEAT = /** @type {import('../model/deal.js').Seat} */ ('S');
const SEAT_NAMES = { N: 'North', E: 'East', S: 'South', W: 'West' };
const ADVISOR_TOP_N = 3;
const ADVISOR_MIN_PRIORITY = 4;

/**
 * Initialize the puzzle-loop app inside the given root element.
 * @param {HTMLElement} root
 */
export function initApp(root) {
  const { ratingBar, positionEl, auctionEl, handEl, evalEl, toolsEl, actionEl } = buildLayout(root);

  /** @type {Puzzle} */
  let puzzle;
  /** @type {ScoreResult | null} */
  let result = null;
  /** @type {Bid | null} */
  let playerBid = null;
  let advisorExpanded = false;

  startPuzzle();

  function startPuzzle() {
    puzzle = generatePuzzle();
    result = null;
    playerBid = null;
    render();
  }

  /** @param {Bid} bid */
  function handleBid(bid) {
    const hand = puzzle.hands[PLAYER_SEAT];
    result = scoreBid(bid, hand, puzzle.auction);
    addResult(result.points);
    puzzle.auction = addBid(puzzle.auction, bid);
    playerBid = bid;
    render();
  }

  function toggleAdvisor() {
    advisorExpanded = !advisorExpanded;
    render();
  }

  function render() {
    const hand = puzzle.hands[PLAYER_SEAT];
    const pos = seatPosition(puzzle.dealer, PLAYER_SEAT);

    renderPositionInfo(pos, puzzle.dealer, puzzle.type, positionEl);
    renderAuction(puzzle.auction, auctionEl);
    renderHand(hand, handEl);
    renderEval(evaluate(hand), evalEl);
    renderRatingBar(getRating(), ratingBar);

    const isBidding = !(result && playerBid);
    renderTools(hand, puzzle.auction, isBidding, advisorExpanded, startPuzzle, toggleAdvisor, toolsEl);

    if (!isBidding) {
      renderResult({
        playerBid: /** @type {Bid} */ (playerBid),
        points: result.points,
        recommendations: result.recommendations,
        onNext: startPuzzle,
      }, actionEl);
    } else {
      renderBidSelector(puzzle.auction, actionEl, handleBid);
    }
  }
}

/**
 * @param {HTMLElement} root
 */
function buildLayout(root) {
  root.innerHTML = '';

  const ratingBar = el('div', 'rating-bar');
  const columns = el('div', 'app-columns');
  const colInfo = el('div', 'col-info');
  const colAction = el('div', 'col-selector');

  const positionEl = el('div');
  const auctionEl = el('div');
  const handEl = el('div');
  const evalEl = el('div');
  const toolsEl = el('div');
  const actionEl = el('div');

  root.append(ratingBar, columns);
  columns.append(colInfo, colAction);
  colInfo.append(positionEl, auctionEl, handEl, evalEl, toolsEl);
  colAction.append(actionEl);

  return { ratingBar, positionEl, auctionEl, handEl, evalEl, toolsEl, actionEl };
}

/**
 * @param {import('../model/hand.js').Hand} hand
 * @param {import('../model/bid.js').Auction} auction
 * @param {boolean} isBidding
 * @param {boolean} advisorExpanded
 * @param {() => void} onNewDeal
 * @param {() => void} onToggleAdvisor
 * @param {HTMLElement} container
 */
function renderTools(hand, auction, isBidding, advisorExpanded, onNewDeal, onToggleAdvisor, container) {
  container.innerHTML = '';
  container.className = 'tools-bar';

  const btnRow = el('div', 'tools-btn-row');

  const dealBtn = document.createElement('button');
  dealBtn.className = 'tools-btn';
  dealBtn.textContent = 'New Deal';
  dealBtn.addEventListener('click', onNewDeal);
  btnRow.appendChild(dealBtn);

  if (isBidding) {
    const advisorBtn = document.createElement('button');
    advisorBtn.className = 'tools-btn tools-btn-advisor';
    advisorBtn.textContent = advisorExpanded ? 'Hide Advisor' : 'Show Advisor';
    advisorBtn.addEventListener('click', onToggleAdvisor);
    btnRow.appendChild(advisorBtn);
  }

  container.appendChild(btnRow);

  if (isBidding && advisorExpanded) {
    container.appendChild(buildAdvisorList(hand, auction));
  }
}

/**
 * @param {import('../model/hand.js').Hand} hand
 * @param {import('../model/bid.js').Auction} auction
 * @returns {HTMLElement}
 */
function buildAdvisorList(hand, auction) {
  const recs = getRecommendations(hand, auction, PLAYER_SEAT);
  const viable = recs.filter(r => r.priority >= ADVISOR_MIN_PRIORITY);
  const shown = viable.slice(0, ADVISOR_TOP_N);

  const list = el('div', 'advisor-list');
  for (const rec of shown) {
    const row = el('div', 'advisor-row');

    const bidEl = el('span', 'advisor-bid');
    bidEl.textContent = bidToString(rec.bid);
    row.appendChild(bidEl);

    const scoreEl = el('span', 'advisor-score');
    scoreEl.textContent = String(rec.priority);
    row.appendChild(scoreEl);

    const explEl = el('span', 'advisor-explanation');
    explEl.textContent = rec.explanation;
    row.appendChild(explEl);

    list.appendChild(row);
  }

  if (shown.length === 0) {
    const empty = el('div', 'advisor-empty');
    empty.textContent = 'No strong recommendations';
    list.appendChild(empty);
  }

  return list;
}

/**
 * @param {number} pos
 * @param {import('../model/deal.js').Seat} dealer
 * @param {'opening' | 'responding'} puzzleType
 * @param {HTMLElement} container
 */
function renderPositionInfo(pos, dealer, puzzleType, container) {
  container.innerHTML = '';
  container.className = 'position-info';

  const ordinal = ['', '1st', '2nd', '3rd', '4th'][pos];
  const typeLabel = puzzleType === 'responding'
    ? 'Responding'
    : `Opening (${ordinal} seat)`;
  container.textContent = `${typeLabel} \u00B7 Dealer: ${SEAT_NAMES[dealer]}`;
}

/**
 * @param {import('../scoring/rating.js').Rating} rating
 * @param {HTMLElement} container
 */
function renderRatingBar(rating, container) {
  container.innerHTML = '';
  if (rating.puzzleCount === 0) {
    container.textContent = 'No puzzles yet';
    return;
  }
  const avg = (rating.totalPoints / rating.puzzleCount).toFixed(1);
  container.textContent = `Puzzles: ${rating.puzzleCount}  \u00B7  Average: ${avg} / 10`;
}

/**
 * @param {string} tag
 * @param {string} [className]
 * @returns {HTMLElement}
 */
function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

import { addBid, bidToString, createAuction, pass, isComplete, currentSeat } from '../model/bid.js';
import { SEATS } from '../model/deal.js';
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
import { renderBreakdown } from './breakdown-display.js';
import { simulateAuction, formatSimulations } from '../testing/simulator.js';
import { factCheckBid } from '../engine/fact-check.js';

/**
 * @typedef {import('../puzzle/generator.js').Puzzle} Puzzle
 * @typedef {import('../scoring/scorer.js').ScoreResult} ScoreResult
 * @typedef {import('../model/bid.js').Bid} Bid
 */

const PLAYER_SEAT = /** @type {import('../model/deal.js').Seat} */ ('S');
const SEAT_NAMES = { N: 'North', E: 'East', S: 'South', W: 'West' };
const ADVISOR_TOP_N = 5;
const ADVISOR_MIN_SHOWN = 3;
const ADVISOR_MIN_PRIORITY = 4;

/**
 * Initialize the puzzle-loop app inside the given root element.
 * @param {HTMLElement} root
 */
export function initApp(root) {
  const { ratingBar, positionEl, auctionEl, handEl, evalEl, breakdownEl, toolsEl, testEl, actionEl } = buildLayout(root);

  /** @type {Puzzle} */
  let puzzle;
  /** @type {ScoreResult | null} */
  let result = null;
  /** @type {Bid | null} */
  let playerBid = null;
  let advisorExpanded = false;
  /** @type {string | null} */
  let testData = null;
  /** @type {import('../model/bid.js').Auction | null} */
  let completedAuction = null;
  /** @type {import('./breakdown-display.js').BidAnnotation[] | null} */
  let bidAnnotations = null;
  let showHandPostBid = false;
  let showAllHandsPostBid = false;

  startPuzzle();

  function startPuzzle() {
    puzzle = generatePuzzle();
    result = null;
    playerBid = null;
    completedAuction = null;
    bidAnnotations = null;
    showHandPostBid = false;
    showAllHandsPostBid = false;
    render();
  }

  /** @param {Bid} bid */
  function handleBid(bid) {
    const hand = puzzle.hands[PLAYER_SEAT];
    result = scoreBid(bid, hand, puzzle.auction);
    addResult(result.points);
    puzzle.auction = addBid(puzzle.auction, bid);
    playerBid = bid;

    const playerBidIdx = puzzle.auction.bids.length - 1;
    const completed = completeAndAnnotate(puzzle.hands, puzzle.auction, puzzle.dealer, playerBidIdx);
    completedAuction = completed.completedAuction;
    bidAnnotations = completed.annotations;
    render();
  }

  function toggleAdvisor() {
    advisorExpanded = !advisorExpanded;
    render();
  }

  function toggleHandPostBid() {
    showHandPostBid = !showHandPostBid;
    if (showHandPostBid) showAllHandsPostBid = false;
    render();
  }

  function toggleAllHandsPostBid() {
    showAllHandsPostBid = !showAllHandsPostBid;
    if (showAllHandsPostBid) showHandPostBid = false;
    render();
  }

  function handleGenerate1() {
    testData = formatSimulations([simulateAuction()]);
    render();
  }

  function handleGenerateTests() {
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(simulateAuction());
    }
    testData = formatSimulations(results);
    render();
  }

  async function handleCopyTests() {
    if (!testData) return;
    try {
      await navigator.clipboard.writeText(testData);
      const copyBtn = testEl.querySelector('.test-copy-btn');
      if (copyBtn) {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy Test Data'; }, 1500);
      }
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = testData;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  function render() {
    const hand = puzzle.hands[PLAYER_SEAT];
    const pos = seatPosition(puzzle.dealer, PLAYER_SEAT);
    const isBidding = !(result && playerBid);

    renderPositionInfo(pos, puzzle.dealer, puzzle.type, positionEl);
    renderRatingBar(getRating(), ratingBar);
    renderTools(hand, puzzle.auction, isBidding, advisorExpanded, startPuzzle, toggleAdvisor, toolsEl);
    renderTestPanel(testData, handleGenerate1, handleGenerateTests, handleCopyTests, testEl);

    if (isBidding) {
      renderAuction(puzzle.auction, auctionEl);
      renderHand(hand, handEl);
      renderEval(evaluate(hand), evalEl);
      breakdownEl.innerHTML = '';
      breakdownEl.className = '';
      renderBidSelector(puzzle.auction, actionEl, handleBid);
    } else {
      renderAuction(completedAuction || puzzle.auction, auctionEl);
      if (showHandPostBid) {
        renderHand(hand, handEl);
        renderEval(evaluate(hand), evalEl);
      } else {
        handEl.innerHTML = '';
        handEl.className = '';
        evalEl.innerHTML = '';
        evalEl.className = '';
      }
      renderBreakdown({
        annotations: bidAnnotations || [],
        completedAuction: completedAuction || puzzle.auction,
        playerSeat: PLAYER_SEAT,
        hands: puzzle.hands,
        handVisible: showHandPostBid,
        allHandsVisible: showAllHandsPostBid,
        onToggleHand: toggleHandPostBid,
        onToggleAllHands: toggleAllHandsPostBid,
      }, breakdownEl);
      renderResult({
        playerBid: /** @type {Bid} */ (playerBid),
        points: result.points,
        recommendations: result.recommendations,
        onNext: startPuzzle,
      }, actionEl);
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
  const breakdownEl = el('div');
  const toolsEl = el('div');
  const testEl = el('div');
  const actionEl = el('div');

  root.append(ratingBar, columns);
  columns.append(colInfo, colAction);
  colInfo.append(positionEl, auctionEl, handEl, evalEl, breakdownEl, toolsEl, testEl);
  colAction.append(actionEl);

  return { ratingBar, positionEl, auctionEl, handEl, evalEl, breakdownEl, toolsEl, testEl, actionEl };
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
  const shown = viable.length >= ADVISOR_MIN_SHOWN
    ? viable.slice(0, ADVISOR_TOP_N)
    : recs.slice(0, ADVISOR_MIN_SHOWN);

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
 * @param {'opening' | 'responding' | 'rebid' | 'competitive'} puzzleType
 * @param {HTMLElement} container
 */
function renderPositionInfo(pos, dealer, puzzleType, container) {
  container.innerHTML = '';
  container.className = 'position-info';

  const ordinal = ['', '1st', '2nd', '3rd', '4th'][pos];
  let typeLabel;
  if (puzzleType === 'responding') typeLabel = 'Responding';
  else if (puzzleType === 'rebid') typeLabel = 'Opener Rebid';
  else if (puzzleType === 'competitive') typeLabel = 'Competitive';
  else typeLabel = `Opening (${ordinal} seat)`;
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
 * Render the test-auction panel with Generate and Copy buttons.
 * @param {string | null} testData
 * @param {() => void} onGenerate1
 * @param {() => void} onGenerate10
 * @param {() => void} onCopy
 * @param {HTMLElement} container
 */
function renderTestPanel(testData, onGenerate1, onGenerate10, onCopy, container) {
  container.innerHTML = '';
  container.className = 'test-panel';

  const btnRow = el('div', 'tools-btn-row');

  const gen1Btn = document.createElement('button');
  gen1Btn.className = 'tools-btn test-gen-btn';
  gen1Btn.textContent = '1 Test Deal';
  gen1Btn.addEventListener('click', onGenerate1);
  btnRow.appendChild(gen1Btn);

  const gen10Btn = document.createElement('button');
  gen10Btn.className = 'tools-btn test-gen-btn';
  gen10Btn.textContent = '10 Test Deals';
  gen10Btn.addEventListener('click', onGenerate10);
  btnRow.appendChild(gen10Btn);

  if (testData) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'tools-btn test-copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', onCopy);
    btnRow.appendChild(copyBtn);

    const charCount = el('span', 'test-info');
    const lines = testData.split('\n').length;
    charCount.textContent = `${lines} lines`;
    btnRow.appendChild(charCount);
  }

  container.appendChild(btnRow);
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

// ═════════════════════════════════════════════════════════════════════
// AUCTION COMPLETION & ANNOTATION
// ═════════════════════════════════════════════════════════════════════

const MAX_COMPLETION_BIDS = 60;

/** @type {Record<import('../model/deal.js').Seat, import('../model/deal.js').Seat>} */
const PARTNER = { N: 'S', S: 'N', E: 'W', W: 'E' };

/**
 * Complete the auction from the current state and annotate every bid
 * (pre-player, player's, and engine-completed) with explanations.
 *
 * @param {import('../model/deal.js').Deal} hands
 * @param {import('../model/bid.js').Auction} auctionSoFar
 * @param {import('../model/deal.js').Seat} dealer
 * @param {number} playerBidIndex
 * @returns {{
 *   completedAuction: import('../model/bid.js').Auction,
 *   annotations: import('./breakdown-display.js').BidAnnotation[],
 * }}
 */
function completeAndAnnotate(hands, auctionSoFar, dealer, playerBidIndex) {
  /** @type {import('./breakdown-display.js').BidAnnotation[]} */
  const annotations = [];
  const dealerIdx = SEATS.indexOf(dealer);

  let replay = createAuction(dealer);
  for (let i = 0; i < auctionSoFar.bids.length; i++) {
    const seat = SEATS[(dealerIdx + i) % SEATS.length];
    const bid = auctionSoFar.bids[i];
    let explanation = '';

    let priority = 0;
    try {
      const recs = getRecommendations(hands[seat], replay, seat);
      const matched = recs.find(r => bidMatches(r.bid, bid));
      explanation = matched ? matched.explanation : '';
      priority = matched ? matched.priority : 0;
    } catch (_) { /* engine error — leave blank */ }

    const fc = priority >= 0 ? factCheckBid(hands[seat], hands[PARTNER[seat]], bid, explanation) : null;
    annotations.push({ seat, bid, explanation, isPlayer: i === playerBidIndex, factCheck: fc });
    replay = addBid(replay, bid);
  }

  let current = auctionSoFar;
  while (!isComplete(current) && current.bids.length < MAX_COMPLETION_BIDS) {
    const seat = currentSeat(current);

    let recs;
    try {
      recs = getRecommendations(hands[seat], current, seat);
    } catch (_) {
      recs = [];
    }

    const chosen = recs.length > 0
      ? recs[0]
      : { bid: pass(), priority: 0, explanation: 'No recommendations' };

    const fc = chosen.priority >= 0
      ? factCheckBid(hands[seat], hands[PARTNER[seat]], chosen.bid, chosen.explanation)
      : null;
    annotations.push({
      seat,
      bid: chosen.bid,
      explanation: chosen.explanation,
      isPlayer: false,
      factCheck: fc,
    });

    try {
      current = addBid(current, chosen.bid);
    } catch (_) {
      current = addBid(current, pass());
    }
  }

  return { completedAuction: current, annotations };
}

/**
 * @param {import('../model/bid.js').Bid} a
 * @param {import('../model/bid.js').Bid} b
 * @returns {boolean}
 */
function bidMatches(a, b) {
  if (a.type !== b.type) return false;
  if (a.type === 'contract' && b.type === 'contract') {
    return a.level === b.level && a.strain === b.strain;
  }
  return true;
}

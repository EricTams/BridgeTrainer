# Bridge Bidding Trainer -- Implementation TODO

Each step is implemented one at a time. User tests and approves before proceeding.

## Responsive Design

All UI must work on both desktop (mouse, large screen) and mobile/phone (touch, narrow screen):

- Viewport meta tag in `index.html`
- Fluid sizing and vertical stacking on narrow viewports
- Bid selector buttons must be large enough for touch targets on a phone
- Hand display must be readable without horizontal scrolling on small screens
- Auction table must stay legible on narrow screens
- Use media queries where needed to adapt layout

This applies across Steps 1, 2, 4, and 5 (and any later UI work).

## Player Seat

The player is always South. North is always partner; East and West are always opponents.

- The dealt hand shown is South's hand
- The auction table highlights the South column as the player
- Dealer is randomly selected each puzzle; South may be 1st–4th seat
- Advisor/engine logic evaluates from South's perspective

This applies across all steps.

---

## Step 1: Project Scaffold

- [x] Create `docs/tech-stack.md` (plain JS ES modules, JSDoc types, HTML/CSS, GitHub Pages)
- [x] Create `jsconfig.json` for editor IntelliSense / type checking
- [x] Create `.gitignore`
- [x] Create minimal `index.html` (with viewport meta tag), `styles.css`, `main.js` that loads in the browser

**Files:** `docs/tech-stack.md`, `jsconfig.json`, `.gitignore`, `index.html`, `styles.css`, `main.js`

---

## Step 2: Card/Hand Model + Deal Generator

- [x] `src/model/card.js` -- Suit, Rank, Card representations
- [x] `src/model/hand.js` -- Hand with sorting and suit-grouping helpers
- [x] `src/model/deal.js` -- Fisher-Yates shuffle, deal 4 hands of 13
- [x] `src/ui/hand-display.js` -- Render a hand on the page (grouped by suit, Unicode suit symbols, red/black coloring)
- [x] Wire into `main.js` so the page shows a randomly dealt hand

**Files:** `src/model/card.js`, `src/model/hand.js`, `src/model/deal.js`, `src/ui/hand-display.js`, `main.js`

---

## Step 3: Hand Evaluation

- [x] `src/engine/evaluate.js` -- HCP (A=4, K=3, Q=2, J=1), distribution points (short-suit and long-suit), hand shape classification (balanced / semi-balanced / unbalanced)
- [x] Display evaluation alongside the dealt hand

**Files:** `src/engine/evaluate.js`, update UI

---

## Step 4: Bid Model + Auction Display

- [x] `src/model/bid.js` -- Bid type (level + strain, pass, double, redouble), Auction (ordered list of bids with seat tracking, legal bid validation)
- [x] `src/ui/auction-display.js` -- 4-column table (West / North / East / South)
- [x] Render a mock auction on the page

**Files:** `src/model/bid.js`, `src/ui/auction-display.js`

---

## Step 5: Bid Selector UI

- [x] `src/ui/bid-selector.js` -- Grid of clickable buttons: 7 rows (levels) x 5 columns (C/D/H/S/NT), plus Pass / Double / Redouble
- [x] Gray out illegal bids based on auction state
- [x] Wire up so clicking a bid registers the selection

**Files:** `src/ui/bid-selector.js`

---

## Step 6: Opening Bid Rules

- [x] `src/engine/opening.js` -- All SAYC opening bid rules:
  - 1 of a suit (13-21 HCP, 5+ major / 3+ minor, longest suit, etc.)
  - 1NT (15-17 HCP, balanced)
  - 2C (22+ HCP, strong artificial forcing)
  - Weak twos (2D/2H/2S: 5-11 HCP, 6-card suit)
  - 2NT (20-21 HCP, balanced)
  - Preempts (3-level+: 7+ card suit, weak)
- [x] `src/engine/context.js` -- Classify where we are in the auction (opening / responding / rebid / competitive)
- [x] `src/engine/advisor.js` -- Entry point: hand + auction -> ranked BidRecommendation[] (bid, priority, explanation)

**Files:** `src/engine/opening.js`, `src/engine/context.js`, `src/engine/advisor.js`

---

## Step 7: End-to-End Opening Puzzle Loop

- [x] `src/puzzle/generator.js` -- Generate opening-bid-only puzzles (deal a hand, dealer is randomly selected so player may be 1st–4th seat, all seats before South pass)
- [x] `src/scoring/scorer.js` -- Compare user's bid against ranked recommendations, award points (10 / 7 / 4 / 2 / 0), ties in priority treated as equally good
- [x] `src/scoring/rating.js` -- Track cumulative rating in localStorage
- [x] `src/ui/result-display.js` -- Show score, recommended bid(s) with explanations, "Next Puzzle" button
- [x] `src/ui/app.js` -- Wire the full loop: deal -> display hand -> user bids -> score -> show result -> next puzzle

**First fully playable version.**

**Files:** `src/puzzle/generator.js`, `src/scoring/scorer.js`, `src/scoring/rating.js`, `src/ui/result-display.js`, `src/ui/app.js`, `main.js`

---

## Step 8: Responses to 1-of-a-Suit

- [x] `src/engine/responding.js` (partial) -- Responses when partner opens 1C/1D/1H/1S:
  - New suit at 1-level (6+ HCP, 4+ cards)
  - New suit at 2-level (10+ HCP, 4+ cards)
  - Single raise (6-10, 3+ support)
  - Limit raise (10-12, 4+ support)
  - 1NT response (6-10, no fit, no new suit at 1-level)
  - Jump to 2NT (13-15, balanced, no major fit)
  - Jump shift (19+, strong)
- [x] Update puzzle generator to simulate partner's opening and ask user to respond

**Files:** `src/engine/responding.js`, `src/puzzle/generator.js`

---

## Step 9: Responses to 1NT

- [x] Extend `src/engine/responding.js` -- Responses to partner's 1NT:
  - Stayman (2C: asks for 4-card major)
  - Jacoby Transfer (2D -> hearts, 2H -> spades)
  - Direct raise to 2NT (invitational, 8-9 HCP)
  - Direct raise to 3NT (10-15 HCP)
  - Slam invitations (4NT quantitative, transfers then rebid)

**Files:** `src/engine/responding.js`

---

## Step 10: Opener Rebids

- [x] `src/engine/rebid.js` -- Opener's second bid after hearing responder:
  - Minimum (13-15) vs invitational (16-18) vs game-forcing (19+) rebids
  - Rebid own suit, raise partner, new suit, NT rebids
  - After Stayman: show major or deny
  - After Jacoby Transfer: complete the transfer, super-accept

**Files:** `src/engine/rebid.js`

---

## Step 11: Responses to 2C and Weak Twos

- [ ] Extend `src/engine/responding.js`:
  - 2C opening: 2D waiting/negative, positive responses (suit or 2NT)
  - Weak two openings: raise (preemptive), 2NT feature ask, new suit forcing

**Files:** `src/engine/responding.js`

---

## Step 12: Competitive Bidding

- [ ] `src/engine/competitive.js`:
  - Overcalls (1-level and 2-level: suit quality + HCP)
  - Takeout doubles (shortness in opponent's suit, support for unbid suits, 12+ HCP)
  - Advancing partner's takeout double (minimum / invitational / game-forcing)
  - Advancing partner's overcall
  - Negative doubles by responder
  - Balancing (reopening in passout seat with lighter values)

**Files:** `src/engine/competitive.js`

---

## Step 13: Slam Conventions

- [ ] `src/engine/conventions.js`:
  - Blackwood (4NT: asks for aces; responses 5C/5D/5H/5S)
  - Gerber (4C over NT: asks for aces)
  - King-ask follow-ups (5NT after Blackwood)
  - Cue bidding (first/second-round controls)
  - Slam decision logic (when to use Blackwood vs cue bids, when to stop at 5)

**Files:** `src/engine/conventions.js`

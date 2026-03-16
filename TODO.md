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

- [x] Extend `src/engine/responding.js`:
  - 2C opening: 2D waiting/negative, positive responses (suit or 2NT)
  - Weak two openings: raise (preemptive), 2NT feature ask, new suit forcing

**Files:** `src/engine/responding.js`

---

## Step 12: Competitive Bidding

- [x] `src/engine/competitive.js`:
  - Overcalls (1-level and 2-level: suit quality + HCP)
  - Takeout doubles (shortness in opponent's suit, support for unbid suits, 12+ HCP)
  - Advancing partner's takeout double (minimum / invitational / game-forcing)
  - Advancing partner's overcall
  - Negative doubles by responder
  - Balancing (reopening in passout seat with lighter values)

**Files:** `src/engine/competitive.js`

---

## Step 13: Slam Conventions

- [x] `src/engine/conventions.js`:
  - Blackwood (4NT: asks for aces; responses 5C/5D/5H/5S)
  - Gerber (4C over NT: asks for aces)
  - King-ask follow-ups (5NT after Blackwood)
  - Cue bidding (first/second-round controls)
  - Slam decision logic (when to use Blackwood vs cue bids, when to stop at 5)

**Files:** `src/engine/conventions.js`

---

## Step 14: Pool-Based Puzzle Selection

Replace the current deal-then-check generator with a pool-and-select approach
that biases toward tricky/rare scenarios (see `docs/puzzle-scenarios.md` for
the full scenario catalog).

**Design:** Option B -- each deal is tagged with *all* scenario IDs it supports,
so a single deal can appear in multiple buckets and be presented in different
auction framings.

- [x] `src/puzzle/classify.js` -- Given a deal and its four evaluations, tag
  the deal with every scenario ID it qualifies for (O-1 through X-3). Uses
  the engine's existing recommendation functions to determine what each seat
  would bid, then checks the scenario criteria from the catalog.
- [x] `src/puzzle/pool.js` -- Pool manager:
  - `buildPool(size)` -- deal `size` hands (default 10,000), evaluate all
    four hands, run `classify()` on each, store deals in a Map keyed by
    scenario ID (each deal may appear under multiple IDs)
  - `selectDeal(scenarioId)` -- pick a random deal from the given bucket,
    remove it from the pool (consumed)
  - `refill(threshold)` -- if any bucket drops below `threshold` deals,
    generate a fresh batch to top it up
  - Pool is built lazily on first puzzle request; refills run during idle time
- [x] `src/puzzle/weights.js` -- Balance-factor weighted selection:
  - `balanceFactor` (0–1) controls the distribution of puzzle scenarios:
    - **0** = natural distribution (scenarios appear at their real-world
      frequency -- common situations dominate, rare ones almost never show)
    - **1** = uniform distribution (every scenario is equally likely,
      regardless of how rare it is in random deals)
    - **0–1** = linear interpolation between the two:
      `weight(s) = natural(s) * (1 - balanceFactor) + uniform * balanceFactor`
      where `natural(s) = bucketSize(s) / totalClassifiedDeals` and
      `uniform = 1 / scenarioCount`
  - `naturalFrequencies` are measured from the pool after classification
    (count of deals per bucket / total deals), so they reflect real
    probabilities -- no manual tuning needed
  - `pickScenario(pool, balanceFactor)` -- weighted random selection across
    all scenario IDs that have deals available in the pool, using the
    interpolated weights
  - The balance factor could later be exposed as a user-facing slider
    ("Training Intensity" or similar) in the UI
- [x] Update `src/puzzle/generator.js` -- Replace `generatePuzzle()` to:
  1. Call `pickScenario()` to choose a scenario
  2. Call `selectDeal(scenarioId)` to get a qualifying deal from the pool
  3. Build the partial auction for that deal + scenario (reuse existing
     auction-building logic from the current `try*Deal()` functions)
  4. Return the same `Puzzle` shape (`hands`, `auction`, `dealer`, `type`)
  5. Trigger `refill()` in the background if pool is getting low

**Files:** `src/puzzle/classify.js`, `src/puzzle/pool.js`, `src/puzzle/weights.js`, `src/puzzle/generator.js`

---

## Step 15: Responder's Rebid

The current `rebid.js` only handles **opener's** rebid (after hearing a response).
When the responder takes a second bid, the engine falls through to
`scoreGenericRebid` which applies impossibly high HCP thresholds, effectively
forcing a pass on every hand. This step adds the responder's-rebid decision
tree — a standard SAYC stage.

- [x] Add responder-rebid logic (in `src/engine/rebid.js` or a new file):
  - **After opener rebids own suit** (e.g. 1♥ – 1♠ – 2♥):
    - Pass with minimum (6-9) and no fit
    - Preference (return to opener's first suit at cheapest level)
    - Raise opener's rebid suit with 3+ support and invitational values (10-12)
    - Bid 2NT invitational (10-12, balanced, stoppers)
    - New suit (forcing, 10+)
    - Jump to game with 13+
  - **After opener raises responder's suit** (e.g. 1♥ – 1♠ – 2♠):
    - Pass with minimum
    - Bid 3 of the suit (invitational, 10-12)
    - Bid 4 of a major (game, 13+)
  - **After opener bids NT** (e.g. 1♥ – 1♠ – 1NT):
    - Pass, invite with 2NT, bid game with 3NT
    - New suit (non-forcing with minimum, forcing with invitational+)
  - **After opener shows a new suit** (e.g. 1♦ – 1♠ – 2♣):
    - Preference back to opener's first suit
    - Raise new suit, bid NT, or introduce own suit
    - Fourth-suit forcing (artificial, game-forcing)
  - **After opener reverses** (e.g. 1♦ – 1♠ – 2♥):
    - Opener showed 17+, so all bids below game are forcing
    - Cheapest rebid = waiting/minimum
- [x] Update `scoreRebid` dispatcher in `rebid.js` to detect when the player
  is the responder (not the opener) and route to the new logic
- [x] Handle the case where responder's first bid was competitive (overcall,
  free bid, advance of partner's double) — adjust thresholds for the
  information already conveyed by bidding freely at a higher level

**Files:** `src/engine/rebid.js` (or new `src/engine/responder-rebid.js`), `src/engine/context.js`

---

## Step 16: Competitive Reentry

When a partnership has established a direction (both partners have bid) and
opponents then outbid them, neither partner currently has logic to compete
further — the rebid module's `scoreGenericRebid` fallback makes any new bid
nearly impossible. This step adds the "fight for the contract" decision layer.

- [x] Add competitive-reentry logic (new `src/engine/contest.js` or extend
  `competitive.js`):
  - **Law of Total Tricks**: with an N-card fit, compete to the N-trick level
    (e.g. 9-card heart fit → safe to bid 3♥; 10-card → 4♥)
  - **Combined strength estimation**: use partner's known range (from their
    bid) plus own hand to estimate combined points and decide game/partscore
  - **"Don't sell out" principle**: with game-level values and a known fit,
    don't let opponents steal the contract
  - **Penalty double option**: when short in own fit but holding trump tricks
    in opponents' suit, double for penalty instead of bidding on
  - **"5-level belongs to the opponents"**: be cautious about bidding at the
    5-level to compete — prefer doubling
  - **Reopening doubles**: when opponents bid over partner, a double shows
    extra values and invites partner to decide (bid on or convert to penalty)
- [x] Update routing in `advisor.js`: in the `'rebid'` phase, detect when
  opponents have bid *above* the partnership's last contract bid and route
  to the contest module (either instead of, or merged with, standard rebid)
- [x] Add context helpers as needed (e.g. `findPartnershipFit`,
  `estimatePartnerRange`, `lastPartnershipBid`)

**Files:** `src/engine/contest.js` (or extend `src/engine/competitive.js`), `src/engine/advisor.js`, `src/engine/context.js`

---

## Step 17: Third-Round / Continuation Bidding

When either opener or responder has already bid twice (`ownBidCount >= 2`),
the engine currently falls into `getContinuationBids` — a bare-bones scorer
that gives Pass a perfect score of 10 and penalizes every continuation bid
with generic HCP thresholds unrelated to the auction context. This causes
the engine to pass forcing bids (e.g. partner's new suit at the 3-level)
and stop well short of game or slam contracts the combined hands can support.

This step replaces the placeholder `getContinuationBids` with a context-aware
third-round decision module.

- [x] **Detect forcing sequences**: when partner bids a new suit (especially
  at the 3-level+), that bid is forcing — Pass must receive a heavy penalty
  rather than a perfect score
- [x] **Estimate combined strength**: after two rounds of bidding, both
  partners have shown a range. Use partner's known range + own hand to
  decide partscore / game / slam direction
- [x] **Preference bids**: with support for partner's last suit, give
  preference (return to that suit at the cheapest level). With extras, jump
  or cue-bid
- [x] **Game decisions**: with game-going values, bid game directly (3NT,
  4M, 5m). With invitational values, make a game try. With minimum, sign off
- [x] **Slam continuation**: when combined strength suggests slam, continue
  slam exploration (Blackwood, cue bids) rather than stopping at game
- [x] **Pass only when appropriate**: Pass should only score well when the
  auction is at a reasonable resting place (partner's last bid was
  non-forcing, combined strength is partscore level, or the partnership
  has already reached game)
- [x] Update routing in `advisor.js`: replace the `ownBidCount >= 2` →
  `getContinuationBids` shortcut with the new context-aware module

**Files:** `src/engine/rebid.js` (replace `getContinuationBids`), `src/engine/advisor.js`, `src/engine/context.js`

---

## Step 18: Competitive Bidding Refinements (from Auction Testing)

Running full auctions via `run-game.mjs` surfaced two areas where the engine
misbehaves in competitive / high-level situations. Both are in completed
modules but need targeted fixes.

### 18a: Overcall scoring must scale with bid level

`scoreSuitOvercall` in `competitive.js` uses the same HCP range and suit
length requirement for all non-1-level overcalls. A 4-level overcall with
a 4-card suit gets only a 3-point penalty — nearly as good as a textbook
2-level overcall. The engine will happily overcall at the 4- or 5-level
on inadequate hands.

- [x] Scale HCP requirements by level (e.g. 3-level needs 12+, 4-level
  needs 14+ or a very long suit)
- [x] Scale suit length requirements by level (e.g. 4-level overcall
  should need 6+ or even 7+ cards, not just 5)
- [x] Increase the length-short penalty multiplier at higher levels
  (being 1 card short at the 4-level is far worse than at the 2-level)

### 18b: Contest module must value penalty doubles over established game

When the partnership has already reached game (e.g. 3NT) and opponents
steal with a competitive bid, the contest module gives Pass a score of 7
while Double gets only 4.5. The engine meekly passes instead of doubling
opponents who just bid 4♥ on 14 combined HCP over our 3NT.

- [x] Detect when the partnership had already reached game before the
  opponent's competitive bid — this is a qualitatively different situation
  from being outbid at the partscore level
- [x] Increase `DONT_SELL_OUT_COST` or add a separate, heavier penalty
  for passing when game was already established
- [x] Boost penalty double scoring when the partnership has game-level
  strength and opponents are at a low-level contract (they're likely going
  down)
- [x] Consider context: if we bid 3NT and they bid 4♥ on thin values,
  double should be strongly preferred over pass or 5-level bids

**Files:** `src/engine/competitive.js`, `src/engine/contest.js`

### 18c: Additional fixes from auction testing

- [x] Fix illegal double recommendations: candidate generators in
  `contest.js` and `competitive.js` always included `dbl()` without
  checking `isLegalBid`, causing illegal doubles after partner already
  doubled
- [x] Fix `scoreRR_afterNT` in `rebid.js`: missing `isGameLevel` guard
  caused the engine to bid past 3NT (penalized pass for "not bidding
  game" when game was already reached)
- [x] Fix continuation-level overbids: `contScoreAboveGame`,
  `contScoreFitBid`, `contScoreRebidOwn`, `contScoreNT`, and
  `contScorePreference` applied fixed or no penalties for bids above
  game, causing 7NT on 22 HCP. All now scale penalties with
  `(level - gameLevel) * CONT_ABOVE_GAME_COST`

**Files:** `src/engine/rebid.js`, `src/engine/contest.js`, `src/engine/competitive.js`

---

## Step 19: Underbid & Wrong-Side Auction Failures

After fixing overbids (Step 18), running `node run-game.mjs 20` shows ~50%
"Good" results. The remaining failures fall into two categories:

### 19a: Underbids — stopping at partscore with game/slam values

The engine frequently stops at the 2- or 3-level when combined strength
justifies game or slam. Common patterns:

- **1NT stays at 1NT** with 26+ combined pts (responder doesn't raise)
- **Suit auction dies at 3-level** with 8+ card major fit and 26+ pts
  (nobody bids 4M)
- **Minor game missed** — combined 28+ pts but auction stops at 3♦/4♣
  instead of reaching 5m or pivoting to 3NT

Root causes:
- `contEstimatePartnerRange` returns too wide or too low a range, so
  `combinedMid` falls below the game threshold even when actual combined
  strength is game-level
- The continuation module's game-try logic is too conservative — it
  requires near-certainty of game values before penalizing Pass
- After competitive interference, the engine loses track of combined
  strength and defaults to safe partscores

Tasks:
- [x] Audit `contEstimatePartnerRange` accuracy: run 50+ deals, compare
  the estimated range to actual partner HCP, and tighten the estimates
  where they're consistently too wide
- [x] Strengthen game-try penalties in `contScorePass` — when combined
  strength is invitational (23-25), Pass at the 2-level should be
  penalized more than it currently is
- [x] Add "we opened and partner responded" awareness — if both partners
  have shown values, the combined floor is higher than the continuation
  module currently assumes
- [x] Ensure the continuation module's fit detection works after
  competitive interference (opponent bids between partnership bids can
  confuse the fit-finding logic)

### 19b: Wrong-side results — weaker side wins the auction

The side with fewer combined points ends up declaring. Common patterns:

- **Weak side overcalls and the strong side stops competing** — the
  continuation/contest module passes when it should push to game
- **Competitive bidding steals the contract** — aggressive overcalls from
  the weak side aren't doubled for penalty, and the strong side doesn't
  re-enter
- **One partner passes a forcing or invitational sequence** — the
  continuation module's `contDetectForcing` misses some forcing contexts,
  letting the bidder pass prematurely

Tasks:
- [x] Improve `contDetectForcing` — after opener bids a new suit at the
  3-level, or responder introduces a new suit, the sequence is forcing;
  currently some of these go undetected
- [x] In the contest module, when opponents outbid at the 3- or 4-level
  and the partnership has game-going values, bias toward doubling or
  bidding game rather than passing
- [x] When the continuation module estimates combined game values (25+)
  and there's a known fit, increase the penalty for stopping below game
  regardless of who opened
- [x] Consider adding a "sanity check" layer: before finalizing a Pass,
  if the partnership has exchanged positive bids (opening + response or
  better), verify that the final contract level is consistent with the
  minimum combined range

**Files:** `src/engine/rebid.js` (`getContinuationBids`, `contEstimatePartnerRange`, `contDetectForcing`), `src/engine/contest.js`, `src/engine/context.js`

---

## Step 20: Wrong-Side Auction Failures (from 1000-Deal Audit)

Running a 1000-deal audit (`run-audit.mjs`) shows ~17-18% of auctions result
in the weaker side declaring — the partnership with fewer combined points wins
the contract. Three root causes account for nearly all of these.

### 20a: Cue bids in opponent's suit treated as natural

When a player bids the opponents' suit (a cue bid showing strength, not a
desire to play that suit), the engine's fit-detection and response logic
treats it as a natural bid. Partner then passes (thinking the auction found a
home), doubles for penalty, or gives preference to the "suit" — all wrong.

**Example:** East opens 1♦, South overcalls 1♠, West makes a negative double,
East bids 2♠ (cue bid, game-forcing). West sees "partner bid spades" and
passes. EW play 2♠ instead of reaching 4♥ with their 9-card fit.

The `resolvePartnerBid` function in `rebid.js` already handles this for the
opener's rebid path, but it doesn't apply to:
- The responding phase (when partner's latest bid is a cue bid)
- The continuation module (`getContinuationBids`)
- The post-double rebid path (`getPostDoubleBids`)
- The contest module (`getContestBids`)

Step 19 added opponent-suit filtering to `contFindFit`, `contPartnerSuits`,
and `analyzeFit`, which prevents cue bids from being confused with real fits.
But the partner-response side remains unfixed — the player facing a cue bid
doesn't know to treat it as forcing.

Tasks:
- [ ] When partner bids a strain that matches a known opponent strain, detect
  it as a cue bid in the `classifyAuction` / advisor routing layer. This bid
  is always forcing — the responder must not pass
- [ ] In `getPostDoubleBids`: check partner's *latest* bid (not just their
  first bid via `findPartnerBid`). If partner made a second bid that's a
  cue bid, the doubler must rebid — penalize pass heavily
- [ ] In `getContinuationBids` / `contDetectForcing`: if partner's last bid
  is in the opponents' suit, mark the sequence as forcing (cue bids always
  demand a response)
- [ ] In `getCompetitiveResponseBids`: when partner opened and then cue-bid
  the opponents' suit on their rebid, treat this as a game force — responder
  should not pass below game

### 20b: "No recommendations" defaults to Pass for the strong side

The engine produces zero recommendations 30-60 times per 1000 deals
(0 returned from `getRecommendations`). The simulator defaults to Pass, which
is catastrophic when the strong side is the one with no recommendations.

Common situations where this happens:
- **Responding to 2NT opening**: the engine has no response logic for 2NT
  openings (only 1NT and 2♣ are handled). Responder always passes 2NT
- **Responding to partner's preempt at the 4-level+**: the engine handles
  responses to weak twos and 3-level preempts but not higher
- **Unusual auction shapes**: when the auction reaches a state that no module
  recognizes, all modules return empty arrays

Tasks:
- [ ] Add basic response logic for 2NT openings in `responding.js`:
  Stayman (3♣), Jacoby transfers (3♦→♥, 3♥→♠), raise to 3NT (4-10 HCP),
  raise to 4NT/6NT with slam values, Pass with 0-3 HCP
- [ ] Add basic response logic for partner's 3-level preempt: raise with
  support and an outside ace, bid 3NT with stoppers and 16+, pass otherwise
- [ ] Add a safety-net fallback in `getRecommendations`: when the phase-based
  module returns an empty array, generate a minimal set of reasonable bids
  (pass, cheapest bid in longest suit, cheapest NT) scored conservatively,
  rather than returning nothing

### 20c: Strong side stops competing after opponent interference

When the weaker side makes aggressive competitive bids (overcalls, raises,
preemptive jumps), the stronger side often stops competing too early. The
engine's post-interference logic doesn't push hard enough when the hand's own
strength is well above average.

**Example:** NS has 33 combined pts. South has 22 HCP and 7 diamonds. After
North opens 1♣ and opponents compete to 4♣, North doubles for penalty. South
(22 HCP, 7 diamonds) passes the penalty double instead of pulling to 5♦ — the
engine doesn't recognize that sitting a penalty double with a huge one-suited
hand is wrong.

**Example:** EW has 29 pts with a 9-card heart fit. West doubles South's
1NT for penalty. East (4 HCP) passes the penalty double, then when South
escapes to 2♣ and West doubles again, East still doesn't bid. EW never find
their heart fit.

Tasks:
- [ ] In `scoreContestPass` (contest.js): when own HCP is 17+ and the
  partnership has a known fit, apply a much stronger "don't sell out" penalty
  — a hand this strong should almost never allow opponents to play undoubled
- [ ] In `scorePostDblPass` (competitive.js): when the doubler has a long
  suit (6+) that hasn't been bid by anyone, penalize pass to encourage pulling
  the penalty double to their own suit. A penalty double with a running
  7-card suit is a misbid — the hand should declare, not defend
- [ ] In `scoreAdvDblPass` (competitive.js): when partner made a *penalty*
  double (not takeout) and the opponent has escaped to a new suit, advancer
  should consider bidding with any suit length ≥5 instead of sitting —
  partner's penalty double was of the original contract, not this new one
- [ ] In `scoreAdvancePenaltyDblCandidates`: after partner's penalty double
  of 1NT and opponent escapes to a suit, consider doubling the escape suit
  with 4+ cards and 8+ HCP, or bidding a 5+ card suit with 8+ HCP, rather
  than always passing

**Files:** `src/engine/competitive.js`, `src/engine/contest.js`, `src/engine/rebid.js`, `src/engine/responding.js`, `src/engine/advisor.js`

---

## Audit: Investigate 0-Blocked-Bid Interference Deals

The audit's counterfactual interference analysis reveals ~26/1000 deals tagged
INTERFERENCE where the stronger side had **0 blocked bids** — meaning the
engine would have made the exact same bids even without the opponents'
interference, yet the result was still wrong. These are real engine bugs
masquerading as competitive-bidding problems.

Tasks:
- [x] Add a flag to `run-audit.mjs` (e.g. `--show-unblocked`) that prints
  the full `formatAuditReport` for INTERFERENCE deals with 0 blocked bids
  instead of the normal problem deals — these are the most actionable
- [x] Review the sample deals to categorize the common failure patterns
- [x] Fix the identified patterns in the bidding engine

### Identified failure patterns and fixes

**A. Cue-bid not recognized after takeout double** (Deals 4, 13, 20, 26)
After partner makes a takeout double and advancer cue-bids the opponent's
suit (showing strength), the doubler's rebid path failed to recognize the
cue-bid because `partnerCueBid` detection required `partnerLast` to differ
from `partnerBid` — which is never true when the cue-bid is partner's first
and only bid. **Fix:** Simplified `partnerCueBid` in `competitive.js` to
detect any bid in an opponent's suit, regardless of bid history.

**B. Strong hand (17+ HCP) sells out in continuation** (Deals 3, 14)
When the continuation module estimated combined strength, hands with 17+
HCP would pass at low levels because partner hadn't made a contract bid
(only responded or advanced), making `combinedMid` fall below game
thresholds. **Fix:** Added an explicit penalty in `contScorePass`
(`rebid.js`) for passing with 17+ HCP at the 3-level or below, scaling
with HCP above 16.

**C. Post-double pass with long suit doesn't pull** (Deals 8, 17)
After making a takeout double, a hand with a 6+ card unbid suit would pass
partner's response instead of pulling to their own suit. The penalty for
having a long suit was only `(len-5)*3` = 3 for a 6-card suit. **Fix:**
Increased base penalty to `(len-5)*4` and added an extra penalty (+3) when
the doubler has 0-1 cards in partner's suit (poor fit), encouraging the
pull to the long suit.

**Files:** `run-audit.mjs`, `src/engine/audit.js`, `src/engine/competitive.js`, `src/engine/rebid.js`

---

## Audit Fix: Forcing-After-Double & Responding Shape Adjustments

100-deal spot-check audit identified several engine bugs. Quick fixes applied
in-place; remaining larger issues deferred to their own steps below.

### Fixed (quick fixes)

**A. Runaway bidding spiral — doubles relieve forcing obligations**
When an opponent (or partner) doubled during a forcing sequence, the engine
still treated Pass as illegal (FORCING_PASS_COST = 15), causing the losing
side to keep bidding up the line (5♣→5♦→5♥→5♠→5NT→...). In standard bridge,
a double relieves forcing obligations — the partnership can pass for penalty.

- [x] `contest.js` `detectContestForcing()`: return false when any double
  occurs after partner's last contract bid
- [x] `rebid.js` `contDetectForcing()`: same fix, plus restructured so the
  cue-bid early-return (`oppSuits.has(partnerLast.strain)`) runs *after* the
  double-relief check, not before
- [x] `advisor.js` cue-bid overlay (responding phase): guard with
  `hasDoubleAfterPartnerBid()` so the forcing penalty doesn't apply after
  an intervening double
- [x] `context.js`: added `hasDoubleAfterPartnerBid()` shared utility

**B. 1NT responder passes with Stayman-eligible shape (7 HCP + singleton)**
A hand with 7 HCP, singleton, and two 4-card majors would pass partner's
1NT because STAYMAN_MIN_HCP = 8. In SAYC, distributional values compensate.

- [x] `responding.js` `scoreStayman()`: treat hands with singleton/void as
  effectively 1 HCP stronger for the Stayman threshold check
- [x] `responding.js` `scoreNTPass()`: penalize pass when hand has
  singleton/void + 4-card major + 7+ HCP (should explore with Stayman)

**C. 1NT tiebreak: 1NT response chosen over 2-level new suit with singleton
in partner's suit**
With 10 HCP, singleton in partner's suit, and a 5-card side suit, the engine
gave 1NT and 2♦ (new suit forcing) equal priority, defaulting to 1NT.

- [x] `responding.js` `scoreResp1NT()`: penalize 1NT when responder has
  singleton in partner's suit + biddable 5-card suit at the 2-level + 10+
  HCP
- [x] Added `hasSuitAt2()` helper (complement to existing `hasSuitAt1()`)

**Files:** `src/engine/contest.js`, `src/engine/rebid.js`, `src/engine/advisor.js`, `src/engine/context.js`, `src/engine/responding.js`

---

## Step 21: Transfer Context Tracking After Competitive Disruption

When partner makes a Jacoby Transfer over 1NT (e.g. 2♦ showing hearts) and
opponents interfere, the engine already handles the *immediate* response
correctly via `scoreAfterTransferWithInterference`. But when the auction
continues further into a competitive phase (multiple rounds of bidding after
the transfer), the engine still treats the opener's next bid as a transfer
completion — applying "Must complete transfer to ♠" penalties even when the
transfer context was abandoned rounds ago.

**Root cause:** `score1NTRebid` in `rebid.js` uses partner's *original* bid
(the transfer) to determine the scoring function for *all* subsequent rebids,
regardless of how many rounds have elapsed. After competitive bidding disrupts
the transfer, the opener should exit the transfer context and use normal
continuation logic instead.

Tasks:
- [x] Detect when the transfer sequence has been disrupted: if opponents made
  a contract bid after the transfer bid AND opener didn't immediately complete
  the transfer on their first rebid, the transfer context is dead
- [x] When transfer context is dead, route to `getContinuationBids` or
  `getContestBids` instead of `score1NTRebid`
- [x] Ensure the transition preserves knowledge of opener's 1NT range (15-17
  HCP balanced) even when leaving the transfer path
- [x] Add test cases: transfer disrupted at 2-level, 3-level, and 4-level
  interference to verify correct context switching

**Files:** `src/engine/rebid.js`, `src/engine/advisor.js`, `src/engine/context.js`

---

## Step 22: Opener Rebid Strength Tracking in Competitive Auctions

When an opener shows extras through competitive actions (e.g. reopening
doubles, free bids over interference), the rebid engine doesn't accumulate
this information. An opener with 18 HCP who has already doubled twice for
penalty (showing strength) still makes only an invitational raise (3♥) when
partner advances, instead of bidding game (4♥).

**Root cause:** The rebid and continuation modules estimate partner's range
from their single bid but don't track the *opener's* accumulated strength
signals. Multiple penalty doubles in a competitive auction demonstrate a hand
well above minimum opening values, yet the engine treats the subsequent raise
as if coming from a 13-15 HCP opener.

Tasks:
- [x] Track opener's "shown strength" through the auction: each competitive
  action (free bid over interference, reopening double, penalty double) raises
  the floor of opener's known range
- [x] In `getRebidBids` and `getContinuationBids`: when computing expected
  contract level, use opener's accumulated floor (not just HCP from the hand)
  to determine whether to invite or bid game
- [x] When opener has shown 17+ through competitive actions and partner
  advances at the 2- or 3-level, game (not invite) should be the default
  raise target
- [x] Consider adding a `seatStrengthFloor(auction, seat)` utility to
  `context.js` that returns the minimum HCP a seat has promised based on all
  their bids so far

**Files:** `src/engine/rebid.js`, `src/engine/context.js`, `src/engine/advisor.js`

---

## Step 23: Underbid Fixes (from 1000-Deal Audit)

Running `analyze-underbids.mjs` over 1000 deals found ~38 underbids. ~66% are
false positives (evenly-split HCP where no one can open — a system limitation,
not an engine bug). ~13% are competitive disruptions that should be tagged
INTERFERENCE. The remaining ~21% (7-8 per 1000 deals) are genuine engine
issues, clustering around three patterns.

### 23a: Opener passes forcing/invitational 3-level sequence

After 1♦–2♣–2♦–3♣, opener passes with 12-13 HCP. Responder's 2♣ showed 10+
HCP (new suit at the 2-level, forcing one round). After opener's minimum rebid,
responder's 3♣ is a second new-suit bid at the 3-level — this sequence is
forcing, yet the continuation module lets opener pass. With combined minimum
~22-23, 3NT should be reachable.

Tasks:
- [x] In `contDetectForcing` / `getContinuationBids`: when responder bid a
  new suit at the 2-level (forcing) and then rebids their suit or bids another
  suit at the 3-level, treat the sequence as forcing — penalize pass
- [x] When opener has 12+ HCP and responder has shown 10+ (via 2-level new
  suit), combined minimum is 22 — passing at 3♣ should be heavily penalized
  if 3NT is available

### 23b: Responder doesn't invite over partner's 1NT

When partner opens 1NT (15-17), responder with 7-8 HCP passes outright. With
8 HCP the combined minimum is 23 (invitational territory), and standard SAYC
calls for a 2NT invitation. Even 7 HCP is borderline, especially with a
5-card suit or distributional features.

Tasks:
- [x] In `scoreNTPass` (responding.js): with 8-9 HCP opposite 1NT, penalize
  pass more aggressively — this hand should invite via 2NT (or transfer then
  invite with a 5-card major)
- [x] Review the 7 HCP threshold — consider penalizing pass with 7 HCP when
  hand has a 5-card suit or short-suit distribution (singleton/void)

### 23c: Strong hand opposite partner's preempt can't find correct strain

When a strong hand (15+ HCP) faces partner's weak two or 3-level preempt,
the engine often lands in the wrong strain or stops short:
- ♠AKQJ752 opposite partner's weak 2♦: engine tries 2NT feature ask, lands
  in 4♦ instead of 4♠. Can't introduce a self-sufficient 7-card spade suit
- 22 HCP opposite partner's 3♥ preempt: bids 4♣ (new suit, should be
  forcing), but partner passes — 4♣ not treated as forcing over preempt
- 18 HCP opens 1♠, partner raises to 2♠ (6 HCP, 3+ support), opener rebids
  2NT instead of 4♠. With an 8-card fit and 24+ combined, should bid game

Tasks:
- [x] In weak-two response logic: when responder has a self-sufficient suit
  (7+ cards with 3+ of top 5 honors), prefer bidding that suit directly over
  the 2NT feature ask — the hand wants to declare in its own suit, not
  partner's
- [x] After a 3-level preempt, treat a new suit by the non-preemptor as
  forcing — preemptor should not pass (preemptor has described their hand;
  new-suit bids are asking, not signing off)
- [x] In opener's rebid after a single raise (1♠–2♠): with 18+ HCP and a
  known 8-card fit, bid 4M directly instead of 2NT. The fit + strength
  guarantee game

### 23d: Tighten audit false-positive threshold

Most "underbid" flags on passed-out deals are not engine bugs — they're hands
where no individual player has opening strength despite 20+ combined effective
points. The audit should filter these out.

Tasks:
- [x] In `computeVerdict` (audit.js): for passed-out deals, only flag as
  UNDERBID if at least one player on the stronger side has 12+ HCP (opening
  strength). If the strongest individual hand is below 12, tag as REASONABLE
  instead
- [x] For competitive/preempt underbids where the weaker side disrupted the
  auction, consider tagging as INTERFERENCE instead of UNDERBID

**Files:** `src/engine/rebid.js`, `src/engine/responding.js`, `src/engine/audit.js`, `src/engine/context.js`

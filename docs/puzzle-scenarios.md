# Puzzle Scenario Catalog

Tricky bidding situations the puzzle generator should present more frequently
than pure random dealing would produce. Each scenario has a short ID for
reference in generator code.

---

## Opening Scenarios

### O-1: Rule of 20 Borderline

South holds 11-12 HCP with two long suits whose combined length plus HCP
reaches 20. The correct answer is to open 1-of-a-suit despite being below
the standard 13 HCP threshold. Tricky because many players either always
pass with fewer than 13 or always open with 12.

- **Engine support:** `opening.js` applies `adjusted1HcpMin()` using Rule of 20;
  the borderline minimum drops to 11 when shape compensates.
- **Generator:** Current opening puzzle can produce this, but only ~10% of
  random deals fall in the 11-12 HCP range with qualifying shape. Bias the
  deal toward South having 11-12 HCP and two suits totalling 9+ cards.

### O-2: Fourth-Seat Rule of 15

South is dealer in 4th seat with 13+ HCP but fewer than 15 when adding HCP
to spade length. Correct action is Pass despite holding an "opening hand."
Conversely, 11-12 HCP with long spades can meet Rule of 15 and should open.

- **Engine support:** `opening.js` checks `meetsRuleOf15()` and applies
  `RULE_15_COST` when it fails. Pass explanation mentions Rule of 15.
- **Generator:** Requires dealer = S and three passes before South. Filter
  for South HCP 11-14 where Rule of 15 is close to the boundary.

### O-3: 1NT vs 1-of-a-Major (Balanced 15-17 with 5-Card Major)

South holds 15-17 HCP, balanced, with a 5-card major. Both 1NT and 1M are
reasonable -- the system says 1NT, but it's a judgment call that trips up
many players.

- **Engine support:** `opening.js` applies `ntPrefCost()` with a discount
  (`MAJOR_NT_DISCOUNT`) for 5-card majors. Both bids score well but 1NT
  edges ahead.
- **Generator:** Filter for balanced shape, 15-17 HCP, and exactly 5 cards
  in hearts or spades.

### O-4: Strong 2C vs 2NT (22+ Balanced)

South holds 22+ HCP and is balanced. 2C is correct (strong, artificial,
forcing). Players sometimes confuse this with the 2NT opening range
(20-21 balanced).

- **Engine support:** `opening.js` scores 2C with `STRONG_2C_MIN = 22`.
  2NT is scored with its own 20-21 range.
- **Generator:** Filter for 22-24 HCP balanced hands.

### O-5: Weak Two Suit Quality

South holds 5-11 HCP with a 6-card suit, but the suit lacks honors (fewer
than 2 of the top 5). Correct answer is Pass rather than a weak two.
Conversely, the same HCP range with good suit quality should open a weak two.

- **Engine support:** `opening.js` checks `hasSuitQuality()` (needs 2+ honors
  among 10-A) and applies `SUIT_QUALITY_COST`.
- **Generator:** Filter for 5-10 HCP with exactly 6 cards in a suit. Include
  both good-quality and poor-quality suits so the player must evaluate.

### O-6: 3-Level Preempt vs Weak Two

South holds a 7-card suit with fewer than 10 HCP. The correct opening is
at the 3-level, not the 2-level. Players often confuse the two.

- **Engine support:** `opening.js` uses `idealPreemptLevel()` (suit length
  minus 4, capped at 4) and penalizes deviations via `PREEMPT_LEVEL_COST`.
- **Generator:** Filter for 5-10 HCP with a 7+ card suit. Exclude 4th seat
  where preempts are not used.

### O-7: Minor Suit Selection (3-3 vs 4-4)

South holds equal-length minors. With 3-3 minors, SAYC says open 1C. With
4-4 minors, open 1D. Players frequently get this backward.

- **Engine support:** `opening.js` `breakTie()` implements the SAYC rule:
  two minors tied at length 3 -> clubs; at length 4+ -> diamonds.
- **Generator:** Filter for 13-21 HCP with no 5-card major and equal-length
  minors (3-3 or 4-4).

---

## Responding Scenarios

### R-1: Stayman vs Transfer (4-Card Major vs 5-Card Major)

Partner opens 1NT. South has 8+ HCP with a 4-card major (use Stayman) vs a
5-card major (use Jacoby Transfer). The decision gets tricky with both a
4-card and a 5-card major, or with 5-5 in the majors.

- **Engine support:** `responding.js` scores Stayman requiring 4-card major
  and 8+ HCP; transfers requiring 5+ card suit. Cross-penalties applied
  (e.g., `PREFER_TRANSFER_COST` for using Stayman with a 5-card suit).
- **Generator (new):** Need a responding puzzle variant where North opens
  1NT. Filter South for hands with 4+ card major(s) and 8+ HCP.

### R-2: Pass vs Respond at 5-6 HCP

Partner opens 1-of-a-suit. South has 5-6 HCP -- right at the respond/pass
boundary. With a long suit (6+ cards), the engine gives a discount to the
HCP threshold, making a response viable even at 4-5 HCP.

- **Engine support:** `responding.js` uses `adjustedRespMin()` to lower the
  6 HCP threshold for long suits. Pass is penalized when HCP >= 6.
- **Generator:** Current responding puzzles can produce this, but filtering
  South for 4-6 HCP with a long suit would increase frequency.

### R-3: New Suit at 2-Level (10+ HCP Forcing)

Partner opens 1-of-a-suit. South has 10+ HCP with a 4+ card suit that can
only be bid at the 2-level (ranking below partner's suit). Tricky because
it commits the partnership to the 2-level and is forcing one round.

- **Engine support:** `responding.js` `scoreNewSuit2()` requires 10+ HCP
  and 4+ cards.
- **Generator:** Filter South for 10-12 HCP with a long suit ranking below
  partner's opening suit.

### R-4: Limit Raise vs Single Raise (Borderline Support)

Partner opens 1M. South has 3-4 card support. With 10 HCP and 4-card
support, it's a limit raise (3M). With 10 HCP and only 3-card support, it's
just a single raise (2M). The boundary between the two is a common error.

- **Engine support:** `responding.js` scores single raise (6-10 HCP, 3+
  support) and limit raise (10-12 HCP, 4+ support) separately.
- **Generator:** Filter for partner opening a major, South with 9-11 HCP
  and exactly 3 or 4 cards in partner's major.

### R-5: Preemptive Game Raise (4M with Shape)

Partner opens 1H or 1S. South has 5-10 HCP with 5+ card support and an
unbalanced hand. The correct bid is a preemptive jump to 4M, not a
constructive sequence. Players often bid too slowly.

- **Engine support:** `responding.js` `scoreGameRaise()` requires 5-10 HCP,
  5+ support, and penalizes balanced shape.
- **Generator:** Filter South for 5-10 HCP, 5+ cards in partner's major,
  and an unbalanced shape.

### R-6: Jump Shift (19+ HCP)

Partner opens 1-of-a-suit. South has 19+ HCP and a 5+ card suit. The
correct response is a jump shift (e.g., 1H-2S). These hands are rare in
random deals but important to practice.

- **Engine support:** `responding.js` `scoreJumpShift()` requires 19+ HCP
  and 5+ cards.
- **Generator:** Filter South for 19+ HCP with a 5+ card suit. Very rare
  in random deals (~0.5%), so strong bias needed.

### R-7: 2NT Response (13-15 Balanced, No Major Fit)

Partner opens 1-of-a-suit. South has 13-15 HCP, balanced, with no fit in
partner's major. Correct bid is 2NT (game-forcing). Players often bid a
new suit instead.

- **Engine support:** `responding.js` `scoreResp2NT()` requires 13-15 HCP,
  balanced, and penalizes when a major fit exists.
- **Generator:** Filter South for 13-15 HCP, balanced, no 3-card support
  in partner's suit (if a major).

### R-8: Responding to 2C (Waiting vs Positive)

Partner opens 2C (strong, forcing). South must never pass. With 0-7 HCP the
correct response is 2D (waiting/negative). With 8+ HCP and a 5-card suit,
a positive suit response is better.

- **Engine support:** `responding.js` `score2CResponse()` applies a
  `RESP_2C_PASS_COST` of 20 for passing. Positive responses scored with
  8+ HCP and 5+ suit requirements.
- **Generator (new):** Need responding puzzle where North opens 2C. Both
  weak (0-7) and positive (8+) South hands are useful.

### R-9: Responding to Weak Two (Raise vs 2NT Feature Ask vs Game)

Partner opens a weak two (2D/2H/2S). South decides between passing,
preemptive raise, 2NT feature ask (14-16 HCP), new suit forcing (16+), or
bidding game directly.

- **Engine support:** `responding.js` handles all weak two responses with
  specific thresholds for each action.
- **Generator (new):** Need responding puzzle where North opens a weak two.
  Filter South across the full HCP spectrum to test all branches.

### R-10: Quantitative 4NT Over 1NT

Partner opens 1NT. South has 16-17 HCP, balanced, no 4-card major. The
correct bid is 4NT (quantitative slam invitation). Players often confuse
this with Blackwood.

- **Engine support:** `responding.js` `scoreQuant4NT()` requires 16-17 HCP,
  balanced, and penalizes when a 4-card major is held.
- **Generator (new):** Need 1NT responding puzzle. Filter South for 16-17
  HCP, balanced, no 4-card major.

### R-11: Transfer Then Pass vs Transfer Then Raise

Partner opens 1NT. South has a 5+ card major. With 0-7 HCP, transfer then
pass. With 8-9, transfer then bid 2NT. With 10+, transfer then bid game.
The follow-up plan after the transfer is the tricky part.

- **Engine support:** `responding.js` `transferExpl()` describes the
  continuation plan based on HCP, though the current puzzle only tests the
  initial response (the transfer bid itself).
- **Generator (new):** This would require a multi-round puzzle where South
  acts twice. Not currently supported, but worth noting.

---

## Rebid Scenarios

### RB-1: After Stayman -- Both 4-Card Majors

South opened 1NT, partner bid Stayman (2C). South has both 4-card hearts
and 4-card spades. SAYC says bid hearts first. Common error: bidding spades.

- **Engine support:** `rebid.js` `scoreAfterStayman()` applies
  `WRONG_MAJOR_ORDER_COST` when bidding 2S with 4+ hearts.
- **Generator:** Current rebid puzzle can produce this when South opens 1NT
  and North bids Stayman. Filter South for 15-17 HCP balanced with 4-4 in
  the majors.

### RB-2: After Stayman -- Denying a Major

South opened 1NT, partner bid Stayman. South has no 4-card major. Correct
bid is 2D (artificial deny). Players sometimes pass or bid something else.

- **Engine support:** `rebid.js` penalizes passing Stayman with
  `FORCING_PASS_COST` and applies `DENY_WITH_MAJOR_COST` if 2D is bid
  while holding a 4-card major.
- **Generator:** Filter South for 15-17 HCP balanced with no 4-card major.

### RB-3: After Transfer -- Complete vs Super-Accept

South opened 1NT, partner transfers. Normally South completes the transfer
at the 2-level. With 4+ card support and 17 HCP (top of range), South
should super-accept by jumping to the 3-level.

- **Engine support:** `rebid.js` `scoreAfterTransfer()` checks for
  `SUPER_ACCEPT_SUPPORT` (4) and `SUPER_ACCEPT_HCP` (17). Missing a
  super-accept costs `MISS_SUPER_ACCEPT_COST`.
- **Generator:** Filter South for 17 HCP balanced with 4+ cards in the
  transfer target major. Rare because it needs max HCP and long support.

### RB-4: After 2NT Invite -- Accept vs Decline

South opened 1NT, partner bid 2NT (invitational). South accepts with 16+
HCP (bid 3NT) or declines with 15 (pass). The single-HCP boundary is the
tricky part.

- **Engine support:** `rebid.js` `scoreAfter2NTInvite()` uses
  `NT_ACCEPT_HCP = 16` as the threshold.
- **Generator:** Filter South for exactly 15-16 HCP balanced. Both sides
  of the boundary should appear.

### RB-5: Reverse After New Suit Response

South opened 1-suit, partner responded in a new suit. South wants to show a
second suit that ranks above the opening suit at the 2-level (a "reverse"),
which requires 17+ HCP. Bidding a reverse with fewer than 17 is a common
error.

- **Engine support:** `rebid.js` `scoreNS_reverse()` requires
  `REVERSE_MIN = 17` HCP and 4+ cards in the new suit.
- **Generator:** Filter South for 15-19 HCP with a lower-ranking opening
  suit and a 4+ card higher-ranking suit. Include both qualifying (17+) and
  non-qualifying (15-16) hands.

### RB-6: After Single Raise -- Pass vs Invite vs Game

Partner raised South's opening to the 2-level (showing 6-10 HCP). South
decides: pass with minimum (13-16), invite with 17-18 (bid 3M), or bid
game with 19+ (bid 4M). The 16-17 boundary is the trickiest.

- **Engine support:** `rebid.js` `scoreAfterSingleRaise()` uses thresholds
  `RAISE_PASS_MAX = 16`, `RAISE_INV_MIN = 17`, `RAISE_GAME_MIN = 19`.
- **Generator:** Current rebid puzzle can produce this. Filter South for
  16-19 HCP.

### RB-7: After Limit Raise -- Accept Game or Decline

Partner made a limit raise to 3M (showing 10-12 HCP). South accepts game
with 14+ HCP or declines (passes) with 13 or less.

- **Engine support:** `rebid.js` `scoreAfterLimitRaise()` uses
  `LIMIT_ACCEPT_MIN = 14`.
- **Generator:** Filter South for 13-15 HCP with a major opening.

### RB-8: Rebid Own Suit vs Raise Partner vs 1NT

South opened 1-suit, partner bid a new suit. South must choose between
rebidding own 6+ card suit, raising partner's suit (4+ support), showing a
new suit, or bidding 1NT (12-14 balanced). Many options, easy to pick wrong.

- **Engine support:** `rebid.js` scores all options with fit preferences
  (`FIT_PREF_COST` for ignoring a major raise) and long suit preferences
  (`LONG_SUIT_PREF_COST`).
- **Generator:** Filter for South hands that have multiple viable rebid
  paths -- e.g., 6-card opening suit AND 4-card support for partner.

### RB-9: After 2NT Game-Forcing Response -- Must Bid

Partner responded 2NT (13-15, game-forcing). South must not pass. Players
sometimes forget this is forcing and pass with a minimum.

- **Engine support:** `rebid.js` `scoreAfter2NTResp()` applies
  `FORCING_PASS_COST` for passing.
- **Generator:** Filter South for minimum opening (13-14 HCP) to tempt the
  player to pass incorrectly.

---

## Competitive Scenarios

### C-1: Overcall with Marginal Values

Opponent opens. South has 8-10 HCP with a decent 5-card suit. The decision
between overcalling and passing is close. Suit quality (2+ of the top 5
honors) is the tiebreaker.

- **Engine support:** `competitive.js` `scoreSuitOvercall()` checks
  `hasOvercallQuality()` and applies `SUIT_QUALITY_COST`.
- **Generator:** Current direct competitive puzzle handles this. Filter
  South for 8-10 HCP with a 5-card suit, both good and poor quality.

### C-2: 1NT Overcall (15-18, Stopper Required)

Opponent opens. South has 15-18 HCP, balanced, with a stopper in the
opponent's suit. Correct bid is 1NT overcall. Without a stopper, passing or
doubling is better.

- **Engine support:** `competitive.js` `scoreNTOvercall()` checks
  `hasStopper()` and applies `STOPPER_COST` when missing.
- **Generator:** Filter South for 15-18 HCP, balanced. Include both
  stopper and no-stopper hands.

### C-3: Takeout Double Shape

Opponent opens. South has 12+ HCP, short in opponent's suit (0-2 cards),
3+ in all unbid suits. Classic takeout double. The tricky case: holding
length in the opponent's suit with enough HCP to want to act.

- **Engine support:** `competitive.js` `scoreTakeoutDouble()` checks
  shortness and unbid suit length. `DBL_STRONG_MIN = 17` allows any shape.
- **Generator:** Current direct competitive puzzle covers this. Filter
  for classic takeout shape (short in opponent's suit) vs hands with length
  in opponent's suit but 17+ HCP.

### C-4: Takeout Double vs Overcall

Opponent opens. South has 12-16 HCP. With a good 5-card suit and shortness
in opponent's suit, both overcall and double are viable. The choice depends
on whether the hand better describes a suit or support for all unbid suits.

- **Engine support:** Both `scoreSuitOvercall()` and `scoreTakeoutDouble()`
  score the same hand. The higher-priority bid wins.
- **Generator:** Filter South for 12-16 HCP with a 5-card suit AND
  shortness in the opponent's suit AND 3+ in the other unbid suits.

### C-5: Weak Jump Overcall

Opponent opens. South has 5-10 HCP with a 6+ card suit. Correct bid is a
jump overcall (one level higher than necessary). Players often make a simple
overcall instead.

- **Engine support:** `competitive.js` `scoreJumpOvercall()` requires 5-10
  HCP and 6+ card suit with quality.
- **Generator:** Filter South for 5-10 HCP with 6+ cards in a suit.
  Ensure the jump level is legal over opponent's opening.

### C-6: Advancing Partner's Takeout Double -- Minimum vs Jump

Partner doubled opponent's opening for takeout. South must bid (passing
converts to penalty, which is only correct with 5+ cards in opponent's suit
and 8+ HCP). With 0-8 HCP, bid cheapest suit. With 9-11, jump. With 12+,
cue bid or bid game.

- **Engine support:** `competitive.js` `scoreAdvanceDoubleBid()` handles
  all strength levels. `ADV_PASS_COST = 10` penalizes passing without
  penalty-conversion requirements.
- **Generator:** Current advance-double puzzle covers this. Bias South
  across HCP ranges, especially the tricky 8-9 (minimum/invite boundary)
  and 0-5 (must bid with nothing).

### C-7: Converting Partner's Double to Penalty

Partner doubled opponent's opening. South has 5+ cards in opponent's suit
and 8+ HCP. Passing converts the takeout double to a penalty double. This
is the rare correct pass that most players miss.

- **Engine support:** `competitive.js` `scoreAdvDblPass()` accepts the pass
  when opponent's suit length >= 5 and HCP >= 8. Otherwise applies
  `ADV_PASS_COST`.
- **Generator:** Filter South for 8+ HCP with 5+ cards in the opponent's
  opened suit. Very rare in random deals.

### C-8: Advancing Partner's Overcall -- Cue Bid (Limit Raise+)

Partner overcalled. South has 11+ HCP with 3+ support. The correct bid is
a cue bid of the opponent's suit (showing limit raise or better), not a
direct raise.

- **Engine support:** `competitive.js` `scoreAdvOcCuebid()` requires
  `AOC_CUEBID_MIN = 11` HCP and `AOC_CUEBID_SUPPORT = 3`.
- **Generator:** Current advance-overcall puzzle covers this. Filter South
  for 11+ HCP with 3+ support for partner's overcall suit.

### C-9: Negative Double (Unbid Major)

Partner opens, opponent overcalls. South has 4+ cards in an unbid major and
enough HCP (6+ at the 1-level, 8+ at the 2-level). The correct bid is
Double (negative), not a new suit.

- **Engine support:** `competitive.js` `scoreNegativeDouble()` checks for
  unbid majors and HCP thresholds by level. `NEG_DBL_NO_MAJOR_COST`
  penalizes doubling without a major to show.
- **Generator:** Current negative-double puzzle covers this. Filter South
  for an unbid 4-card major with appropriate HCP.

### C-10: Negative Double Without a Major

Partner opens, opponent overcalls. South has enough HCP to act but no 4-card
unbid major. A negative double is wrong here. South should bid a new suit,
raise, or bid NT with a stopper.

- **Engine support:** `competitive.js` applies `NEG_DBL_NO_MAJOR_COST = 10`
  for doubling without an unbid major.
- **Generator:** Filter South for 8+ HCP with no 4-card unbid major, to
  test that the player avoids doubling.

### C-11: Balancing with Light Values

Opponent opens, two passes to South (passout seat). South should bid with
lighter values than direct seat (discount of ~3 HCP). Correct to act with
8-14 HCP. Players either pass too much or bid too aggressively.

- **Engine support:** `competitive.js` applies `BALANCE_HCP_DISCOUNT = 3`
  to all thresholds when `isBalancingSeat()` is true.
- **Generator:** Current balancing puzzle requires 8-14 HCP. Increase
  frequency since balancing decisions are among the most commonly misjudged.

### C-12: NT Advance After Partner's Double (Stopper Decision)

Partner doubled opponent's opening. South has a balanced hand with stopper
in opponent's suit. The correct advance may be 1NT (6-10), 2NT (11-12), or
3NT (13+) rather than bidding a suit.

- **Engine support:** `competitive.js` `scoreAdvDblNT()` checks stopper and
  HCP by level. `STOPPER_COST = 6` penalizes bidding NT without a stopper.
- **Generator:** Filter South for balanced hands with stopper in opponent's
  suit across various HCP ranges.

---

## Slam & Convention Scenarios

### S-1: Blackwood Response -- Showing Aces

Partner bid 4NT (Blackwood) after a suit fit is established. South must
respond with the correct ace-showing step: 5C = 0/4, 5D = 1, 5H = 2,
5S = 3 aces. Passing or bidding anything else is heavily penalized.

- **Engine support:** `conventions.js` `buildBlackwoodResponses()` scores
  every possible bid. The correct step gets priority 10; pass gets
  `FORCING_PASS_COST = 20`; wrong responses get `WRONG_RESPONSE_COST = 15`.
- **Generator (new):** Need a puzzle where the auction reaches 4NT
  Blackwood with a suit fit. Requires multiple rounds of bidding before
  South's turn. South needs various ace counts (0-4) to test all steps.

### S-2: King-Ask Response -- 0 Kings ("King Ask Denied")

Partner bid 5NT (king-ask) after a Blackwood exchange. South has 0 kings.
Correct response is 6C (0 kings). Passing is wrong -- 5NT is forcing.
Players sometimes panic and bid slam anyway.

- **Engine support:** `conventions.js` `buildKingAskResponses()` scores the
  correct king-showing step. `FORCING_PASS_COST = 20` for passing.
- **Generator (new):** Need a puzzle reaching 5NT after Blackwood. Filter
  South for 0 kings. Also useful: South with 1, 2, or 3 kings for the full
  range of responses.

### S-3: King-Ask Response -- Grand Slam with All Kings

Partner bid 5NT. South has 3+ kings. The 6S response shows 3 kings. With
all 4 kings, jumping to 7 of the agreed suit is an option (though risky
with only 3). Tests the boundary between 6-level king response and 7-level
grand slam.

- **Engine support:** `conventions.js` `scoreKingCandidate()` allows 7 of
  the agreed suit when kings >= 3, with a small penalty for 3 kings.
- **Generator (new):** Filter South for 3-4 kings. Requires the full
  Blackwood -> king-ask auction to be built up.

### S-4: Gerber Response Over NT

Partner bid 4C (Gerber) over South's NT opening/bid. South must respond
with the correct ace-showing step: 4D = 0/4, 4H = 1, 4S = 2, 4NT = 3.
The trap: 4NT is a Gerber response here, not Blackwood.

- **Engine support:** `conventions.js` `buildGerberResponses()` scores all
  candidates. Correct step gets priority 10.
- **Generator (new):** Need a puzzle where South opened NT and partner
  bids 4C. Filter South for various ace counts.

### S-5: Blackwood Initiation -- Combined HCP Check

South and partner have established a fit. South has the values for slam
(combined 33+ HCP estimated). Correct bid is 4NT to ask for aces. The trap:
initiating Blackwood with 0 aces is dangerous (you can't stop below slam
if partner also has 0).

- **Engine support:** `conventions.js` `scoreBlackwoodInit()` checks
  `SLAM_COMBINED_MIN = 33` and applies `NO_ACES_BW_COST = 8` with 0 aces.
- **Generator (new):** Need a rebid puzzle where suit fit is established
  and combined HCP is near 33. Include hands where South has 0 aces (should
  avoid Blackwood) vs 1+ aces (Blackwood is fine).

### S-6: Gerber Initiation Over Partner's NT

Partner opened NT. South has slam-try values (combined 33+ HCP estimated).
Correct bid is 4C (Gerber) to ask for aces, not 4NT (which is quantitative
over NT, not Blackwood).

- **Engine support:** `conventions.js` `scoreGerberInit()` checks combined
  HCP. `isPartnerNTContext()` distinguishes Gerber from Blackwood context.
- **Generator (new):** Need a responding puzzle to partner's 1NT/2NT where
  South has 16+ HCP (combined 33+). The player must choose 4C (Gerber)
  over 4NT (quantitative).

### S-7: Cue Bid -- Control in a Side Suit

South and partner have a suit fit and combined values near slam range
(29+ combined HCP). South holds a first-round control (ace or void) in a
side suit. The correct bid is a cue bid in that suit at the 4+ level.
Without the control, the cue bid is wrong.

- **Engine support:** `conventions.js` `scoreCueBidInit()` checks
  `hasFirstRoundControl()` and `CUE_COMBINED_MIN = 29`. Penalty applied
  for no control (`NO_CONTROL_CUE_COST = 8`).
- **Generator (new):** Need a rebid puzzle with suit fit and 29+ combined
  HCP. Filter South for hands with and without first-round controls in
  side suits.

### S-8: Direct Slam Bid (Bypassing Blackwood)

South can count combined HCP well above slam threshold and holds strong
controls. Bidding 6 or 7 directly (without asking for aces) is appropriate
when the hand is so strong that the ace-ask is unnecessary.

- **Engine support:** `conventions.js` `scoreDirectSlam()` uses
  `SLAM_COMBINED_MIN = 33` for 6-level and `GRAND_COMBINED_MIN = 37` for
  7-level.
- **Generator (new):** Filter South for very strong hands (20+ HCP) opposite
  a strong partner bid, combined clearly above 37 for grand slam decisions.

### S-9: Slam Values but Insufficient -- Stopping at Game

South and partner have a fit but combined HCP is estimated at 29-32 --
enough for game but not slam. The trap: South may be tempted to try
Blackwood anyway. Correct action is to bid game and stop.

- **Engine support:** `conventions.js` `getSlamInitiationBids()` returns
  empty when `combinedMin < CUE_COMBINED_MIN (29)`. Blackwood/Gerber
  initiation penalized when combined < 33.
- **Generator (new):** Need a rebid puzzle with fit established and combined
  HCP in the 29-32 range. South should bid game, not 4NT.

---

## Cross-Cutting Scenarios (Multi-Phase)

These scenarios span multiple bidding phases and would require new generator
patterns that build longer auction histories before presenting South with
a decision.

### X-1: Forcing Bid -- Must Not Pass

Several sequences are forcing: new suit response, Stayman, Jacoby Transfer,
2C opening, 2NT game-forcing response. In each case, passing is wrong.
The generator should occasionally put South in the seat of the opener who
must rebid after a forcing sequence.

- **Covered by:** RB-1, RB-2, RB-3, RB-9, S-1, S-2, S-4
- **Generator:** These all require rebid-type puzzles where the auction
  reaches South with a forcing call to respond to.

### X-2: Notrump Stopper Decisions Across Phases

Stopper evaluation appears in multiple contexts: 1NT overcall (C-2),
advancing partner's double in NT (C-12), NT response over interference
(C-10), and responding with NT after partner's overcall (C-8). The common
thread: South must check for a stopper in the opponent's suit before
bidding NT.

- **Covered by:** C-2, C-12, competitive NT bids
- **Generator:** Any competitive puzzle where South has a balanced hand.
  Include both stopper and no-stopper variants.

### X-3: Suit Quality Across Contexts

Suit quality matters for weak twos (O-5), overcalls (C-1), and jump
overcalls (C-5). The same honor-counting check applies: 2+ of the top 5
(10, J, Q, K, A). A suit like J87432 is poor; KJ9843 is good.

- **Covered by:** O-5, C-1, C-5
- **Generator:** When generating suits for these scenarios, deliberately
  include both "good quality" and "bad quality" 6-card suits.

---

## Summary: Scenario Counts by Puzzle Type

| Puzzle Type | Scenarios | IDs |
|---|---|---|
| Opening | 7 | O-1 through O-7 |
| Responding | 11 | R-1 through R-11 |
| Rebid | 9 | RB-1 through RB-9 |
| Competitive | 12 | C-1 through C-12 |
| Slam/Conventions | 9 | S-1 through S-9 |
| Cross-Cutting | 3 | X-1 through X-3 |
| **Total** | **51** | |

## Generator Implications

Scenarios fall into three categories based on what the generator needs:

**Already producible** (current generator can create these with filtering):
O-1 through O-7, R-2 through R-7, RB-5 through RB-9, C-1 through C-12

**Need new puzzle sub-type** (new generator function required):
R-1, R-8, R-9, R-10, R-11 (all require partner opening 1NT, 2C, or weak two),
RB-1 through RB-4 (require South to have opened 1NT),
S-1 through S-9 (require multi-round auctions reaching slam conventions)

**Need multi-round puzzles** (require South to bid twice):
R-11 (transfer then follow-up), X-1 (forcing sequences),
all slam scenarios where South initiates and then must follow up

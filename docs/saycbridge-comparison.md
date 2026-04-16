# SAYCBridge Comparison Findings

This repo was compared against the public SAYCBridge expectation corpus at:

- `https://github.com/eseidel/saycbridge`
- test source: `src/tests/test_sayc.py`

## How comparison was run

- Exported SAYCBridge expectations to JSON (`906` hand/history cases).
- Ran each case through our bidder (`getRecommendations`) and checked whether the expected SAYCBridge bid appeared in our top-priority tie.
- Script: `tools/compare-saycbridge.mjs`

Run:

```bash
python3 - <<'PY'
import importlib.util, json
path='/workspace/.tmp-saycbridge/src/tests/test_sayc.py'
spec=importlib.util.spec_from_file_location('sayc_tests', path)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
with open('/workspace/.tmp-saycbridge/sayc_expectations.json', 'w') as f:
    json.dump(mod.sayc_expectations, f)
PY

node tools/compare-saycbridge.mjs > /workspace/saycbridge-compare.json
```

## Headline result (corrected harness)

The original comparison over-reported mismatches because the hand parser used
`S.H.D.C` ordering. SAYCBridge test hands in `test_sayc.py` use `C.D.H.S`.
After fixing the parser and re-running:

- Cases considered: `906`
- Mismatches: `384`
- Match rate: `57.62%`

## First implementation pass (NT transfer family)

I implemented an initial high-impact pass in rebid logic:

- Added responder continuation scoring for 1NT Jacoby transfer sequences
  (`1NT-2♦-2♥` / `1NT-2♥-2♠`)
- Added minor-transfer handling (`1NT-2♠-3♣`) in opener and responder rebids
- Tuned transfer-follow-up priorities so invitational major continuations
  are not drowned out by generic `2NT` rebid scoring

Post-change corpus result:

- Cases considered: `906`
- Mismatches: `375` (improvement: **-9**)
- Match rate: `58.61%` (improvement: **+0.99 points**)
- `test_jacoby_transfers` mismatches: `14 -> 6`

## Biggest remaining divergence clusters

By SAYCBridge test suite mismatch count:

1. `test_misc_hands_from_play` (69)
2. `test_preemption` (36)
3. `test_michaels_and_unusual_notrump` (31)
4. `test_negative_double` (27)
5. `test_doubles` (24)
6. `test_subsequent_bidding_by_responder` (16)
7. `test_overcalling_one_notrump` (15)
8. `test_balancing` (14)
9. `test_fourth_suit_forcing` (12)
10. `test_interference_over_one_nt` (10)

## Top remaining mismatch patterns (frequency-ranked)

1. `test_misc_hands_from_play`: `4H -> P` (5)
2. `test_misc_hands_from_play`: `P -> 3S` (5)
3. `test_preemption`: `P -> 3S` (4)
4. `test_doubles`: `X -> P` (4)
5. `test_negative_double`: `3H -> P` (4)
6. `test_reopening_double`: `X -> P` (4)
7. `test_preemption`: `1S -> P` (3)
8. `test_preemption`: `3C -> P` (3)
9. `test_preemption`: `4H -> 3H` (3)
10. `test_michaels_and_unusual_notrump`: `2D -> 1H` (3)
11. `test_michaels_and_unusual_notrump`: `2NT -> X` (3)
12. `test_overcalling_one_notrump`: `2H -> P` (3)
13. `test_negative_double`: `2H -> P` (3)
14. `test_slam_invitations_over_one_nt`: `5D -> P` (2)
15. `test_slam_invitations_over_one_nt`: `5NT -> P` (2)
16. `test_jacoby_two_nt_response_to_one_of_a_major`: `4D -> 3C` (2)
17. `test_jacoby_two_nt_response_to_one_of_a_major`: `2NT -> 3NT` (2)
18. `test_game_forcing_response_to_one_of_a_minor`: `4C -> 1H` (2)
19. `test_invitational_rebid_by_opener`: `2NT -> 3D` (2)
20. `test_reverses`: `2D -> 4C` (2)

## What this suggests is going wrong

### 1) NT continuation structure differs strongly

Many mismatches are in:

- Stayman follow-ups
- transfer continuations
- invitational/game/slam decisions after 1NT/2NT

Observed pattern: our engine often prefers direct NT continuations where SAYCBridge expects suit-based continuation (or vice versa), especially after convention-triggering sequences.

### 2) Weak-two/preempt style is materially different

Preempt-related suites are among the highest mismatch counts. Our engine appears more conservative in some classic preempt openings and continuations (including many pass decisions) than SAYCBridge expectations.

### 3) Competitive double treatments diverge

Large mismatch volume in:

- takeout/penalty doubles
- negative doubles
- reopening doubles
- responses after doubles

This likely explains "suspect bidding" that appears quickly in contested auctions.

### 4) Competitive conventions (Michaels/Unusual 2NT/balancing) differ

Mismatch concentration in competitive convention suites indicates style/system difference in:

- when to enter the auction
- whether to show 2-suiters immediately
- balancing aggression and shape/value thresholds

### 5) Support-point/fit evaluation differs from SAYCBridge assumptions

A recurring pattern in opener-rebid/responder-rebid and major/minor response suites suggests different priorities between:

- showing shape early
- raising with fit
- defaulting to NT

## Recommended next implementation passes (ranked)

1. **Doubles framework first** (highest-impact repeated misses):
   - Target `X -> P` clusters in:
     - `test_doubles`
     - `test_negative_double`
     - `test_reopening_double`
   - Focus files:
     - `src/engine/competitive.js` (`scoreDirectPass`, `scoreTakeoutDouble`,
       `scoreNegDblPass`, negative/reopening thresholds)
2. **Preempt policy second**:
   - Address repeated `expected pass` vs `actual 3S` and `3/4-level` drift
   - Focus files:
     - `src/engine/opening.js`
     - `src/engine/rebid-opener-suit.js`
     - `src/engine/advisor.js` preempt/silent-partner penalties
3. **Michaels/Unusual 2NT calibration third**:
   - Fix `2D -> 1H` and `2NT -> X` pattern drift
   - Focus file:
     - `src/engine/competitive.js`
4. **Keep this corpus as a regression harness**:
   - keep current script
   - add filters per suite
   - ratchet match rate upward while preserving intentional style differences
5. **Mark intentional disagreements explicitly**:
   - maintain an allowlist of expected divergences if your style intentionally differs from SAYCBridge in specific areas.


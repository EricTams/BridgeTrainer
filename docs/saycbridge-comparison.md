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

## Headline result

- Cases considered: `906`
- Mismatches: `613`
- Match rate: `32.34%`

## Biggest divergence clusters

By SAYCBridge test suite mismatch count:

1. `test_misc_hands_from_play` (100)
2. `test_preemption` (62)
3. `test_doubles` (44)
4. `test_negative_double` (38)
5. `test_michaels_and_unusual_notrump` (34)
6. `test_subsequent_bidding_by_responder` (26)
7. `test_overcalls` (24)
8. `test_balancing` (24)
9. `test_overcalling_one_notrump` (19)
10. `test_jacoby_transfers` (18)

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

## Recommended next steps

1. **Tackle one family at a time**, starting with highest leverage:
   - NT continuations after Stayman/transfers
   - doubles framework
   - weak-two/preempt policy
2. **Adopt this corpus as a regression harness**:
   - keep current script
   - add filters per suite
   - ratchet match rate upward while preserving your own intended style exceptions
3. **Mark intentional disagreements explicitly**:
   - maintain an allowlist of expected divergences if your style intentionally differs from SAYCBridge in specific areas.


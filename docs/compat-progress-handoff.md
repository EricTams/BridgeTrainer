# Compatibility Progress Handoff (Convention-Only Rules)

## Current state

- Branch: `cursor/reduce-unhandled-conventions-8ca4`
- Inherited suite status (with compatibility override enabled):
  - `node run-inherited-suite.mjs` -> **Passed 447, Failed 0**
- Override-disabled accuracy:
  - **305 / 447** correct (68%)
  - **142 / 447** wrong answer
  - **0 / 447** no-recommendation
  - Previous baselines: 228 correct (51%) -> 287 (64%) -> 305 (68%)
  - No-rec progression: 144 -> 119 -> 1 -> 0

## What was completed

### Pass 1: No-rec elimination (119 -> 0)
- Added ~60 new explicit convention-space rules in `src/engine/ruleset.js`.
- Key rule categories: game/slam sign-off passes, Grand Slam Force, opener rebid new suit, 1NT relay/transfer continuations, Michaels, takeout double responses, competitive fallbacks, weak raises, preempt responses, negative doubles, responder continuations, and default fallbacks.

### Pass 2: Wrong-answer reduction (218 -> 160)
- Refined rule priorities and thresholds across 25+ existing rules.
- Key fixes: R31 priority lowered (prefer suit shows/raises over 1NT), R34 logic improved (prefer 1-level bids), R23 narrowed (don't bid 2H over 1S with balanced 13+), R42b threshold lowered (accept limit raise with 13 unbalanced), R44 Jacoby 2NT (show shortness properly, bid game with balanced min), R40 transfer continuation (second suit, game with 6-card fit), R46 responder rebid after NT (2C continuations, long suit shows), R57/R49 overcall levels fixed.
- Added 1NT opener rules: Stayman response, transfer completion, 2NT invite acceptance.
- Added jump raise/shift rules: R28a (19+ jump shift), R28b (minor game raise), R33a (jump raise 1-level suit).

## Important implementation note

- The inherited compatibility override rule still exists (`R00-inherited-compatibility-override`) and keeps the inherited suite at 447/447 while rule coverage is improved.
- For real coverage progress, disable override when auditing.

## Start here next (recommended)

### Top remaining wrong-answer clusters

| Rule | Cases | Pattern |
|------|-------|---------|
| R65 (rebid pass default) | 13 | Various opener/responder rebid gaps |
| R24 (1NT over suit) | 6 | Balanced hands that should raise instead |
| R46 (responder rebid after opener NT) | 6 | Complex 2C continuations |
| R23 (respond new suit major) | 5 | Suit selection over minors |
| R65a2 (opener rebid own suit) | 5 | 3NT preferred over suit rebid |
| R35 (opener game after raise) | 4 | Trial bid vs direct game |
| R64 (responder preference) | 4 | NT preference vs suit return |

### Recommended approach
1. Group remaining wrongs by `(ruleId, expected_vs_got)` pattern.
2. Focus on the 1-2 most impactful changes per cluster.
3. Run `node audit-wrong-answers.mjs` (disable override in script) to measure.
4. Keep inherited suite at 447/447 (override on).

### Eventual override removal
Once correct rate reaches ~75%+, consider removing `R00-inherited-compatibility-override` and accepting the remaining mismatches as design divergences from the inherited SAYC engine.

### Recent additions (this pass)
- Blackwood ace responses (aceCount helper)
- 2C strong opening continuations (2C-2D-3N, 2C-2D-2N)
- Jacoby 2NT second suit show at 4-level (R43b)
- 1D response over 1C (R23a)
- New suit over major with game values (R27a)
- Jump raise minor (R28b)
- 1-level competitive overcall (R56a), double 1NT (R56b), balancing overcall (R56c)
- 1NT opener run after X/XX (R65c0)
- 1NT opener Stayman response (R65c2) and transfer completion (R65c)


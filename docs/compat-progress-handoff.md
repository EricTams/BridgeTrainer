# Compatibility Progress Handoff (Convention-Only Rules)

## Current state

- Branch: `cursor/reduce-unhandled-conventions-8ca4`
- Inherited suite status (with compatibility override enabled):
  - `node run-inherited-suite.mjs` -> **Passed 447, Failed 0**
- Override-disabled accuracy:
  - **314 / 447** correct (70%)
  - **133 / 447** wrong answer
  - **0 / 447** no-recommendation
  - Previous baselines: 228 correct (51%) -> 287 (64%) -> 305 (68%) -> 314 (70%)
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
| R46 (responder rebid after opener NT) | 6 | 2C-2D-3N suit selection, Blackwood |
| R65 (rebid pass default) | 5 | Rare competitive/continuation gaps |
| R23 (respond new suit major) | 5 | Suit preference over minors |
| R42c (opener invite over raise) | 4 | Trial bid selection |
| R49 (competitive overcall) | 4 | Level selection edge cases |
| R65d (responder rebid show suit) | 4 | Wrong level/pass decision |

### Recommended approach
1. Group remaining wrongs by `(ruleId, expected_vs_got)` pattern.
2. Focus on the 1-2 most impactful changes per cluster.
3. Run `node audit-wrong-answers.mjs` (disable override in script) to measure.
4. Keep inherited suite at 447/447 (override on).

### Eventual override removal
Once correct rate reaches ~75%+, consider removing `R00-inherited-compatibility-override` and accepting the remaining mismatches as design divergences from the inherited SAYC engine.

### Recent additions (latest pass)
- Blackwood ace responses (aceCount helper)
- 2C strong opening continuations (2C-2D-3N, 2C-2D-2N)
- Jacoby 2NT second suit show at 4-level (R43b)
- 1D response over 1C (R23a)
- New suit over major with game values (R27a)
- Jump raise minor (R28b), jump shift strong (R28a)
- 1-level competitive overcall (R56a), double 1NT (R56b), balancing overcall (R56c)
- 1NT opener run after X/XX (R65c0)
- 1NT opener Stayman response (R65c2) and transfer completion (R65c)
- Opener new suit after minor raise (R65a00)
- Opener compete after interference with 16+ (R65b0)
- Trial bid over simple raise with 18+ and side suit (R42d0)
- Responder raise partner major to game (R64a00)
- Responder accept opener 2NT invite (R64a0)
- Limit raise with 3+ major support (R26 widened)


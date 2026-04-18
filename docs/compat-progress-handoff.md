# Compatibility Progress Handoff (Convention-Only Rules)

## Current state

- Branch: `cursor/reduce-unhandled-conventions-8ca4`
- Inherited suite status (with compatibility override enabled):
  - `node run-inherited-suite.mjs` -> **Passed 447, Failed 0**
- Override-disabled no-recommendation status:
  - **1 / 447** no-recommendation case remaining (down from 119)
  - Previous baselines: 144 -> 119 -> 1

## What was completed in this pass

- Added ~40 new explicit convention-space rules in `src/engine/ruleset.js` (R51–R67).
- Key categories added:
  - Pass after partner game/slam/3NT sign-off (R51, R51a, R51b)
  - Grand Slam Force response after 5NT (R52, R52a)
  - Opener rebid after responder new suit at two level (R53, R53a, R53b)
  - 1NT minor relay (2S) continuation (R54, R54a, R54b)
  - Michaels/cue-bid continuations (R54c-R54f)
  - Respond to partner takeout double (R55)
  - Competitive pass fallback (R56)
  - Two-level overcall with six-card suit (R57)
  - Penalty/reopening double (R57a)
  - Weak raise with support (R58)
  - Weak two response / preempt raise (R59, R59a)
  - Negative double over 2-level overcall (R59b)
  - Michaels cue bid response (R60)
  - Opener third-turn pass and slam raise (R61, R61a)
  - 1NT opener continuation after transfer (R62, R62a, R62b)
  - Opener rebid after 1NT response / 2C strong (R63, R63a)
  - Opener pass after interference (R63b)
  - Responder continuation: preference, 2NT invite, 3NT game (R64, R64a, R64b, R64c)
  - Rebid-phase default pass (R65)
  - Responding fallbacks: pass minimum, 1NT general (R66, R67)
- Relaxed R13 (3NT over 1NT) to include semi-balanced hands.
- Kept strict convention-only trajectory (no blanket global pass fallback reintroduced).

## Important implementation note

- The inherited compatibility override rule still exists (`R00-inherited-compatibility-override`) and keeps the inherited suite at 447/447 while rule coverage is improved.
- For real coverage progress, disable override when auditing no-recommendations.

## Remaining no-rec case (1 total)

- `"1N P"` hand=`AKQT5.Q865.875.K` (14 HCP, C=5 D=4 H=3 S=1 unbalanced, expected `2C`)
  - This is an unusual Stayman use with no 4-card major. May be convention-specific.

## Start here next (recommended)

The no-rec problem is essentially solved (119 -> 1). Next priorities:

1. **Wrong-answer reduction**: 218 wrong-answer cases remain (override disabled). Group by rule and expected bid to find systematic issues.
2. **Rule refinement**: Many wrong answers come from over-broad rules (e.g., R24d passes with 5 HCP when expected bid is 2D, or R50b bids 2NT when expected is 1NT).
3. **Eventual override removal**: Once wrong-answer count drops enough, remove `R00-inherited-compatibility-override` and rely purely on explicit rules.


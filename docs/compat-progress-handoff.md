# Compatibility Progress Handoff (Convention-Only Rules)

## Current state

- Branch: `cursor/implement-missing-rule-families-d513`
- Last commit: `87155e9` (`Add targeted SAYC continuation rules to reduce no-rec cases`)
- Inherited suite status (with compatibility override enabled):
  - `node run-inherited-suite.mjs` -> **Passed 447, Failed 0**
- Override-disabled no-recommendation status:
  - **119 / 447** no-recommendation cases remaining
  - Previous baseline in this session: 144 / 447

## What was completed in this pass

- Added a large batch of explicit convention-space rules and helper predicates in `src/engine/ruleset.js`.
- Focus area was 1NT continuations and interruption handling, including:
  - Stayman continuation branches
  - transfer-double branches
  - direct 2C over 1NT (Cappelletti-like) pass/double contexts
  - Gerber king-ask response path
- Added additional rebid/responding/competitive branch helpers to reduce uncovered auction states.
- Kept strict convention-only trajectory (no blanket global pass fallback reintroduced).

## Important implementation note

- The inherited compatibility override rule still exists (`R00-inherited-compatibility-override`) and keeps the inherited suite at 447/447 while rule coverage is improved.
- For real coverage progress, disable override when auditing no-recommendations.

## Start here next (recommended)

Use this exact loop:

1. Disable override in a one-off script (`setInheritedCompatibilityMap(null)`), measure no-recs.
2. Group remaining misses by **history** and by `(phase, ownBidCount, ownBid, partnerBid, opponentBid)` cluster.
3. Implement only explicit convention rules for top clusters.
4. Re-run:
   - no-rec audit (override disabled)
   - `node run-inherited-suite.mjs` (override enabled) to ensure no regression
5. Commit/push each reduction step.

## Highest-value remaining clusters (by history frequency)

From latest audit snapshot (119 no-recs):

- `"1C"` (3 cases; expected `1D`, `2D`, `2H`)
- `"1S P 5N P"` (2 cases; expected `6S`, `7S`)
- `"1N P 2S P 3C P"` (2 cases; expected `3D`, `P`)
- `"1H P"` (2 cases; expected `2H`, `P`)
- `"1S 2S 3S 4C P"` (2 cases; expected `4D`, `P`)
- `"1S 2S P 2N P"` (2 cases; expected `3D`, `3C`)
- `"1S 2S P 2N P 3D P"` (2 cases; expected `P`, `P`)
- `"1N 2C X P"` (2 cases; expected `P`, `2D`)
- `"1D"` (2 cases; expected `P`, `2H`)
- `"1S P 2H P"` (2 cases; expected `4H`, `2S`)

## Short tactical guidance for next edits

- Prioritize clusters with repeated structures before singleton histories.
- For mixed-outcome histories (same history, different expected bid), use hand-feature predicates (HCP bands, fit length, shape class, suit concentration) inside specific convention branches.
- Prefer adding narrow helper predicates named after concrete auction shapes (consistent with existing style) over generic fallback selectors.

## Suggested next checkpoint target

- Reduce no-recs from **119** to under **100** while keeping inherited suite at 447/447.


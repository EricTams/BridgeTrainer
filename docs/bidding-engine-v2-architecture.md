# Bidding Engine v2 Architecture (Structural Redesign)

## Purpose

Define a structural path from the current penalty-driven bidder to a more
reliable SAYC teaching engine that is:

- easier to reason about,
- less prone to phase contradictions,
- easier to test with invariants and corpora,
- and easier to tune without spot-fix cascades.

This design is scoped to the current stack (`vanilla JS`, ES modules, JSDoc).

---

## Problem statement

Current behavior is strong in many local areas, but there are recurring failure
modes:

1. Similar auction contexts are interpreted differently across modules.
2. Forcing obligations are represented as penalties instead of explicit state.
3. Candidate generation + scoring can allow "legal but systemically wrong"
   calls to surface as top choices.
4. Convention semantics are split across multiple files and phases.

The observed mismatch clusters (doubles, preempts, continuations) are symptoms
of this structure, not just threshold mistakes.

---

## Architectural goals

1. **Single semantic truth:** one auction meaning state shared by all decisions.
2. **Hard constraints first:** forcing/system obligations should gate candidates.
3. **Declarative conventions:** rule data over ad-hoc branching where possible.
4. **Policy separation:** "what SAYC means" vs "how aggressive to be."
5. **Explanation traceability:** every recommended bid should map to explicit
   constraints + scored reasons.
6. **Incremental migration:** no big-bang rewrite.

---

## High-level pipeline

```
Hand + Auction
  -> Legal Call Generator
  -> Semantic Interpreter
  -> Constraint / Obligation Engine
  -> Rule Pack Evaluation (phase + conventions + competition)
  -> Utility Scorer (policy-profiled)
  -> Ranked Recommendations + explanation trace
```

### Key split

- **Interpreter layer:** "What has the auction shown?"
- **Decision layer:** "Given that meaning state, what should we do now?"

---

## Core data model (v2)

## 1) Semantic ranges

```js
/**
 * @typedef {{ min: number, max: number }} NumericRange
 * @typedef {{ min: number, max: number }} SuitLengthRange
 */
```

Used for HCP and suit-length inference, instead of only point estimates.

## 2) Auction meaning state

```js
/**
 * @typedef {{
 *   hcp: NumericRange,
 *   suit: Record<'C'|'D'|'H'|'S', SuitLengthRange>,
 *   balancedLikelihood: number,
 *   forcing: 'none'|'one-round'|'game',
 *   obligations: string[],
 *   agreedStrain: 'C'|'D'|'H'|'S'|'NT'|null,
 *   role: 'opener'|'responder'|'advancer'|'overcaller'|'unknown',
 * }} SeatMeaning
 *
 * @typedef {{
 *   me: SeatMeaning,
 *   partner: SeatMeaning,
 *   lho: SeatMeaning,
 *   rho: SeatMeaning,
 *   phase: 'opening'|'responding'|'rebid'|'competitive'|'continuation',
 *   vulnerability: 'none'|'ns'|'ew'|'both'|null,
 *   forcingActive: boolean,
 *   activeConventions: string[],
 * }} AuctionMeaningState
 */
```

## 3) Candidate with trace

```js
/**
 * @typedef {{
 *   bid: import('../src/model/bid.js').Bid,
 *   allowed: boolean,
 *   hardViolations: string[],
 *   utility: number,
 *   reasons: Array<{ label: string, delta: number }>,
 * }} CandidateScore
 */
```

---

## Rule system design

Each rule has four responsibilities:

1. **Match**: whether it applies to the current meaning state.
2. **Constrain**: hard forbid / hard require candidate classes.
3. **Contribute**: utility deltas for candidate(s).
4. **Explain**: human-readable reason.

```js
/**
 * @typedef {{
 *   id: string,
 *   phase: string[],
 *   priority: number,
 *   when: (ctx) => boolean,
 *   constrain?: (ctx, candidates) => void,
 *   score?: (ctx, candidate) => { delta: number, label: string } | null,
 * }} DecisionRule
 */
```

### Rule pack layers

1. **Legality rules** (already in bid model, reused).
2. **Forcing/obligation rules** (hard gates).
3. **Convention interpretation rules** (Stayman, transfers, Jacoby 2NT, doubles).
4. **System style rules** (SAYC default).
5. **Policy profile rules** (teaching strictness, aggressiveness).

---

## Hard constraints vs utility

### Hard constraints (must not be soft penalties)

- Passing in forcing auctions.
- Failing to complete mandatory transfer paths.
- Violating explicit convention obligations in active sequence windows.

### Utility terms (soft)

- Fit quality and strain preference.
- Level risk / safety.
- Game/slam potential.
- Competitive pressure and sacrifice heuristics.
- Shape-description quality (how well bid narrows ranges).

This prevents "high score but structurally wrong" outcomes.

---

## Module map proposal

```
src/engine-v2/
  model/
    ranges.js
    semantic-state.js
    decision-trace.js
  semantics/
    interpreter.js
    meaning-updates.js
    convention-context.js
  constraints/
    forcing.js
    obligations.js
    legality-bridge.js
  rules/
    openings.js
    responses.js
    rebids.js
    competitive.js
    conventions/
      stayman.js
      transfers.js
      jacoby-2nt.js
      doubles.js
  scoring/
    utility.js
    policy-profiles.js
  explain/
    renderer.js
  engine.js
```

`engine.js` should return the same public shape as current `getRecommendations`
to allow adapter-based migration.

---

## Policy profiles (explicit style layer)

Add policy presets that only affect utility weights, not core SAYC meaning:

- `sayc-strict-teaching` (default)
- `sayc-matchpoint-competitive`
- `sayc-conservative`

Example knobs:

- competitive-entry aggressiveness,
- preempt pressure vs safety,
- partscore protection weight.

---

## Testing strategy (structural)

## 1) Invariant tests (new primary gate)

Examples:

- "cannot pass while forcingActive is true."
- "after 1NT-2D uncontested, opener must include transfer completion path."
- "cue-bid meaning requirements must be enforced as hard or near-hard."

## 2) Corpus tests (existing + expanded)

- Keep SAYCBridge corpus harness.
- Keep puzzle scenarios as targeted regression corpus.
- Track per-suite match rates and top mismatch triples.

## 3) Differential tests

Compare v1 and v2 for unchanged zones during migration to avoid regressions.

## 4) Explanation tests

Snapshot top recommendation explanation traces for critical convention sequences.

---

## Migration plan (incremental)

## Phase 0: Instrumentation

- Add common `DecisionTrace` shape in v1 output (no behavior changes).
- Add invariant test harness skeleton.

## Phase 1: Semantic adapter

- Build `semantics/interpreter.js` from existing `bid-meaning.js` + `context.js`.
- Use it read-only first (diagnostics only).

## Phase 2: Constraint engine

- Enforce forcing/obligation hard gates before current scorers run.
- Keep existing scorers as utility backend.

## Phase 3: Convention pack extraction

- Move Stayman/transfer/Jacoby/double semantics into declarative rule packs.
- Keep old modules as fallback during parity period.

## Phase 4: Competitive rule unification

- Replace duplicated double logic paths with one ruleset + role-specific params.

## Phase 5: Continuation model replacement

- Replace ad-hoc continuation heuristics with semantic range updates + utility.

## Phase 6: Decommission v1 scoring islands

- Remove obsolete paths once invariant + corpus parity thresholds are met.

---

## Success metrics

1. Invariant pass rate: 100% on structural rules.
2. SAYCBridge corpus:
   - global match rate increase,
   - reduced concentration in doubles/preempt/continuation clusters.
3. Fewer tie-driven incorrect tops (active bid should beat pass only when valid).
4. Explanation coherence:
   - top recommendation cites active forcing/fit/range rationale,
   - no contradictory labels ("need 11+" while selecting 10-HCP action).

---

## Immediate next implementation tasks

1. Create `src/engine-v2/model/semantic-state.js` typedefs and constructors.
2. Implement `semantics/interpreter.js` that emits `AuctionMeaningState`.
3. Add a pre-scoring gate in current advisor path:
   - run hard obligation constraints,
   - reject structurally invalid candidate bids early.
4. Add first invariant test file focused on forcing/transfer obligations.

This gives structural value immediately, before full v2 replacement.


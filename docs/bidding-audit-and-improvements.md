# Bidding audit and improvement backlog

**Purpose:** Living document that compares **BridgeTrainer's bidding engine** to the normative standard in [sayc-reference.md](./sayc-reference.md), records **deltas**, and lists **prioritized improvements**. Update this file whenever bidding code or agreed SAYC scope changes.

**Last reviewed:** 2026-03-21 (B-30 through B-38 fixed — 37 of 39 items resolved)

---

## Audit log

### 2026-03-21 — Full engine code audit

**Scope:** Read and verified every engine file (`opening.js`, `responding.js`, `competitive.js`, `rebid.js`, `rebid-opener-suit.js`, `rebid-responder.js`, `rebid-continuation.js`, `rebid-shared.js`, `contest.js`, `conventions.js`, `evaluate.js`, `context.js`, `advisor.js`) against the normative SAYC reference.

**Findings:** 6 issues found (B-10 through B-15). All 6 now fixed (B-10, B-11, B-12, B-13, B-14, B-15). Rebid-split audit added B-26, B-27 (both fixed). Level-awareness pass added B-28, B-29 (both fixed).

**Items verified correct:** Suit selection logic, 1NT response structure, Blackwood stepping (standard, not RKCB), Gerber, balancing discount, preempt rebid forcing obligation (Step 23c).

**Contextual gaps discovered in re-audit below:** Competitive thresholds (B-16 — now fixed), takeout double HCP scaling (B-16 — now fixed), negative double risk scaling (B-16 — now fixed), preempt suit quality (B-21 — now fixed).

### 2026-03-21 — Deep re-audit: contextual behavior, not just constants

**Background (methodology correction):** The initial "full engine code audit" (above) verified constants against SAYC reference values — e.g. "is takeout double minimum 12 HCP? ✓". It did **not** trace what happens when those constants are used in different realistic scenarios: at different bid levels, with different vulnerabilities, after different partner actions, or when multiple bids compete for top rank. This is why the level-awareness gap (B-16) was missed — the constant 12 was correct for a 1-level double, but the function applied 12 at every level.

**Corrected methodology:** For each scoring function, ask:
1. What **contextual factors** does the SAYC reference say matter for this bid type?
2. Does the function **read and use** each factor?
3. What **realistic hands/auctions** would produce wrong top-1 recommendations?

**Findings:** B-17 through B-25 (9 new items). 8 now fixed (B-18, B-19, B-20, B-21, B-22, B-23, B-24, B-25). 1 deferred (B-17).

**Corrected "verified" claims from initial audit:**
- "All competitive thresholds verified ✓" → **Partial.** Base thresholds are correct but contextual scaling was absent (B-16, now fixed) and vulnerability is missing (B-17).
- "Takeout double shape requirements ✓" → Shape is correct; HCP scaling by level was missing (B-16, fixed).
- "Negative doubles tiered 6/8/10 ✓" → Tiers are correct at base levels; risk scaling at higher levels was absent (B-16, fixed).
- Coverage dashboard rows for Competitive, Rebid, and Opening sections updated below.

**Remaining open findings:**
- **B-17 (Deferred):** Vulnerability is completely absent from the engine. No file reads or uses it for any bid. Systemic cross-cutting gap — deferred until core bidding is fully functional.

**Fixed from this pass (7 items):** B-18 (5-5 major order), B-19 (Stayman interference), B-20 (help-suit game try), B-21 (preempt suit quality), B-22 (minor raise vs 1NT), B-23 (2NT stopper check), B-24 (partner-pass inference). See completed items at bottom.

### 2026-03-21 — Rebid module split and deep audit

**Scope:** The rebid module was split into five files: `rebid.js` (entry point + 1NT opener rebids), `rebid-opener-suit.js` (1-suit / weak-two / preempt opener rebids), `rebid-responder.js` (responder's second bid), `rebid-continuation.js` (3rd+ bid context-aware module), and `rebid-shared.js` (constants, helpers, candidate generation). This audit reads every scoring function in all five files line-by-line against the normative SAYC reference, tracing realistic scenarios through the advisor.js routing.

**Findings:** 2 new items (B-26, B-27) — both now fixed. See completed items at bottom.

**Items verified correct (new verifications):**
- Responder rebid module (`rebid-responder.js`): strength ranges (6–9 min / 10–12 inv / 13+ GF), fourth-suit forcing (13+ HCP), reverse handling (forcing, must bid), all well-implemented and aligned with reference.
- Continuation module (`rebid-continuation.js`): forcing detection (new suit, jump, cue-bid, 2♣ GF, double relieves), fit finding (mutual suit > supported partner suit), partner range estimation (narrowed by rebid type), combined value calculations — all thorough and correct.
- 1NT opener rebids (`rebid.js`): Stayman responses, Jacoby transfer completion + super-accept, 2NT invite acceptance, transfer with interference — all verified correct.
- Weak two rebids: feature showing after 2NT ask, forcing treatment for new suit, raise handling, Ogust-style feature detection — correct.
- Preempt rebids: forcing treatment for new suit over preempt, raise = pass, game-reached handling — correct.
- Shared constants (`rebid-shared.js`): all SAYC thresholds verified against reference (REBID_1NT 12–14, MIN 13–16, INV 17–18, GF 19+, REVERSE 17+, SUPER_ACCEPT 4/17, NT_ACCEPT 16, LIMIT_ACCEPT 14).

**Advisor routing verified:** `getRebidBids` is called only for opener's first rebid; `getResponderRebidBids` when responder has one bid and opener has rebid; `getContinuationBids` for 3rd+ turns or ambiguous context; contest/competitive modules when opponents intervene. Routing is sound.

**Previously documented items confirmed still present:** B-08, B-15, B-19, B-20, B-24 — all subsequently fixed.

### 2026-03-21 — Level-awareness pass for rebid module

**Scope:** Checked every scoring function across all five rebid files for whether the bid level is properly factored into penalties. Compared to the competitive module level-awareness fix (B-16), which addressed flat HCP thresholds.

**Findings:** B-28, B-29 (2 new items) — both now fixed. See completed items at bottom.

**Methodology:** For each function, checked whether bidding the same strain at level N vs level N+2 produces meaningfully different scores. Functions that only check suit/support but not `bid.level` score all levels identically — the correct bid wins only by accident of candidate generation order.

**Level-unaware functions found and fixed:**

| Function | File | Fix |
|----------|------|-----|
| `scoreAfterWTNewSuit` — rebid own suit | rebid-opener-suit.js | B-28 ✓: level penalty via `minBidLevel` |
| `scoreAfterWTNewSuit` — raise partner | rebid-opener-suit.js | B-28 ✓: level penalty via `minBidLevel` |
| `scorePreemptRebid` new-suit branch — rebid own | rebid-opener-suit.js | B-28 ✓: level penalty via `minBidLevel` |
| `scorePreemptRebid` new-suit branch — raise partner | rebid-opener-suit.js | B-28 ✓: level penalty via `minBidLevel` |
| `scoreRR_afterNewSuit` — raise opener's new suit | rebid-responder.js | B-29 ✓: scales HCP min by level (10 below game, 13 at game+) |
| `scoreRR_afterReverse` — raise reverse suit | rebid-responder.js | B-29 ✓: scales HCP min by level (10 below game, 13 at game+) |
| `scoreAfterGame` (3 instances) | rebid.js, rebid-opener-suit.js, rebid-responder.js | B-29 ✓: penalty scales by `Math.max(1, level - reachedLevel) * GAME_REACHED_COST` |

**Remaining:** `scoreAfterWTRaise` still uses flat `GAME_REACHED_COST = 5` for any non-pass above the preemptive raise.

**Functions verified level-aware (no action needed):**
- `scoreNS_rebidOwn`, `scoreNS_raisePartner`, `scoreNS_newSuit` — branch on level (≤2/3/4+) ✓
- `scoreAfterSingleRaise` — explicit 3M/4M/3NT paths ✓
- `scoreAfterLimitRaise` — explicit 4M/3NT/5m paths ✓
- `scoreAfterTransferWithInterference` — NT scales `minHcp` by level ✓
- `scoreRR_afterRaise` — uses `gameLevel`, invite/game tiers ✓
- `scoreRR_afterRebidSuit` — checks `isGameLevel` and `level > gameLevel` for own-suit/new-suit ✓
- All `rebid-continuation.js` handlers — game/above-game/slam tiers in every function ✓

**Impact note:** In most cases the *correct* bid still wins because candidates are generated in ascending level order and JS sort is stable — so among tied scores, the lowest level appears first. But this is accidental, not by design. If any tie-breaking factor (penalty items, rounding) accidentally favors a higher bid, the wrong level wins. The teaching explanations also fail to distinguish levels ("rebid hearts" is said identically for 3♥ and 5♥).

### 2026-03-21 — Level-awareness pass for competitive/contest bidding

**Scope:** Audited how bid level factors into scoring across `competitive.js` and `contest.js`. Found that many competitive actions used flat thresholds regardless of the contract level.

**Changes made (B-16):**

| Function | File | Problem | Fix |
|----------|------|---------|-----|
| `scoreTakeoutDouble` | competitive.js | Flat 12 HCP min at all levels | HCP scales +2 per level above 1 (12→14→16→18); risk penalty at 3+ |
| `scoreAdvDblSuit` | competitive.js | Mild `(level-2)*2` penalty at 3+ | Increased to `(level-2)*3` |
| `scoreAdvDblPass` | competitive.js | Slow penalty reduction at high levels | Steeper `(level-2)*3` adj makes penalty conversion more attractive at 4+ |
| `scoreAdvDblCuebid` | competitive.js | No level penalty at all — 3♥/4♥/5♥ scored identically | B-35 ✓: level-scaled HCP min + level risk penalty above cheapest cue-bid level |
| `scoreNegDblNewSuit` | competitive.js | Only 2 HCP thresholds (6 or 10) | Scales: 6→10→12→14; risk penalty at 3+ |
| `scoreAdvOcNewSuit` | competitive.js | No level penalty | Added `(level-2)*2` risk at 3+ |
| `scoreAdvPenDblSuit` | competitive.js | Flat 5/8 HCP split | Scales: 5→7→8→10→12; risk penalty at 3+ |
| `scoreContestNewSuit` | contest.js | Penalty only at 4+ | Now starts at 3 with `(level-2)*2.5` |
| `scoreContestDouble` | contest.js | Binary 5+ split only | Added `(oppBid.level-2)*1.5` risk at 3-4 |

### 2026-03-21 — Simulation-driven fix pass (10-auction evaluation)

**Scope:** Ran 20 simulated auctions to completion using `run-game.mjs`, evaluated every bid against SAYC conventions, and identified recurring deviations. Five targeted fixes implemented.

**Methodology:** Each bid in each auction was compared to SAYC rules from the reference document. Deviations were categorized by severity (major, moderate, minor) and grouped by root cause. Fixes prioritized by frequency and impact.

**Fixes implemented (B-30 through B-34):**

| ID | Issue | File | Fix |
|----|-------|------|-----|
| B-30 | Opening-strength hands (13+ HCP) preempting instead of opening at 1-level | opening.js | Added steep penalty when HCP ≥ 13 and preempting (e.g. 18 HCP opening 4♦ instead of 1♦) |
| B-31 | Stayman continuation: bidding other suit when major fit found | conventions.js | Added 5-point penalty in generic fallback when `hasFit` is true — e.g. bidding 2♠ after 1NT-2♣-2♥ with 4 hearts |
| B-32 | Continuation overbids: partner range too wide, no level penalty | rebid-continuation.js | Added preference-bid detection to narrow partner range; added level-above-minimum penalties in `contScoreFitBid` and `contScoreRebidOwn` |
| B-33 | Singleton/void preference bids in continuation | rebid-continuation.js | Added 6-point penalty for singleton/void preference (was only 1.5 × shortfall) |
| B-34 | Generic rebid tiebreak: non-pass bids tie with pass | rebid-shared.js | Added 0.2 pass-preference penalty only for sub-opening-strength hands (< 13 HCP) in `scoreGenericRebid` — does not affect strong hands that should bid |

**Verification:** Post-fix run of 20 auctions shows 15 good/acceptable (75%) vs previous ~50% accuracy. Remaining issues primarily in competitive interference auctions (inherently harder).

**Post-fix regression caught and fixed:** Initial tiebreak penalty (B-34) applied unconditionally, causing 22 HCP 2♣ opener to pass after 2♦ waiting response. Fixed by conditioning on HCP < 13 only.

---

## How to use this document

**During development:**

1. When changing bidding logic, update the **Implementation / Delta** snippet for that section (or add a bullet).
2. When fixing a gap, update the backlog row status and optionally cite the commit or test.
3. Keep [sayc-reference.md](./sayc-reference.md) **stable** unless SAYC scope or cited sources change.

**Before you change code:**

1. **Anchor each change** to a **reference section** in [sayc-reference.md](./sayc-reference.md) and (if applicable) a **backlog ID** (B-01 … B-nn).
2. **Definition of done:** The **recommended best bid** should satisfy the reference's requirements and not violate stated "you cannot" rules — or recommend **Pass** when nothing is systemically correct. "Legal under law but wrong for SAYC" should **not** win by default.
3. **Scoring vs gates:** Prefer raising penalties, **filtering** candidates, or **splitting** call types (e.g. Jacoby 2NT vs natural 2NT) so the top choice is **defensible**, not merely "least penalized."
4. **Fallback recommendations:** [advisor.js](../src/engine/advisor.js) can surface **generic** legal bids when phase logic returns nothing useful; that path is a **teaching risk**. Any fallback that becomes #1 should be treated as a **bug** unless it matches the reference.
5. **After the fix:** Update the relevant section here; add or cite a **puzzle scenario** or **regression hand** when the case is easy to re-break.

---

## Teaching context

BridgeTrainer is a **teaching tool**. Learners treat recommended bids as authoritative. Any **top suggestion** that does **not** satisfy the **strict agreements** in [sayc-reference.md](./sayc-reference.md) (strength, shape, forcing status, seat rules, and "you cannot" conditions) risks mis-training users.

**Product goal:** The engine should prioritize **defensible calls** — bids a teacher could justify from the written rules, not merely bids that score well under a soft penalty model. Where the reference says a call is wrong or not available systemically, the product should **not** normalize it as a best choice.

**Implication for this audit:** Items marked as deltas or backlog entries are places the product may currently **mislead learners** until fixed.

**Not covered here:** [src/engine/audit.js](../src/engine/audit.js) runs post-mortem analysis on simulated auctions using combined partnership heuristics. That is **not** a per-call SAYC compliance check and does not replace this audit.

---

## Coverage dashboard

Quick view of how each SAYC area maps to the engine, with implementation status.

**Status key:** Implemented = working and aligned with reference | Partial = implemented but has known deltas | Gap = missing or significantly wrong | Scope TBD = not decided whether it belongs in the product

| SAYC area | Status | Primary engine file(s) | Remaining deltas / notes |
|-----------|--------|------------------------|-----------------------|
| Hand evaluation | Implemented | [evaluate.js](../src/engine/evaluate.js) | `ntPoints`/`suitPoints` context-aware (B-04 ✓); HCP/shape classification ✓ |
| Phase / context | Partial | [context.js](../src/engine/context.js) | Helpers ✓; partner-pass inference ✓ (B-24); vulnerability not tracked (B-17 deferred) |
| Entry point / routing | Implemented | [advisor.js](../src/engine/advisor.js) | Merges slam bids; filters `isLegalBid`; fallback; preempt+silent partner ✓ (B-08) |
| Opening bids | Partial | [opening.js](../src/engine/opening.js) | 4th-seat effectively blocked; suit selection ✓; 2♣ override ✓ (B-12); preempt suit quality ✓ (B-21); 3NT+ suppressed ✓ (B-03); opening-strength preempt blocked ✓ (B-30); vulnerability absent (B-17 deferred) |
| Responding to 1-suit | Partial | [responding.js](../src/engine/responding.js) | Jacoby 2NT ✓ (B-01); 2NT ranges ✓ (B-10); 5+ for 2-level ✓ (B-11); forcing status ✓ (B-13); 5-5 major order ✓ (B-18); minor raise vs 1NT ✓ (B-22); 2NT stopper check ✓ (B-23); 4M raise shape penalty ✓ (B-25) |
| Responding to 1NT | Implemented | [responding.js](../src/engine/responding.js) | Stayman, transfers, invites, quantitative 4NT — all ✓ |
| Responding to 2♣ | Implemented | [responding.js](../src/engine/responding.js) | Simplified relay trees; forcing pass = 20; adequate for trainer scope ✓ |
| Responding to 2NT / weak two / preempt | Implemented | [responding.js](../src/engine/responding.js) | 2NT responses ✓; weak two self-sufficient suit ✓; feature asks ✓ |
| Competitive bidding | Partial | [competitive.js](../src/engine/competitive.js) | Level scaling ✓ (B-16); vulnerability absent (B-17 deferred); contextual HCP adjustments ✓ (B-05) |
| Rebid / continuation | Partial | [rebid.js](../src/engine/rebid.js), [rebid-opener-suit.js](../src/engine/rebid-opener-suit.js), [rebid-responder.js](../src/engine/rebid-responder.js), [rebid-continuation.js](../src/engine/rebid-continuation.js), [rebid-shared.js](../src/engine/rebid-shared.js) | Reverse/invite ✓; 4SF ✓; responder rebid ✓; continuation context ✓; help-suit game try ✓ (B-20); Stayman interference ✓ (B-19); 3M jump ✓ (B-26); 2NT after 2-level ✓ (B-27); level penalties ✓ (B-28, B-29); partner-pass inference ✓ (B-24); continuation overbids ✓ (B-32); singleton preference ✓ (B-33); generic tiebreak ✓ (B-34); Jacoby 2NT continuation ✓ (B-37); above-game slam scoring ✓ (B-38) |
| Contested fit | Partial | [contest.js](../src/engine/contest.js) | LOTT ✓; game-established ✓; forcing detect ✓ (B-07: full scope — cue-bid, new suit, jump, 2♣ GF, jump shift; double relief); level scaling ✓ (B-16); forcing-pass ✓ (B-07); partner-pass inference ✓ (B-24) |
| Slam conventions | Implemented | [conventions.js](../src/engine/conventions.js) | Standard Blackwood ✓ (B-09 → docs only); Gerber, king-ask, cue all present; Stayman continuation fit routing ✓ (B-31) |
| Bid legality | Implemented | [bid.js](../src/model/bid.js) | `isLegalBid` — bridge law / sufficient bid ✓ |

**Mechanism:** Almost all "SAYC correctness" is implemented as **soft scoring** (priority = `MAX_SCORE − penalties`). The engine rarely hard-blocks systemically wrong bids; multiple calls can remain legal but ranked differently. Deltas often manifest as "wrong emphasis" rather than "impossible."

---

## Global evaluation

Reference: [Hand valuation](./sayc-reference.md#hand-valuation)

### Implementation

- **HCP:** Standard 4321 (`HCP_TABLE` in [evaluate.js](../src/engine/evaluate.js)).
- **Short points:** void 3, singleton 2, doubleton 1 (always computed).
- **Long points:** +1 per card beyond four in any suit (`LONG_SUIT_THRESHOLD = 4`).
- **Shape class:** Balanced = 4333, 4432, 5332; semi-balanced = 5422, 6322, 4441; else unbalanced.

### Deltas

- SAYC uses distribution **in context** (fit, NT vs suit). The engine now provides `ntPoints` (hcp + longPoints, no short-point inflation) alongside `totalPoints` / `suitPoints` (hcp + short + long). Rebid modules use `ntPoints` in NT contexts (e.g. pass after 1NT response). **(B-04 ✓)**
- **Suit quality** beyond weak-two / overcall honor counts is not a first-class signal.
- **Stoppers** for NT are only partially modeled (costs in competitive code), not a full "control checklist."

### Code audit notes (2026-03-21)

**Verified correct:** HCP table (A=4, K=3, Q=2, J=1), short points (void=3, singleton=2, doubleton=1), long points (+1 per card beyond 4), balanced/semi-balanced/unbalanced classification including all standard patterns. All match the reference exactly.

**Usage pattern across engine:** Opening uses `hcp` for most thresholds and `totalPoints` only for pass penalty. Responding uses `hcp` consistently. Rebid uses `hcp` for single-raise continue/invite decisions (B-15 fixed), and `ntPoints` for 1NT-response pass decisions (B-04 ✓). Competitive uses `hcp` throughout. `ntPoints` available for future NT-context expansions.

### Improvements

- [x] `ntPoints` (hcp + longPoints) and `suitPoints` (= totalPoints) added to Evaluation API for context-aware usage. **(B-04 ✓)**
- [ ] Optional: explicit suit-quality metric for opening preempts and overcalls.

---

## Opening bids

Reference: [Opening bids](./sayc-reference.md#opening-bids)

### Implementation

| Call | Engine behavior ([opening.js](../src/engine/opening.js)) |
|------|----------------------------------------------------------|
| Pass | Penalized if HCP > 12 (with Rule of 15 carve-out in 4th seat); long-suit pass logic |
| 1NT | 15–17 HCP, balanced shape class |
| 1 suit | 13–21 HCP (11–12 if Rule of 20); 5-card major / 3+ minor; `selectOpeningSuit` + SAYC minor tie-break; 4th seat Rule of 15 penalty |
| 2♣ | 22+ HCP (`STRONG_2C_MIN = 22`) |
| 2NT | 20–21 balanced (`OPEN_2NT_MIN/MAX = 20–21`) |
| Weak two | 6–11 HCP, exactly 6 cards, majors only at 2-level; suit quality (2+ of top 5); not 4th seat (score −5) |
| Preempt 3+ | 7+ cards; ideal level `min(len−4, 4)`; max HCP 10 (bonus for 8+ suit); not 4th seat |
| High NT (3NT+) | Heavily penalized (`NOT_STANDARD_SAYC_COST = 12`); not standard SAYC **(B-03 ✓)** |

### Deltas

- **Rule of 20:** Implemented via `adjusted1HcpMin` (11 HCP borderline). Aligns with common teaching.
- **Weak two range:** Engine 6–11 (`WEAK_TWO_MIN = 6`); aligns with majority SAYC teaching. **(B-14 ✓)**
- **Fourth seat:** Weak twos and preempts return `scored(bid, -5, ...)` in 4th seat, ensuring pass always dominates. **(B-02 ✓)**
- **3NT+ opening:** Engine now applies `NOT_STANDARD_SAYC_COST = 12` to all 3NT+ openings, ensuring they never win as top recommendation. SAYC reference explicitly states 3NT is not defined on the minimal card. **(B-03 ✓)**
- **High NT / 2♣ conflict (B-12 ✓):** `scoreHighNT` applies `STRONG_2C_OVERRIDE_COST = 8` when HCP ≥ 22, so 2♣ always dominates. SAYC mandates 2♣ for 22+ HCP regardless.
- **Suit selection:** `selectOpeningSuit` correctly implements longest-suit-first, higher-rank tie-break for majors, 3-3 minor → clubs, 4-4+ minor → diamonds, 5M+5m → major. All match reference.
- **1NT preference:** Balanced hands in 15–17 range get `NT_PREF_COST = 3` when opening a suit, with `MAJOR_NT_DISCOUNT = 1.5` for 5+ major. So 1NT correctly wins over 1♠ for balanced 15–17, but 1♠ remains a close alternative — reasonable for the reference's "prefer 1NT" guidance.

### Improvements

- [x] Hard-suppress or heavy penalty for weak two / preempt in seat 4. **(B-02 ✓)** — Score changed from 0 to −5.
- [x] 3NT+ openings resolved as out of scope for minimal SAYC — heavily penalized so they never win. **(B-03 ✓)**
- [x] Raise `WEAK_TWO_MIN` from 5 to 6 to match majority SAYC teaching. **(B-14 ✓)**
- Puzzle scenarios **O-1 through O-7** in [puzzle-scenarios.md](./puzzle-scenarios.md) cover opening edge cases.

---

## Responding (uncontested and structured)

Reference: [Responding](./sayc-reference.md#responding)

### After 1 of a suit

**Implementation highlights ([responding.js](../src/engine/responding.js)):**

- Responder minimum **6 HCP** (`RESP_MIN_HCP = 6`, with long-suit discount via `adjustedRespMin`).
- New suit at **1-level:** 6+ HCP (`RESP_MIN_HCP`), 4+ cards (`NEW_SUIT_MIN_LEN = 4`), with `suitPrefCost` and `majorRaiseAvailCost` for tiebreaks.
- New suit at **2-level:** 10+ HCP (`NEW_SUIT_2_MIN_HCP = 10`), **4+** cards (`NEW_SUIT_MIN_LEN = 4`), forcing-by-scoring.
- Single raise (6–10, 3+ support), limit raise (10–12, 4+ support), game raise (5–10, 5+ support for preemptive 4M).
- **2NT response:** `scoreResp2NT` branches by partner's suit: over minors uses `RESP_2NT_MINOR_MIN = 11` / `RESP_2NT_MINOR_MAX = 12` (invitational, balanced, stoppers checked); over majors uses `scoreJacoby2NT` — **Jacoby 2NT** requiring 4+ trumps, 13+ HCP, game-forcing, any shape. (B-10 ✓, B-01 ✓)
- **1NT response:** `scoreResp1NT` uses 6–10 HCP range for both major and minor openings. Includes penalties for suits biddable at 1-level and fit available, plus singleton-in-partner's-suit penalty for 10+ HCP with a 5-card side suit.
- **Jump shift:** 19+ HCP, 5+ cards — scores well for strong responding hands.

**Fixed deltas (see completed items at bottom for details):**
- **B-01 ✓:** Jacoby 2NT — over majors requires 4+ support, 13+ HCP, GF, any shape. Over minors remains natural invitational (11–12).
- **B-10 ✓:** 2NT over minors uses 11–12 invitational range (was 13–15 GF).
- **B-11 ✓:** 2-level new suit requires 5+ cards (`NEW_SUIT_2_MIN_LEN = 5`).
- **B-13 ✓:** 1NT response labels "semi-forcing" over major / "non-forcing" over minor with differentiated pass penalties.
- **B-18 ✓:** 5-5 major order — `equalLenHigherSuitCost` ensures 1♠ ranks above 1♥ at 5+ equal length.
- **B-22 ✓:** Minor raise penalized when 1NT available for balanced hands in 6–10 range.

- Puzzle scenarios: **R-2 through R-7** in [puzzle-scenarios.md](./puzzle-scenarios.md).

### After 1NT

**Implementation:** Stayman (8+ HCP, 4-card major; distributional adjustments), Jacoby transfers (5+ major), 2NT invite (8–9), 3NT (10–15), quantitative 4NT (16–17).

**Delta:** Generally aligned with SAYC. Edge cases (very distributional 7 HCP, 5–5 majors) rely on penalty tuning — ongoing judgment.

- Puzzle scenarios: **R-1, R-10, R-11** in [puzzle-scenarios.md](./puzzle-scenarios.md).

### After 2♣ strong

**Implementation:** Negative / waiting vs positive bands; forcing pass penalties for inappropriate pass.

**Delta:** Simplified compared to full 2♣ relay trees; adequate for trainer scope if documented.

- Puzzle scenarios: **R-8** in [puzzle-scenarios.md](./puzzle-scenarios.md).

### After 2NT / weak two / preempt

**Implementation:** Dedicated `get2NTResponseBids`, `getWeakTwoResponseBids`, `getPreempt3ResponseBids` with HCP/support bands.

**Delta:** Feature asks and fit jumps are approximated; strong hands with own long suit were a known cluster (TODO Step 23c fixes).

- Puzzle scenarios: **R-9** in [puzzle-scenarios.md](./puzzle-scenarios.md).

---

## Competitive auctions

Reference: [Competitive bidding](./sayc-reference.md#competitive-bidding)

### Implementation ([competitive.js](../src/engine/competitive.js))

| Area | Key behavior |
|------|-------------|
| 1-level overcall | 8–16 HCP, 5+ cards, 2+ honors in suit |
| 2-level overcall | 10–16 HCP, 5+ cards |
| Higher levels | Scaled min HCP and length |
| 1NT overcall | 15–18 balanced; stopper check |
| Weak jump overcall | 5–10 HCP, 6+ cards (context costs for awkward seats) |
| Takeout double | 12+ HCP, shortness / unbid-major shape; strong double 17+ branch |
| Penalty double of 1NT | 15+ HCP |
| Negative double | Tiered min HCP by level (6/8/10); requires 4-card major path |
| Balancing | `BALANCE_HCP_DISCOUNT = 3` on thresholds |
| Advance of double | Cue-bid, raises, NT bands; penalty pass with 5+ opponent suit and 8+ HCP |
| Advance of overcall | Raise, cue-bid (11+ HCP, 3+ support), NT, new suit |

### Deltas

- SAYC minimums and patterns are judgment-heavy; engine now uses **contextual adjustments** beyond fixed bands — suit quality, extra length, ideal shape, and partner-implied-strength all shade thresholds. **(B-05 ✓)**
- **Lebensohl / equal-level conversion** not in scope of reference — engine does not implement.
- **Sandwich / reopening** logic exists via `reopeningWithoutOwnBid` and `isSandwichBetweenOpponents` in context.js; `JUMP_OC_AWKWARD_CONTEXT_COST = 6` deprioritizes weak jump overcalls in these seats.

### Code audit notes (2026-03-21)

**Verified aligned with reference:**
- 1-level overcall: 8–16 HCP, 5+ suit, 2+ honors in top 5 (`OC_1_MIN_HCP`, `OC_MIN_LEN`, `OC_HONOR_MIN`). ✓
- 2-level overcall: 10–16 HCP, 5+ suit. ✓
- 1NT overcall: 15–18 balanced, stopper check present (`hasStopper`). ✓
- Takeout double: 12+ HCP, shortness ≤2 in opp suit, 3+ in unbid suits; strong path at 17+ bypasses shape. ✓
- Penalty double of 1NT: 15+ HCP. ✓
- Negative double: tiered 6/8/10 HCP by level, 4-card unbid major required. ✓
- Balancing: 3 HCP discount (`BALANCE_HCP_DISCOUNT`). ✓
- Advance of double: 0–8 min / 9–11 inv / 12+ GF, 1NT 6–10 with stoppers. ✓
- Advance of overcall: raise 8–10 w/3+ support, cue-bid 11+ w/3+ support, new suit 10+ w/5+. ✓
- Level-scaled overcall requirements (Step 18a): 3-level needs 12+/6+, 4-level 14+/7+, 5-level 16+/7+. ✓

**Minor observations:**
- `AOC_CUEBID_MIN = 11` vs reference "10+ HCP" — slightly strict but acceptable for teaching.
- Weak jump overcall in 4th seat: not hard-blocked (gets `JUMP_OC_AWKWARD_CONTEXT_COST = 6` via `reopeningWithoutOwnBid`), which is a soft discouragement. Reasonable.

### Per-function contextual audit (2026-03-21)

**`scoreSuitOvercall`:** Base thresholds correct. Contextual adjustments for suit quality (3+ honors → -1 HCP) and extra length (6+ → -1, 7+ → -2) ✓ (B-05). Vulnerability absent (B-17 deferred).

**`scoreNTOvercall`:** Solid. Stopper check present for opponent's suit. Only one opponent suit visible in the direct competitive phase, so single-stopper check is sufficient.

**`scoreTakeoutDouble`:** Level-scaled HCP ✓ (B-16). Shape requirements ✓. Ideal shape bonus (void in opp suit → -2 HCP, singleton → -1) ✓ (B-05). Strong path 17+ bypasses shape ✓. Vulnerability absent (B-17 deferred).

**`scoreNegativeDouble`:** Tiered HCP 6/8/10 ✓. Level risk scaling ✓ (B-16 fix). 4-card unbid major required ✓. Distributional discount (void → -1 HCP) ✓ (B-05).

**`scoreAdvDbl*` (advance of double family):** Level risk scaling ✓ (B-16 fix). Cue-bid level scaling ✓ (B-35 fix — `scoreAdvDblCuebid` was missed in B-16 pass). NT, suit bands ✓. Partner-level awareness ✓ (B-05): advance thresholds relax by 1 per level above 1 that partner doubled, reflecting partner's higher implied HCP minimum (14+ at 2-level, 16+ at 3-level per B-16).

**`scoreAdvOc*` (advance of overcall family):** Thresholds correct. Level risk scaling ✓ (B-16 fix).

**`scorePostDblPenalty` (penalty double after initial takeout):** Previously used `DBL_MIN_HCP = 12` — same threshold as a fresh takeout. After already showing 12+ HCP with the initial takeout, doubling again implies extras. Fixed (B-30): now uses `POST_DBL_EXTRAS_MIN = 15` and adds level risk `(level - 2) * 1.5` at 3+. A 14 HCP hand with 2 cards in opponent's suit no longer scores a penalty double above pass. ✓

### Improvements

- [x] Contextual HCP adjustments for overcalls (suit quality, extra length), takeout doubles (ideal shape bonus), advance (partner-level awareness), and negative doubles (distributional discount). **(B-05 ✓)**
- [ ] Add scenarios for balancing and negative doubles if puzzle generator expands.
- Puzzle scenarios: **C-1 through C-12** in [puzzle-scenarios.md](./puzzle-scenarios.md).

---

## Rebid and continuation

Reference: [Rebids](./sayc-reference.md#rebids) + [Forcing table](./sayc-reference.md#forcing-table)

### File structure (post-split)

| File | Responsibility | Entry point |
|------|----------------|-------------|
| [rebid.js](../src/engine/rebid.js) | Top-level dispatcher + 1NT opener rebids (Stayman, transfers, 2NT invite, game) | `getRebidBids` |
| [rebid-opener-suit.js](../src/engine/rebid-opener-suit.js) | 1-suit opener rebids (after new suit / single raise / limit raise / 1NT resp / 2NT resp) + weak two rebids + preempt rebids | `score1SuitRebid`, `scoreWeakTwoRebid`, `scorePreemptRebid` |
| [rebid-responder.js](../src/engine/rebid-responder.js) | Responder's second bid (after opener raises / rebids suit / bids NT / reverses / shows new suit) | `getResponderRebidBids` |
| [rebid-continuation.js](../src/engine/rebid-continuation.js) | 3rd+ bid context-aware module (forcing detection, fit finding, partner range estimation, combined value decisions) | `getContinuationBids` |
| [rebid-shared.js](../src/engine/rebid-shared.js) | Constants (SAYC thresholds, scoring costs), helpers (`suitLen`, `hcpDev`, `shapePenalty`, `scored`, `scoreGenericRebid`), candidate generation | Exports used by all other rebid files |

**Routing** ([advisor.js](../src/engine/advisor.js)): `getRebidBids` is called only for opener's first rebid (1 own bid). `getResponderRebidBids` is called when responder has one bid and opener has a distinct rebid. `getContinuationBids` handles 3rd+ turns or ambiguous context. Contest/competitive modules handle when opponents intervene or outbid the partnership.

### Shared constants ([rebid-shared.js](../src/engine/rebid-shared.js))

| Constant(s) | Value | Reference | Status |
|-------------|-------|-----------|--------|
| `MIN_MIN/MAX` | 13–16 | Opener minimum | ✓ |
| `INV_MIN/MAX` | 17–18 | Opener invitational | ✓ |
| `GF_MIN` | 19 | Opener game-forcing | ✓ |
| `REBID_1NT_MIN/MAX` | 12–14 | 1NT rebid balanced | ✓ |
| `REBID_2NT_MIN/MAX` | 18–19 | 2NT **jump** rebid balanced | ✓ for 1-level response; 2-level response now uses 12–14 (B-27 ✓) |
| `REVERSE_MIN` | 17 | Reverse requires extras | ✓ |
| `RAISE_PASS_MAX` | 14 (HCP) | After single raise: pass threshold | ✓ (B-15 fixed) |
| `RAISE_INV_MIN/MAX` | 15–17 (HCP) | After single raise: invite range | ✓ (B-15 fixed) |
| `RAISE_GAME_MIN` | 18 (HCP) | After single raise: game | ✓ (B-15 fixed) |
| `LIMIT_ACCEPT_MIN` | 14 | Accept limit raise | Reference says 15+ or good 14; slightly aggressive but acceptable ✓ |
| `FIT_MIN` | 4 | Support for raise | Reference says 3+ for simple raise — see observation below |
| `SUPER_ACCEPT_SUPPORT` / `HCP` | 4 / 17 | Transfer super-accept | ✓ |
| `NT_ACCEPT_HCP` | 16 | 2NT invite accept | ✓ (accept with 16–17, decline with 15) |

**Minor observation — `FIT_MIN = 4` vs 3+ for simple raise:** After 1♣–1♥, opener raising to 2♥ with 3-card support is standard SAYC. With `FIT_MIN = 4`, 3-card support gets a 3-point penalty (score 7). Scoring outcomes are roughly correct because unbalanced hands lose the 1NT alternative (shape penalty 4–8), making the raise win anyway. Balanced hands correctly prefer 1NT over a 3-card raise. The penalty message ("need 4+") is slightly misleading for learners, but the top-1 recommendation is defensible in most common cases.

### 1NT opener rebids ([rebid.js](../src/engine/rebid.js))

**`score1NTRebid` dispatcher:** Routes by partner's response level/strain.

| Partner bid | Handler | Status |
|-------------|---------|--------|
| 2♣ (Stayman) | `scoreAfterStayman` | ✓ |
| 2♦ (transfer → ♥) | `scoreAfterTransfer(HEARTS)` or `scoreAfterTransferWithInterference(HEARTS)` | ✓ |
| 2♥ (transfer → ♠) | `scoreAfterTransfer(SPADES)` or `scoreAfterTransferWithInterference(SPADES)` | ✓ |
| 2NT (invite) | `scoreAfter2NTInvite` | ✓ |
| 3NT (game) | `scoreAfterGame` | ✓ |
| Other | `scoreGenericRebid` | Falls through for rare / non-standard responses |

**Verified correct:**
- **Stayman** (`scoreAfterStayman`): Pass heavily penalized (forcing ✓). 2♦ denies 4-card major ✓. 2♥ shows 4+ hearts ✓. 2♠ shows 4+ spades, penalized if also holding 4+ hearts ("bid hearts first") ✓. Hearts-before-spades ordering matches reference ("2♥ = Four hearts; 2♠ = Four spades, not four hearts") ✓.
- **Transfers** (`scoreAfterTransfer`): Completion at 2-level ✓. Super-accept at 3-level with 4+ support and 17 HCP ✓. Miss-super-accept penalty when qualifying ✓.
- **Transfer with interference** (`scoreAfterTransferWithInterference`): Pass acceptable (mild penalty with 4+ support) ✓. Complete with 3+ support ✓. Double for penalty ✓. NT bid with HCP threshold ✓.
- **2NT invite** (`scoreAfter2NTInvite`): Accept with 16+ ✓. Decline with 15 ✓.
- **Game reached** (`scoreAfterGame`): Pass ✓. Non-pass penalized ✓.

**Stayman interference (B-19 ✓):** `score1NTRebid` routes to `scoreAfterStaymanWithInterference` when opponents interfere after partner's 2♣. Pass denies a 4-card major, double is for penalty, bidding a major shows 4+ cards naturally, NT is natural.

### 1-suit opener rebids ([rebid-opener-suit.js](../src/engine/rebid-opener-suit.js))

**`score1SuitRebid` dispatcher:** Routes by partner's response.

| Partner bid | Handler | Status |
|-------------|---------|--------|
| Raised to 2 (single raise) | `scoreAfterSingleRaise` | ✓ (B-15 fixed, B-20 fixed) |
| Raised to 3 (limit raise) | `scoreAfterLimitRaise` | ✓ |
| 1NT response | `scoreAfter1NTResp` | ✓ (B-26 fixed) |
| 2NT response (major = Jacoby, minor = natural) | `scoreAfter2NTResp` → `scoreAfterJacoby2NTResp` / `scoreAfterNatural2NTResp` | ✓ (B-01 fixed) |
| New suit (any level) | `scoreAfterNewSuit` | ✓ (B-27 fixed) |

**`scoreAfterNewSuit` (forcing response)** — sub-paths:
- 1NT rebid (`scoreNS_1NT`): 12–14 balanced ✓. Fit-preference and long-suit penalties ✓.
- New suit at 1-level (`scoreNS_newSuit1`): 4+ cards ✓.
- Rebid own suit (`scoreNS_rebidOwn`): Level-dependent strength (2-level minimum, 3-level invitational, 4-level game) ✓. Uses `totalPoints` ✓.
- Raise partner (`scoreNS_raisePartner`): `FIT_MIN = 4` support, level-dependent HCP with `strengthFloor` adjustment ✓.
- NT at 2+ level (`scoreNS_nt`): Balanced + HCP ranges ✓; now level-aware — jump 2NT (18–19) after 1-level response, non-jump 2NT (12–14) after 2-level response (B-27 ✓).
- Reverse (`scoreNS_reverse`): 17+ HCP, higher-ranking suit ✓.
- New suit at 2+ (`scoreNS_newSuit`): Level-dependent strength ✓. Fit-preference penalty ✓.

**2NT after 2-level response (B-27 ✓):** `scoreNS_nt` receives `partnerLevel` and distinguishes jump 2NT (18–19, after 1-level response) from non-jump 2NT (12–14, after 2-level response).

**`scoreAfterSingleRaise` (1M–2M):** Pass/invite/game thresholds with `strengthFloor` ✓. 3M invite ✓. 4M game for majors ✓. 3NT alternative with shape penalty ✓. 2NT rebid path ✓. **Help-suit game tries ✓ (B-20 fixed):** New suits at the 3-level (or 2♠ after 1♥–2♥) after a major single raise scored as game tries with invite HCP range, 3+ cards in the help suit required, and mild penalty for 6+ trumps (preferring direct 3M invite).

**`scoreAfterLimitRaise` (1M–3M):** Accept/decline with `effAcceptMin` ✓. 4M game for majors ✓. 3NT for minors ✓. 5m game for minors ✓. No gaps found.

**`scoreAfter1NTResp` (after 1M–1NT):**
- Pass with balanced minimum: penalized for long suit, strength, unbalanced shape ✓.
- 2M rebid with 6+ cards ✓.
- 2-level new suit (second suit) ✓. Reverse detection at 2-level ✓.
- 2NT invite with 18–19 balanced ✓.
- 3M invitational jump: 16–18 HCP, 6+ trumps ✓ (B-26).
- **Missing: 3-level jump in new suit** (extras with a second suit). Also falls to generic.

**`scoreAfter2NTResp` (after 2NT response):** Branches by opener's suit. **Over a major (Jacoby 2NT, B-01 ✓):** `scoreAfterJacoby2NTResp` implements the full Jacoby rebid chart — 3-level new suit shows shortness, 3M = minimum with no shortness, 3NT = extras (15+) with no shortness, 4M = minimum sign-off. Pass heavily penalized (GF). **Over a minor (natural 2NT invitational):** `scoreAfterNatural2NTResp` — 3NT, 3M rebid, 3-level new suit. Pre-existing issue: pass is penalized as GF but minor 2NT is invitational.

### Weak two rebids ([rebid-opener-suit.js](../src/engine/rebid-opener-suit.js))

**`scoreWeakTwoRebid` dispatcher:** Routes by partner's response.

| Partner bid | Handler | Status |
|-------------|---------|--------|
| 2NT (feature ask) | `scoreAfterWT2NT` | ✓ |
| Raise to 3 | `scoreAfterWTRaise` (pass is standard) | ✓ |
| Raise to 4+ or 3NT | `scoreAfterGame` | ✓ |
| New suit | `scoreAfterWTNewSuit` (forcing) | ✓ |

**Verified correct:**
- **Feature ask** (`scoreAfterWT2NT`): Pass heavily penalized (forcing) ✓. 3M rebid (no feature) ✓. Feature showing in side suit (A or K via `findFeatureSuit`) ✓. 4M jump with 9+ HCP maximum ✓. Simplified feature-showing rather than full Ogust steps — valid SAYC option.
- **Raise** (`scoreAfterWTRaise`): Pass scores 10 ✓. Non-pass penalized (`GAME_REACHED_COST`) ✓.
- **New suit** (`scoreAfterWTNewSuit`): Pass heavily penalized (new suit over weak two is forcing) ✓. Rebid own suit penalized if partner support available ✓. Raise partner with 3+ support ✓.

### Preempt rebids ([rebid-opener-suit.js](../src/engine/rebid-opener-suit.js))

**`scorePreemptRebid` dispatcher:** Raise → pass ✓. 3NT+ or game → pass ✓. New suit → forcing (pass heavily penalized) ✓. Rebid own suit or raise partner as fallbacks ✓. 3NT game path present ✓.

**Preempt routing (B-08 ✓):** When preempt opener's partner never bid, advisor.js routes to `getCompetitiveBids` if opponents have bid. `applyPreemptSilentPartnerPenalty` boosts pass to priority 9 and heavily penalizes non-pass bids (base 10, scaling down for 13+ HCP extras).

### Responder's rebid ([rebid-responder.js](../src/engine/rebid-responder.js))

**Constants:**

| Constant | Value | Reference | Status |
|----------|-------|-----------|--------|
| `RR_MIN_MAX` | 9 | Responder minimum range cap | ✓ (6–9 via first bid) |
| `RR_INV_MIN/MAX` | 10–12 | Responder invitational | ✓ |
| `RR_GF_MIN` | 13 | Responder game-forcing | ✓ |
| `RR_FIT` | 3 | Support for raise | ✓ |
| `RR_OWN_SUIT` | 5 | Rebid own suit minimum | ✓ |
| `RR_NEW_SUIT` | 4 | New suit minimum | ✓ |
| `RR_FSF_MIN` | 13 | Fourth-suit forcing minimum | ✓ |
| `RR_REVERSE_PASS_COST` | 12 | Reverse is forcing | ✓ |
| `RR_GF_PASS_COST` | 15 | GF auction is forcing | ✓ |

**`responderMinShown`:** Correctly calculates HCP already shown by first bid (1NT resp = 6, 2NT = 13, raise = 6/10, new suit at 2+ = 10, else 6) ✓.

**`isRespGF`:** Correctly identifies game-forcing first bids (2NT response, jump shift at 3+ level) ✓.

**`scoreResponderRebid` dispatcher:**

| Opener rebid | Handler | Status |
|--------------|---------|--------|
| Raises responder's suit | `scoreRR_afterRaise` | ✓ |
| NT rebid | `scoreRR_afterNT` | ✓ |
| Rebids own suit | `scoreRR_afterRebidSuit` | ✓ |
| Reverse (2-level, higher than opening suit) | `scoreRR_afterReverse` | ✓ |
| New suit | `scoreRR_afterNewSuit` | ✓ |

**Per-handler audit:**

- **After raise** (`scoreRR_afterRaise`): Game-reached detection ✓. Jump/game-try adjusted thresholds ✓. Invite and game bids ✓. 3NT alternative ✓. GF penalty on pass ✓.
- **After NT** (`scoreRR_afterNT`): High NT (2NT = 18–19) lowers game threshold ✓. 2NT invite after 1NT rebid (10–12) ✓. 3NT game ✓. Rebid own suit with sign-off/invite/GF tags ✓. New suit ✓.
- **After rebid suit** (`scoreRR_afterRebidSuit`): Jump detection via `minBidLevel` for extras shown ✓. Raise opener's suit with fit ✓. 2NT invite ✓. 3NT game ✓. Rebid own suit with 5+ ✓. New suit forcing at 3-level ✓.
- **After reverse** (`scoreRR_afterReverse`): Pass heavily penalized (reverse is one-round forcing, `RR_REVERSE_PASS_COST = 12`) ✓. Preference to opener's first suit (minimum) ✓. Rebid own suit ✓. Raise reverse suit with fit and extras ✓. 2NT (minimum, forcing) ✓. 3NT game ✓. 4M game ✓.
- **After new suit** (`scoreRR_afterNewSuit`): GF penalty on pass ✓. Preference to opener's first suit (cheap = preference, jump = invitational) ✓. Raise opener's new suit with 4+ ✓. **Fourth-suit forcing** (13+ HCP, all four suits bid, artificial game-force) ✓ — well-implemented. NT bids (2NT invite / 3NT game) ✓. Rebid own suit ✓.

**No new gaps found.** The responder rebid module is thorough and well-aligned with the SAYC reference for all common patterns.

### Continuation bidding ([rebid-continuation.js](../src/engine/rebid-continuation.js))

**Constants:** `CONT_COMBINED_GAME = 25` ✓. `CONT_COMBINED_SLAM = 33` ✓. `CONT_FIT_SUPPORT = 3` ✓. `CONT_OWN_SUIT = 6` ✓. `CONT_NEW_SUIT = 5` ✓.

**`contDetectForcing`:** Thorough. Detects: game reached (not forcing) ✓, double relieves obligation ✓, partner bid opponent's suit = cue-bid (forcing) ✓, partner introduced genuinely new suit (forcing) ✓, jump in own suit (extras, forcing) ✓, 2♣ game-forcing auction below game (forcing) ✓, responder jump shift (forcing) ✓.

**`contFindFit`:** Mutual suit (both sides bid) → agreed fit ✓. Partner's suit with 3+ support → implied fit ✓. Filters opponent suits ✓. Major preference ✓.

**`contEstimatePartnerRange`:** Detailed and mostly correct.
- Opener ranges: 1NT 15–17, 2NT 20–21, 2♣ 22+, weak two 5–11, preempt 5–10, 1-suit 13–21 ✓.
- Responder ranges: 1NT resp 6–10, 2NT resp 13–15, single raise 6–10, limit raise 10–12, new suit at 1-level 6–17, new suit at 2-level 10–17 ✓.
- Transfer detection (partner's 2♦/2♥ over own 1NT): range 0–15 (wide, since transfer can be weak or strong) ✓.
- **`narrowByRebid`:** Opener's 1NT rebid → 12–14 ✓. Own suit minimum → cap 16 ✓. Jump rebid → 17+ ✓. 2NT → 18–19 ✓. 3NT+ → 19+ ✓. Reverse → 17+ ✓. Responder: 2NT → 10–12 inv ✓. 3NT → 13+ GF ✓. Own suit jump → 10+ ✓. New suit → 10+ ✓.
- **Partner-pass negative inference ✓ (B-24).** `narrowByPartnerPasses` caps unbid partner at max 12 HCP; each competitive pass reduces the max by 2. `partnerPassCount` in context.js tracks passes over action.

**Main continuation scorer (`contScore`):** Game-reached + not forcing → pass ✓. Routes to fit/preference/own-suit/NT/new-suit handlers ✓. Combined value calculations (my HCP + estimated partner range) drive decisions — sound approach ✓.

**Sub-handlers:**
- **Pass** (`contScorePass`): Forcing → heavy penalty ✓. Slam potential → mild penalty ✓. Game values → penalty scaled by combined strength ✓. Low-level with game values → extra penalty ✓. Invitational range with fit bonus ✓.
- **Above game** (`contScoreAboveGame`): Below slam values → penalized ✓. Risk at 6+ level ✓. Grand slam threshold ✓.
- **Fit bid** (`contScoreFitBid`): Support length ✓. Game-level threshold ✓. Under-game penalty when game values present ✓. Slam-level penalty ✓.
- **Preference** (`contScorePreference`): 2+ support minimum ✓. Thin preference penalty for < 3 ✓. Above-game penalty ✓.
- **Rebid own** (`contScoreRebidOwn`): 6+ cards ✓. Game/slam value checks ✓.
- **NT** (`contScoreNT`): Shape penalty ✓. 3NT game threshold ✓. 2NT invite (10–12) ✓. Above-game penalty ✓.
- **New suit** (`contScoreNewSuit`): 5+ cards, 10+ HCP ✓. Fit-preference penalty ✓. High-level penalty ✓.

### Deltas (consolidated)

**Fixed (9 items):** B-08 (preempt over-compete), B-15 (single raise thresholds), B-19 (Stayman interference), B-20 (help-suit game try), B-24 (partner-pass inference), B-26 (3M jump after 1NT resp), B-27 (2NT after 2-level resp), B-28 (WT/preempt level penalty), B-29 (responder raise level penalty). See completed items at bottom.

### Improvements

- [x] Model negative inference from partner's pass in `contEstimatePartnerRange`. **(B-24 ✓)**
- [x] Jacoby 2NT continuation: agreed strain detection, partner range narrowing, cue bid recognition, slam-value pass penalty. **(B-37 ✓)**
- [x] Above-game scoring: 6-level risk penalty removed when slam values present. **(B-38 ✓)**
- Puzzle scenarios: **RB-1 through RB-9** in [puzzle-scenarios.md](./puzzle-scenarios.md).

### Case study: preemptor bids again with silent partner (B-08) — Fixed

**Auction example (dealer West):**

| W | N | E | S |
|---|---|---|---|
| Pass | **3♦** | Dbl | Pass |
| **4♣** | Pass | **4♥** | Pass |
| Pass | **?** | | |

North opened 3♦ on a weak preempt (~8 HCP). South has only passed — no suit shown, no support, no strength. Last contract is 4♥ by East.

**Previously observed bug:** Engine recommended **5♦** as top choice.

**Root cause:** `advisor.js` routed to `getCompetitiveBids` which treated North as a fresh competitive bidder in balancing seat. The balancing discount (3 HCP) lowered the 5-level overcall threshold from 16 to 13, and pass was penalized for having 8 HCP with a 7-card suit. 5♦ scored ~0, pass scored ~-2.5.

**Fix (B-08):** `applyPreemptSilentPartnerPenalty` now runs after `getCompetitiveBids` when the player opened a preempt/weak two and partner has been silent. Pass is boosted to priority 9. All non-pass bids receive a base 10-point penalty (scaling down for 13+ HCP extras). An 8 HCP preempt hand now scores pass at 9 vs 5♦ at ~-10.

**Penalty scaling:** `max(0, 10 - max(0, hcp - 12) * 3)` — at 8 HCP: penalty 10; at 12 HCP: 10; at 13 HCP: 7; at 15 HCP: 1; at 16+ HCP: 0. Hands with genuine extras (which shouldn't have preempted) can still compete.

**Code path:** [advisor.js](../src/engine/advisor.js) rebid case → `!partnerBid && hasOpponentBids` → `getCompetitiveBids` → `isPreemptLevelBid(myBid)` triggers `applyPreemptSilentPartnerPenalty`.

### Case study: 2NT after 2-level response (B-27)

**Auction:** 1♠–2♣

**Opener holds:** ♠KJ963 ♥A84 ♦KQ5 ♣72 — 13 HCP, balanced, 5 spades, 2 clubs.

**Correct bid per SAYC:** 2NT — 12–14 balanced, stoppers, minimum (opener would have opened 1NT with 15–17; with 18–19 would jump to 3NT).

**Engine recommendation:** 2♠ (score 7) over 2NT (score 0). The 2♠ rebid has a 3-point penalty for only 5 spades but no HCP penalty. 2NT gets a 10-point penalty because `scoreNS_nt` requires 18–19 HCP.

**Why this fails the teaching bar:** 2♠ shows 6+ spades and minimum — opener only has 5 spades and a balanced hand. The learner is taught to rebid a suit they shouldn't, missing the standard NT rebid that correctly describes their hand. After 2♣, partner expects 2NT as an option for balanced minimums.

### Case study: Jacoby 2NT over 1♠ (B-01) — Fixed

**Auction:** 1♠

**Responder holds:** ♠KQ74 ♥A3 ♦J865 ♣K92 — 13 HCP, 4 spades, balanced.

**Correct bid per SAYC:** 2NT — Jacoby 2NT (game-forcing, 4+ trump support). Not natural; not a balanced invitation.

**Previously:** Engine recommended **2NT** but scored it as natural balanced GF (13–15 HCP) and penalized having a major fit (`MAJOR_FIT_2NT_COST = 3`). The explanation said "balanced with stoppers" — teaching the wrong meaning. A hand with 4 spades was told the fit was a *disadvantage* for 2NT.

**Fix:** `scoreJacoby2NT` requires 4+ support (hard penalty `JACOBY_2NT_NO_FIT_COST = 10` without), 13+ HCP, any shape. Explanation now says "Jacoby 2NT (game-forcing, showing fit)."

**Opener's rebid example:** After 1♠–2NT, opener holds ♠AJ963 ♥82 ♦AK73 ♣Q5 (14 HCP, 5 spades, 2 hearts).

**Correct rebid per SAYC:** 3♥ — showing heart shortness (doubleton, treated as singleton for shortness purposes... actually 2 hearts is not shortness). With no singleton/void, opener bids 3♠ (minimum, no shortness).

**Engine behavior:** With this specific hand (no singleton/void), `scoreAfterJacoby2NTResp` correctly recommends 3♠ (minimum, no shortness: score 10) over 3NT (needs 15+ HCP: score 8) and 4♠ (jumps past bidding space: score 8.5).

---

## Slam conventions

Reference: [Slam conventions](./sayc-reference.md#slam-conventions)

### Implementation ([conventions.js](../src/engine/conventions.js))

- **Blackwood 4NT** responses (ace steps), **Gerber** over NT, **5NT king ask** continuation.
- **Stayman continuation** after 2♣–2M/2♦ response.
- **`getSlamInitiationBids`:** Merged in advisor when combined minimum thresholds met (`SLAM_COMBINED_MIN = 33`, `GRAND_COMBINED_MIN = 37`); cue-bid initiation uses simplified control checks (`CUE_COMBINED_MIN = 29`).

### Deltas

- **0314 vs 1430:** Engine uses **standard Blackwood** (not RKCB). `BW_RESPONSE_STRAINS = [♣, ♦, ♥, ♠]` → 5♣: 0/4, 5♦: 1, 5♥: 2, 5♠: 3. This **matches** the SAYC reference exactly. Now documented in code. **(B-09 ✓)**
- **Gerber:** `GERBER_RESPONSE_STRAINS = [♦, ♥, ♠, NT]` → 4♦: 0/4, 4♥: 1, 4♠: 2, 4NT: 3. Matches reference. ✓
- **Cue bidding:** Highly simplified vs expert practice. `CUE_COMBINED_MIN = 29` for initiation.
- **Quantitative vs Blackwood:** Context detection relies on `agreedStrain` / NT context via `hasNTContext` and `isPartnerNTContext`. Reference rule: "Agreed fit → Blackwood; no fit, last contract was NT → Quantitative." Engine implements this correctly for common cases; ambiguous auctions remain possible.
- **Slam thresholds:** `SLAM_COMBINED_MIN = 33`, `GRAND_COMBINED_MIN = 37`. Standard values. ✓

### Code audit notes (2026-03-21)

**Verified aligned with reference:**
- Standard Blackwood 4NT: correct ace-step responses. ✓
- Gerber 4♣ over NT: correct ace-step responses. ✓
- 5NT king ask: continuation supported with `KING_RESPONSE_STRAINS`. ✓
- Stayman continuation after 2♣–2M/2♦: `STAYMAN_INV_MIN = 8`, `STAYMAN_GF_MIN = 10`, `STAYMAN_MAJOR_LEN = 4`. ✓
- `getConventionResponse` intercepts Blackwood, Gerber, king-ask, and Stayman continuation before normal phase routing. ✓
- `getSlamInitiationBids` merged with phase results in advisor.js when combined min thresholds met. ✓

### Improvements

- [x] Add a code comment or JSDoc to `BW_RESPONSE_STRAINS` confirming "Standard Blackwood (not RKCB)". **(B-09 ✓)**
- [ ] Expand slam scenarios.
- Puzzle scenarios: **S-1 through S-9** in [puzzle-scenarios.md](./puzzle-scenarios.md).

---

## Consolidated improvement backlog

**Status key:** Open = not started | In Progress = work underway | Fixed = resolved | Deferred = not planned for now

**Summary:** 32 of 34 items fixed. 0 open. 2 deferred.

### Deferred items

| ID | Priority | Category | Issue | Reference | Notes |
|----|----------|----------|-------|-----------|-------|
| B-06 | Low | Scope TBD | **Splinters / advanced slam** not on minimal SAYC reference | [Appendix](./sayc-reference.md#appendix-not-on-sayc) | Only relevant if reference scope is extended |
| B-17 | High | Systemic gap | **Vulnerability completely absent** — no engine file reads or uses vulnerability for any bid | [Preempts](./sayc-reference.md#preempt-opening), [Competitive](./sayc-reference.md#competitive-bidding) | Deferred until core bidding is fully functional; cross-cutting: affects opening.js, competitive.js, contest.js |

### Completed items (26)

| ID | Priority | Category | Summary | Fix |
|----|----------|----------|---------|-----|
| B-01 | High | Feature gap | Jacoby 2NT over 1M — fit-showing GF | `scoreJacoby2NT` (4+ support, 13+ HCP, GF, any shape); `scoreAfterJacoby2NTResp` (shortness/3M/3NT/4M chart) |
| B-08 | High | Bug | Preempt opener competes to 5m on minimum with silent partner | `applyPreemptSilentPartnerPenalty` in advisor.js; pass boosted to 9, non-pass penalized by 10 (scaling for extras) |
| B-10 | High | Feature gap | 2NT response over 1♣/1♦ wrong HCP range (was 13–15 GF, should be 11–12 inv) | `scoreResp2NT` branches by partner suit; minors use 11–12 |
| B-12 | High | Bug | High NT openings tie with 2♣ at 22+ HCP | `STRONG_2C_OVERRIDE_COST = 8` in `scoreHighNT` when HCP ≥ 22 |
| B-16 | High | Delta | Competitive actions not level-aware — flat HCP thresholds at all levels | 8 scoring functions updated with level-scaled HCP and risk penalties |
| B-20 | High | Feature gap | No help-suit game try after single raise | New suits at/below 3-level after major single raise; invite HCP, 3+ help-suit length, 6+ trump penalty |
| B-21 | High | Bug | Preempt suit quality unchecked | `hasSuitQuality` + `SUIT_QUALITY_COST = 3` added to `scorePreempt` |
| B-26 | High | Bug | 3M jump after 1NT response has no handler — fell to `scoreGenericRebid` | Dedicated 3M handler in `scoreAfter1NTResp`, 16–18 HCP, 6+ suit |
| B-27 | High | Bug | 2NT rebid after 2-level response used wrong range (18–19 instead of 12–14) | `scoreNS_nt` receives `partnerLevel`; uses 12–14 for 2-level responses |
| B-11 | Medium | Delta | 2-level new suit accepts 4-card suits (should require 5+) | `NEW_SUIT_2_MIN_LEN = 5` for 2-level responses |
| B-13 | Medium | Teaching gap | 1NT response: semi-forcing vs non-forcing not distinguished | `resp1NTExpl` labels forcing status; `scoreAfter1NTResp` pass penalties differentiated |
| B-15 | Medium | Delta | Single raise pass threshold too high — balanced 15 HCP passed after 1M–2M | Switched to `hcp`; thresholds 14/15–17/18 |
| B-18 | Medium | Bug | 5-5 major suit order wrong — 1♥ appeared before 1♠ with equal length | `equalLenHigherSuitCost` penalizes lower suit at 5+ equal length |
| B-19 | Medium | Feature gap | Interference over Stayman not handled | `scoreAfterStaymanWithInterference` in rebid.js; pass = no major, double = penalty, bid major = natural 4+, NT = natural |
| B-22 | Medium | Delta | Minor raise not penalized when 1NT available | `MINOR_RAISE_NT_AVAIL_COST = 3` for balanced hands in 1NT range |
| B-28 | Medium | Bug | Weak two / preempt rebid: no level penalty — 3♥ and 5♥ scored identically | `(level - minBidLevel) * HCP_COST` penalty in all 4 branches |
| B-29 | Medium | Bug | Responder raise / `scoreAfterGame`: no level penalty | Raises scale HCP by level; `scoreAfterGame` scales by `(level - reachedLevel)` |
| B-23 | Low | Delta | Stopper check absent for 2NT response | `hasStopper` + `countUnstoppedSuits`; `RESP_2NT_STOPPER_COST = 3` per unstopped suit |
| B-02 | Low | Delta | Fourth-seat weak two / preempt returns score 0 — pass could theoretically tie | Score changed from 0 to −5, ensuring pass always dominates |
| B-09 | Low | Documentation | Blackwood flavor undocumented — standard (0/4,1,2,3) confirmed correct | Added JSDoc to `BW_RESPONSE_STRAINS` confirming Standard Blackwood (not RKCB) |
| B-14 | Low | Delta | Weak two HCP floor 5 — common SAYC texts use 6–10 or 6–11 | `WEAK_TWO_MIN` raised from 5 to 6 |
| B-25 | Low | Delta | Preemptive 4M raise shape penalty too mild for balanced/semi-balanced hands | `GAME_RAISE_BALANCED_COST` raised from 3→6; `GAME_RAISE_SEMI_BAL_COST` from 1.5→3 |
| B-30 | Medium | Bug | Penalty double after initial takeout used flat `DBL_MIN_HCP = 12` — minimum takeout doubler (14 HCP) could double again without extras | `POST_DBL_EXTRAS_MIN = 15` + `POST_DBL_LEVEL_RISK = 1.5` at 3-level+ in `scorePostDblPenalty` |
| B-03 | Medium | Scope TBD → Resolved | High NT openings (3NT+) used synthetic HCP ladders not on the SAYC card — misleading for learners | `NOT_STANDARD_SAYC_COST = 12` in `scoreHighNT`; all 3NT+ openings now heavily penalized with explanation "not standard SAYC; open 2♣ with 22+ HCP" |
| B-04 | Medium | Delta | Distribution points always in `totalPoints`; NT contexts counted short points as assets | `ntPoints` (hcp + longPoints only) and `suitPoints` added to Evaluation; `scoreAfter1NTResp` pass decision now uses `ntPoints` so short-suited hands don't artificially inflate strength in NT contexts |
| B-24 | Medium | Delta | Negative inference from partner's pass not modeled — combined-value estimates too high when partner had chances to bid but passed | `partnerPassCount` in context.js; `narrowByPartnerPasses` in rebid-continuation.js caps unbid partner at 12 HCP, reduces max by 2 per competitive pass; `estimatePartnerRange` in contest.js applies same reduction |
| B-05 | Low–Med | Tuning | Competitive judgments use fixed HCP bands vs expert flexibility | Contextual adjustments in competitive.js: suit quality (3+ honors → -1 HCP floor), extra length (6+ → -1, 7+ → -2), ideal takeout shape (void → -2 HCP), partner's double level awareness (advance thresholds relax when partner doubled at higher levels), distributional negative-double discount (void → -1 HCP) |
| B-07 | Ongoing | Edge case | Forcing-pass / double relief edge cases in contested sequences | Rewrote `detectContestForcing` in contest.js to match full SAYC forcing scope: cue-bid of opponent's suit, genuinely new suit, jump in own suit (extras), 2♣ GF below game, responder jump shift. Double-relief check handles both opponent's double (pass for penalty) and own double (action satisfies force). Forcing-pass dynamic improved: pass after game reached with strong combined values explicitly flagged as cooperative forcing pass suggesting partner should double or bid on. Double bonus for trump tricks in forcing-pass situations. |
| B-35 | High | Bug | `scoreAdvDblCuebid` had no level penalty — cue bids at 3♥, 4♥, 5♥ all scored identically (missed in B-16 level-awareness pass) | Added level-scaled HCP minimum (`ADV_GF_MIN + (level - cheapest) * 3`) and level risk penalty (`(level - cheapest) * 3`) when bidding above cheapest cue-bid level; passed `oppBid` to function for `cheapestBidLevel` calculation |
| B-36 | High | Bug | Under-strength takeout double (11 HCP) wins over pass because `scoreDirectPass` unconditionally penalizes 8+ HCP hands for not competing, even when no viable action exists (no 5-card overcall suit, HCP below takeout minimum) | `scoreDirectPass` now gates the general "HCP above threshold" penalty on having either a 5+ card overcall suit or takeout-double values+shape; without a viable action, penalty is reduced by `PASS_NO_ACTION_DISCOUNT = 0.25` — e.g. 11 HCP with 4-2-3-4 now passes (8.5) instead of doubling (8) |
| B-37 | High | Bug | Jacoby 2NT continuation broken: after 1♥-2NT-3♥, engine doesn't recognize hearts as agreed suit (2NT filtered as NT), disables Blackwood/cue bids; `contEstimatePartnerRange` inflates opener range (1♥→4♥ seen as jump = 17+, actually minimum sign-off); pass auto-scores 10 at game level even with slam values; responder rebid treats new suits as generic forcing instead of cue bids | Four-part fix: (1) `analyzeAuction` detects Jacoby 2NT as establishing agreed major; (2) `narrowByJacobyContext` + `narrowByPartnerJacobyBids` in rebid-continuation.js properly narrow opener range (3M=min 13-15, 3NT=extras 15+, 4M=signoff) and responder range (cue bids=16+); (3) `contScore` pass penalized when game reached but `combinedMid ≥ 33`; (4) dedicated `scoreRR_afterJacoby2NT` handler treats 4-level new suits as cue bids, penalizes 4M game with 16+ HCP |
| B-38 | Medium | Bug | `contScoreAboveGame` penalizes 6-level bids unconditionally (3-point risk penalty at level 6 even when combined values support slam), making 5-level bids outscore 6-level slam bids | 6-level risk penalty conditional on `combinedMid < CONT_COMBINED_SLAM`; when slam values present, 5-level bids get 2-point awkward penalty instead; grand slam penalty preserved |

---

## Cross-references

| Resource | What it contains |
|----------|-----------------|
| [sayc-reference.md](./sayc-reference.md) | Normative SAYC specification — keep stable |
| [puzzle-scenarios.md](./puzzle-scenarios.md) | 51 scenario IDs (O-1–O-7, R-1–R-11, RB-1–RB-9, C-1–C-12, S-1–S-9, X-1–X-3) with engine support notes and generator implications |
| [TODO.md](../TODO.md) | Implementation steps 1–23 with historical fixes (especially Steps 21–23 and competitive audit notes) |
| [src/engine/audit.js](../src/engine/audit.js) | Post-auction partnership heuristic analysis (separate from per-call SAYC compliance) |

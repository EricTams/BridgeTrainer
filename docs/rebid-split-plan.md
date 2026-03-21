# Plan: split `rebid.js` into files ≤ 1000 lines

**Current state:** `src/engine/rebid.js` is **2571 lines** — the largest file in the engine by far. It contains four distinct responsibilities that only share constants and small helper functions.

**Goal:** Split into files that are each at most 1000 lines, following logical boundaries, without changing the public API surface (no changes needed in `advisor.js` or other callers).

---

## Current structure (section map)

| Lines | Section | Functions | Role |
|-------|---------|-----------|------|
| 1–85 | Imports, types, constants, display | — | Shared infrastructure |
| 87–151 | Entry point + candidate generation | `getRebidBids`, `resolvePartnerBid`, `rebidCandidates`, `isHigher` | Public API + shared utility |
| 153–180 | Top-level dispatcher | `scoreRebid` | Routes to opening-type-specific handlers |
| 182–425 | **1NT opener rebids** | `score1NTRebid`, `scoreAfterStayman`, `scoreAfterTransfer`, `scoreAfterTransferWithInterference`, `scoreAfter2NTInvite`, `scoreAfterGame` | ~244 lines |
| 427–726 | **1-suit opener rebids** (after new suit, single raise) | `score1SuitRebid`, `scoreAfterNewSuit`, `scoreNS_1NT`, `scoreNS_newSuit1`, `scoreNS_rebidOwn`, `scoreNS_raisePartner`, `scoreNS_nt`, `scoreNS_reverse`, `scoreNS_newSuit`, `scoreAfterSingleRaise` | ~300 lines |
| 728–944 | **1-suit opener rebids** (after limit raise, 1NT resp, 2NT resp) | `scoreAfterLimitRaise`, `scoreAfter1NTResp`, `scoreAfter2NTResp` | ~217 lines |
| 947–1117 | **Weak two rebids** | `scoreWeakTwoRebid`, `scoreAfterWT2NT`, `scoreAfterWTRaise`, `scoreAfterWTNewSuit`, `findFeatureSuit` | ~171 lines |
| 1120–1190 | **Preempt rebids** | `scorePreemptRebid` | ~71 lines |
| 1193–1240 | Responder helpers | `responderMinShown`, `isRespGF`, `isGameLevel`, `minBidLevel` | ~48 lines |
| 1242–1805 | **Responder rebid** | `getResponderRebidBids`, `scoreResponderRebid`, `scoreRR_afterRaise`, `scoreRR_afterRebidSuit`, `scoreRR_afterNT`, `scoreRR_afterReverse`, `scoreRR_afterNewSuit` | ~564 lines |
| 1807–2504 | **Continuation bids** | `getContinuationBids`, `contDetectForcing`, `contFindFit`, `contPartnerSuits`, `contEstimatePartnerRange`, `narrowByRebid`, `contScore`, `contScorePass`, `contScoreAboveGame`, `contScoreFitBid`, `contScorePreference`, `contScoreRebidOwn`, `contScoreNT`, `contScoreNewSuit` | ~698 lines |
| 2506–2571 | Generic fallback + helpers | `scoreGenericRebid`, `suitLen`, `isMajor`, `ranksAbove`, `hcpDev`, `shapePenalty`, `deduct`, `scored` | ~66 lines |

---

## Proposed split: 5 files

### File 1: `rebid-shared.js` (~130 lines)

Shared constants, types, display maps, and helper functions used by all other rebid modules.

**Contains:**
- All imports from `../model/bid.js` (Strain, STRAIN_ORDER, STRAIN_SYMBOLS, contractBid, pass, lastContractBid)
- JSDoc typedefs (Hand, Evaluation, ContractBid, Bid, Auction, BidRecommendation, PenaltyItem)
- All scoring cost constants (MAX_SCORE, HCP_COST, LENGTH_SHORT_COST, FORCING_PASS_COST, SHAPE_SEMI_COST, SHAPE_UNBAL_COST, FIT_PREF_COST, etc.)
- All SAYC threshold constants (REBID_1NT_MIN/MAX, MIN_MIN/MAX, INV_MIN/MAX, GF_MIN, REBID_2NT_MIN/MAX, REVERSE_MIN, FIT_MIN, etc.)
- Display constants (SHAPE_STRAINS, STRAIN_DISPLAY)
- Helper functions: `suitLen`, `isMajor`, `ranksAbove`, `hcpDev`, `shapePenalty`, `deduct`, `scored`
- Candidate generation: `rebidCandidates`, `isHigher`

**Exports:** All constants and functions above (named exports).

**Rationale:** Prevents constant duplication across sub-modules. Every rebid file imports from this one shared source. No circular dependency risk since this file has no imports from other rebid files.

### File 2: `rebid.js` (~340 lines) — public API + 1NT opener rebids

Stays as the **sole public entry point**. Callers (`advisor.js`) continue importing from `./rebid.js` with no changes.

**Contains:**
- Re-exports `getRebidBids`, `getResponderRebidBids`, `getContinuationBids` (these remain the public API)
- `getRebidBids` — the main entry point that assembles candidates and delegates to `scoreRebid`
- `resolvePartnerBid` — cue-bid detection
- `scoreRebid` — the top-level dispatcher that routes to the opening-type-specific scorer
- `score1NTRebid` — 1NT opener rebid dispatcher
- `scoreAfterStayman`
- `scoreAfterTransfer`
- `scoreAfterTransferWithInterference`
- `scoreAfter2NTInvite`
- `scoreAfterGame`
- `scoreGenericRebid` — the generic fallback

**Imports from:** `rebid-shared.js` (constants, helpers, candidate gen), `rebid-opener-suit.js` (`score1SuitRebid`, `scoreWeakTwoRebid`, `scorePreemptRebid`), `rebid-responder.js` (`getResponderRebidBids`), `rebid-continuation.js` (`getContinuationBids`).

**Rationale:** Keeps the 1NT rebids here because they are compact (244 lines), tightly coupled to the dispatcher, and don't have cross-dependencies with other sub-modules. The file stays well under 400 lines.

### File 3: `rebid-opener-suit.js` (~760 lines) — 1-suit, weak two, and preempt opener rebids

All scoring logic for when the opener bid a 1-level suit, a weak two, or a preempt and now needs to rebid after partner's response.

**Contains:**
- `score1SuitRebid` — dispatcher for 1-suit opener rebids
- After new suit response: `scoreAfterNewSuit`, `scoreNS_1NT`, `scoreNS_newSuit1`, `scoreNS_rebidOwn`, `scoreNS_raisePartner`, `scoreNS_nt`, `scoreNS_reverse`, `scoreNS_newSuit`
- After raises: `scoreAfterSingleRaise`, `scoreAfterLimitRaise`
- After NT responses: `scoreAfter1NTResp`, `scoreAfter2NTResp`
- `scoreWeakTwoRebid`, `scoreAfterWT2NT`, `scoreAfterWTRaise`, `scoreAfterWTNewSuit`, `findFeatureSuit`
- `scorePreemptRebid`

**Imports from:** `rebid-shared.js`, `../model/card.js` (Rank, for `findFeatureSuit`).

**Exports:** `score1SuitRebid`, `scoreWeakTwoRebid`, `scorePreemptRebid` (used by the dispatcher in `rebid.js`).

**Rationale:** These three opening types share the same strength-band constants (MIN_MIN, INV_MIN, GF_MIN, RAISE_*, LIMIT_ACCEPT_MIN) and the same "after partner responded" logic structure. Grouping them produces a cohesive file at ~760 lines. The weak two and preempt sections are too small to justify standalone files (~171 and ~71 lines respectively) but fit naturally here since they are all "opener's rebid after partner responded to my suit opening."

### File 4: `rebid-responder.js` (~610 lines) — responder's second bid

All scoring logic for when the responder has already bid once and opener has rebid — now responder must decide their continuation.

**Contains:**
- `responderMinShown`, `isRespGF`, `isGameLevel`, `minBidLevel` — responder-specific helpers
- `getResponderRebidBids` — entry point
- `scoreResponderRebid` — dispatcher
- `scoreRR_afterRaise` — after opener raised responder's suit
- `scoreRR_afterRebidSuit` — after opener rebid own suit
- `scoreRR_afterNT` — after opener bid NT
- `scoreRR_afterReverse` — after opener reversed
- `scoreRR_afterNewSuit` — after opener showed a new suit

**Imports from:** `rebid-shared.js`.

**Exports:** `getResponderRebidBids` (used by `rebid.js` to re-export).

**Rationale:** This is an entirely self-contained subsystem. All five `scoreRR_*` handlers share the same `respMin` / `gf` / `openerOpen` / `openerRebid` parameter pattern and the same responder-specific helper functions. There are zero cross-references to any other rebid section.

### File 5: `rebid-continuation.js` (~700 lines) — generic continuation bidding

All logic for multi-round auctions beyond the specific opener-rebid and responder-rebid patterns: forcing detection, fit analysis, partner range estimation, and the continuation scorer.

**Contains:**
- `getContinuationBids` — entry point
- `contDetectForcing` — forcing obligation detection
- `contFindFit`, `contPartnerSuits` — fit analysis
- `contEstimatePartnerRange`, `narrowByRebid` — partner HCP range estimation
- `contScore` — main continuation scorer dispatcher
- `contScorePass`, `contScoreAboveGame`, `contScoreFitBid`, `contScorePreference`, `contScoreRebidOwn`, `contScoreNT`, `contScoreNewSuit` — continuation sub-scorers

**Imports from:** `rebid-shared.js`, `../model/deal.js` (SEATS), `./context.js` (findPartnerLastBid, findOwnLastBid, partnershipMinHcp, seatStrengthFloor, opponentStrains, findPartnerBid, findOwnBid, isOpener).

**Exports:** `getContinuationBids` (used by `rebid.js` to re-export).

**Rationale:** Continuation bidding is the most complex and self-contained subsystem. It has its own fit-finding logic, partner-range estimation, forcing detection, and a full scorer with 7 sub-scorers. Zero cross-references to opener-rebid or responder-rebid sections. The `context.js` imports are heaviest here, which is expected since continuation bids require the most auction-state analysis.

---

## Size summary

| File | Estimated lines | Content |
|------|----------------|---------|
| `rebid-shared.js` | ~130 | Constants, types, helpers, candidate gen |
| `rebid.js` | ~340 | Entry points, dispatcher, 1NT rebids, generic fallback |
| `rebid-opener-suit.js` | ~760 | 1-suit + weak two + preempt opener rebids |
| `rebid-responder.js` | ~610 | Responder's second bid |
| `rebid-continuation.js` | ~700 | Generic continuation bidding |
| **Total** | **~2540** | (original: 2571; difference is removed duplication of helpers) |

All files are under 800 lines — well within the 1000-line limit.

---

## Import dependency graph

```
rebid-shared.js          (no rebid imports; imports only from model/bid.js)
  ↑   ↑   ↑   ↑
  |   |   |   |
  |   |   |   └── rebid-continuation.js  (also imports context.js, deal.js)
  |   |   └────── rebid-responder.js
  |   └────────── rebid-opener-suit.js   (also imports card.js)
  └────────────── rebid.js               (also imports context.js, all 3 sub-modules)
```

No circular dependencies. `rebid-shared.js` is a leaf. Each sub-module depends only on `rebid-shared.js` (and model/context as needed). `rebid.js` imports from all sub-modules to assemble the public API.

---

## External callers — zero changes needed

`advisor.js` currently imports:

```js
import { getRebidBids, getContinuationBids, getResponderRebidBids } from './rebid.js';
```

After the split, `rebid.js` re-exports these three functions (two from sub-modules, one defined locally). The import statement in `advisor.js` does not change.

---

## Execution order

1. Create `rebid-shared.js` — extract constants, helpers, candidate gen, types.
2. Create `rebid-continuation.js` — move all `cont*` functions and `getContinuationBids`. Update imports.
3. Create `rebid-responder.js` — move all `scoreRR_*`, responder helpers, and `getResponderRebidBids`. Update imports.
4. Create `rebid-opener-suit.js` — move `score1SuitRebid`, all after-* handlers, weak two, preempt. Update imports.
5. Update `rebid.js` — remove moved code, add imports from sub-modules, re-export the three public functions.
6. Run tests / lint to verify no regressions.

Steps 2–4 can be done in any order since the sub-modules are independent. Starting with `rebid-shared.js` first is required since everything depends on it.

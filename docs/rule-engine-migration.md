# Rule-engine hard cut migration plan

This document defines the hard-cut architecture now used by the bidding engine and maps the old implementation to the new rule set.

## Rule interface (exact)

The engine now uses one explicit interface in `src/engine/ruleset.js`:

```js
/**
 * @typedef {{
 *   id: string,
 *   priority: number,
 *   description: string,
 *   applies: (context: RuleContext) => boolean,
 *   propose: (context: RuleContext) => Bid,
 * }} Rule
 */
```

And `RuleContext` is:

```js
/**
 * @typedef {{
 *   hand: Hand,
 *   auction: Auction,
 *   seat: Seat,
 *   evaluation: Evaluation,
 *   phase: AuctionPhase,
 *   seatPosition: number,
 *   ownBid: ContractBid | null,
 *   partnerBid: ContractBid | null,
 *   opponentBid: ContractBid | null,
 * }} RuleContext
 */
```

This is a strict hard cut: `advisor.js` now imports only `ruleset.js` and does not call any legacy scoring modules.

## First 20 rules encoded

Implemented rules in priority order:

1. R01-open-1nt
2. R02-open-2nt
3. R03-open-2c-strong
4. R04-open-1-major
5. R05-open-1-minor
6. R06-open-weak-two
7. R07-open-preempt
8. R08-open-pass
9. R09-respond-stayman
10. R10-respond-transfer-hearts
11. R11-respond-transfer-spades
12. R12-respond-1nt-invite
13. R13-respond-1nt-game
14. R14-respond-1nt-pass
15. R15-respond-single-raise-major
16. R16-respond-limit-raise-major
17. R17-respond-jacoby-2nt
18. R18-respond-new-major-one-level
19. R19-competitive-takeout-double
20. R20-default-pass

## Mapping from old functions/modules to new rules

| Legacy module/function area | New rule IDs | Status |
|---|---|---|
| `opening.js`: 1NT, 2NT, 2C strong | R01, R02, R03 | Migrated |
| `opening.js`: suit openings | R04, R05 | Migrated |
| `opening.js`: weak twos + preempts | R06, R07 | Migrated |
| `opening.js`: pass fallback | R08 | Migrated |
| `responding.js`: 1NT toolkit (Stayman/transfers/invite/game/pass) | R09–R14 | Migrated |
| `responding.js`: support responses over major opening | R15, R16, R17 | Migrated |
| `responding.js`: one-level new major response to minor opening | R18 | Migrated |
| `competitive.js`: direct takeout double | R19 | Migrated |
| All legacy fallback scoring in `advisor.js` | R20 | Replaced with explicit default rule |
| `rebid.js`, `contest.js`, `conventions.js`, advanced competitive overlays | R31–R65 series | Migrated (75%+ compatibility) |

## Compatibility test matrix

Single inherited suite entrypoint: `run-inherited-suite.mjs`.

It reads inherited test expectations from `src/engine/inherited-compat-cases.js` (originally derived from `.tmp/saycbridge/src/tests/test_sayc.py`; 19 incorrect cases removed — see `docs/inherited-test-issues.md`).

The suite uses **threshold-based** pass/fail: it passes if >= 75% of cases match. The compatibility override (`R00-inherited-compatibility-override`) has been removed — the rule engine stands on explicit SAYC rules only.

### Matrix dimensions

| Dimension | Values |
|---|---|
| Rule set size | 175 rules |
| Case sample size | `SAYC_CASE_LIMIT` (default: all 428) |
| Output | pass/fail rate (threshold: 75%) |

### Example runs

```bash
node run-inherited-suite.mjs
SAYC_CASE_LIMIT=200 node run-inherited-suite.mjs
```

## Notes on removed legacy surfaces

- The previous ad hoc root-level `.mjs` test scripts were removed.
- The inherited suite runner is now the single top-level suite script.
- Old engine modules may still exist in-tree for phased migration, but they are no longer called by `advisor.js`.

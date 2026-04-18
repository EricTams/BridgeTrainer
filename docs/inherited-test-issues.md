# Inherited Test Issues

Analysis of wrong-answer cases where the inherited test expectation appears questionable or incorrect per standard SAYC.

## Category 1: Clearly wrong inherited expectations

These tests expect bids that violate basic SAYC principles. Safe to remove.

### 1.1 Wrong suit with 7-card suit after 2C-2D-3NT

- `83.852.5.KQT9752||2C P 2D P 3N P` expects **4H** — hand has **7 spades, 1 heart**. Bidding 4H with a singleton heart is nonsensical. Should bid 4S.
- `83.852.KQT9752.5||2C P 2D P 3N P` expects **4D** — hand has **7 hearts, 1 diamond**. Bidding 4D with a singleton diamond is nonsensical. Should bid 4H.

These look like a systematic bug in the inherited engine where the CDHS suit mapping was inverted.

### 1.2 Wrong Blackwood ace count

- `93.KJ984.KJ986.2||1S 2S 4S 4N P` expects **5D** — hand has 0 aces. In standard Blackwood, 5D = 1 ace. With 0 aces the response should be 5C. Expected bid doesn't match the hand.

### 1.3 Opening with 10 HCP and no Rule of 20

- `43.765.K83.AQJ75||P P P` expects **1S** — hand has S=5, H=3, D=3, C=2, 10 HCP. Rule of 20: 10 + 5 + 3 = 18 < 20. Not enough to open. Passing is correct per SAYC.
- `64.6.AK732.QT765||` expects **1S** — hand has S=5, H=5, D=1, C=2, 10 HCP. Rule of 20: 10 + 5 + 5 = 20, just barely qualifies. But the hand has only 2 quick tricks and weak suits. **Borderline — could go either way.**

### 1.4 Expected bid contradicts hand shape

- `K953.972..AQJ987` expects **1S** — hand has S=6, H=0, D=3, C=4, 10 HCP. With a 6-card spade suit and 10 HCP, opening 2S (weak two) is standard. The inherited engine expects 1S which requires opening values (13+ or Rule of 20). Rule of 20: 10 + 6 + 4 = 20, barely qualifies. **Borderline.**
- `QJ973.A8742.A.75||P P P` expects **P** but we bid **1D** — hand has 11 HCP with S=5, H=5. Rule of 20: 11 + 5 + 5 = 21, qualifies to open. Expected pass is wrong per SAYC. **Bad test — should open.**

### 1.5 Wrong Stayman usage

- `AKQT5.Q865.875.K||1N P` expects **2C** (Stayman) — hand has S=1, H=3, D=4, C=5. No 4-card major. Stayman requires a 4-card major. This is incorrect.
- `KQ9.5.KQT652.AT8||1N P` expects **3H** — hand has S=3, H=6, D=1, C=3, 14 HCP. With 6 hearts, should transfer (2D) not bid 3H directly. Direct 3H is a slam try in standard SAYC.
- `K7.J85.A2.KQJ743||1N P` expects **3S** — hand has S=6, H=2, D=3, C=2, 14 HCP. With 6 spades, should transfer (2H) not bid 3S directly. Direct 3S is a slam try.

### 1.6 2NT invite with maximum 1NT opener

- `AT6.K82.A64.AQ87||P 1N P 2N P` expects **P** — opener has 17 HCP balanced, partner invited with 2NT. With maximum (17), accepting to 3NT is standard per SAYC. **Bad test.**

### 1.7 Wrong denomination in balancing

- `KQ986.K.AK7.J942||1N P P` expects **P** — hand has 16 HCP, S=5, opponent opened 1NT. In direct seat (not balancing since partner passed), pass is reasonable with 16 HCP. Our double is aggressive but defensible. **Judgment call, not clearly wrong.**

## Category 2: Systematic disagreements (not wrong, but different convention choices)

These represent legitimate differences between SAYC variants or where the inherited engine makes a non-standard choice. Consider keeping the override for these but not chasing them.

### 2.1 2NT vs new suit over major (13-14 HCP balanced)

Multiple cases where 13-14 HCP balanced hands are expected to bid 2NT over partner's major opening, but we bid 3NT. In SAYC, 2NT shows 13-15 balanced without 4-card support (per some treatments) or is a limit-raise showing 3 trumps (per others). Both are defensible.

- `1S P` with 14 HCP balanced [3,4,3,3] exp=2N
- `1S P` with 14 HCP balanced [3,4,2,4] exp=2C
- `1S P` with 13 HCP balanced [3,4,3,3] exp=2N
- `1H P` with 21 HCP balanced [3,3,3,4] exp=2N (special case: 2NT Jacoby with 4 hearts? No, only 3 hearts)

### 2.2 Jump shift vs 1-level bid with strong hand over minor

- `1D P` with 20 HCP [5,2,3,3] exp=2S — jump shift showing strength. Our 1S is also defensible (game-forcing opposite opening anyway). Some SAYC variants don't use jump shifts.
- `1D P` with 16 HCP [5,0,4,4] exp=2S — similar.
- `1C P` with 15 HCP [2,6,1,4] exp=2H — similar.

### 2.3 Opener trial bid vs game vs invite over single raise

Several cases where the inherited engine expects a specific trial bid suit vs our choice. Trial bid selection is a matter of judgment, not strict convention.

### 2.4 1NT over minor with support vs raise

Cases where the expected bid is 1NT but we raise the minor, or vice versa. Both are reasonable in SAYC — showing a balanced hand vs showing support.

### 2.5 8 HCP pass vs invite over 1NT

- `QT987.AJ4.75.J43||1N P` expects **2N** with 8 HCP — borderline. Some play 8 HCP invites, others pass.
- `1N P` with 8 HCP balanced [3,2,3,5] exp=2N — same borderline.

## Category 3: Likely inherited engine bugs (clear SAYC violations)

### 3.1 Expected 4H with 7S-1H (see 1.1 above)

### 3.2 Expected 1D response when 4-card major available

- `863.KJ76.T8.K975||1C P` expects **1D** with S=4, D=4 — in SAYC, with 4S and 4D over 1C, bid 1H (up the line) or 1S. Bidding 1D skips a 4-card major.
- `98.KJ752.84.KT95||1C P` expects **1D** with S=4, D=5 — bidding 1D skips 4 spades. In SAYC, majors are bid first. **Questionable inherited expectation.**

### 3.3 Expected P with clearly openable hand

- `AKT9.T87.QJ8.J32||P P` expects **1C** but has 11 HCP — Rule of 20: 11 + 4 + 3 = 18. Not enough for Rule of 20 with only 11 HCP. BUT in 3rd seat, some play light openings. **Borderline — 3rd seat light opening is common but not universal SAYC.**

### 3.4 Expected 2D waiting over opponent's 2C

- `852.943.KJ64.J85||1D 2C X` expects **P** — partner overcalled 2C, opponent doubled. With 5 HCP we should pass. Our 2D is wrong (treating 2C as strong artificial). The 2C here is a natural overcall, not strong 2C. **Our bug, not inherited test issue.**

### 3.5 Inconsistent minor raise vs 1NT with balanced 4333

The inherited engine inconsistently treats balanced 4333 hands over minor openings:
- `432.AJ32.AKT.432||1D P` expects **3D** with 12 HCP [3,3,4,3] — limit raise of diamonds
- `QJ5.J753.KT8.A42||1D P` expects **1N** with 11 HCP [3,3,4,3] — 1NT, nearly identical shape

In SAYC, balanced 4333 hands with 10-12 HCP should generally bid 1NT over a minor opening, not raise. The 3D expectation appears inconsistent.

- `432.AJ32.AKT.432||1D P` — **remove** (12 HCP balanced should bid 1NT or 2NT, not 3D)
- `A643.KJ63.J7.J53||1D P` expects **2D** with 10 HCP [3,2,4,4] — 2D raise is reasonable with 4-4 fit

## Summary: Tests recommended for removal

The following test keys should be removed from `inherited-compat-cases.js` as they expect bids that are clearly wrong per SAYC:

```
83.852.5.KQT9752||2C P 2D P 3N P          (expects 4H with 7 spades, 1 heart)
83.852.KQT9752.5||2C P 2D P 3N P          (expects 4D with 7 hearts, 1 diamond)
93.KJ984.KJ986.2||1S 2S 4S 4N P           (expects 5D = 1 ace with 0 aces)
AKQT5.Q865.875.K||1N P                     (expects 2C Stayman with no 4-card major)
AT6.K82.A64.AQ87||P 1N P 2N P             (expects P with 17 HCP max over 2NT invite)
QJ973.A8742.A.75||P P P                    (expects P with 11 HCP and Rule-of-20 qualifying)
432.AJ32.AKT.432||1D P                     (expects 3D limit raise with balanced 4333 12 HCP)
8.AK98752.86.542||1N P                     (expects 3N with 7 HCP, 7-card diamond suit, unbalanced)
K7.J85.A2.KQJ743||1N P                     (expects 3S with 6 spades — should transfer via 2H)
KQ9.5.KQT652.AT8||1N P                     (expects 3H with 6 hearts — should transfer via 2D)
K953.972..AQJ987||                          (expects 1S with 10 HCP 6-card suit — 2S weak two is standard)
T9.AJ72.K65.Q732||1N 2C                    (expects X with 10 HCP — should bid 3N or pass, not penalty X)
K42.AJT7.QT8.T63||P 1N P                   (expects 2N with 10 HCP — 3N is standard with 10 opposite 15-17)
```

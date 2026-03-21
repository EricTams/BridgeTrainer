# Standard American Yellow Card (SAYC) — complete bidding reference

This document is a **standalone specification**: it does not assume prior bridge knowledge and does not discuss any software implementation. It is written so that a careful reader could implement a **SAYC-consistent bidding module** (together with legal-move generation and hand evaluation).

**How to use this document**

1. Read **Parts I–III** if you are new to bridge (rules of the auction and hand valuation).  
2. Use **Part IV onward** as the normative SAYC agreement set.  
3. When something says “partnership option,” pick one rule and encode it consistently.

**Primary published sources (resolve conflicts using these):**

1. **ACBL** — Standard American Yellow Card convention card and official explanatory notes.  
2. **Standard textbooks** — e.g. ACBL Bridge Series or other curricula that teach the yellow card verbatim.

**Explicitly out of scope (not SAYC / not specified here):**

- Two-over-one game forcing (2/1) as a full system  
- Precision, Polish Club, and other strong-club systems (except SAYC’s own strong artificial 2♣)  
- Defensive carding, opening leads, and play  
- Advanced competitive tools (full Lebensohl, multi-way openings, RKCB void shows, etc.) unless your partnership adds them in a separate addendum  

---

# Part I — What bridge is (minimal context)

## Cards, partnerships, and objective

- **Deck:** 52 cards: four **suits** ♣ ♦ ♥ ♠ (clubs, diamonds, hearts, spades) and thirteen **ranks** per suit: A, K, Q, J, T, 9, …, 2 (ace high).  
- **Four players** sit North, East, South, West. **North–South** is one **partnership**; **East–West** is the other.  
- Each player receives **13** cards (**a hand**).  
- The game has two main phases: **auction** (bidding) and **play**. This document covers only what you need for **bidding** and **hand description**.

## Denominations (strains) and rank order for bidding

A **denomination** (also called **strain**) is either a **suit** or **notrump (NT)**.

When comparing two **contract bids** at the **same level**, denominations rank from **lowest to highest**:

**♣ < ♦ < ♥ < ♠ < NT**

So at the 1-level, 1♣ is lowest and 1NT is highest.

## What a contract bid names

A **contract bid** names:

- A **level** from **1 through 7** (number of tricks the partnership commits to above book — implementers often store this as the bid level; the trick target is level + 6).  
- A **denomination** (suit or NT).

Examples: **1♥** = level 1, hearts; **3NT** = level 3, notrump.

---

# Part II — How the auction works (implementer essentials)

## Dealer and rotation

- One player is **dealer** for that deal.  
- Bidding proceeds **clockwise**: dealer acts first, then left-hand opponent, then partner, then right-hand opponent, and so on.

## Legal calls

On each turn a player chooses one of:

| Call | Meaning (bidding phase) |
|------|-------------------------|
| **Pass** | Decline to contract at the current level; may end the auction. |
| **Bid** | Name a contract bid **higher** than the **current contract** (see below). |
| **Double** | Legal only in defined situations (opponent’s contract); penalties or takeout meaning by agreement. |
| **Redouble** | Legal only after opponent doubles your side’s contract; meaning by agreement. |

**Current contract:** The last **non-pass** **contract bid** in the auction (ignoring passes). Doubles and redoubles do not change the “current contract” level/strain for purposes of “must bid higher.”

## “Higher than the current contract”

A new contract bid must be **higher** than the current contract:

- If the **level** is **higher**, any denomination is allowed (e.g. 2♣ is higher than any 1-bid).  
- If the **level is equal**, the denomination must be **higher** in the order ♣ < ♦ < ♥ < ♠ < NT (e.g. after 1♥, 1♠ and 1NT are possible; 1♦ is not).

Implementers must enforce **chronological** auction state: each bid is compared to the **last contract bid**, not to an earlier one.

## When the auction ends

- If all four players **pass** on the first round (four consecutive passes from the start), the hand is **passed out** (no contract).  
- If there is a contract bid, the auction ends when **three consecutive passes** follow the **last contract bid** (or double/redouble sequence as per the laws).  

(Laws of Duplicate Bridge govern edge cases; a bidding module still needs **legal call generation** and **auction state**.)

## “Side” and “opening”

- The **opening bid** is the **first contract bid** of the auction.  
- The player who makes it is the **opener**; opener’s partner is **responder**.  
- The other partnership are **defenders** in the play phase; in bidding they are **opponents**.

## Seat labels for opening strength (fourth-seat rules)

Counting from **dealer** as seat **1**, clockwise:

| Seat | Name | Notes |
|------|------|--------|
| 1 | Dealer | |
| 2 | Second seat / “underneath” | |
| 3 | Third seat | |
| 4 | Fourth seat / “balancing” | Special discipline for light openings (Rule of 15). |

## Doubles and redoubles (summary for implementers)

Duplicate **Law** details belong in a law module; for **call legality**, encode at least:

**Double**

- May be made only by a player on the **opposing side** to the **last contract bid**.  
- Typically doubles **opener’s** (or **overcaller’s**) **suit or notrump** contract — not partner’s bid.  
- After a double, the **auction continues**; the **contract** (level + strain) is unchanged until someone bids a new contract.  
- **Meaning** is **partnership agreement**: **takeout** (values + shape) vs **penalty** (to play doubled). SAYC: takeout of **suit** openings; **penalty** orientation on **1NT** doubles (see Part VII).

**Redouble**

- Legal only when **your side’s** last contract bid was **doubled** by an opponent and no further **contract** bid has been placed.  
- Commonly shows **10+ HCP** and willingness to play (or converts meaning by partnership after takeout double — advanced).

**Auction memory**

- Track: `last_contract_bid`, `doubled` flag on that contract, `redoubled`, and **turn order**.  
- **Three passes** after any **non-pass** call can end the auction; exact law sequence after double/redouble should follow the current **Laws of Duplicate Bridge**.

---

<a id="hand-valuation"></a>

# Part III — Hand valuation and shape (used in every decision)

## High-card points (HCP)

| Honor | Points |
|-------|--------|
| Ace | 4 |
| King | 3 |
| Queen | 2 |
| Jack | 1 |

**HCP** = sum over all 13 cards. Maximum is 37.

## Distribution points (dummy points) — typical SAYC teaching

Used especially when **supporting partner’s suit** (trump fit). Common table:

| Length in a side suit (non-trump) | Add |
|-----------------------------------|-----|
| Void | 3 |
| Singleton | 2 |
| Doubleton | 1 |

(Only count once you know **which suit is trumps**; before a fit is known, some decisions use HCP only or a conservative blend.)

## Length points (optional additive for long suits)

Many systems add **1 point per card beyond four** in a long suit when describing **opening** strength in a suit. Your module can include this in a **total point** count separate from HCP.

## Rule of 20 (borderline opening hands)

Used for **one-level suit openings** when HCP is below normal minimum:

**Rule of 20:** If **HCP + length of longest suit + length of second-longest suit ≥ 20**, a **one-level suit opening** may be acceptable with **about 11–12 HCP** (partnership precision varies; ACBL materials discuss light openings).

**When you cannot rely on it:** Vulnerable vs not, partnership style, and **fourth seat** (use Rule of 15 instead for marginal opens).

## Rule of 15 (fourth-seat openings)

In **fourth seat** after three passes, a light **one-level** opening often requires:

**Rule of 15:** **HCP + number of spades ≥ 15**

Rationale: spades are the **highest** suit; length there makes it harder for opponents to outbid you cheaply. If the rule fails, **pass** even with ~12–14 HCP.

## Balanced, semi-balanced, unbalanced (for NT openings and NT contracts)

Definitions used widely in teaching (exact keys may vary; be consistent in code):

**Balanced** (no void, no singleton, no seven-card suit), typical patterns:

- 4-3-3-3  
- 4-4-3-2  
- 5-3-3-2 (any suit — but see below for 1NT opening restrictions on five-card majors)

**Semi-balanced** (examples): 5-4-2-2, 6-3-2-2.

**Unbalanced:** everything else (any void, any singleton, or wild distribution). Includes 4-4-4-1 (singleton makes it unbalanced).

**Note on 5-3-3-2 with a five-card major:** The hand *shape* is balanced, but most SAYC partnerships **do not open 1NT** with a five-card major; they open **1♥/1♠** instead. This is an **opening-bid choice**, not a shape reclassification.

**1NT / 2NT openings** require **balanced** (and agreed tolerance for 5-card minor 5332).

## Suit quality (for preempts and weak twos)

Length alone is not enough. A **preempt** or **weak two** should have **playing strength** in the suit: commonly **two of the top three honors** (A/K/Q) or **three of the top five** (A/K/Q/J/T) in that six-card (or longer) suit. Partnerships tighten or loosen this; encode one rule.

## Stoppers (for NT contracts)

A **stopper** in a suit is usually **first- or second-round control** (ace, K-x, Q-x-x+, etc.). For **3NT** and higher NT, the partnership must have **stoppers** in the unbid suits or a path to establish them. A bidding module may approximate stoppers with honor counts in each suit.

---

<a id="opening-bids"></a>

# Part IV — SAYC opening bids

## Pass as opening (first player to speak)

**Meaning:** Hand does not qualify for any opening call below.

**Consider:** HCP, shape, Rule of 20, and if **fourth seat** Rule of 15 for marginal one-bids.

**You cannot** “open” a descriptive bid without meeting that bid’s requirements.

---

## One of a suit (1♣ 1♦ 1♥ 1♠)

**Strength**

- Normal minimum: **about 12–13 HCP** (often stated as **13+** in conservative partnerships).  
- With **Rule of 20**, may open with **11–12 HCP** if shape qualifies.  
- **Maximum** for a **one-level suit opening** is **21 HCP** in standard treatment; with **22+ HCP** open **2♣** (strong artificial), not 1♠.

**Length requirements (SAYC)**

- **Major (♥ ♠):** **Five or more** cards in the suit you bid. **You cannot** open 1♥/1♠ with only four.  
- **Minor (♦ ♣):** **Three or more** cards. **You cannot** open a minor with a two-card suit.

**Which suit to choose**

- Among **biddable** suits, normally show the **longest**.  
- **Equal longest majors:** bid the **higher-ranking** major first (**1♠** before **1♥** if five spades and five hearts).  
- **Equal longest minors:** with **3-3** in the minors, open **1♣**; with **4-4** (or longer equal), open **1♦** (SAYC minor tie-breaks).  
- With a **five-card major and a five-card minor** (5-5), open the **major** (higher-ranking or the major if only one).  
- With a **five-card major and a longer minor** (e.g. 6♦-5♠), open the **longer minor** first (longest suit rule takes priority); plan to rebid the major.

**Balanced hands in the 1NT range (15–17 HCP)**

- With **15–17 HCP** and a **balanced** hand, **prefer 1NT** over opening a five-card major in standard SAYC teaching (partnerships may allow 1♥/1♠ with 5-card major — card specifies; pick one).

**Fourth seat**

- Apply **Rule of 15** for marginal **one-level** openings.

**Forcing?**

- **No.** Responder **may pass** (e.g. with 0–5 HCP). The opening itself does not force a bid.

---

## 1NT opening

**Strength:** **15–17 HCP** inclusive.

**Shape:** **Balanced**; **no void**, **no singleton**. Typically **no five-card major**; **5-3-3-2 with a five-card minor** is a common allowed pattern.

**Not forcing:** Partner may pass.

**You cannot** open 1NT with 14 or less, 18+ (see 2NT or 2♣ paths), or wrong shape.

---

## 2♣ opening (strong, artificial)

**Strength:** **22+ HCP** (or a hand that is **one trick short of game** in your partnership’s definition — commonly encoded as 22+ HCP).

**Meaning:** **Artificial** — says **nothing** about club length; promises **game-forcing** strength.

**Forcing to game:** Responder **cannot pass** with a weak hand (except extremely rare agreed exceptions — standard SAYC: **no pass** with trash; responder bids **2♦** waiting with 0–7 HCP).

**You cannot** open 2♣ with fewer than **22 HCP** (or agreed equivalent).

---

## 2NT opening

**Strength:** **20–21 HCP**.

**Shape:** **Balanced**, same style restrictions as 1NT (no void/singleton; typically no five-card major).

**Not forcing to slam:** Weak hands may pass (e.g. 0–4 HCP).

**You cannot** use 2NT with **22+** balanced — that belongs in **2♣** then rebid 2NT.

---

<a id="weak-two-opening"></a>

## Weak two-bid (2♦ 2♥ 2♠ only — not 2♣)

**Strength:** Typically **6–10 HCP** (some teach **6–11**; stay within one band in code).

**Length:** **Exactly six cards** in the suit bid (standard weak two).

**Suit quality:** **Good six-card suit** (honors as in Part III).

**Seat:** **Not** in **fourth seat** on standard SAYC cards (no weak two in 4th seat).

**Side suit:** Avoid a weak two with a **four-card side major** (partner may be 4-4 in majors and get lost).

**Not forcing.**

**You cannot** open a weak two with **five** or **seven** cards in the suit (seven belongs in **three-level preempt**), or with **opening-bid strength** (open at the one level or 2♣ instead).

---

<a id="preempt-opening"></a>

## Three-level and higher preempts (suit openings)

**Strength:** **Weak** — typically **max ~10 HCP** (partnership may allow slightly more with very long suits; be consistent).

**Length:** Usually **seven+** cards in the suit opened; **level** roughly matches **suit length** (classic guideline: **7-card suit → 3-level**, **8-card → 4-level**, etc., adjusted by vulnerability and table agreement). The preemptor's expected **playing tricks** (typically suit length minus one or two losers) should be enough that the contract is a reasonable sacrifice at the chosen level.

**Fourth seat:** Often **no preempt** or very restrictive; many SAYC pairs pass marginal hands rather than preempt on the fourth round.

**Not forcing.**

**You cannot** preempt with **game-forcing** values without upgrading to a normal opening.

### Vulnerability and preempt safety (guidance)

Preempt **level** and **aggression** depend on **vulnerability** (your side vs opponents). Common teaching (encode one policy):

- **Not vulnerable:** Preempts are **more frequent** and **higher level** with the same suit length.  
- **Vulnerable:** Stricter — need **better suit quality** and avoid **excessive** level (phantom saves hurt more).

**Rule of 2 and 3** (classic guideline): with a weak preempt, you are **content** if you go down **three tricks not vulnerable** or **two tricks vulnerable** (doubled, the cost is roughly equal to opponents' game value) — use as a **sanity check**, not a rigid formula.

---

<a id="higher-notrump-opening"></a>

## Gambling or unusual 3NT openings

**Not** defined on the minimal SAYC card. If you implement **3NT opening**, define it in a partnership addendum (e.g. gambling solid minor) — **do not** assume standard SAYC.

---

<a id="responding"></a>

# Part V — Responding (uncontested) to opening bids

Convention: **RHO** = right-hand opponent; **LHO** = left-hand opponent.

<a id="after-one-major"></a>

## After partner opens **1♥** or **1♠**

**Inputs:** Your HCP, **trump length** (fit), side suits, game/slam prospects.

| Call type | Typical requirements (SAYC) | Forcing? |
|-----------|-----------------------------|----------|
| **Pass** | Usually **0–5 HCP** (or poor fit with minimum) | — |
| **1♠ over 1♥** | **4+** spades, **6+** HCP (often **6–17** before game force by other bids) | **One round forcing** (opener must bid again — cannot pass 1♠) |
| **Single raise** (e.g. 1♠–2♠) | **6–10 HCP**, **3+** trumps (some require **5+** for constructive raise — SAYC often **3+** with 6–10) | **No** (non-forcing to game) |
| **Jump raise to 3** (limit) | **10–12 HCP**, **4+** trumps | **Invitational** (opener accepts/declines game) |
| **Jump to 4M** | **Preemptive** raise: **5–10 HCP**, **5+** trumps, blocks opponents | **Signoff** |
| **New suit at 1-level** | Not applicable **below** opener’s major (responder cannot bid a lower suit at 1-level over 1♥/1♠). | — |
| **1NT** | **6–9 HCP** (sometimes **6–10**); **semi-forcing**; denies a hand strong enough for a **forcing** two-level response | **Semi-forcing** (opener bids again with unbalanced hand; may pass with balanced minimum) |
| **New suit at 2-level** (e.g. 1♠–2♣, 1♠–2♦, 1♠–2♥) | **10+ HCP**, **5+** cards in suit (**4+** only if partnership explicitly allows) | **Forcing one round** (responder’s new suit; opener must bid again). *Note: “2/1 game force” systems upgrade this to **game forcing** — base SAYC in many clubs uses **one-round force** only unless partnership plays 2/1.* |
| **Jacoby 2NT** | **Game force**, **4+** trumps, any shape (balanced or unbalanced) | **Forcing to game** |

**Critical:** **Jacoby 2NT** is **not** “balanced 13–15”; it is **fit + game force**. A module must not confuse it with natural invitational 2NT (not used over 1M in SAYC the same way).

**Splinters:** Optional advanced; double jump in new suit showing **4+ support**, **singleton/void** in bid suit, **game values** — only if on card.

**Drury (partnership option, not on minimal SAYC card):** **2♣** response by a **passed hand** to **1♥/1♠** showing **3+** trumps and **10–12 HCP** invitational — only if explicitly adopted.

---

## After partner opens **1♣** or **1♦**

**1NT response**

- **Standard SAYC:** **non-forcing** — opener **may pass** with a balanced minimum. (Contrast with 1NT over a **major**, which is **semi-forcing** in SAYC.)  
- **Strength:** typically **6–10 HCP**, balanced, **no four-card major** to bid at the 1-level.  
- **Shape:** usually denies a biddable 4-card major at 6–9 (would respond **1♥/1♠** instead); with **11–12** balanced, **2NT** is the invite rather than 1NT.  
- Opener **may pass** 1NT with a balanced minimum.

**Single raise of minor**

- **6–10 HCP**, **4+** support (or **5+** if partnership requires).

**New suit at 1-level**

- **6+ HCP**, **4+** cards.

**New suit at 2-level**

- **10+ HCP**, **4+** cards, **forcing one round**.

**2NT / 3NT**

- **2NT** (jump): **invitational**, typically **11–12 HCP**, **balanced**, no biddable 4-card major — **not** Jacoby (that’s over majors). Does **not** require specific minor support.  
- **3NT** to play with **13–15** HCP (roughly), balanced, no slam interest.

**Two-level new suit over 1♣/1♦** (e.g. 1♣–2♦): **10+ HCP**, **5+** cards (**4+** only if partnership allows), **forcing one round**.

---

## After partner opens **1NT** (15–17)

| Call | Meaning | Typical strength / shape | Forcing? |
|------|---------|---------------------------|----------|
| **Pass** | Weak, no game | **0–7 HCP** (with shape judgment) | — |
| **2♣** (Stayman) | Ask for **4-card major** | **8+ HCP** invitational or better (with distributional adjustments) | Forcing one round |
| **2♦** | **Transfer to hearts** (5+ ♥) | Usually **0+** HCP with 5+ ♥ (weak or strong) | Forcing one round |
| **2♥** | **Transfer to spades** (5+ ♠) | Same | Forcing one round |
| **2NT** | Invitational to game | **8–9 HCP**, balanced, no slam try | Non-forcing to slam |
| **3NT** | Signoff to game | **10–15 HCP** | Signoff |
| **4NT** | **Quantitative** slam try opposite 15–17 | **16–17 HCP** balanced | Invitational slam (not ace ask) |
| **6NT / 7NT** | To play | Very strong | — |

**You cannot** use Stayman without **at least invitational values** (roughly **8+ HCP**) or agreed substitute. **You cannot** transfer without **five** in the target major.

### Stayman continuations (after 1NT–2♣–opener’s rebid)

Opener rebids **2♦**, **2♥**, or **2♠**:

| Opener showed | Meaning |
|---------------|---------|
| **2♦** | **No four-card major** (may have **4♦** only — partnership clarifies) |
| **2♥** | **Four hearts** (may also have four spades — **5–4** majors possible) |
| **2♠** | **Four spades**, **not** four hearts |

**Responder’s third bid (examples):**

| Holding | Typical rebid |
|---------|----------------|
| Invitational with **both** majors (Stayman found no 4-card major from 2♦) | **2♥** or **2♠** as **non-forcing** invite to 3 of major / 2NT / pass logic — **partnership** defines; common is **pass** or **2NT** invite with 8–9 |
| Game values, **4–4** majors, opener denied both | Often **2♥** (pick-up) or **3NT** with stoppers |
| Game values, **fit** in major opener showed | **4♥/4♠** signoff or slam try |
| Weak, **both majors** fit denied | **Pass** or correct partscore |

**Smolen** (3♥/3♠ jumps showing **5–4** majors after Stayman — bid the 3-card major at the 3-level to let opener declare the 5-card fit) is **not** on the base SAYC card — add in an extension doc if needed.

### Jacoby transfer: opener’s completion and super-accept

| Opener rebid | Meaning |
|--------------|---------|
| **2♥** (after 2♦ transfer) / **2♠** (after 2♥ transfer) | **Minimum** NT opening; **2+** cards in major (completes transfer) |
| **3♥/3♠** (jump) | **Super-accept**: **maximum** (often **17** HCP) and **good** **4+** card fit — partnership defines exact requirements |
| **Pass** of transfer | **Illegal** — opener **must** complete transfer (or break with rare agreed methods) |

### Responder after transfer completed (1NT–2♦–2♥ etc.)

| Responder rebid | Typical meaning |
|-----------------|-----------------|
| **Pass** | **0–7** HCP, **content** in **2♥/2♠** |
| **2NT** | **Invite** (~**8–9** HCP), asks opener accept/decline **3NT** or **3M** |
| **3NT** | **10–15** HCP, **no slam** interest |
| **Raise to 3M** | **Invite** (often **8–9** with **3+** trumps) |
| **4M** | **Sign-off** to game |
| **4NT** | **Quantitative** (see table above) |

---

## After partner opens **2♣** (strong artificial)

| Call | Meaning |
|------|---------|
| **2♦** | **Waiting / negative**: **0–7 HCP**, no biddable 5-card suit to show positively |
| **2♥ / 2♠ / 3♣ / 3♦** | **Positive**: **5+** cards in suit **and** **8+ HCP** (partnership refines thresholds) |

Opener’s rebids describe shape and strength; the auction is **forcing to game** until agreement.

**Responder cannot** pass **2♣** with an unlimited hand; **2♦** is the **only** negative with weak values.

---

## After partner opens **2NT** (20–21)

Same **gadget pattern** as over **1NT**, shifted up one level. Typical SAYC-style structure:

| Responder call | Meaning | Typical HCP / notes |
|----------------|---------|---------------------|
| **Pass** | Weak | **0–3** (sometimes **0–4**) |
| **3♣** | **Stayman** | **4+** in a major; typically **5+** HCP (often **6+** pure HCP) — **invitational+** opposite **20–21** |
| **3♦** | **Transfer to hearts** | **5+** ♥ |
| **3♥** | **Transfer to spades** | **5+** ♠ |
| **3NT** | Sign-off to game | **4–8** HCP balanced, no major slam interest |
| **4NT** | **Quantitative** slam try | Typically **~11–12** HCP; asks opener (20–21) to bid **6NT** with a **maximum** or pass / sign off per partnership. With **13+** opposite 20–21, bid **6NT** directly |
| **6NT** | To play | Solid **small slam** values |

**You cannot** use **3♣ Stayman** on purely garbage hands. After transfers, opener **completes** at **3♥/3♠** (or **super-accept** **4♥/4♠** with max and fit, by agreement).

---

## Jacoby 2NT responses: opener’s rebids (over **1♥/1♠**)

After **1M–2NT** (Jacoby), opener describes **shortness** or **minimum / maximum**:

| Opener rebid | Typical meaning |
|--------------|-----------------|
| **New suit below 3M** (after 1♠–2NT: 3♣/3♦/3♥; after 1♥–2NT: 3♣/3♦/3♠) | **Singleton or void** in that suit (shortness-showing) — **game force** already established |
| **3M** (own suit) | **Minimum** opening, **no** side shortness to show |
| **3NT** | **Extras** (often **15–17** HCP), **no singleton** to show, **balanced** game-try |
| **4M** | **Minimum** opening, **no** side shortness, **sign-off** in agreed major |
| **4♣/4♦** | Some play as **good second suit** (5+ cards) or **control** — **define** if used |

Responder’s **4NT** later may be **Blackwood** (fit agreed) vs **quantitative** — **auction position** disambiguates (see Part VIII).

---

## After partner’s **weak two** (2♦/2♥/2♠)

| Call | Typical meaning |
|------|-----------------|
| **Pass** | Weak, no game |
| **Raise** | Preemptive / constructive by level |
| **2NT** | **Artificial ask** (feature / Ogust-style on many cards) |
| **New suit** | **Forcing**, **strong** (often **16+ HCP** or **5+ suit** and values) |

### Weak two — **2NT** ask and opener’s rebids (Ogust-style, common)

Responder’s **2NT** shows **interest** (often **16+ HCP** or **14–16** invitational depending on card). Opener’s **first step** rebids describe **hand quality** (HCP sub-range) and **trump quality**:

| Opener rebid | Typical coding (partnership chooses one scheme) |
|--------------|--------------------------------------------------|
| **3♣** | Minimum weak two, **poor** trump suit |
| **3♦** | Minimum weak two, **good** trump suit |
| **3♥** | Maximum weak two, **poor** trump |
| **3♠** | Maximum weak two, **good** trump |

(Exact step order varies — **mirror your card** in code.) Responder then places **partscore**, **game**, or **pass**.

**You cannot** pass if partner’s bid is **forcing** by agreement.

---

## After partner’s **three-level (or higher) preempt**

| Call | Typical meaning |
|------|-----------------|
| **Pass** | No game |
| **Raise** | Preemptive / save |
| **New suit** | **Forcing** (cannot pass); shows **strength** — opener **must** bid again (choose **fit**, **new suit**, or **3NT** by agreement) |
| **3NT** | To play with **solid stoppers** and understanding of partner’s length |
| **4NT** | **Blackwood** / **RKCB** only if trump **agreed** — define when new suit establishes agreement |

**Minimum strength for new suit over preempt:** Often **opening hand** (**12+** HCP) or **16+** for game drive — encode consistently.

---

<a id="rebids"></a>

# Part VI — Rebids (second and later rounds)

For a **module**, persist at least:

1. **Opener’s first bid** and **announced range** (1NT = 15–17, 1♠ = 5+ spades, etc.).  
2. **Forcing flag** until cancelled (new suit forcing, Stayman, transfers, Jacoby 2NT).  
3. **Agreed strain** (or “no agreement yet”).  
4. **Fit length** estimate (combined trumps).  
5. **Competitive** calls since last limit bid.

---

## Opener’s rebids after **1♣/1♦–1♥/1♠** (one-over-one)

Responder showed **4+** major, **6+** HCP, **one round force**.

| Opener rebid | Typical shape / strength |
|--------------|---------------------------|
| **2♣/2♦** (lower suit than responder’s major at 2-level) | Often **4+** cards, **12–15** **minimum**; may be **3-card** support in some styles — **reverse** if new suit **ranks higher** than first bid requires **~17+** HCP |
| **Raise** responder’s major (e.g. 1♣–1♥–2♥) | **3+** support, **12–15** minimum |
| **Jump raise** (e.g. 1♣–1♥–3♥) | **4+** support, **16–18** invitational |
| **1NT** | **Balanced** minimum (**12–14** HCP), **no** fit for responder’s major — **non-forcing** in standard SAYC |
| **Reverse** (e.g. 1♣–1♠–2♥) | **17+** HCP, **one round force** |

**You cannot** “reverse” without **extras** (~**17+** HCP).

---

## Opener’s rebids after **1M–1NT**

**1NT** = **6–9** (or **6–10**), **semi-forcing** (opener bids again with unbalanced hand; may pass with balanced minimum).

| Opener rebid | Meaning |
|--------------|---------|
| **Pass** | **Minimum** balanced-ish, **no** game |
| **2♣/2♦** | **Second suit** (4+ cards), may be minimum; shows shape, **non-forcing** (responder may pass with tolerance) |
| **2M** | **6+** card suit, **minimum** but **constructive** |
| **3M** | **Invitational** (**16–18** with **6+** trumps typical) |
| **2NT** | **18–19** balanced **invite** (too strong for 1NT opening; not standard on all SAYC cards over 1M–1NT — **define**) |

---

## Opener’s rebids after **1M–2M** (single raise)

Responder: **6–10**, **3+** fit. **Not forcing.**

| Opener rebid | Meaning |
|--------------|---------|
| **Pass** | **Minimum** (**12–14**) |
| **3M** | **Invite** (**15–17** with **6+** trumps typical) |
| **New suit** | **Help-suit game try** or **splinter** — partnership defines |
| **4M** | **Closeout** to game with **solid** **18+** or **great** fit |

---

## Opener’s rebids after **1M–3M** (limit raise)

Responder: **~10–12**, **4+** fit, **invitational**.

| Opener rebid | Meaning |
|--------------|---------|
| **Pass** | **Minimum** (**12–14**) |
| **4M** | **Accept** game (**15+** or **good** **14**) |

---

## Opener’s rebids after **forcing two-level new suit** (e.g. 1♠–2♣)

| Opener rebid | Meaning |
|--------------|---------|
| **Simple rebid** of own suit (e.g. 2♠) | **Minimum** (**12–15**) |
| **Raise** responder’s suit | **3+** support, **12–15** |
| **2NT** | **12–14** balanced, **stopper(s)** (with 15–17 balanced, opener would have opened **1NT**; with **18–19** balanced, jump to **3NT**) |
| **Jump** in own suit or new suit | **Extra** values (**16+** / **18+** by jump size) |
| **Reverse** | **17+**, **forcing** |

Responder’s **third bid** continues to explore game/slam; **pass** only when **non-forcing** agreed.

---

## Opener after **2♣–2♦** waiting

| Opener rebid | Typical meaning |
|--------------|-----------------|
| **2NT** | **22–24** balanced |
| **2♥/2♠/3♣/3♦** | **Natural** **5+** suit, **forcing** |
| **3NT** | **25–27** balanced (partnership bands) |

Auction remains **game force** until **signed off** in **4M/3NT** etc.

---

## Responder’s rebids (patterns)

| Situation | Guidance |
|-----------|----------|
| After **one-round force** fulfilled | Rebid **NAT** strength: **jump** = extras, **minimum** = minimum |
| **Invite** | **2NT**, **jump** to **3M**, or **limit** raise |
| **Signoff** | **Pass**, **3NT** from correct side, **4M** |
| **Slam try** | **Cue bid**, **4NT** Blackwood (fit agreed), **quantitative** |

---

## After **Stayman** and **transfers** (opener side)

Covered in **Part V** (completion, super-accept, responder’s third bids).  

**Interference:** If **RHO doubles** Stayman or transfer, **system on** / **system off** / **pass / redouble** methods are **partnership** — not on minimal SAYC; add a **competitive 1NT** defense module.

---

<a id="competitive-bidding"></a>

# Part VII — Competitive bidding (SAYC essentials)

## Takeout double

**Of a suit opening at 1-level (RHO opened):**

- Roughly **12+ HCP** (some require **13+**).  
- **Shortness** (0–2) in opener’s suit.  
- **Support** for the **unbid** suits (typically **3+** cards in each unbid major for a 1♣ opening double — shape-dependent).

**Double of higher-level suit opening:** Minimum often rises (**~13–15+** HCP at 2-level) — encode by level.

**Not** takeout: **Penalty double** of **1NT** (see below).

## Penalty double of **1NT**

**Strong balanced** hand, often **15+ HCP**, to play for penalties — **not** takeout.

## Simple overcall

- **5+** card suit (quality matters).  
- About **8–16 HCP** at the **1-level**; **stronger** for **2-level** (often **10+**).

## 1NT overcall

- **15–18 HCP** balanced (common range; narrow slightly if you prefer).

## Weak jump overcall

- **Preemptive**: weak hand, **6+** card suit, **roughly 5–10 HCP**.

## Balancing (fourth hand after three passes or auction short)

When **LHO** opens and **two passes** follow (partner passed), **you** in **fourth seat** may **balance** with **slightly lighter** values than a **direct** seat overcall (often **~1** trick or **~2–3 HCP** lighter — partnership style).

- **Balancing 1NT:** often **11–14** or **11–15** HCP balanced (not same as direct **15–18** 1NT overcall — **define** two ranges if both exist).  
- **Balancing takeout double:** may be **10–11+** HCP with shape (not **12+** direct).

## Reopening double (after you open and LHO overcalls, partner passes)

Often **takeout** with **opening values** and **support** for unbid suits; strength can be **slightly less** than a direct takeout double in some styles — **define**.

## Negative double (after partner opens, RHO overcalls a suit)

Shows **4+** in an **unbid major** when a major was **not** yet shown by your side.

**Minimum HCP** rises with level of overcall (typical teaching):

- After **1-level** overcall: **about 6+** HCP  
- After **2-level** overcall: **about 8–10+**  
- Higher levels: **10+** and up  

**You cannot** negative-double without the implied major length.

**After 1♣/1♦–(overcall)–?** Negative double still shows **unbid major(s)**; **jump** cue-bids and **free bids** are **partnership**.

## Responsive double (advanced)

After **takeout double** and **advancer** bids a suit, a **double** by **doubler’s partner** sometimes shows **values** / **penalty** in **advancer’s** suit — **not** on base SAYC; omit or define in extensions.

## Advancing partner’s takeout double

- **Cheapest** suit with **0–8** HCP  
- **Jump** with **9–11** invitational  
- **Game jump** with **12+**  
- **1NT** with **6–10** HCP and **stoppers** (approximate)

## Advancing partner’s overcall

- **Raise** with **fit** and appropriate values.  
- **New suit** forcing one round with **10+** HCP and **5+** suit (typical).  
- **Cue-bid** of opponent’s suit often shows **3+** support for overcaller’s suit and **10+** HCP (**Michaels** / **unusual** defenses are **not** base SAYC).

---

<a id="slam-conventions"></a>

# Part VIII — Slam conventions (SAYC)

## Blackwood 4NT (ace ask)

**When:** **Suit agreement** (or clear implied trump suit).

**Responses (standard Blackwood — common on SAYC card):**

| Step | Aces shown |
|------|------------|
| 5♣ | 0 or 4 |
| 5♦ | 1 |
| 5♥ | 2 |
| 5♠ | 3 |

(This is **standard** Blackwood counting aces. Some partnerships use **RKCB** — Roman Key Card Blackwood — with **0314** or **1430** step orders counting the king of trumps as a fifth “ace”; RKCB is **not** on the minimal SAYC card.)

## Gerber 4♣ (over NT)

**When:** **4♣** directly over **1NT** or **2NT** (or in clear **NT** context) asks for **aces** — **not** a natural club bid.

**Responses (typical step scheme — confirm on card):**

| Bid | Aces shown |
|-----|------------|
| **4♦** | 0 or 4 |
| **4♥** | 1 |
| **4♠** | 2 |
| **4NT** | 3 |

**You cannot** use Gerber when **4♣** would be natural and below **game** without agreement.

## Quantitative 4NT

Over **1NT** or **2NT opening**, **4NT** is **not** Blackwood; it invites **6NT** with **16–17 HCP** opposite 15–17 (adjust opposite 2NT).

## Blackwood vs quantitative **4NT** (disambiguation)

| Situation | **4NT** means |
|-----------|----------------|
| **Agreed** major/minor fit (trump suit set) | **Blackwood** (ace ask) |
| **No** fit, **last** contract was **1NT** or **2NT** by partner | **Quantitative** |
| **Jacoby 2NT** then **4NT** | Usually **Blackwood** (fit agreed on major) — partnership confirms |

## After Blackwood: **5NT** king ask (optional extension)

After ace-showing exchange, **5NT** may ask for **kings** (not on all SAYC cards). Step responses similar in spirit to ace responses; **define** if implemented.

## Cue bids

A **cue bid** of an **enemy suit** below game shows **first-round control** (ace or void) and **slam interest** with **agreed trump**. Strength **well above minimum** for game — partnership defines minimum HCP.

---

<a id="forcing-table"></a>

# Part IX — Forcing summary table

| Call category | Responder / opener must bid again? |
|---------------|-----------------------------------|
| Opening **1♣/1♦/1♥/1♠** | **No** — partner may pass. |
| **New suit at 2-level** (e.g. 1♥–2♣) | **One round forcing** (opener cannot pass). |
| **2♣** strong opening | **Game forcing** — cannot pass 2♣. |
| **Stayman** 2♣ over 1NT | **One round forcing**. |
| **Jacoby transfers** | **One round forcing** (opener completes or breaks as agreed). |
| **Jacoby 2NT** (over 1M) | **Game force**; opener’s rebids set shortness / min / max (Part V). |
| **1NT response to major** (1♥–1NT, 1♠–1NT) | **Semi-forcing** (opener bids again with unbalanced hand; may pass balanced minimum). |
| **1NT response to minor** (1♣–1NT, 1♦–1NT) | **Non-forcing** — opener may pass. |
| **1♠** over **1♥** | **One round forcing**. |
| **Takeout double** | Partner **should** bid unless holding exceptional trump stack for penalty pass (advanced). |

**Doubles** after forcing sequences may **cancel** forcing obligations per partnership and law; encode explicitly if you support competitive doubles after game-forcing auctions.

---

# Part X — Appendix: implementer checklist

Use this as a **coverage** list for a bidding engine (not code):

- [ ] Auction state: current contract, doubles/redoubles, whose turn, three passes end.  
- [ ] Legal bid generation (level + strain ordering).  
- [ ] HCP and optional distribution / length points.  
- [ ] Balanced detector for NT openings.  
- [ ] All openings in Part IV with **cannot bid if** predicates.  
- [ ] Responses in Part V with **forcing** flags.  
- [ ] Jacoby 2NT **distinct** from natural 2NT over minors.  
- [ ] 1NT structure: Stayman, transfers, invites, quantitative 4NT.  
- [ ] 2♣/2NT openings and responses.  
- [ ] Weak two and preempt rules + suit quality.  
- [ ] Fourth-seat Rule of 15 and Rule of 20 for one-bids.  
- [ ] Competitive: takeout vs penalty double, overcalls, negative double, advances.  
- [ ] Slam: Blackwood vs quantitative 4NT disambiguation.  
- [ ] Rebid rules at least for common patterns (minimum / invite / game / slam).  
- [ ] Doubles / redoubles legality and auction termination (law module).  
- [ ] **1♥–1♠** forcing; **1M–1NT** semi-forcing; **1m–1NT** non-forcing.  
- [ ] Full **1NT** and **2NT** structures: Stayman follow-ups, transfer completions, super-accept.  
- [ ] **Jacoby 2NT** opener rebid chart.  
- [ ] **2♣** strong: opener rebids after **2♦** waiting.  
- [ ] **Weak-two 2NT** ask / Ogust-style steps if used.  
- [ ] **Balancing** vs **direct** competitive thresholds.  
- [ ] **Gerber** step responses.  
- [ ] **5NT** king ask after Blackwood (optional).

---

<a id="appendix-not-on-sayc"></a>

# Part XI — Appendix: not on base SAYC

- Lebensohl / advanced defenses after NT interference  
- Flannery, multi 2♦, etc.  
- Two-over-one as primary structure  
- RKCB 1430, void-showing Blackwood  

Add these only in a **separate** “partnership extensions” document.

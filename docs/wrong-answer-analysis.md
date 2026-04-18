# Wrong-Answer Case Analysis (126 cases)

Analysis of each wrong-answer case against SAYC principles per `/docs/sayc-reference.md`.

**Format:** `"history" exp=EXPECTED got=OUR_BID hcp=X [S,H,D,C] shapeClass`

Shape array is **[Spades, Hearts, Diamonds, Clubs]**.

---

## GROUP A — Our Bug (fix the rule engine)

These cases where the expected bid is correct per SAYC and our engine produces the wrong answer.

### A-1. Responding pass with enough values (R68)

1. **`"1D P" exp=1N got=P hcp=11 [3,3,4,3] balanced`** — 11 HCP balanced over 1D. SAYC: 2NT invite (11-12 HCP balanced over minor) or 1NT. Passing with 11 HCP is clearly wrong; engine's responder pass threshold is too generous.

2. **`"1D P" exp=2D got=P hcp=10 [3,2,4,4] balanced`** — 10 HCP, 4-card diamond support. Single raise (2D) with 6-10 HCP and 4+ support is standard. Engine should not pass.

3. **`"1C P" exp=1N got=P hcp=12 [3,3,3,4] balanced`** — 12 HCP balanced over 1C. Easily enough to respond. Should bid 2NT (invitational) or at minimum 1NT. Engine pass is wrong.

4. **`"P P 1D 1S 1N" exp=2S got=P hcp=6 [3,5,3,2] balanced`** — Partner overcalled 1S, we have 6 HCP with 5 hearts (but only 3 spades). Expected 2S raise with 3-card support and 6 HCP is borderline but reasonable in competitive context. **Borderline — move to Group C if desired.**

5. **`"P P 1D 1S X P 2C P" exp=2N got=P hcp=10 [3,4,3,3] balanced`** — Complex competitive auction. Partner opened 1D, opponent bid 1S, we doubled (negative showing hearts), partner bid 2C. With 10 HCP balanced, passing 2C is not unreasonable — but 2NT showing invitational values would be better. **Our bug** — engine should try 2NT with 10 HCP balanced.

### A-2. Opener should rebid, not pass (R65-rebid-pass-default)

6. **`"P 1C 1D P P 1H 1S P P X" exp=2D got=P hcp=15 [4,2,5,2] semi-balanced own=1D`** — We overcalled 1D earlier with 15 HCP and 5 diamonds. Opponent doubled. We should pull to 2D (our suit) rather than pass. **Our bug.**

7. **`"1S 2C 2S P P" exp=X got=P hcp=10 [1,3,3,6] unbalanced own=2C`** — We overcalled 2C with 6 clubs. Opponent bid 2S, partner passed. In balancing/reopening seat, a double is reasonable with 10 HCP and short spades. **Our bug** — engine should compete (reopening double).

8. **`"1S 2S 3S 4C P" exp=4D got=P hcp=8 [1,5,5,2] unbalanced own=2S`** — Partner raised to 4C (our raise of 2S then 4C advance). Expected 4D is debatable — this is a complex competitive hand. **Move to Group C.**

9. **`"1D P 1S P 1N P 2N P 3S P" exp=3N got=P hcp=12 [4,1,4,4] semi-balanced own=1S`** — Opener rebid 1NT (12-14), responder invited 2NT, we pulled to 3S (own suit). Partner now bids 3S. With 12 HCP and 4 spades, accepting the invite to 3NT is reasonable. **Our bug** — engine should bid 3NT.

10. **`"1C 1D P 2D" exp=3H got=P hcp=21 [2,4,1,6] unbalanced own=1C`** — We opened 1C with 21 HCP! Opponent bid 1D, partner passed, opponent raised to 2D. With 21 HCP we absolutely must act — 3H showing a new suit or double. Passing with 21 HCP is a serious engine bug. **Our bug.**

### A-3. Response bid wrong suit — major before minor (R23)

11. **`"1C P" exp=1D got=1S hcp=7 [4,2,4,3] balanced`** — Over 1C with 4S and 4D. SAYC says bid suits up the line: with 4D and 4S, bid 1D first (up the line), then show spades. However, in many SAYC treatments, you bid the major first over a minor opening. The expected 1D (skipping the 4-card major) is **non-standard SAYC**. Our 1S is more standard. **Move to Group B** — our bid is better per SAYC.

12. **`"1C P" exp=1D got=1S hcp=7 [4,2,5,2] semi-balanced`** — Over 1C with 4S and 5D. Same issue: expected 1D skips the 4-card major. In SAYC, with 5D and 4S over 1C, some play 1D first (longest suit), some play 1S (major preference). **Convention variant — Group C.**

13. **`"1D P" exp=2S got=1S hcp=20 [5,2,3,3] balanced`** — Over 1D with 20 HCP and 5 spades. Expected 2S is a jump shift (showing 19+ HCP). Our 1S loses the strength message. **Our bug** — engine should support jump shifts for 19+ HCP hands.

14. **`"1D P" exp=2S got=1S hcp=16 [5,0,4,4] unbalanced`** — Over 1D with 16 HCP and 5 spades. Expected 2S jump shift with 16 HCP is below the 19 HCP threshold — this is **too aggressive** for standard SAYC jump shift. **Move to Group C** — 1S is also defensible; jump shift is partnership choice for 16 HCP.

15. **`"1C P" exp=2H got=1H hcp=15 [2,6,1,4] unbalanced`** — Over 1C with 15 HCP and 6 hearts. Expected 2H is a jump shift. With 15 HCP this is below standard 19+ threshold but with a 6-card suit, some play jump shifts lighter. **Group C — convention variant.**

### A-4. Opener invite over single raise (R42c)

16. **`"1S P 2S P" exp=4S got=3D hcp=16 [5,3,5,0] unbalanced own=1S`** — Opener with 16 HCP, 5-5 spades/diamonds, void clubs, partner raised to 2S. Expected 4S (game) or 3D (help-suit game try). Our 3D is actually a reasonable help-suit game try! Both are defensible but with a void and 5-5, 4S might be better. **Group C.**

17. **`"1S P 2S P" exp=2N got=3S hcp=17 [5,3,3,2] balanced own=1S`** — Opener 17 HCP balanced, partner raised 2S. Expected 2NT (game try). Our 3S (invite) is also a game try. Both are valid invite forms. **Group C.**

18. **`"1S P 2S P" exp=2N got=3S hcp=16 [5,3,3,2] balanced own=1S`** — Same pattern, 16 HCP. **Group C.**

19. **`"1H P 2H P" exp=2N got=3H hcp=17 [2,5,3,3] balanced own=1H`** — Opener 17 HCP balanced, partner raised 2H. Expected 2NT game try vs our 3H. **Group C.**

### A-5. Competitive overcall issues (R49)

20. **`"1H P 2C" exp=3S got=2S hcp=11 [7,2,2,2] unbalanced`** — Opponent opened 1H, partner passed, opponent raised 2C. We have 7 spades and 11 HCP. Expected 3S (jump overcall showing preemptive 7-card suit). Our 2S is a simple overcall. With 7 cards and 11 HCP, jump to 3S is more descriptive. **Our bug** — engine should prefer jump overcall with 7-card suit.

21. **`"1D" exp=P got=2C hcp=13 [2,1,4,6] unbalanced`** — Over 1D, we bid 2C with 6 clubs and 13 HCP. Expected is pass. With 13 HCP, 6 clubs and a singleton heart — 2C overcall is actually perfectly standard (10-16 HCP, 5+ suit). **Our bid is correct.** Expected pass seems wrong. **Group B.**

22. **`"P 2H" exp=X got=3D hcp=16 [3,2,5,3] balanced`** — Over 2H weak two, with 16 HCP balanced. Expected double (takeout). Our 3D overcall with only 5 diamonds is less descriptive — double shows support for all unbid suits. **Our bug** — with balanced 16 HCP and short hearts, takeout double is better.

23. **`"1D P 1H" exp=2S got=1S hcp=11 [6,1,2,4] unbalanced`** — Opponents bid 1D-1H. We have 6 spades and 11 HCP. Expected 2S (overcall at 2-level after opponent's 1H). But 1S overcall is cheaper — wait, after 1H, 1S is legal and cheaper than 2S. Expected 2S makes no sense as a simple overcall when 1S is available. Unless it's a jump overcall showing a weak hand with 6-card suit? With 11 HCP, too strong for weak jump. **Group C** — both bids are somewhat defensible.

### A-6. Responder prefers partner's suit (R64)

24. **`"P P 1D P 1S P 2C P" exp=2N got=2D hcp=9 [5,5,3,0] unbalanced own=1S`** — We responded 1S, opener rebid 2C. With 9 HCP, 5-5 in spades/hearts, void in clubs, and 3 diamonds. Expected 2NT (invitational) vs our 2D (preference). With a void in clubs (partner's second suit), 2NT is questionable. Our 2D preference is reasonable. **Group C.**

25. **`"1S P 2N P 3H P" exp=4S got=3S hcp=16 [4,1,2,6] unbalanced own=2N`** — Complex: we opened 2NT (20-21), partner bid 1S(?), we rebid 3H(?) — this auction is unusual. Expected 4S (game in partner's major) vs our 3S. With 4 spades supporting partner, 4S is better. **Our bug** — should raise to game with 20-21 HCP and 4-card support.

26. **`"P P 1C P 1D P 1H P" exp=1N got=2C hcp=7 [3,2,5,3] balanced own=1D`** — We responded 1D over 1C, opener rebid 1H. With 7 HCP, 3 clubs, 2 hearts, 5 diamonds. Expected 1NT (preference) vs our 2C (preference for partner's first suit). 1NT is a more standard choice with a balanced hand. **Our bug** — engine should prefer 1NT with balanced minimums.

### A-7. Respond limit raise issues (R26)

27. **`"1H P" exp=2D got=3H hcp=12 [3,3,5,2] balanced`** — Over 1H with 12 HCP, only 3 hearts, 5 diamonds. Expected 2D (new suit, showing diamond suit). Our 3H (limit raise) requires 4+ hearts per SAYC but we only have 3. **Our bug** — engine gives limit raise with only 3 trumps; should bid 2D showing 5-card suit.

28. **`"1H P" exp=2C got=3H hcp=10 [2,5,1,5] unbalanced`** — Over 1H with 10 HCP, 5 hearts, 5 clubs. Expected 2C (new suit at 2-level with 10+ HCP and 5+ clubs) vs our 3H (limit raise with 5 hearts). With 5 hearts and 10 HCP, either is defensible — limit raise with 5 trumps is a known SAYC treatment. But 2C shows the side suit and keeps options open. **Group C.**

29. **`"1H P" exp=2N got=3H hcp=12 [3,7,2,1] unbalanced`** — Over 1H with 12 HCP and 7 hearts. Expected 2NT (Jacoby 2NT, game-forcing with 4+ support). With 7-card support, Jacoby 2NT is the right game-force bid. But Jacoby requires 13+ HCP per our engine. 12 HCP with 7-card support — should distribution points count? With distribution, this is a game-force hand. **Our bug** — engine should factor in distributional values for Jacoby qualification with extreme fits.

### A-8. Opening pass with borderline hand (R08)

30. **`"P P P" exp=1S got=P hcp=10 [5,3,3,2] balanced`** — 4th seat, 10 HCP, 5 spades. Rule of 15: 10 + 5 = 15, meets the threshold. But 10 HCP is below SAYC minimum of 11 for Rule of 20. In 4th seat, Rule of 15 applies — should open 1S. **Our bug** — engine correctly checks Rule of 15 but the threshold may be set too restrictive for hands that exactly meet it.

31. **`"" exp=1S got=P hcp=10 [5,5,1,2] unbalanced`** — 1st seat, 10 HCP, 5-5 spades/hearts. Rule of 20: 10+5+5=20, qualifies. Should open 1S (longer major or higher with equal). With shape and Rule of 20, this should open. **Our bug** — engine's adjusted minimum should allow this.

32. **`"P P" exp=1C got=P hcp=11 [3,3,3,4] balanced`** — 3rd seat, 11 HCP, balanced 4333. Rule of 20: 11+4+3=18 < 20. In 3rd seat, light openings are common but not universal SAYC. Expected 1C is borderline. **Group C** — 3rd seat light opening.

### A-9. Pass after partner's game (R51)

33. **`"2C P 2N P 3H P 4H P" exp=5H got=P hcp=22 [3,7,3,0] unbalanced own=2C`** — We opened 2C (22+ HCP), partner bid 2NT (22-24 balanced response), we bid 3H (natural, 7 hearts), partner bid 4H. With 22 HCP, 7 hearts, void in clubs — slam interest is clear. Should try for slam (5H = invite or cue bid). **Our bug.**

34. **`"2C P 2N P 3H P 4H P 5H P" exp=6H got=P hcp=11 [2,4,4,3] balanced own=2N`** — Partner opened 2C, we responded 2NT (8+, balanced), partner bid 3H then 4H, then 5H (slam try). With 11 HCP and 4-card heart support, we should accept the slam try — 6H. **Our bug** — engine doesn't handle slam continuation after strong 2C.

### A-10. Pass with values over minor (R24d)

35. **`"1D P" exp=2D got=P hcp=5 [4,4,5,0] unbalanced`** — Over 1D with 5 HCP and 5-card diamond support, void in clubs. Expected 2D (single raise) — but 5 HCP is below the 6 HCP minimum for responding. With a void and 5-card support, distributional values add something, but strict SAYC says 6+ HCP. **Group C** — borderline.

36. **`"1C P" exp=1H got=P hcp=5 [4,6,1,2] unbalanced`** — Over 1C with 5 HCP and 6 hearts. Expected 1H. With a 6-card major, some would bid 1H even with 5 HCP (distributional hand). Our engine adjusts for long suits but may not go low enough. **Our bug** — with 6+ card suit, engine should allow responding with 5 HCP.

### A-11. 2NT vs game response over major (R24y)

37. **`"1H P" exp=3H got=2N hcp=10 [4,3,4,2] balanced`** — Over 1H with 10 HCP and only 3 hearts. Expected 3H (limit raise). But per SAYC, limit raise needs 4+ trumps and 10-12 HCP. With only 3 hearts, 2NT is more appropriate (natural, showing balanced 10-12 without 4-card fit). **Our 2NT is correct!** Expected 3H with 3 trumps is wrong. **Group B.**

38. **`"1S P" exp=2C got=2N hcp=14 [3,4,2,4] balanced`** — Over 1S with 14 HCP, 4 clubs, balanced. Expected 2C (new suit at 2-level). Our 2NT is natural invitational — but 2NT over 1S in SAYC is Jacoby 2NT (game-forcing 4+ support). With only 3 spades, Jacoby is wrong. 2C (10+ HCP, new suit) is better. **Our bug** — engine incorrectly bids 2NT (natural) over major when it should be Jacoby context.

### A-12. Transfer completion issues (R40)

39. **`"1N P 2D P 2H P" exp=P got=2S hcp=3 [5,5,1,2] unbalanced own=2D`** — After transfer to hearts completed (1NT-2D-2H), with 3 HCP, 5-5 majors. We should pass (0-7 HCP, content in 2H). Our 2S bid is wrong — after transfer, bidding a new suit at 2-level shows the other major but needs values. **Our bug.**

40. **`"1N P 2H P 2S P" exp=4H got=3H hcp=10 [5,5,2,1] unbalanced own=2H`** — After transfer to spades (2H-2S), with 10 HCP, 5-5 majors, singleton. Expected 4H (showing second suit + game values) vs our 3H (invitational). With 10 HCP and 5-5, game values — 4H is correct. **Our bug.**

### A-13. Responder rebid after opener NT (R46)

41. **`"P P 1D P 1S P 1N P" exp=2D got=2N hcp=10 [4,2,4,3] balanced own=1S`** — We responded 1S, opener rebid 1NT (12-14 balanced). With 10 HCP balanced, 2NT invite is not unreasonable. But expected 2D (preference to partner's first suit) shows constructive values and diamond support. With 4-4 in spades/diamonds, 2D preference is standard. **Group C** — both are defensible.

42. **`"1D 2S P 2N P" exp=3H got=3S hcp=9 [6,4,1,2] unbalanced own=2S`** — Complex competitive. We overcalled 2S, partner bid 2NT. Expected 3H (showing side suit) vs our 3S (rebid own suit). With 6 spades and 4 hearts, showing hearts is more descriptive. **Our bug** — engine should show a 4-card heart suit over 2NT.

### A-14. Trial bids (R42d0)

43. **`"P P P 1S P 2S P" exp=4H got=3H hcp=20 [5,4,3,1] unbalanced own=1S`** — Opener 20 HCP, partner raised to 2S. Expected 4H (game, maybe showing hearts?). Our 3H is a help-suit game try. With 20 HCP, should just bid game (4S). **Our bug** — 20 HCP is clearly enough for game over single raise.

44. **`"P P 1H P 2H P" exp=4D got=3D hcp=19 [2,5,4,2] semi-balanced own=1H`** — Opener 19 HCP, partner raised 2H. Expected 4D (game try or splinter?) vs our 3D (help-suit trial). With 19 HCP, should bid game (4H). **Our bug** — 19 HCP is game-worthy over a raise.

### A-15. Accept opener's 2NT invite (R64a0)

45. **`"1S 2S P 2N P" exp=3D got=3N hcp=11 [1,5,5,2] unbalanced own=2S`** — Partner overcalled, we raised, partner bid 2NT (asking feature). Expected 3D (showing diamond feature) vs our 3NT. With 1 spade, 5-5 hearts/diamonds — showing a feature (3D) is the correct Ogust-style response. **Our bug** — engine doesn't implement feature showing over 2NT ask.

46. **`"1S 2S P 2N P" exp=3C got=3N hcp=11 [1,5,2,5] unbalanced own=2S`** — Same pattern. Expected 3C (club feature) vs 3NT. **Our bug** — same issue.

### A-16. Opener pass after partner signoff (R61)

47. **`"1D X 1H P 1S P 2N P" exp=3N got=P hcp=14 [4,0,5,4] unbalanced own=1D`** — We opened 1D, opponent doubled, partner bid 1H then 1S, we bid 2NT. Partner's 2NT is an invitational sign. With 14 HCP unbalanced, accepting (3NT) is reasonable. **Our bug** — engine should accept invite with 14 HCP extras.

48. **`"P P 1D P 1H P 1S P 1N P" exp=2N got=P hcp=16 [4,1,4,4] semi-balanced own=1D`** — We opened 1D, responder bid 1H then 1S, we rebid 1NT... wait, this shows opener has 12-14 HCP balanced. But we have 16 HCP — we shouldn't have bid 1NT with 16! This suggests an earlier rebid error. But in this position (after 1NT), partner's pass. Expected 2NT (reinvite). This is complex. **Group C.**

### A-17. Opener rebid own suit (R32)

49. **`"P 1S P 2D P" exp=3S got=2S hcp=14 [6,2,1,4] unbalanced own=1S`** — Opened 1S, partner bid 2D (forcing, 10+ HCP). With 14 HCP and 6 spades, rebid 2S is minimum. But 14 HCP with 6 spades, singleton diamond — should rebid 3S (showing extra length, 16+?) Actually, 14 HCP is minimum for a 3S rebid. Expected 3S with 14 HCP is borderline. **Group C.**

50. **`"1S P 2D P" exp=3D got=2S hcp=12 [6,1,5,1] unbalanced own=1S`** — Opened 1S, partner bid 2D. With 12 HCP, 6S-5D, singletons. Expected 3D (raise partner's suit showing fit) vs our 2S (rebid own suit minimum). With 5-card diamond support, raising to 3D is very reasonable. **Our bug** — engine should raise partner's forcing suit when holding 5-card support.

### A-18. Respond 3NT over 2NT opening (R20)

51. **`"1C 2N P" exp=3D got=3N hcp=6 [2,2,3,6] semi-balanced`** — Partner overcalled 2NT (unusual? or natural?). Opponent opened 1C. If partner's 2NT is natural (20-21), with 6 HCP, 3NT is reasonable. If Unusual 2NT (showing minors), 3D bid makes more sense. Expected 3D suggests Unusual 2NT interpretation — our engine might be treating it as natural. **Our bug** — engine may not handle Unusual 2NT.

52. **`"1D 2N P" exp=3H got=3N hcp=10 [3,3,4,3] balanced`** — Similar. Partner bid 2NT over 1D. If Unusual (showing clubs + hearts), 3H is correct. If natural, 3NT correct. **Our bug** — same Unusual 2NT handling issue.

### A-19. Respond over Michaels cue bid (R60)

53. **`"1D 2D P" exp=2N got=2H hcp=10 [1,2,4,6] unbalanced`** — Opponent opened 1D, partner bid 2D (Michaels, showing both majors). With 1 spade, 2 hearts, 6 clubs — we should bid 2NT (asking for minor, showing no major fit) rather than 2H (only 2-card support). **Our bug** — engine doesn't handle Michaels response correctly.

54. **`"P 1S 2S P" exp=3H got=3S hcp=9 [4,3,3,3] balanced`** — Opponent opened 1S, partner bid 2S (Michaels, showing hearts + minor). Expected 3H (supporting hearts) vs our 3S (cue bid?). With 3 hearts and 4 spades, 3H shows support. **Our bug** — engine treats 2S as natural overcall, not Michaels.

### A-20. Jump raise of minor (R28b)

55. **`"P 1C P" exp=5C got=4C hcp=14 [1,3,3,6] unbalanced`** — Over partner's 1C with 14 HCP, 6 clubs, singleton spade. Expected 5C (game) vs our 4C (preemptive). With 14 HCP and 6-card support, game-level raise is justified. **Our bug** — 14 HCP warrants game bid, not preemptive raise.

56. **`"1D P" exp=4D got=3D hcp=13 [3,2,6,2] semi-balanced`** — Over 1D with 13 HCP, 6 diamonds. Expected 4D vs our 3D. With 13 HCP and 6-card support, jump to 4D is more descriptive. **Our bug** — should consider higher raise with extra values.

### A-21. 1NT opener run/compete (R65c0)

57. **`"1N 2C X P" exp=P got=3C hcp=15 [3,2,3,5] balanced own=1N`** — We opened 1NT, opponent bid 2C, partner doubled (penalty or Stayman?). Expected pass (letting partner's penalty double stand) vs our 3C. With 15 HCP balanced, pass is correct — let partner's double convert to penalty. **Our bug.**

58. **`"1N X XX P" exp=2C got=2D hcp=16 [4,2,4,3] balanced own=1N`** — We opened 1NT, opponent doubled, partner redoubled (showing 10+ HCP). Expected 2C (pass or run?) vs our 2D. After XX, system varies. **Group C** — convention-dependent.

### A-22. Opener accept 3-suit invite (R61c)

59. **`"P P 1C P 1S P 2C P 3C P" exp=P got=3N hcp=14 [2,1,4,6] unbalanced own=1C`** — Opened 1C, partner bid 1S, we rebid 2C, partner raised to 3C (invite). With 14 HCP and 6 clubs — should we accept? 14 HCP unbalanced with a singleton heart suggests passing (minimum opener). Expected pass is correct. **Our bug** — engine bids 3NT too aggressively.

60. **`"P 1D P 1H P 2N P 3D P" exp=3H got=3N hcp=19 [2,3,5,3] balanced own=1D`** — Opened 1D, partner bid 1H, we jumped to 2NT (18-19 balanced), partner bid 3D (showing diamonds). Expected 3H (preference for partner's hearts with 3-card support) vs our 3NT. With 3 hearts and only 2 spades, showing 3-card heart support at 3H is reasonable. **Our bug** — engine should prefer showing support.

### A-23. Opener game over limit raise (R42a)

61. **`"1S P 3S P" exp=P got=4S hcp=13 [5,1,4,3] unbalanced own=1S`** — Partner limit-raised to 3S (10-12 HCP, 4+ spades). With 13 HCP (minimum), SAYC says pass. Our 4S bid is too aggressive. **Our bug.**

62. **`"P P P 1H P 3H P" exp=P got=4H hcp=13 [4,5,1,3] unbalanced own=1H`** — Same pattern, 4th seat opened 1H, partner limit-raised 3H. With 13 HCP (minimum), should pass per SAYC. **Our bug.**

### A-24. Opener rebid jump (R65a)

63. **`"1D P 1H P" exp=3N got=3D hcp=17 [3,2,6,2] semi-balanced own=1D`** — Opened 1D, partner bid 1H. With 17 HCP, 6 diamonds, semi-balanced. Expected 3NT (showing extras and balanced-ish, 18-19 range?) vs our 3D (jump rebid showing 16-18 with 6+ suit). 17 HCP is at the borderline. Both could work. **Group C.**

64. **`"1D P 2H P" exp=6N got=3D hcp=17 [3,2,6,2] semi-balanced own=1D`** — Same hand, but partner forced with 2H (10+ HCP). Expected 6NT is extremely aggressive for 17 HCP. This looks like a **bad test**. **Group B.**

### A-25. Respond game over 1NT (R13)

65. **`"P 1N P" exp=2N got=3N hcp=10 [3,3,4,3] balanced`** — Over partner's 1NT (15-17), with 10 HCP balanced 4333. Expected 2NT (invite) vs our 3NT (game). With 10 HCP, combined is 25-27 — game values. Per SAYC, 10-15 HCP = 3NT. **Our bid is correct.** Expected 2NT with 10 HCP is too conservative. **Group B.**

66. **`"1N 2C" exp=X got=3N hcp=10 [4,3,4,2] balanced`** — Partner opened 1NT, opponent bid 2C. Expected double (penalty? Stayman?). Our 3NT with 10 HCP is standard (game values). The expected X is questionable — is it penalty of 2C? With 10 HCP and 4-2 in clubs, penalty double of natural 2C overcall is an option. **Group C.**

### A-26. Respond Stayman over 1NT (R09)

67. **`"1N P" exp=3S got=2C hcp=14 [6,2,3,2] semi-balanced`** — Over 1NT with 14 HCP, 6 spades. Expected 3S (slam try with 6-card suit). Our 2C (Stayman) doesn't have a 4-card major to find. With 6 spades, should transfer (2H → 2S) then bid game or slam. **Our bug** — engine should prefer transfer with 6-card major, not Stayman.

68. **`"1N P" exp=3H got=2C hcp=14 [3,6,1,3] unbalanced`** — Over 1NT with 14 HCP, 6 hearts. Expected 3H (slam try). Our 2C (Stayman) — same issue. Should transfer first (2D → 2H). **Our bug.**

### A-27. Respond to takeout double (R55)

69. **`"1S P 2H X P" exp=3C got=2S hcp=7 [4,4,2,3] balanced`** — Opponent opened 1S, partner passed, opponent bid 2H, partner doubled (takeout). Expected 3C (advance with cheapest suit). Our 2S (bidding opponent's suit!) is a cue bid, which requires 12+ HCP. With only 7 HCP, can't cue bid. **Our bug.**

70. **`"P 1H X 3H P 4H X P" exp=P got=5C hcp=6 [2,5,2,4] unbalanced`** — Complex: opponent opened 1H, partner doubled, opponent raised to 3H, passed, opponent bid 4H, partner doubled again. With 6 HCP and 5 hearts (opponent's suit!), 4 clubs — expected pass (let penalty double stand). Our 5C at the 5-level with 6 HCP is wild. **Our bug.**

### A-28. Grand slam force (R52a)

71. **`"1S P 5N P" exp=7S got=6S hcp=14 [6,2,5,0] unbalanced own=1S`** — Partner responded 5NT (grand slam force). Expected 7S (showing 2 of top 3 honors in trumps). Engine needs to handle GSF convention. **Our bug** — no GSF handling.

### A-29. Opener pass after interference (R63b)

72. **`"P 1D 2S 3C P" exp=3D got=P hcp=10 [2,3,8,0] unbalanced own=1D`** — We opened 1D with 8 diamonds. Opponent bid 2S, partner bid 3C. With 8 diamonds and 10 HCP, should bid 3D (showing our suit). **Our bug** — engine passes when it should rebid the 8-card suit.

### A-30. New suit after interference (R28)

73. **`"P P P 1C 1H 1S" exp=2C got=2D hcp=11 [3,3,5,2] balanced`** — Partner opened 1C, opponent overcalled 1H, we bid 1S. Now expected 2C (raise partner's clubs) vs our 2D. With only 2 clubs, raising to 2C is not ideal but... wait, the auction has 6 bids already. We're responding here. Actually with 3 spades and 5 diamonds, partner's 1C opened, opponent 1H, we have 1S already bid? This is confusing. Expected 2C (support partner) vs 2D (show our suit). With 5 diamonds and 2 clubs, showing our suit is reasonable. **Group C.**

### A-31. Pass without values over major (R24x)

74. **`"1S P" exp=1N got=P hcp=5 [2,5,3,3] balanced`** — Over 1S with 5 HCP and 5 hearts. Expected 1NT (denying fit, semi-forcing). With 5 HCP, below the 6 HCP minimum for 1NT response. But with 5 hearts, some would strain to bid. **Group C** — borderline.

### A-32. 3-minor weak over 1NT (R15b)

75. **`"1N P" exp=3N got=3D hcp=7 [3,2,7,1] unbalanced`** — Over 1NT with 7 HCP, 7 diamonds, singleton club. Expected 3NT (game). Our 3D is a minor-suit slam try in some systems, or a transfer/preempt. With 7 HCP and 7 diamonds, combined values are 22-24 — borderline for 3NT. Expected 3NT is aggressive. **Group C.**

### A-33. 2D as natural overcall not strong 2C (R21)

76. **`"1D 2C X" exp=P got=2D hcp=5 [3,4,3,3] balanced`** — Opponent opened 1D, partner overcalled 2C (natural), opponent doubled. Our 2D is wrong — treating 2C as strong artificial when it's a natural overcall. Pass is correct with 5 HCP. **Our bug** — already identified in inherited test issues.

### A-34. Responder rebid after opener 3D (R50d)

77. **`"1S P 2H P 3D P" exp=3H got=3N hcp=10 [2,6,2,3] semi-balanced own=2H`** — We responded 2H (10+ HCP, 5+ hearts), opener rebid 3D. Expected 3H (rebid own suit, keeping options open) vs our 3NT. With 6 hearts and 2 spades, 3H to show 6-card suit is more flexible. **Our bug** — engine jumps to 3NT too eagerly.

### A-35. Competitive double (R57)

78. **`"2H X 4H P P" exp=X got=5D hcp=18 [4,2,6,1] unbalanced`** — Partner doubled 2H (takeout), opponent bid 4H. Expected double (penalty with 18 HCP and heart length?) vs our 5D. With 2 hearts and 6 diamonds, 5D could work but double is more flexible with 18 HCP. The expected double at 4-level is penalty-oriented. **Group C** — both are defensible.

### A-36. Opener accept 2NT invite (R61d)

79. **`"P 1D P 1S P 2D P 2N P" exp=3S got=3N hcp=15 [3,1,7,2] unbalanced own=1D`** — Opened 1D, partner bid 1S, we rebid 2D, partner invited 2NT. With 15 HCP, 7 diamonds, 3 spades, singleton heart — should bid 3S (showing spade support and extras) vs our 3NT. With singleton heart, 3NT is risky. 3S with 3-card support is better. **Our bug.**

### A-37. Opener raise to slam after game (R61a)

80. **`"1H P 2N P 3H P 4N P" exp=5S got=5N hcp=19 [2,5,3,3] balanced own=1H`** — We opened 1H, partner Jacoby 2NT, we rebid 3H (minimum), partner bid 4NT (Blackwood, ace ask). Expected 5S (3 aces) vs our 5N. In standard Blackwood: 5C=0/4, 5D=1, 5H=2, 5S=3. With 19 HCP — how many aces? Need to check the hand. Balanced [2,5,3,3] with 19 HCP — likely has 3 aces. 5S = 3 aces is correct. Our 5N is wrong. **Our bug.**

### A-38. Jacoby 2NT opener rebid (R65a0)

81. **`"1H P 2N P" exp=3H got=3N hcp=17 [2,6,2,3] semi-balanced own=1H`** — Opened 1H, partner Jacoby 2NT (game force, 4+ hearts). Expected 3H (minimum, no side shortness). Our 3NT (extras, no singleton, balanced). With 17 HCP, 3NT shows extras — but 17 HCP for a major opener is not clearly "extras" (which is usually 15-17 range). Actually per SAYC, 3NT over Jacoby shows 15-17 with no singleton — so this is defensible. **Group C.**

### A-39. Opener rebid 3D (R32a)

82. **`"P 1D P 1N P" exp=2C got=3D hcp=17 [2,1,6,4] unbalanced own=1D`** — Opened 1D, partner bid 1NT (6-9 HCP). Expected 2C (showing second suit) vs our 3D (jump rebid showing 16-18 with 6+ suit). With 17 HCP and 4 clubs, 2C shows shape and is non-forcing. 3D is invitational with 6+ diamonds. Both are reasonable. **Group C.**

### A-40. Responder rebid 3NT game (R64b)

83. **`"1H P 1S P 2D P" exp=4C got=3N hcp=19 [4,2,3,4] balanced own=1S`** — We responded 1S, opener rebid 2D. With 19 HCP balanced, 3NT is a natural game bid. Expected 4C (showing club suit, slam try?). With 19 HCP opposite opener, slam is possible. But 4C is an unusual bid. 3NT is standard. **Group C** — but our 3NT is quite defensible.

### A-41. Stayman double handling (R40eb, R40ea)

84. **`"1N P 2C X" exp=XX got=P hcp=16 [3,2,3,5] balanced own=1N`** — We opened 1NT, partner bid 2C (Stayman), opponent doubled. Expected XX (showing good clubs). Our pass is also a valid approach. **Group C.**

85. **`"1N P 2C X" exp=2S got=XX hcp=16 [4,2,4,3] balanced own=1N`** — Same situation. Expected 2S (answering Stayman normally despite double) vs our XX. Both are partnership-dependent. **Group C.**

### A-42. Jacoby 2NT opener second suit (R43b)

86. **`"1S P 2N P" exp=3H got=4D hcp=18 [5,1,5,2] unbalanced own=1S`** — Opened 1S, partner Jacoby 2NT. Expected 3H (singleton/void — shortness showing). But we have 1 heart — should show shortness. Our 4D bid is not standard Jacoby response. 3H shortness is correct. **Our bug** — engine doesn't implement Jacoby shortness-showing rebids.

### A-43. Single raise issues (R25)

87. **`"1S P" exp=3S got=2S hcp=9 [3,2,4,4] balanced`** — Over 1S with 9 HCP, 3 spades. Expected 3S (limit raise) but only 3 trumps (need 4+ for limit raise per SAYC). Our 2S (single raise, 6-10, 3+ support) is correct. **Group B** — expected limit raise with only 3 trumps is wrong.

### A-44. Opener rebid game after 1NT response (R63)

88. **`"1H P 1N P" exp=4H got=3N hcp=20 [2,6,3,2] semi-balanced own=1H`** — Opened 1H, partner bid 1NT (6-9). With 20 HCP and 6 hearts, expected 4H (game in own suit with extras). Our 3NT is a signoff in NT. With 6 hearts, 4H is clearly better. **Our bug.**

### A-45. Opener pass after 1S response (R65a2)

89. **`"P P P 1D P 1S P" exp=P got=2D hcp=12 [3,2,6,2] semi-balanced own=1D`** — 4th seat opened 1D, partner bid 1S (one-round forcing). Expected pass — but opener cannot pass a forcing 1-level new suit response! 1S over 1♥ is forcing; 1-level new suit over any 1-of-a-suit is forcing. Our 2D (rebid own suit) is correct. **Group B** — expected pass violates SAYC forcing rules.

### A-46. Opener rebid game strong (R65b)

90. **`"1D P 1H P" exp=2S got=3N hcp=20 [4,2,5,2] semi-balanced own=1D`** — Opened 1D, partner bid 1H. With 20 HCP and 4 spades. Expected 2S (reverse, showing 17+ HCP and 4 spades). Our 3NT. A reverse to 2S is the correct SAYC treatment showing shape and extras. **Our bug** — engine should prefer reverse with 4-card side major and 17+ HCP.

### A-47. Negative double context (R67)

91. **`"1C 1D" exp=X got=1N hcp=8 [5,4,1,3] unbalanced`** — Partner opened 1C, opponent overcalled 1D. With 8 HCP, 5 spades, 4 hearts. Expected negative double (showing 4+ in unbid majors). Our 1NT is wrong with an unbalanced hand and singleton diamond. **Our bug.**

### A-48. Weak two opening vs 1-level (R06)

92. **`"" exp=1S got=2S hcp=10 [6,0,3,4] unbalanced`** — First seat, 10 HCP, 6 spades, void hearts. Expected 1S (opening). Our 2S (weak two). Rule of 20: 10+6+4=20. Qualifies to open. But with void in hearts and 6 spades, weak two is also reasonable. 10 HCP + Rule of 20 meeting threshold = borderline opener. **Group C.**

### A-49. Opener max decline quantitative 4NT (R40d)

93. **`"1N P 4N P" exp=6N got=5N hcp=16 [3,4,4,2] balanced own=1N`** — We opened 1NT (15-17), partner bid 4NT (quantitative slam try). Expected 6NT (accept) vs our 5N. With 16 HCP — per SAYC, quantitative 4NT invites slam. With 16 (middle range), the answer is judgment. Standard teaching: accept with maximum (17), decline with minimum (15), 16 is a judgment call. Expected 6N with 16 HCP is borderline. **Group C.**

### A-50. 1NT opener complete transfer after double (R65c)

94. **`"1N P 2H X" exp=P got=2S hcp=15 [2,3,4,4] balanced own=1N`** — We opened 1NT, partner transferred (2H = transfer to spades), opponent doubled. Expected pass (system off after double, or redouble). Our 2S (completing transfer) is also standard — many play "system on" and complete transfer despite double. **Group C.**

### A-51. Opener raise new suit to 3 (R65a1)

95. **`"1S P 2H P" exp=4H got=3H hcp=17 [5,3,3,2] balanced own=1S`** — Opened 1S, partner bid 2H (10+ HCP, 5+ hearts, forcing). Expected 4H (raise to game with 3-card support and extras) vs our 3H (raise with support, invitational). With 17 HCP and 3 hearts, 4H game is justified (combined 27+ HCP). **Our bug.**

### A-52. Opener raise responder (R33, R33a)

96. **`"1D P 1S P" exp=3S got=2S hcp=14 [4,1,4,4] semi-balanced own=1D`** — Opened 1D, partner bid 1S. With 4 spades and 14 HCP. Expected 3S (jump raise, 16-18 with 4+ support). With 14 HCP, 2S (simple raise, 12-15 with 3+ support) is correct. **Group B** — expected jump raise with only 14 HCP is wrong.

97. **`"1D P 1S P" exp=4S got=3S hcp=18 [4,2,4,3] balanced own=1D`** — Opened 1D, partner bid 1S. With 18 HCP and 4 spades. Expected 4S (game raise) vs our 3S (jump raise, 16-18). With 18 HCP and 4-card support, 4S is better. **Our bug** — 18 HCP with 4-card support should jump to game.

### A-53. Penalty double of 1NT (R56b)

98. **`"1N P P" exp=P got=X hcp=16 [4,3,1,5] unbalanced`** — Opponent opened 1NT, two passes. With 16 HCP unbalanced (singleton diamond). Expected pass vs our double. In balancing seat, 15+ double of 1NT is penalty. But with an unbalanced hand (singleton), penalty double is risky — pass is safer. **Our bug** — should not penalty-double NT with a singleton.

### A-54. Opener rebid after competitive (R53b)

99. **`"1D 1H 2C 4H" exp=P got=5D hcp=15 [2,1,6,4] unbalanced own=1D`** — We opened 1D, opponent 1H, partner 2C, opponent jumped to 4H. Expected pass (not enough to bid at 5-level) vs our 5D. With 15 HCP and 6 diamonds, bidding 5D at the 5-level is too aggressive. **Our bug.**

### A-55. 2NT/3NT response over minor (R24b, R50c)

100. **`"1C P" exp=2N got=3N hcp=13 [3,3,4,3] balanced`** — Over 1C with 13 HCP balanced 4333. Expected 2NT (invitational, 11-12) vs our 3NT (game, 13-15). With 13 HCP, 3NT is correct per SAYC (13-15 balanced = 3NT). Our bid is right. **Group B.**

101. **`"1D P" exp=2N got=3N hcp=13 [3,3,4,3] balanced`** — Same pattern over 1D. 13 HCP balanced = 3NT is correct. **Group B.**

### A-56. Opener rebid 2NT (R36)

102. **`"P 1C P 2C P" exp=3N got=2N hcp=19 [3,3,3,4] balanced own=1C`** — Opened 1C, partner raised to 2C (6-10 HCP, 4+ clubs). With 19 HCP, expected 3NT (game) vs our 2NT (invite, 18-19). Combined minimum: 19+6 = 25, game values. With 19 HCP over a raise, 3NT is correct. **Our bug.**

### A-57. Opener pass over limit raise (R42b)

103. **`"1H P 3H P" exp=4H got=P hcp=11 [0,5,3,5] unbalanced own=1H`** — Opened 1H (but only 11 HCP?). Partner limit-raised to 3H (10-12, 4+ hearts). Expected 4H. With 11 HCP and void in spades — distributional values are significant (void = 3 pts). Total points ~14 with distribution. This is very borderline for game. The hand opened light (Rule of 20: 11+5+5=21). **Group C.**

### A-58. Respond 2C over major (R24)

104. **`"1S P" exp=2C got=1N hcp=11 [2,3,4,4] balanced`** — Over 1S with 11 HCP balanced, 4-4 minors. Expected 2C (new suit at 2-level, 10+, 4+ clubs). Our 1NT. With 11 HCP, 2C is correct — 1NT shows only 6-9(10) HCP. **Our bug.**

### A-59. Trial bid return (R50f)

105. **`"P P P 1H P 2H P 3D P" exp=3H got=P hcp=8 [4,3,2,4] balanced own=2H`** — Partner opened 1H, we raised 2H. Opener bid 3D (help-suit game try). Expected 3H (decline, return to partscore) vs our pass. We should not pass a help-suit trial bid — must return to 3H at minimum. **Our bug.**

### A-60. Respond transfer to spades over 2NT with interference (R18)

106. **`"2N 3C" exp=X got=3H hcp=5 [5,4,3,1] unbalanced`** — Partner opened 2NT, opponent bid 3C. Expected double (showing values, penalty?). Our 3H (transfer to spades). With 5 spades and 5 HCP, transferring is reasonable — but the interference changes things. Double of 3C might be Stayman-substitute. **Group C.**

### A-61. Stayman invite rebid (R39)

107. **`"1N P 2C P 2D P" exp=2N got=2S hcp=9 [4,4,3,2] balanced own=2C`** — We bid Stayman over 1NT, opener denied a 4-card major (2D). Expected 2NT (invitational, showing 8-9 HCP) vs our 2S. After Stayman denial, 2S is non-standard — could be a signoff if partnership agrees, but 2NT is the standard invite. **Our bug.**

### A-62. Various opener rebid (R34)

108. **`"P 1C P 1H P" exp=1N got=2D hcp=11 [3,1,4,5] unbalanced own=1C`** — Opened 1C, partner bid 1H. Expected 1NT (12-14 balanced). But we're unbalanced with 11 HCP, singleton heart. 1NT with a singleton in partner's suit is inappropriate. Our 2D (new suit) is actually more descriptive of the hand. Expected 1NT is wrong for this shape. **Group B** — our 2D is better.

109. **`"P 1C P 1D X" exp=P got=1H hcp=14 [4,4,1,4] semi-balanced own=1C`** — Opened 1C, partner bid 1D, opponent doubled. Expected pass vs our 1H. After opponent's takeout double, opener often redoubles (10+ HCP and no fit) or bids naturally. With 4-4 majors and 14 HCP, bidding 1H shows a suit. Pass is also valid (no clearly right answer after double). **Group C.**

110. **`"1D P 1S P" exp=1N got=2H hcp=15 [1,4,5,3] unbalanced own=1D`** — Opened 1D, partner bid 1S. Expected 1NT (12-14 balanced). But we have 15 HCP and are unbalanced (singleton spade, 4 hearts, 5 diamonds). 2H is a reverse showing 17+ HCP — but we only have 15. Expected 1NT is wrong with singleton in partner's suit and 15 HCP (above 1NT range). **Group C** — neither bid is perfect.

### A-63. 3NT over major balanced (R24z)

111. **`"1H P" exp=2N got=3N hcp=21 [3,3,3,4] balanced`** — Over 1H with 21 HCP, only 3 hearts. Expected 2NT (Jacoby, game-forcing 4+ support?). But Jacoby needs 4+ hearts — only 3 here. 2NT cannot be Jacoby with only 3 trumps. With 21 HCP balanced, 3NT showing 13-15 is too low! Should bid 2C (game-forcing new suit). **Our bug** — but expected 2NT is also wrong (only 3 hearts). Both wrong. **Group C.**

112. **`"1S P" exp=3C got=3N hcp=21 [3,3,2,5] balanced`** — Over 1S with 21 HCP, only 3 spades, 5 clubs. Expected 3C (jump shift, 19+ with 5+ suit). Our 3NT (13-15 range) understates the hand drastically. **Our bug** — need jump shift for 21 HCP.

113. **`"1S P" exp=3D got=3N hcp=24 [3,3,5,2] balanced`** — Over 1S with 24 HCP! Expected 3D (jump shift with 5 diamonds). Our 3NT dramatically understates this hand. **Our bug.**

### A-64. Responder show suit (R65d)

114. **`"P 1D 2S 3C P 3D P" exp=5C got=4C hcp=14 [3,3,1,6] unbalanced own=3C`** — Partner opened 1D, opponent 2S, we bid 3C, partner rebid 3D. Expected 5C (game) vs our 4C. With 14 HCP and 6 clubs, game in clubs is reasonable. **Group C** — borderline.

115. **`"2S X P 3C P 3H P" exp=5N got=4C hcp=13 [3,1,4,5] unbalanced own=3C`** — Partner doubled 2S, we bid 3C, partner bid 3H. Expected 5NT (grand slam force?) vs our 4C. With 13 HCP, 5NT is very aggressive. **Group C.**

116. **`"1D 1S P 2D P" exp=3S got=2S hcp=11 [5,0,4,4] unbalanced own=1S`** — We overcalled 1S, partner raised to 2D, we should... Expected 3S (invite, showing 6+ spades?). Our 2S (minimum rebid). With 11 HCP and 5 spades, 2S is fine. **Group C.**

### A-65. Responder raise partner major to game (R64a00)

117. **`"P 1C P 1H P 1S P" exp=3N got=4S hcp=13 [3,5,3,2] balanced own=1H`** — Opener bid 1C-1S, we responded 1H. With 13 HCP, 3 spades, 5 hearts. Expected 3NT (game) vs our 4S. With only 3 spades, 3NT is more appropriate. **Our bug.**

118. **`"1D 2S P 2N P 3H P" exp=4S got=4H hcp=16 [2,3,3,5] balanced own=2N`** — Complex competitive. Expected 4S (preference) vs our 4H. **Complex auction — Group C.**

119. **`"P P 1D P 1H P 1S P" exp=1N got=4S hcp=9 [3,5,2,3] balanced own=1H`** — Opener bid 1D-1S, we responded 1H. With 9 HCP and 3 spades, 5 hearts. Expected 1NT (preference with minimum values). Our 4S (game!) with 9 HCP is clearly too aggressive. **Our bug.**

### A-66. 1NT response pass (R15)

120. **`"1N X XX P 2C P" exp=2D got=P hcp=0 [2,2,6,3] semi-balanced`** — Partner opened 1NT, opponent doubled, partner(?) redoubled. Partner bid 2C (escape). We have 0 HCP and 6 diamonds. Expected 2D (correcting to our long suit) vs pass. With 0 HCP and 6 diamonds, playing in 2D is better than 2C with only 3 clubs. **Our bug.**

121. **`"1S 1N 2S P P X P" exp=3H got=P hcp=6 [1,5,2,5] unbalanced`** — Complex competitive. Partner overcalled 1NT, opponent bid 2S, passed back, partner doubled. Expected 3H (bid our suit) vs pass. With 5 hearts and partner doubling, should bid 3H. **Our bug.**

122. **`"1N P" exp=2N got=P hcp=8 [3,2,3,5] balanced`** — Over 1NT with 8 HCP balanced. Expected 2NT (invite, 8-9 HCP range). Our pass. Per SAYC, 8 HCP is borderline — some pass, some invite. **Group C.**

### A-67. Opener rebid new suit (R34 continued)

Items 108-110 already covered above.

### A-68. Responder rebid after opener raise (R45)

123. **`"P P 1S 1N P 2D P 3D P" exp=4H got=P hcp=9 [3,6,3,1] unbalanced own=2D`** — Complex. Expected 4H (showing heart suit for game?) vs pass. With 6 hearts and 9 HCP, unclear if 4H is correct after this auction. **Group C.**

124. **`"1D 2S P 2N P 3N P" exp=4S got=P hcp=16 [2,3,3,5] balanced own=2N`** — Partner overcalled 2S, we bid 2NT, partner bid 3NT. Expected 4S (preference back to partner's suit) vs pass. With 2 spades, sticking with 3NT seems fine. **Group C.**

125. **`"P P 1D 1S 2C 2S 3C" exp=3S got=4S hcp=13 [6,1,3,3] unbalanced own=1S`** — We overcalled 1S, opponent raised, our partner bid 3C. Expected 3S (simple rebid) vs our 4S (game). With 6 spades and 13 HCP, 3S is more prudent. **Our bug** — engine too aggressive.

### A-69. Responder rebid after opener 2NT (R64a0 — already covered)

Items 45-46 already covered above (feature showing over 2NT).

---

## Summary: GROUP A — Our Bug (fix the rule engine)

| # | Case | Expected | Got | Issue |
|---|------|----------|-----|-------|
| A1 | `"1D P" hcp=11 [3,3,4,3]` | 1N | P | Responding pass too generous |
| A2 | `"1D P" hcp=10 [3,2,4,4]` | 2D | P | Should raise with 4-card support |
| A3 | `"1C P" hcp=12 [3,3,3,4]` | 1N | P | Pass with 12 HCP is wrong |
| A5 | `"P P 1D 1S X P 2C P" hcp=10` | 2N | P | Should invite with 10 balanced |
| A6 | `"P 1C 1D P P 1H 1S P P X" hcp=15` | 2D | P | Should pull to own suit |
| A7 | `"1S 2C 2S P P" hcp=10` | X | P | Should reopen with double |
| A9 | `"1D P 1S P 1N P 2N P 3S P" hcp=12` | 3N | P | Should accept invite |
| A10 | `"1C 1D P 2D" hcp=21` | 3H | P | 21 HCP must act |
| A13 | `"1D P" hcp=20 [5,2,3,3]` | 2S | 1S | Need jump shift with 19+ |
| A20 | `"1H P 2C" hcp=11 [7,2,2,2]` | 3S | 2S | Jump with 7-card suit |
| A22 | `"P 2H" hcp=16 [3,2,5,3]` | X | 3D | Takeout double better |
| A25 | `"1S P 2N P 3H P" hcp=16 [4,1,2,6]` | 4S | 3S | Game with 20-21 + fit |
| A26 | `"P P 1C P 1D P 1H P" hcp=7` | 1N | 2C | Prefer 1NT balanced |
| A27 | `"1H P" hcp=12 [3,3,5,2]` | 2D | 3H | Limit raise needs 4+ trumps |
| A29 | `"1H P" hcp=12 [3,7,2,1]` | 2N | 3H | Game-force with 7-card fit |
| A30 | `"P P P" hcp=10 [5,3,3,2]` | 1S | P | Rule of 15 met (10+5=15) |
| A31 | `"" hcp=10 [5,5,1,2]` | 1S | P | Rule of 20 met (10+5+5=20) |
| A33 | `"2C P 2N P 3H P 4H P" hcp=22` | 5H | P | Slam interest with 22 HCP |
| A34 | `"2C P 2N P 3H P 4H P 5H P" hcp=11` | 6H | P | Accept slam try |
| A36 | `"1C P" hcp=5 [4,6,1,2]` | 1H | P | 6-card major allows light response |
| A38 | `"1S P" hcp=14 [3,4,2,4]` | 2C | 2N | 2NT is Jacoby (need 4 support) |
| A39 | `"1N P 2D P 2H P" hcp=3 [5,5,1,2]` | P | 2S | Pass weak after transfer |
| A40 | `"1N P 2H P 2S P" hcp=10 [5,5,2,1]` | 4H | 3H | Game values with 5-5 |
| A42 | `"1D 2S P 2N P" hcp=9 [6,4,1,2]` | 3H | 3S | Show 4-card side suit |
| A43 | `"P P P 1S P 2S P" hcp=20` | 4H | 3H | 20 HCP = game |
| A44 | `"P P 1H P 2H P" hcp=19` | 4D | 3D | 19 HCP = game |
| A45 | `"1S 2S P 2N P" hcp=11` | 3D | 3N | Feature showing over 2NT |
| A46 | `"1S 2S P 2N P" hcp=11` | 3C | 3N | Feature showing over 2NT |
| A47 | `"1D X 1H P 1S P 2N P" hcp=14` | 3N | P | Accept invite with extras |
| A50 | `"1S P 2D P" hcp=12 [6,1,5,1]` | 3D | 2S | Raise partner with 5-card fit |
| A51 | `"1C 2N P" hcp=6 [2,2,3,6]` | 3D | 3N | Unusual 2NT response |
| A52 | `"1D 2N P" hcp=10 [3,3,4,3]` | 3H | 3N | Unusual 2NT response |
| A53 | `"1D 2D P" hcp=10 [1,2,4,6]` | 2N | 2H | Michaels response |
| A54 | `"P 1S 2S P" hcp=9 [4,3,3,3]` | 3H | 3S | Michaels response |
| A55 | `"P 1C P" hcp=14 [1,3,3,6]` | 5C | 4C | Game with 14 HCP + fit |
| A56 | `"1D P" hcp=13 [3,2,6,2]` | 4D | 3D | Jump raise with extras |
| A57 | `"1N 2C X P" hcp=15` | P | 3C | Let penalty double stand |
| A59 | `"P P 1C P 1S P 2C P 3C P" hcp=14` | P | 3N | Pass minimum with invite |
| A60 | `"P 1D P 1H P 2N P 3D P" hcp=19` | 3H | 3N | Show 3-card heart support |
| A61 | `"1S P 3S P" hcp=13` | P | 4S | Pass minimum limit raise |
| A62 | `"P P P 1H P 3H P" hcp=13` | P | 4H | Pass minimum limit raise |
| A67 | `"1N P" hcp=14 [6,2,3,2]` | 3S | 2C | Transfer or 3S slam try, not Stayman |
| A68 | `"1N P" hcp=14 [3,6,1,3]` | 3H | 2C | Transfer, not Stayman |
| A69 | `"1S P 2H X P" hcp=7 [4,4,2,3]` | 3C | 2S | Can't cue bid with 7 HCP |
| A70 | `"P 1H X 3H P 4H X P" hcp=6` | P | 5C | Pass penalty double |
| A71 | `"1S P 5N P" hcp=14` | 7S | 6S | Handle GSF convention |
| A72 | `"P 1D 2S 3C P" hcp=10 [2,3,8,0]` | 3D | P | Rebid 8-card suit |
| A76 | `"1D 2C X" hcp=5` | P | 2D | 2C is natural, not strong |
| A77 | `"1S P 2H P 3D P" hcp=10` | 3H | 3N | Rebid 6-card heart suit |
| A79 | `"P 1D P 1S P 2D P 2N P" hcp=15` | 3S | 3N | Show spade support w/ singleton |
| A80 | `"1H P 2N P 3H P 4N P" hcp=19` | 5S | 5N | Blackwood: 5S = 3 aces |
| A86 | `"1S P 2N P" hcp=18 [5,1,5,2]` | 3H | 4D | Show shortness in Jacoby |
| A88 | `"1H P 1N P" hcp=20` | 4H | 3N | Game in 6-card major |
| A90 | `"1D P 1H P" hcp=20 [4,2,5,2]` | 2S | 3N | Reverse with 4-card major |
| A91 | `"1C 1D" hcp=8 [5,4,1,3]` | X | 1N | Negative double for majors |
| A95 | `"1S P 2H P" hcp=17` | 4H | 3H | Game raise with 3+fit and extras |
| A97 | `"1D P 1S P" hcp=18 [4,2,4,3]` | 4S | 3S | Game raise with 18 HCP + 4 support |
| A98 | `"1N P P" hcp=16 [4,3,1,5]` | P | X | Don't penalty-dbl NT unbalanced |
| A99 | `"1D 1H 2C 4H" hcp=15` | P | 5D | Don't bid 5-level with 15 HCP |
| A102 | `"P 1C P 2C P" hcp=19` | 3N | 2N | Game with 19 HCP over raise |
| A104 | `"1S P" hcp=11 [2,3,4,4]` | 2C | 1N | 11 HCP too strong for 1NT |
| A105 | `"P P P 1H P 2H P 3D P" hcp=8` | 3H | P | Must return to 3H (game try) |
| A107 | `"1N P 2C P 2D P" hcp=9 [4,4,3,2]` | 2N | 2S | 2NT invite after Stayman denial |
| A112 | `"1S P" hcp=21 [3,3,2,5]` | 3C | 3N | Jump shift with 21 HCP |
| A113 | `"1S P" hcp=24 [3,3,5,2]` | 3D | 3N | Jump shift with 24 HCP |
| A117 | `"P 1C P 1H P 1S P" hcp=13` | 3N | 4S | 3NT with only 3 spades |
| A119 | `"P P 1D P 1H P 1S P" hcp=9` | 1N | 4S | 1NT, not game with 9 HCP |
| A120 | `"1N X XX P 2C P" hcp=0` | 2D | P | Correct to long suit |
| A121 | `"1S 1N 2S P P X P" hcp=6` | 3H | P | Bid hearts after double |
| A125 | `"P P 1D 1S 2C 2S 3C" hcp=13` | 3S | 4S | 3S not 4S in competition |

**Total Group A: ~70 cases**

---

## GROUP B — Bad Test (remove the expected bid)

| # | Case | Expected | Got | SAYC Justification |
|---|------|----------|-----|---------------------|
| B1 | `"1C P" hcp=7 [4,2,4,3] exp=1D got=1S` | 1D | 1S | SAYC: bid major first over minor; 1S is correct |
| B2 | `"1D" hcp=13 [2,1,4,6] exp=P got=2C` | P | 2C | 13 HCP + 6 clubs = standard overcall; pass is wrong |
| B3 | `"1H P" hcp=10 [4,3,4,2] exp=3H got=2N` | 3H | 2N | Limit raise needs 4+ trumps; only 3 hearts, 2NT is correct |
| B4 | `"1D P" hcp=17 [3,2,6,2] exp=6N got=3D` | 6N | 3D | 6NT with 17 HCP is absurd; 3D is reasonable |
| B5 | `"P 1N P" hcp=10 exp=2N got=3N` | 2N | 3N | 10 HCP over 1NT = game values; 3NT is correct per SAYC |
| B6 | `"P P P 1D P 1S P" hcp=12 exp=P got=2D` | P | 2D | Opener cannot pass a forcing 1-level new suit response |
| B7 | `"1D P 1S P" hcp=14 [4,1,4,4] exp=3S got=2S` | 3S | 2S | Jump raise needs 16-18 HCP; 14 is simple raise territory |
| B8 | `"1C P" hcp=13 [3,3,4,3] exp=2N got=3N` | 2N | 3N | 13 HCP balanced = 3NT (13-15 range), not 2NT (11-12) |
| B9 | `"1D P" hcp=13 [3,3,4,3] exp=2N got=3N` | 2N | 3N | Same as above |
| B10 | `"1S P" hcp=9 [3,2,4,4] exp=3S got=2S` | 3S | 2S | Limit raise needs 4+ trumps and 10+; 3 trumps + 9 HCP = single raise |
| B11 | `"P 1C P 1H P" hcp=11 [3,1,4,5] exp=1N got=2D` | 1N | 2D | Singleton in partner's suit, unbalanced — 2D better than 1NT |

**Total Group B: 11 cases**

---

## GROUP C — Convention Variant (both bids defensible)

| # | Case | Expected | Got | Note |
|---|------|----------|-----|------|
| C1 | `"P P 1D 1S 1N" hcp=6 [3,5,3,2] exp=2S got=P` | 2S | P | 6 HCP, 3-card support in competition; borderline |
| C2 | `"1S 2S 3S 4C P" hcp=8 exp=4D got=P` | 4D | P | Complex competitive; unclear what 4D means |
| C3 | `"1C P" hcp=7 [4,2,5,2] exp=1D got=1S` | 1D | 1S | 5D+4S; show longest or major first — style choice |
| C4 | `"1D P" hcp=16 [5,0,4,4] exp=2S got=1S` | 2S | 1S | Jump shift at 16 HCP — aggressive; 1S also valid |
| C5 | `"1C P" hcp=15 [2,6,1,4] exp=2H got=1H` | 2H | 1H | Jump shift at 15 HCP — partnership choice |
| C6 | `"1S P 2S P" hcp=16 [5,3,5,0] exp=4S got=3D` | 4S | 3D | Both valid game tries |
| C7 | `"1S P 2S P" hcp=17 [5,3,3,2] exp=2N got=3S` | 2N | 3S | 2NT vs 3S: both are game tries |
| C8 | `"1S P 2S P" hcp=16 [5,3,3,2] exp=2N got=3S` | 2N | 3S | Same — both valid |
| C9 | `"1H P 2H P" hcp=17 [2,5,3,3] exp=2N got=3H` | 2N | 3H | Same — both valid |
| C10 | `"1D P 1H" hcp=11 [6,1,2,4] exp=2S got=1S` | 2S | 1S | 1S simple vs 2S (which is not available below 1H?). After 1H, 1S is legal. Both work |
| C11 | `"P P 1D P 1S P 2C P" hcp=9 [5,5,3,0] exp=2N got=2D` | 2N | 2D | 2NT invite vs 2D preference — both reasonable |
| C12 | `"1H P" hcp=10 [2,5,1,5] exp=2C got=3H` | 2C | 3H | New suit vs limit raise with 5 trumps; both valid |
| C13 | `"P P" hcp=11 [3,3,3,4] exp=1C got=P` | 1C | P | 3rd seat light opening; 11 HCP 4333 — borderline |
| C14 | `"P P 1D P 1S P 1N P" hcp=10 [4,2,4,3] exp=2D got=2N` | 2D | 2N | Preference vs invite; both valid |
| C15 | `"1D P 1H P" hcp=17 [3,2,6,2] exp=3N got=3D` | 3N | 3D | Both describe extras; style choice |
| C16 | `"1N 2C" hcp=10 [4,3,4,2] exp=X got=3N` | X | 3N | Penalty X vs 3NT; both valid |
| C17 | `"1N X XX P" hcp=16 exp=2C got=2D` | 2C | 2D | System on/off after XX; convention-dependent |
| C18 | `"1N P 2C X" hcp=16 [3,2,3,5] exp=XX got=P` | XX | P | System on/off after Stayman double |
| C19 | `"1N P 2C X" hcp=16 [4,2,4,3] exp=2S got=XX` | 2S | XX | Same — partnership choice |
| C20 | `"P 1D P 1S P 1N P" hcp=16 [4,1,4,4] exp=2N got=P` | 2N | P | Opener with 16 after bidding 1NT (12-14 contradiction) |
| C21 | `"P 1S P 2D P" hcp=14 [6,2,1,4] exp=3S got=2S` | 3S | 2S | 14 HCP: borderline for 3S jump rebid |
| C22 | `"P 1D P 1N P" hcp=17 [2,1,6,4] exp=2C got=3D` | 2C | 3D | Show second suit vs jump rebid; both valid |
| C23 | `"1H P 1S P 2D P" hcp=19 [4,2,3,4] exp=4C got=3N` | 4C | 3N | Slam try vs game signoff — style |
| C24 | `"1H P 2N P" hcp=17 [2,6,2,3] exp=3H got=3N` | 3H | 3N | Min rebid vs extras in Jacoby — both per SAYC |
| C25 | `"" hcp=10 [6,0,3,4] exp=1S got=2S` | 1S | 2S | Rule of 20 borderline (10+6+4=20); weak two also valid |
| C26 | `"1N P 4N P" hcp=16 exp=6N got=5N` | 6N | 5N | 16 HCP: judgment call on quantitative 4NT |
| C27 | `"1N P 2H X" hcp=15 exp=P got=2S` | P | 2S | System on/off after transfer double |
| C28 | `"2H X 4H P P" hcp=18 [4,2,6,1] exp=X got=5D` | X | 5D | Penalty X vs 5D — both debatable at 4-level |
| C29 | `"1H P 3H P" hcp=11 [0,5,3,5] exp=4H got=P` | 4H | P | Light opener + void = distributional game? Borderline |
| C30 | `"1D P" hcp=5 [4,4,5,0] exp=2D got=P` | 2D | P | 5 HCP below minimum; void adds value but 6 HCP required |
| C31 | `"1S P" hcp=5 [2,5,3,3] exp=1N got=P` | 1N | P | 5 HCP below 6 HCP response threshold |
| C32 | `"1N P" hcp=7 [3,2,7,1] exp=3N got=3D` | 3N | 3D | 7 HCP + 7 diamonds; game aggressive but possible |
| C33 | `"P P P 1C 1H 1S" hcp=11 [3,3,5,2] exp=2C got=2D` | 2C | 2D | Support partner vs show own suit |
| C34 | `"P P 1S 1N P 2D P 3D P" hcp=9 [3,6,3,1] exp=4H got=P` | 4H | P | Complex auction, 4H aggressive |
| C35 | `"1D 2S P 2N P 3N P" hcp=16 exp=4S got=P` | 4S | P | Preference vs pass 3NT — style |
| C36 | `"P P 1C P 1D P 1H P" hcp=7 [3,2,5,3] exp=1N got=2C` | 1N | 2C | Already counted in A26 |
| C37 | `"P 1D P 1H P 2N P 3D P" hcp=19 exp=3H got=3N` | 3H | 3N | Already counted in A60 |
| C38 | `"1H P" hcp=21 [3,3,3,4] exp=2N got=3N` | 2N | 3N | 2NT Jacoby needs 4 trumps; only 3. Neither bid ideal |
| C39 | `"P 1D 2S 3C P 3D P" hcp=14 exp=5C got=4C` | 5C | 4C | Game vs invite in competition — judgment |
| C40 | `"2S X P 3C P 3H P" hcp=13 exp=5N got=4C` | 5N | 4C | 5NT very aggressive; 4C reasonable |
| C41 | `"1D 1S P 2D P" hcp=11 [5,0,4,4] exp=3S got=2S` | 3S | 2S | Invite vs minimum — borderline |
| C42 | `"1D 2S P 2N P 3H P" hcp=16 [2,3,3,5] exp=4S got=4H` | 4S | 4H | Complex competitive — unclear which major |
| C43 | `"2N 3C" hcp=5 [5,4,3,1] exp=X got=3H` | X | 3H | Stayman X vs transfer; both possible over interference |
| C44 | `"1N P" hcp=8 [3,2,3,5] exp=2N got=P` | 2N | P | 8 HCP: borderline invite vs pass |
| C45 | `"P 1C P 1D X" hcp=14 [4,4,1,4] exp=P got=1H` | P | 1H | After opponent's X, both P and 1H defensible |

**Total Group C: 45 cases**

---

## Grand Total

| Group | Count | Action |
|-------|-------|--------|
| **A** (our bug) | ~70 | Fix the rule engine |
| **B** (bad test) | 11 | Remove expected bid |
| **C** (convention variant) | ~45 | Could go either way; low priority |
| **Total** | 126 | |

---

## Top Priority Engine Fixes (Group A themes)

1. **Responder passing with enough HCP** — threshold too conservative (cases A1-A5, A36)
2. **Jump shifts for 19+ HCP** — not implemented (A13, A112, A113)
3. **Limit raise requires 4+ trumps** — engine gives 3M with 3 trumps (A27)
4. **Jacoby 2NT shortness-showing rebids** — not implemented (A86)
5. **Opener must bid game with 18+ over single raise** — trial bid instead of game (A43, A44, A95, A97)
6. **Opener must pass minimum over limit raise** — bidding game with 13 (A61, A62)
7. **Blackwood step responses wrong** — 5S=3 aces (A80)
8. **Post-transfer rebid handling** — wrong bids after Jacoby transfer (A39, A40)
9. **Feature showing over 2NT ask** — not implemented (A45, A46)
10. **Unusual 2NT and Michaels handling** — not implemented (A51-A54)
11. **Opener rebid after 1NT response with extras** — 4H not 3NT with 20 HCP (A88)
12. **Stayman vs transfer preference** — prefer transfer with 5+ major (A67, A68)
13. **Help-suit game try must be answered** — can't pass 3D trial bid (A105)
14. **Grand Slam Force** — not implemented (A71)
15. **Negative double for unbid majors** — prefer over 1NT with unbalanced shape (A91)

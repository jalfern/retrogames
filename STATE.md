# STATE — session 254 (2026-11-12, slot a)

## What shipped
**VIPER PIT — OUTROUND REPLIES (#2148)** merged as `7c62d22` (PR #2153).
The KO card is now an exchange: per-character taunt-on-win (winner's shout in
their own accent + beckon/flex/point/raise/spit rig poses held through the
freeze), round-end loser sub-lines (own `roundLose` table), call-and-response
reveal (520/700 ms) with a loser-register reply sting, PERFECT/CLUTCH/IN
STYLE judges (HP law; PERFECT > IN STYLE > CLUTCH), match-arc line (WITHOUT
LOSS / ONES THAT MATTERED). All choice pure in `koQuotes(m, ctx)`; engine,
hashes, IRON RING untouched. 31 new viperpitcheck gates: per-pair law tables
in Node, judge ladder incl. chip-erases-PERFECT, arc sweep/comeback, live
cabinet exchange-ordering (`outround()` hook). Proven-fail: stripped-taunt
data mutant, dead-PERFECT-branch module mutant, hand-mutant instant-reveal
killed exactly the ordering gate — restored. Green: 340 ok/1 fail (= #2151,
see below). Prod VERIFIED (chunk index-CVPj9gNf.js carries all lines).
README honest gaps updated (CLOSED marker; portrait polish kept open).

## Open PR — DO NOT LOSE
**#2159** (judge-badge lift over the finisher name; cosmetic follow-up on
#2148, gates green 341/1 + the new lift gate) was blocked from merging by
the #601 freeze: the latest completed nightly failed `full-smoke` at fddf4a2
(the consent-gate boot-red family #2115/#2095 — FIXED since by #2152, which
is in main). A fresh nightly is in progress at d095948 (carries #2152 + Ivy
+ mine); when it goes green, merge #2159 with the rule-5 command from the
`forge/viper-judge` worktree (`~/Dev/retrogames-forge-viper-reply`).

## New issues filed
- **#2151** game-queue: VIPER PIT CPU lost its close-range qcb counter —
  #1735 replaced the `dist < 2.2` branch with projectile-only, so no
  non-projectile qcb ever fires from the CPU and viperpitcheck has been red
  on main since. Fix sketch in the issue (keep both branches; re-pin IRON
  RING sims + hashes). This is the #2151-fail every local viperpitcheck run
  shows — do not chase it as your own regression.
- **#2158** feedback: QA — VIPER PIT polish pass after #2148 (voice-ish
  taunt stings, judge slam-in + crowd flare, pose blending, answer slide,
  portrait polish).

## The session's catches
- **mutateguard fires on plain runs too**: viperpitcheck plants a temp
  mutant module unconditionally (line ~855), so ANY viperpitcheck run
  refuses an uncommitted tree. Commit first, then run (bites even without
  --mutate).
- **prod marker = content string, not bundle grep of the entry** — the game
  code lives in the lazy `index-*.js` chunk; poll entry → chunk → string.
  And jalfern.com 308s to www: `curl -L` is mandatory (repeat lesson,
  STATE 253).
- **Timing gates flake in packs, one per run** (`freeze half-speed` ratio
  0.8 vs the 0.75 bar once, `GUARD hold` sawGuard once; adjacent runs
  green). #2136 family; rerun once, move on.
- Deriving a live gate's expectation from REAL state (judge vs live HP,
  taunt vs `koFx().name`) instead of assuming the demo's roster — removed a
  whole class of seed flakes before they happened.

## Ladder trail
TARGET #2143 REFUSED (slot b held it, checkpoint 13 min old; b shipped it
mid-session as d095948). No halt/steer; jonq empty; `next` #1711 has no
lane-doable work (idling past Jon — last lines are Jon's: relabel run + 3
fresh phone takes). game-queue empty, feedback owned by live QA lane, all
flagship README gaps QA-owned (`flagshipStage` null). Never-dry
`weakestStage`: Papers-Min score 4 but ZERO unowned gaps (all named by live
QA issues) → descend to next-weakest WITH gaps: VIPER PIT (score 4, four
unowned gaps, registry-oldest of the tie) → filed #2148, claimed, shipped.

## Open questions
- none filed.

## Next
- Slot a: merge #2159 when the nightly at d095948 goes green (rule-5 loop).
  Then normal ladder; #2151 is the strongest game-queue item (real CPU
  mechanic restoration + the only known red-on-main local check).
- #1711 stays `next` — waiting on Jon (commands on the issue).

## Hygiene at exit
Dev server :5173 (mine) STOPPED. Worktree `retrogames-forge-viper-reply`
KEEP (hosts open PR #2159's branch) — remove after it merges. Main checkout
detached at origin/main. STATE committed to main (game merged) + parked
`statepark park a`.

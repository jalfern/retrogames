# STATE — session 227 (2026-11-11, slot b)

## What shipped
**WATCH b28: FIRE CREW seats its certified autopilot** merged as `24b5324` (PR #2025,
`Part of #1637`; issue back to `game-queue` for b29). No new brain — the sim has
always driven `cpu` seats with its own autopilot, the path `firecrewcheck` races
to 6/6 rescues. The seat is therefore the SHEET flip: Y sets `sources[0]='cpu'`,
any driving key/field-tap flips it back and the pressed key lands in `keys1` the
same tick (held key drives at once). Radio stays LIVE seated — shouts steer cpu
seats by design — so WATCH here is co-driver mode. Human spray mirror gated
seated (`!watchingRef.current && h.a`); watch never lingers (startPlay rebuilds
human, finish releases silent). Attract hint + pill on the SELECT screen only
(attract SPACE opens the picker, select SPACE sends the engine). firecrewcheck
+4 seat rules (cpu drives / human idles an empty pad, byte-equal 24 seeds,
rescue floor >=18/24 honest share); can-fail proven LIVE: wrong-way flip
reddened the SHEET check + source pin (281/283), restored byte-exact from git.
watchcheck fire-crew pilot 283/283 on Chrome :5178 (two fix rounds, both
root-caused locally before pushing: watchpillcheck safe-area wrapper, then
attractcheck paragraph law), contractcheck 724/724,
watchphonecheck 475/475, watchpillcheck 220/220, watchsoak 68/68, vpadcheck +
lint gates + eslint + build green. Static round 1 died honestly on two real
sins: the pill wrapper was Tailwind-anchored (the #1653 law demands inline
calc + --sat/--sar insets — fixed by mirroring DK's compliant wrapper), and
the select-screen attract pill tripped watchphonecheck's attract-scope checks —
FireCrew joins SKIP_ATTRACT (BombDefuse/GravelYard precedent: picker boot path,
attract already self-drives the CPU crew).
**Earlier this shift** the same slot resumed b27 (DonkeyKong) after slot-a died:
rebased onto main, verified kongcheck 51+17 mutants / pilot 271/271, and landed
the nightlybot soak-roster entry for donkeykong — the #1525 drift that reddened
main (PR #2015 squash carries it; `7d17133`).

## The session's catches
- **A live session reads as dead if its comments aren't checkpoints.** My
  15:27/15:36 "resumed/verified" prose didn't match forge-claim's
  `claimed|checkpoint` regex; the warden's idle-flag kicked a parallel slot-b
  session at 15:43 which steamrollered my merge wait (reclaimed :5178,
  checked my worktree out mid-suite — the 45-FAIL watchcheck run was pure
  cross-talk; the same suite on stable tip was 806/806). During long
  verification, post `FORGE (<slot>): checkpoint <ts>` lines, not prose.
- **main-ok's newest-completed rule lets a fresh `cancelled` mask a `failure`.**
  Both nightlies that could prove green were running when #2015 merged; the
  script answered "main ok: nightly cancelled". Per script-law, but the hole
  is posted on #601 with the two run ids.
- **GitHub secondary rate limit** (~16:18Z) ate a smoke rerun + comments while
  three lanes + watchers hammered the API. Batch API work; do build work
  offline while it cools.
- **Watch-chrome laws are source-parsed, not just visual.** A pill that LOOKS
  right fails static unless its wrapper carries `style={{ top: 'calc(Nrem +
  var(--sat, 0px))', right: ... }}`; a ▶ WATCH button found anywhere in a game's
  JSX must be attract-scoped + bottom:'24%' + z-[70] — picker-boot titles belong
  in SKIP_ATTRACT with a reason, not on a parser accident.
- **Never draft STATE.md at a worktree root before shipping** — `git add -A`
  swept the placeholder draft into the fix commit. Draft in tmp (or write STATE
  only in the main checkout after merge); recovery was amend + force-with-lease.
- **Invented floors bite.** My 24-seed sweep floored wins >=20; the honest
  measured share of the pre-existing autopilot is 18/24. Pin what you measure
  (152/152 with >=18 and the reason in the gate name).

## Ladder trail
TARGET #1637 claimed (slot b, 15:25) → b27 corpse finished + merged by a
parallel slot-b instance (my tip 0e33587 was the resume basis; #2015 -> `7d17133`)
→ b28 claimed on the same issue → built, gated, #2025 merged → #1637 returned
to `game-queue` (open, b29 ready). QA MASTER live all shift (borrow refused);
`next` #1711 stays Jon-side; flagshipStage null; no jonq filed (all
pattern-following; governance finding went to #601 as a comment, not a question).

## Open questions
- none from this lane (see waiting-jon issues; #1711 hardware, #2016 lane:qa).

## Next
- b29 candidates (unseated, registry-derived): pacman, centipede, pitfall,
  missilecommand, kingsquest, viper-pit, britannia, ironkeep, raccoon-heist —
  but the rollout takes only titles with a PROVEN driver: centipede /
  missilecommand have sim.js whole-tick lifts; check each family's harness for
  a winning autopilot before claiming, and keep the honest "no guide yet" where
  none exists. New watch-chrome laws to honor (all learned the hard way in
  b28): pill wrapper = inline calc + --sat/--sar; picker-boot titles go into
  watchphonecheck SKIP_ATTRACT with a reason; attract blocks get ONE raw
  paragraph (hint rides a span) and JSX comments count toward the tally.
- Nightly re-proof at tip: the queued nightly on `4b40fa3` (predates b27/b28)
  does NOT prove the current tip; after b28 the next scheduled nightly (06:15Z)
  will — keep an eye on the soak roster pins (contractGames/nightlybot parity
  is now 48; donkeykong entry landed this shift).
- Dev servers: slot a 5173, slot b 5178 (stopped at exit), QA 5176. `--mutant`
  only in an exclusive window >=20 min; restore from git, never sed (#1525
  lesson again: seat and release lines became textually identical under the
  mutation).

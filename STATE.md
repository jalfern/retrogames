# STATE — session 197 (2026-11-10, slot b)

## What shipped
**TALK ME DOWN CALL-BY-KEY** — squash `8528835` (PR #1898, closes #1894).
X opens a CALL line; letters/digits/SPACE compose; ENTER shouts through
`voiceCall` — the mic's own entry: one grammar, one pulse law, one voiceCmd
bank. While composing the keyboard is a MOUTH, not a hand: arrows and seat-2
keys swallowed (no pad leak), V is a letter ("SEVEN"), typed words never
release the WATCH seat (#1247 by analogy); online the fold laws inside
voiceCall run unchanged. Amber `CALL> cut red_` on the LCD glass; mic-off
footer coaches `KEY_CALL_HINT`; shapes stay ACCEPTED_HINT's alone. Headless CI
gains real-keystroke delivery to pixels AND into the live capture
(voiceCmd replays hash-exact) — no more badge-only proof for the grammar path.

**The batch's real lesson (design bug caught by the harness):** the channel
key C is EATEN by the word CUT — an open-key can never be a letter a call
needs. X now opens (no grammar word uses j/q/x — dial SIX is digits; pinned
over the vocabulary so the choice can't rot). The rename hunt: one drive press
escaped the sed sweep — the KEY-EVENT DUMP (capture listener printing e.code)
named it in one run. Lesson: when a key seems swallowed, dump the event codes
at the window before touching handlers.

Evidence (full battery before merge): bombcheck 71/71 (+16: editor law,
no-fork source pins, footer swap); bombdrive +17 real-keys gates green x2
runs; mutant (commit's voiceCall → plain banner = grammar fork) killed 5 named
gates, inverse-sed restored. tmd-smoke, contractcheck(TMD) 14/14,
tmdlinkcheck 56/56, watchphonecheck 403/403, watchpillcheck 187/187,
lint:mario/fps/ai + eslint + build green. Only reds anywhere: the #1871
seed-7 pair + one watchcheck TMD pin + 8 other-title textfit reds — ALL
reproduced on clean main this session (check main before owning a red!).
Prod verified: entry chunk `index-D_TzJ3RD.js` carries the registry copy.
Live: https://jalfern.com/retrogames/talk-me-down

## Session bookkeeping
- TARGET #1637 REFUSED at claim (slot a live, batch 18 = Space Invaders +
  Defender, claimed 12:14Z). Ladder: no halt/steer; `next` #1711 still
  hardware-gated (Jon's R2 bucket; jonq empty). game-queue empty; QA MASTER
  live (no feedback borrow); flagshipStage null (spent) → never-dry
  weakestStage: TALK ME DOWN score 6 (4 unowned README gaps + feedback
  #1888/#1871 naming it; held: CometDrift, CometDriftHD, MagicCarpet).
  Filed #1894 (POLISH — TALK ME DOWN: typed-call channel), claimed, shipped,
  closed `shipped`. #1900 filed: QA polish pass (type-vs-shout parity, the
  phone-mouth decision, stale-pin cleanup: watchcheck TMD pin regex matches no
  main text; #1871 pair; #1099 textfit family).
- Harness fix carried in the PR: vignette hi/lo luma gates now poll the
  sin(tick/6) phase (the #1305 "one screenshot cannot decide a sine phase"
  law) — my section's phase shift exposed the single-sample weakness.
- No jonq filed (nothing taste/priority/hard-to-undo).

## Next queued (slot b)
1. Fresh ladder: warden TARGET, else halt/steer/next/queue game-first.
   #1637 batch 19 when slot a releases it (56+ seated; batch 18 seats Space
   Invaders + Defender). #1711 hardware-gated — watch for Jon's answer.
2. If the ladder runs dry: fresh weakestStage — TMD now scores lower (gap 0
   rewritten smaller); other candidates: FloorBoss/BombDefuse (score 5 each).
   Never seat a panic bot; un-proven drivers stay honest "no guide yet".
3. QA owns #1871/#1900 items — builders don't pick them up unless steered.

## Notes for the next slot-b session
- Worktree `~/Dev/retrogames-forge-tmd-callkey` detached at `8528835`;
  node_modules symlink intact — `git checkout -B forge/<newslug> origin/main`
  for the next build. Dev server on 5178 runs FROM that worktree (vite) —
  reuse after verifying cwd, kill otherwise. 5179 was a throwaway diagnostic
  server this session — killed.
- TMD gate patterns that worked: relay `lsof -i :8792` before tmdlinkdrive;
  `__game.replay()` LOCKS the clock — any section that starts live after a
  replay must `__game.release()` (start() does not); pixel gates poll while an
  overlay pulses; key-event dumps beat handler archaeology.
- `__tmdTest.callLine()` reports `{open, buf, paused}` — enough to pin
  Escape-close-without-pause honestly.
- Slot a may merge batch 18 soon — rule-5 loop handled main moving mid-merge
  cleanly again (two sessions running: watch #1637 before batching 19).

## Open questions
- None. (No taste/priority call needed from Jon.)

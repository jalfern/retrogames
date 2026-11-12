# STATE — session 242 (2026-11-12, slot b)

## What shipped
**PLAICRAFT: HONEST PHONE TAKES** merged as `87aff97` (PR #2090, Closes #2058 —
the warden-assigned TARGET, claimed first try).
- `audioLonger:false` root cause found statically + reproduced in-harness:
  `voiceCapture.finalize()` stamped track `ms` when `MediaRecorder.stop()` was
  CALLED, but the clock's closing sample is stamped after the flush settles.
  iPhone flush latency (−67…−1638 ms) always exceeds the gap → every phone take
  claimed audio shorter than its own clock. Desktop flushes ~0 ms and mkVoice
  adds +40 slack — why the synth harness never saw it. Fix: stamp `ms` at
  settle, when the bytes in hand cover what the length claims.
- `humanSeats 0` root cause: Gauntlet `seatSources()` hardcodes seat 0
  `model` (true for contract steps, a lie for a thumbs). autoStart now stamps
  seat 0 `human` at origin (beginRun ⇒ human start by construction); Rally
  opts out with `humanSeats:false` — its watch-seat labels are already honest.
- Evidence reports replay and voice SEPARATELY (`replay: X/N` + `voice: V/M`);
  verdict column PASS/VOICE/FAIL; exit codes unchanged (strict).
- Per-track output prints `track … ms vs clock … ms` + NEW container-declared
  duration (pure EBML `Info>Duration` + mp4 `mvhd` parser in voice.js — iOS
  answers mp4 since none of our webm/ogg candidates is supported). Container
  shorter than clock by >150 ms → `audio truncated at stop` — the next phone
  take names tail-drop vs compute-error numerically. `audioLonger` untouched.
- Harness phone mode: 3 synth gauntlet takes (healthy mic-lag/slow-flush/mp4/
  human-seat verifies; tail-dropped CAUGHT; pre-flush-stamp CAUGHT — seed15
  geometry). Hand-mutant (`audioLonger:true`) reddens exactly the phone gates.
  evidence self-test 32/32, voicecheck 49/49 (+mutant), recordcheck 115/115
  (+seat pins incl opt-out), lint gates + build + eslint green.
- Prod verified: `humanSeats` marker live in `index-F9CNnzq2.js`.
- Filed QA polish #2093 (relabel the 3 stored files via store tool, webm
  end-to-end in self-test, clap container print, name the flush-timeout,
  browser-drive flush delay) — all verified against shipped code.

## The session's catches
- **A synth that mimics a symptom must mimic the geometry too.** My first
  phone-shape take went GREEN: clock samples started aligned so the loop hit
  the final tick exactly and `finish()` added no post-flush sample — the
  pre-stop stamp then matched the clock and slipped through. The real mic
  opens between ticks (seed15 o≈98), so the closing sample is finish-added.
  Offsets, not just delays, are the bug shape.
- **Blanket label upgrades need per-game honesty.** Stamping seat 0 `human`
  everywhere would have LIED for Rally's watch seat (local player rides
  passenger while seat 0 is the model driver). One opt-out key, one pin each
  way, found by grepping every beginRun caller before shipping.
- **EBML size vint is an absolute position after decode** — `cStart =
  size.next`, not `id.next + size.next`. The fake-webm pin in voicecheck
  caught what the mp4-only self-test couldn't: pure parsers need BOTH
  containers pinned at unit level, not just end-to-end.

## Ladder trail
TARGET #2058 claimed clean first try (`forge-claim 2058 b`). No halt/steer/
next beyond the target; no building corpses; #2090 merged, #2058 shipped+closed,
#2093 filed for QA. No jonq filed (no taste/priority calls — all four of the
issue's questions answered from code, in the PR body: no 3600-tick recorder
cap exists (58380+~1638 mic-lag = the same 60.000 s run, realtime); seed-59
twice is chance at `%97`; stored files CAN be relabelled human but their
voice needs re-recording — bytes are short, not just the label).

## Open questions
- none (see waiting-jon issues).

## Next
- Slot b next session: QA #2093 items are platform-side; the game-queue had
  #2057 (GAUNTLET iPhone scroll/stick) and #2055/#2054 on the board at start —
  recompute the ladder live, don't copy this line.
- The store still holds 3 broken-voice iPhone takes until someone runs the
  relabel tool (#2093 item 1) — S3 training must NOT consume them.
- Dev servers at exit: slot b 5178 STOPPED (never started this session); slot
  a's ports untouched. Worktrees: this session removes its merged
  `retrogames-forge-phone-takes`; session-235 candidates (ppm-portrait,
  ppm-bulletin, papers-photo) still stand.

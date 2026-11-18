# STATE — session 342 slot a close-out

## Shipped this session
- **PLAICRAFT S1: refuse the realtime-stamp signature — witness-only line-3
  machine evidence + audio-flag honesty — PR #2710 merged `2b916ac`**
  (TARGET #1711 claimed 19:35Z, shipped ~20:23Z; implements the 2026-11-18
  audit item 3 verbatim). `clapPairGate` (pure, `src/utils/clapSync.js`):
  PASS/SKIP/RED for the synth ±50 ms pair gate — a red pair whose
  |offset − take's own drift| ≤ 20 ms (one opus frame) is the
  **realtime-stamp signature** (audio stamped on wall clock instead of the
  frame clock measures offset ≡ drift by construction) and the load-honest
  SKIP REFUSES it — that is the bf1a96e shape (102.8 @ 102, margin 0.8 ms)
  which #2664's band swallowed. Band math hardened to |offset| (the old
  signed form could slip an early −200 ms under drift+tol while promising
  "larger than drift goes RED"). Every non-mutant clap run stamps
  `line-3 machine evidence: YES (--witness) / NO` — a default green can no
  longer be quoted at the acceptance line. Store: `sessionMeta` audio flag =
  `tracks.length > 0`, not voice-section presence (found live: a zero-track
  take listed audio:true — the admin view lied). relaysim executes the same
  core.js → prod+sim fixed once. Gates: recordcheck +12 pins 276/276 (exact
  bf1a96e numbers → RED), relaycheck +2 zero-track pins 101/101; hand-
  mutant (band→0) reds exactly the two signature pins. Relay redeployed
  (deploy-relay success on `2b916ac`); live store 14/14 audio rows carry
  bytes — no row retroactively moves. Store sweep at claim AND close:
  nothing new to grade (no phone takes since 18:10Z).

## The Chrome 157 discovery (#2709 — game-queue, lane:platform, OPEN)
Headless Chrome **157.0.8103.79** on this Mac delivers **zero MediaRecorder
chunks from WebAudio MediaStreamDestination streams** — the synth-mic trick
itself, dead. Probe matrix in the issue: permissions granted, sink attached
(silent AND audible), no-timeslice, auto-mime — all 0 chunks; track `live`,
ctx `running`, no error. `--use-fake-device-for-media-stream` records fine
(40 KB) and `--use-file-for-fake-audio-capture=<baked.wav>` records +
decodes clean (113 KB, 7.0 s @48 kHz) → fix route is probed, migration is
not done. Worked on this box ≤156 as recently as 03:27Z. **Consequences:**
no live --witness or shape run can pass here until #2709 lands (my two
witness attempts this shift died at `v2 file with one voice track` — that
was Chrome, not the gate); claptestplay + voicedrive-shaped suites suspect;
**the nightly's GitHub-runner Chrome must be checked for M157 too** (the
HELD path defers, never launders — verdicts would just stop landing).

## Claims / board
- TARGET #1711 claimed (script, first try), released to `next` at close —
  S1 lines 1/2/4 hold; line 3 open, hardware-gated twice: Jon's phone take
  (jonq #2652 AWAITING, deadline Nov 20 01:36Z, default keeps waiting)
  AND this Mac's witness runs (#2709). Big-build rule: stage stays open —
  normal state.
- New candidate for the ladder: **#2709** (game-queue). Take it next slot.

## Next queued
- Re-derive at main: `node scripts/idle-kick.mjs` (NEVER trust this line).
  Expected strongest: #2709 (platform, evidence-backed, fix route proven).

## Open questions (issues, not here — #605)
- #2652 (jonq, platform, AWAITING by Jon, deadline Nov 20 01:36Z) — phone
  clap take vs waiver for #1711 line 3; default keeps waiting.

## Catches for the next session (each cost probes this shift)
- **WebAudio synth-mic ≠ stream audio on Chrome 157 headless** — if a voice
  suite suddenly ends with `tracks: []`, don't debug the game: run the
  micprobe battery (shape table in #2709) and migrate to fake-file capture.
- **`about:blank` is not a secure context** — `navigator.mediaDevices` is
  undefined there; probe gUM tricks against a localhost page.
- **Audio flag ≠ voice section** — relay/core.js `sessionMeta` now demands
  track bytes; anything composing fake v2 takes in tests must carry ≥1
  track to list audio:true.
- **clap gate lives in clapSync now** — `clapPairGate({ok,worstMs,driftMs,
  witness})`; don't re-inline skip logic in clap.mjs; recordcheck pins it.
- **relaysim runs the REAL worker.js+core.js** — worker-side fixes need one
  edit in relay/core.js, pin via relaycheck; no mirror drift possible.

## RULE 4
#2710 is platform code (src/utils + relay + scripts), not src/games/** — the
last two game-code merges were #2703/#2699 (rule-4 clock clean at 0 dry PRs
in a row); #2709 next is also platform — if the following session ships no
game code either, weigh rule 4 before a third.

## Lanes clean
- Main checkout detached at origin/main (`2b916ac`); my :5173 dev server
  stopped at close; other lanes' ports untouched.
- Worktree `retrogames-forge-plaicraft-witness` removed after merge + prune.

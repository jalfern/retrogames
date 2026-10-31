# STATE — session 57 (2026-10-30)

## Shipped this session
**VOICE CAPTURE in recordings** — Jon's `next` issue #1247, shipped via PR
#1256 (squash to main): `retrogames-rec/v1` → **v2**.

- Raw per-player opus tracks (`voice.tracks[]`: slots, consent, headset, mime,
  ms, clock, b64) aligned to the tick clock (`clock[{t,ms}]` ~1/s,
  `tickToMs` interp, `voiceDrift` worst-lag; 30-min throttled profile proven
  in Node). Consent overlay BEFORE `getUserMedia`, saved in the file; no
  consent = no audio; headset suggested. `navigator.userActivation` keeps
  scripted harness captures plain-v1/prompt-free.
- **Remote seats**: guest mic streams to host over the relay's already-forwarded
  `pad` type as `k:'v'` subkind (~6 msg/s vs 240/s window, 512B budget pinned
  by test) — zero relay changes. Host inbox merges guest tracks into its file.
  Guest mic released on race end / peer-gone / unmount.
- Every contract game gets local voice free (`__game.recordStart/Stop`).
- En-route fix: Gauntlet never banked live-loop ticks (#527 retro-gap) — now
  at the `doSim` funnel, loop-lock-guarded.
- Harness: `npm run voicecheck` 40 gates (`--mutate` red), advisory
  `npm run voicedrive` 11/11 headless (macOS TCC kills headless hardware
  mics → WebAudio synth source; `VOICEDRIVE_HW=1` forces device path).
- QA polish pass filed: #1257 (mic indicators, consent feedback, VU, device
  pick, online 2-page drive, file size, link-pad mics).

## Next goal
Ladder empty again after this claim (no `steer`/`next`/`game-queue`).
#1141 stage 4 is the known next real build — #1241 closed before this session;
check its close reason next session: if DEFAULTED (GitHub-only meshes), stage 4
may claim per session 56's carry-over logic. Otherwise wait on Jon (#1229).

## Harness
voicecheck + voicedrive added (one check + one driver, per rule 6).
`harness.mjs.launch` gained `extraArgs` (additive). Latest nightly on main:
**success** (`main-ok.sh` green pre-merge; the >120s linger noted in session
56 reproduced — verdict prints, harmless).

## Environment notes
- Main checkout: detached at origin/main; this lane worked in
  `~/Dev/retrogames-forge-voice-capture` (forge/voice-capture → deleted on
  merge). Dev server 5177 (5173/5174/5175 owned elsewhere) — left running,
  harmless; logs /tmp/forge/vite-5177.log.
- STATE.md ships via its own PR (session-49 pattern) since a game merged.

## Open questions for Jon
- #1229 — Runway digest mail wrapper location (carried; AWAITING, deadline
  Oct 31 — defaults to stdout-producer-only if no answer).
No new questions filed (nothing taste/priority-shaped came up — the issue
body decided the hard calls).

## Carry-over
- #1141 stage 4 — check #1241's close reason, then claim per session 56 logic.
- #1257 QA polish (voice) belongs to the QA lane.
- When Jon labels a queue item, the ladder resumes normally.

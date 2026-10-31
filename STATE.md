# STATE — session 60 (2026-10-30, slot b)

## Shipped this session
**GAUNTLET speaks — #1249 voiced co-op merged** — `981d2ba` (PR #1284), prod
verified (`assets/index-Djz9wMLv.js` carries `V SUMMONS THE VOICE`; live at
`/retrogames/gauntlet`).

- A human shouts, the CPU seat obeys: **"take the upper right" / "grab the
  key" / "follow me" / "hold here"**. Mic → `speechListen.js` (Web Speech,
  continuous + auto-restart) → `Gauntlet/voicecalls.js` (pure grammar, null
  when unsure) → `applyCall` freezes the goal cell → `partnerPad(gs, prevA,
  cmd)` steers. **The seat still emits only pads** — the sim never learns a
  voice exists; a trained model drops into the same intent→pad seat later.
- Look & feel: heard-call banner (`"GRAB THE KEY" -> THE KEY`, green obeyed /
  red refused + why), blinking VOICE dot, `MIC ON · <order>` pill, synth
  obey/refuse blips. V toggles (consent = the #1247 ask, never auto-fired);
  CPU seat only, solo halls only; attract line + registry controls added.
- Recording: additive `voiceCmd: [{t, said, intent, ok, dir?, why?}]` in the
  rec file (metadata like `ping` — v1 stays valid, replay ignores it; what
  the seat DID is `slots[1].pads` on the same clock). **Stamps on the
  recorder's clock** — the live drive caught game-tick stamps pointing past
  a mid-run capture.
- Harness: `voicecmdcheck` 59 gates (grammar, obey in all four quadrants +
  key-walk, hold-zero-movement, pad-law, determinism, format round-trip, and
  the PROVEN QUEST WON with 20 calls issued); mutant (deaf seat) dies ×10,
  exit 1. `voicecoopdrive` 13/13 headless: consent click, real V key, seat
  walks 18 cells under one order, nonsense refused, recorded file replays
  hash-exact. Two real bugs caught by driving for real (stamp clock, and
  contract-step capture losing the CPU seat's consumed pads — capture a
  cpu-partner run through the game's OWN loop, seeded).
- #1249 closed shipped; polish pass filed as **#1287** (phone tap-to-talk V,
  first-run phrase-hint card, banner juice + VU, goto auto-release on hero
  arrival, `attack that guy` intent, link-pad phone voice over the relay).

## Next goal
Game queue (oldest first per the ladder): **#1252 BOMB DEFUSE, #1253 GRAVEL
YARD, #1254 FIRE CREW, #1259 forge-watch hardening**. #1141 is platform-lane,
not a builder candidate. Rule-4 watch: reset — game code merged this session.

## Harness
- `voicecmdcheck`/`voicecoopdrive` join the voice pair (voicecheck/voicedrive).
- Lesson pinned in README + drive comments: **recording for replay must start
  at a seeded reset and run through the loop-owned capture** — the contract
  step banks only the pads you pass it, and a seat the game fills itself
  (cpu) has its consumed pads banked solely by `doSim`'s live feed.

## Environment notes
- Slot b worked in `~/Dev/retrogames-forge-gauntlet-voice-coop` (branch merged,
  worktree now detached at origin/main). Port 5178,
  `npm run dev -- --port 5178 --strictPort`; dev server stopped at session end.
- Headless Chrome HAS `webkitSpeechRecognition` but no speech SERVICE —
  `voiceMode().supported` can be true with nothing recognizing; everything
  downstream of the words is CI-proved via `__gauntletTest.voiceCall()`.
- jalfern.com apex 301s to www — poll prod with `curl -L` (reconfirmed);
  lazy chunks are named `index-<hash>.js`, find the game's chunk by scanning
  the strings inside.

## Open questions for Jon
- none open from this session (#737 still sits waiting-jon from earlier lanes).

## Carry-over
- #1287 QA polish pass on GAUNTLET voiced co-op (feedback — QA lane's job).
- #1141 stage 4 (platform lane), #1266/#1275 QA follow-ups, 48 h trial verdict
  (~Nov 1) posts on #1258.

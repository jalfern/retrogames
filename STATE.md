# STATE — session 306 (2026-11-16, slot b)

## Playable now / what shipped
- **VIPER PIT net-select gate LIVE (#2476 → PR #2479, merge `a9ee5cc`).**
  Vercel Production @ merge sha; jalfern.com proxy flips the new chunk
  `index-B74N_XkN.js` within its ~30-min cache. The challenger's pick can no
  longer be dropped, overwritten, or lost to a reconnect:
  - `netselect.js` (new pure state machine, IronRing #1761 law ported): host
    FIGHT before the pick **defers** (select line `AWAITING CHALLENGER'S
    PICK…`); the late pick fires the launch with the guest's REAL choice;
    pre-pick immediate; no relaunch after launch; leave/join `reset()`
    (no ghost waits); entering select re-arms for rematches. Host stays sole
    launch authority (#531); offline ladder + local 2P byte-identical.
  - **THE relay never forwarded 'pick'** — `relay/core.js` FORWARD_TYPES
    silently dropped every challenger pick in production, any order (a live
    drive found what the code-reading gap note missed). Allowlisted + pinned
    both ways; also un-blocks IRON RING's #1761 wire.
  - Cleanup called nonexistent `net.lobby.destroy` → StrictMode first-mount
    socket leaked, held seat 1, live join refused `room full` forever. Now
    `net.room.reset()` (BlobBattle pattern).
  - Guest **re-declares its pick on re-seat** — reconnects used to lose the
    choice into the dead socket.
- Same shift, other lanes: MISSILE BATTLE 2P #2473 shipped on slot a
  (`e5fff02`); QA shipped EXCITEBIKE #2460 (`87bc385`).

## Gates
- viperpitcheck **441/441** (+9 part A2 pins incl. relay-forwards-pick,
  unknown-type-dies) + mutants **290/290** (named `gateOn`: gate→placeholder,
  deferral pins go red). vipernet NEW **13/13** live: two headless Chromes over
  the local relay twin — RACE / PRE-PICK / GHOST, wire-level socket log, zero
  page errors. contract 14/14. eslint + lint:viper + mario/fps/ai + ciscope
  selftest + build green.

## BOARD at exit
- game-queue / next / steer / waiting-jon: empty. building: #1711 (platform).
- building-qa: #2474, #2449, **#2478** (IRON RING lobby.destroy leak —
  filed by this session, QA already picked it up). feedback: #2482 (VIPER PIT
  polish pass, this session), #2483 (MISSILE polish, slot a's 8b).

## Next (slot a or b, in order)
1. Refresh the ladder; empty → flagship stage → weakestStage
   (`scripts/lib/idle.mjs`). Disclaimers/decideds are NOT work — skip with the
   reason, don't build them (GardenGuard's two score bullets, TenDeep #0,
   Dogfight's no-blind-tune note, LodeRunnerLite's slack-proven bullet).
   TidyBot's loop-the-wash-hum + attract-loop-2+ and SmashTV's spawn-invuln
   vs arcade are genuinely-open score-1 gaps if the ladder lands there.
2. #1711 acceptance stays with Jon (phone take on the store;
   `DEV_PORT=<own> npm run plaicraft:grade`).

## The session's catches
- **A wire type the relay doesn't forward is a bug no unit test can see.**
  `'pick'` joined FORWARD_TYPES because a browser drive asserted the GAME
  outcome (both boxes agree on the fighter), not the packet. New wire types:
  allowlist + a Node pin (part A2 pattern) IN THE SAME PR.
- **Drives must wait for the roster, not the UI.** `screen`/`code` read fine
  while the socket was `reconnecting`; newPair now requires both boxes'
  seats.length===2 + rphase waiting. Symptom of not doing it: gates that fail
  only in scenario order, never in a hand-written dbg.
- **Cargo-cult teardowns rot silently.** `net.lobby.destroy` never existed in
  lobby.js; two games called it (Viper fixed, IronRing filed #2478). Six games
  use `room.reset()` — that's the pattern with a body.
- **StrictMode ghosts race their own close.** mount2's join hits `room full`
  because mount1's Close frame is still in flight; the retry ladder recovers,
  so the game must make late seating harmless (re-declare the pick) instead of
  hoping joins are clean.
- mutateguard did its job again: mutant run refused the dirty tree → commit
  first, then run; the freeze is the feature.

## Hygiene at exit
- Dev server 5178 stopped (own pid only); foreign ports untouched.
- Worktree retrogames-forge-viper-netselect removed; dbg script deleted, never
  committed. Main checkout detached at origin/main.
- STATE.md committed to main (game code merged this session) + parked slot b.

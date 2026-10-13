# STATE — forge session 2026-10-13

## Shipped this session
- **ZELDA `/zelda` (issue #177) MERGED** (PR #193, squash, CI green incl. new `lint:zelda` +
  `zeldacheck` 29 checks). 3x3 overworld, sword cave, bomb shop with earned rupees on fixed
  NES drop tables, cracked wall → SECRET CAVE, three-hall Level-1, push-block + switch,
  Aquamentus, Triforce win. World-as-data + pure sim + transit autopilot + NES-styled canvas
  (256x240, HUD, minimap, wipe bars, VirtualControls A=sword B=bomb). Determinism asserted
  (hash-for-hash plan replay in CI). No Math.random anywhere.

## Known gap (honest, on the PR)
- The autopilot proves sword→rupees→shop→bomb→crack and then DIES in West Forest ('0,1')
  under the respawned octorok volley before the dungeon. So the attract screen is a title
  card, not a proven-run replay. Every segment of the Triforce route except that one screen
  is wired and audited. The fix is combat spacing on '0,1' (a shield-block assist or a
  corridor-vs-volley policy), not new systems.

## Notes for the next session (pick ONE)
1. Finish the win: teach the autopilot West Forest (fight the orbiting octorok off the
   corridor, or block aimed rocks by facing at the volley beat), get `plan()` → 'win', and
   only THEN make the attract demo replay that proven run tick-for-tick (the repo law).
2. zeldacheck could then assert: win result + slack win + a "crack-needs-bombs" mutant that
   must die (e.g. make 'T' non-crackable → the audit must catch the route break).
3. If not #1: pull a fresh issue from the queue.

## Harness commands
- `npm run zeldacheck` — Node audit (~1s), in the static CI gate.
- `npm run lint:zelda` — scoped lint (green).
- Browser hooks: `window.__zeldaTest.game()`, `.press('KeyZ')` etc. (dev only).

## Session limits hit
- ~3h cap reached on the #177 session; stopping per FORGE rule 7.
- Questions for Jon:
  1. Is the attract-on-title-screen acceptable for one deploy, or should /zelda stay
     hidden (menu flag) until the autopilot wins?
  2. Heart-drop economy is generous (every octorok/blueoc/keese drops a heart) — keep for
     playability or revert to rarer NES-true drops and teach the bot to dodge instead?
  3. Enemy damage: rocks graze (1 half-heart) but moblin spears hurt full — okay?

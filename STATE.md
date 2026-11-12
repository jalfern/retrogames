# STATE — session 253 (2026-11-12, slot a)

## What shipped
**PLAICRAFT S1 TAIL — RELABEL WRITE ROUTE + iPHONE FLUSH DRIVE** merged as
`4a07a5e` (PR #2142, Closes #2093). `PATCH /sessions/<key>` on the worker
rides the read lockdown (same constant-time JON_KEY door): the store's ONE
permitted write-after-upload repairs seat provenance model→human — operation
FIXED in `core.applySessionRelabel` (bare `{seat}` SHAPE fail-closed, reverse
refused, modelId dropped, bytes outside the seat byte-identical, metadata
survives). Tool: `JON_KEY=… npm run sessions -- relabel <key>…`. Prod
VERIFIED live: PATCH without key → 401 `unauthorized` (route deployed, door
armed); deploy-relay run green; Vercel green. **Jon can now fix the three
stored iPhone takes with the one command in relay/README.** #2093 fully
shipped (items 2–4 were #2138). Item 5: voicedrive gained a phone-shape page
— real MediaRecorder behind a ~500 ms post-stop event fence; the discriminating
law (stored b64 contains the fenced bytes ⇒ #2058 settle-stamp must reach the
byte-arrival floor from mic-open) lands exactly (2252 vs 2252) and a stop-click
stamp misses by ~650 ms. relaycheck 75/75 (--mutate-readlock kills exactly the
8 security gates; --mutate keeps its 5); hand-mutants: core one-way-guard strip
→ 4 integrity gates red; `settle();rec.stop()` → voicedrive kills exactly the
settle law. Both restored. recordcheck 123/123, voicedrive 25/25, lints+build
green.

## The session's catches
- **Tree-shaking deletes admin clients from the site bundle.** Rollup drops
  `listSessions`/`relabelSession` (Node-tool-only exports) from every chunk —
  `x-session-key` appears in NO prod JS. For worker-route work the honest prod
  marker is the WORKER's new answer (401 vs old 400), not a bundle grep.
  Beware decoys: the only 'PATCH' hits in chunks were the Forge board's
  build-floor COMMENT text — data, not code.
- **A law can be trivially true and still be the wrong probe.**
  `clock.finish()` stamps the trace end at settle, so `ms >= clockEnd` holds by
  construction even pre-#2058. Discriminate against a quantity the fix can't
  move: absolute byte-arrival time from mic-open.
- **Mutant order = mutant grading.** My first draft probed no-key PATCH before
  the feature round-trip; under --mutate-readlock the unlocking write LANDED
  (right signal) and cascaded confusing 422s through the feature gates. Now
  security probes get a fresh take — red gates name only the stripped door.
- **Fresh worktree = no node_modules.** `npm ci` before vite/eslint (npm ≥ 11,
  js-dos peer). mutateguard refused recordcheck on the dirty tree — commit
  first, then run; it works exactly as #2047 intended.

## Ladder trail
TARGET #1711 answered "already yours: resume it" (slot-a claim still live).
No halt/steer/building corpse; jonq empty. Slot b shipped #2080 mid-session
(rule-4 game-code streak fine).

## Open questions
- none filed (Jon's 3 fresh phone takes + the relabel run with the real secret
  are both requested on #1711 with exact commands).

## Next
- `next` stays on #1711. Lane-doable remainder: none left in-house — the
  stage's last lines are Jon's: run the relabel command, play 3 fresh takes
  (one clapping), then `plaicraft:clap` grades the clap take ±50 ms. QA board:
  #2135, #2136 (±50 proof under load), #2137 (outbox scenario C).
- If #1711 idles past Jon: normal ladder; builders-the-reverse applies.

## Hygiene at exit
Dev server :5173 (mine) stopped. Worktree `retrogames-forge-plaicraft-s1-tail`
removed after merge, registrations pruned. Main checkout detached at
origin/main. STATE committed to main (this session's target merged) and parked
via statepark park a.

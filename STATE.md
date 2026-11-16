# STATE — session 301 (2026-11-15, slot a)

## Playable now / what shipped
- **BOULDER DASH: the butterfly drift (#2453 → PR #2456, merge `d29a2d0`).**
  Live at jalfern.com/retrogames/boulder-dash — **GOSSAMER HOLLOW** is cave 8
  (marker verified in served chunk `index-Cu3s1i0p.js`, prod deploy 06:25Z).
  Never-dry pick (`weakestStage` score 4 — the README gap "the corridor patrol
  is a fixed shuttle … never weaves into the cavern proper the way an original
  butterfly could"). New critter kind: `meta.butterflies` = the fly automaton
  with `drift:1, digs:0, ignites:0` — it FLAPS (deterministic hash-of-moment
  90° turns, right-first, only with open ground ahead and only onto open
  ground), but neither bores dust nor ignites — the originals' two critters
  (firefly/butterfly) finally separated. **Corridor-invariance by law**: in a
  lined tube every flap candidate is wall, so drift can never perturb a
  predictable patrol (600-tick pin) — fairness preserved, weaving freed.
  Hash: `flyExt` gates flap state (amoExt pattern) — caves 1–7 byte-identical,
  opt-in-only pinned. Hollow: steel-ringed roof gallery + pillars the butterfly
  sweeps; steel-lined tube col 27 to the dig lanes; harvest row 18 provably
  cool (butterfly lights nothing); a dawdling digger gets eaten (replay-pinned).
  Side fix: fly catches player now kills with cause `fly` ("COOKED") not `fire`.
- Gates: **dashcheck 184/184** + **198 mutants** (new `flyDrift` caught) +
  **dashplay 49/49** (GOSSAMER HOLLOW live: flaps=100, tube dip, sealed-lane
  law, real-key win, restart, zero page errors) + **watchcheck boulder-dash
  320/320** + lint:mario/fps/ai + build + eslint (5 files).
- DEV probe: `__dashTest.probe()` now reports `flaps` + `butterfly`.

## Board at exit
- building (lane:games): check `gh` — #1711 (PLAICRAFT S1) held by slot b since
  04:49Z (my claim on it was REFUSED by liveness — correct behavior).
  #2453 shipped+closed. game-queue / next / steer / waiting-jon: empty at claim time.
- building-qa held: #2430, #2354(was closed by QA), #2434, and QA opened #2449/#2447
  during the window (QA lane is feeding itself). #2438 (BD polish) now ALSO owns the
  drift tells/audio/telegraph backlog (I extended it — see its last comment).

## Next (slot a or b, in order)
1. Refresh the ladder. `weakestStage` will now return BOULDER DASH only until
   #2438 is claimed (it's the polish owner). Its remaining BD README gaps are
   disclosures + the NEW gem-carrying butterfly gap (a real stage — a player
   feature; pickable once #2438's owner finishes tells).
2. Clean gameplay runners-up: LodeRunnerLite vault-3 one-fewer-life slack;
   WWI Dogfight "Circus winnable at hp 1"; SmashTV spawn-invulnerability vs
   the arcade's none (fidelity removal, small); IronRing air-escape throws.
3. A new flagship honest-gaps note: SSX/Emberwood/CometDriftHD/Myst have ZERO
   open gaps — consider whether that's true or README hygiene hid them (#2391).

## The session's catches
- **`meta`-level opt-ins must set every derived flag in BOTH declaration paths.**
  My first `flyExt` looked for `drift` on the raw `level.flies` entries —
  butterflies declare no `drift` (the mapping adds it), so the hash silently
  ignored flaps. Any new level-list sugar must re-audit every `level.X` scan.
- **Harness tests build games by hand** (`g.flies = [{…}]` straight in
  dashcheck). Engine changes must treat MISSING per-entity flags as the
  historical default (explicit 0 disables) or the first test that bypasses
  `makeGame` goes red for the wrong reason.
- **"Fire spreads to DIAMOND/BOULDER" is the sim law** — any "harvest is safe"
  design must argue from ignition sources and steel caps, not from gems being
  inert. It reshaped GOSSAMER HOLLOW from fire-drama to critter-drama (which is
  what the originals' butterfly cave is anyway).
- jalfern.com serves a 308 without trailing-slash semantics — prod-marker scans
  need `curl -L` on the entry AND on the lazy chunks (the entry is one hash;
  the game lives in ~51 referenced chunks).

## Hygiene at exit
- Dev server 5173 stopped (own pid only); foreign ports untouched.
- Worktree retrogames-forge-bd-drift removed after merge; main detached at
  origin/main. #2453 commented + shipped + closed; #2438 extended.
- STATE.md committed to main (game merged this session) + parked slot a.

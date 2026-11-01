# TALK ME DOWN — split-info bomb defuse (#1252)

ONE SEES THE BOMB, THE OTHER HOLDS THE MANUAL. An original co-op puzzle:
seat 1 (DEFUSER) owns the panel and the verbs but no rules; seat 2 (MANUAL)
owns the typewritten rulebook but no hands. Between two humans there is only
the couch — or the mic.

## Engine notes

- `engine.js` is pure (Node + browser). All sim randomness is `mulberry32`
  off the seed (#494 determinism law): seed + per-seat pad streams ⇒
  identical hashes. `Math.random()` lives only in the shell (sparks, shake).
- **Modules** carry a stamp that indexes the printed rulebook:
  - `NEON (N1..N6)` — cut exactly ONE colored wire.
  - `DIAL (D1..D4)` — turn the 0-9 dial, then press SET.
  - `GLYPH (G1..G4)` — press three symbols in order.
  Every rule is a pure function of features the defuser can see and read
  aloud: serial last digit, LED count (0-8), bolt color, wire colors + lit
  states, sibling-module wire counts. `RULEBOOK[type].find(r => r.id ===
  stamp)` is the single source shared by the printed page, the CPU partner
  and the solver — text and truth can never drift (bombcheck pins both).
- **Solvability by construction**: the generator re-rolls module features
  until `computeTarget` resolves, so a printed precondition (e.g. N2's "the
  ONE lit wire") always holds on a live bomb.
- **Strikes**: a wrong verb locks the module 3 s (`LOCK_TICKS`), burns
  `STRIKE_FUSE_COST` ticks off the fuse and trips a breaker; three breakers
  or a zero fuse ends the run. Locked modules refuse every verb (no strike
  farming while the current one is hot).
- **Rounds**: `moduleCountFor(r) = min(1 + r>>1, 4)`,
  `fuseFor(r) = max(30, 70 - 5r)` seconds; rule variants unlock by round
  (`variantPool`) — round 1 knows N1/N2/D1/D2/G1/G3 only.
  `QUOTA_BOMBS = 5` clears the SQUAD CHIEF stamp.
- **Seats (#494)**: seat 1 = defuser (pads: up/down pick the module,
  left/right the wire/dial/glyph, A the verb). Seat 2 = manual when
  `players = 2` (left/right page, up/down line, A flags a rule — the
  defuser's panel shows `READ <stamp>`). Solo (`players = 1`) a CPU partner
  holds the manual and prints orders on the LCD rail (90-tick think delay);
  a human seat 2 silences it — the point is that humans talk, CPUs don't
  need to.
- **Voice (#1247)**: `voice.js` is the pure grammar (transcript -> intent or
  null). V toggles the mic (`speechListen`). A heard call **pulses the target
  on the panel** (wire/dial/glyph green frame) or refuses with a why
  (`NO BLUE WIRE`, `NO DIAL HERE`, `MODULE LOCKED`, `ALREADY SAFE`) — the
  shout becomes visible without the seat ever touching the pad law. Headless
  Chrome has no speech service, so everything downstream of the words is
  proved via `__tmdTest.call(phrase)`.

## Input map

| input | seat 1 (defuser) | seat 2 (manual, 2P keyboard) |
|---|---|---|
| arrows / d-pad | module + wire/dial/glyph | page + rule line |
| SPACE / A | cut / SET / press glyph | flag rule (READ N3 on panel) |
| B / PAGE | hide-show manual rail (solo) | — |
| V | mic on/off | |
| Tab | flip manual view (solo) | |
| Esc / `?` | pause (PauseOverlay) | |

## Verify

```bash
npm run bombcheck   # 28 gates: legal+solvable gen (300 seeds), rules-as-printed
                    # (200 seeds), determinism, strikes/lock/fuse-cut, both loss
                    # paths, quota win 50/50, slack (wins at 75% fuse), grammar
npm run bombdrive   # real-key browser drive: attract->select->play, drawn pixels
                    # follow the sim, real strike (+ #1305 pixel gates: strike edge-
                    # flinch, sub-10s fuse-bezel throb), mic obey/refuse, contract
                    # hash determinism, death->restart, pause; zero page errors
CONTRACT_ONLY=talk-me-down npm run contractcheck
node scripts/tmd-smoke.mjs   # quick sim-only smoke
```

Mutant proof (step 5): commenting `gs.fuse -= 1` in `step()` goes red twice
(expiry gate + fuse-cost gate); restore returns green.

## Honest gaps

- #1373 (polish pass) wired the tap-to-talk pill, the BOMB INBOUND curtain,
  the vignette, paperclip + mic-hint page, seat-2 key drive — and fixed the
  tap latch: it now guarantees one engine tick instead of ~6 (a quick tap used
  to wrap cyclic cursors a multiple of 3 — the page flip was a no-op).
  `voiceCmd` in recordings remains open below.
- 2P requires a shared keyboard (seat 2 = WASD + F); no online lobby yet —
  `#494` remote seats are reserved plumbing like SOS (#1248).
- Headless CI can hear nothing (no speech service): mic *delivery* is proved
  by badge state only; the grammar + obey/refuse path is injected.
- `voiceCmd` is not yet written into `retrogames-rec/v1` recordings (Gauntlet's
  #1249 pattern would extend it — polish pass candidate).
- DIAL's "another module has wires" rule (D4) reads the bomb layout; a second
  dial module is intentionally not cross-referenced (first dial wins).
- No bomb-shape variety beyond one panel; deeper rounds could add a second
  panel on the back (that is the fun-kind of stage 2).

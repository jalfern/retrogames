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
  - `DIAL (D1..D5)` — turn the 0-9 dial, then press SET.
  - `GLYPH (G1..G5)` — press three symbols in order.
  Every rule is a pure function of features the defuser can see and read
  aloud: serial last digit, LED count (0-8), bolt color, wire colors + lit
  states, sibling-module wire counts, BACK-panel battery count.
  `RULEBOOK[type].find(r => r.id === stamp)` is the single source shared by
  the printed page, the CPU partner and the solver — text and truth can never
  drift (bombcheck pins both).
- **Back panel (#1797)**: UP at module 1 tilts the bomb onto its maintenance
  back — a riveted plate stamped with 0-2 seeded BATTERIES, the fact D5/G5
  read. DOWN tilts back. While flipped, module verbs refuse SILENTLY (no
  strike — the tilt is free, and punishing curiosity would tax the game's own
  hint); new bombs land face-up; `hash`/`simState` carry the tilt; a heard
  "FLIP IT" pulses the tilt hint — words become visible, hands stay yours
  (#1247 law). The fuse and strike breakers stay drawn on both sides:
  pressure never hides.
- **Solvability by construction**: the generator re-rolls module features
  until `computeTarget` resolves, so a printed precondition (e.g. N2's "the
  ONE lit wire") always holds on a live bomb.
- **Strikes**: a wrong verb locks the module 3 s (`LOCK_TICKS`), burns
  `STRIKE_FUSE_COST` ticks off the fuse and trips a breaker; three breakers
  or a zero fuse ends the run. Locked modules refuse every verb (no strike
  farming while the current one is hot).
- **Rounds**: `moduleCountFor(r) = min(1 + r>>1, 4)`,
  `fuseFor(r) = max(30, 70 - 5r)` seconds; rule variants unlock `1 + round`
  deep (`variantPool`) — round 1 is EXACTLY N1/N2/D1/D2/G1/G3, and every
  stamp is live inside the quota: D5 rides from round 3 and G5 from round 4
  (the module-seat law), and N6 — dead under the old `2+ceil(r/2)` slope,
  which needed round 8 while the quota ends at 5 — rides round 5.
  `QUOTA_BOMBS = 5` clears the SQUAD CHIEF stamp.
- **D4 is anchored (#1708)**: its cross-reference is the LAYOUT — the first
  NEON sibling's wire count, solved or not (the wires stay on the panel after
  the cut), else LEDs+3 units. The target is therefore static for the bomb's
  whole life: cut the sibling first and the number the page printed still
  solves. The old `!x.solved` guard flipped the engine under the manual
  (measured 423/489 round-3 D4 bombs) — a split-info lie the game's
  text==truth invariant forbids; bombing a seat for obeying the page was the
  symptom. bombcheck section 13 pins the anchor (606 bombs across rounds
  3+5, 300 human rigs, source pin).
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
| ↑ at module 1 / ↓ on the back | tilt the bomb over / tilt back (#1797) | — |
| SPACE / A | cut / SET / press glyph | flag rule (READ N3 on panel) |
| B / PAGE | hide-show manual rail (solo) | — |
| V | mic on/off | |
| `"FLIP IT"` (mic) | pulses the tilt hint (words never act, #1797) | |
| Tab | flip manual view (solo) | |
| Esc / `?` | pause (PauseOverlay) | |

## Verify

```bash
npm run bombcheck   # 50 gates: legal+solvable gen (300 seeds), rules-as-printed
                    # (200 seeds), determinism, strikes/lock/fuse-cut, both loss
                    # paths, quota win 50/50, slack (wins at 75% fuse), grammar
                    # (+ FLIP phrases, page/dial keep), voiceCmd banking (#1415:
                    # recorder trace lands, file stays valid v1, replay hash-exact,
                    # hint==grammar one-source), D4-anchor (#1708: target invariant
                    # through all sibling progress, printed-count human flow,
                    # source pin), back panel (#1797: seeded batteries 0..2, flip
                    # law + silent refusal + face-up reset, autopilot never tilts,
                    # D5/G5 printed-truth rigs, every stamp live inside the quota
                    # incl. the revived N6, round 1 == README set, hash/simState
                    # carry the tilt, source pin)
npm run bombdrive   # real-key browser drive: attract->select->play, drawn pixels
                    # follow the sim, real strike (+ #1305 pixel gates: strike edge-
                    # flinch, sub-10s fuse-bezel throb), mic obey/refuse, contract
                    # hash determinism, death->restart, pause; #1415: live capture
                    # banks voiceCmd mid-run and replays exact, LCD-rail call-hint
                    # footer pixel gates (steel off / green on); #1797: real-key
                    # tilt (ArrowUp at module 1 / ArrowDown back), back-plate
                    # battery pixels, silent Space on the back, voice FLIP pulses
                    # without acting; zero page errors. Launches via chromeboot
                    # (#1622 ladder) — full Chrome cannot boot in launchd-kicked
                    # sessions on this box; its live-capture section still dies in
                    # headless-shell+single-process (advisory, known #1622 residue).
CONTRACT_ONLY=talk-me-down npm run contractcheck
node scripts/tmd-smoke.mjs   # quick sim-only smoke
```

Mutant proof (step 5): commenting `gs.fuse -= 1` in `step()` goes red twice
(expiry gate + fuse-cost gate); restoring returns green. #1708's mutant —
restoring the `!x.solved` guard — goes red on exactly the three anchor gates
("flipped 3 -> 0"), everything else green. #1797's mutant — removing the
silent refusal in the flip branch of `defuserAct` — goes red on exactly the
refusal gate (verbs leak onto the back, `score=495`) and the source pin;
everything else green.

## Honest gaps

- **CLOSED by #1373:** tap-to-talk pill, BOMB INBOUND curtain, vignette,
  paperclip + mic-hint page, seat-2 key drive — and the tap latch fixed to
  guarantee one engine tick (~6-tick wraps made quick taps on the page flip a
  no-op).
- **CLOSED by #1415:** `voiceCmd` written into `retrogames-rec` recordings
  (every heard call — obey, refuse-with-why, NO CALL) and the defuser's
  LCD-rail footer of accepted call shapes via the shared `ACCEPTED_HINT`
  const (page, footer and grammar can never drift).
- **CLOSED by #1797:** the bomb has a BACK panel — UP at module 1 tilts it
  onto a riveted maintenance plate (0-2 seeded batteries), DOWN tilts back;
  the back refuses verbs silently (no strike on your own curiosity), D5/G5
  read the battery count, "FLIP IT" pulses the tilt hint, and the variant
  slope (`1+round`) revived N6, dead under the old unlock law.
- 2P requires a shared keyboard (seat 2 = WASD + F); no online lobby yet —
  `#494` remote seats are reserved plumbing like SOS (#1248).
- Headless CI can hear nothing (no speech service): mic *delivery* is proved
  by badge state only; the grammar + obey/refuse path is injected.
- DIAL's "another module has wires" rule (D4) reads the bomb layout; a second
  dial module is intentionally not cross-referenced (first dial wins).
- The tilt is READ-only: batteries are counted, never pulled (no battery-pull
  fuse tricks), and the serial stays on the front — the original hides it on
  the back. Solo play can answer D5/G5 straight off the LCD rail without ever
  tilting; only a human seat 2 forces the flip conversation.
- No bomb-shape variety beyond the two sides; deeper rounds could vary the
  plate layout itself (that remains the fun-kind of stage 2).

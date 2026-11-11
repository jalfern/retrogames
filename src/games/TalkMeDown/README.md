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
  - `DIAL (D1..D6)` — turn the 0-9 dial, then press SET.
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
  pressure never hides. Exception since #1909: the back owns ONE verb —
  see THE DRAIN below.
- **THE DRAIN (#1909)**: while flipped, A is a hand — it pulls a battery out
  (the pocket holds exactly one) or puts it back. One press, one action: the
  drain edge-detects, because the flipped panel has no module-lock to swallow
  held-key repeats (a held Space would otherwise ratchet pull-push-pull —
  caught by a real-keystroke screenshot). Handling is free: the empty and the
  full end refuse silently. New stamp **D6** (round 5) spends the act: "PULL
  OUT a battery from the BACK plate... SET the dial to the number of
  batteries LEFT" — SET before the pull is the wrong action and the strike
  names it (`BATTERY STILL IN PLACE`). The demanded number is the LIVE plate
  count once pulled, so a drain also shifts what D5/G5 demand aloud — the
  page says COUNT, never a frozen digit, and text==truth stays whole through
  the trick (pinned, not accidental). `solvePad` drains for pull rules, so
  WATCH, the attract demo and every harness share the one brain; `held/pulls`
  ride hash/simState and the net snapshot (additive `hp`). A GLYPH mirror
  (G6) is impossible by the seat law — GLYPH seats only at round 4/depth 5 —
  so the drain rides the dial alone.
- **THE RAIL (#1917)**: the back plate's three holders are a physical
  slide-rail tray with a SEEDED cell layout, and the tray opens at its right
  end — only the cell nearest the opening can leave the plate. `<`/`>` pick
  the slot under the hand while flipped (pad-reachable; the hand lands at the
  rail's right end on flip); A on a blocked or empty slot refuses SILENTLY —
  #1909's fiddle law extended to slot level, the puzzle is reading the rail,
  never the risk of looking. The layout is a pure function of seed+round from
  a side-stream rng — the module rng never sees it, so every pre-rail bomb
  generates byte-identically (seed-pin law). Pull-back re-clips the cell to
  the slot it came from (`heldSlot`); the open end is drawn honest: the free
  cell wears a bright pull-tab, clipped neighbours a dark slate one. #1923
  made the mouth READ at phone scale: the groove walls stop short of the
  opening, a double chevron points out through the gap on one pulse clock
  with the `OPEN` word (`railMouthGlow`), and blocked tabs sit near-black
  (`RAIL_TAB_*`, contrast-gated ≥ 2x) so the free amber tab is the only
  bright thing at the rail end. The action line names THIS slot (`EMPTY SLOT / BLOCKED - IT CLIPS RIGHT / A
  PULLS IT OUT`). D5/D6/G5 stay verbatim true — the rail changes WHERE the
  cells sit, never what the count means. `solvePad` homes to the open end
  before it spends the press (WATCH/attract/harness share that brain);
  `tray/sel/heldSlot` ride hash/simState and the snapshot (hp[2..4]).
- **Rail audio identity (#1923)**: the rail reuses #1909's drain verbs, but a
  metal spring tray must not sound like a quiet plate creak. `audio.js` gives
  it its own voices: **cell-out** snaps first (920 Hz clip ping) then zips UP
  (460→980); **clip-in** clacks DOWN off the clip (880→300) and seats with a
  190 Hz thunk. Eyes-closed law, pinned: out rises and starts bright, in falls
  and lands heavy, neither voice contains the other's landmark. `handTick()`
  (300 Hz, 0.02 s, vol 0.035 — the softest shortest voice in the kit) rides
  the hand: `spec.tick` fires it only when the back is up and a fresh press
  edge (the `dialTurn` pattern — held arrows slide `sel` every tick in the
  unlocked flipped branch, so one sound per PRESS, never a 60 Hz rattle)
  actually changed `gs.sel`. View-only: hand shifts emit zero engine events
  (pinned), the hash law and every replay stand. Mutants die by name.
- **The slide (#1923)**: the original slides a cell along the rail; ours must
  not teleport it. `art.js` carries a view-only fx: `stepRailFx` diffs the
  rendered (held, tray, sel) and flies a ghost cell 14 frames — out rides the
  groove to the mouth then swings down to the pocket clip with a tilt that
  seats flat; in reverses the path while its landing slot reads empty (the
  rail never shows one cell twice; the clip stands empty until arrival). The
  hand's corner brackets glide a float slot index instead of jumping. All of
  it lives in the renderer: `drawBack(..., fx)` with fx optional (pre-slide
  pixels byte-identical for old callers), zero sim reads — 600 solvePad ticks
  with fx interleaved hash byte-identical (pinned). A bomb swap re-baselines
  silently, so no ghost crosses plates. Five named mutants die.
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
  Chrome has no speech service, so the mic-path downstream is proved via
  `__tmdTest.call(phrase)`.
- **CALL-BY-KEY (#1894)**: no speech service? X opens a typed call line;
  letters/digits/SPACE compose, ENTER shouts, X / Backspace-at-empty / Escape
  sheathes. `applyCallKey` is a pure EDITOR (voice.js) — the committed text
  rides `voiceCall`, the mic's own entry, so one grammar, one pulse law, one
  bank (#1415 parity: a typed shout lands in `voiceCmd` and replays
  hash-exact). Why X: the shapes say "CUT" — the open key can never eat a
  letter a call needs; no grammar word uses j/q/x (dial SIX is digits), and
  bombcheck pins that over the vocabulary. While the line is open the keyboard
  is a MOUTH: arrows and the seat-2 keys are swallowed (no pad leaks — pinned
  live), V is just a letter ("SEVEN"), and words still never release the WATCH
  seat (#1247 orders-not-hands). The channel prints where the ear is: the
  footer glows with ACCEPTED_HINT while the mic listens and coaches
  `KEY_CALL_HINT` (press X...) while it is off; the composition rides the LCD
  glass in amber (`CALL> cut red_`). Online the fold laws inside voiceCall
  run unchanged (guest pages, host gets THEIR PAGE TO TURN).
- **PHONE MOUTHS (#1900)**: CALL-BY-KEY is the physical-keyboard channel —
  VirtualControls carries no X, so on a touch surface the pill is the only
  mouth (mic-only by design; no key row on the pad). The footer says so: with
  the mic off, a touch device gets `TOUCH_CALL_HINT` (TAP MIC · TAP...) where
  a keyboard gets `KEY_CALL_HINT` (PRESS X...) — a phone is never coached to
  press a key it does not have. `drawOrderRail(..., touch)` takes the surface
  flag; bombcheck pins both coaches, the branch, the budget, and that the
  touch coach names the pill and never a key.
- **WATCH (#1637 batch 15)**: Y seats the engine's OWN `solvePad` into seat 1
  — the same reactive planner the attract demo runs and `tmd-smoke` wins
  200/200 seeds with, feeding the real pad path every sim tick, so a mid-run
  seat is honest from any module/strike/fuse position (no forked brain;
  watchcheck pins the feed and the witness). Any driving key or a tap hands
  back (shared blips); the run's end releases SILENTLY (racer rule). V is the
  mic's own switch, so it never counts as a takeover (words are orders, not
  hands, #1247). Multi-screen boot (#1656 exception): Y/▶ WATCH at
  attract/select banks a pending seat and `startPlay` seats it — one tap on
  ▶ WATCH starts the run AND watches the proven route; the pill itself rides
  the attract band at 24% per the phonecheck law.
- **Remote seats (#1880):** `net.js` runs the proven BombDefuse-online law
  (#1819) on this seed-pure sim: `go{seed}`, absolute pad masks batched
  every 2 ticks (PAD_DELAY 8), a whole-sim hash at every boundary, and
  `res` snapshots for desync resync plus #1838-style in-flight reseat
  (back + chunked snapshot + pad backfill, the human seated on a shared
  flip tick). Roles ride seats: host = seat 0 = DEFUSER, guest = seat 1 =
  MANUAL. Views split by role — the guest box plates over the bomb panel,
  the host box plates over the rulebook; the live-stamp rail rides with
  the page-holder (a shouted "NEON N3!" lands on the page, not the wire).
  Walkaway laws are role-honest: guest gone → seat 1 demotes after
  DROP_GRACE stalled ticks and the engine's CPU manual (partnerSay) takes
  the rail, the run still wins solo; host gone → the guest FREEZES (no
  role inversion — the page holder owns no hands), DEFUSER OFFLINE on the
  plate, any key back to the lobby. Heard page-words fold into the guest's
  SAMPLED pad stream ((want−page+3)%3 right-taps) so words online never
  fork shared state (#1247, online form). Y/WATCH is couch-only online
  (#1656 law: the wire already has somebody at the other end).
  `rng.js` exposes the mulberry32 counter additively — the one fact a seed
  alone cannot rebuild mid-run — so it rides the snapshot.

## Input map

| input | seat 1 (defuser) | seat 2 (manual, 2P keyboard) |
|---|---|---|
| arrows / d-pad | module + wire/dial/glyph | page + rule line |
| ↑ at module 1 / ↓ on the back | tilt the bomb over / tilt back (#1797) | — |
| A on the back | pull a battery out / put it back (#1909 THE DRAIN) | — |
| ← / → on the back | move the hand across the battery rail (#1917 THE RAIL) | — |
| SPACE / A | cut / SET / press glyph | flag rule (READ N3 on panel) |
| B / PAGE | hide-show manual rail (solo) | — |
| V | mic on/off | |
| X | open/close the CALL line; letters/digits compose, ENTER shouts, Backspace edits | |
| `"FLIP IT"` (mic) | pulses the tilt hint (words never act, #1797) | |
| `"PULL IT"` (mic) | pulses the drain: mouth chevron throbs double-time (back up) or the tilt hint leads (face-up); the action line spells `PULL IT -> A` only while a pull is legal (#1923) | |
| Tab | flip manual view (solo) | |
| Esc / `?` | pause (PauseOverlay) | |

## Verify

```bash
npm run bombcheck   # 88 gates: legal+solvable gen (300 seeds), rules-as-printed
                    # (200 seeds), determinism, strikes/lock/fuse-cut, both loss
                    # paths, quota win 50/50, slack (wins at 75% fuse), grammar
                    # (+ FLIP phrases, page/dial keep), voiceCmd banking (#1415:
                    # recorder trace lands, file stays valid v1, replay hash-exact,
                    # hint==grammar one-source), D4-anchor (#1708: target invariant
                    # through all sibling progress, printed-count human flow,
                    # source pin), back panel (#1797: seeded batteries 0..2, flip
                    # law + silent refusal + face-up reset, autopilot never tilts
                    # for a live pull rule, D5/G5 printed-truth rigs, every stamp
                    # live inside the quota incl. the revived N6, round 1 == README
                    # set, hash/simState carry the tilt, source pin), CALL-BY-KEY
                    # (#1894: editor law — compose/commit/close; no grammar in
                    # applyCallKey (source pin); j/q/x free over the vocabulary;
                    # the commit routes through voiceCall; the footer swaps coach
                    # by mic state), THE DRAIN (#1909: D6 unlocks at round 5,
                    # exactly-one-in-place gen law, the page-D procedure earns its
                    # SET, pull is edge-triggered (one press one net-out, a held
                    # key cannot drain dry), live count moves on D5/G5 rigs,
                    # solvePad drains too, partner leads with the pull, the wire
                    # carries held+pulls, source pins)
npm run platecheck  # THE RAIL (#1917): layout purity (seeded side-stream — module rng
                    # untouched), rail law on 105 two-cell boards (open-end-only pull,
                    # silent refusal, push-back re-clips home, pulls never rewind),
                    # still-winnable on 120 seeds, + rail AUDIO identity (#1923:
                    # cell-out rising / clip-in falling / softest-voice handTick,
                    # press-edge wiring pin, named mutants; hand shift event-silent)
                    # phone-scale legibility (#1992): every rail word sits at
                    # >=2x luminance over the rail floor (#33373d), the jam path
                    # prints deny red, the loaded readout rides an amber badge +
                    # FONT(7), and a sim-refused jam is proven to spell it out.
                    # Mutants deny-flat / badge-gone die by name.
                    # + THE SLIDE (#1923: ghost spawn/land/quiet-step laws, hand
                    # glide, silent bomb-swap re-baseline, pose flush+monotone,
                    # pocket/landing-slot double-image pins, fx-interleaved hash
                    # law, 5 named mutants)
                    # + OPEN-END LEGIBILITY (#1923: recording-stub pixel gates —
                    # mouth-chevron count + shared pulse clock, walls stop short,
                    # tab-luminance ratio ≥ 2x; 3 named mutants tab-flat /
                    # arrow-quiet / wall-full)
                    # blocked/empty refuse silently, push-back re-clips home, pulls
                    # never rewind), D6 solved on rigs needing a hand-shift, solvePad
                    # taps only at the open end, tray/sel/home ride hash+simState,
                    # quota win 120/120, and the open-end mutant dies
npm run bombdrive   # real-key browser drive: attract->select->play, drawn pixels
                    # follow the sim, real strike (+ #1305 pixel gates: strike edge-
                    # flinch, sub-10s fuse-bezel throb), mic obey/refuse, contract
                    # hash determinism, death->restart, pause; #1415: live capture
                    # banks voiceCmd mid-run and replays exact, LCD-rail call-hint
                    # footer pixel gates (steel off / green on); #1797: real-key
                    # tilt (ArrowUp at module 1 / ArrowDown back), back-plate
                    # battery pixels, silent Space on the back, voice FLIP pulses
                    # without acting; #1894: real keystrokes deliver a call —
                    # X opens (amber glass pixels), letters compose, arrows leak
                    # no pad while typing, V is a letter, ENTER shouts (HEARD
                    # banner pixels), nonsense gets NO CALL, live capture banks
                    # the typed shout and replays hash-exact, typed words hold
                    # the WATCH seat, mic-off footer coaches the keys. Zero page
                    # errors. Launches via chromeboot (#1622 ladder) — full Chrome
                    # cannot boot in launchd-kicked sessions on this box; its
                    # live-capture section still dies in headless-shell+
                    # single-process (advisory, known #1622 residue).
CONTRACT_ONLY=talk-me-down npm run contractcheck
node scripts/tmd-smoke.mjs   # quick sim-only smoke
npm run watchcheck -- --only talk-me-down   # WATCH seat pilot: seat/blip,
                     # steer-takeover, re-seat, untouched-defuse (strikes held
                     # is the honesty meter), route-to-win, silent release,
                     # one-tap ▶ WATCH from attract; + source pins (no forked
                     # brain, solvePad from engine.js, tmd-smoke witness exists)
npm run tmdlinkcheck   # 56 gates (#1880 remote seats), pure Node over
                       # relay/core.js rules: codec, snapshot incl. the rng
                       # counter, twin lockstep-to-win, 90ms jitter, guest
                       # walkaway demote at exactly DROP_GRACE + CPU-manual
                       # takeover + solo win, host-gone freeze-no-inversion,
                       # desync snapshot resync, in-flight reseat seated on a
                       # shared flip tick, page-fold math, static shell audit
npm run tmdlinkcheck -- --mutate          # 4 red — the walkaway law
npm run tmdlinkcheck -- --mutate-reseat  # 2 red — the shared players flip
npm run tmdlinkcheck -- --mutate-freeze  # 2 red — role inversion on host loss
npm run tmdlinkcheck -- --mutate-phone   # 1 red — the #1888 wide-bay swap undone
npm run tmdlinkdrive   # 24 gates (#1880 + #1888), TWO REAL BROWSERS over a
                       # local relay (dev server needed, DRIVE_RELAY_PORT || 8792):
                       # room+QR, phone joins by code (relay roster), SPACE
                       # kicks a pinned seed, phone ArrowRights really turn
                       # the HOST's manual pages, phone SPACE stamps a rule
                       # the host sees, hash boundaries agree (0 desyncs),
                       # walkaway -> CPU-manual demote -> solo campaign WIN,
                       # host-gone -> guest FREEZE -> any key walks back,
                       # close+reopen -> seated INTO THE LIVE RUN on the
                       # shared flip -> squad clears together, zero page errors,
                       # PHONE SEAT (#1888): touch guest gets the cream rulebook
                       # across the bomb bay (x200+x390 cream, plate on the rail,
                       # LCD band kept); ?touch=0 pins the narrow rail back
```

Mutant proof (step 5): commenting `gs.fuse -= 1` in `step()` goes red twice
(expiry gate + fuse-cost gate); restoring returns green. #1708's mutant —
restoring the `!x.solved` guard — goes red on exactly the three anchor gates
("flipped 3 -> 0"), everything else green. #1797's mutant — removing the
silent refusal in the flip branch of `defuserAct` — goes red on exactly the
refusal gate (verbs leak onto the back, `score=495`) and the source pin;
everything else green.

#1637 batch 15's mutant — replacing the seat feed (`p1 = solvePad(g)`) with
an idle pad — goes red on exactly four gates (untouched-defuse, route-to-win,
silent release, seat-feed source pin); restoring returns 198/198 green.

#1894's mutant — replacing the commit's `voiceCall(said)` with a plain banner
write (a grammar fork at the shout) — goes red on exactly the five load-bearing
gates: the voiceCall source pin (bombcheck), ENTER-shout intent, typed NO-CALL
refusal, live-bank parity, and the watch-word intent (bombdrive); restoring
returns everything green.

#1909's mutant — dropping `pull: true` from the D6 rule — goes red on exactly
four gates: "pull before SET" (the page-D procedure now dies with a premature
`battery still in place` strike), solvePad drains, the partner's pull-first
line, and the source pin; the edge/count/hash gates stay green because the
verbs themselves are untouched. Restoring returns 88 green.

Known stale (pre-existing, not batch 15): `bombdrive`'s seed-7 strike probe
expects the leftmost wire to be the WRONG cut, but seed 7's round-1 N1 now
targets wire 0 (verified in Node on origin/main) — its two strike gates read
red on main while `bombcheck` stays green. Filed for the QA lane.

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
  the back refuses dial/cut/defuse verbs (no strike on your own curiosity,
  and no ratchet — #1909's edge law makes that true for A too), D5/G5 read
  the battery count, "FLIP IT" pulses the tilt hint, and the variant slope
  (`1+round`) revived N6, dead under the old unlock law.
- **CLOSED by #1880:** remote seats — `?net=host` keeps the bomb, the joined
  link (`?net=join&room=CODE`) seats a friend at the manual on their own
  screen; lockstep pads over the relay, snapshots for resync, walkaway laws
  (guest gone → CPU manual takes the rail; host gone → the page holds still).
  Left open: no voice-over-network (the squad still talks by phone) and the
  room caps at two.
- **CLOSED by #1909 (THE DRAIN):** batteries can be pulled. A press on the
  back is an edge — one press, one battery out into the IN-HAND pocket, one
  out; holding the key does nothing (the #1797 repeat-hazard fix: the flipped
  panel has no module-lock to swallow held-key repeats, so the verb carries
  its own edge law, pinned 16e). D6 (round 5+) makes the live page a pull
  ("PULL A BATTERY, THEN DIAL"); the partner's call leads with the pull;
  the pocket state rides the contract snapshot (`hp`) and the hash. G6 was
  ruled out before writing it: GLYPH seats only at rounds 4/5 and N/G are
  taken at modules 0/1, so the glyph pool at depth 5 holds no 6th stamp.
- Headless CI can hear nothing (no speech service): mic *delivery* is still
  proved by badge state and an injected phrase (#1249). Since #1894 the
  grammar + obey/refuse + bank path also runs end-to-end on REAL keystrokes
  (X opens, ENTER shouts — to pixels and to `voiceCmd`); what remains open is
  a live speech-service delivery in CI, and typed calls on phones
  (VirtualControls has no X — the pill stays the phone's only mouth).
- DIAL's "another module has wires" rule (D4) reads the bomb layout; a second
  dial module is intentionally not cross-referenced (first dial wins). This is
  structurally untestable, not just unwritten: the seat law puts NEON at
  module 0 and the type cycle keeps DIAL at one module per round, so two live
  dials never exist on a real board.
- **CLOSED by #1917 (THE RAIL):** where the batteries sit IS a rule — a
  seeded three-slot tray that opens at the right; only the cell nearest the
  opening pulls out, `<`/`>` pick the slot, blocked/empty refuse silently,
  push-back re-clips home. Layout rides seed+round on a side-stream rng
  (module stream untouched), and the tray/hand/home ride hash, simState and
  the net snapshot. Proof: `npm run platecheck` (78 gates incl. audio + slide
  identity, 105 two-cell boards and named mutants).
- Voice shorthand for the drain: "PULL IT" on the mic pulses the drain story
  (#1923: parseCall `pull` intent, faster chevron clock, `PULL IT -> A` lead
  gated on legality). A bare pull verb stays noise; a verb + color is still
  the wire call (the cut law outranks the rail).

# STATE — session 284 (2026-11-15, slot b)

## Playable now / what shipped
- **PRINCE OF PERSIA grabs by thumb (#2324 → PR #2329, merge `98ee91d`, LIVE
  at /retrogames/prince-of-persia).** The whole 1989 ledge grammar — catch a
  fall, climb, release, shimmy, hang-jump — is now phone-reachable. The pad
  gap ("no Shift") closed with generic plumbing, not a PoP hack:
  - **`VirtualControls.thirdAction={{ label, code }}`** — a third HELD button
    rendered BESIDE the actzone (the A/B single-pointer hit-test `actionCodeAt`
    is vpadcheck-pinned and stays untouched). Own pointer id; `keydown` on
    touch, `keyup` on release/touchcancel/blur/hide (`releaseAll`); carries the
    `touch-none select-none` drag guards. Prop-gated: games that do not pass it
    render byte-identical pads. Synthetic events are `isTrusted:false`, so
    holding ✋ never trips the hide-on-keyboard law.
  - **PoP wires `✋ = ShiftLeft`**; registry controls + README + the game's
    Controls line teach it; README honest gap 0 marked CLOSED by #2324;
    `docs/GAME-SHELL.md` now specifies the third-action contract.
  - Gates: popcheck **371/371** (+5 §23 wiring clauses; hand-broke the wiring
    code → red → restored). popplay **24/24** incl. NEW phone page (390×780,
    real CDP touch): tap-to-start, `[data-vc="c"][data-key=ShiftLeft]`, thumb-
    right builds vx 2.60, ✋ held caps to vx **1.45 = CFG.walk** (Shift reaches
    the sim — one discriminator proving button→synth key→listener→sim), lift
    hands the run back, exactly one keydown+keyup, zero page errors.
    Unchanged laws all green: vpadcheck 703/703, vpadboot 212/212,
    tapstartcheck 34/34, contractcheck 724/724; lint pop/mario/fps/ai +
    eslint + build. Prod: `index-jEdmbUeH.js` carries `thirdAction`.
- Rule 4: game code shipped. QA polish pass filed: **#2330** (QA grabbed it).

## Ladder (this session's path)
- Warden target **#2318 REFUSED** (slot a live on it; my cross-ref comment
  stands — main already carries the corridor-monster base via #2319/#2323).
- No halt/steer; `next` #1711 re-verified Jon-side only (slot a released it,
  nothing new to grade); game-queue EMPTY; feedback all `building-qa`;
  `QA MASTER` live → no borrow. Flagship stage spent (idle.mjs computes
  null) → **never-dry rung**: `weakestStage` → PRINCE OF PERSIA score 3
  (3 README gaps, no QA feedback naming it, oldest unheld at that score —
  TEN-DEEP/BRITANNIA score 4 but held). Filed #2324 with the why-weakest
  line, claimed, shipped its oldest gap.

## BOARD at exit
- game-queue: EMPTY. building: none (#2318 resolved during the shift).
- building-qa: **#2321** (TEN-DEEP polish — the QA lane is inside TEN-DEEP;
  its roaming-packs stage merged as #2323, the issue stays open for the rest),
  **#2330** (PoP polish — mine, QA took it).
- feedback claimable by builders: none.
- jonq open: **#2305** (lane:platform, AWAITING — not ours to wait on).
- #1711 `next` — Jon-side remainder unchanged. No halt/steer.

## Next (slot a or b, in order)
1. Ladder as before; expect never-dry again. Weakest candidates (score 3,
   oldest registry first, minus held): GARDEN GUARD, VIPER PIT, TIDY BOT,
   FLOOR BOSS, GRAVEL YARD, TALK ME DOWN, BOULDER DASH … Caution: GARDEN
   GUARD's gap 0 is an explained non-gap ("slack rule does not apply") —
   take its NEXT bullet, or expect weakestStage to still score it 3.
2. If a jonq answer lands for #2305 (write key), execute the #2093 relabel
   one-off; a clap-test take on the store means grade it + post to #1711/#2156.

## The session's catches
- **Comments are selectors to a regex gate.** A code comment quoting
  `data-vc="actzone"` became the first match for vpadcheck's zone-class regex
  and reddened two checks on perfectly-guarded markup. Gates that grep the
  source see prose too — keep literal selectors out of comments.
- **Prod asset URLs redirect; curl without `-L` sees a 15-byte "Redirecting…"
  stub.** A whole poll loop read "not deployed" from nothing. `curl -sL` for
  jalfern.com HTML *and* assets.
- **Speed-symmetric discriminator beats a screenshot for pad plumbing.** ✋
  held caps vx to exactly CFG.walk (1.45) vs 2.60 released — one number proves
  the whole button→synth-key→sim chain, and the hang LAW stays popcheck's.
- **The warden's re-kick messages carried a stale board** (#2324/PR "merged"
  while my PR was still unfiled). Trust `gh`, not the ping; verify, keep
  building.

## Hygiene at exit
- Dev server :5178 stopped (mine only; never touched other lanes' ports).
- Slot-b worktree removed after merge (branch gone via squash); main checkout
  at origin/main. STATE committed to main (game merged — rule 9) + statepark slot b.

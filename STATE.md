# STATE — session 304 (2026-11-16, slot a)

## Playable now / what shipped
- **PRINCE OF PERSIA living night sky (#2461 → PR #2465, merge `581792f`).**
  Live at jalfern.com/retrogames/prince-of-persia — palace windows are weather now:
  - **Cloud banks:** 3 seeded layers per pane at 0.55–1.5× drift, own height/
    size/density; the first layer rides the moon's row so every pane's
    signature event is a cloud passing THE MOON, not past it.
  - **Wandering moon:** `moonPane` drifts the disc ±1.6 px on a seeded arc,
    clamped inside the glass — #2330's "same window, same night" survives,
    moving; rooftop law restated for the motion (disc bottom ≤67 < roof ≥68).
  - **Overcast moonlight (the player-visible rule):** `moonShade(tick,seed)`
    dims the window's cool key when cloud overlaps the disc; the shade rides
    `moonSources`' 4th channel into `lightAt`/`coolAt`/`tempAt`, cold pool,
    cast shaft, dust motes, flagstone band, figure rims. Halls darken and
    re-brighten under the sky. Measured: lightAt 0.70 clear → ≤0.5 overcast.
  - **Byte-safe:** default `moonSources(decos, base)` pins shade 1 — every
    pre-#2461 pin untouched; sim/`stateHash`/rng untouched (pure tick+seed).
  - #1711 claim attempt REFUSED (slot b live) → ladder empty → flagship gaps
    owned/QA-held → never-dry `weakestStage` → PoP (score 2, registry-oldest).
- **Picker hygiene (same PR, README-only):** MagicCarpet's village-economy
  bullet — shipped work missing its marker — is `CLOSED by #1764` again, so
  `weakestStage` stops handing free lanes closed work (#961 law).
- Gates: popcheck 398/398 (§25 ×11; all 48 column seeds dim ≤0.8 AND clear
  within 6000 ticks) · mutants 1/2/2 red (shade-out, drift-0, shade→1) ·
  popplay 28/28 live (forecast min 0.527, pane luminance shifts, shade rides
  the tick) · eslint + lint:mario/fps/ai + build green · `static` green.

## BOARD at exit
- game-queue / next / steer / waiting-jon: empty. building: #1711 (slot b,
  big-build — remaining acceptance is Jon's phone take; when a fresh take
  lands, `DEV_PORT=<own> npm run plaicraft:grade` grades + posts itself).
- #2461 shipped+closed this session. Others while I ran: b shipped #2462 +
  #2466 (clap coach + re-arm); QA shipped the BoulderDash butterfly #2467.
- building-qa: QA's own (#2460, #2447 revived; #2449 items 1–2 shipped by
  QA as #2455/#2458).

## Next (slot a or b, in order)
1. Refresh the ladder; empty → flagship stage → weakestStage — **re-run the
   picker, the shelf re-sorted twice this evening** (PoP gap 0 is gone; its
   last gap is check-only duck proof, not a player-visible stage).
2. Harness-doc fix worth taking (small, no behaviour): FORGE step 8 says poll
   the bundle hash — but a change confined to one game lands in that route's
   LAZY chunk and the index hash does NOT move. Evidence + the chunk-scan
   method posted on #2461's final comment (I nearly called a 90-min alias
   stall that was my probe looking in the wrong file).
3. If a fresh gauntlet take is in the store, grade it (b's note stands).

## The session's catches
- **Prod verification by index-hash polling lies for feature stages.** New
  games move the index hash (registry import); one-game changes don't. Grep
  the lazy chunks the live index references instead — #2465's marker was in
  `index-DAD9FVOy.js` on www from the start.
- **weakestStage picked a ghost:** MagicCarpet scored first on a README
  bullet for work #1764 finished months ago. Read the gap text before
  building the picker's answer; fix the marker (#961) and re-score.
- **Guarantee the signature event in law, not luck:** free cloud bands left
  7/48 seeds with no dim ever; pinning layer 0 to the moon's row made
  overcast 48/48 within 5 s.
- **Unit-mixed pins:** rad/tick vs panes/tick reads plausible and fails —
  divide by 2π before comparing drift rates.
- **STATE.md written into the main checkout can be reset by hygiene mid-
  session** (mine was reverted before commit). Write → park → commit
  back-to-back; the slot-park copy is the backup.
- **gh merge fast-forwards the worktree onto `main`** — re-detach at once
  and delete the local main (law).

## Hygiene at exit
- Dev server 5173 stopped (own pid only); foreign ports untouched.
- Worktree retrogames-forge-pop-sky pruned post-merge (purge cron); branch
  gone via squash; main checkout detached at origin/main, clean.
- STATE.md committed to main (game code merged this session) + parked slot a.

# STATE — 2026-10-15 (forge session, PoP Stage 10 shipped: interacting two-source light)

## Shipped this session
**PoP Stage 10 — interacting two-source light** (#316 deep pass; PR #342 squash-landed as
b23ed26; static+smoke+Vercel green; live confirmed HTTP 200 + the minify-surviving lit-lip
literal `255,190,120` present in production chunk index-Dc6wGzeo.js):
https://jalfern.com/retrogames/prince-of-persia

Art-only pass — `sim.js` untouched, so the 1989 rules + champion run are unchanged. Stage 10
makes the fire + moon sources *interact* (QA #341):
- **Warm-dominant overlap.** `tempAt`'s cool term scaled by `MOON_DILUTE=0.55`, so a body deep
  in a torch pool beside a window stays amber on the flame side instead of greying out. Overlap
  drop <0.2 world-temp; default-empty moon keeps every S8/S9 value bit-identical.
- **A per-window sky (`moonTint`).** `moonSources` carries a deterministic seed (pane column →
  `hash`). Each cool pool takes its own hue+intensity — indigo→pale-blue, 0.78–1.0, always
  blue-dominant (never warm). Same seed→same tint; no Math.random. Palace = a sky, not a stencil.
- **The moon casts (`coolBandAt`).** Faint cool shaft down to the floor + a flagstone-quantised
  cool band under each window, mirroring the warm `bandAt` — light *cast* from the pane.
- **Stepped stone.** Lit flagstones get a brighter 2px front-lip (warm + cool) so the band reads
  as stepped steps, not one flat glow.
- **Bone stays bone (`rimAlpha`).** temp-0 violet rim damped to 32% on pale palettes (`opts.bone`
  skeleton + `opts.pale` prince tunic); non-pale is byte-for-byte the Stage 8 inline value.

Gates: `popcheck` **302/302** (+23 S10 clauses). One mutant proof — kill the `rimAlpha` pale damp
→ "pale takes a damped rim" red (301/302), restored green. `lint:pop/mario/fps/ai` clean,
`build` green. `popplay` **17/17**, zero page errors (reaches the palace levels).

## GOAL — next session
#316 back on `next`; deep pass continues until Jon says stop. **Stage 11 candidates**
(QA #343 filed this session + carryovers from #341): mirror arch-aware veil (#341-6),
chase-sound duck test (#341-8), deco-derived window key height (#341-2), a slow seeded sky
drift / stars so the palace breathes, drifting cool motes down the moon shaft, two-source props
(warm rim fire-side + cool rim window-side), gate the pale damp on temp so a tunic under a torch
still catches amber. If Jon retires #316, oldest `game-queue` is **#295 Civ V** — plan the
breakdown first (map/cities → tech/units → diplomacy/victory), ship in stages.

## Board (last read)
- #316 on `next` (deep pass continues, 10 stages shipped). Queue: #295 Civ V.
- #341 partially closed by #342 (items 1,3,4,5,7); items 2,6,8 left open (documented as gaps).
- #343 filed (feedback): Stage-10 light-model polish — 7 items.
- Rule-4: not stalled (merged game code src/games/**: art.js this session).

## Notes for whoever picks this up
- **Stage 10 spine (art.js, pure & exported):** `MOON_DILUTE=0.55` (tempAt denominator);
  `moonTint(seed)→{r,g,b,s}` (r=120+70·frac, g=150+40·frac, b=255, s=0.78+0.22·frac; frac=seed-
  floor(seed) so integer seeds wrap to 0 — hash output is [0,1) so never exactly 1);
  `coolBandAt(x,moonPx,tile=T)` (= smoothstep cool bounce at tile centre, reach MOON_RADIUS*0.7);
  `rimAlpha(pale,warm)` = round3(base or base*0.32), base=0.12+warm*0.22. `moonSources` now
  returns `[px, 60, seed]` (seed = `hash(round((px-16)/T)*2.7+5)`).
- **DrawScene wiring:** `coolPool(ctx,x,y,fl,seed)` uses `moonTint(seed)`; cool-shaft loop paints a
  `createLinearGradient(0, mp[1], 0, fy)` + per-tile `coolBandAt` band + bright lip, all under the
  palace-only `moonPx`. Warm band loop adds the lit front-lip `rgba(255,190,120,b*0.16)`. Prince
  opts carry `pale: true`; figure rim uses `rimAlpha(!!(opts.bone||opts.pale), warm)`. Keep the
  palace-only guard, the HUD clip in coolPool, and the non-pale parity (never touch the else branch).
- **popcheck S10 pins:** MOON_DILUTE bounds + warm-dominance (flame+moon temp>0.62 AND
  tNoMoon−tMoon<0.2) + never-reversed + default-moon-unchanged; moonTint determinism/wrap/
  cool-dominant(span 0..0.9)/soft-key bound; moonSources seeded index2 + pane geometry intact +
  two-rooms-differ; coolBandAt quantise/step/reach-death/height/empty; rimAlpha pale-damp +
  non-pale parity (0.12 at w=0, 0.34 at w=1) + monotone; drawScene regexes (seeded coolPool,
  shaft gradient, cool lip, pale damp, palace-only), no Math.random. `RW` imported from levels.js
  in popcheck (art.js does NOT re-export RW; VW does).
- **Drive note (this sandbox):** headless Chrome needs dev on IPv4 — start vite
  `--host 127.0.0.1 --port <p> --strictPort`, poll `/retrogames/prince-of-persia`, then
  `POP_URL=http://127.0.0.1:<p>/retrogames/prince-of-persia npm run popplay`, ALL in one shell
  call (detached dev dies when the call returns). Worktree `~/Dev/retrogames-forge-prince-of-persia`
  has node_modules (vite + playwright-core); reuse it — `git worktree add` fails if the dir exists,
  so `git checkout forge/<slug>` inside it (create the branch first).
- **Prod proof:** jalfern reachable; entry `index-BZPes5Hy.js` is the app shell — PoP is a lazy
  per-game chunk. Verify via: grep the entry for `index-*.js` refs, fetch each, look for the new
  literal (Stage 10 = `255,190,120`; Stage 9 was `150,170,255`). Vite hashing is deterministic —
  local `index-Dc6wGzeo.js` matched production exactly.
- Main checkout detached at b23ed26. Stale pop-stage2..9 + forge-* worktrees remain — prune when
  confirmed free (other lanes may still hold them).

## Three questions for Jon
1. Stage 10 varied the sky per window but each window's sky is still frozen in time. Want a slow
   seeded sky drift / faint stars (palace breathes), or is a static per-window tint the target?
2. Props are lit by the room's dominant source. Push two-source props (warm rim fire-side + cool
   rim window-side, like the bodies) — or keep props single-source for a calmer read?
3. #316 is now 10 stages deep and open-ended. Keep going (Stage 11 = the #343 list), or green-light
   the Civ V #295 map/cities stage now?

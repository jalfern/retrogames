# STATE — session 285 (2026-11-15, slot a)

## Playable now / what shipped
- **GARDEN GUARD tray portraits (#2328 → PR #2331, merge `98ea042`; prod
  pending #2335).** The never-dry pick (weakestStage score 3: three README gaps,
  no QA feedback naming it, oldest unheld at that score). Honest skip note: gap
  0 = documented slack-rule exemption (check-only wouldn't count), gap 1 =
  documented mobile economy choice; gap 2 ("card art reuses the small defender
  icons") was the oldest fixable one. Cards are now PORTRAIT PLATES: critters
  posed at card scale on orchard soil under their own dusk hue (treeline, low
  sun, drifting cloud), beveled riveted frames, gilded on selection, breathing
  on the sim clock (deterministic — attract replays byte-identical); trowel card
  framed to match. `drawPlantIcon` stays for field/cursor — sim untouched, all
  #1832 chrome contracts ride unchanged.
  - Gates: gardencheck **55/55** (+8 portrait clauses: layered fills ≥8/card,
    soil mound on the floor line, ≥3 rivets, double frame, 6 distinct drawing
    signatures, gild follows `sel`, all cards move between sec 0.9↔2.4, same
    state → same recording). Failure-proved: rewiring to the old icon stamp
    turns 6 of 8 red. Pop-tweaks after eyeballing screenshots (heavy treeline →
    soft silhouette, chili pods outlined, trowel clipped in its plate).
  - Driven for real (headless Chrome, real events): attract → Space → plant by
    tap → L6 tray → **gold frame read back from canvas pixels** → win → attract
    → restart, zero page errors. contractcheck 15/15; lints + build green.
- Rule 4: game code shipped. QA polish pass filed: **#2336** (sound is the big
  one — GardenGuard has no AudioController at all).

## THE HEADLINE: PROD STALL (#2335) — read this before your step 8
Production alias `retrogames-psi.vercel.app` (what jalfern.com proxies) has
served main chunk `index-DwVfievf.js` since ~08:50Z despite GitHub deployments
reporting SUCCESS for `98ea042` (08:54), `3693ebe` (08:58) and `e5d057e`
(09:14). Proven origin-stale, not proxy cache (cache-bust + no-cache headers
return the old HTML; psi fetched directly; HTML `last-modified` claims 09:14).
Three lanes' features are merged but invisible. No vercel CLI/token on the
studio and *.vercel.app deployment URLs are SSO-gated → needs dashboard eyes.
**Until #2335 clears, step-8 prod verification will fail for every merge — don't
spend an hour re-deriving this; link #2335 and move on.**

## Ladder (this session's path)
- Warden target **#2324** (PoP GRAB): claim REFUSED — slot b held it live (24
  min); they shipped it as #2329. Normal ladder: no halt/steer; `next` #1711
  Jon-side only; queue EMPTY; feedback #2321 `building-qa`; QA MASTER live →
  no borrow; flagship stage spent → never-dry rung → GARDEN GUARD. Claimed
  self-filed #2328 IMMEDIATELY after create (the #2318-vs-#2315 twin-stage fix;
  worked — no collision this time).

## BOARD at exit
- game-queue: empty. building: #2334 (POLISH VIPER PIT — another lane's claim at
  exit; not ours). building-qa: #2321 (TEN-DEEP; pt1-3 merged, #2333 MODERN pass
  — QA still inside), #2330 (PoP polish, QA grabbed slot b's pass). feedback:
  #2336 (mine, claimable).
- Bugs open: **#2335 PROD STALL** (lane:platform, needs dashboard) — highest
  priority for whoever has Vercel access.
- jonq open: #2305 (AWAITING, lane:platform; default hold). No halt, no steer.
- Slot-b harness debt from session 283 was fixed on main (#2327).

## Next (slot a or b, in order)
1. If #2335 is still open and you have ANY way to reach Vercel — fix the alias
   flip first; verification for #2331/#2333 rides on it. Otherwise skip step-8
   deep-dives and link #2335.
2. Ladder as usual: #2336 is claimable feedback — but QA MASTER is a builder
   borrow only when QA is dead; expect never-dry again. Run `weakestStage` —
   TEN-DEEP/PrinceOfPersia gaps now partially closed; BRITANNIA/other score-3s
   remain (it re-scores honestly).
3. jonq #2305 answered → execute the #2093 relabel one-off (platform lane).

## The session's catches
- **Prod verification needs a content marker in the right chunk.** Vite names
  every lazy game chunk `index-*.js` (the module file is index.jsx) — polling
  `index-<main>.js` for game strings scans the wrong file; HTML-hash-flip alone
  can also pass while content is stale. Marker-scan ALL referenced chunks;
  cross-environment chunk-hash equality does NOT hold (local e5d057e build ≠
  Vercel hash), so string markers are the only portable proof.
- **A fresh, clean, correct build ≠ a fresh deploy.** All local gates green says
  nothing about the alias flip; #2335 cost this session 40 min it would not have
  spent knowing the deploy pipeline itself was the suspect.
- **Eyeball your art before shipping** — screenshot zoom found three defects
  (heavy treeline blobs, low-contrast chili on red sky, trowel overflowing its
  plate) that no bbox-based gate can see.

## Hygiene at exit
- Dev server :5173 (slot a's own) stopped; nothing else touched.
- Slot-a worktree removed after merge; main checkout re-detached at origin/main.
- STATE.md committed to main (game merged — rule 9) + `statepark.mjs park a`.

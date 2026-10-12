# STATE — 2026-10-12 (~10:55 PDT, forge session end)

## Shipped this session
**PAPERBOY** (#143, `forge-paperboy` → PR, `/paperboy`). NES-style paper
route: pseudo-3D band-strip road (256×224, all art+audio runtime), 77 doors
in 3 routes, carts that sweep crossings, kerb-lunge dogs, F-throw. The
attract demo is the solver's proven ride, tick for tick.
Gates: `papercheck` 581/581 (6/6 mutants die, slack ladder = windows 2px
tighter × full-throttle × crawl × zero-spare all win 77/77), `paperplay`
21/21 real keys in Chrome. Wired: `lint:paper` + `papercheck --mutate` into
the static CI job, `paperplay` into the smoke job, both into `verify`.

## Playable now
Full arcade incl. Paperboy + this morning's Lode Runner pixel-art coat (#165,
QA lane). jalfern.com/retrogames/<game> after the deploy lands.

## What changed
- `src/games/Paperboy/{sim,levels,planner,index}.js(x)` + README — new game.
- `scripts/papercheck.mjs` + `scripts/paperplay.mjs` + npm aliases + CI wiring.
- Load-bearing rules (each pinned by a mutant): door window ±16 px AND lean;
  cart closes the road **behind its nose** (swept span shared verbatim
  sim↔DP); dog lunge lands INSIDE its s-band (dogR=30); a lying physics
  must make the DP *disagree* — the replay witness gets the final word.

## Lane collision found (for Jon)
The 07:23 QA session (#156 lode paint) **ran 2h, not 60 min** — it merged
#165 then kept painting. It also branched `qa/lode-art` off *my* unmerged
forge-paperboy tip, and this checkout still sits on it with my dirt.
I shipped Paperboy from `/tmp/pb-ship` worktree; shared checkout cleaned.
Questions:
1. Should the QA lane get the same hard 60-min kill (`timeout 3600` in
   `forge-qa.sh` like the forge's 3 h cap) — it stalled at ~08:42 but kept
   burning the GPU this whole session?
2. QA playbook step 1 says `checkout main`; it branched off whatever was
   checked out instead. Add "refuse to branch if HEAD != main" to FORGE-QA?
3. Queue head is **#152 Wizardry (game-queue)**. It's a dungeon crawler —
   big scoping. Proceed with it next session, or pick something smaller?

## Next session
1. Read this file. Work #152 unless Jon redirected (check `/priority`
   comments on #152 and #91 first — the website box may have spoken).
2. Prod-verify Paperboy at jalfern.com/retrogames/paperboy after merge
   (this session ships it; if you are reading this post-merge, close #143
   with `shipped` if it is still open).
3. Remember the law: only the static job blocks merges; one merge command;
   3 non-game PRs in a row ⇒ stop and report.

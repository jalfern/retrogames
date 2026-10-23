# STATE — 2026-10-23 forge session 6 (SSX six-mountain build shipped)

## Shipped this session
- **#889 → main (PRs #909 squash b051c0b + #910 squash 2052cd2, static
  SUCCESS both)** — the mountain got bigger:
  - SIX original courses: classic three doubled (1224–1856 m) + BACKCOUNTRY
    BOWL (long day cruiser), TIMBER LINE (tight dusk slalom), PIPE WORKS
    (night park). Each keeps its character in terrain, not palette.
  - Route choices everywhere: crevasse GAPS (deterministic crest launch >12 m/s,
    `crash 'gap'` below the rim or grounded in-span, shoulder route alive at
    |x| ≥ GAP_X; props filtered from sim AND plan over holes), express CHUTES
    (1.45× trough, featureLift-carried sink), double-trickle HIGH RAILS in the
    powder band (5/6 courses; BASIN stays pipes-only).
  - RACE stays 3 heats (rule 6); `tournament(seed)` rotates which 3 of 6 —
    seed 0 keeps the classic triple, odd seeds the backcountry; online rooms
    inherit the host seed. #910 fixed the online standings that still passed
    COURSE_COUNT (podium could never close after the catalog doubled) —
    HEATS now, 2 regression gates.
  - Gates: ssxcheck **285/285** (+ rotation names, doubled length, per-course
    gap/chute presence + clean-ground composition, fast-flies/slow-swallowed/
    shoulder-survives, express multiplier, double trickle, seed-1 win + slack,
    seeded field gap falls; + online HEATS gates). Mutant: air-gap crash
    neutered → 1 red; restore → green. mountaincheck 212/212, terraincheck
    76/76 (longer faces: lips highlight now ramped 1+0.15·smooth — binary
    1.18 drew a shade line past the piste-continuity guard; those gates now
    sample every gully / skip crevasse rows, honest for six mountains).
    vpadcheck 611/611, lint gates, build, ssxmodelcheck 70/70 (one first-run
    nav-timeout flake, rerun green). Prod verified: chunk `index-u4XzR6fW.js`
    carries ALPINE/BACKCOUNTRY/TIMBER.
- **#911 filed** (QA feedback): six-mountain polish pass — crevasse ice-wall
  shading, gap callout sound/flash, chute speed cue, shoulder-route flags,
  rotation named in HUD, TIMBER tree density.

## Next goal
- Oldest `game-queue` is **#893 PLATFORM — iPhone as controller for iPad
  games** (room code, direct Wi-Fi, ping readout). Big networking/UX piece;
  SSX's room.js + relay are the natural spine (STATE session 5 notes the
  relay worker still needs the Cloudflare redeploy for 4 seats).
- Other Emberwood gaps (README flagshipStage): save system/second shop/elder
  gift; portrait full-bleed; tempo lift/attract music.
- QA holds #863 (BLOB). Never touch a game QA is inside (`heldGames`).

## Board / harness status
- main green at 995d604 (+ this STATE commit); no freeze; no `halt`.
- `jonq`: nothing AWAITING in lane:games (#873 answered and shipped). No new
  question filed this session.
- **Deploy dependency (unchanged):** real internet play needs the relay worker
  redeployed on Cloudflare (#825 answered — execute per its reply when the
  QA/platform lane picks it up).
- QA lane owns: #863 BLOB (building-qa), #911 SSX polish (feedback).

## Open questions
- none open (all lanes clear at time of writing).

## Housekeeping owed
- Worktrees safe to prune: `~/Dev/retrogames-forge-ssx-courses` and
  `~/Dev/retrogames-forge-ssx-analogue-stick` (both detached at origin/main
  after merges), plus older forge/QA trees (`…-emberwood-*`, `…-qa-863-cputiers`,
  ssx/*). Main checkout is detached at origin/main.
- Prod-verify gotchas (unchanged): `jalfern.com` 308s to `www.` — curl must use
  `-L`; SSX ships in a lazy chunk — scan the chunk list from the index bundle,
  and `gh pr checks` exits non-zero while checks are queued — wrap the rule-5
  poll in `|| true` or the && chain dies silently before the merge. New this
  session: don't trust a bulk chunk-grep loop — verify by content-length first
  (a loop that prints nothing can mean fetches failed, not that markers are
  absent); the live SSX chunk was found at 87 KB carrying the course names.

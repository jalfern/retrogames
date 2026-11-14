# STATE — Forge (last: session 266, slot a, 2026-11-14)

## SHIPPED THIS SESSION
- **PICK RUSH — hand-authored belt waves #2210** → merged **#2211** → `3e83fe0` (10:13Z,
  rule-5), prod-verified: served index refreshed to `index-BONU6URW.js` and the PickRush
  chunk `assets/index-CkEav0yA.js` carries the wave table (`SINGLE FILE`).
  Live: https://jalfern.com/retrogames/pick-rush.
  `WAVES` in `sim.js`: 3 named waves per shift (SINGLE FILE / CRATE & COIL / EARLY
  BURST → … → GLASS GAMBLE), kind order authored seed-independently (learn shift 1,
  know it on every machine), intra-wave gap + longer `rest` per wave, ±5 ticks seeded
  jitter kept, era ladder honoured (bottles shift 2, barrels 3, scrap 4), wave caption
  over the belt mouth + two-note cue at each breather. Quota promise untouched:
  waves feed 48/55/56/65 vs quotas 18/19/20/21.
  **This session resumed a corpse**: #2210 was already slot-a's, build pushed (`fa88b5a`)
  by the session that died waiting on the #601 merge. This session: claim refresh,
  independent re-verify (`pickcheck` 30/30 node incl. 5 WAVES gates + 12/12 browser zero
  page errors; eslint + lint:mario/fps/ai green; gates read and confirmed honest),
  background rule-5 merge loop → main-ok green at 10:13:42Z → squash-merge → prod poll →
  #2210 closed shipped.
- **Merge freeze #601 cleared by waiting**: red nightly 43568372143 died on `dvhcheck`
  (horse demos, fixed by slot b's #2208 already in main HEAD); verified `dvhcheck` 7/7
  locally, watched the in-flight nightly on `fa1faa3` to success — no quarantine needed.

## LESSONS (the expensive kind)
- **Zombie lane redux (#2182).** The 09:08 “resumed” session did NOT die at the 09:19
  warden kick — it wrapped #2210 concurrently: filed duplicate QA pass **#2214** (10:14Z,
  22 s after my merge) and STATE `7980efa` (10:17Z, since overwritten by slot b).
  My duplicate #2217 closed onto #2214 (unique items merged into it). Before ANY
  wrap-up step (QA issue, STATE commit), re-list open `feedback` + read main’s
  STATE.md — never assume the corpse stayed dead.
- **Wrapper cache outlives the deploy.** jalfern.com kept serving the pre-merge index
  ~40 min after Vercel reported success for `3e83fe0`; hashed new assets 404 through the
  wrapper until it flipped (it proxies the OLD deployment). Verify: poll the served
  index’s entry name for change, then sweep the chunks referenced by the NEW entry for
  your marker. Predicting entry hashes locally is wrong across other lanes’ merges.
- **Games are lazy chunks now** — wave markers live in `index-<hash>.js` game chunks,
  not the entry bundle (the fa88b5a-era single-bundle probe shape is stale).
- **Prove the dev server before trusting browser gates**: `:5173` held a corpse’s vite;
  `lsof -p <pid>` cwd showed it served MY worktree (fine this time) — check anyway.

## BOARD
- **#2210 closed (shipped).** QA polish keeper **#2214** (PickRush waves presentation +
  WAVE-INK harness gate). QA lane also holds #2200/#2205/#2209.
- **#1711 stays `building`** (platform): tail = **#2157** (lanes grade takes; JON_KEY
  step per its body) + Jon’s 3 phone takes (#2156 stays open for live numbers).
- Nightly: last completed on main = **success** (43576364789 @ `fa1faa3`). Newer shas
  (`3e83fe0`…`72cb973`) await their nightly — check at the next kick.
  No quarantine entries. No steer/halt on any board.

## NEXT (next slot)
1. **#2157** (lane:platform, unclaimed): JON_KEY from gitignored `.env.local`, evidence
   download retry+backoff, verdict posted on #1711 per new take. #2188 audit fix is in —
   safe to build.
2. When Jon’s phone takes appear: `plaicraft:evidence`/`plaicraft:clap --key=` numbers
   onto #1711 (then #2156 can close).
3. Builder ladder otherwise empty → `weakestStage` at the next kick; Homebody marquee
   tail is slot b’s note — treat as owned if unsure (#2200/#2209 QA territory).
4. `claptestplay`/`plaicraft:clap` need a dev server on DEV_PORT (slot port); keep them
   lane-run.

## Open questions
- none (jonq list games: no open questions; taste bar not reached).

## HOUSEKEEPING
- Slot-a worktree `~/Dev/retrogames-forge-pickrush-waves` (branch merged; detached at
  newer shas by later lanes, node_modules symlink) — kept for the record, remove when
  idle. Vite on :5173 STOPPED at session end (own port only).
- `git worktree list` shows no worktree holding `[main]`; main checkout detached after
  the STATE push.
- STATE committed to main legitimately (this lane’s #2211 merged this session) + parked
  to the slot-a path (`statepark.mjs park a`).

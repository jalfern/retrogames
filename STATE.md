# STATE — session 299 (2026-11-16, slot b)

## Playable now / what shipped
- **MAGIC CARPET: forty-five worlds (#2427 → PR #2441, merge `c0db200`).**
  Live at jalfern.com/retrogames/magic-carpet (marker `THE FINAL SKY` verified
  in prod chunk `index-CuvpMWJy.js`, Vercel success). The campaign reached the
  original's FULL length: arcs ten–fifteen, 18 new names (GREENVEIL → THE FINAL
  SKY), +15 vault ramp and pearls +5 unbroken; 45 ≡ 0 mod 3 keeps every arc on
  a frost close; SKY ladder now LAST/ENDLESS/FARTHEST/OUTER/FINAL.
  Yield law holds to the tail honestly: deepest ask 805 vs floor(263·3.5)=920
  = **87.5%**, better than mid-campaign's 89% → no tail re-file needed.
  Attract copy follows (`FORTY-FIVE WORLDS · FIFTEEN ARCS`) — and the stale
  `EIGHTEEN WORLDS` line #2419 left behind finally updated.
- **Cap law raised from measurement:** fresh 60-seed sweep at 45 = 60/60 win,
  slowest seed 36 at **1,217,880 ticks** — OVER the inherited 1.17M
  (`LEVELS.length×26000`): deep-arc fights lengthen superlinearly (wizHp 725@45).
  New law `CAMPAIGN_CAP = LEVELS.length × 30000` **exported from sim.js** —
  carpetcheck + DebugKit PROGNOSIS ride one source, drift impossible.
- **A real bug the long road found:** campaign mana-conservation ledger broke at
  worlds 40/41 (seed 7, +6 twice). A wizard absorbing a spawn pearl on the
  level-up tick moves map→purse, but the rebase added his purse as the spawn
  CONSTANT — sim conserved, ledger double-counted. Fixed harness-side (live
  purse) + new spawn-equivalence pin (every world seeds exactly its table
  hoard/HP/quota/pearls) restored the proof strength the live version lost.
  Never fired pre-45 because it needs pearl-within-5u-of-tower AND quota-that-tick.
- Gates: carpetcheck **393/395** — all Node arms, sweep, conservation, spawn
  pins green; the two residue fails are the #1703 heavy-phone pixel arms,
  flaking on this shared box (values swing wildly run-to-run incl. 0-frame
  captures; lite-GL variant of same gate green) — advisory, documented on the
  PR/issue. eslint + mario/fps/ai + contractcheck 724/724 + build green.
  Mutation proofs: drop THE FINAL SKY → table pin red alone; pearls 228→227
  (MAGMA FIELD) → widened +5 ramp pin red alone. Restored, mutateguard clean.
- QA polish pass filed: **#2449** (arc-tint drift, name-biased terrain, deep-arc
  fight feel, per-arc ambience; + the flaky pixel-arm caveat for CI).

## Ladder (this session's path)
- Warden target **#2420 REFUSED** at claim (slot a live, 76 min). No steer/next
  then; game-queue top #2427 (my #2419 follow-up) claimed normally.
- **A `steer` appeared mid-build: #2430 (PLAICRAFT valkyrie replay/voice).**
  Steer outranks the ladder at the NEXT claim — it is platform-lane work; this
  session stayed in its one game per rule (hard rule: one game per session).

## BOARD at exit
- game-queue: empty. building: #2420 (slot a, EXCITEBIKE contact), #1711
  (PLAICRAFT, re-derive branch liveness fresh at claim). building-qa: #2385,
  #2449 (mine, QA's to take). `steer`: **#2430** — takes the next claim per
  ladder law (platform lane; check jonq/answers first).
- jonq open: #2305 (lane:platform, AWAITING until 11-17) — not ours to wait on.
- Slot hygiene warning for the next b session: **5178 is squatting a foreign
  vite** (launched from `retrogames-forge-bd-amoeba2`, pid was 96504 — slot a's
  lane, NEVER touch per slot law). This session ran its dev server on **5188**
  (`DEV_PORT=5188` for all browser arms) and stopped only its own pid.

## Next (slot a or b, in order)
1. **#2430 steer** — first claim of the next cycle if still open (check it
   isn't claimed/answered first; it's platform-flavoured, mind the lanes).
2. #2427 is CLOSED shipped — no campaign growth left (45 = the original's full
   length). Remaining magic-carpet work is #2449's QA territory + the
   scoring-model delta (needs a research stage; file POLISH when taken).
3. Never-dry: `weakestStage`/`idle.mjs` FRESH; verify the gap is gameplay (#2391).

## The session's catches
- **`| tail -N` on a long suite swallows the FAIL lines** — your own pipe is a
  buffer too. Long checks: full log to file, grep after (session 298's SIGKILL
  lesson, same tax twice).
- **A single-seed probe lied by omission:** seed 7+88 cleared at ~1.11M and my
  first README draft wrote "slowest seed 88" — the full sweep's slowest is seed
  36 at 1,217,880 and it EXCEEDS the old cap. Measure the whole sweep before
  sizing a law; the first number in the README was wrong and got corrected in
  the same PR.
- **Pixel gates are load-sensitive on a 4-lane box:** the #1703 heavy-phone arms
  failed 3x with three different value profiles (incl. mid-window 0px = zero
  frames rendered in 350 ms). Same gates are green on CI. Judge red by whether
  it MOVES between runs; a moving number is noise, a fixed number is a bug.
- **`jalfern.com` 308s to `www.`** — curl without `-L` gets `Redirecting...`;
  prod-verify greps need -L (and the game lives in a lazy chunk: resolve
  markers across the chunk chain, not just index).

## Hygiene at exit
- Dev server 5188 stopped (own pid only); 5178 foreign vite untouched, as is
  every other lane's port. Worktree retrogames-forge-carpet-45worlds removed
  after merge; branch gone via squash; main checkout detached at origin/main.
  #2427 commented+shipped+closed; #2449 filed. STATE committed to main (game
  merged this session, rule 9) + parked slot b.

## Open questions
- None new. jonq #2305 (lane:platform) AWAITING until 11-17 — not ours.

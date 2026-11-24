# STATE — forge board snapshot (slot a, 2026-11-23 — the papercraft polish lands)

## This session — SHIPPED
- **#3086 TIDY BOT PAPERCRAFT polish pass** (PR #3090, squash-merged `d374c32`):
  all six issue items, `reimagined` painter only — classic byte-identical
  (`f947d5dc` unchanged). Softer 6px/0.6-alpha gingham whose crossing bands
  darken into real checks, cloth card CUT with wavy edges (bands clip to the
  cut); attract sign became a cut card (rounded corners, fold crease, folded-
  back corner flaps, torn-edge washi PRESS strip); bot got three kraft flute
  dots at the chassis bottom edge + washi patch on the antenna joint; stove
  front got two brass sticky dials (fridge-badge family); jam/place/break/close
  bursts fly as tilted 2×3 confetti in paper colors (`chrome.confetti` gates
  it — classic keeps its squares); paper-crinkle on glide arrival + cardboard
  thud on close (AudioController noise/sweep, no assets). Live:
  https://jalfern.com/retrogames/tidy-bot?style=reimagined
- Gates: tidycheck 145/145 twice with the exact shipping content; GOLDEN_PAPER
  re-frozen `33dfb942 → 17152d53` in the same PR (issue authorizes approved
  restyles; deterministic across fresh loads). Mutation proof: gingham-band
  alpha nudge turns the paper golden NAMED-red while classic stays green.
  ESLint + three scoped lint gates + build green.

## Harness lessons
- **The 90-min claim window is the dead-claim reaper, and the clock is the
  work plan.** Mini died at claim time (#3086) with zero checkpoints and zero
  pushed branches; warden re-kicked slot a five times. Correct play: attempt
  the TARGET claim (honest REFUSED, 11th contact in the #3053 family), run
  the ladder, then fill the window building everything that doesn't touch
  remote state, and claim at expiry — `CLAIMED #3086 for slot a` at
  05:29:05Z, ~34 s after the window closed. Slot b's earlier 1-s loss and ten
  refusals were the queue, not the script; the script needed no change.
- **Perceptual golden sensitivity is color/material, not shape.** Mutation
  experiment: doubling the cloth scallop depth (±1.3 px world) is invisible at
  the 40×30 signature — by design (raster-drift tolerance from #3078) — while
  a band-alpha change flips it by name. When re-freezing a golden, prove teeth
  with a palette mutation, not a shape mutation.
- **Real-key SPACE block in tidycheck flakily swallows presses on BOTH skins'
  pages** — reproduced on unmodified main `14861a2` (byte-identical game code,
  main's golden), so not introduced by #3090. Filed **#3088** (`feedback`);
  the QA lane fixed it within the same session via PR #3091 (`d816805`,
  world-tick waits) — a filed-to-fixed turnaround. CI `smoke` failed on PR
  #3090 (advisory) with the same signature; reruns should now be clean.

## Rule 4
- Streak RESET — #3090 is game code (`src/games/**`). Three-in-a-row is not
  close.

## PLAYABLE on main right now
- `/retrogames/tidy-bot?style=reimagined` — papercraft diorama, now polished
  (prod deploy verified via the game chunk carrying the new code).
- `/retrogames/demos/starry-night.html` (#3082), PONG (#3081), CONTRA through
  TOP SOLDIERS, raccoon heist museum, spy-hunter chase, iron keep, mario,
  galaga, missile, pucks, mines, zork, ultima, king's quest, Joust, Q*bert,
  heist-forge board.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (deadline Nov 25).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- #3079 — rule-4 same-source kicks: dry-shelf candidates (Jon's Nov 26
  deadline; factual updates posted — #3085 and #3090 are both game code).

## Next queued (ladder is thin)
- `game-queue` empty; the only `feedback` open is #2971 (waiting-jon — skip).
  #3088 (tidycheck real-SPACE flake, reproduces on unmodified main) was filed
  and FIXED this session by the QA lane via #3091.
- Flagship stage + never-dry returned NONE at `14861a2` (five identical hands,
  fetch-branch honesty re-checked this hand: 32 open issues, no silent #2797
  failure). If the queue stays dry, the live candidate is a new-title ask
  (uncaps ~Nov 27 per #2795).

## Slots / board state at handoff
- Slot a merged this session; #3086 shipped+closed. No PRs of mine open.
- QA is alive and shipping (merged #3091 mid-session) — no restart needed;
  slot b's last session exited after yielding to mini. `building`/`building-qa`
  issues: none open (#3088 closed, its `building-qa` label is stale residue).
  Main tip at handoff: `d374c32`.
- Plumbing: this lane's worktree re-detached at `origin/main` (`d374c32`);
  remote branch deleted by mergeclean. Dev server on :5173 stopped via
  scripts/devstop.sh at handoff. STATE.md committed to main (game merged).

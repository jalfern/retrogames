# STATE — session 345 slot b close-out

## Shipped this session
- **HOMEBODY — THE LOT GROWS TWICE (#2721) — PR #2728 merged `cfacf8d`**
  (rule-5 loop on `static`; verified by `state,mergeCommit`, not exit code).
  Prod verified: the live chunk carries `paper round fills the garden jar` and the
  old `save a second §300` line is gone. #2721 shipped + closed; polish pass
  filed as **#2729** (`feedback`, QA lane).
  Kit two gets an honest purse instead of a richer till: **Pip's morning paper
  round** (`updateRoute`, `ROUTE = {cash:90, hour:7}`) pays once per day (day-stamp
  law) into `s.jar`, never `s.money`; `JAR_CAP = GARDEN.price` (a full jar reads
  full); `buildRoom`/`buildRoomOk` drain the jar before the till and the jar buys
  ONLY the cottage; the cottage prices itself §90 (8 planks vs the wing's 12, door
  through an existing wall); the bot buys both kits (`WINGS_MAX` unchanged, third
  refuses); the thrift gate saves for the *next kit's own* price (§300 bar byte
  identical while kit one stands unbought). Marquee + catalog card (`§90 JAR 90/90`)
  + registry controls + F1 eye (`FILL JAR`, `SEND ROUND`) teach it; the round pays a
  coin pair + banner at the gate.
  Proof: peoplecheck **1033/0** (new §GARDEN JAR ×23; #2714 pin flipped to
  grow-twice-and-ripen; #2689 refusal → "a THIRD kit refuses"; attract gate takes
  `ext=WINGS_MAX`); all five WINNABLE seeds win, tour exactly `pet,kid`, **4/5 end
  ext=2** (seed 99 wins seconds after its hammer — residual is ripening time, not
  money); queuecheck **99/99**, no-tap pin re-sampled `3836882361 → 3998885235`;
  mutant `fund = 0` → exactly the four economy gates red (1033→1029/4), restore
  green; eslint + lint:mario/fps/ai + build green; `homebodydrive` ran real taps
  (advisory).

## Next queued (slot b)
- Re-derive at main (`node scripts/idle-kick.mjs`); do NOT trust this line.
  Expect: #1711 (held by slot a, was REFUSED at 23:10Z — re-check its live
  comments), then `game-queue`, then `feedback` — #2729 is the fresh HOMEBODY
  polish pass (QA lane's; builders skip `building-qa`, but #2729 is `feedback`).
- TARGET #1711 at kick: REFUSED (slot a held it, 69 min). Its line-3 blocker
  #2709 shipped (#2723) — slot a's own note says the remainder is done.

## Catches learned (durable)
- **An economy stage must not touch the till.** Pouring new income into `s.money`
  (payday base hikes, morning income) accelerates the #2209 family-first tour and
  the thinnest WINNABLE seed dies: measured `20261023 → LOSE@d2` on both levers.
  An **earmarked fund** (`jar`, consumed only by kit two) leaves every shipped tour
  byte-identical until the hammer → all five seeds survive unchanged.
- The bot's `s.money > 300` gate is not thrift alone — it is "family before real
  estate". Lower it only for the item you earmarked (`purse >= nextKitPrice`,
  `> EXT_ROOM.price` semantics kept for kit one) or cheap decor starves the wing.
- A kit's price is asked in TWO places (`buildRoom`, `buildRoomOk` — the ghost's
  legality). Both must learn the fund or the preview lies at the counter.
- **Marquee copy with an apostrophe inside a single-quoted string breaks the
  bundle** (esbuild `Expected "]" but found "s"`) — and eslint reported nothing
  because it linted the file it could parse. Run `npm run build` before shipping
  any copy edit; escape as `\'`.
- Re-sampling an autopilot hash is a legitimate gate update ONLY with the twin gate
  green and the reason named in the message (this session: jar joins `stateHash`,
  `routeDay` kept off it as a clock, like `lastToast`).

## Lane state
- Worktree `~/Dev/retrogames-forge-homebody-economy` + branch removed post-merge;
  main checkout detached at `cfacf8d`. Port 5178 freed (dev server killed at close).
- Rule 4: game code merged this PR ✓ (streak reset).
- QA MASTER (node studio) live all session; #1711 held by slot a the whole box.
- Open questions for Jon: none filed — every pick here was ladder- or README-derived
  (no taste-shaped, hard-to-undo call; the price/rate pair is documented in the
  game's README and easy to rebalance if Jon disagrees).

# STATE — session 173 (2026-11-07, slot a)

## What shipped
**GRAVEL YARD: SHOUTED ORDERS — PR #1775 squash-merged as `cade77a` (Closes #1771).**
Never-dry pick (#1571): weakestStage said MAGIC CARPET 7 — yielded: open QA pass #1764
restates all five MagicCarpet README gaps (owned when unsure); TALK ME DOWN 7 — held by
live #1711 (BOMB DEFUSE alias). Next: GRAVEL YARD 6 (five README gaps unowned — #1769's
items are pin-juice, not gaps). Filed POLISH #1771 for the oldest gap ("Voice #1247:
push-to-talk that steers the CPU crew") and shipped it.
- **The mechanic:** V (or MIC pill) → consent (`askVoiceConsent`, never auto) →
  `speechListen` → `voiceorders.js` grammar mirroring the yard's radio words:
  GATE WIDE/MED/NARROW ("open it up", "choke it down"), RUN IT, JOG IT (verbatim radio),
  PIN COARSE/FINES ("coarse first"), PIN CLEAR. Orders queue in `gs.vord`; CPU planners
  serve WITH PADS (#494): operator sets gate/runs batch against the demand chart (orders
  are one-shot overrides), truck walks to the board stand and cycles A until the pin lands
  (#1759 law verbatim). Refusals say why (NO JAM/HOPPER TOO LOW/NO COARSE ORDER/THE
  TRUCK IS YOURS/SOLO SHIFTS ONLY); stale shouts expire FORGET IT; receipts radio
  COPY/GATE NARROW/PINNED. Heard-banner + pill + one-time hints card + obey/refuse sfx.
- **Laws:** solo-local like Gauntlet `_vCmd` — net refuses, `vord` never hashed,
  full-CPU references bit-identical (8/8 quota, hashes unchanged); calls bank to the
  consented `voiceCmd` channel (`recordVoiceCmd`; `uploadAllowed` strips without the
  voice grant).
- **Gates:** gravelcheck **131 Node** (+35: grammar table, refusals/replace/cap, gate/run/
  pin/unpin overrides with radio receipts, stale expiry, same-shouts-identical-hash +
  shouted-vs-silent divergence, src pins #1744) + 5 browser gates (headless PIN COARSE
  E2E no-mic, heard-banner, pill `data-voice-coop`, NO JAM, queue drain). Mutant: stub
  pin-retire `c.kind==='pin'&&gs.pin===c.orderId`→false = exactly 1 red; restore green.
  Lints + build green. README gap CLOSED with mutant recipe; scope note added to QA #1769
  (voice surfaces for its pass).
- Prod verified: entry `index-B01bdp0U.js`, voice chunk `index-DDpIsiy1.js` (content
  sweep across the entry's chunk list — session-172 lesson, works).

## Warden-target note
#1711 claim was REFUSED (slot b live, 30 min — its clap-sync stage). Normal ladder then:
steer/next/game-queue empty, QA MASTER studio+mini live (feedback borrow blocked),
flagshipStage null → never-dry rung. This is the honest path the playbook wanted.

## Next queued
- Slot-a ladder at session start: expect steer/next/game-queue empty; #1711 + #1637 held
  by slot b (check `gh issue list --label building` liveness before claiming).
- Never-dry when dry: re-run `weakestStage` fresh. Score-5 tier with no QA coverage:
  CIVILIZATION V, HOMEBODY, BRITANNIA, FLOOR BOSS (oldest-first → CIVILIZATION V gap #0
  "vassals are annexed, not puppets"). GravelYard gaps remaining after this session:
  operator-seat local scheme, analog/reverse, #1306/#1390 changelog residuals (2 of those
  bullets are shipped-work text — candidates for README pruning, not game work).
- PLAICRAFT S3 (#1711 stage 3) gated on #1730 (AWAITING, deadline 11-08; default hold).

## Open questions
- #1730 (waiting-jon, lane:games) — R2 bucket + relay deploy; default hold.

## Slot hygiene
- Dev server: slot-a's `npm run dev -- --port 5173 --strictPort` LEFT RUNNING (mine;
  kill before restarting: `lsof -ti :5173 | xargs kill`).
- Worktree `~/Dev/retrogames-forge-gravel-voice` (node_modules symlinked) sits detached
  on the merged sha; remote branch deleted at merge.
- Main checkout carries a stray untracked `qa-mini-5174.log` (failed nohup from the mini
  QA lane — plumbing debris, not a corpse; left in place).
- Lesson kept: capture receipts DURING the drive loop (fx caps at 40 entries) and assert
  at the landing tick + one extra step (voiceTick reads the receipt next tick) — three
  harness gates died on capture timing before that fix, engine was right all along.

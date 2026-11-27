# STATE — forge board snapshot (slot b, 2026-11-27 — ROGUE cart life-dice SHIPPED `7d74c29`)

## This session (slot b)
- TARGET #3695 REFUSED at claim (slot a live, claim 8 min earlier). Normal
  ladder: steer 0 · `next` #1712 waiting-jon (skip #605) · game-queue empty ·
  feedback-borrow blocked (QA studio + mini live) → flagship stage spent →
  idle-kick answered `KICK CENTIPEDE 0 weak`.
- **Proved that kick a #3672-family phantom:** Centipede gap-0 is struck
  through (`~~…~~ #3620`) carrying a `**#BLOCKED**` variant the filter regex
  misses, and its two remaining bullets are unwitnessed/pinned-spec disclaimer
  notes. Hand-recomputed shelf: Pacman honest 0 (two struck + a Chrome/harness
  note), Frogger 0 (both gaps live as items 4–5 of QA's #3692), Pong 0
  (`**DISCLAIMER:**`-with-colon variant), Pinball 0 (`**OPEN (#3336 item 2)**`
  + jonq #3335 hold). **ROGUE honest 2 — highest.** Filed + claimed **#3697**.
- **SHIPPED #3697 → PR #3700 (`7d74c29`).** Fetched BSD Rogue 3.6 (RRP
  mirror) — the issue's own "class-based gain rolls / int-cha-wis spread"
  premise is DEAD: `rogue.h struct stats` = strength only, BSD Rogue has no
  class system (classes enter the lineage via Hack/NetHack). Documented per
  the #3664 doctrine and shipped what the source proves: `checkLevel` walks
  the whole ladder (100xp at lvl 1 → lvl 5, one Welcome naming the landing
  rung), gain = Δ REAL d10s; `e_levels` verbatim incl. the **40920 misprint**,
  top rung 20 (port capped at 11); healing = roll(lvl,4), extra healing =
  roll(lvl,8), both with the cart's `hp = ++max_hp` overflow quirk (were flat
  rng(3,10)/rng(4,10)/rng(10,20)).
- Proof: roguecheck **192/0** (+10 pins), mutant walk→single-`if` dies exactly
  3 checks (restore green), roguedrive **29/29** real Chrome 0 page errors,
  lint fps/mario/ai/rogue + build green, prod bundle `index-CU3C8cJ4.js`
  carries the 40920 marker.
- Filed **#3702** `QA — ROGUE: raise potion, poison clock, two-voice quaff,
  jump juice` (feedback): P_RAISE potion (widens generation, deferred here),
  poison is a duration clock in the cart (port bites instantly), identified
  potions should speak the cart effect line, level-up jingle/welcome can scale
  with Δ, chg_str/max_str ceiling law.

## BOARD facts at close
- main GREEN at `7d74c29`. Slot a still building #3695 (live since 08:49Z).
  game-queue empty. building-qa: #3647 (DEMO ORRERY); #3665 cleared mid-run.
- The idle-kick phantoms all still live: `~~` strikethrough (#3672 itself),
  the `**#BLOCKED**` hash-variant, `**DISCLAIMER:**`-with-colon, and
  `**OPEN (#n)**` annotations — four titles needed hand-correction this
  session before the pick was honest. The #3672 fix (lane:forge, open,
  unowned) would save every free slot that work each session.
- Open `next`: #1712 (PLAICRAFT S2, waiting-jon). AWAITING jonq: #3335
  (QA, due Nov 27 14:14Z), #3516 (Arkanoid art, Nov 28).

## PLAYABLE on main right now
- ROGUE — one good kill can take you four levels at once (a d10 per rung);
  healing at hero level is a fistful of d8s, and a full bar overflows to
  +1 max, exactly like the cart: https://jalfern.com/retrogames/rogue
- FROGGER — press `2` for the alternating duel; PAC-MAN arcade progression.
  MISSILE COMMAND 3-button law lands tonight if slot a finishes #3695.

## Open questions (links only — #605)
- #3335, #3516, #3244, #2971, #1712 — all AWAITING, none mine this session
  (every call was measured against fetched source; nothing of taste to ask).

## Next claims (for whoever is free)
1. game-queue empty; fresh feedback #3702 (ROGUE polish) is QA's while its
   lanes run. #3672 remains the cleanest small harness job on the board —
   fix the four filter variants above and idle-kick stops mis-kicking twice a
   day (this session's Centipede + the morning's Missile Command phantom).
2. ROGUE's last honest gap: lamp/oil light-source clock (#3697 shipped gap 0
   only) — next never-dry pick unless something outranks it.
3. #3695's remaining stages stay slot a's (context lives there).

## Slot state at handoff
- Slot-b dev server :5178 stopped via `scripts/devstop.sh` at close.
- Worktree ~/Dev/retrogames-forge-rogue-gains DONE (#3700 merged;
  node_modules is a symlink into the main checkout — safe to prune).
- Main checkout detached at origin/main; STATE.md parks with
  `statepark.mjs park b`; docs PR carries it to main.

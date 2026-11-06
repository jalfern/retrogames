# STATE — session 155 (2026-11-06, slot a)

## What shipped
**MAGIC CARPET: CLONE — the 12th spell (#1680) — PR #1683 squash-merged `7bfa2e9`, LIVE.**
The never-dry stage picked MagicCarpet (weakest shelf score 10) and shipped its
oldest unowned honest gap: creature-cloning, the last entry of #1612 item 5
(clone/dissolve/shatter/volcano — roster tail now COMPLETE).
CLONE (cost 35, key `=`, tray slot 12): every creature within CLONE_R=24u of
the look point gains a twin at the MIRRORED position across the ring centre
(>=6u out), full spawn HP (`SPAWN_HP` now the single source for spawn+clone),
fresh AI clock. Twins are ordinary monsters — chase/bite/sling/stampede,
ordinary bounty: pack in, mana-and-danger doubled, out. Wizard unique, never
cloned; land/huts/pearls/books untouched (cold, rng-free — same seed, same
litter); CLONE_MAX=32 world guard. Jade mirror-flare + per-twin birth
sparkles (GL), echoed two-note cast + doubling banner (shell), twin glyph tray
icon. 12 new carpetcheck gates (mirror spot, kill economy, cold-land promise,
no free mana, wizard-unique, empty-ring miss, CLONE_MAX, deny, tray 12,
determinism); mutant proven (delete twin push → 3 gates red).
Balance: the 12th book shifted the gen rng stream and seed 33 died at tick 517
— root cause was a bot blind spot: altitude-armor compared ground UNDER the
carpet while ridge wolves bite from THEIR hill, and the climb command cancelled
against the target-descent. Autopilot now uses max(carpet-ground, closing
wolves' ground) and releases pad.down: 60/60 seeds, slowest 25,519.

## Lessons (worth keeping)
- **gh-shim `state` vocabulary breaks the rule-5 loop**: it returns
  `state=completed` (SUCCESS lives in `conclusion`), so the merge loop spun
  15 min silently. Evidence + fix candidate posted on #1676. Until #1676
  lands: verify `conclusion=success` for `static` yourself, then run
  `gh pr merge --squash --delete-branch` — that is what worked here.
- Shim also 404s `gh run list --branch` and returns `link:null` from
  `gh pr checks` — a red advisory (smoke) cannot be triaged from CLI; treat
  smoke red per rule 3 (rerun once/move on) without log access.
- **Prod fingerprint for MagicCarpet**: registry strings live in the ENTRY
  chunk (`CLONE (cost 35)` in index-<hash>.js from the shell HTML); game-chunk
  strings (`CREATURES DOUBLED`) live in lazy `index-*.js` — scan the entry's
  referenced chunk names; hashes change per deploy, re-derive don't hardcode.
- curl to jalfern.com: needs `-L` (308) AND netenv sourced in EVERY shell call
  (proxy vars die with the shell).
- Autopilot overrides must clear the opposing pad bit (`pad.up` alone does
  nothing if `pad.down` stays pressed) — #1612's fix had the same latent
  shape; the sweep caught it only for the wolf-terrain case.
- lookPoint-dependent gates: aim via the exported `lookPoint(gs)` (now
  exported) instead of hand-picked coords — hand coords missed by 30u once.

## Next (priority order)
1. Normal ladder next slot-a session: no halt/steer/next open; game-queue is
   EMPTY; `feedback` is QA's (two live QA sessions) — expect the never-dry
   stage again: `weakestStage` after this shift scores GravelYard 7,
   TalkMeDown 7, CometDrift 8 (per STATE 154 Comet gaps stay unowned),
   MagicCarpet now ~9 incl #1673 — recompute from READMEs, don't trust these.
2. #1637 batch 5 is slot b's live claim (Lode Runner-Lite/Arena Archery/WWI
   Dogfight) — do NOT claim while b holds; check claim comments.
3. #1679 (carpetcheck-sibling: cometcheck --mutate dead on main) belongs to
   QA per Jon 2026-10-19; don't pick it up from a builder lane.

## Notes for the next slot-a session
- Dev server 5173: STARTED and KILLED this session; port free.
- Worktree `~/Dev/retrogames-forge-mc-clone` detached at origin/main,
  node_modules symlinked — reusable; branch deleted both ends.
- If touching MagicCarpet autopilot descent/targeting: re-run the 60-seed
  sweep (~90 s) — seed 33 is the canary for ridge/wolf terrain interactions.
- Local Chrome still degraded (#1622): pixel/muffle gates flake 1–5 runs;
  CI Chrome is the bar (smoke on #1683 went red unviewable; static green =
  merged per law).
- `gh issue edit --add-label` still dies; use `gh api ... -X PATCH -f
  'labels[]=...'` (REPLACES whole set — pass every label you want to keep).

## Open questions
None new (#1645 carried line dropped; `jonq list games`: none open).

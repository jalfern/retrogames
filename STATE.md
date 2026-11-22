# STATE — forge board snapshot (slot b close, 2026-11-22)

## Shipped this session
- **#2931 R-TYPE pad THROW → PR #2932 → main `d1545d0`, LIVE.**
  The phone pad grew VirtualControls' third action (`THROW` → `KeyN`), so a thumb
  can hurl docked orbs (#2925's throw was keyboard-only; the wall was a dead end
  on phones). One pad, no second thumb-pad (Jon's rule). Seat two stays keyboard
  (H) per the multiplayer rule. rtypecheck **201/201**; two new browser laws
  (pad carries the verb at phone width; a pointer tap hurls the pair).
  Wiring proven by hand: KeyN→KeyZ (fire) turns the tap law red (`fly=0 docked=2`).
  Prod verified by chunk grep: jalfern.com `index-DeuPXplK.js` carries
  `thirdAction:{label:"THROW",code:"KeyN"}`. Winnability untouched (floors: 7/12 solo, 11/12 co-op).

## Duplicate story (don't re-litigate)
- #2924 (slot b Option-launch) and slot a's #2925 were the same gap; slot a shipped
  first (`03dfd39`). #2924/#2927 closed as duplicates with explanation.
- Branch `forge/rtype-optlaunch` (remote + worktree `~/Dev/retrogames-forge-rtype-optlaunch`)
  is **kept as a fidelity reference**: pierce-vs-spend orbs, armour-spends, plug,
  B-verb precedence laws. If R-TYPE ever revisits drone semantics, mine that design doc first.

## R-TYPE open gaps (next weakest rungs, README order)
1. Williams-style duelist (armed variety bit).
2. Carrier interceptors — carriers never answer back when their pod is shot.
3. Phase-2 volley dodge (volley is fired, not dodged, by the autopilot).
4. Wing-brain shell initiative; dark-seat free life; drone mid-flight catch.

## Harness lessons learned this session (cheap fixes, next harness touch)
- **`scripts/heistclock.mjs --pad` is latently broken**: it calls puppeteer's
  `page.setViewport()` on a Playwright page → TypeError. The flag was never exercised
  on CI. Fix: `page.setViewportSize({width,height})`. (Slot b's new pad laws do this right.)
- **VirtualControls pad is `md:hidden`** (Tailwind ≥768px) and hides until first touch:
  any browser law that drives the pad must `page.setViewportSize` below 768 AND
  `window.dispatchEvent(new Event('touchstart'))` first. Smoke's pad test only checks
  `querySelector` (isConnected), so it never noticed.
- **`gh issue list --label a --label b` is AND** — when deriving stages via idle.mjs,
  fetch `--state open --limit 200` and filter locally.
- Grep JS bundles under `LC_ALL=C` (they contain bytes that break zsh's default locale).

## Slots / ops
- Slot b port **5178** (devstop.sh when done). Never 5173/5174/5179.
- QA lane is live (mini, mini2 sessions) — builder lanes stay out of QA tasks (Jon 2026-10-19).
- Open questions for Jon: none (no `waiting-jon` filed this session).

## Next lane starting here
- Board derivation: run idle.mjs (fetch open issues, filter locally). R-TYPE's pad score
  should rise post-#2931; expect the Williams duelist or carrier-retaliation to be the
  new weakest flagship rung. DOUBLE DRAGON polish (#2863 follow-ups) belongs to QA, not builders.
- Worktree node_modules: symlink from an existing forge worktree is fine (lockfile unchanged
  since b91648c).

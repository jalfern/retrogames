# STATE — 2026-10-23 forge session 8 (HOMEBODY shipped, #899 closed)

## Shipped this session
- **#899 → main (PR #924 squash 00c4ff3, static+smoke+prsmokes pass)** —
  HOMEBODY, an original people sim in the spirit of The Sims (own IP):
  - Two residents, five needs (hunger/energy/fun/social/bladder) draining
    against a never-stopping clock (1 sim-hour = 5 s; workdays run ×8).
  - Point-and-command: tap fridge/bed/TV/mailbox → BFS walk + interaction;
    stick/arrows walk, A uses nearest, G switches resident, B buy mode.
  - Buy mode freezes time over a 13-piece catalog; `keepsOpen` refuses any
    solid placement that would wall in a person, the gate, or a use-spot
    (earned the scar: a 2-tile bed sealed a 2-row bedroom, whole sim starved).
  - Work + career ladder pays; Fern the neighbour visits on seeded schedules
    and fills the social bar; thought log narrates the little stories.
  - Mood kite over the head; unattended RED physical needs faint (only
    physical — sad/bored is not fatal, like the original); both down = lose;
    80 contentment grants the lifetime wish = win (~day 3 for a good player;
    autopilot demo wins in ~3 min real time).
  - Autonomy (self-service, clocking in) runs ONLY in demo mode — attract +
    harness. The player is the voice; neglect genuinely kills.
  - Gates: peoplecheck 35/35 (+npm alias) with mutation proof (neuter content
    accrual → WINNABLE red, restore → green); contractcheck homebody 14/14
    (pattern added); homebodydrive 17/17 real Chrome (start→order→eat→buy→
    sell→pause→both-down→R restart, zero page errors); 3 lint gates + build.
  - Prod verified: lazy chunk `index-Bo8UX30n.js` carries LIFETIME WISH on
    jalfern.com. Live: https://jalfern.com/retrogames/homebody
- **#929 filed** (QA feedback): HOMEBODY polish pass — iso depth, richer walk
  poses/sfx per need, order-queue display, coin juice, attract buy-mode flash.

## Next goal
- Oldest `game-queue` is now **#900 Momentum Runner: better courses — make it
  great** (then #901 shared 3D model library, #902/#903 demos — demos are
  self-contained under public/demos/, no registry entries).
- Other Emberwood gaps (README flagshipStage): save system/second shop/elder
  gift; portrait full-bleed; tempo lift/attract music.
- QA holds #863 BLOB + #911 SSX polish (+ now #929 HOMEBODY). Never touch
  a game QA is inside (`heldGames`).

## Board / harness status
- main green at 00c4ff3 (+ STATE commit); no freeze; no `halt`.
- `jonq`: nothing AWAITING in lane:games (#873 answered+shipped). No new
  question filed this session (nothing taste/priority-grade came up).
- **Deploy dependency (unchanged):** real internet play needs the relay worker
  redeployed on Cloudflare (#825 answered — execute per its reply when the
  QA/platform lane picks it up). 4-seat SSX rooms still need it; link pads v1
  does not.

## Open questions
- none open (all lanes clear at time of writing).

## New harness lessons (this session)
- **Map-string rows must be length-checked** — three MAP rows were 15 wide and
  the cellChar bounds-guard silently turned them into implicit walls; BOOT now
  asserts every row's width.
- **A 2-tall piece cannot live in a 2-row room** — every solid placement runs
  `keepsOpen` (gate + residents + every item's targets reachable from the
  front door) BEFORE it is allowed; demo autopilot placement scans the same
  gate.
- **Autonomy must be a mode, not the default** — full self-service made the
  game unloseable-by-neglect and un-playable-by-command; `s.demo` (attract +
  harness only) restores both.
- **Edge-detect once** — a key-queue AND a pad-edge both flipping the same
  boolean cancel each other (buy mode never opened); one owner per toggle.
- **Lazy chunk verification**: the index bundle does NOT name the game — scan
  the entry JS for chunk references, then grep the chunk itself
  (`assets/index-*.js` names are opaque here).
- A stale dev server on 5173 (main checkout) served the pre-merge app and made
  the drive script fail "hook missing" — check `DEV_PORT`/vite's "port in use"
  line before trusting a missing hook.

## Housekeeping owed
- Worktrees safe to prune: `retrogames-forge-people-sim` (after this STATE PR),
  plus the old list (`…-ssx-courses`, `…-ssx-analogue-stick`, `…-emberwood-*`,
  `…-qa-863-cputiers`, `…-forge-iphone-controller`). Main checkout detached at
  origin/main.
- A dev server is running on :5174 from this session (kill when done); :5173
  belongs to the main checkout's dev server.

# STATE — 2026-10-22 forge session (#781 Emberwood stage 1)

## Shipped this session
- **#797 Emberwood "light the vale" → prod** (main `0e4a30b`), the #781 steer.
  - Near-black FIXED (#773): the composite sampled the sRGB scene RT (decode to
    linear) and wrote the canvas raw — vale shipped dark on every engine, not
    just iPhone. `compMat` runs `lin2srgb` in-shader. Town mean 15.8 → 65
    (lite 58); dungeon stays moody (14).
  - HUD strip clears the #437 ARCADE/PAUSE/mute cluster on every viewport.
  - Portrait canvas 480x360 (4:3): ~25% taller game on iPhone; blur kernel
    takes a `res` uniform. Ortho window is orientation-agnostic (viewH 210).
  - Music (#781, was an honest gap): ORIGINAL beds VALE ASCENT (D-major,
    0.13/step) + ROOT AND EMBER (A-minor, 0.17) in `AudioController.MUSIC`;
    switch per `screen.dark` in the shell loop; silent attract/pause/death/win;
    `duckMusic` on hit/boom/stagger/boss-kill; fanfare on win; sword swish;
    `_winSeen` reset fix (win overlay could stick off a second run).
  - Harness: 87 → **90 gates** (+3 brightness +4 bed/layer… net with QA's 3
    nudge gates from #796). Mutation-proven twice: neuter encode → 3 red
    (town 11.0); rename dungeon bed → 3 red. Restore → 90 green, lint quiet,
    build green, zero page errors.
  - #773 closed shipped. #781 multi-stage — kept `building` (see below).

## The lesson of the session
- Two lanes on one game CAN collide even when you dodge the files you expect:
  #786 (QA) shipped mid-session and touched render.js too. Staying out of
  sim.js/world.js still required one clean rebase (check gates green AFTER
  rebasing, not just before). Also: prod verify must chase the lazy chunk —
  the game code lives in its own dynamic chunk; the entry carrying the new
  track name was the tell, `lin2srgb` was in `index-ByRzm2nN.js`.
  And jalfern.com 308s to www — curl needs `-L`.

## Next goal
- #781 continues (steer stays claimed): **enemy variety + attract proof-route
  bot + shop signposting** next builder round. Brightness/HUD are done; the
  sim is stable again after #796 so sim edits are safe to resume.
- `next`/game-queue: empty.

## Board / harness status
- main: `0e4a30b` (#797). Nightly green pre-merge; no freeze. Rule 4 ok.
- jonq lane:games: nothing AWAITING; nothing filed this pass (no taste calls).
- Open questions (links only, #605): none open for lane:games.
- QA lane owns: #752 EMBERWOOD polish (gap list updated post-#797), #791 SSX,
  #747 STORM, #713 CREDITS, #695 CAMPFIRE, #702/#704 SHORE/OCEAN. #786
  shipped via #796 (closed).
- #781 keeps `building` (stage 1 of the steer merged; stage list in its last
  FORGE comment).
- Worktree `~/Dev/retrogames-forge-emberwood-pass-781` + dev server 5177
  pruned this session. Stale unpruned from earlier lanes still on disk
  (comet-drift family, qa-5xx/6xx/7xx set) — worth a housekeeping pass.

## Open threads
- Old forge branches on remote for closed issues: `forge/campfire-670`,
  `forge/ssx-cpu-riders-620` — deletable by Jon's next sweep.

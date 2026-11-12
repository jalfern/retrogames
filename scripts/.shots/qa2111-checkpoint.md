Reproduction (probe = openMario -> __marioTest.autoplay() -> 16ms trace of {level,col,x,y,h,power,lives,state}; see below):

- Natural flow reproduced EXACTLY: 1-1 flagpole col174 lives=3 power=fire -> enters 1-3
  at col 3 (fire Mario) -> dies at col 33 (x=526) -> respawn -> identical death col 33
  (x=523) small -> identical -> GAMEOVER at col 33. Never reaches 1-4. Matches #2111.
- The death is NOT "never asks for a long held jump" at the pit edge. Trace of the fatal arc:
  Mario rides pit-1's platform chain and comes off it HIGH (y=5 at x=388 col24 — apex far
  above ground y=180, higher than a ground jump's ~127px apex, so a bounce added height —
  likely a koopa stomp or the col-20 koopa), then DESCENDS the whole strip col25-29 in the
  air (y=9@x408, y=69@x447, y=122@x467, y=176@x487) and touches down at x~487 —
  already INSIDE pit 2 ([30,40] starts x=480). The pit rule
  `if (m.onGround && !groundAt(frontCol+1)) wantJump` requires onGround AT the edge;
  there is no ground left to jump from. Mid-air, nothing fires, he falls, dies.
- Control run: gotoLevel(1) fresh (slow entry, no fire) — the autopilot CLEANS 1-3 to the
  col-174 flag and then dies later at col 33 of 1-4 (x=526 = inside the c=31 firebar's
  circle). So athletic-pit competence is entry-phase-dependent, and 1-4 firebars are a
  second proven blocker once pit 2 is passed.

Fix direction for next session (what this session ruled out/learned):
1) Edge-jump-on-ground alone can never fix pit 2: the lethal state is airborne-descent
   whose landing point is past the edge. Add a LANDING PREDICTION to the autopilot:
   while !onGround && vy>0, integrate (x+vx*t, y+vy*t+.5*g*t*t) to the first surface
   crossing; if the touch column has no ground (or is within ~1 tile before an edge),
   the landing is doomed — today that's unfixable in air, so the fix must be UPSTREAM:
   when approaching a pit edge while another pit follows within one jump (~16 tiles),
   shorten the hop (smaller jumpHold / walk-tap, or jump earlier onto the platform chain)
   so the ride lands ON [21,23,8]/[24,24,10] and continues platform-to-platform.
2) Enemy-bounce height is a real variance source (fire Mario enters pit 1 hot). The
   small-Mario control path clears pit chain 1 fine; consider suppressing stomps near
   pit-entrance columns (jump over, not onto) when the next pit is inside one jump.
3) 1-4 c=31 firebar: needs a timing gate (phase read via bars-like hook or a phase model),
   out of scope until 2 lands.
Gates to extend afterwards: autopilotcheck 1-3 leg (pit2 + flag), widen canWatch() to
levelIndex<=1, nightly flagpole-release proof (#2062 item 3).

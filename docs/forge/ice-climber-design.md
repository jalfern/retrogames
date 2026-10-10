# ICE CLIMBER CO-OP — design note (#70)

Issue muscle: **mutable tilemap + second simultaneous input path.**

Two climbers bore a frozen mountain from the inside. Hold UP under the ice and
punch a shaft straight up — the tilemap IS the level and every punch edits it
permanently. Hop the one-way snow shelves, dodge the condor that patrols the
summit shelf, grab the carrot, clear the mountain. Co-op is the muscle, not the
skin: on summit 3 the carrot shelf sits three cells above the highest single
jump (2.1), so the only way up is one climber standing still in the shaft while
the other jumps onto their head and jumps again (1.5 + 2.1 ≥ 3). A condor touch
downs a climber (shared lives); the partner must walk back and touch them to
revive — alone, summit 3 is impossible.

Physics (pure Node sim, no RNG, y-down cell units): gravity + one jump (rise
≈2.1 cells), climb only while UP is held and the column is climbable (ICE above
the head — punched on a timer — or ICE shoulder-flanks in the shaft), one-way
snow PLATs, ROCK/ICE block sideways, PLAT never blocks up or sideways.
Support = solid tile OR the partner's head-band (the shoulder rule).

Mountains are CARVED (`levels.js`): a floor, an air corridor under a solid ICE
massif, a shaft bored straight up through it, a PLAT shelf at the massif top, a
rock cap. L1 teaches the bore; L2 adds the condor patrol band across the shelf
(the route waits for the far side, then dashes); L3 adds the carrot shelf one
stack-jump too high.

Harness (`scripts/icecheck.mjs`, Node, no browser): a constructive closed-loop
planner drives the REAL `step()` with per-tick two-player input vectors — the
attract demo and PROGNOSIS run the same code. It proves:
- every mountain winnable with hazards live;
- `dig` and `shoulder` LOAD-BEARING: silence ice-dig or shoulder support and
  the solver must LOSE (the issue's two muscles, made unfakeable);
- revive load-bearing (a downed climber on summit 3 is an honest loss);
- determinism (hash matches replay; one flipped input tick must change it);
- the SLACK rule: one fewer life than the run consumes — still winnable.

Second input path: P1 = Arrows + Space (the existing pad), P2 = W/A/D + F;
`VirtualControls` grows an optional `secondPad` prop (default off — no other
game changes), and `iceplay` proves both paths move simultaneously in a real
tab with real CDP key events.

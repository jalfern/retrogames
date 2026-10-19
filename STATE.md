# STATE — 2026-10-19 (forge: SMASH TV co-op #496)

## This session (forge lane)
- **Goal:** #496 SMASH TV two-player co-op (aim stick per pad, seat 2 as a
  player slot, smashcheck replays a 2P run from seed + per-player pad streams).
  Branch `forge-smashtv-coop`, PR to main. Live proof at
  https://jalfern.com/retrogames/smash-tv after merge.
- **Input spine:** `onePad.js` grew the aim stick — `ax/ay` analog +
  `aimUp/Down/Left/Right` digital (quantized by the same DIR_DEAD), `AIM_FIELDS`,
  `setAimVec`/`setAimVecSlot`; `gamepadMap.js` maps pad right-stick (axes 2,3)
  into slot fields incl. hysteresis; `GamepadBridge.jsx` feeds pad-1 aim +
  slot-N aim. vpadcheck 549 unchanged-green + new aim assertions.
- **Sim:** `makeSeat()`; `makeGame(seed, {players})`; `step(gs, inp, inp2)`
  dual-seat ladder (per-seat freeze/respawn/out, shared pause only when all
  down). Two banks (kills pay `pi`), ONE shared POWER meter, either hero opens
  the exit, `end='over'` only when both seats are out. `stateHash` appends P2
  fields ONLY when co-op — every solo hash byte-identical (seed 0 pilot hash
  `4ea5753c` verified against origin/main).
- **Autopilot:** `decide(gs, pi)` + `decidePad(gs, pi)` (partner speaks pads
  only → `padToInp`); `planCoop(seed)` wins 7/9 seeds (1, 8 stall at 60k cap —
  logged honestly on #496). Solo `plan` untouched, 9/9 + slack rule.
- **Shell:** attract seat pick (C=cpu, P=human, pad-2 auto-joins, model =
  `step([p1,p2])`); P2 keys WASD + numpad 8-way aim + Numpad0 fire +
  RightShift bomb; 2UP HUD; green-visior P2 sprite (art PLAYER_PAL);
  contract `players: 2`, `method: 'stick'`, reads include aim fields.
- **Proofs:** smashcheck 313 PASS / 324 `--mutate` — 10 mutants, all die
  (two new: p2-credit-to-seat-1, both-out-never-ends; re-anchored the
  lethality mutant to the new killPlayer line). Co-op section grades dual
  banks, shared meter, exit, both-out, 7/9 wins, pad-stream replay
  hash-for-hash. smashplay 19/19 (seat opens, CPU partner travels ~41px,
  `step([p1,p2])` = one tick, seat 2 independent). contractcheck smash-tv
  15/15 incl. two new co-op lines (other games' checks byte-identical).
  lint:smash + build green.
- **Harness lesson:** a FAIL that says "impossible" was my own check reading
  `g.after.hashShift` when the flag lives on `g` — dumping the full objects
  into the failure message found it in one run (rule 8).

## Held / open (unchanged unless noted)
- **#493** `building` — CORKSCOMB DUNES (out-run), clean resume via claim
  comment; #496's polish items will follow its own issue.
- **#491** closed; **#500** pin landed. **#391** `stalled` awaiting Jon.
  **#375** Civ parked. **#443** idle-builder borrow-gate.
- game-queue after #496: check board — https://jalfern.com/retrogames/forge.
- QA lane ran on :5173 all session; forge dev was :5174 (killed at ship).

## Three questions for Jon
1. Co-op seed coverage: partner autopilot wins 7/9 seeds; smashcheck pins the
   bar at 4. Want the 2 stall seeds (1, 8) chased with dodge-tuning, or is
   7/9 + the human partner enough headroom?
2. Should VIRTUAL pad users get a co-op route (a share-seat button that hands
   the on-screen pad to seat 2), or is co-op desktop/pads only, per your
   "no second on-screen touchpad" ruling?
3. SMASH TV's PauseOverlay rules screen still reads single-player — quick
   copy pass in the polish issue, or fold it into the next smash PR?

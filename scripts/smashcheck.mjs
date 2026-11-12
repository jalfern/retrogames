// smashcheck — SMASH TV in plain Node, no browser.
//   geometry  : exits sit on free border cells; start, spawns and crates are
//               off-wall and reachable from the start; bonus rooms carry civs.
//   rules     : exits sealed until the room dies, open after and walk-through
//               advances; ONE HIT KILLS (bullet, contact, grenade) and lives run
//               out into game over; spawn-invulnerability is the only mercy;
//               crates shatter in 2 hits and drop their gun; touching it swaps;
//               LASER burns POWER and refuses when broke; FIREBOMB costs 34,
//               kills every non-boss enemy and pays them; the bonus timer opens
//               the exits; killing THE ANNOUNCER wins.
//   ledger    : final score == sum of scored events, pilot replay included.
//   pilot     : all 9 seeds 0-8 win the nine-room show since #2007 — the wide
//               boards plus the DIRECTED stall-break (slide until the goal opens;
//               growing sweep while it doesn't) rescued every stall and the old
//               seed-3 forced loss. Deathless on seeds 1 and 7, pinned below.
//   slack     : seed 1 still wins with one fewer crate per room and zero
//               energy cells.
//   varisize (#1973, #2007, #2024): every room of the show — THE ANNOUNCER's
//               finale included — boards 24 cells (wider than the screen) with
//               mirrored architecture and a middle-column spawn; the host opens
//               centre-stage and is ALWAYS on camera: his screen position never
//               breaks the frame at any tick; the right door rides the far
//               border; the hero and his shots cross the old screen line and
//               the far door takes the show onward; the renderer carries the
//               camera.
//   determinism : same seed twice -> identical digest.
//   pose (#1945): the over-the-shoulder carriage — mounts behind the body plane
//               on the shoulder line, muzzles past centre in all eight aims,
//               per-weapon silhouette, recoil that snaps, decays and never
//               phantom-kicks; chrome pauldrons in every seat palette; #1950
//               gun language at phone scale — shell shake on the heavies, hot
//               barrel on report, mount glint on swap, a 2px diagonal spread
//               floor off the head column, pauldrons riding the gait.
//   co-op (#496): two seats one arena — per-seat banks (kills pay the
//               shooter), ONE shared POWER meter, either hero opens the exit,
//               game over only when both seats burn their last life, the co-op
//               autopilot (partner pads only) clears the show, and the whole 2P
//               run replays from seed + per-player pad streams hash-for-hash;
//               the aim stick rides THE one pad (ax/ay + digital fold).
//   specials (#2032): HEAT-SEEKER and FLAMER complete the ladder — the table,
//               bonus-room-only drops, bounded-turn missile guidance with blast
//               and fizzle, the flamer's three-pellet fan and ~45 px reach cap,
//               and the seat-law that keeps the autopilot out of the fire.
//   polish (#1978): the uniform pan (≤1 px/frame, snap past CAM_SNAP), the
//               cross-screen door confirm distance and voice, off-screen marker
//               side-mapping in the game's own colours, and the combo pop's
//               clear band below the border door row.
// `-- --mutate` re-plants fixed bugs in child processes; each MUST die.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { plant, pull } from './lib/mutateguard.mjs'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const { GW, GW_BIG, BIG_ROOMS, GH, CW, CELL, EXITS, exitsOf, TOTAL_ROOMS, genRoom, START, startColOf, roomGw, isBonus, ENEMIES, WEAPONS } = await import('../src/games/SmashTV/levels.js')
const { wallCell, NEON_TOP, CHROME, borderRivet } = await import('../src/games/SmashTV/walls.js')
const { playerFrame, GUN, LAYERS, PLAYER_FRAMES, CARRIAGE, POSE, STOCK, SPREAD_FLOOR, gunPose } = await import('../src/games/SmashTV/sprite.js')
const { ENEMY_FRAMES, TELEGRAPH, CHARGERS, CHARGE, OUTLINE, enemyFrame, bossMouth, BOSS_MOUTH_FLAP, ADD_TELEGRAPH, BOSS_DEATH_T } = await import('../src/games/SmashTV/enemies.js')
const { muzzleFlash, casingCol, killShake, KILL_SHAKE, SHUTTER_TICKS, shutterPhase, roomScore, recoilKick, RECOIL_TICKS, RECOIL_PX, SHELL_KICK, shellKick, barrelHot, HOT_FLOOR, GLINT_TICKS, glintPhase, goreSet, GORE_TICKS, GORE_GRAV, STAIN_TICKS, stainRadius, camPan, CAM_PAN, CAM_SNAP, FAR_EXIT_PX, farExitPx, SHUTTER_CONFIRM, MARK, markSide } = await import('../src/games/SmashTV/juice.js')
const { PLAYER_PAL, PAULDRON_BOB } = await import('../src/games/SmashTV/art.js')
const { FIRE, fireTimbre, BONUS_JINGLE, MURMUR, MURMUR_TICKS, WHOOSH, ALERT, ALERT_RADIUS, ALERT_CD } = await import('../src/games/SmashTV/audio.js')
const { BAR, PIP, POWER_LABEL, labelClearsBar, pipFits, bombReady, RACK_FLASH, hiRoll, respawnState, RESPAWN_BLINK_SHIFT } = await import('../src/games/SmashTV/hud.js')
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) }

async function fresh() {
    const sim = await import(`../src/games/SmashTV/sim.js?c=${Date.now()}`)
    const planner = await import(`../src/games/SmashTV/planner.js?c=${Date.now()}`)
    return { ...sim, plan: planner.plan, planCoop: planner.planCoop, padToInp: planner.padToInp, inpToPad: planner.inpToPad, decidePad: planner.decidePad }
}
const S = await fresh()
const { makeGame, step, stateHash, CFG, comboColor, flickerPhase, COMBO_COLORS, MISSILE_TURN, MISSILE_LIFE, MISSILE_BLAST, FLAME_LIFE, FLAME_FAN, FLAME_SLOW } = S
const cx = (c) => c * 16 + 8
const cy = (r) => 24 + r * 16 + 8

// ---------------------------------------------------------------- geometry ----
console.log('geometry')
for (let idx = 0; idx < TOTAL_ROOMS; idx++) {
    const room = genRoom(0, idx)
    const gw = room.gw
    const bad = room.walls.filter(([c, r]) => c < 1 || r < 1 || c >= gw - 1 || r >= GH - 1)
    ok(bad.length === 0, `room ${idx + 1}: patterns stay off the border`)
    const blocked = new Set(room.walls.map(([c, r]) => `${c},${r}`))
    const exits = exitsOf(gw)
    for (const e of exits) ok(!blocked.has(`${e.c},${e.r}`), `room ${idx + 1}: exit ${e.side} is free`)
    const seen = new Set()
    const q = [[START.r, startColOf(gw)]]
    while (q.length) {
        const [r, c] = q.pop()
        const k = `${c},${r}`
        if (seen.has(k) || blocked.has(k) || c < 0 || r < 0 || c >= gw || r >= GH) continue
        seen.add(k)
        q.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1])
    }
    for (const s of room.spawns) ok(seen.has(`${s.c},${s.r}`), `room ${idx + 1}: ${s.kind} reachable`)
    for (const k of room.crates) ok(seen.has(`${k.c},${k.r}`), `room ${idx + 1}: crate reachable`)
    for (const e of exits) ok(seen.has(`${e.c},${e.r}`), `room ${idx + 1}: exit ${e.side} walkable`)
    if (isBonus(idx)) ok(room.civilians > 0 && room.bonusTime > 0, `room ${idx + 1}: bonus room has contestants and a clock`)
}

// ------------------------------------------------------------------- walls ----
console.log('walls')
{
    const a = wallCell(0, 0, NEON_TOP[0])
    const b = wallCell(1, 0, NEON_TOP[0])
    ok(a.base !== b.base, 'interior cells are two-tone (neighbours differ)', `${a.base} vs ${b.base}`)
    ok(wallCell(0, 0, NEON_TOP[0]).base !== wallCell(0, 1, NEON_TOP[0]).base, 'the checkerboard alternates both ways')
    ok(a.neon === NEON_TOP[0], 'each cell carries its room neon top edge')
    ok(lum(a.mortar) < lum(a.base) && lum(a.mortar) < lum(b.base), 'mortar seams sit darker than both chrome tones', `mortar ${a.mortar}`)
    ok(lum(NEON_TOP[0]) > lum(CHROME.baseA), 'the neon top edge reads brighter than the chrome', NEON_TOP[0])
    ok(NEON_TOP.length === TOTAL_ROOMS, 'one neon top edge per arena', `${NEON_TOP.length} vs ${TOTAL_ROOMS}`)
    ok(new Set(NEON_TOP).size >= 5, 'the arenas are tinted differently', `${new Set(NEON_TOP).size} distinct`)
    ok(lum(borderRivet.hi) > lum(borderRivet.body), 'border rivets catch a highlight', `${borderRivet.body} -> ${borderRivet.hi}`)
    ok(lum(a.rivetHi) > lum(a.rivet), 'cell rivets catch a highlight')
}

// ----------------------------------------------------------------- player ----
console.log('player')
{
    const frames = [0, 6, 12, 18].map((w) => playerFrame(w, true))
    ok(new Set(frames).size === PLAYER_FRAMES && PLAYER_FRAMES === 4, 'the run cycle runs four distinct frames', frames.join(','))
    ok(playerFrame(24, true) === playerFrame(0, true), 'the cycle wraps, not stairs')
    ok(playerFrame(999, false) === 0, 'a resting contestant holds the neutral frame')
    ok(GUN.twin.off.length === 2 && GUN.twin.off[0] < 0 && GUN.twin.off[0] === -GUN.twin.off[1], 'twin is two barrels flanking the aim line', JSON.stringify(GUN.twin.off))
    ok(['gun', 'spread', 'laser'].every((w) => GUN[w].off.length === 1), 'the other weapons carry a single barrel')
    const sig = Object.values(GUN).map((g) => `${g.off.length}|${g.len}|${g.w}`)
    ok(new Set(sig).size === Object.keys(GUN).length && Object.keys(GUN).length === 6, 'every weapon reads as its own silhouette', sig.join(' '))
    ok(Object.values(GUN).every((g) => g.flash > g.len), 'the muzzle flash blooms beyond the muzzle')
    ok(new Set(Object.values(GUN).map((g) => g.tip)).size === 6, 'each weapon has its own muzzle colour')
    ok(LAYERS.indexOf('feet') < LAYERS.indexOf('gun') && LAYERS.indexOf('body') < LAYERS.indexOf('gun'), 'feet and body render under the gun layer', LAYERS.join('>'))
}

// ------------------------------------------------------------------- pose ----
// the over-the-shoulder carriage (#1945): every gun mounts behind the body
// plane on the shoulder line, projects its muzzle past centre, keeps its own
// silhouette in all eight aims, and recoils with a kick that dies out cleanly.
console.log('pose')
{
    const AIM = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]
        .map(([x, y]) => { const L = Math.hypot(x, y); return [x / L, y / L] })
    ok(CARRIAGE.back >= POSE.mountBack && CARRIAGE.rise >= 2, 'the carriage mounts behind the plane, on the shoulder line', JSON.stringify(CARRIAGE))
    for (const w of Object.keys(GUN)) {
        for (const [ax, ay] of AIM) {
            const bars = gunPose(w, [ax, ay], 0, 100, 100)
            // the shoulder anchor: where the cabinet camera plants the carriage.
            // the rise is the height cue; behind-ness and reach measure against it.
            const anch = { x: 100, y: 100 - CARRIAGE.rise }
            const along = (pt) => (pt.x - anch.x) * ax + (pt.y - anch.y) * ay
            ok(bars.length === GUN[w].off.length, `${w} carries ${GUN[w].off.length} barrel(s) aimed ${ax},${ay}`)
            for (const b of bars) {
                ok(along(b.base) <= -POSE.mountBack + 1e-9, `${w}: mount sits behind the shoulder plane (${along(b.base).toFixed(1)})`)
                ok(along(b.muz) >= POSE.muzzlePast, `${w}: muzzle projects past the shoulder (${along(b.muz).toFixed(1)})`)
                ok(along(b.stock) < along(b.base), `${w}: stock trails the mount`)
                ok(along(b.flash) > along(b.muz), `${w}: flash blooms past the muzzle`)
            }
        }
        const sig = GUN[w]
        ok(sig.flash > sig.len, `${w}: flash spec is past the muzzle`)
        ok(sig.stock > 0, `${w}: carriage has a stock`)
    }
    {
        const bars = gunPose('twin', [0, -1])
        const perp = (pt) => -pt.x * -1 + pt.y * 0
        ok(bars.length === 2 && Math.abs(perp(bars[0].base) - perp(bars[1].base) - (GUN.twin.off[0] - GUN.twin.off[1])) < 1e-9, 'twin keeps its shoulder spread — one gun over each shoulder')
        ok(gunPose('gun', [1, 0])[0].perp > 0, 'the machine gun rides the right shoulder')
    }
    ok(recoilKick(0) === RECOIL_PX && recoilKick(RECOIL_TICKS) === 0, 'recoil snaps on report and dies out', `${recoilKick(0)}->${recoilKick(RECOIL_TICKS)}`)
    ok(Array.from({ length: RECOIL_TICKS }, (_, s) => recoilKick(s) >= recoilKick(s + 1)).every(Boolean), 'recoil decays monotonically')
    ok(RECOIL_TICKS <= Math.min(...Object.values(WEAPONS).map((w) => w.interval)), 'the kick is gone before the tightest fire interval')
    ok(recoilKick(Math.min(...Object.values(WEAPONS).map((w) => w.interval))) === 0, 'an armed but un-fired gun never phantom-kicks')
    for (const w of Object.keys(GUN)) {
        const a = [0, -1]
        const still = gunPose(w, a, 0, 100, 100)[0]
        const kicked = gunPose(w, a, RECOIL_PX, 100, 100)[0]
        const walk = (p, q) => (q.x - p.x) * a[0] + (q.y - p.y) * a[1]
        ok(Math.abs(walk(still.base, kicked.base) + RECOIL_PX) < 1e-9 && Math.abs(walk(still.muz, kicked.muz) + RECOIL_PX) < 1e-9, `${w}: recoil walks the whole carriage back ${RECOIL_PX}px`)
    }
    ok(PLAYER_PAL.every((p) => p.pauld && p.shine && p.pauld !== p.jersey), 'every seat palette caps its shoulders in chrome pauldrons')
    ok(STOCK.col !== GUN.twin.col, 'the stock reads apart from the barrels')

    // #1950 — the gun language at phone scale: shell shake, hot barrel, swap
    // glint, diagonal spread floor, pauldron bob
    ok(shellKick('gun') > 0 && shellKick('laser') > 0, 'the heavy iron shakes the shell where the carriage kick vanishes', JSON.stringify(SHELL_KICK))
    ok(shellKick('twin') === 0, 'the twin is too light and too fast to rattle the cabinet')
    ok(shellKick('spread') > 0 && shellKick('spread') < shellKick('gun'), 'the spread twitches, lighter than the MG')
    ok(Object.values(SHELL_KICK).every((v) => v <= KILL_SHAKE.kill), 'a shell kick never out-jolts an ordinary kill')
    ok(barrelHot(RECOIL_PX) && !barrelHot(HOT_FLOOR - 0.1) && !barrelHot(0), 'the barrel reports hot and cools within the recoil decay')
    ok(!barrelHot(recoilKick(RECOIL_TICKS - 1)), 'the barrel is cold again before the kick is over')
    ok(GLINT_TICKS >= 6 && glintPhase(GLINT_TICKS) === 1 && glintPhase(0) === 0 && glintPhase(-4) === 0 && glintPhase(GLINT_TICKS + 4) === 1, 'the mount glint flashes on swap and fades to nothing')
    {
        ok(SPREAD_FLOOR === 2, 'the diagonal spread floor is pinned at 2px')
        const d = Math.SQRT1_2
        for (const [ax, ay] of [[d, -d], [-d, -d], [d, d], [-d, d]]) {
            const bars = gunPose('twin', [ax, ay], 0, 100, 100)
            const h = bars.map((b) => b.base.x - 100)
            ok(Math.min(Math.abs(h[0]), Math.abs(h[1])) >= 2 - 1e-9 && Math.sign(h[0]) !== Math.sign(h[1]),
                'diagonal aim keeps both barrels >=2px off the head column', h.map((v) => v.toFixed(2)).join('/'))
        }
        const up = gunPose('twin', [0, -1], 0, 100, 100).map((b) => b.base.x - 100)
        ok(Math.abs(up[0] - GUN.twin.off[0]) < 1e-9 && Math.abs(up[1] - GUN.twin.off[1]) < 1e-9, 'cardinal geometry is byte-identical — the floor only bites at diagonals', up.join('/'))
        const flat = gunPose('twin', [1, 0], 0, 100, 100)
        ok(Math.abs(flat[0].base.x - flat[1].base.x) < 1e-9 && Math.abs(flat[0].base.y - flat[1].base.y - (GUN.twin.off[0] - GUN.twin.off[1])) < 1e-9, 'flat aims keep their vertical stack — the floor ignores them')
    }
    ok(PAULDRON_BOB.length === PLAYER_FRAMES && PAULDRON_BOB[0] === 0 && PAULDRON_BOB[2] === 0 && PAULDRON_BOB[1] === -1 && PAULDRON_BOB[3] === -1,
        'pauldrons ride the gait — lifted on the plant, seated on push-off, still at rest', JSON.stringify(PAULDRON_BOB))
}

// --------------------------------------------------------------- enemies ----
console.log('enemies')
{
    for (const kind of ['walkcam', 'runner']) {
        const frames = [0, 6, 12, 18].map((w) => enemyFrame({ kind, walk: w, moving: true }, 0))
        ok(new Set(frames).size === ENEMY_FRAMES && ENEMY_FRAMES === 4, `${kind} runs four distinct frames`, frames.join(','))
        ok(enemyFrame({ kind, walk: 24, moving: true }, 0) === 0, `${kind} cycle wraps, not stairs`)
        ok(enemyFrame({ kind, walk: 0, moving: false }, 0) === 0, `a resting ${kind} holds the neutral frame`)
    }
    ok(CHARGERS.turret && CHARGERS.heavy && Object.keys(CHARGERS).length === 2, 'turrets and heavies are the kinds that must charge')
    ok(TELEGRAPH === 20, 'the charge runs 20 ticks — the cabinet telegraphs everything', `${TELEGRAPH}`)
    const rims = Object.values(OUTLINE)
    ok(new Set(rims).size === 6, 'every enemy kind wears its own outline', rims.join(' '))
    ok(rims.every((c) => lum(c) > lum('#15151f')), 'outlines read brighter than the studio floor')
    ok(Object.keys(CHARGE).every((k) => CHARGE[k].len > 0 && lum(CHARGE[k].glow) > lum('#15151f')), 'the charge barrel glows brighter than the floor')
}
// the telegraph: charge, track the player, then commit along the tracked aim
{
    const mk = (kind, x, y) => ({ id: 9100, kind, x, y, hp: ENEMIES[kind].hp, cd: TELEGRAPH + 1, wanderT: 999, wdx: 0, wdy: 0, hitT: 0, dir: 1, walk: 0, moving: false, chg: 0, aim: [0, 0] })
    for (const kind of ['turret', 'heavy']) {
        const gs = makeGame(0)
        gs.enemies = []
        gs.roomData.spawns = []
        gs.spawnT = 0
        gs.enemies.push(mk(kind, 40, 60))
        gs.player.x = 140; gs.player.y = 60
        gs.player.invuln = 99999
        let sawCharge = false, gap = 0
        for (let i = 0; i < 50; i++) {
            gs.events.length = 0
            step(gs, {})
            if (gs.events.some((ev) => ev.type === 'charge')) { sawCharge = true; gap = 0 }
            else if (sawCharge) gap++
            if (gs.events.some((ev) => ev.type === 'eshoot' || ev.type === 'throw')) break
            gs.player.x += 2
        }
        ok(sawCharge, `${kind} announces the charge before firing`)
        ok(gap === TELEGRAPH, `${kind} waits exactly ${TELEGRAPH} ticks between charge and shot`, `gap ${gap}`)
        ok(gs.ebullets.length > 0 && gs.ebullets.every((b) => b.dx > 0.5 && Math.abs(b.dy) < 0.6), `${kind} commits along the tracked aim, not the spawn aim`)
    }
    // a started charge commits even if the player breaks line of sight
    {
        const gs = makeGame(0)
        gs.enemies = []
        gs.roomData.spawns = []
        gs.spawnT = 0
        gs.enemies.push(mk('turret', 40, 60))
        gs.player.x = 140; gs.player.y = 60
        gs.player.invuln = 99999
        let charged = false
        for (let i = 0; i < 50; i++) {
            gs.events.length = 0
            step(gs, {})
            if (gs.events.some((ev) => ev.type === 'charge')) { charged = true; gs.player.x = 120; gs.player.y = 128; break }
        }
        let fired = false
        for (let i = 0; i < 40; i++) {
            gs.events.length = 0
            step(gs, {})
            if (gs.events.some((ev) => ev.type === 'eshoot')) { fired = true; break }
        }
        ok(charged && fired, 'a started charge commits even if the player hides (the cameras see through)')
    }
}

// ------------------------------------------------------------------ rules ----
console.log('rules')
// exits sealed until the room falls, then walk-through advances
{
    const gs = makeGame(0)
    for (let i = 0; i < 120; i++) { step(gs, {}); gs.events.length = 0 }
    ok(!gs.cleared, 'exits stay sealed while the room has life')
    gs.enemies = []
    gs.roomData.spawns = []
    gs.spawnT = 0
    step(gs, {})
    const evC = gs.events.find((e) => e.type === 'clear')
    ok(gs.cleared && evC, 'the room falls when the last enemy dies (+bonus event)', evC ? `+${evC.pts}` : '')
    const ex = exitsOf(gs.roomData.gw)[0]
    gs.player.x = cx(ex.c); gs.player.y = cy(ex.r)
    step(gs, {})
    ok(gs.room === 1, 'walking an open exit advances the room')
    ok(gs.energy === CFG.maxEnergy, 'POWER refills on the new room')
}
// one hit kills, lives run out into game over
{
    const gs = makeGame(0)
    gs.player.invuln = 0
    gs.ebullets.push({ id: 8001, x: gs.player.x + 2, y: gs.player.y, dx: 1, dy: 0, dmg: 1, kind: 'shot' })
    step(gs, {})
    ok(gs.events.some((e) => e.type === 'death') && gs.lives === CFG.lives - 1, 'ONE bullet ends a life')
    gs.player.deadT = 0
    gs.player.invuln = 0
    gs.ebullets.push({ id: 8002, x: gs.player.x + 2, y: gs.player.y, dx: 1, dy: 0, dmg: 1, kind: 'shot' })
    step(gs, {})
    gs.player.deadT = 0; gs.player.invuln = 0
    gs.ebullets.push({ id: 8003, x: gs.player.x + 2, y: gs.player.y, dx: 1, dy: 0, dmg: 1, kind: 'shot' })
    step(gs, {})
    ok(gs.lives === 0 || gs.end === 'over', 'three bodies spend the run', `lives ${gs.lives} end ${gs.end}`)
}
// spawn invulnerability is the only mercy
{
    const gs = makeGame(0)
    ok(gs.player.invuln > 0, 'contestants spawn shielded')
    gs.ebullets.push({ id: 8101, x: gs.player.x + 2, y: gs.player.y, dx: 1, dy: 0, dmg: 1, kind: 'shot' })
    step(gs, {})
    ok(gs.lives === CFG.lives && gs.player.deadT === 0, 'a shielded player walks through fire')
}
// contact and grenades also kill
{
    const gs = makeGame(0)
    gs.player.invuln = 0
    gs.enemies.push({ id: 8201, kind: 'walkcam', x: gs.player.x + 3, y: gs.player.y, hp: 1, cd: 9999, wanderT: 999, wdx: 0, wdy: 0, hitT: 0, dir: 1 })
    step(gs, {})
    ok(gs.player.deadT > 0 || gs.end, 'a touch also ends it')
}
// crates: two hits, gun drops, touch swaps
{
    const gs = makeGame(0)
    const k = gs.crates[0]
    ok(!!k, 'room 1 hides a weapon crate')
    for (let i = 0; i < 40; i++) { gs.bullets.push({ id: 9000 + i, x: k.x, y: k.y, dx: 0, dy: 0, pierce: 0, dmg: 1, kind: 'twin' }); step(gs, {}); gs.events.length = 0; if (k.hp <= 0) break }
    ok(k.hp <= 0, 'a crate shatters under two hits')
    const drop = gs.items.find((it) => it.t === 'weapon')
    ok(!!drop && drop.w === k.weapon, 'the crate reveals its gun')
    gs.player.x = drop.x; gs.player.y = drop.y
    step(gs, {})
    ok(gs.weapon === k.weapon, `touching it swaps the gun (${gs.weapon})`)
}
// LASER burns POWER and refuses when broke
{
    const gs = makeGame(0)
    gs.weapon = 'laser'; gs.energy = 100
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 16; j++) { step(gs, { fire: true }); gs.events.length = 0 } }
    ok(gs.energy === 94, 'LASER costs 2 POWER a shot', `energy ${gs.energy}`)
    gs.energy = 1
    step(gs, { fire: true })
    ok(!gs.events.some((e) => e.type === 'shoot') && gs.energy === 1, 'a broke LASER refuses to fire')
}
// FIREBOMB: costs 34, clears the room (not the boss), pays the kills
{
    const gs = makeGame(0)
    gs.enemies = [
        { id: 8301, kind: 'walkcam', x: 40, y: 60, hp: 1, cd: 999, wanderT: 999, wdx: 0, wdy: 0, hitT: 0, dir: 1 },
        { id: 8302, kind: 'turret', x: 200, y: 60, hp: 2, cd: 999, wanderT: 999, wdx: 0, wdy: 0, hitT: 0, dir: 1 },
    ]
    gs.ebullets.push({ id: 8303, x: 100, y: 100, dx: 1, dy: 0, dmg: 1, kind: 'shot' })
    const s0 = gs.score
    step(gs, { bomb: true })
    ok(gs.energy === CFG.maxEnergy - CFG.firebombCost, 'the firebomb takes 34 POWER')
    ok(gs.enemies.length === 0 && gs.ebullets.length === 0, 'the firebomb sweeps the studio')
    ok(gs.score - s0 === 50 + 150, 'firebomb kills still pay', `+${gs.score - s0}`)
    const bk = gs.events.filter((e) => e.type === 'kill')
    ok(bk.length === 2 && bk.every((k) => Number.isFinite(k.pts)), 'firebomb kills carry their pts for the popup', bk.map((k) => k.pts).join(' '))
    gs.energy = 10
    step(gs, { bomb: true })
    ok(gs.events.some((e) => e.type === 'bombFail') && gs.energy === 10, 'not enough POWER, not enough boom')
}
// bonus: timer runs the clock even if you hold your fire; exits then open
{
    const r = S.plan(0)
    const gs = makeGame(0)
    let inBonus = false
    for (const inp of r.script) {
        step(gs, inp); gs.events.length = 0
        if (gs.room === 3 && gs.roomData.bonus) { inBonus = true; break }
    }
    ok(inBonus, 'room 4 is the blood bonus')
    ok(gs.civilians.length > 0, 'contestants fill the bonus floor')
    let t = 0
    while (!gs.cleared && t++ < 700) { step(gs, {}); gs.events.length = 0 }
    ok(gs.cleared && gs.bonusT <= 0, 'the bonus clock opening the exits is mercy enough')
}
// combo pays more as it climbs
{
    const r = S.plan(0)
    const gs = makeGame(0)
    const civKills = []
    for (const inp of r.script) {
        step(gs, inp)
        for (const e of gs.events) if (e.type === 'civKill') civKills.push(e)
        gs.events.length = 0
    }
    const best = civKills.reduce((m, e) => Math.max(m, e.combo), 0)
    ok(civKills.length >= 2 && best >= 2, 'the bonus chains a combo', `${civKills.length} hits, best x${best}`)
    const pay = civKills.find((e) => e.combo >= 2)
    ok(!pay || pay.pts >= 150, 'combo kills pay the escalation', pay && `${pay.pts}`)
}
// THE ANNOUNCER: killing him ends the show
{
    const r = S.plan(0)
    const gs = makeGame(0)
    for (const inp of r.script) { step(gs, inp); gs.events.length = 0; if (gs.end) break }
    ok(gs.end === 'win' && gs.room === TOTAL_ROOMS - 1, 'the pilot beats the ANNOUNCER in room 9')
}

// --------------------------------------------------------- bonus theatre ----
console.log('bonus theatre')
{
    // the combo board climbs the warm end of the spectrum as the streak grows
    const seq = [1, 2, 3, 4, 5, 6].map(comboColor)
    ok(seq[0] === COMBO_COLORS[0] && new Set(seq.slice(0, 4)).size >= 3, 'the BONUS combo escalates colour with the streak', seq.join(' '))
    ok(comboColor(99) === COMBO_COLORS[COMBO_COLORS.length - 1], 'the combo colour holds at the hottest tier', comboColor(99))
    // the house lights hold for nine of the ten seconds, then hunt for a blackout
    ok(flickerPhase(600, 600) < 0.1, 'the studio lights hold steady at the start of the bonus', `${flickerPhase(600, 600)}`)
    ok(flickerPhase(90, 600) > flickerPhase(600, 600), 'the flicker sharpens as the clock runs low', `${flickerPhase(90, 600)}`)
    let inRange = true, drama = false
    for (let t = 0; t <= 600; t++) { const ph = flickerPhase(t, 600); if (ph < 0 || ph > 1) inRange = false; if (t <= 180 && ph > 0.3) drama = true }
    ok(inRange, 'the flicker phase stays within 0..1')
    ok(drama, 'the lights dip in the final three seconds')
}
// civilians break into random sprints (with a scream) with no player threat near
{
    const r = S.plan(0)
    const gs = makeGame(0)
    let inBonus = false, screams = 0, sawSprint = false
    for (const inp of r.script) {
        step(gs, inp)
        for (const e of gs.events) if (e.type === 'scream') screams++
        if (gs.room === 3 && gs.roomData.bonus) inBonus = true
        for (const v of gs.civilians) if (v.sprintT > 0) sawSprint = true
        gs.events.length = 0
    }
    ok(inBonus, 'the pilot reaches a bonus room')
    ok(sawSprint, 'a contestant breaks into a random sprint')
    ok(screams > 0, 'the sprints carry a scream', `screams=${screams}`)
}

// ------------------------------------------------------------ announcer ----
console.log('announcer')
// the mouth flaps for BOSS_MOUTH_FLAP ticks straight after each shot (rides the
// fire cadence: a shot resets the reload clock cd to maxCd)
{
    const max = ENEMIES.boss.cd
    ok(BOSS_MOUTH_FLAP === 12, 'the mouth flap window is pinned', `${BOSS_MOUTH_FLAP}`)
    ok(bossMouth(max, max), 'the mouth is open the tick the announcer fires')
    ok(bossMouth(max - BOSS_MOUTH_FLAP + 1, max), 'the mouth holds open through the flap window')
    ok(!bossMouth(max - BOSS_MOUTH_FLAP, max), 'the mouth snaps shut once the flap runs out')
    ok(!bossMouth(Math.floor(max / 2), max), 'the mouth is shut mid-reload')
}
// his adds materialize under a ring: each one the boss throws out carries a born tick
{
    const r = S.plan(0)
    const gs = makeGame(0)
    for (const inp of r.script) { step(gs, inp); gs.events.length = 0; if (gs.enemies.some((e) => e.kind === 'boss')) break }
    const boss = gs.enemies.find((e) => e.kind === 'boss')
    ok(!!boss, 'the pilot reaches THE ANNOUNCER')
    gs.enemies = [boss]; gs.roomData.spawns = []; gs.spawnT = 0
    boss.spawnT = 1; gs.player.invuln = 99999
    const before = gs.enemies.length
    step(gs, {}); gs.events.length = 0
    const add = gs.enemies.find((e) => e.kind !== 'boss' && e.born !== undefined)
    ok(ADD_TELEGRAPH > 0, 'the add materialization ring has a window', `${ADD_TELEGRAPH}`)
    ok(!!add && add.born === gs.tick, 'the announcer tags each add with a born tick', add ? `born=${add.born} tick=${gs.tick}` : 'no add')
    ok(gs.enemies.length === before + 1, 'the tagged add is the one the boss threw out', `${before} -> ${gs.enemies.length}`)
}
// #2024 host law — THE ANNOUNCER is always on camera. His studio now boards
// wide with the whole show, but the finale reads BETTER: he opens centre-stage
// and paces the middle of the live camera window (the same cast midpoint the
// renderer pans to), so his 40px crown never breaks the frame — proven across
// a sliding shot that walks the camera to both clamp edges.
{
    const camOf = (g) => {
        const bw = g.roomData.gw * CELL
        const live = g.players.filter((q) => q.deadT === 0 && !q.out)
        const mid = live.length ? live.reduce((s, q) => s + q.x, 0) / live.length : bw / 2
        return Math.max(0, Math.min(Math.round(mid - CW / 2), bw - CW))
    }
    const r = S.plan(0)
    const gs = makeGame(0)
    // climb the room ladder into the finale (fall each room, take the up door)
    for (let target = 1; target <= TOTAL_ROOMS - 1; target++) {
        gs.enemies = []; gs.roomData.spawns = []; gs.spawnT = 0; gs.bonusT = 0
        step(gs, {}); gs.events.length = 0
        gs.player.x = cx(Math.floor(gs.roomData.gw / 2)); gs.player.y = 24 + 8
        step(gs, {}); gs.events.length = 0
        if (gs.room !== target) break
    }
    ok(gs.room === TOTAL_ROOMS - 1 && gs.roomData.gw === GW_BIG, 'the finale boards wide (#2024)', `room ${gs.room + 1} gw ${gs.roomData.gw}`)
    const hostCell = genRoom(0, TOTAL_ROOMS - 1).spawns[0]
    ok(hostCell.kind === 'boss' && hostCell.c === GW_BIG / 2 && hostCell.r === 2, 'the host opens centre-stage', JSON.stringify(hostCell))
    gs.player.invuln = 1e9
    let bossSeen = 0, framed = true, bad = null, camMax = 0
    for (let i = 0; i < 1200; i++) {
        gs.player.invuln = 1e9
        step(gs, i < 600 ? { mx: 1, my: 0 } : { mx: -1, my: 0 })
        gs.events.length = 0
        const boss = gs.enemies.find((e) => e.kind === 'boss')
        if (!boss) continue
        bossSeen++
        camMax = Math.max(camMax, camOf(gs))
        const sx = boss.x - camOf(gs)
        if (sx < 28 || sx > CW - 28) { framed = false; bad = `sx=${sx.toFixed(0)} cam=${camOf(gs)} x=${boss.x.toFixed(0)} @${i}`; break }
    }
    ok(bossSeen > 400, 'the host paced for hundreds of ticks', `${bossSeen}`)
    ok(camMax >= 100, 'the shot really slid while he paced', `camX up to ${camMax}`)
    ok(framed, 'the host is on camera every tick — the crown never breaks the frame', bad || 'all framed')
}
// he dies to a multi-explosion while the arena holds: the WIN banner waits out the sequence
{
    const r = S.plan(0)
    const gs = makeGame(0)
    for (const inp of r.script) { step(gs, inp); gs.events.length = 0; if (gs.enemies.some((e) => e.kind === 'boss')) break }
    const boss = gs.enemies.find((e) => e.kind === 'boss')
    gs.enemies = [boss]; gs.roomData.spawns = []; gs.spawnT = 0
    boss.spawnT = 9999; boss.hp = 1; gs.player.invuln = 99999
    gs.bullets.push({ id: 9900, x: boss.x, y: boss.y, dx: 0, dy: 0, pierce: 0, dmg: 1, kind: 'twin' })
    for (let i = 0; i < 5; i++) { gs.events.length = 0; step(gs, {}); if (gs.events.some((ev) => ev.type === 'bossKill')) break }
    gs.enemies = []
    ok(BOSS_DEATH_T > 0, 'the death sequence has a length', `${BOSS_DEATH_T}`)
    ok(gs.end !== 'win' && gs.bossDeath && gs.bossDeath.t > 0, 'the WIN banner waits out the death sequence', `end=${gs.end} t=${gs.bossDeath && gs.bossDeath.t}`)
    let done = 0
    while (gs.end !== 'win' && done++ < BOSS_DEATH_T + 10) step(gs, {})
    ok(gs.end === 'win', 'the show ends once the sequence runs out', `ticks=${done}`)
}

// ------------------------------------------------------------------ juice ----
console.log('juice')
{
    // per-weapon muzzle flash: each gun flashes its own tip colour, never one shared bloom
    const flashCols = Object.keys(GUN).map((w) => muzzleFlash(w).col)
    ok(new Set(flashCols).size === 6, 'every weapon flashes its own muzzle colour', flashCols.join(' '))
    ok(Object.keys(GUN).every((w) => muzzleFlash(w).col === GUN[w].tip), 'the flash rides the gun tip, not a shared white')
    ok(Object.keys(GUN).every((w) => casingCol(w) === GUN[w].tip), 'the spent casing sparks carry the gun colour')
    // kill shake: an ordinary kill jolts, a boss add hits harder, the boss rattles the cabinet
    ok(killShake('walkcam', false) === 2, 'an ordinary kill jolts the floor +2', `${killShake('walkcam', false)}`)
    ok(killShake('walkcam', true) === 6, 'a boss add lands harder +6', `${killShake('walkcam', true)}`)
    ok(killShake('boss', false) === 12, 'killing THE ANNOUNCER rattles the cabinet +12', `${killShake('boss', false)}`)
    ok(KILL_SHAKE.bossAdd > KILL_SHAKE.kill && KILL_SHAKE.boss > KILL_SHAKE.bossAdd, 'the shake escalates with the kill')
    // the exit shutter rolls open over SHUTTER_TICKS after the room falls
    ok(shutterPhase(0) === 0, 'a sealed exit starts shut', `${shutterPhase(0)}`)
    ok(shutterPhase(SHUTTER_TICKS) === 1, 'the shutter is fully open after the window', `${shutterPhase(SHUTTER_TICKS)}`)
    let mono = true
    for (let t = 0; t < SHUTTER_TICKS + 6; t++) if (shutterPhase(t + 1) < shutterPhase(t)) mono = false
    ok(mono, 'the shutter opens monotonically, never re-closing')
    ok(shutterPhase(-5) === 0 && shutterPhase(9999) === 1, 'the shutter clamps at both ends')
    // the per-room running total: score events since the last room change
    const rs = roomScore([
        { type: 'room', room: 0 }, { type: 'score', pts: 50 }, { type: 'score', pts: 150 },
        { type: 'room', room: 1 }, { type: 'score', pts: 300 },
        { type: 'kill', kind: 'runner', pts: 100 }, // a kill without a score event pays nothing
    ])
    ok(rs.room === 1 && rs.total === 300, 'the running total resets on the room change', `${rs.room}:${rs.total}`)
}
// on the real pilot run the room total at the win is the final room only, not the whole show
{
    const r = S.plan(0)
    const gs = makeGame(0)
    const all = []
    for (const inp of r.script) { step(gs, inp); for (const e of gs.events) all.push({ ...e }); gs.events.length = 0 }
    const rs = roomScore(all)
    let lastRoom = 0
    for (let i = all.length - 1; i >= 0; i--) { if (all[i].type === 'score') lastRoom += all[i].pts; else if (all[i].type === 'room') break }
    ok(rs.room === TOTAL_ROOMS - 1, 'the run ends in the final room', `${rs.room}`)
    ok(lastRoom > 0 && rs.total === lastRoom, 'the room total is the final room only, not the whole run', `${rs.total} vs ${lastRoom}`)
}

// ------------------------------------------------------------------ audio ----
console.log('audio')
{
    // per-weapon fire timbre: each gun gets its own voice
    ok(Object.keys(FIRE).length === Object.keys(WEAPONS).length && Object.keys(WEAPONS).every((w) => FIRE[w]) && new Set(Object.keys(WEAPONS).map((w) => JSON.stringify(FIRE[w]))).size === Object.keys(WEAPONS).length, 'every weapon fires its own timbre', Object.keys(FIRE).join(','))
    ok(FIRE.twin.notes.length === 1 && FIRE.twin.notes[0][2] < 0.06, 'the twin is a short blip', JSON.stringify(FIRE.twin.notes))
    ok(FIRE.gun.notes.length === 2, 'the gun is a staccato double click')
    ok(FIRE.spread.notes.length === 3, 'the spread is a low chord')
    ok(FIRE.laser.sweep && FIRE.laser.sweep.f0 > FIRE.laser.sweep.f1, 'the laser is a descending zap', JSON.stringify(FIRE.laser.sweep))
    ok(fireTimbre('nope') === FIRE.twin, 'an unknown weapon falls back to the twin blip')
    ok(BONUS_JINGLE.length === 4 && BONUS_JINGLE.every((n, i) => i === 0 || n[0] > BONUS_JINGLE[i - 1][0]), 'the bonus-entry jingle rises', BONUS_JINGLE.map((n) => n[0]).join('>'))
    ok(WHOOSH.freq > MURMUR.freq && MURMUR.vol < 0.05 && MURMUR_TICKS > 0, 'the whoosh is bright, the murmur a soft spaced bed', `${WHOOSH.freq}/${MURMUR.freq} v${MURMUR.vol}`)
}
// the murmur bed exists only while a bonus room is on; the close-alert stings once per cooldown
{
    const r = S.plan(0)
    const gs = makeGame(0)
    let inBonus = 0, outBonus = 0, sawBonus = false
    for (const inp of r.script) {
        const bonusNow = gs.roomData.bonus
        step(gs, inp)
        for (const e of gs.events) if (e.type === 'murmur') bonusNow ? inBonus++ : outBonus++
        if (bonusNow) sawBonus = true
        gs.events.length = 0
        if (gs.end) break
    }
    ok(sawBonus, 'the pilot reaches a bonus room')
    ok(inBonus > 0, 'the crowd murmurs while the bonus room is on', `${inBonus} bursts`)
    ok(outBonus === 0, 'the murmur exists nowhere else in the studio', `${outBonus} stray`)
    // controlled alert: one walkcam pinned at 30 px (inside the ring, outside the kill range)
    const g2 = makeGame(0)
    g2.enemies = []; g2.roomData.spawns = []; g2.spawnT = 0
    g2.player.invuln = 99999
    g2.enemies.push({ id: 9200, kind: 'walkcam', x: g2.player.x + 30, y: g2.player.y, hp: ENEMIES.walkcam.hp, cd: TELEGRAPH + 1, wanderT: 999, wdx: 0, wdy: 0, hitT: 0, dir: 1, walk: 0, moving: false, chg: 0, aim: [0, 0] })
    ok(ALERT_RADIUS > CFG.contactR, 'the alert ring sits outside the kill range', `${ALERT_RADIUS} vs ${CFG.contactR}`)
    let alerts = 0
    for (let i = 0; i < ALERT_CD + 1; i++) {
        g2.enemies[0].x = g2.player.x + 30; g2.enemies[0].y = g2.player.y
        step(g2, {})
        for (const e of g2.events) if (e.type === 'alert') alerts++
        g2.events.length = 0
    }
    ok(alerts === 2, 'a closing gun stings once per alert cooldown', `${alerts} alerts in ${ALERT_CD + 1} ticks`)
}

// ------------------------------------------------------------------- hud ----
console.log('hud')
{
    ok(labelClearsBar(), 'the POWER label clears the energy bar at 256 px', `label top ${POWER_LABEL.y - POWER_LABEL.size * 0.8} vs bar bottom ${BAR.y + BAR.h}`)
    ok(pipFits(), 'the BOMB-ready pip sits in the strip beside the bar', JSON.stringify(PIP))
    ok(bombReady(34, 34) && !bombReady(33, 34), 'the pip lights exactly at the firebomb cost')
    ok(bombReady(CFG.maxEnergy, CFG.firebombCost) && !bombReady(0, CFG.firebombCost), 'the pip tracks the energy, not a fixed pose')
    ok(RACK_FLASH === 60, 'the rack name flashes for one second after a pickup', `${RACK_FLASH}`)
    let v = 0, frames = 0
    const seq = []
    while (v < 123456 && frames++ < 400) { v = hiRoll(v, 123456); seq.push(v) }
    ok(v === 123456, 'the HI readout lands exactly on the new high', `${v}`)
    ok(seq.length > 4, 'the HI rolls up over several frames, not an instant jump', `${seq.length} frames`)
    ok(seq.every((x, i) => i === 0 || x > seq[i - 1]), 'the HI roll is monotonic')
    ok(hiRoll(5, 5) === 5 && hiRoll(10, 5) === 5, 'the roll never moves at or past the target')
    ok(hiRoll(0, 16) === 1, 'the roll always advances at least one digit tick')
    // #508: a DOWN seat's slot blinks a respawn countdown (readable in the shake)
    ok(!respawnState(0, 0).down, 'a live seat shows no respawn countdown')
    ok(respawnState(CFG.deadFreeze, 0).down && respawnState(1, 0).down, 'a dying seat is down until the freeze runs out')
    ok(respawnState(CFG.deadFreeze, 0).secs > respawnState(1, 0).secs, 'the countdown counts down as the freeze runs out', `${respawnState(CFG.deadFreeze, 0).secs} -> ${respawnState(1, 0).secs}`)
    ok(respawnState(1, 0).secs >= 1, 'the countdown never reads 0 while the seat is still down')
    const on = [0, 1, 2, 3].map((t) => respawnState(35, t).on)
    const off = [4, 5, 6, 7].map((t) => respawnState(35, t).on)
    ok(on.every(Boolean) && off.every((v) => !v), `the down slot blinks on a ${1 << RESPAWN_BLINK_SHIFT}-tick cadence`)
}

// ---------------------------------------------------------------- co-op ----
// #496 two-player co-op: two seats in one arena, per-seat banks, one shared
// POWER meter, either hero opens the exit, the show ends only when both seats
// burn their last life, and the whole 2P run replays from seed + pads.
console.log('co-op')
{
    const g = makeGame(0, { players: 2 })
    ok(g.players.length === 2, 'two seats share one arena')
    ok(g.player === g.players[0], 'seat 1 keeps the legacy handle')
    ok(Math.hypot(g.players[1].x - g.players[0].x, g.players[1].y - g.players[0].y) > 0, 'partners spawn side by side, not stacked')
    ok(g.players[1].aim[0] === 0 && g.players[1].aim[1] === -1, 'both heroes face the studio at the buzzer')
}
// kills pay the shooter's own bank
{
    const g = makeGame(0, { players: 2 })
    g.enemies = []
    g.roomData.spawns = []
    g.spawnT = 0
    const p2 = g.players[1]
    g.enemies.push({ id: 7001, kind: 'walkcam', x: p2.x + 14, y: p2.y, hp: 1, cd: 9999, wanderT: 999, wdx: 0, wdy: 0, hitT: 0, dir: 1, walk: 0, moving: false, chg: 0, aim: [0, 0] })
    g.enemies.push({ id: 7002, kind: 'turret', x: 40, y: 60, hp: 2, cd: 9999, wanderT: 999, wdx: 0, wdy: 0, hitT: 0, dir: 1, walk: 0, moving: false, chg: 0, aim: [0, 0] })
    g.bullets.push({ id: 7003, by: 1, x: p2.x + 14, y: p2.y, dx: 0, dy: 0, pierce: 0, dmg: 1, kind: 'twin' })
    step(g, {}, {})
    ok(g.players[1].score === 50 && g.players[0].score === 0, 'the shot that kills pays the shooter', `1UP ${g.players[0].score} 2UP ${g.players[1].score}`)
    const ev = g.events.find((e) => e.type === 'kill')
    ok(!!ev && ev.pi === 1, 'the kill event carries its seat', ev ? `pi ${ev.pi}` : 'no kill')
}
// POWER is the studio's single meter, not one per hero
{
    const g = makeGame(0, { players: 2 })
    g.enemies = []
    g.roomData.spawns = []
    g.spawnT = 0
    g.players[0].weapon = 'laser'
    g.players[1].weapon = 'laser'
    g.players[0].invuln = 9999; g.players[1].invuln = 9999
    for (let i = 0; i < 16; i++) { step(g, { fire: true }, {}); g.events.length = 0 }
    const after1 = g.energy
    ok(after1 === CFG.maxEnergy - 2, 'seat 1 LASER burns the shared meter', `${after1}`)
    for (let i = 0; i < 16; i++) { step(g, {}, { fire: true }); g.events.length = 0 }
    ok(g.energy === after1 - 2, 'seat 2 LASER burns the SAME meter', `${g.energy}`)
    // a FIREBOMB paid from the shared meter drains what the partner was saving
    const before = g.energy
    step(g, {}, { bomb: true })
    ok(before - g.energy === CFG.firebombCost, 'the partner can spend the shared POWER on a bomb too', `-${before - g.energy}`)
}
// one hero down is not the end of the show
{
    const g = makeGame(2, { players: 2 })
    for (const q of g.players) q.invuln = 0
    g.ebullets.push({ id: 8801, x: g.players[0].x + 2, y: g.players[0].y, dx: 1, dy: 0, dmg: 1, kind: 'shot' })
    step(g, {}, { my: -1 })
    ok(g.events.some((e) => e.type === 'death' && e.pi === 0) && !g.end, 'seat 1 goes down and the show plays on')
    const y0 = g.players[1].y
    step(g, {}, { my: -1 })
    ok(g.players[1].y < y0, 'the partner keeps playing while seat 1 is down')
    ok(g.end === null, 'no game over while a hero is still standing')
}
// the show only ends when BOTH seats burn their last life
{
    const g = makeGame(2, { players: 2 })
    for (const q of g.players) { q.lives = 1; q.invuln = 0 }
    g.enemies = []
    g.roomData.spawns = []
    g.spawnT = 0
    g.ebullets.push({ id: 8811, x: g.players[0].x + 2, y: g.players[0].y, dx: 0, dy: 0, dmg: 1, kind: 'shot' })
    g.ebullets.push({ id: 8812, x: g.players[1].x + 2, y: g.players[1].y, dx: 0, dy: 0, dmg: 1, kind: 'shot' })
    step(g, {}, {})
    ok(g.players.every((q) => q.deadT > 0), 'both seats drop on the same tick')
    let n = 0
    while (!g.end && n++ < CFG.deadFreeze + 4) step(g, {}, {})
    ok(g.end === 'over', 'the show ends when both seats spend their last life', `n=${n} end=${g.end}`)
    ok(g.players.every((q) => q.out), 'both seats are out', g.players.map((q) => q.lives).join('/'))
}
// either hero walking an open door takes the whole cast onward
{
    const g = makeGame(0, { players: 2 })
    g.enemies = []
    g.roomData.spawns = []
    g.spawnT = 0
    step(g, {}, {})
    ok(g.cleared, 'the co-op room falls')
    const ex = exitsOf(g.roomData.gw)[1]
    g.players[1].x = cx(ex.c); g.players[1].y = cy(ex.r)
    step(g, {}, {})
    ok(g.room === 1, 'seat 2 alone walks the exit and the whole arena advances')
    ok(g.players[0].deadT === 0 && !g.players[0].out, 'the idle hero travels to the next room too')
}
// seats never overlap at spawn
{
    const g = makeGame(1, { players: 2 })
    ok(g.players[0].x !== g.players[1].x, 'partners spawn on different tiles', `${g.players[0].x},${g.players[1].x}`)
}
// the co-op autopilot: a partner that speaks ONLY pads still clears the show
{
    const seeds = [0, 1, 2, 3, 4, 5, 6, 7, 8]
    const wins = []
    let badPartner = 0
    for (const seed of seeds) {
        const c = S.planCoop(seed)
        if (c.won) { wins.push(seed); if (c.score2 < 1000) badPartner++ }
    }
    ok(wins.length >= 9, `the co-op autopilot clears the show on ${wins.length}/9 seeds (all nine is the bar)`, `won ${wins.join(',')}`)
    ok(badPartner === 0, 'the partner carries its weight on every win (2UP bank > 0)', `weak partner on ${badPartner} seeds`)
}
// determinism of the co-op replay
{
    const a = S.planCoop(0), b = S.planCoop(0)
    ok(a.won && a.hash === b.hash, 'co-op is deterministic', `${a.hash} vs ${b.hash}`)
    ok(a.hash !== S.plan(0).hash, 'the co-op run differs from the solo pilot (the partner actually moves the show)')
}
// #496 done-when: the run replays from seed + per-player PAD streams
{
    const r = S.planCoop(0)
    ok(r.won, 'the proven co-op run wins')
    const g = makeGame(0, { players: 2 })
    for (const [i1, pad2] of r.script) {
        // seat 1's decision is folded through a pad too — the harness replays
        // nothing but seed + two pad streams per tick
        step(g, S.padToInp(S.inpToPad(i1)), S.padToInp(pad2))
        g.events.length = 0
    }
    ok(stateHash(g) === r.hash, 'seed + per-player pad streams replay hash-for-hash', `${stateHash(g)} vs ${r.hash}`)
    ok(g.end === 'win', 'the pad-stream replay ends where the autopilot ended', `${g.end}`)
}
// #496 the aim stick on THE one pad: analog and digital folds agree
{
    const one = await import(`../src/utils/onePad.js?c=${Date.now()}`)
    const p = one.blankPad()
    ok('ax' in p && 'ay' in p, 'the one pad carries an analog aim vector')
    ok(one.PAD_FIELDS.includes('aimUp') && one.PAD_FIELDS.includes('ax'), 'the pad meta lists the aim fields')
    const a = one.normalizePad({ ax: 1, ay: 0 })
    ok(a.aimRight && !a.aimLeft && !a.aimUp && !a.aimDown, 'ax=1 quantizes to aim-right')
    const d = one.normalizePad({ aimDown: true })
    ok(d.aimDown && d.ay === 0, 'a digital aim press reads without an analog vector')
    ok(one.blankPad().aimUp === false && one.blankPad().aimRight === false, 'the aim stick rests neutral')
    // slot 2's aim is independent of slot 1's
    one.pressSlot(2, 'aimLeft')
    const s2 = one.slotPad(2)
    ok(s2.aimLeft, 'slot 2 carries its own digital aim')
    one.releaseSlot(2, 'aimLeft')
}

// --------------------------------------------------------------- specials ----
// #2032: HEAT-SEEKER and FLAMER — the two guns the original's power-up ladder
// had and this arena didn't. Table, drops, guidance, reach and the seat-law
// that keeps the autopilot out of the fire.
console.log('specials')
{
    ok(WEAPONS.homing && WEAPONS.flame, 'both specials are in the table', Object.keys(WEAPONS).join(','))
    ok(Object.keys(WEAPONS).length === 6 && new Set(Object.values(WEAPONS).map((w) => `${w.interval}|${w.speed}|${w.dmg}|${w.pierce}`)).size === 6, 'each gun is a distinct stat-line', Object.keys(WEAPONS).join(','))
    ok(WEAPONS.homing.name === 'HEAT-SEEKER' && WEAPONS.flame.name === 'FLAMER', 'the HUD names them', `${WEAPONS.homing.name}/${WEAPONS.flame.name}`)
}
// the specials hide in the bonus rounds — HEAT-SEEKER in room 4, FLAMER in
// room 7 — and nowhere else on any board.
{
    let clean = true, detail = ''
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
        for (let idx = 0; idx < TOTAL_ROOMS; idx++) {
            const got = genRoom(seed, idx).crates.map((k) => k.weapon).filter((w) => w === 'homing' || w === 'flame')
            const want = idx === 3 ? 'homing' : idx === 6 ? 'flame' : null
            if (got.length !== (want ? 1 : 0) || (want && got[0] !== want)) { clean = false; detail = `seed ${seed + 1} room ${idx + 1}: ${got.join(',')}` }
        }
    }
    ok(clean, 'every seed: HEAT-SEEKER only in room 4, FLAMER only in room 7', detail)
}
// missile guidance — locked on the nearest heat at launch, curving at a BOUNDED
// turn rate (guidance, not a tractor beam), constant speed, and a warhead that
// splashes everything near the impact.
{
    const mk = (id, x, y) => ({ id, kind: 'turret', x, y, hp: 9, cd: 9999, wanderT: 0, wdx: 0, wdy: 0, hitT: 0, dir: 1, walk: 0, moving: false, chg: 0, aim: [0, 0] })
    const rig = () => {
        const g = makeGame(7)
        g.enemies = []; g.civilians = []; g.ebullets = []; g.grenades = []; g.crates = []; g.items = []
        g.roomData = { ...g.roomData, spawns: [] }; g.spawnT = 0; g.walls = new Set()
        g.player.invuln = 99999; g.player.weapon = 'homing'
        return g
    }
    const g = rig()
    g.player.x = 200; g.player.y = 140
    g.enemies = [mk(901, 200, 60), mk(902, 170, 140)] // far ahead, closer off the barrel line
    step(g, { fx: 0, fy: -1, fire: true })
    const m = g.bullets.find((b) => b.kind === 'homing')
    ok(!!m, 'the heat-seeker fires a missile', `${g.bullets.length} bullets`)
    ok(g.bullets.filter((b) => b.kind === 'homing').length === 1, 'one missile per shot — the cabinet fired them singly')
    ok(m && m.lock === 902, 'the seeker locks on the nearest heat at launch, not the one in front', `lock=${m && m.lock}`)
    let prevA = Math.atan2(m.dy, m.dx), turned = 0, bounded = true, speedHeld = true, flight = 0
    const seen = []
    while (!m.done && flight < 400) {
        step(g, {}); flight++
        const a = Math.atan2(m.dy, m.dx)
        let d = a - prevA
        while (d > Math.PI) d -= Math.PI * 2
        while (d < -Math.PI) d += Math.PI * 2
        turned = Math.max(turned, Math.abs(d))
        if (Math.abs(d) > MISSILE_TURN + 1e-9) bounded = false
        if (Math.abs(Math.hypot(m.dx, m.dy) - WEAPONS.homing.speed) > 1e-9) speedHeld = false
        prevA = a
        for (const e of g.enemies) if (Math.hypot(e.x - m.x, e.y - m.y) < 7) seen.push(e.id)
        gs_clear(g)
    }
    ok(bounded, `the missile never turns more than ${MISSILE_TURN} rad/tick`, `max ${turned.toFixed(3)}`)
    ok(turned > 0.05, 'the missile really curves onto its lock', `max turn ${turned.toFixed(3)}`)
    ok(speedHeld, 'guidance bends the heading, never the speed')
    ok(seen.includes(902), 'the missile catches the off-line target its lock picked', seen.join(','))
    ok(g.enemies.find((e) => e.id === 902).hp === 7, 'the missile lands its two points of damage', `hp=${g.enemies.find((e) => e.id === 902).hp}`)
    ok(g.enemies.find((e) => e.id === 901).hp === 9, 'a far target feels nothing — the blast is bounded')
    // splash: a second hostile beside the impact takes a point
    const g2 = rig()
    g2.player.x = 200; g2.player.y = 140
    g2.enemies = [mk(911, 200, 90), mk(912, 210, 94)]
    step(g2, { fx: 0, fy: -1, fire: true })
    let f2 = 0
    while (g2.bullets.some((b) => b.kind === 'homing') && f2 < 400) { step(g2, {}); f2++; gs_clear(g2) }
    const pair = g2.enemies.map((e) => e.hp).sort().join(',')
    ok(pair === '7,8', `the warhead splashes: direct hit takes two, a neighbour inside ${MISSILE_BLAST} px takes one`, `hp ${pair}`)
    // fizzle: with no heat to chase the hunt still ends — a missile is ammunition, not a cruise missile
    const g3 = rig()
    g3.roomData = { ...g3.roomData, gw: 40 }
    g3.player.x = 40; g3.player.y = 140 // clear of the exit cell, long east runway
    step(g3, { fx: 1, fy: 0, fire: true })
    let fz = false, f3 = 0
    while (!g3.end && f3 < MISSILE_LIFE + 40 && !fz) {
        step(g3, {})
        if (g3.events.some((e) => e.type === 'missileFizzle')) fz = true
        gs_clear(g3); f3++
    }
    ok(fz, `an unguided hunt dies at MISSILE_LIFE=${MISSILE_LIFE} ticks`, `ticks ${f3}`)
}
function gs_clear(g) { g.events.length = 0 }
// the flamer: a three-pellet puff, eased fans, and a hard reach cap — plus the
// seat-law that keeps the autopilot out of it (it cannot win the lane duels).
{
    const rigF = () => {
        const g = makeGame(7)
        g.enemies = []; g.civilians = []; g.ebullets = []; g.grenades = []; g.crates = []; g.items = []
        g.roomData = { ...g.roomData, spawns: [], gw: 40 }; g.spawnT = 0; g.walls = new Set()
        g.player.invuln = 99999; g.player.weapon = 'flame'
        return g
    }
    const g = rigF()
    g.player.x = 100; g.player.y = 140
    step(g, { fx: 1, fy: 0, fire: true })
    const puffs = g.bullets.filter((b) => b.kind === 'flame')
    ok(puffs.length === 3, 'the flamer breathes three pellets at once', `${puffs.length}`)
    const angs = puffs.map((b) => Math.atan2(b.dy, b.dx)).sort((a, b) => a - b).map((a) => a.toFixed(3))
    ok(Math.abs(parseFloat(angs[0]) + FLAME_FAN) < 1e-9 && angs[1] === '0.000' && Math.abs(parseFloat(angs[2]) - FLAME_FAN) < 1e-9, `the fan is +-${FLAME_FAN} rad`, angs.join(' '))
    const mags = puffs.map((b) => Math.hypot(b.dx, b.dy)).sort((a, b) => a - b).map((v) => v.toFixed(4))
    const wantMags = [WEAPONS.flame.speed * FLAME_SLOW, WEAPONS.flame.speed * FLAME_SLOW, WEAPONS.flame.speed].sort((a, b) => a - b).map((v) => v.toFixed(4))
    ok(mags.join(',') === wantMags.join(','), 'the outer pellets fly eased by FLAME_SLOW, the centre full speed', mags.join(','))
    let t = 0
    while (g.bullets.some((b) => b.kind === 'flame') && t < 100) { step(g, {}); t++; g.events.length = 0 }
    ok(t <= FLAME_LIFE, `fire dies inside FLAME_LIFE=${FLAME_LIFE} ticks`, `${t}`)
    ok(WEAPONS.flame.speed * FLAME_LIFE <= 45.1, 'the reach stays inside ~45 px — short-range by design', `${(WEAPONS.flame.speed * FLAME_LIFE).toFixed(1)} px`)
    const g2 = rigF()
    g2.player.x = 100; g2.player.y = 140
    g2.enemies = [{ id: 921, kind: 'turret', x: 130, y: 140, hp: 9, cd: 9999, wanderT: 0, wdx: 0, wdy: 0, hitT: 0, dir: 1, walk: 0, moving: false, chg: 0, aim: [0, 0] }]
    step(g2, { fx: 1, fy: 0, fire: true })
    let t2 = 0
    while (t2 < 20 && g2.enemies[0].hp === 9) { step(g2, {}); t2++; g2.events.length = 0 }
    ok(g2.enemies[0].hp === 8, 'the flame burns through a body for one point', `hp=${g2.enemies[0].hp}`)
    ok(g2.bullets.some((b) => b.kind === 'flame'), 'and keeps flying — the fire pierces')
}
// the seat-law (#2032): the autopilot never equips the FLAMER — not even when
// stray fire breaks the crate and the dropped barrel lies in its lane. A 45 px
// stream cannot fight the doctrine's lane duels; it stays the human's gun.
{
    let touched = ''
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
        const r = S.plan(seed)
        const g = makeGame(seed)
        let prev = g.player.weapon
        for (const inp of r.script) {
            step(g, inp); g.events.length = 0
            if (g.player.weapon === 'flame') { touched = touched || `seed ${seed + 1}` }
            if (g.player.weapon !== prev) prev = g.player.weapon
        }
    }
    ok(touched === '', 'no autopilot seat ever equips the FLAMER across the 9-seed sweep', touched)
    const rc = S.planCoop(0)
    const gc = makeGame(0, { players: 2 })
    let cooped = false
    for (const [i1, pad] of rc.script) { step(gc, i1, S.padToInp(pad)); gc.events.length = 0; if (gc.players.some((q) => q.weapon === 'flame')) cooped = true }
    ok(!cooped, 'neither co-op seat equips the FLAMER either')
}

// ----------------------------------------------------------------- pilot ----
console.log('pilot')
{
    // #2007 honest floor: the whole show runs wide boards now, and the
    // DIRECTED stall-break (slide until the goal vector opens, sweep growing
    // while it doesn't) ended every pinned stall — including the seed-3 fan
    // attrition that #1973 had documented as a forced loss. The sweep says the
    // forced loss is retired: all nine seeds win. If a future change loses one
    // again, update this pin AND the README together, Pong's seed 25 style.
    const wins = [], deathless = []
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
        const r = S.plan(seed)
        if (r.won) { wins.push(seed); if (r.deaths === 0) deathless.push(seed) }
        console.log(`  seed ${seed}: ${r.won ? 'WON' : 'lost'} deaths=${r.deaths} score=${r.score}`)
    }
    ok(wins.length === 9, 'pilot clears all 9 seeds — the #1973 forced loss retired by the directed break', `won ${wins.join(',')}`)
    ok(deathless.includes(1), 'seed 1 proves the deathless matinee', `deathless ${deathless.join(',')}`)
}

// ------------------------------------------------------------- varisize ----
// #1973: big rooms are bigger than the screen — and the sim really lets you
// use the extra floor. #2007: the WHOLE show is big now. #2024: that includes
// THE ANNOUNCER — and his framing got stronger, not looser: see the host law
// below. (The camera itself is renderer; its pins read the file.)
console.log('varisize')
{
    for (let idx = 0; idx < TOTAL_ROOMS; idx++) {
        const want = BIG_ROOMS.has(idx) ? GW_BIG : GW
        ok(genRoom(0, idx).gw === want, `room ${idx + 1} boards ${want} cols`)
    }
    // #2024: the WHOLE show boards wide — the finale included.
    ok(BIG_ROOMS.size === TOTAL_ROOMS && [...BIG_ROOMS].every((i) => i >= 0 && i < TOTAL_ROOMS),
        'the whole show runs the wide board — finale included', [...BIG_ROOMS].sort((a, b) => a - b).join(','))
    ok(roomGw(TOTAL_ROOMS - 1) === GW_BIG, 'THE ANNOUNCER boards wide with the show (#2024)')
    ok(startColOf(GW) === START.c && startColOf(GW_BIG) === GW_BIG / 2, 'each board spawns at its own lower middle')
    ok(makeGame(0).player.x === cx(startColOf(GW_BIG)), 'the show opens on the middle of a wide board', `${makeGame(0).player.x}`)
    const big = genRoom(0, 4)
    const wallSet = new Set(big.walls.map(([c, r]) => `${c},${r}`))
    ok(big.walls.every(([c, r]) => wallSet.has(`${big.gw - 1 - c},${r}`)), 'the big-room pattern mirrors across the wider board')
    ok(exitsOf(GW_BIG).find((e) => e.side === 'right').c === GW_BIG - 1, 'the big room opens its right door on its far border')
    ok(exitsOf(GW).find((e) => e.side === 'right').c === GW - 1, 'standard rooms keep the screen-edge door')

    // walk the room ladder into room 5 (each hop: fall the room, take the up door)
    const gs = makeGame(0)
    for (let target = 1; target <= 4; target++) {
        gs.enemies = []; gs.roomData.spawns = []; gs.spawnT = 0; gs.bonusT = 0
        step(gs, {}); gs.events.length = 0
        const up = exitsOf(gs.roomData.gw).find((e) => e.side === 'up')
        gs.player.x = cx(up.c); gs.player.y = cy(up.r)
        step(gs, {})
        ok(gs.room === target, `ladder hop into room ${target + 1}`)
        gs.events.length = 0
    }
    ok(gs.roomData.gw === GW_BIG, 'room 5 really runs 24 columns', `${gs.roomData.gw}`)

    // the hero crosses the old screen line and the far border holds
    gs.enemies = []; gs.roomData.spawns = []; gs.spawnT = 1e9
    gs.player.invuln = 1e9
    let maxX = gs.player.x
    for (let i = 0; i < 900; i++) { step(gs, { mx: 1, my: 0 }); maxX = Math.max(maxX, gs.player.x); gs.events.length = 0 }
    ok(maxX > CW, 'the hero walks past the old screen edge inside the big room', `x ${maxX.toFixed(0)}`)
    ok(maxX <= GW_BIG * CELL - CFG.playerR - 4, 'the far border still holds the board', `x ${maxX.toFixed(0)}`)
    gs.events.length = 0

    // a twin shot crosses the screen line too and only dies at the far wall
    const gs2 = gs
    gs2.bullets.push({ id: 7777, x: 250, y: cy(1), dx: 3, dy: 0, pierce: 0, dmg: 1, kind: 'twin', by: 0 })
    let pastScreen = false, survived = false
    for (let i = 0; i < 80 && gs2.bullets.length; i++) {
        step(gs2, {})
        const b = gs2.bullets.find((x) => x.id === 7777)
        if (b) { if (b.x > 256) { pastScreen = true; survived = true } }
        gs2.events.length = 0
    }
    ok(pastScreen && survived, 'shots fly past the screen line on the wider board')

    // the far door really takes the show onward
    gs2.cleared = true
    gs2.player.x = cx(GW_BIG - 1); gs2.player.y = cy(6)
    step(gs2, {})
    ok(gs2.room === 5, 'walking the FAR door of a big room advances the show', `room ${gs2.room}`)

    // the renderer carries the camera (source pins — the pan lives in index.jsx;
    // #1978 moved the re-rounding out: the cast mid sets a float target, camPan
    // steps it uniformly, and the rounded value is all the arena sees)
    const IDX = readFileSync('src/games/SmashTV/index.jsx', 'utf8')
    ok(IDX.includes('ctx.translate(-camX, 0)'), 'the arena renders through a camera pan')
    ok(/const want = Math\.max\(0, Math\.min\(mid - CW \/ 2, camBoard - CW\)\)/.test(IDX), 'camX centres the live cast and clamps at the board edges', '')
    ok(IDX.includes('camPan(camF, want)'), 'the pan obeys the uniform-step law')
    ok(IDX.includes('camX = Math.round(camF)'), 'the pan lands on whole pixels')
}

// ----------------------------------------------------------------- slack ----
console.log('slack')
{
    const r = S.plan(1, { slack: true })
    ok(r.won, 'the show is still won with one fewer crate per room and zero energy cells', `deaths=${r.deaths}`)
}

// ---------------------------------------------------------------- ledger ----
console.log('ledger')
{
    const r = S.plan(0)
    const gs = makeGame(0)
    let ledger = 0
    for (const inp of r.script) {
        step(gs, inp)
        for (const e of gs.events) if (e.type === 'score') ledger += e.pts
        gs.events.length = 0
    }
    ok(ledger === r.gs.score, 'final score equals the sum of scored events', `${ledger} vs ${r.gs.score}`)
}

// ---------------------------------------------------------- determinism ----
console.log('determinism')
{
    const a = S.plan(0), b = S.plan(0)
    ok(a.hash === b.hash, 'same seed replays identically', `${a.hash} vs ${b.hash}`)
}

// ------------------------------------------------------------- gore (#2044) ----
console.log('gore')
{
    // #2044: the bonus-round splatter spec. The cabinet's crowd-kills SPLAT:
    // multi-pixel red chunks with a bone chip, a heavier arc than sparks, a
    // lifetime long enough to read the flight, and a floor stain that dries.
    const mkRng = (seed) => { let v = seed; return () => { v = (Math.imul(v, 1103515245) + 12345) & 0x7fffffff; return v / 0x7fffffff } }
    const gibs = goreSet(mkRng(42))
    ok(gibs.length === 7, 'a bonus kill comes apart into seven gibs', `${gibs.length}`)
    ok(gibs.every((p) => p.w * p.h >= 2), 'every gib is MULTI-pixel — never a burst spark', gibs.map((p) => `${p.w}x${p.h}`).join(' '))
    const cols = new Set(gibs.map((p) => p.col))
    ok([...cols].filter((c) => c === '#c81f2f' || c === '#e8464a' || c === '#a01824').length >= 2, 'the gore runs a two-tone red palette', [...cols].join(' '))
    ok(cols.has('#f0e6d8'), 'one bone chip reads against the red')
    ok(gibs.every((p) => p.grav === GORE_GRAV && GORE_GRAV > 0.18), 'gibs fall heavier than the casing sparks', `g=${GORE_GRAV}`)
    ok(gibs.every((p) => Math.abs(p.vx) <= 2.6 && p.vy >= -3.2 && p.vy <= 2.0), 'the launch speeds stay bounded', gibs.map((p) => `${p.vx.toFixed(1)},${p.vy.toFixed(1)}`).join(' '))
    ok(JSON.stringify(goreSet(mkRng(7))) === JSON.stringify(goreSet(mkRng(7))), 'the splatter set is deterministic by rng')
    ok(GORE_TICKS > 20, 'gibs live longer than a spark so the arc reads', `${GORE_TICKS}`)
    ok(stainRadius(0) === 3 && stainRadius(3) === 6 && stainRadius(99) === 6, 'the floor stain grows with the combo and caps', `${stainRadius(0)}..${stainRadius(3)}`)
    ok(STAIN_TICKS >= 60, 'stains dry slowly — the round keeps its litter', `${STAIN_TICKS}`)
    // presentation-only wiring, pinned at source: the civKill handler splats,
    // the old blue spark is gone, and a room change scrubs the floor.
    const SRC = readFileSync('src/games/SmashTV/index.jsx', 'utf8')
    ok(/'civKill'[\s\S]{0,700}goreSet\(\)/.test(SRC), 'the civKill event spawns the gibs')
    ok(/'civKill'[\s\S]{0,700}stains\.push/.test(SRC), 'the civKill event leaves a stain')
    ok(!/'civKill'[\s\S]{0,700}burst\(e\.x, e\.y, 6, '#8fb0ff'\)/.test(SRC), 'the blue spark is retired — gore replaced it')
    ok(/'advance'[\s\S]{0,160}stains\.length = 0/.test(SRC), 'the next room opens on a clean floor')
}

// ---------------------------------------------------------- polish (#1978) ----
console.log('polish')
{
    // 1) uniform pan (#1978). Measured on the old camera: a 1.2 px/tick walk
    // stepped the world 1,1,2 px and the hero screen-stuttered backwards a
    // pixel every fifth tick. Walk the law at hero speed: the world may never
    // hop more than 1 px in a frame, never step against the walk, and still
    // cross the whole extra board.
    let f = 72, prev = 72, hops = 0, back = 0, moved = 0
    for (let t = 0; t <= 160; t++) {
        f = camPan(f, Math.min(128, 72 + t * 1.2)) // CFG.playerSpeed, clamped board
        const x = Math.round(f)
        if (x - prev > 1) hops++
        if (x < prev) back++
        moved += x - prev
        prev = x
    }
    ok(hops === 0, 'a hero-speed walk never hops the world more than 1 px/frame', `hops=${hops}`)
    ok(back === 0, 'the pan is monotone with the walk — no backwards stutter')
    ok(moved >= 56, 'the pan still travels the whole extra board', `${moved}px`)
    ok(camPan(0, 40) === 40 && CAM_SNAP === 24, 'a board-sized jump snaps through — rooms and respawns do not pan')
    ok(camPan(100, 100.6) === 100.6, 'sub-pixel catch-up lands exactly (no oscillation)')
    ok(camPan(100, 130) === 130 && camPan(100, 120) === 101, 'snap past CAM_SNAP, one px step inside it', `${camPan(100, 120)}`)
    ok(CAM_PAN === 1, 'the pan cap is one pixel', `${CAM_PAN}`)

    // 2) cross-screen door confirm: on a wide board every door can be a walk
    // away when the room falls; the near-door blip alone read the same as the
    // cabinet's. The far case answers with the two-tone clank over noise.
    ok(FAR_EXIT_PX >= 64 && FAR_EXIT_PX <= 128, 'the confirm distance is a real walk, not the whole board', `${FAR_EXIT_PX}`)
    const doors = exitsOf(GW_BIG).map((d) => ({ x: d.c * 16 + 8, y: 24 + d.r * 16 + 8 }))
    ok(farExitPx(264, 176, doors) > FAR_EXIT_PX, 'mid-board on a wide room, every door is a walk away', farExitPx(264, 176, doors).toFixed(0))
    ok(farExitPx(200, 192, doors) <= FAR_EXIT_PX, 'at the spawn the near door keeps the light blip', farExitPx(200, 192, doors).toFixed(0))
    ok(SHUTTER_CONFIRM.notes.length === 2 && SHUTTER_CONFIRM.noise > 0, 'the confirm is a two-tone clank over noise, not one blip')
    const SRC2 = readFileSync('src/games/SmashTV/index.jsx', 'utf8')
    ok(/'clear'[\s\S]{0,900}farExitPx\(q\.x, q\.y, doors\) > FAR_EXIT_PX/.test(SRC2), 'the room-clear handler carries the far-door confirm')

    // 3) off-screen markers: spawns, threats and the bonus crowd past the edge
    // borrow the game's own colours so the chip reads without a tutorial.
    ok(markSide(10, 72, 256) === -1 && markSide(330, 72, 256) === 1 && markSide(200, 72, 256) === 0, 'markSide maps board x to the frame edge', `${markSide(10, 72, 256)},${markSide(330, 72, 256)},${markSide(200, 72, 256)}`)
    ok(MARK.spawn === '#ffd23f' && MARK.enemy === '#ff5d5d' && MARK.civ === '#8fff9f', 'the markers reuse the telegraph, kill and exit colours')
    ok(SRC2.includes('markSide(bx, camX, CW)'), 'the renderer stamps the edge chips')
    ok(SRC2.includes("en.kind !== 'boss'"), 'the host is exempt — the host law already keeps him framed')

    // 4) combo pop vs shutter: the pop hangs at screen centre and the up-door
    // sits at board centre — at mid-board framing the old pop row collided
    // with the sealed/shuttering door. The pop now hangs below the border row,
    // and nothing may ever be built in its band.
    ok(SRC2.includes('ctx.translate(CW / 2 + camX, HUD_H + 48)'), 'the combo pop hangs below the border door row')
    for (let idx = 0; idx < TOTAL_ROOMS; idx++) {
        const low = genRoom(0, idx).walls.filter(([, r]) => r <= 2)
        ok(low.length === 0, `room ${idx + 1}: nothing built in the pop's band (rows 0–2)`)
    }
}

// ------------------------------------------------------------- mutants ----
if (process.argv.includes('--mutate')) {
    console.log('mutants (must die)')
    const SIM = 'src/games/SmashTV/sim.js'
    const MUTANTS = [
        ['exits unlock while enemies live', 'gs.spawnT <= 0 && !room.spawns.length && gs.enemies.length === 0', 'gs.enemies.length >= 0'],
        ['one-hit lethality removed', 'if (p.deadT > 0 || p.out || gs.end || p.invuln > 0) return', 'if (p.deadT > 0 || p.out || gs.end || p.invuln >= 0) return'],
        ['crates keep their gun inside', 'gs.items.push({ id: gs._nextId++, t: \'weapon\', w: k.weapon, x: k.x, y: k.y })', 'void k'],
        ['firebomb goes free', 'gs.energy -= CFG.firebombCost\n    let killed = 0', 'gs.energy -= 0\n    let killed = 0'],
        ['the bonus clock never runs out', 'if (gs.bonusT <= 0) {', 'if (gs.bonusT <= -1e9) {'],
        ['the telegraph vanishes (guns fire blind)', 'e.chg = TELEGRAPH\n    trackAim(gs, e)\n    gs.events.push({ type: \'charge\', kind: e.kind })', 'void e'],
        ['the crowd never murmurs', 'gs.events.push({ type: \'murmur\' })', 'void 0'],
        ['the close alert never sounds', 'gs.events.push({ type: \'alert\', x: bx, y: by })', 'void 0'],
        ['the partner\'s kills pay seat 1 instead of the shooter', 'addScore(gs, ENEMIES[e.kind].pts, { kind: e.kind }, pi)\n        gs.events.push({ type: \'kill\', id: e.id, kind: e.kind, x: e.x, y: e.y, pts: ENEMIES[e.kind].pts, bossAdd: e.born !== undefined, pi })', 'addScore(gs, ENEMIES[e.kind].pts, { kind: e.kind }, 0)\n        gs.events.push({ type: \'kill\', id: e.id, kind: e.kind, x: e.x, y: e.y, pts: ENEMIES[e.kind].pts, bossAdd: e.born !== undefined, pi })'],
        ['both seats out never ends the co-op show', 'if (seats.every((q) => q.out)) { gs.end = \'over\'', 'if (seats.every((q) => q.out && false)) { gs.end = \'over\''],
        ['#1973: the board silently shrinks back to the screen', 'export const boardW = (gs) => gwOf(gs) * CELL', 'export const boardW = () => CW'],
        ['#1973: the far door forgets it moved with the border', 'const exits = exitsOf(gwOf(gs))', 'const exits = EXITS'],
        ['#2024: the host law off — THE ANNOUNCER paces fixed bounds', 'const lo = cam + 48\n            const hi = cam + CW - 48', 'const lo = 60\n            const hi = bw - 60'],
        ['#2032: the missile flies straight (the lock is ignored)', 'const a = cur + Math.max(-MISSILE_TURN, Math.min(MISSILE_TURN, diff))', 'const a = cur'],
        ['#2032: the missile never expires', '} else if (b.age > MISSILE_LIFE) {', '} else if (b.age > 1e9) {'],
        ['#2032: the warhead is inert', 'if (dist(b.x, b.y, q.x, q.y) < MISSILE_BLAST + (q.kind === \'boss\' ? 14 : 7)) damageEnemy(gs, q, 1, \'blast\', owner)', 'if (false) damageEnemy(gs, q, 1, \'blast\', owner)'],
        ['#2032: the fire never dies out', 'if (b.age > FLAME_LIFE) { b.done = true; continue }', 'if (b.age > 1e9) { b.done = true; continue }'],
        ['#2032: the flamer coughs a single pellet', 'for (const [d, sp] of [[-FLAME_FAN, FLAME_SLOW], [0, 1], [FLAME_FAN, FLAME_SLOW]]) {', 'for (const [d, sp] of [[0, 1]]) {'],
    ]
    const LEVELS = 'src/games/SmashTV/levels.js'
    const LEVELS_MUTANTS = [
        ['#1973: the show collapses back to screen width', 'export const BIG_ROOMS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8])', 'export const BIG_ROOMS = new Set()'],
        ['#2024: the finale drops off the pan board again', 'export const BIG_ROOMS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8])', 'export const BIG_ROOMS = new Set([0, 1, 2, 3, 4, 5, 6, 7])'],
        ['#2007: spawns forget the wide board\'s middle', 'export const startColOf = (gw) => (gw > GW ? Math.floor(gw / 2) : START.c)', 'export const startColOf = () => START.c'],
        ['#1973: the wide-board mirror is never drawn', 'if (!seen.has(k)) { seen.add(k); walls.push([mc, r]) }', 'if (!seen.has(k)) { seen.add(k); void mc }'],
        ['#2032: the specials leave the bonus rounds', 'room.crates.push({ c: bc, r: br, weapon: idx === 3 ? \'homing\' : \'flame\' })', 'room.crates.push({ c: bc, r: br, weapon: idx === 3 ? \'laser\' : \'gun\' })'],
    ]
    const SPRITE = 'src/games/SmashTV/sprite.js'
    const SPRITE_MUTANTS = [
        ['guns drop to the waist (pose law: shoulder carriage)', 'export const CARRIAGE = { back: 1, rise: 2.5 }', 'export const CARRIAGE = { back: 0, rise: 0 }'],
    ]
    const PLANNER = 'src/games/SmashTV/planner.js'
    const PLANNER_MUTANTS = [
        ['#2032: the seat walks onto the dropped flamer', 'if (d > 16) return inp', 'if (d > -1e9) return inp'],
    ]
    const JUICE = 'src/games/SmashTV/juice.js'
    const JUICE_MUTANTS = [
        ['#2044: gibs shrink to burst sparks', "[3, 4, '#c81f2f'], // torso chunk (the big one)", "[1, 1, '#c81f2f'], // torso chunk (the big one)"],
        ['#2044: the bone chip drowns in the red', "[1, 3, '#f0e6d8'], // bone chip", "[1, 3, '#c81f2f'], // bone chip"],
        ['#2044: gore vanishes before the arc reads', 'export const GORE_TICKS = 34', 'export const GORE_TICKS = 8'],
        ['#2044: gibs float — no weight on the splatter', 'export const GORE_GRAV = 0.22', 'export const GORE_GRAV = 0'],
        ['#2044: the floor dries instantly', 'export const STAIN_TICKS = 120', 'export const STAIN_TICKS = 4'],
        ['#1978: the pan regrows its 2 px hops', 'export const CAM_PAN = 1', 'export const CAM_PAN = 2'],
        ['#1978: respawns drift across the board instead of snapping', 'export const CAM_SNAP = 24', 'export const CAM_SNAP = 1e9'],
        ['#1978: the far-door confirm is switched off', 'export const FAR_EXIT_PX = 96', 'export const FAR_EXIT_PX = 1e9'],
    ]
    const IDX = 'src/games/SmashTV/index.jsx'
    const IDX_MUTANTS = [
        ['#1978: the far-door confirm goes blind', 'if (farExitPx(q.x, q.y, doors) > FAR_EXIT_PX) {', 'if (false) {'],
        ['#1978: the combo pop slides back onto the door row', 'ctx.translate(CW / 2 + camX, HUD_H + 48)', 'ctx.translate(CW / 2 + camX, HUD_H + 30)'],
    ]
    const targets = [[SIM, MUTANTS], [SPRITE, SPRITE_MUTANTS], [LEVELS, LEVELS_MUTANTS], [PLANNER, PLANNER_MUTANTS], [JUICE, JUICE_MUTANTS], [IDX, IDX_MUTANTS]]
    let died = 0, total = 0
    for (const [file, muts] of targets) {
        const orig = readFileSync(file, 'utf8')
        for (const [name, from, to] of muts) {
            total++
            if (!orig.includes(from)) { ok(false, `mutant ${name}: anchor missing`); continue }
            plant(file, orig.replace(from, to))
            const res = spawnSync('node', ['scripts/smashcheck.mjs'], { encoding: 'utf8' })
            if (res.status !== 0) { died++; ok(true, `mutant ${name} caught`) }
            else ok(false, `mutant ${name} SURVIVED`)
        }
        pull(file)
    }
    ok(died === total, 'all mutants die', `${died}/${total}`)
}

console.log(fails ? `FAIL ${fails} (pass ${passes})` : `PASS ${passes}`)
process.exit(fails ? 1 : 0)

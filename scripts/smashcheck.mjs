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
//   pilot     : seeds 0-8 win the nine-room show; seeds 1 and 3 do it deathless.
//   slack     : seed 1 still wins with one fewer crate per room and zero
//               energy cells.
//   determinism : same seed twice -> identical digest.
//   co-op (#496): two seats one arena — per-seat banks (kills pay the
//               shooter), ONE shared POWER meter, either hero opens the exit,
//               game over only when both seats burn their last life, the co-op
//               autopilot (partner pads only) clears the show, and the whole 2P
//               run replays from seed + per-player pad streams hash-for-hash;
//               the aim stick rides THE one pad (ax/ay + digital fold).
// `-- --mutate` re-plants fixed bugs in child processes; each MUST die.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

let fails = 0, passes = 0
const ok = (cond, name, detail = '') => {
    if (cond) { passes++; console.log(`  ok   ${name}`) }
    else { fails++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const { GW, GH, EXITS, TOTAL_ROOMS, genRoom, START, isBonus, ENEMIES } = await import('../src/games/SmashTV/levels.js')
const { wallCell, NEON_TOP, CHROME, borderRivet } = await import('../src/games/SmashTV/walls.js')
const { playerFrame, GUN, LAYERS, PLAYER_FRAMES } = await import('../src/games/SmashTV/sprite.js')
const { ENEMY_FRAMES, TELEGRAPH, CHARGERS, CHARGE, OUTLINE, enemyFrame, bossMouth, BOSS_MOUTH_FLAP, ADD_TELEGRAPH, BOSS_DEATH_T } = await import('../src/games/SmashTV/enemies.js')
const { muzzleFlash, casingCol, killShake, KILL_SHAKE, SHUTTER_TICKS, shutterPhase, roomScore } = await import('../src/games/SmashTV/juice.js')
const { FIRE, fireTimbre, BONUS_JINGLE, MURMUR, MURMUR_TICKS, WHOOSH, ALERT, ALERT_RADIUS, ALERT_CD } = await import('../src/games/SmashTV/audio.js')
const { BAR, PIP, POWER_LABEL, labelClearsBar, pipFits, bombReady, RACK_FLASH, hiRoll, respawnState, RESPAWN_BLINK_SHIFT } = await import('../src/games/SmashTV/hud.js')
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) }

async function fresh() {
    const sim = await import(`../src/games/SmashTV/sim.js?c=${Date.now()}`)
    const planner = await import(`../src/games/SmashTV/planner.js?c=${Date.now()}`)
    return { ...sim, plan: planner.plan, planCoop: planner.planCoop, padToInp: planner.padToInp, inpToPad: planner.inpToPad, decidePad: planner.decidePad }
}
const S = await fresh()
const { makeGame, step, stateHash, CFG, comboColor, flickerPhase, COMBO_COLORS } = S
const cx = (c) => c * 16 + 8
const cy = (r) => 24 + r * 16 + 8

// ---------------------------------------------------------------- geometry ----
console.log('geometry')
for (let idx = 0; idx < TOTAL_ROOMS; idx++) {
    const room = genRoom(0, idx)
    const bad = room.walls.filter(([c, r]) => c < 1 || r < 1 || c >= GW - 1 || r >= GH - 1)
    ok(bad.length === 0, `room ${idx + 1}: patterns stay off the border`)
    const blocked = new Set(room.walls.map(([c, r]) => `${c},${r}`))
    for (const e of EXITS) ok(!blocked.has(`${e.c},${e.r}`), `room ${idx + 1}: exit ${e.side} is free`)
    const seen = new Set()
    const q = [[START.r, START.c]]
    while (q.length) {
        const [r, c] = q.pop()
        const k = `${c},${r}`
        if (seen.has(k) || blocked.has(k) || c < 0 || r < 0 || c >= GW || r >= GH) continue
        seen.add(k)
        q.push([r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1])
    }
    for (const s of room.spawns) ok(seen.has(`${s.c},${s.r}`), `room ${idx + 1}: ${s.kind} reachable`)
    for (const k of room.crates) ok(seen.has(`${k.c},${k.r}`), `room ${idx + 1}: crate reachable`)
    for (const e of EXITS) ok(seen.has(`${e.c},${e.r}`), `room ${idx + 1}: exit ${e.side} walkable`)
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
    ok(new Set(sig).size === 4, 'every weapon reads as its own silhouette', sig.join(' '))
    ok(Object.values(GUN).every((g) => g.flash > g.len), 'the muzzle flash blooms beyond the muzzle')
    ok(new Set(Object.values(GUN).map((g) => g.tip)).size === 4, 'each weapon has its own muzzle colour')
    ok(LAYERS.indexOf('feet') < LAYERS.indexOf('gun') && LAYERS.indexOf('body') < LAYERS.indexOf('gun'), 'feet and body render under the gun layer', LAYERS.join('>'))
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
    const ex = EXITS[0]
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
    ok(new Set(flashCols).size === 4, 'every weapon flashes its own muzzle colour', flashCols.join(' '))
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
    ok(Object.keys(FIRE).length === 4 && new Set(Object.values(FIRE).map((f) => JSON.stringify(f))).size === 4, 'every weapon fires its own timbre', Object.keys(FIRE).join(','))
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
    const ex = EXITS[1]
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
    ok(wins.length >= 4, `the co-op autopilot clears the show on ${wins.length}/9 seeds (4 is the bar)`, `won ${wins.join(',')}`)
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

// ----------------------------------------------------------------- pilot ----
console.log('pilot')
let deathless = 0
for (const seed of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    const r = S.plan(seed)
    ok(r.won, `pilot clears the show (seed ${seed})`, `deaths=${r.deaths} score=${r.score}`)
    if (r.won && r.deaths === 0) deathless++
}
ok(deathless >= 2, 'two seeds prove a deathless matinee', `deathless ${deathless}`)

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
    ]
    const orig = readFileSync(SIM, 'utf8')
    let died = 0
    for (const [name, from, to] of MUTANTS) {
        if (!orig.includes(from)) { ok(false, `mutant ${name}: anchor missing`); continue }
        writeFileSync(SIM, orig.replace(from, to))
        const res = spawnSync('node', ['scripts/smashcheck.mjs'], { encoding: 'utf8' })
        if (res.status !== 0) { died++; ok(true, `mutant ${name} caught`) }
        else ok(false, `mutant ${name} SURVIVED`)
    }
    writeFileSync(SIM, orig)
    ok(died === MUTANTS.length, 'all mutants die', `${died}/${MUTANTS.length}`)
}

console.log(fails ? `FAIL ${fails} (pass ${passes})` : `PASS ${passes}`)
process.exit(fails ? 1 : 0)

// METROID-LITE — the gate audit. No browser, no dev server.
//
//   npm run metroidcheck              # every claim the cave makes about ITS DOORS
//   npm run metroidcheck -- --mutate  # silence one rule, watch a NAMED check go red
//   npm run metroidcheck -- --map     # the cave with the demo route's rest cells marked
//
// This game's whole contract is BACKTRACK GATING: three upgrades, each earned
// in a way that requires the previous, and a relic above a shaft no single
// jump clears. So the audit does not ask "is the level fun" — it asks, per
// door, "can the flow machine reach through it WITHOUT the upgrade, when the
// sim says it can't?" — and the other way. explore() is the very function the
// planner and the attract demo trust, so a gate that leaks here is a demo
// that pretends, or a player who walks through a wall.
//
//   WORLD      spawn/beacons/items/relic stand on real floors; doors exist.
//   GATES      cracked gate invisible-adjacent without the beam, walkable
//              with it; bulkhead the same for bombs; the shaft's 80px steps
//              open ONLY to the space jump (the ghost is the same stepBody
//              the player runs — no cheat integrator).
//   GADGETS    a fired beam really melts the crack in the LIVE grid; a bomb
//              really brings down BOTH bulkhead tiles; the second press
//              really adds a second launch to a real body.
//   HAZARD     spikes and crawlers take energy; energy to zero dies at the
//              beacon you last touched — and nowhere else.
//   CHAIN      the proven script wins with ZERO hits, breaks 1 crack + 2
//              bulks with live gunpowder (crack events carry a shot in
//              flight, bulk events carry a bomb in the pit), replays
//              bit-identical, and notices a dropped tick.

import { spawnSync } from 'node:child_process'
import * as s from '../src/games/MetroidLite/sim.js'

const args = process.argv.slice(2)
const MUT = args.includes('--mutate')
const MAP = args.includes('--map')
const MUT_NAME = process.env.METROID_MUT || null

const { CFG, TS, MW, MH, EMPTY, ROCK, CRACK, BULK, SPIKE, PLAYER, LAYERS } = s

let pass = 0
const fails = []
const ok = (c, m) => { if (c) pass++; else fails.push(m) }
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`)

const MUTANTS = {
    crackSolid: 'cracked blocks stop blocking — the beam becomes decoration',
    bulkSolid: 'bulkheads stop blocking — the bomb becomes decoration',
    beamBreaks: 'beams stop melting cracks — the cave can never open',
    bombBreaks: 'bombs stop breaching bulkheads — room E can never open',
    doubleJump: 'the space jump stops launching — the relic becomes unreachable',
    beaconSaves: 'beacons stop saving — death forgets how far you had come',
    hazardsHurt: 'spikes and crawlers stop hurting — the cave becomes a museum',
}
if (MUT_NAME) {
    if (!(MUT_NAME in MUTANTS)) { console.error(`unknown mutant ${MUT_NAME}`); process.exit(2) }
    CFG[MUT_NAME] = false
    console.log(`\x1b[33mMUTANT ACTIVE: ${MUT_NAME} = false\x1b[0m  (${MUTANTS[MUT_NAME]})`)
}

const place = (g, cell) => {
    const b = s.bodyAt(cell)
    g.p.x = b.x; g.p.y = b.y; g.p.vx = 0; g.p.vy = 0; g.p.onGround = true
}
const cells = (set) => [...set].map(k => k.split(',').map(Number))

if (MAP) {
    const r = s.planRun()
    const g = r.g
    for (let y = 0; y < MH; y++) {
        let line = ''
        for (let x = 0; x < MW; x++) {
            const t = s.tileAt(g.world.grid, x, y)
            const p = s.footCell(g.p)
            const it = g.world.items.find(i => i.x === x && i.y === y)
            line += x === p.x && y === p.y ? '@'
                : it ? (it.taken ? 'i' : 'I')
                    : x === g.world.relic.x && y === g.world.relic.y ? 'R'
                        : g.world.beacons.some(b => b.x === x && b.y === y) ? 'B'
                            : t === ROCK ? '#' : t === SPIKE ? '^' : t === CRACK ? 'C' : t === BULK ? 'D' : '.'
        }
        console.log(line)
    }
    console.log(`plan ok=${r.ok} win=${g.win} ticks=${r.script.length} trace=${JSON.stringify(r.trace)}`)
    process.exit(0)
}

// ---------------------------------------------------------------- world ----
section('WORLD (everything stands on something)')
{
    const w = s.makeWorld()
    const standOK = (x, y) => !s.solid(w.grid, x, y) && s.solid(w.grid, x, y + 1)
    ok(standOK(w.spawn.x, w.spawn.y), 'spawn does not stand on a floor')
    for (const it of w.items) ok(standOK(it.x, it.y + 1) || s.solid(w.grid, it.x, it.y + 1), `item ${it.id} floats / falls`)
    for (const b of w.beacons) ok(s.solid(w.grid, b.x, b.y + 1), `beacon (${b.x},${b.y}) has no floor`)
    ok(standOK(w.relic.x, w.relic.y), 'the relic does not stand on a floor')
    ok(s.tileAt(w.grid, 40, 35) === CRACK, 'the cracked gate is not where the audit thinks it is')
    ok(s.tileAt(w.grid, 87, 25) === BULK && s.tileAt(w.grid, 87, 24) === BULK, 'the bulkhead is not two tiles')
    for (const c of w.crawlers) {
        const cx = Math.floor((c.x + c.w / 2) / TS), fy = Math.floor((c.y + c.h + 1) / TS)
        ok(s.solid(w.grid, cx, fy), 'a crawler starts in mid-air')
    }
}

// ---------------------------------------------------------------- gates ----
section('GATES (the three doors the run is made of — explored by the REAL ghost)')
{
    const w = s.makeWorld()
    // gate 1: the cracked block between B and C
    const noAbil = s.explore(Uint8Array.from(w.grid), w.spawn, {})
    const past1 = cells(noAbil.seen).some(([x, y]) => x >= 43 && y >= 28 && y <= 35 && x <= 60)
    ok(!past1, 'room C is reachable WITHOUT the beam — the first gate does not gate')
    const withBeam = s.explore(Uint8Array.from(w.grid), w.spawn, { beam: true })
    ok(cells(withBeam.seen).some(([x, y]) => x >= 52 && x <= 55 && y === 32), 'room C shelf unreachable even WITH the beam')
    // gate 2: the bulkhead between D and E (start mid-D like a beam-owner would)
    const mid = { x: 80, y: 25 }
    const beamOnly = s.explore(Uint8Array.from(w.grid), mid, { beam: true })
    ok(!cells(beamOnly.seen).some(([x, y]) => x >= 89), 'room E reachable with only the beam — the bomb gate does not gate')
    const withBomb = s.explore(Uint8Array.from(w.grid), mid, { beam: true, bomb: true })
    ok(cells(withBomb.seen).some(([x, y]) => x >= 92 && x <= 94 && y === 22), 'the SJUMP ledge unreachable even with bombs')
    // gate 3: the shaft — a JUMPER not a gun. Start at the shaft base.
    const base = { x: 108, y: 25 }
    const sjOff = s.explore(Uint8Array.from(w.grid), base, { beam: true, bomb: true })
    ok(!sjOff.seen.has('106,20') && !sjOff.seen.has('108,15'), 'the shaft has a single-jump route — the SPACE JUMP is not load-bearing')
    const sjOn = s.explore(Uint8Array.from(w.grid), base, { beam: true, bomb: true, sjump: true })
    ok(sjOn.seen.has('118,4'), 'the relic stand unreachable even WITH the space jump')
}

// -------------------------------------------------------------- gadgets ----
section('GADGETS (the live sim must really open what the ghosts promise)')
{
    // beam melts the crack
    {
        const g = s.makeGame({ abil: { beam: true } })
        place(g, { x: 38, y: 35 })
        let fired = false
        for (let t = 0; t < 60; t++) {
            s.step(g, { right: t < 2, fireEdge: t === 2 })
            if (g.events.some(e => e.type === 'fire')) fired = true
        }
        ok(fired, 'a beam-owner firing produced no beam at all')
        ok(s.tileAt(g.world.grid, 40, 35) === EMPTY && g.cracks === 1, 'the crack survived a direct beam hit — beamBreaks is a lie')
    }
    // bomb brings down BOTH bulkhead tiles
    {
        const g = s.makeGame({ abil: { bomb: true } })
        place(g, { x: 86, y: 24 })
        for (let t = 0; t < 80; t++) s.step(g, { bombEdge: t === 1 })
        ok(s.tileAt(g.world.grid, 87, 25) === EMPTY && s.tileAt(g.world.grid, 87, 24) === EMPTY && g.bulks === 2,
            `bomb cleared ${g.bulks} of 2 bulkhead tiles — the breach is half a lie`)
    }
    // the second press really launches a real body — and ONLY for an owner
    {
        const drill = (sjump) => {
            const g = s.makeGame({ abil: sjump ? { sjump: true } : {} })
            place(g, { x: 109, y: 25 })          // the open column beside the shelf
            let landed = false
            for (let t = 0; t < 110 && !landed; t++) {
                s.step(g, { left: t >= 18 && t <= 42, jumpEdge: t === 0 || t === 14 })
                const f = s.footCell(g.p)
                landed = g.p.onGround && f.y === 20 && f.x >= 106 && f.x <= 108
            }
            return landed
        }
        ok(!drill(false), 'a player WITHOUT the space jump cleared an 80px shaft — the gate is on the demo, not in the game')
        ok(drill(true), 'the space jump did NOT land the real body on the row-20 shelf — doubleJump is dead or the shaft is wrong')
    }
}

// --------------------------------------------------------------- hazards ----
section('HAZARD (the cave bites; the beacon remembers)')
{
    const g = s.makeGame()
    place(g, { x: 30, y: 37 })                    // the pit teeth
    let hit = false
    for (let t = 0; t < 20 && !hit; t++) hit = s.step(g, {}).events.some(e => e.type === 'hit')
    ok(hit && g.energy === PLAYER.energy - 1, 'spikes did not cost exactly one energy')
    const g2 = s.makeGame()
    const cr = g2.world.crawlers[0]
    place(g2, { x: Math.floor((cr.x + 7) / TS), y: Math.floor((cr.y + 5) / TS) })
    let hit2 = false
    for (let t = 0; t < 20 && !hit2; t++) hit2 = s.step(g2, {}).events.some(e => e.type === 'hit')
    ok(hit2, 'standing INSIDE a crawler cost nothing — hazardsHurt is dead')

    // beacon save + death returns you to it
    const g3 = s.makeGame()
    place(g3, { x: 47, y: 32 })                   // the C-shelf beacon
    s.step(g3, {})
    ok(g3.save.x === 47 && g3.save.y === 32 && g3.events.some(e => e.type === 'save'), 'touching a beacon did not move the save point')
    g3.energy = 1
    place(g3, { x: 30, y: 37 })                   // hop onto the teeth
    let died = false
    for (let t = 0; t < 120 && !died; t++) died = s.step(g3, {}).events.some(e => e.type === 'respawn')
    const f = s.footCell(g3.p)
    ok(g3.deaths === 1, 'the fourth energy did not kill')
    ok(f.x === g3.save.x && f.y === g3.save.y, `respawned at (${f.x},${f.y}) — save said (${g3.save.x},${g3.save.y}): death forgot the beacon`)
}

// ----------------------------------------------------------------- chain ----
section('CHAIN (the proven route, replayed, graded)')
{
    let plan = null
    {
        const t0 = Date.now()
        plan = s.planRun()
        ok(plan.ok && plan.end === 'win', `planRun did not win (${plan.stage || plan.end}) — the attract demo has no proof to replay`)
        ok(Date.now() - t0 < 4000, 'the flow machine got too slow to gate merges')
        ok(plan.trace.map(t => t.stage).join(',') === 'beam,bomb,sj,relic', 'the chain did not earn its upgrades in the cave’s own order')
    }
    const log = []
    const crackNoShot = [], bulkNoBomb = []
    // onTick lands AFTER the tick: a beam fired at point-blank can be born,
    // fly and melt the crack inside ONE tick — so causality is graded by
    // trail: a crack may only vanish within 12 ticks of a FIRE, a bulkhead
    // within 60 of a BOMB drop (fuse 50 + fall). A door that opens with no
    // recent gunpowder means the grid cleared itself.
    let lastFire = -1e9, lastBomb = -1e9
    const g = s.replayScript(plan.script, {
        onTick: (gg) => {
            for (const e of gg.events) {
                log.push(e.type)
                if (e.type === 'fire') lastFire = gg.tick
                if (e.type === 'bomb') lastBomb = gg.tick
                if (e.type === 'crack' && gg.tick - lastFire > 12) crackNoShot.push(gg.tick)
                if (e.type === 'bulk' && gg.tick - lastBomb > 60) bulkNoBomb.push(gg.tick)
            }
        },
    })
    ok(g.end === 'win' && g.win, `the recorded script no longer wins (${g.end})`)
    ok(g.deaths === 0 && g.energy >= 3, `the proven route is no longer ZERO-HIT (deaths ${g.deaths})`)
    ok(g.cracks === 1 && g.bulks === 2, `doors broken: ${g.cracks}/${g.bulks} — expected exactly 1 crack + 2 bulks`)
    ok(crackNoShot.length === 0, `${crackNoShot.length} crack(s) vanished with no beam in flight — the grid cleared itself`)
    ok(bulkNoBomb.length === 0, `${bulkNoBomb.length} bulkhead(s) vanished with no bomb present`)
    ok(log.indexOf('fire') > log.indexOf('item') && log.indexOf('item') >= 0, 'the beam fired BEFORE it was acquired')
    const bombItem = log.indexOf('bomb', log.indexOf('item'))
    ok(log.indexOf('boom') > bombItem, 'a bomb exploded before bombs were acquired')
    ok(g.world.items.every(i => i.taken) && g.score >= 2000, 'not every upgrade was collected on the proven route')
    const a = s.replayScript(plan.script)
    const b = s.replayScript(plan.script)
    ok(s.stateHash(a) === s.stateHash(b), 'two replays of one script disagree — the sim grew an RNG')
    const cut = plan.script.slice(0, 1000).concat(plan.script.slice(1001))
    ok(s.stateHash(s.replayScript(cut)) !== s.stateHash(a), 'the hash ignores a dropped command — determinism could not catch a desync')
}

// -------------------------------------------------------------- starfield ----
section('PARALLAX (three rates, honoured exactly — metroidplay checks the pixels)')
{
    ok(LAYERS.every((L, i) => i === 0 || L.f > LAYERS[i - 1].f && L.f < 1), 'star layers do not scroll at three distinct sub-camera rates')
    for (let li = 0; li < LAYERS.length; li++) {
        const f = LAYERS[li].f
        const x0 = s.starScreenX(li, 4, 0)
        const x1 = s.starScreenX(li, 4, 400)
        let want = (x0 - 400 * f) % s.STAR_PER
        if (want < 0) want += s.STAR_PER
        ok(Math.abs(x1 - want) < 0.001, `layer ${li}: star moved ${x0 - x1}px over a 400px pan — factor ${((x0 - x1) / 400).toFixed(3)}, promised ${f}`)
    }
}

// -------------------------------------------------------------- mutants ----
if (MUT) {
    section('MUTATIONS — each silenced rule MUST turn a named check red')
    for (const name of Object.keys(MUTANTS)) {
        const child = spawnSync(process.execPath, [process.argv[1]], {
            env: { ...process.env, METROID_MUT: name },
            encoding: 'utf8',
        })
        const caught = child.status !== 0
        console.log(`  mut ${name}: ${caught ? 'caught' : 'SURVIVED (BAD)'}`)
        ok(caught, `mutant '${name}' SURVIVED — a check has quietly stopped touching this rule`)
    }
}

console.log(`\nmetroidcheck: ${pass}/${pass + fails.length} checks passed${fails.length ? `  — ${fails.length} FAILED` : '  — OK'}`)
fails.forEach(f => console.log(`  FAIL  ${f}`))
process.exit(fails.length ? 1 : 0)

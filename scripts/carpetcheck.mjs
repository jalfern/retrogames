// carpetcheck.mjs — MAGIC CARPET proof: boots, rules hold, three worlds reach equilibrium.
//
// Node-first (sim is pure), then a short real-browser pass via the game contract.
// Run: npm run dev in another terminal, then `npm run carpetcheck`.
//
// Mutation guide (prove it can fail): change the win check `gs.bank >= gs.quota`
// to `gs.bank >= gs.quota * 100` in src/games/MagicCarpet/sim.js and watch
// 'equilibrium' go red; restore.

import { readFile } from 'node:fs/promises'
import { launch, openGame, requireDevServer, Report } from './lib/harness.mjs'
import {
    LEVELS, QUOTA, SPILLS, BOUNTY, MAP, spellById, sampleH,
    makeGame, step, autopilot, stateHash, CRATER_GLOW, glowOf, toppleTower, settleGround, CRUMBLE_T,
    setHand, INVIS_T, hudTap, cycleL, TAP, TRAY, W, H, HUD_H,
    muffleOf, OPEN_CUTOFF, MUFFLE_CUTOFF, volcanoErupt, raiseTerrain, shatterAt, SHATTER_R, WATER, crater,
    DISSOLVE_R, DISSOLVE_SINK, dissolveLand, GRID, CELL,
    crumbleFeel, CRUMBLE_HEAR_R,
    cloneAt, CLONE_R, CLONE_MAX, SPAWN_HP, lookPoint, genWorld,
} from '../src/games/MagicCarpet/sim.js'

const wrap = (v, m) => ((v % m) + m) % m
const wrapD = (v) => wrap(v + MAP / 2, MAP) - MAP / 2

const r = new Report('carpetcheck')
const run = (seed, maxTicks, scriptFn = autopilot) => {
    const gs = makeGame(seed)
    let i = 0
    while (!gs.end && i < maxTicks) { step(gs, scriptFn(gs)); i++ }
    return gs
}

// ---- boot
const fresh = makeGame(7)
r.check('world 1 built: 56 pearls, wizard hoards 80, 12 books, one known spell, empty vault',
    fresh.pearls.length === 56 && fresh.wizard.mana === LEVELS[0].hoard && fresh.books.length === 12 &&
    fresh.learned.length === 1 && fresh.bank === 0 && fresh.level === 0,
    `pearls=${fresh.pearls.length} hoard=${fresh.wizard.mana} books=${fresh.books.length} bank=${fresh.bank}`)
const g0 = run(7, 600, () => ({}))
r.check('boots and steps 600 ticks idle', g0.tick === 600 && !g0.end, `tick=${g0.tick}`)

// ---- determinism
const d1 = run(7, 600), d2 = run(7, 600), d3 = run(8, 600)
r.check('seed 7 twice → identical hash', stateHash(d1) === stateHash(d2), `${stateHash(d1)} vs ${stateHash(d2)}`)
r.check('seed 8 → different hash', stateHash(d1) !== stateHash(d3))

// ---- three worlds: level progression and equilibrium
{
    const gs = run(7, 120000)
    r.check('three worlds: seed 7 levels 1→2→3 and wins at the final quota',
        gs.end === 'win' && gs.level === 2 && gs.levelClears === 2 && gs.bank >= gs.quota,
        `end=${gs.end} level=${gs.level + 1} bank=${Math.floor(gs.bank)}/${gs.quota} tick=${gs.tick}`)
    r.check('banked vault (not carried mana) is what reaches the quota', gs.bank >= QUOTA, `bank=${Math.floor(gs.bank)} quota=${QUOTA}`)
    const gs2 = run(88, 120000)
    r.check('seed 88 also restores all three worlds', gs2.end === 'win' && gs2.level === 2, `end=${gs2.end} level=${gs2.level + 1}`)
}

// ---- carrying an over-quota load does NOT win; only delivery does
{
    const gs = makeGame(7)
    gs.mana = QUOTA + 50
    gs.x = wrap(gs.castle.x + 120, MAP); gs.y = gs.castle.y
    for (let i = 0; i < 30; i++) step(gs, {})
    r.check('carrying more than the quota away from the castle does not win',
        !gs.end && gs.bank === 0, `end=${gs.end} bank=${gs.bank}`)
}

// ---- bank-by-delivery over the castle
{
    const gs = makeGame(7)
    gs.mana = 24
    gs.x = gs.castle.x; gs.y = gs.castle.y; gs.alt = Math.max(gs.alt, sampleH(gs, gs.x, gs.y) + 4)
    for (let i = 0; i < 20; i++) step(gs, {})
    r.check('hovering the castle banks the carried load into the vault',
        gs.bank === 24 && gs.mana === 0, `bank=${gs.bank} carry=${gs.mana}`)
}

// ---- death spills the carried load, the vault endures
{
    const gs = makeGame(7)
    gs.bank = 40; gs.mana = 30; gs.shield = 0; gs.hp = 6
    const wolf = gs.monsters.find((m) => m.kind === 'wolf')
    let i = 0
    while (gs.deaths === 0 && i < 400) {
        step(gs, {})
        if (gs.monsters.includes(wolf)) { wolf.x = gs.x + 3; wolf.y = gs.y; wolf.grabbed = false; wolf.cool = 0; gs.alt = Math.min(gs.alt, sampleH(gs, wolf.x, wolf.y) + 4) }
        i++
    }
    r.check('death spills the carried load but the vault (and respawn) survives',
        gs.deaths === 1 && !gs.end && gs.bank === 40 && gs.mana === 0 && gs.spilled === 30,
        `deaths=${gs.deaths} bank=${gs.bank} carry=${gs.mana} spilled=${gs.spilled}`)
    const gs2 = makeGame(7)
    gs2.bank = 0; gs2.mana = 5; gs2.shield = 0; gs2.hp = 6
    const w2 = gs2.monsters.find((m) => m.kind === 'wolf')
    let j = 0
    while (!gs2.end && j < 400) {
        step(gs2, {})
        if (gs2.monsters.includes(w2)) { w2.x = gs2.x + 3; w2.y = gs2.y; w2.grabbed = false; w2.cool = 0; gs2.alt = Math.min(gs2.alt, sampleH(gs2, w2.x, w2.y) + 4) }
        j++
    }
    r.check('dying with an empty vault ends the flight (load lost with it)',
        gs2.end === 'dead' && gs2.spilled === 5, `end=${gs2.end} spilled=${gs2.spilled}`)
}

// ---- terrain reshaping: fireballs and lightning crater the land itself
{
    const gs = makeGame(7)
    gs.monsters.length = 0
    gs.wizard.alive = false
    gs.mana = 15; gs.coolL = 0
    const snap = { heights: gs.heights.slice() }
    let impact = null
    let i = 0
    while (i < 80 && !impact) {
        step(gs, i === 0 ? { castL: true } : {})
        for (const e of gs.events) if (e.type === 'boom') impact = e
        gs.events.length = 0
        i++
    }
    const hB = impact ? sampleH(snap, impact.x, impact.y) : 0
    // #1694 crumble: the crater unfolds over CRUMBLE_T ticks — land it before sampling
    if (impact) settleGround(gs)
    const hA = impact ? sampleH(gs, impact.x, impact.y) : 0
    r.check('fireball impact craters the terrain (heightmap actually deforms)',
        impact && hB - hA >= 3, `impact=${!!impact} ${hB.toFixed(1)} → ${hA.toFixed(1)}`)

    const gs2 = makeGame(7)
    gs2.monsters.length = 0
    gs2.wizard.alive = false
    gs2.mana = 25; gs2.coolR = 0
    gs2.learned.push('lightning'); gs2.hands.R = 'lightning'
    const snap2 = { heights: gs2.heights.slice() }
    let zapAt = null
    let j = 0
    while (j < 10 && !zapAt) { step(gs2, j === 0 ? { castR: true } : {}); for (const e of gs2.events) if (e.type === 'zap') zapAt = e; gs2.events.length = 0; j++ }
    if (zapAt) settleGround(gs2)
    const hL0 = zapAt ? sampleH(snap2, zapAt.x, zapAt.y) : 0
    const hL1 = zapAt ? sampleH(gs2, zapAt.x, zapAt.y) : 0
    r.check('lightning craters the ground where it strikes',
        zapAt && hL0 - hL1 >= 2, `zap=${!!zapAt} ${hL0.toFixed(1)} → ${hL1.toFixed(1)}`)
}

// ---- villages burn: fire that touches a hut ignites it, and it falls
{
    const gs = makeGame(7)
    gs.monsters.length = 0
    gs.wizard.alive = false
    gs.mana = 15; gs.coolL = 0
    const scout = JSON.parse(JSON.stringify(gs))
    let boomSpot = null
    let k = 0
    while (k < 80 && !boomSpot) {
        step(scout, k === 0 ? { castL: true } : {})
        for (const e of scout.events) if (e.type === 'boom') boomSpot = e
        scout.events.length = 0
        k++
    }
    const hs = gs.huts[0]
    hs.x = boomSpot.x; hs.y = boomSpot.y
    hs.burn = 0; hs.dead = false
    let ignited = false, i = 0
    while (i < 80 && !ignited) {
        step(gs, i === 0 ? { castL: true } : {})
        for (const e of gs.events) if (e.type === 'ignite') ignited = true
        gs.events.length = 0
        i++
    }
    let j = 0
    while (j < 260 && !hs.dead) { step(gs, {}); gs.events.length = 0; j++ }
    r.check('a hut in the blast ignites and burns to rubble', ignited && hs.dead, `ignited=${ignited} dead=${hs.dead}`)
}

// ---- fire spreads: a burning hut arms its neighbours (~120 ticks), far huts stay safe
{
    const gs = makeGame(7)
    gs.monsters.length = 0
    gs.wizard.alive = false
    gs.quota = 9999
    gs.huts.length = 0
    gs.huts.push({ x: 100, y: 100, v: 0, burn: 200, dead: false, catchT: 0 })
    gs.huts.push({ x: 112, y: 100, v: 1, burn: 0, dead: false, catchT: 0 })
    gs.huts.push({ x: 160, y: 100, v: 2, burn: 0, dead: false, catchT: 0 })
    const near = gs.huts[1], far = gs.huts[2]
    let caughtAt = -1, i = 0
    while (i < 190 && caughtAt < 0) {
        step(gs, {})
        if (caughtAt < 0 && near.burn > 0) caughtAt = i
        gs.events.length = 0
        i++
    }
    r.check('fire spreads: neighbouring hut catches ~120 ticks later, a 60u hut never does',
        caughtAt > 110 && caughtAt < 130 && far.burn === 0 && far.catchT === 0,
        `caughtAt=${caughtAt} farBurn=${far.burn} farCatchT=${far.catchT}`)
}

// ---- fresh craters glow with lava and cool over ~300 ticks (fire craters only)
{
    const gs = makeGame(7)
    gs.monsters.length = 0
    gs.wizard.alive = false
    gs.quota = 9999
    gs.mana = 15; gs.coolL = 0
    let boom = null, i = 0
    while (i < 80 && !boom) {
        step(gs, i === 0 ? { castL: true } : {})
        for (const e of gs.events) if (e.type === 'boom') boom = e
        gs.events.length = 0
        i++
    }
    const hot = boom ? gs.craters.find((c) => c.hot === 1) : null
    const freshGlow = hot ? glowOf(gs, hot) : 0
    for (let j = 0; j < CRATER_GLOW + 5; j++) { step(gs, {}); gs.events.length = 0 }
    const oldGlow = hot ? glowOf(gs, hot) : 1
    r.check('a fireball crater is born glowing hot and its lava cools to nothing after CRATER_GLOW ticks',
        boom && hot && freshGlow > 0.9 && oldGlow === 0 && gs.craters.length <= 10,
        `glow ${freshGlow.toFixed(2)} → ${oldGlow.toFixed(2)} craters=${gs.craters.length}`)
}

// ---- telekinesis throws and fireballs topple the wizard's tower at its base
{
    const gs = makeGame(7)
    gs.quota = 9999
    const tx = gs.wizard.tx, ty = gs.wizard.ty
    const hp0 = gs.wizard.hp
    r.check('toppling is refused far from the tower base',
        toppleTower(gs, gs.wizard.tx + 40, gs.wizard.ty + 40) === false && !gs.towerDown)
    const down = toppleTower(gs, tx + 3, ty - 2)
    r.check('a throw landing at the tower base topples it (once per world, wizard takes the fall)',
        down && gs.towerDown && gs.wizard.hp === hp0 - 30 &&
        toppleTower(gs, tx, ty) === false,
        `down=${down} towerDown=${gs.towerDown} hp ${hp0}→${gs.wizard.hp}`)
}

// ---- mana conservation through a real campaign (vault + pouch + pearls + hoard)
{
    const gs = makeGame(7)
    const pearlMana = (s) => s.pearls.reduce((a, p) => a + (p.alive ? p.m : 0), 0)
    const total = (s) => Math.floor(s.bank) + Math.floor(s.mana) + pearlMana(s) + (s.wizard.alive ? s.wizard.mana : 0)
    let t0 = total(gs)
    let spent = 0, bounty = 0
    let i = 0
    while (!gs.end && i < 120000) {
        step(gs, autopilot(gs))
        for (const e of gs.events) {
            if (e.type === 'cast') spent += spellById(e.id).cost
            if (e.type === 'kill') bounty += BOUNTY[e.kind]
            if (e.type === 'spill') spent += e.m
            if (e.type === 'level') {
                t0 -= e.reset.bank + e.reset.pearls + e.reset.hoard
                t0 += pearlMana(gs) + LEVELS[e.n].hoard
            }
        }
        gs.events.length = 0
        i++
    }
    const t1 = total(gs)
    r.check('mana conserved: vault+pouch+pearls+hoard == start + bounty − spent − spilled (world resets rebased)',
        t1 === t0 + bounty - spent, `${t0} +${bounty} -${spent} = ${t0 + bounty - spent}, saw ${t1} (end=${gs.end})`)
}

// ---- acquisition risk: the book both grants and eludes, across seeds
{
    let learns = 0, fizzles = 0
    for (let seed = 1; seed <= 40; seed++) {
        const gs = makeGame(seed)
        let i = 0
        while (!gs.end && i < 6000) {
            step(gs, autopilot(gs))
            for (const e of gs.events) {
                if (e.type === 'learn') learns++
                if (e.type === 'fizzle') fizzles++
            }
            gs.events.length = 0
            i++
        }
    }
    r.check('grimoire acquisition risk: both learn and fizzle happen', learns > 0 && fizzles > 0, `learns=${learns} fizzles=${fizzles}`)
}

// ---- spells cost carried mana and refuse without it
{
    const gs = makeGame(7)
    gs.mana = 0
    gs.coolL = 0
    step(gs, { castL: true })
    const denied = gs.events.some((e) => e.type === 'nomana' || e.type === 'deny')
    r.check('casting without mana is denied (no fireball, no debt)', denied && gs.projs.length === 0 && gs.mana === 0)
    gs.mana = 15
    step(gs, { castL: true })
    const castOk = gs.events.some((e) => e.type === 'cast') && gs.mana === 0 && gs.projs.some((p) => p.kind === 'fireball')
    r.check('fireball fires for exactly its cost from the pouch', castOk, `mana=${gs.mana}`)
}

// ---- carpet rules: cannot crash, auto-rises
{
    const gs = makeGame(7)
    let minClear = 1e9
    for (let i = 0; i < 2000 && !gs.end; i++) {
        step(gs, { up: false, down: true })
        minClear = Math.min(minClear, gs.alt)
    }
    r.check('holding down never buries the carpet', minClear > 14, `min alt ${minClear.toFixed(1)}`)
}

// ---- charge-glide: the speed button (Shift / hold ▲ in the shell → inp.boost)
// Mutation guide: set CFG.boost to 1 in sim.js and the speed check goes red;
// set CFG.boostTurn to 1 and the wide-turn check goes red.
{
    const glide = (inp) => {
        const gs = makeGame(7)
        const x0 = gs.x, y0 = gs.y
        let prevM = gs.mana, spent = 0
        for (let i = 0; i < 60 && !gs.end; i++) {
            step(gs, inp)
            if (gs.mana < prevM) spent += prevM - gs.mana
            prevM = gs.mana
        }
        return { d: Math.hypot(wrapD(gs.x - x0), wrapD(gs.y - y0)), yaw: Math.abs(gs.yaw), spent }
    }
    const sN = glide({}), sB = glide({ boost: true })
    const tN = glide({ left: true }), tB = glide({ left: true, boost: true })
    const speed = sB.d / sN.d
    const turn = tB.yaw / tN.yaw
    r.check('charge-glide: 60 boosted ticks cover ~1.6× the cruise distance',
        speed > 1.5 && speed < 1.7, `ratio ${speed.toFixed(2)} (${sN.d.toFixed(0)} → ${sB.d.toFixed(0)} u)`)
    r.check('charge-glide turns wider: heading gain ~0.55× at speed',
        turn > 0.5 && turn < 0.6, `yaw ratio ${turn.toFixed(2)} (radius ×${(speed / turn).toFixed(1)})`)
    r.check('charge-glide is mana-free (nothing spent while gliding)',
        sB.spent === 0 && tB.spent === 0, `spent ${sB.spent}/${tB.spent}`)
}

// ---- wizard hoard scatters (as pearls) when tower and wizard fall
{
    const gs = makeGame(7)
    const hoard = gs.wizard.mana
    const tx = gs.wizard.tx, ty = gs.wizard.ty
    gs.quota = 9999
    const hBefore = sampleH(gs, tx, ty)
    gs.mana = 160
    gs.wizard.hp = 14
    const before = gs.pearls.filter((p) => p.alive).reduce((a, p) => a + p.m, 0)
    let i = 0
    while (gs.wizard.alive && i < 4000) { step(gs, autopilot(gs)); i++ }
    settleGround(gs) // #1694: let the tower crater land before reading it
    const after = gs.pearls.filter((p) => p.alive).reduce((a, p) => a + p.m, 0) + Math.floor(gs.mana)
    const hAfter = sampleH(gs, tx, ty)
    r.check('slaying the wizard scatters his hoard as pearls and craters his tower',
        !gs.wizard.alive && after >= before + hoard - 15 && hBefore - hAfter >= 3,
        `pearl mana ${before} → ${after} (hoard ${hoard}), tower ground ${hBefore.toFixed(0)} → ${hAfter.toFixed(0)}`)
}

// ---- roster + INVISIBILITY (#1610): the original's veil, done whole
// (#1612 item 5 grew the roster to eight with VOLCANO; #1639 to ten with
// SHATTER and RAISE; #1668 to eleven with DISSOLVE; #1680 to twelve with CLONE.)
{
    r.check('twelve signature spells with costs', SPILLS.length === 12 &&
        ['fireball', 'lightning', 'heal', 'protect', 'slow', 'telekinesis', 'invisibility', 'volcano', 'shatter', 'raise', 'dissolve', 'clone'].every((id) => spellById(id)?.cost > 0))

    const veilUp = (gs) => {
        gs.learned.push('invisibility')
        setHand(gs, 'L', 'invisibility')
        gs.mana = 40
        step(gs, { castL: true })
    }
    // Cast mechanics: spends the pouch, raises the veil for INVIS_T world ticks.
    {
        const gs = makeGame(7)
        veilUp(gs)
        const castEv = gs.events.some((e) => e.type === 'cast' && e.id === 'invisibility')
        gs.events.length = 0
        let expired = false
        for (let i = 0; i < INVIS_T + 5 && !expired; i++) {
            expired = gs.events.some((e) => e.type === 'invisEnd'); gs.events.length = 0; step(gs, {})
        }
        r.check('INVISIBILITY spends 20 from the pouch and veils for INVIS_T ticks, then lifts cleanly',
            castEv && gs.invis === 0 && expired, `cast=${castEv} expiry=${expired}`)
    }
    // The wizard: control fires at a visible carpet; a veiled one is never shot at,
    // and a bolt already in flight passes through the veil untouched.
    const wizRig = (veil, near = true) => {
        const gs = makeGame(7)
        for (const m of gs.monsters) if (m.kind !== 'cow') { m.x = wrap(m.x + 231, MAP); m.y = wrap(m.y + 231, MAP) }
        gs.shield = 500 // separate the hit channel: shieldHit = contact, hurt would mean breach
        if (veil) veilUp(gs)
        let fired = false, hit = false
        const place = () => { gs.x = wrap(gs.wizard.x + 10, MAP); gs.y = wrap(gs.wizard.y + 10, MAP) }
        for (let i = 0; i < 80; i++) {
            if (near) place()
            if (gs.events.some((e) => e.type === 'wizfire')) fired = true
            if (gs.events.some((e) => e.type === 'shieldHit' || e.type === 'hurt')) hit = true
            gs.events.length = 0
            step(gs, {})
        }
        return { fired, hit }
    }
    const wc = wizRig(false)
    const wv = wizRig(true)
    r.check('a visible carpet is shot at; a veiled carpet is never targeted nor hit',
        wc.fired && wc.hit && !wv.fired && !wv.hit, `ctrl fire=${wc.fired} hit=${wc.hit} veiled fire=${wv.fired} hit=${wv.hit}`)
    // In-flight refusal: a bolt launched before the veil still passes through.
    {
        const gs = makeGame(7)
        for (const m of gs.monsters) if (m.kind !== 'cow') { m.x = wrap(m.x + 231, MAP); m.y = wrap(m.y + 231, MAP) }
        gs.shield = 500
        let hit = false
        for (let i = 0; i < 80; i++) {
            gs.x = wrap(gs.wizard.x + 10, MAP); gs.y = wrap(gs.wizard.y + 10, MAP)
            if (gs.events.some((e) => e.type === 'wizfire')) gs.invis = 40 // veil drops as the bolt flies
            if (gs.events.some((e) => e.type === 'shieldHit' || e.type === 'hurt')) hit = true
            gs.events.length = 0
            step(gs, {})
        }
        r.check('a bolt launched before the veil passes through the ghost carpet', !hit, `hit=${hit}`)
    }
    // Expiry: the paused fuse resumes on the cadence the tick you become visible.
    {
        const gs = makeGame(7)
        for (const m of gs.monsters) if (m.kind !== 'cow') { m.x = wrap(m.x + 231, MAP); m.y = wrap(gs.wizard.y + 231, MAP) }
        veilUp(gs)
        gs.invis = 3
        let resumed = false
        for (let i = 0; i < 80 && !resumed; i++) {
            gs.x = wrap(gs.wizard.x + 10, MAP); gs.y = wrap(gs.wizard.y + 10, MAP)
            resumed = gs.events.some((e) => e.type === 'wizfire'); gs.events.length = 0; step(gs, {})
        }
        r.check('the wizard opens fire again the moment the veil expires', resumed, `resumed=${resumed}`)
    }
    // Monsters: wolves chase+bite a visible low carpet; veiled they neither.
    const wolfRig = (veil) => {
        const gs = makeGame(7)
        if (veil) veilUp(gs)
        const wolf = gs.monsters.find((m) => m.kind === 'wolf')
        const hp0 = gs.hp
        for (let i = 0; i < 60; i++) {
            gs.x = wrap(wolf.x + 2, MAP); gs.y = wrap(wolf.y + 2, MAP); gs.alt = 17
            step(gs, {}); gs.events.length = 0
        }
        return gs.hp < hp0
    }
    const giantRig = (veil) => {
        const gs = makeGame(7)
        if (veil) veilUp(gs)
        const gi = gs.monsters.find((m) => m.kind === 'giant')
        let sling = false
        for (let i = 0; i < 120 && !sling; i++) {
            gs.x = wrap(gi.x + 5, MAP); gs.y = wrap(gi.y + 5, MAP)
            sling = gs.events.some((e) => e.type === 'rocksling'); gs.events.length = 0; step(gs, {})
        }
        return sling
    }
    r.check('wolves bite a visible low carpet but cannot see a veiled one',
        wolfRig(false) && !wolfRig(true))
    r.check('giants sling at a visible carpet and refuse a veiled one',
        giantRig(false) && !giantRig(true))
    // Your own hands work untouched behind the veil: pearls still come to you.
    {
        const gs = makeGame(7)
        veilUp(gs)
        const pearl = gs.pearls.find((p) => p.alive)
        gs.x = pearl.x; gs.y = pearl.y; gs.alt = pearl.z
        step(gs, {})
        r.check('the veil hides you from enemies only — pearls still gather',
            gs.events.some((e) => e.type === 'pickup'))
    }
    // The veil rides the state hash, and the grimoire carries it in every world.
    {
        const a = makeGame(7)
        const b = makeGame(7)
        veilUp(b)
        r.check('stateHash sees the veil', stateHash(a) !== stateHash(b))
        r.check('the INVISIBILITY grimoire spawns in every world',
            [0, 1, 2].every((lv) => makeGame(7, lv).books.some((bk) => bk.id === 'invisibility')))
    }
    // Lost-target cue (#1612 item 1): the tick the veil rises, every enemy that
    // HAD the carpet in its sights loses it — the sim marks cosmetic lostT and
    // fires a `lost` event (the shell blips, the renderer floats a '?').
    // Out-of-range watchers stay quiet, the cue fires once per veil, decays,
    // and a visible carpet never triggers it. lostT never steers the AI.
    const lostRig = (placeFar) => {
        const gs = makeGame(7)
        gs.learned.push('invisibility')
        const wolf = gs.monsters.find((m) => m.kind === 'wolf')
        const gi = gs.monsters.find((m) => m.kind === 'giant')
        // Composition-proof (#1612): the volcano book shifted world-gen rng, so
        // seed 7 now rolls a 2nd giant (and 2nd wolf) that can sit inside sight
        // of the parked carpet and emit stray `lost` events. Keep exactly the
        // one giant + one wolf this rig places — the gate is about the cue, not
        // about how many monsters the seed happens to roll.
        gs.monsters = gs.monsters.filter((m) => m === wolf || m === gi)
        const wz = gs.wizard
        gs.x = wrap(wz.x + (placeFar ? 120 : 20), MAP); gs.y = wz.y
        wolf.x = wrap(gs.x + (placeFar ? 120 : 8), MAP); wolf.y = gs.y
        gi.x = wrap(gs.x + (placeFar ? 120 : -30), MAP); gi.y = wrap(gs.y + 20, MAP)
        return { gs, wolf, gi, wz }
    }
    {
        const { gs, wolf, gi, wz } = lostRig(false)
        setHand(gs, 'L', 'invisibility'); gs.mana = 40
        step(gs, { castL: true })
        const kinds = gs.events.filter((e) => e.type === 'lost').map((e) => e.kind).sort()
        r.check('casting the veil marks every enemy caught looking (wizard + wolf + giant emit `lost`)',
            kinds.join(',') === 'giant,wizard,wolf' && wz.lostT === 40 && wolf.lostT === 40 && gi.lostT === 40,
            `kinds=${kinds.join(',')} lostT w/w/g ${wz.lostT}/${wolf.lostT}/${gi.lostT}`)
        gs.events.length = 0
        for (let i = 0; i < 60; i++) step(gs, {})
        const repeats = gs.events.filter((e) => e.type === 'lost').length
        r.check('the lost cue fires once per veil and decays while it holds (never spams)',
            repeats === 0 && wz.lostT === 0 && wolf.lostT === 0 && gi.lostT === 0,
            `repeats=${repeats} lostT ${wz.lostT}/${wolf.lostT}`)
    }
    {
        const { gs, wolf, gi, wz } = lostRig(true)
        setHand(gs, 'L', 'invisibility'); gs.mana = 40
        step(gs, { castL: true })
        const n = gs.events.filter((e) => e.type === 'lost').length
        r.check('enemies outside their sight range get no lost cue (only those that had you)',
            n === 0 && wz.lostT === 0 && wolf.lostT === 0 && gi.lostT === 0, `n=${n}`)
    }
    {
        const { gs } = lostRig(false)
        let n = 0
        for (let i = 0; i < 60; i++) { step(gs, {}); n += gs.events.filter((e) => e.type === 'lost').length; gs.events.length = 0 }
        r.check('a visible carpet never triggers the lost cue (you must vanish to be lost)', n === 0, `n=${n}`)
    }
    // Balance: the veil must not make the autopilot worse — the documented bar
    // is 60/60 seeds restored (README).
    {
        let wins = 0, slowest = 0
        for (let s = 1; s <= 60; s++) {
            const gs = makeGame(s)
            let i = 0
            while (!gs.end && i < 40000) { step(gs, autopilot(gs)); i++ }
            if (gs.end === 'win') { wins++; if (i > slowest) slowest = i }
        }
        r.check('60-seed balance sweep: the autopilot still restores all three worlds, all 60 seeds',
            wins === 60, `wins ${wins}/60, slowest ${slowest} ticks`)
    }
}

// ---- #1612 item 5: VOLCANO — the ground tears open where you look.
{
    r.check('volcano is the 8th spell: cost 60, a grimoire waits in the world',
        SPILLS.length === 12 && spellById('volcano').cost === 60 &&
        fresh.books.some((b) => b.id === 'volcano'), `n=${SPILLS.length}`)
    {
        const gv = makeGame(7)
        gv.learned.push('volcano')
        gv.mana = 100
        gv.coolL = 0
        setHand(gv, 'L', 'volcano')
        const before = gv.craters.length
        step(gv, { castL: true })
        const ev = gv.events.filter((e) => e.type === 'volcano')
        r.check('cast tears 4 hot vents open and pays 60 mana',
            gv.craters.length - before === 4 && gv.craters.every((c) => c.hot === 1) && gv.mana === 40 && ev.length === 1 && ev[0].vents.length === 4,
            `craters +${gv.craters.length - before} mana=${gv.mana} vents=${ev[0]?.vents.length}`)
        const mainC = gv.craters[before]
        r.check('fresh vents glow with lava and cool over CRATER_GLOW',
            glowOf(gv, mainC) > 0 && glowOf({ ...gv, tick: gv.tick + CRATER_GLOW }, mainC) === 0,
            `glow now=${glowOf(gv, mainC).toFixed(2)}`)
    }
    {
        const gm = makeGame(7)
        gm.learned.push('volcano')
        gm.mana = 30
        setHand(gm, 'L', 'volcano')
        const bm = gm.craters.length
        step(gm, { castL: true })
        r.check('no mana, no mountain: denied, ground untouched',
            gm.craters.length === bm && gm.events.some((e) => e.type === 'nomana'), `craters=${gm.craters.length}`)
    }
    {
        const gt = makeGame(7)
        volcanoErupt(gt, gt.wizard.tx, gt.wizard.ty)
        r.check('an eruption at the tower base topples it (wizard takes the fall)',
            gt.towerDown === true && gt.wizard.hp < LEVELS[0].wizHp, `down=${gt.towerDown} hp=${gt.wizard.hp}`)
    }
    {
        const eruptOnce = () => {
            const g = makeGame(7)
            g.learned.push('volcano'); g.mana = 100; g.coolL = 0
            setHand(g, 'L', 'volcano')
            step(g, { castL: true })
            for (let i = 0; i < 50; i++) step(g, {})
            return stateHash(g)
        }
        const h1 = eruptOnce(), h2 = eruptOnce()
        r.check('eruptions are deterministic: same seed + same cast → identical hash', h1 === h2, `${h1} vs ${h2}`)
    }
}

// ---- #1639: SHATTER + RAISE — the book grows to ten.
// Shatter is kill-without-cinders: creatures die at the look point, the land
// is provably untouched (craters, scorch marks, fire and the tower never move,
// even cast at the tower base). Raise is crater()'s mirror: a quadratic mound
// that lifts a ridge, pays from the pouch, and drains a flooded crater — the
// counter-spell to the game's own flooding. Mutation guide: drop shatter's
// kill radius to 4 and the kill gate goes red; delete the raiseTerrain body
// and the mound + flood-drain gates go red.
{
    r.check('shatter and raise join the book (costs 30/25) with grimoires in the world',
        spellById('shatter').cost === 30 && spellById('raise').cost === 25 &&
        fresh.books.some((b) => b.id === 'shatter') && fresh.books.some((b) => b.id === 'raise'))
    {
        const gs = makeGame(7)
        gs.learned.push('shatter'); gs.mana = 100; gs.coolL = 0
        setHand(gs, 'L', 'shatter')
        // Aim by coordinates (the cast point itself), so the kill-radius gate
        // does not ride lookPoint's terrain scan.
        const px = wrap(gs.x + 30, MAP), py = wrap(gs.y, MAP)
        const near = gs.monsters.find((m) => m.kind === 'wolf')
        const far = gs.monsters.find((m) => m.kind === 'giant' &&
            Math.hypot(wrapD(m.x - px), wrapD(m.y - py)) > SHATTER_R + 20)
        near.x = wrap(px + 3, MAP); near.y = wrap(py + 3, MAP)
        const before = { craters: gs.craters.length, marks: gs.fireMarks.length }
        const kills0 = gs.kills, pearls0 = gs.pearls.length
        shatterAt(gs, px, py)
        r.check('shatter kills everything inside SHATTER_R, its victims pay bounties',
            !gs.monsters.includes(near) && gs.kills === kills0 + 1 &&
            gs.pearls.length > pearls0 && gs.events.some((e) => e.type === 'shatter'),
            `kills+${gs.kills - kills0} pearls +${gs.pearls.length - pearls0}`)
        r.check('shatter spares what stands outside the ring', gs.monsters.includes(far))
        r.check('the kill leaves no cinders: no crater, no fire mark',
            gs.craters.length === before.craters && gs.fireMarks.length === before.marks,
            `craters ${before.craters}→${gs.craters.length}, marks ${before.marks}→${gs.fireMarks.length}`)
        const killEv = gs.events.filter((e) => e.type === 'kill')
        r.check('every kill names its kind and stands somewhere — the crumble FX fuel (#1646)',
            killEv.length === 1 && ['wolf', 'giant', 'cow'].includes(killEv[0].kind) &&
            Number.isFinite(killEv[0].x) && Number.isFinite(killEv[0].y),
            killEv.map((e) => `${e.kind}@${e.x.toFixed(0)},${e.y.toFixed(0)}`).join(' ') || 'no kill event')
        gs.events.length = 0; gs.pearls.length = 0
        step(gs, { castL: true })
        r.check('casting shatter from a hand spends the pouch (30)', gs.mana === 70 && gs.events.some((e) => e.type === 'cast'),
            `mana=${gs.mana}`)
    }
    {
        const gt = makeGame(7)
        gt.learned.push('shatter'); gt.mana = 100; gt.coolL = 0
        setHand(gt, 'L', 'shatter')
        // The ring at the wizard himself: he takes the force, yet the tower
        // stands and the ground keeps its shape — shatter is not a blast.
        const cr0 = gt.craters.length
        shatterAt(gt, gt.wizard.x, gt.wizard.y)
        r.check('shatter at the wizard wounds him yet never topples or craters',
            gt.events.some((e) => e.type === 'wizHit') && gt.towerDown === false && gt.craters.length === cr0,
            `down=${gt.towerDown} craters=${gt.craters.length}`)
    }
    {
        const gm = makeGame(7)
        gm.learned.push('shatter'); gm.mana = 10; gm.coolL = 0
        setHand(gm, 'L', 'shatter')
        r.check('no mana, no kill: shatter denied',
            step(gm, { castL: true }) && gm.events.some((e) => e.type === 'nomana') && gm.mana === 10)
    }
    {
        const gs = makeGame(7)
        gs.learned.push('raise'); gs.mana = 100; gs.coolL = 0
        setHand(gs, 'L', 'raise')
        const px = wrap(gs.x + 30, MAP), py = wrap(gs.y, MAP)
        const h0 = sampleH(gs, px, py), hEdge = sampleH(gs, wrap(px + 24, MAP), py)
        raiseTerrain(gs, px, py, 16, 14)
        settleGround(gs) // #1694: read the mound after its swell window
        r.check('raise pushes a mound up where you look',
            sampleH(gs, px, py) > h0 + 4 && gs.events.some((e) => e.type === 'raise'),
            `h ${h0.toFixed(1)}→${sampleH(gs, px, py).toFixed(1)}`)
        r.check('the mound is local: 24u out the ground is unmoved',
            Math.abs(sampleH(gs, wrap(px + 24, MAP), py) - hEdge) < 0.5,
            `edge ${hEdge.toFixed(1)}→${sampleH(gs, wrap(px + 24, MAP), py).toFixed(1)}`)
        gs.events.length = 0; gs.pearls.length = 0
        step(gs, { castL: true })
        r.check('casting raise from a hand spends the pouch (25)', gs.mana === 75 && gs.events.some((e) => e.type === 'cast'),
            `mana=${gs.mana}`)
    }
    {
        // The counter-spell: a crater sunk below sea floods; raise drains it.
        // Depths are sized with the bilinear-sampling floor in mind: a point
        // at a crater's centre still reads ≥0.35×depth down, and a mound's
        // centre still reads ≥5.8 up (r16/h14) — so flood (≤WATER−4) then
        // drain (>WATER) are provable at the cast point, not luck of the grid.
        const gs = makeGame(7)
        const px = wrap(gs.castle.x + 60, MAP), py = wrap(gs.castle.y + 60, MAP)
        const h0 = sampleH(gs, px, py)
        crater(gs, px, py, 14, Math.max(8, Math.ceil((h0 - WATER + 4) * 2.9)))
        settleGround(gs) // #1694: flood after the sink window
        const flooded = sampleH(gs, px, py) < WATER
        raiseTerrain(gs, px, py, 16, 14)
        settleGround(gs) // #1694: drain after the swell window
        r.check('raise drains a flooded crater — land lifted above the sea',
            flooded && sampleH(gs, px, py) > WATER,
            `h0=${h0.toFixed(1)} flooded=${flooded} after=${sampleH(gs, px, py).toFixed(1)}`)
    }
    {
        const castTwice = () => {
            const g = makeGame(21)
            g.learned.push('shatter', 'raise'); g.mana = 200
            setHand(g, 'L', 'shatter'); step(g, { castL: true })
            setHand(g, 'L', 'raise'); g.coolL = 0; step(g, { castL: true })
            for (let i = 0; i < 80; i++) step(g, {})
            return stateHash(g)
        }
        const a = castTwice(), b = castTwice()
        r.check('the new spells are deterministic: same seed + same casts → identical hash', a === b, `${a} vs ${b}`)
    }
    {
        // Fairness invariant (#1639 sweep): every generated wizard tower sits
        // within the castle guards' reach (<200u, arrows carry ~300). An
        // unreachable hoarding wizard with a broke carpet is a soft-locked
        // world — seed 14 rolled exactly that pre-invariant.
        let bad = 0
        for (let s = 1; s <= 20 && bad === 0; s++) {
            for (const lv of [0, 1, 2]) {
                const g = makeGame(s, lv)
                if (Math.hypot(wrapD(g.wizard.tx - g.castle.x), wrapD(g.wizard.ty - g.castle.y)) > 200) bad++
            }
        }
        r.check('every wizard tower stands within guard reach (all 60 worlds of seeds 1–20)',
            bad === 0, `out-of-reach towers: ${bad}`)
    }
    {
        // Twelve books can crowd the mid-height band; the spread fallback must
        // never leave a grimoire unplaced on any seed or level.
        let missing = 0
        for (let s = 1; s <= 40 && missing === 0; s++) {
            for (const lv of [0, 1, 2]) if (makeGame(s, lv).books.length !== 12) missing++
        }
        r.check('all twelve grimoires are placed in every world of seeds 1–40 (spread fallback holds)',
            missing === 0, `worlds short of twelve books: ${missing}`)
    }
}

// ---- #1668: DISSOLVE — the 11th spell erases land, it does not crack it.
// The clamp (min(h, WATER−dip)) guarantees the wound floods even on the
// highest peak — a crater()-style subtraction would only bite low ground, and
// that is the mutant: replace the clamp line with crater(gs,x,y,DISSOLVE_R,
// DISSOLVE_SINK,0) and the flood-on-peak gate goes red. Delete the hut splice
// and the dissolve/keep gates go red; add igniteHuts inside dissolveLand and
// the cold-promise gate goes red. Mutants proven once, 2026-11-06.
{
    r.check('dissolve is the 11th spell: cost 40, its grimoire waits in the world',
        SPILLS.length === 12 && SPILLS[10].id === 'dissolve' && spellById('dissolve').cost === 40 &&
        fresh.books.some((b) => b.id === 'dissolve'), `n=${SPILLS.length}`)
    {
        // The signature: clamp-flood on the HIGHEST ground on the map — no
        // terrain in any world is high enough to keep its dry land.
        const gs = makeGame(7)
        let hx = 0, hy = 0, hh = -1
        for (let j = 0; j < GRID; j++) {
            for (let i = 0; i < GRID; i++) {
                const h = gs.heights[j * GRID + i]
                if (h > hh) { hh = h; hx = i * CELL + CELL / 2; hy = j * CELL + CELL / 2 }
            }
        }
        dissolveLand(gs, hx, hy)
        settleGround(gs) // #1694: the wound opens over the window — read the drowned land after it
        r.check('dissolve floods guaranteed: even the highest peak sinks below the sea',
            hh > WATER + 40 && sampleH(gs, hx, hy) < WATER,
            `peak ${hh.toFixed(1)} → ${sampleH(gs, hx, hy).toFixed(1)} (sea ${WATER})`)
        const hEdge = (() => { const g2 = makeGame(7); return sampleH(g2, wrap(hx + DISSOLVE_R + 8, MAP), hy) })()
        r.check('the flood is local: outside DISSOLVE_R the map is unmoved',
            Math.abs(sampleH(gs, wrap(hx + DISSOLVE_R + 8, MAP), hy) - hEdge) < 0.01,
            `edge ${hEdge.toFixed(1)}→${sampleH(gs, wrap(hx + DISSOLVE_R + 8, MAP), hy).toFixed(1)}`)
        const sink = WATER - gs.heights[Math.floor(hy / CELL) * GRID + Math.floor(hx / CELL)]
        r.check('the wound floor cell sits DISSOLVE_SINK below sea at the centre',
            Math.abs(sink - DISSOLVE_SINK) < 0.01, `sink ${sink.toFixed(2)} (raw cell; sampleH reads ~3 with the bilinear neighbour mix)`)
    }
    {
        // Huts dissolve — swallowed whole, no burning, no rubble. The far hut
        // keeps its spot; each loss announces itself for the FX layer.
        const gs = makeGame(7)
        const px = wrap(gs.castle.x + 80, MAP), py = wrap(gs.castle.y + 80, MAP)
        gs.huts.length = 0
        gs.huts.push({ x: wrap(px + 4, MAP), y: py, v: 1, burn: 0, dead: false, catchT: 0 })
        gs.huts.push({ x: wrap(px - 10, MAP), y: wrap(py + 8, MAP), v: 0, burn: 0, dead: false, catchT: 0 })
        gs.huts.push({ x: wrap(px + DISSOLVE_R + 15, MAP), y: py, v: 2, burn: 0, dead: false, catchT: 0 })
        const n0 = gs.huts.length
        dissolveLand(gs, px, py)
        const hutsEv = gs.events.filter((e) => e.type === 'dissolveHut')
        const ev = gs.events.find((e) => e.type === 'dissolve')
        r.check('huts inside the radius dissolve: gone, no burn, no rubble',
            gs.huts.length === n0 - 2 && hutsEv.length === 2 && gs.huts[0] &&
            Math.hypot(wrapD(gs.huts[0].x - (px + DISSOLVE_R + 15)), wrapD(gs.huts[0].y - py)) < 1,
            `huts ${n0}→${gs.huts.length}, events ${hutsEv.length}`)
        r.check('the dissolve event carries its ring and count — the FX fuel',
            !!ev && ev.r === DISSOLVE_R && ev.huts === 2, JSON.stringify(ev))
    }
    {
        // The cold promise at the tower base: flood, yes — topple, burn, mark,
        // wound, or kill, no. The wizard keeps his standing island.
        const gs = makeGame(7)
        const tx = gs.wizard.tx, ty = gs.wizard.ty
        const wolf = gs.monsters.find((m) => m.kind === 'wolf')
        wolf.x = wrap(tx + 3, MAP); wolf.y = wrap(ty + 3, MAP)
        const cr0 = gs.craters.length, mk0 = gs.fireMarks.length, hp0 = gs.wizard.hp
        dissolveLand(gs, tx, ty)
        settleGround(gs) // #1694: flood reads after the sink window (the promise is unchanged)
        r.check('dissolve at the tower floods the base yet never topples, burns, marks or wounds',
            gs.towerDown === false && gs.craters.length === cr0 && gs.fireMarks.length === mk0 &&
            gs.wizard.hp === hp0 && sampleH(gs, tx, ty) < WATER,
            `down=${gs.towerDown} craters ${cr0}→${gs.craters.length} marks ${mk0}→${gs.fireMarks.length} hp ${gs.wizard.hp}`)
        r.check('creatures swim: a wolf in the flood survives (huts and land are the targets)',
            gs.monsters.includes(wolf))
    }
    {
        // Hand plumbing: pays from the pouch, denies when broke.
        const gs = makeGame(7)
        gs.learned.push('dissolve'); gs.mana = 100; gs.coolL = 0
        setHand(gs, 'L', 'dissolve')
        gs.events.length = 0
        step(gs, { castL: true })
        const paid = gs.mana === 60 && gs.events.some((e) => e.type === 'cast' && e.id === 'dissolve')
        gs.mana = 10; gs.coolL = 0; gs.events.length = 0
        step(gs, { castL: true })
        r.check('casting dissolve pays 40 from the pouch and denies when broke',
            paid && gs.mana === 10 && gs.events.some((e) => e.type === 'nomana'), `mana=${gs.mana}`)
    }
    {
        // The counter-spell pairing stays symmetric: RAISE drains the wound.
        const gs = makeGame(7)
        let hx = 0, hy = 0, hh = -1
        for (let j = 0; j < GRID; j++) {
            for (let i = 0; i < GRID; i++) {
                const h = gs.heights[j * GRID + i]
                if (h > hh) { hh = h; hx = i * CELL + CELL / 2; hy = j * CELL + CELL / 2 }
            }
        }
        dissolveLand(gs, hx, hy)
        settleGround(gs) // #1694: flooded reads after the wound opens fully
        const flooded = sampleH(gs, hx, hy) < WATER
        raiseTerrain(gs, hx, hy, 16, 14)
        settleGround(gs) // #1694: drain reads after the mound fully swells
        r.check('RAISE drains the dissolve wound — the counter-spell pairing holds',
            flooded && sampleH(gs, hx, hy) > WATER,
            `flooded=${flooded} after=${sampleH(gs, hx, hy).toFixed(1)}`)
    }
    {
        // Touch plumbing: the 11th tray cell equips DISSOLVE like any other.
        const gs = makeGame(7)
        gs.learned.push('dissolve')
        gs.book = true
        const cx = TRAY[0] + 10 * 14 + 7, cy = TRAY[1] + 8
        const hit = hudTap(gs, cx, cy)
        r.check('the touch tray reaches the 11th slot: tap equips DISSOLVE to the left hand',
            hit === 'equip' && gs.hands.L === 'dissolve' && gs.book === false,
            `hit=${hit} handL=${gs.hands.L}`)
        r.check('the twelve-slot tray still sits inside the HUD',
            TRAY[0] >= 0 && TRAY[0] + TRAY[2] <= W && TRAY[1] >= 0 && TRAY[1] + TRAY[3] <= H,
            `TRAY=${TRAY.join(',')}`)
    }
    {
        const castTwice = () => {
            const g = makeGame(21)
            g.learned.push('dissolve'); g.mana = 200
            setHand(g, 'L', 'dissolve'); step(g, { castL: true })
            for (let i = 0; i < 80; i++) step(g, {})
            return stateHash(g)
        }
        const a = castTwice(), b = castTwice()
        r.check('dissolve is deterministic: same seed + same cast → identical hash', a === b, `${a} vs ${b}`)
    }
}

// ---- #1680: CLONE — the 12th spell doubles the bestiary, never the land.
// Mutation guide (prove it can fail): delete `gs.monsters.push(cp)` in
// cloneAt (sim.js) and the litter/economy gates go red; replace the mirrored
// position with the original's (`nx = m.x; ny = m.y`) and the twin-stands-
// opposite gate goes red; move `toppleTower(gs, cx, cy)` into cloneAt and the
// cold-promise gate goes red; call rnd(gs) once inside cloneAt and the
// determinism gate goes red (rng-free contract). Mutants to prove on demand.
{
    r.check('clone is the 12th spell: cost 35, its grimoire waits in the world',
        SPILLS.length === 12 && SPILLS[11].id === 'clone' && spellById('clone').cost === 35 &&
        fresh.books.some((b) => b.id === 'clone'), `n=${SPILLS.length}`)
    {
        // The signature: everything in the ring gains a twin at the MIRRORED
        // position across the cast point, at its kind's full spawn health;
        // what stands outside keeps its solitude.
        const gs = makeGame(7)
        gs.monsters.length = 0
        const px = 100, py = 100
        const wolf = { kind: 'wolf', x: wrap(px + 8, MAP), y: py, hp: SPAWN_HP.wolf, dir: 1.2, cool: 0, wanderT: 0, lostT: 0 }
        const cow = { kind: 'cow', x: px, y: wrap(py - 14, MAP), hp: SPAWN_HP.cow, dir: 2.5, cool: 0, wanderT: 0, lostT: 0 }
        const giant = { kind: 'giant', x: wrap(px + CLONE_R + 12, MAP), y: py, hp: SPAWN_HP.giant, dir: 0.5, cool: 0, wanderT: 0, lostT: 0 }
        gs.monsters.push(wolf, cow, giant)
        const litter = cloneAt(gs, px, py)
        const twins = gs.monsters.filter((m) => m !== wolf && m !== cow && m !== giant)
        const mirrorOK = (orig, cp) => {
            const dx = wrapD(orig.x - px), dy = wrapD(orig.y - py)
            const d = Math.hypot(dx, dy)
            const md = Math.max(d, 6)
            const ux = d >= 1 ? dx / d : 1, uy = d >= 1 ? dy / d : 0
            return Math.abs(wrapD(cp.x - wrap(px - ux * md, MAP))) < 1e-6 &&
                Math.abs(wrapD(cp.y - wrap(py - uy * md, MAP))) < 1e-6
        }
        const tw = twins.find((m) => m.kind === 'wolf')
        const tc = twins.find((m) => m.kind === 'cow')
        r.check('clone doubles everything inside CLONE_R at the mirrored spot, at full spawn HP',
            litter.length === 2 && twins.length === 2 && !!tw && !!tc &&
            tw.hp === SPAWN_HP.wolf && tc.hp === SPAWN_HP.cow &&
            mirrorOK(wolf, tw) && mirrorOK(cow, tc),
            `litter=${litter.length} twins=${twins.map((m) => m.kind).join(',')} mirrored=${!!tw && mirrorOK(wolf, tw)}`)
        r.check('the pack outside the ring keeps its solitude', gs.monsters.includes(giant) && twins.every((m) => m.kind !== 'giant'))
        const ev = gs.events.find((e) => e.type === 'clone')
        r.check('the clone event carries ring, count and per-twin spots — the FX fuel',
            !!ev && ev.r === CLONE_R && ev.count === 2 && ev.copies.length === 2 &&
            ev.copies.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y)),
            JSON.stringify(ev && { r: ev.r, count: ev.count, copies: ev.copies.length }))
        r.check('a doubled wolf is a real monster: it joins the sim and dies for the ordinary bounty',
            (() => {
                gs.learned.push('shatter'); gs.mana = 100; gs.coolL = 0
                setHand(gs, 'L', 'shatter')
                const kills0 = gs.kills, pearls0 = gs.pearls.length
                shatterAt(gs, px, py) // both originals AND both twins stand within SHATTER_R of the cast point (8u and 14u out)
                return gs.kills === kills0 + 4 && gs.pearls.length > pearls0 && gs.monsters.includes(giant)
            })(),
            'bounty economy: originals and twins all pay like their kind (kill count proves it)')
    }
    {
        // The cold promise: clone touches the bestiary ONLY — heights, craters,
        // fire, huts, pearls, books, wizard and tower all untouched. Deleting
        // this promise is the classic blast-shaped mutant.
        const gs = makeGame(7)
        gs.learned.push('clone'); gs.mana = 100; gs.coolL = 0
        setHand(gs, 'L', 'clone')
        // Aim through the REAL look point (the arrow the cast lands on), so
        // this gate proves the cast path end to end, not just cloneAt.
        const lp = lookPoint(gs)
        const wolf = gs.monsters.find((m) => m.kind === 'wolf')
        gs.monsters.length = 0
        gs.monsters.push(wolf)
        wolf.x = lp.x; wolf.y = lp.y
        const h0 = gs.heights.slice(), cr0 = gs.craters.length, mk0 = gs.fireMarks.length
        const hut0 = gs.huts.length, prl0 = gs.pearls.reduce((a, p) => a + (p.alive ? p.m : 0), 0)
        const whp0 = gs.wizard.hp, books0 = gs.books.length, mons0 = gs.monsters.length
        gs.events.length = 0
        step(gs, { castL: true })
        const heightsSame = gs.heights.every((h, i) => h === h0[i])
        const prl1 = gs.pearls.reduce((a, p) => a + (p.alive ? p.m : 0), 0)
        r.check('casting clone pays 35 from the pouch',
            gs.mana === 65 && gs.events.some((e) => e.type === 'cast' && e.id === 'clone'), `mana=${gs.mana}`)
        r.check('the land never feels clone: no height change, no crater, no fire, no hut lost, no topple',
            heightsSame && gs.craters.length === cr0 && gs.fireMarks.length === mk0 &&
            gs.huts.length === hut0 && gs.towerDown === false,
            `heights same=${heightsSame} craters ${cr0}→${gs.craters.length} marks ${mk0}→${gs.fireMarks.length} huts ${hut0}→${gs.huts.length}`)
        r.check('no free mana: clone spawns no pearls — only kills pay',
            prl1 === prl0 && gs.books.length === books0 && gs.wizard.hp === whp0,
            `pearls ${prl0}→${prl1}`)
        r.check('one cast, one twin: the wolf in the ring stands twice',
            gs.monsters.length === mons0 + 1 && gs.monsters.includes(wolf),
            `monsters ${mons0}→${gs.monsters.length}`)
    }
    {
        // The wizard is unique: clone at his tower and the bestiary grows, but
        // he never does.
        const gs = makeGame(7)
        const n0 = gs.monsters.length
        const litter = cloneAt(gs, gs.wizard.tx, gs.wizard.ty)
        r.check('the wizard is never cloned: no second wizard, only creatures answered',
            gs.wizard.alive && litter.every((c) => c.kind !== 'wizard') && gs.monsters.length === n0 + litter.length,
            `litter=${litter.length}`)
    }
    {
        // Empty ring and the world guard: an honest miss still announces
        // itself; CLONE_MAX keeps ring-upon-ring from melting the sim.
        const gs = makeGame(7)
        gs.monsters.length = 0
        gs.events.length = 0
        const litter = cloneAt(gs, 250, 250)
        r.check('an empty ring is an honest miss: zero twins, the event still lands',
            litter.length === 0 && gs.events.some((e) => e.type === 'clone' && e.count === 0))
        const g2 = makeGame(7)
        g2.monsters.length = 0
        for (let i = 0; i < CLONE_MAX; i++) g2.monsters.push({ kind: 'cow', x: wrap(10 + i, MAP), y: 10, hp: SPAWN_HP.cow, dir: 0, cool: 0, wanderT: 0, lostT: 0 })
        cloneAt(g2, 10, 10)
        r.check('CLONE_MAX holds even when a full ring of cows asks for doubles',
            g2.monsters.length === CLONE_MAX, `monsters=${g2.monsters.length}`)
    }
    {
        // Pouch denial: broke is broke.
        const gs = makeGame(7)
        gs.learned.push('clone'); gs.mana = 10; gs.coolL = 0
        setHand(gs, 'L', 'clone')
        gs.events.length = 0
        step(gs, { castL: true })
        r.check('no mana, no twins: clone denied',
            gs.events.some((e) => e.type === 'nomana') && gs.mana === 10, `mana=${gs.mana}`)
    }
    {
        // Touch plumbing: the 12th tray cell equips CLONE like any other.
        const gs = makeGame(7)
        gs.learned.push('clone')
        gs.book = true
        const cx = TRAY[0] + 11 * 14 + 7, cy = TRAY[1] + 8
        const hit = hudTap(gs, cx, cy)
        r.check('the touch tray reaches the 12th slot: tap equips CLONE to the left hand',
            hit === 'equip' && gs.hands.L === 'clone' && gs.book === false,
            `hit=${hit} handL=${gs.hands.L}`)
    }
    {
        const castTwice = () => {
            const g = makeGame(21)
            g.learned.push('clone'); g.mana = 200
            setHand(g, 'L', 'clone'); step(g, { castL: true })
            for (let i = 0; i < 80; i++) step(g, {})
            return stateHash(g)
        }
        const a = castTwice(), b = castTwice()
        r.check('clone is deterministic (rng-free contract): same seed + same cast → identical hash', a === b, `${a} vs ${b}`)
    }
}

// ---- #1612 item 4: behind the veil the WORLD muffles. muffleOf(gs) is the pure
// cutoff the shell drives its ambience low-pass from — open when visible, a short
// closed band while veiled, back to open on expiry, and it never touches the rules
// or the hash. The veil is the only thing that muffles (no shield/heal tie-in).
// Mutation guide: read gs.shield instead of gs.invis in muffleOf and the visible/
// veiled gates flip; hardcode OPEN and the veiled gate goes red.
{
    const veil = (gs) => { gs.learned.push('invisibility'); setHand(gs, 'L', 'invisibility'); gs.mana = 40; step(gs, { castL: true }) }
    const vis = makeGame(7)
    r.check('a visible carpet hears the world open (muffleOf = OPEN_CUTOFF)',
        muffleOf(vis) === OPEN_CUTOFF, `${muffleOf(vis)}`)
    const gs = makeGame(7)
    veil(gs)
    r.check('casting the veil drops the world cutoff to MUFFLE_CUTOFF',
        muffleOf(gs) === MUFFLE_CUTOFF, `${muffleOf(gs)}`)
    // Pure: the readout must not nudge the sim (same discipline as the tray).
    const h0 = stateHash(gs); muffleOf(gs); const h1 = stateHash(gs)
    r.check('muffleOf is a pure read — it never disturbs the state hash', h0 === h1, `${h0} vs ${h1}`)
    // Recovery: the bed opens back up the tick the veil lifts.
    let i = 0
    while (gs.invis > 0 && i < INVIS_T + 10) { step(gs, {}); gs.events.length = 0; i++ }
    r.check('the world opens again the tick the veil expires',
        gs.invis === 0 && muffleOf(gs) === OPEN_CUTOFF, `invis=${gs.invis} cutoff=${muffleOf(gs)}`)
    // Only invisibility muffles: a shielded/healing carpet is still heard clearly.
    const shielded = makeGame(7)
    shielded.shield = 500; shielded.hp = shielded.hp + 1
    r.check('the veil alone muffles — shield or heal never closes the bed',
        muffleOf(shielded) === OPEN_CUTOFF, `${muffleOf(shielded)}`)
    r.check('the muffle band is genuinely narrow (MUFFLE_CUTOFF well below open)',
        MUFFLE_CUTOFF > 100 && MUFFLE_CUTOFF < 1200 && OPEN_CUTOFF > 10000 && MUFFLE_CUTOFF < OPEN_CUTOFF / 10,
        `muffle ${MUFFLE_CUTOFF}Hz vs open ${OPEN_CUTOFF}Hz`)
}

// ---- #1612 mobile spellbook: the HUD itself equips hands, like the original's
// mouse-first UI. hudTap is pure (sim.js), so the whole touch path — slots cycle,
// gold book tab opens the tray, learned cells assign the left hand, click-out
// closes without casting — is proven without a browser. The tray is UI state:
// it must never disturb the sim hash. Mutation guide: make hudTap return 'world'
// for a slotL tap (the pre-fix behavior) and the slot gates go red; mix gs.book
// into stateHash and the determinism gate goes red.
{
    const ctr = (r) => [r[0] + r[2] / 2, r[1] + r[3] / 2]
    const [slx, sly] = ctr(TAP.slotL)
    const [srx, sry] = ctr(TAP.slotR)
    const [bkx, bky] = ctr(TAP.book)
    const gs = makeGame(7)
    gs.learned.push('heal', 'invisibility')
    r.check('tapping a hand slot cycles that hand through learned spells (touch parity with 1-7/Q)',
        hudTap(gs, slx, sly) === 'slotL' && gs.hands.L === 'heal' &&
        hudTap(gs, slx, sly) === 'slotL' && gs.hands.L === 'invisibility' &&
        hudTap(gs, slx, sly) === 'slotL' && gs.hands.L === 'fireball' &&
        hudTap(gs, srx, sry) === 'slotR' && gs.hands.R === 'fireball' &&
        hudTap(gs, srx, sry) === 'slotR' && gs.hands.R === 'heal',
        `L=${gs.hands.L} R=${gs.hands.R}`)
    r.check('slot taps emit equip events (the shell sounds and names them)',
        gs.events.filter((e) => e.type === 'equip').length === 5)
    const handsBefore = `${gs.hands.L}/${gs.hands.R}`
    r.check('a world tap stays a cast — nothing equips above the strip',
        hudTap(gs, 160, 80) === 'world' && `${gs.hands.L}/${gs.hands.R}` === handsBefore)
    r.check('the dead HUD strip never fires a stray cast',
        hudTap(gs, 100, H - HUD_H + 8) === 'none')
    r.check('the gold book tab toggles the spell tray',
        hudTap(gs, bkx, bky) === 'book' && gs.book === true &&
        hudTap(gs, bkx, bky) === 'book' && gs.book === false)
    {
        gs.book = true
        const i = SPILLS.findIndex((sp) => sp.id === 'invisibility')
        const cx = TRAY[0] + i * 14 + 7, cy = TRAY[1] + 8
        r.check('tapping a learned tray cell assigns the LEFT hand and closes the book',
            hudTap(gs, cx, cy) === 'equip' && gs.hands.L === 'invisibility' && gs.book === false)
        gs.book = true
        const j = SPILLS.findIndex((sp) => !gs.learned.includes(sp.id))
        const ux = TRAY[0] + j * 14 + 7, uy = TRAY[1] + 8
        r.check('unlearned tray cells are inert — no equip, book stays open',
            hudTap(gs, ux, uy) === 'none' && gs.hands.L === 'invisibility' && gs.book === true)
        gs.hands.L = 'fireball'
        r.check('clicking out while the tray is open closes it WITHOUT casting',
            hudTap(gs, 160, 60) === 'close' && gs.book === false && gs.hands.L === 'fireball')
    }
    r.check('every touch hit box lives inside the 320×200 HUD',
        [...Object.values(TAP), TRAY].every((b) => b[0] >= 0 && b[1] >= 0 && b[0] + b[2] <= W && b[1] + b[3] <= H))
    {
        const a = makeGame(9)
        const b = makeGame(9)
        // Open/close the tray mid-run: pure UI, the sim must not notice.
        // (Equipping is NOT tested here — it changes hands on purpose.)
        for (let i = 0; i < 300; i++) {
            step(a, {}); step(b, {})
            if (i === 50) hudTap(b, bkx, bky)
            if (i === 90) hudTap(b, 160, 60)
            if (i === 200) hudTap(b, bkx, bky)
        }
        r.check('the spellbook UI never disturbs the simulation — hashes match a clean run',
            stateHash(a) === stateHash(b) && b.book === true,
            `${stateHash(a)} vs ${stateHash(b)} (book ${b.book})`)
    }
    {
        const gs2 = makeGame(7)
        gs2.book = true
        gs2.learned.push('slow')
        // Bank the whole world-1 quota at the castle: the level transition must
        // close an open book along with the rest of the world state.
        gs2.mana = gs2.quota + 20
        let t = 0
        while (gs2.level === 0 && t < 400) {
            gs2.x = gs2.castle.x; gs2.y = gs2.castle.y // hover: pin over the castle
            step(gs2, {}); t++
        }
        r.check('a world regen closes an open spellbook', gs2.level === 1 && gs2.book === false,
            `level ${gs2.level + 1} book ${gs2.book} bank ${Math.floor(gs2.bank)} at t=${t}`)
    }
}

// ---- HUD geometry: the score must stay inside the canvas (#1681)
// The score is the only HUD text pinned to a fixed x near the right edge. At
// x=302 in 7px monospace its six-digit box spanned [302, 327.2] against
// W=320, so the last digits were clipped in EVERY orientation (desktop
// full-bleed, portrait and landscape letterbox alike). Measure the extent the
// way the browser will: monospace advance is 0.6em (Chrome's default measured
// 0.6001em at 7px on 2026-11-06), digit count from the padStart.
// Mutation guide: restore `fillText(..., 302, y0 + 11)` left-aligned @7px → red.
{
    const hudSrc = await readFile(new URL('../src/games/MagicCarpet/index.jsx', import.meta.url), 'utf8')
    const lines = hudSrc.split('\n')
    const si = lines.findIndex((l) => /fillText\(String\(gs\.score\)\.padStart\(\d+,\s*'0'\)/.test(l))
    let fit = false, detail = 'score fillText not found'
    if (si >= 0) {
        const scoreLine = lines[si]
        const digits = +scoreLine.match(/padStart\((\d+),\s*'0'\)/)[1]
        const xExpr = scoreLine.match(/padStart\(\d+,\s*'0'\),\s*([^,]+),/)[1].trim()
        const wm = xExpr.match(/^W\s*-\s*(\d+)$/)
        const x = wm ? W - +wm[1] : parseFloat(xExpr)
        // Canvas state = last assignment wins: walk up to the nearest font and
        // textAlign before the fillText (they may be any number of lines apart).
        let fs = null, align = null
        for (let i = si - 1; i >= 0 && (fs === null || align === null); i--) {
            const fm = lines[i].match(/ctx\.font = '(\d+(?:\.\d+)?)px/)
            const am = lines[i].match(/ctx\.textAlign = '(\w+)'/)
            if (fm && fs === null) fs = parseFloat(fm[1])
            if (am && align === null) align = am[1]
        }
        if (fs === null) fs = 7
        if (align === null) align = 'left'
        const tw = digits * 0.6 * fs
        const [x0, x1] = align === 'right' ? [x - tw, x] : [x, x + tw]
        fit = x0 >= 0 && x1 <= W
        detail = `font ${fs}px ${align} x=${wm ? `W-${wm[1]}` : x} extent [${x0.toFixed(1)}, ${x1.toFixed(1)}] vs W=${W}`
    }
    r.check('HUD score fits inside the canvas (#1681)', fit, detail)
}

// ---- browser pass: boots in Chrome, starts, drives through the contract, zero errors
// ---- #1694: CRUMBLE RIPPLE — ground deformations unfold over ticks.
// Mutation guide (prove it can fail): (1) make crater() land instantly (append
// settleGround(gs) before its return) — the no-pop and rim gates go red while
// the convergence gates stay green (that IS the promise: honest landing);
// (2) swap sinkCurve for a linear ramp — the accelerate gate goes red (a real
// collapse starts gently: a quarter of the window must not sink half);
// (3) delete `gs.deforms = []` in genWorld — the fresh-world gate goes red;
// (4) cut the drainDeforms call in step() — the no-pop gate itself goes red
// (the queue never drains, nothing lands). All restored after proving.
{
    const giAt = (x, y) => Math.floor(wrap(y, MAP) / CELL) * GRID + Math.floor(wrap(x, MAP) / CELL)
    const cellD = (gi, x, y) => Math.hypot((gi % GRID + 0.5 - wrap(x, MAP) / CELL) * CELL, (Math.floor(gi / GRID) + 0.5 - wrap(y, MAP) / CELL) * CELL)
    {
        // Pure crater law: queue on cast → partial sink → honest landing.
        const gs = makeGame(7)
        gs.deforms.length = 0
        const base = gs.heights.slice()
        const X = 100, Y = 120, R = 14, D = 10
        crater(gs, X, Y, R, D)
        const gi0 = giAt(X, Y)
        const full = D * (1 - cellD(gi0, X, Y) / R) ** 2
        r.check('the land never pops: a crater queues and lands nothing on its cast tick',
            gs.deforms.length === 1 && gs.heights.every((h, i) => h === base[i]), `deforms=${gs.deforms.length}`)
        for (let t = 0; t < Math.floor(CRUMBLE_T / 4); t++) step(gs, {})
        const q = base[gi0] - gs.heights[gi0]
        r.check('collapse accelerates (ease-in): a quarter-window sinks a sliver, far under linear',
            q > 0.001 && q < full * 0.1, `sunk ${(q / full).toFixed(3)} of full at t=${Math.floor(CRUMBLE_T / 4)} (linear would read 0.20)`);
        const rimSeen = (() => {
            // capture the rim heave at mid-window: any ring cell strictly above base
            let up = 0
            for (let i = 0; i < GRID * GRID; i++) {
                const d = cellD(i, X, Y)
                if (d > R && d <= R * 1.25 && gs.heights[i] > base[i] + 0.02) up++
            }
            return up
        })()
        for (let t = Math.floor(CRUMBLE_T / 4); t < CRUMBLE_T; t++) step(gs, {})
        let worst = 0, outside = 0
        for (let i = 0; i < GRID * GRID; i++) {
            const d = cellD(i, X, Y)
            const want = d <= R ? Math.max(0, base[i] - D * (1 - d / R) ** 2) : base[i]
            worst = Math.max(worst, Math.abs(gs.heights[i] - want))
            if (d > R * 1.25 && Math.abs(gs.heights[i] - base[i]) > 1e-9) outside++
        }
        r.check('crumble converges: the land equals the instant machine at cast+CRUMBLE_T',
            worst < 1e-9, `worst ${worst.toExponential(2)}`)
        r.check('the shockwave is no erosion: outside the ring nothing moved, ever',
            outside === 0, `offenders ${outside}`)
        r.check('the shockwave rim heaves mid-window (the ground is pushed aside as it falls)',
            rimSeen > 0, `rim cells up at mid-window ${rimSeen}`)
    }
    {
        // RAISE swells ease-out — most of the mound is visible by quarter-window.
        const gs = makeGame(7)
        gs.deforms.length = 0
        const X = 300, Y = 80, R = 16, HG = 14
        const base = gs.heights.slice()
        raiseTerrain(gs, X, Y, R, HG)
        const gi0 = giAt(X, Y)
        const full = HG * (1 - cellD(gi0, X, Y) / R) ** 2
        for (let t = 0; t < Math.floor(CRUMBLE_T / 4); t++) step(gs, {})
        const q = gs.heights[gi0] - base[gi0]
        r.check('mounds swell ease-out: a third of the mound already there by quarter-window',
            q > full * 0.3, `lift ${q.toFixed(2)} of ${full.toFixed(2)} at t=${Math.floor(CRUMBLE_T / 4)}`)
        for (let t = Math.floor(CRUMBLE_T / 4); t < CRUMBLE_T; t++) step(gs, {})
        let worst = 0
        for (let i = 0; i < GRID * GRID; i++) {
            const d = cellD(i, X, Y)
            const want = d <= R ? Math.min(96, base[i] + HG * (1 - d / R) ** 2) : base[i]
            worst = Math.max(worst, Math.abs(gs.heights[i] - want))
        }
        r.check('RAISE converges to the instant mound (counter-spell maths unchanged)',
            worst < 1e-9, `worst ${worst.toExponential(2)}`)
    }
    {
        // Queue mechanics are rng-free and regen-safe: replay bit-identical,
        // a fresh world never inherits a pending ripple.
        const drive = () => {
            const gs = makeGame(7)
            gs.learned.push('raise', 'dissolve'); gs.mana = 500
            let i = 0
            for (; i < 900; i++) {
                const inp = autopilot(gs)
                if (i === 120 || i === 480) { gs.hands.L = 'raise'; inp.castL = true }
                if (i === 240) { gs.hands.L = 'dissolve'; inp.castL = true }
                gs.mana = Math.max(gs.mana, 100)
                step(gs, inp)
            }
            return gs
        }
        const a = drive(), b = drive()
        r.check('crumbling is deterministic: same seed → identical heights and hash',
            stateHash(a) === stateHash(b) && a.heights.every((h, i) => h === b.heights[i]), stateHash(a))
        const stale = drive()
        crater(stale, 60, 60, 18, 12, 1)
        step(stale, {})
        stale.level = 1
        genWorld(stale)
        r.check('regen clears pending ripples — fresh land is never dug by stale work',
            stale.deforms.length === 0)
        const h0 = stale.heights.slice()
        for (let t = 0; t < CRUMBLE_T + 2; t++) step(stale, {})
        let dug = 0
        for (let j = 4; j < 12; j++) for (let i = 4; i < 12; i++) if (stale.heights[j * GRID + i] < h0[j * GRID + i] - 1e-9) dug++
        r.check('and the drained queue leaves the fresh world untouched', dug === 0, `cells dug ${dug}`)
    }
    {
        // Source pins: the drain sits in step() (one driver), regen clears,
        // and the queue is part of the contract-visible state.
        const simSrc = await readFile(new URL('../src/games/MagicCarpet/sim.js', import.meta.url), 'utf8')
        r.check('crumble law pinned in source: step() drains before casts, genWorld clears',
            /drainDeforms\(gs\) \/\/[\s\S]{0,1200}if \(inp\.castL/.test(simSrc) &&
            /function genWorld\(gs\) \{\s*\n\s*gs\.deforms = \[\]/.test(simSrc))
    }
}

// ---- #1697: CRUMBLE FEEDBACK — the landing thuds, slurps, shakes and throws
// grit, all driven off the deform queue's landing (cast + CRUMBLE_T), and all
// presentation-only. Mutation guide: (1) delete the gs.events.push in
// drainDeforms' last branch — the landing, scaling, distance and flood gates go
// red while the #1694 convergence gates hold; (2) return constant prox in
// crumbleFeel — the scaling/distance gates go red; (3) raise the mag threshold
// above 12 or drop the flooded flag — the gates named for them go red;
// (4) route the thud to playTone in index.jsx — the bus-pin goes red;
// (5) delete spawnGrit — the browser grit gate goes red.
{
    const drainTo = (gs) => {
        // step ticks until a crumble event lands (or bail); returns that event.
        for (let t = 0; t < CRUMBLE_T + 2; t++) {
            step(gs, {})
            const e = gs.events.find((ev) => ev.type === 'crumble')
            if (e) return { e, t: t + 1 }
        }
        return null
    }
    {
        const gs = makeGame(7)
        gs.x = 100; gs.y = 100
        crater(gs, 110, 100, 14, 10, 1)
        gs.events.length = 0
        const mid = (() => { for (let t = 0; t < CRUMBLE_T - 1; t++) step(gs, {}); return gs.events.some((e) => e.type === 'crumble') })()
        const land = drainTo(gs)
        r.check('#1697 a sink lands: one crumble event, exactly at the window close',
            !mid && !!land && land.e.kind === 'crater' && land.e.hot === 1 && gs.deforms.length === 0,
            `mid=${mid} land=${land ? JSON.stringify({ k: land.e.kind, t: land.t }) : 'never'}`)
        const f = crumbleFeel(gs, land.e)
        r.check('#1697 a crater dropping under the carpet shakes the view (size>0, prox>0)',
            f.shake > 1 && f.vol > 0.2 && f.prox > 0, JSON.stringify(f))
        r.check('#1697 feel is a pure read — computing the thud never disturbs the hash',
            stateHash(gs) === (() => { crumbleFeel(gs, { x: 110, y: 100, mag: 7 }); return stateHash(gs) })())
    }
    {
        const gs = makeGame(7)
        gs.x = 100; gs.y = 100
        crater(gs, 400, 100, 14, 10, 1) // over the next hill: 300u away
        gs.events.length = 0
        const land = drainTo(gs)
        const f = crumbleFeel(gs, land.e)
        r.check('#1697 distant casts land silent — no thud, no shake beyond ear-shot',
            land.e.x === wrap(400, MAP) && f.prox === 0 && f.vol === 0 && f.shake === 0 &&
            crumbleFeel(gs, { ...land.e, x: wrap(gs.x + CRUMBLE_HEAR_R + 1, MAP), y: gs.y }).vol === 0,
            JSON.stringify(f))
    }
    {
        // size-scaled: at equal distance, more earth moved = louder and harder.
        const gs = makeGame(7)
        gs.x = 100; gs.y = 100
        const feelAt = (d) => crumbleFeel(gs, { x: wrap(gs.x + d, MAP), y: gs.y, mag: 10 })
        const a = feelAt(80), b = feelAt(40), c = feelAt(0)
        r.check('#1697 thud falls off smoothly with distance (0 at horizon, louder closer)',
            a.vol > 0 && a.vol < b.vol && b.vol < c.vol && c.prox === 1,
            `${a.vol.toFixed(2)} < ${b.vol.toFixed(2)} < ${c.vol.toFixed(2)}`)
        const mk = (depth) => { const g = makeGame(7); g.x = 100; g.y = 100; crater(g, 100, 100, 14, depth, 0); const mag = g.deforms[0].mag; return { mag, ...crumbleFeel(g, { x: 100, y: 100, mag }) } }
        const small = mk(4), big = mk(12)
        r.check('#1697 a volcano vent thuds harder than a bolt crater (mag scales shake and vol)',
            big.mag > small.mag && big.shake > small.shake && big.vol > small.vol,
            `bolt ${small.mag.toFixed(1)}/${small.shake.toFixed(2)} vs vent ${big.mag.toFixed(1)}/${big.shake.toFixed(2)}`)
        // the real casts: fireball (depth 10) vs the volcano's main vent (12).
        const fb = makeGame(7); crater(fb, 100, 100, 14, 10, 1)
        const v0 = makeGame(7); volcanoErupt(v0, 100, 100)
        const ventMag = Math.max(...v0.deforms.map((d) => d.mag))
        r.check('#1697 the volcano main vent queues more earth than a fireball (landing scaling is real)',
            ventMag > fb.deforms[0].mag, `fireball ${fb.deforms[0].mag.toFixed(1)} vs vent ${ventMag.toFixed(1)}`)
    }
    {
        const gs = makeGame(7)
        gs.x = 100; gs.y = 100
        dissolveLand(gs, 110, 100)
        gs.events.length = 0
        const land = drainTo(gs)
        r.check('#1697 a dissolve wound lands flooded — the slurp knows the sea arrived',
            land && land.e.kind === 'dissolve' && land.e.flooded === 1 &&
            sampleH(gs, 110, 100) < WATER,
            land ? `kind=${land.e.kind} flooded=${land.e.flooded} h=${sampleH(gs, 110, 100).toFixed(1)}<${WATER}` : 'never')
        const gs2 = makeGame(7)
        gs2.x = 100; gs2.y = 100
        raiseTerrain(gs2, 110, 100, 16, 14)
        gs2.events.length = 0
        for (let t = 0; t < CRUMBLE_T + 2; t++) step(gs2, {})
        r.check('#1697 mounds land upward and stay silent — no impact event for RAISE',
            !gs2.events.some((e) => e.type === 'crumble') && gs2.deforms.length === 0)
    }
    {
        const idxSrc = await readFile(new URL('../src/games/MagicCarpet/index.jsx', import.meta.url), 'utf8')
        const rendSrc = await readFile(new URL('../src/games/MagicCarpet/renderer.js', import.meta.url), 'utf8')
        const handler = idxSrc.match(/e\.type === 'crumble'\) \{[\s\S]{0,1400}?\n\s+\} else if/)
        r.check('#1697 landing sound rides the MUFFLE bus (amb* behind the veil, never destination)',
            !!handler && /ambTone\(/.test(handler[0]) && /ambSweep\(/.test(handler[0]) &&
            !/audioController\.play(Tone|Sweep|Noise)\(/.test(handler[0]) && /crumbleFeel\(gs, e\)/.test(handler[0]))
        r.check('#1697 grit rides the ash pool only at the rim of craters — cold, size-gated, no scorch',
            /e\.type === 'crumble'\) spawnGrit/.test(rendSrc) &&
            /spawnGrit[\s\S]{0,1400}'ash'/.test(rendSrc) &&
            /kind !== 'crater' \|\| e\.mag < 3/.test(rendSrc) &&
            !/spawnGrit[\s\S]{0,1200}addScorch/.test(rendSrc))
    }
}

await requireDevServer(`http://localhost:${process.env.DEV_PORT || 5173}/retrogames/magic-carpet`)
const browser = await launch()
const page = await openGame(browser, { url: `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/magic-carpet`, hook: '__game', start: false })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
const gpuErrs = []
page.on('console', (m) => { if (m.type() === 'error' && /shader|webgl/i.test(m.text())) gpuErrs.push(m.text().slice(0, 160)) })

const meta = await page.evaluate(() => window.__game.meta)
r.check('contract meta magic-carpet with A+B', meta?.id === 'magic-carpet' && meta.buttons.includes('a') && meta.buttons.includes('b'))
const png = await page.evaluate(() => window.__game.frame())
r.check('frame() paints the world', typeof png === 'string' && png.startsWith('data:image/png') && png.length > 2000, `${png?.length}b`)
const det = await page.evaluate(() => {
    const g = window.__game
    const runIt = () => {
        g.reset(7)
        for (let i = 0; i < 200; i++) g.step({ up: i % 4 < 2, a: i % 13 < 2 }, 1)
        return g.state()
    }
    const a = runIt(); const b = runIt()
    g.release()
    return { same: a.hash === b.hash, tick: a.tick, done: a.done }
})
r.check('browser determinism: reset(7)+200 twice → same hash', det.same && det.tick === 200, JSON.stringify(det))
const hooked = await page.evaluate(() => {
    const t = window.__carpetTest
    t.start()
    return t.probe().screen
})
r.check('__carpetTest starts play mode', hooked === 'play', hooked)
await page.waitForTimeout(700)
const live = await page.evaluate(() => window.__carpetTest.probe())
r.check('play mode ticks with no stuck loop', live.tick > 20, `tick=${live.tick}`)

// ---- GPU world pass (#1083): the GPU must actually render the world, craters
// must visibly feed the terrain upload (glow), lava cools, scorch persists.
// Reload first so every shader compile lands under the console listener.
await page.reload({ waitUntil: 'load' })
await page.waitForFunction(() => window.__game && window.__carpetTest, null, { timeout: 15000 })
await page.waitForTimeout(500)
const gpuA = await page.evaluate(() => {
    const t = window.__carpetTest
    t.start()
    const stats = (x, y, w, h) => {
        const p = t.pixels(x, y, w, h)
        if (!p) return null
        let rs = 0, gs = 0, bs = 0, n = 0
        const lum = []
        for (let i = 0; i < p.length; i += 4) {
            rs += p[i]; gs += p[i + 1]; bs += p[i + 2]
            lum.push(0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2])
            n++
        }
        const mr = rs / n, mg = gs / n, mb = bs / n
        const m = lum.reduce((a, b) => a + b, 0) / n
        const sd = Math.sqrt(lum.reduce((a, b) => a + (b - m) * (b - m), 0) / n)
        return { r: mr, g: mg, b: mb, mean: m, sd }
    }
    return { gl2: t.gl2(), sky: stats(0.5, 0.10, 40, 8), ground: stats(0.5, 0.80, 40, 8), center: stats(0.35, 0.42, 48, 110) }
})
r.check('GPU world pass present (WebGL2 renderer alive)', gpuA.gl2 === true)
r.check('sky paints: bright and blue-dominant', gpuA.sky && gpuA.sky.mean > 28 && gpuA.sky.b > gpuA.sky.r + 12,
    gpuA.sky ? `mean ${gpuA.sky.mean.toFixed(0)} rgb ${gpuA.sky.r.toFixed(0)},${gpuA.sky.g.toFixed(0)},${gpuA.sky.b.toFixed(0)}` : 'no readback')
r.check('terrain reads different from sky below the horizon', gpuA.ground && gpuA.sky &&
    Math.hypot(gpuA.ground.r - gpuA.sky.r, gpuA.ground.g - gpuA.sky.g, gpuA.ground.b - gpuA.sky.b) > 24,
    gpuA.ground ? `ground rgb ${gpuA.ground.r.toFixed(0)},${gpuA.ground.g.toFixed(0)},${gpuA.ground.b.toFixed(0)} vs sky rgb ${gpuA.sky.r.toFixed(0)},${gpuA.sky.g.toFixed(0)},${gpuA.sky.b.toFixed(0)}` : 'no readback')
r.check('the world has texture, not a flat fill', gpuA.center && gpuA.center.sd > 6, `sd ${gpuA.center ? gpuA.center.sd.toFixed(1) : 'n/a'}`)
await page.evaluate(() => { window.__carpetTest.digHot() })
await page.waitForTimeout(150)
const gpuDig = await page.evaluate(() => {
    const t = window.__carpetTest
    const p = t.pixels(0.35, 0.72, 48, 18)
    if (!p) return null
    const lum = []
    for (let i = 0; i < p.length; i += 4) lum.push(0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2])
    const m = lum.reduce((a, b) => a + b, 0) / lum.length
    return { mean: m, sd: Math.sqrt(lum.reduce((a, b) => a + (b - m) ** 2, 0) / lum.length) }
})
r.check('digging at the feet lights the near ground (camera sits ON its terrain grid)',
    gpuDig && gpuA.ground && Math.abs(gpuDig.mean - gpuA.ground.mean) > 3 && gpuDig.sd > 2,
    gpuDig ? `after dig mean ${gpuDig.mean.toFixed(1)} sd ${gpuDig.sd.toFixed(1)} vs ground mean ${gpuA.ground.mean.toFixed(1)}` : 'no readback')
await page.evaluate(() => { window.__carpetTest.digHot(); window.__carpetTest.fx({ type: 'boom', x: 100, y: 100 }) })
await page.waitForTimeout(200)
const gpuB = await page.evaluate(() => ({ glow: window.__carpetTest.glowCells(), scorch: window.__carpetTest.scorchCells() }))
r.check('a hot crater feeds lava glow into the terrain upload', gpuB.glow >= 4, `glow cells ${gpuB.glow}`)
r.check('blasts leave persistent scorch in the terrain upload', gpuB.scorch >= 6, `scorch cells ${gpuB.scorch}`)
await page.evaluate(() => { for (let i = 0; i < 320; i++) window.__game.step({}, 1) })
await page.waitForTimeout(200)
const gpuC = await page.evaluate(() => ({ glow: window.__carpetTest.glowCells(), scorch: window.__carpetTest.scorchCells(), tick: window.__carpetTest.probe().tick }))
r.check('lava glow cools to nothing after CRATER_GLOW ticks', gpuC.glow === 0, `glow cells ${gpuC.glow} at tick ${gpuC.tick}`)
r.check('scorch outlives the glow', gpuC.scorch >= 6, `scorch cells ${gpuC.scorch}`)

// ---- #1090 polish A: the world pass is world-time driven, not wall-clock.
// Water shimmer, lava flicker, clouds and cloud shadows all sample uWorldTime
// (sim ticks), so two captures at the SAME tick must be pixel-identical. Run
// before the rubble gate so no particles exist on screen yet (particles
// integrate per paint frame). Mutation guide: switch the water block back to
// uTime (performance.now) in renderer.js tFrag and consecutive captures
// diverge — this gate goes red.
const sameTick = await page.evaluate(async () => {
    const t = window.__carpetTest
    window.__game.reset(7)
    for (let i = 0; i < 40; i++) window.__game.step({}, 1)
    await new Promise((res) => setTimeout(res, 150))
    const grab = () => t.pixels(0.3, 0.75, 64, 10)
    const a = grab()
    await new Promise((res) => setTimeout(res, 150))
    const b = grab()
    if (!a || !b) return { ok: false, why: 'no readback' }
    let diff = 0
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i])
    return { ok: a.length === b.length && diff === 0, diff, tick: t.probe().tick }
})
r.check('same tick renders identical frames: water/clouds/shadow animate on WORLD time (#1090)',
    sameTick.ok, `sumAbsDiff=${sameTick.diff} at tick ${sameTick.tick}${sameTick.why ? ' (' + sameTick.why + ')' : ''}`)

// ---- #1090 polish B: rubble keeps smouldering long after the fire is gone.
// Reset clears particles; killHut marks a hut dead (burn 0); after 40 ticks the
// dead-rubble emitter must still be breathing smoke with no hot crater anywhere
// (glow===0 rules out crater/blast smoke as the source). Mutation guide: delete
// the `hs.dead` smoke branch in renderer.js emitAmbient and this gate goes red.
await page.evaluate(() => { window.__game.reset(7) })
await page.waitForTimeout(250)
const smokeLate = await page.evaluate(async () => {
    const t = window.__carpetTest
    t.killHut()
    for (let i = 0; i < 40; i++) window.__game.step({}, 1)
    await new Promise((res) => setTimeout(res, 800))
    return { puffs: t.smokePuffs(), glow: t.glowCells() }
})
r.check('dead rubble keeps smouldering long after the fire is gone (#1090)',
    smokeLate.puffs > 0 && smokeLate.glow === 0, `smoke instances ${smokeLate.puffs}, glow ${smokeLate.glow}`)

// ---- #1612 item 1: the veiled carpet breathes additive ghost motes behind it.
// Mutation guide: delete the `gs0.invis > 0` block in fillParticles (renderer.js)
// and this gate goes red while every other gate holds.
await page.evaluate(() => { window.__game.reset(7) })
await page.waitForTimeout(250)
const trail = await page.evaluate(async () => {
    const t = window.__carpetTest
    const clean = t.trailMotes()
    t.veil()
    await new Promise((res) => setTimeout(res, 600))
    return { clean, motes: t.trailMotes(), invis: t.probe().invis }
})
r.check('the veiled carpet leaves a ghost trail in the GL pass (#1612)',
    trail.invis > 0 && trail.motes > trail.clean + 8, `motes ${trail.clean} -> ${trail.motes} (veil ${trail.invis})`)

// ---- #1646 item 1: killed bodies crumble to ash where they stand, like the
// original. Ash is a distinct particle kind, so this counts cold grit only.
// Mutation guide: delete the `kill` branch in renderer.js handleEvents and this
// gate goes red (crumbles stays 0 while every other gate holds). The world
// reset must clear the grit — no particle leak across worlds.
await page.evaluate(() => { window.__game.reset(7); window.__carpetTest.start() })
await page.waitForTimeout(250)
const crumble = await page.evaluate(async () => {
    const t = window.__carpetTest
    const clean = t.crumbles()
    const p = t.probe()
    t.fx({ type: 'kill', kind: 'giant', x: p.x + 15, y: p.y + 15 })
    await new Promise((res) => setTimeout(res, 150))
    const seen = t.crumbles()
    window.__game.reset(7)
    await new Promise((res) => setTimeout(res, 150))
    return { clean, seen, cleared: t.crumbles() }
})
r.check('a killed creature crumbles to ash in place (#1646)',
    crumble.clean === 0 && crumble.seen >= 12 && crumble.cleared === 0,
    `ash ${crumble.clean} -> ${crumble.seen} -> cleared ${crumble.cleared}`)

// #1697 browser leg: the landing event drives real particles and real
// scheduled sound, scaled by distance; raise landings throw nothing.
const land1697 = await page.evaluate(() => {
    // AudioContext needs the page's own unlock gesture before any one-shot
    // schedules; a synthetic keydown runs the App's once-listener.
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
    const t = window.__carpetTest
    const { x, y } = t.carpet()
    const ev = (kind, dx, mag) => t.fx({ type: 'crumble', kind, mag, x: x + dx, y, r: 28, hot: 0, flooded: kind === 'dissolve' ? 1 : 0 })
    const ash0 = t.crumbles(), sfx0 = t.sfx()
    ev('crater', 40, 10)
    const ashNear = t.crumbles(), sfxNear = t.sfx()
    ev('raise', 40, 14)
    const ashRaise = t.crumbles(), sfxRaise = t.sfx()
    ev('crater', 260, 10)
    const sfxFar = t.sfx()
    return { ash0, ashNear, ashRaise, sfx0, sfxNear, sfxRaise, sfxFar }
})
r.check('#1697 a crater landing throws cold grit through the ash pool (#1697)',
    land1697.ashNear - land1697.ash0 >= 8 && land1697.ashRaise === land1697.ashNear,
    `ash ${land1697.ash0} -> ${land1697.ashNear} (raise ${land1697.ashRaise})`)
r.check('#1697 a near landing schedules the thud; a distant one schedules nothing (#1697)',
    land1697.sfxNear > land1697.sfx0 && land1697.sfxRaise > land1697.sfxNear && land1697.sfxFar === land1697.sfxRaise,
    `sfx ${land1697.sfx0} -> ${land1697.sfxNear} -> ${land1697.sfxRaise} -> ${land1697.sfxFar}`)

// ---- #1612 item 4 (browser): veiling actually closes the ambience low-pass the
// shell drives the wind/growl bed through. Mutation guide: drop the
// setMuffle(muffleOf(gs)) call in index.jsx and the veiled reading is null.
await page.evaluate(() => { window.__game.reset(7); window.__carpetTest.start() })
await page.waitForTimeout(300)
const muffleOpen = await page.evaluate(() => window.__carpetTest.muffle())
await page.evaluate(() => { window.__carpetTest.veil() })
await page.waitForTimeout(300)
const muffleVeil = await page.evaluate(() => window.__carpetTest.muffle())
if (muffleOpen === null || muffleVeil === null) {
    // headless shells without an audio device never bring up the ambience bus —
    // a question this box cannot ask, not a wrong answer (Report.skip doctrine).
    r.skip('the veil muffles the world — ambience low-pass', `bus not up on this box (open=${muffleOpen} veiled=${muffleVeil})`)
} else {
    r.check('the veil muffles the world — the ambience bus low-pass drops while veiled, open when visible',
        muffleOpen >= 10000 && muffleVeil > 0 && muffleVeil <= 1000, `open=${muffleOpen} veiled=${muffleVeil}`)
}
r.check('no shader/WebGL console errors', gpuErrs.length === 0, gpuErrs.join(' | '))
r.check('zero page errors', errs.length === 0, errs.join(' | '))

// ---- #1673: phone-size DISSOLVE pass (390x844, real touchscreen taps).
// Why this section exists: on 2026-11-06 the phone look&feel pass could not run at
// all — copied-lane worktrees inherit main checkout's self-referential
// `node_modules/node_modules` symlink, Vite's optimizer then resolves react twice and
// EVERY page dies on "Invalid hook call" (the #1622 react-dup half, previously misread
// as a MagicCarpet failure). Gate 1 is that regression catcher: phone viewport loads
// with zero page errors. Mutation guide: delete `resolve.dedupe` from vite.config.js
// in a copied tree and gate 1 goes red. The tray gates below drive real touch events
// through the shell's own onPointer (CSS->HUD mapping), which no Node gate can see:
// change the slot stride in sim.js TRAY or the 11-key row in index.jsx and the
// slot-11 / Minus gates go red.
// a second WebGL page inside the same --single-process shell is a crash risk
// (#1622 ladder boots shell+sp here) — give the phone pass its own browser.
await browser.close()
const pBrowser = await launch()
const phone = await openGame(pBrowser, {
    url: `http://localhost:${process.env.DEV_PORT || 5173}/retrogames/magic-carpet`,
    viewport: { width: 390, height: 844 }, touch: true, start: false, hook: '__game',
})
const pErrs = []
phone.on('pageerror', (e) => pErrs.push(e.message))
await phone.waitForTimeout(600)
r.check('#1673 dev-graph on phones: 390x844 touch load, zero page errors (one react)',
    pErrs.length === 0, pErrs.join(' | '))
const hud = await phone.evaluate(() => window.__carpetTest.hudRect())
const toCss = (hx, hy) => [hud.left + (hx / W) * hud.w, hud.top + (hy / H) * hud.h]
// The #1147 hint is up at this size (portrait + wide canvas) — before any tap
// can dismiss it, prove it does not swallow the stage: MagicCarpet's portrait
// band runs through the screen centre and its tray sits under the card, so a
// pointer-events-auto card made every mid-canvas tap vanish (#1673's four red
// touch gates). Mutation guide: card back to pointer-events-auto → red here.
const hintUp = await phone.evaluate(() => !!document.querySelector('[data-nav="rotate-dismiss"]'))
const centreCss = toCss(W / 2, H / 2 - 40)
const centreHit = await phone.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y)
    return el ? `${el.tagName.toLowerCase()}${el.dataset.vc ? '[vc]' : ''}` : 'none'
}, centreCss)
r.check('#1673 ROTATE hint is click-through: canvas centre hit-tests to the canvas while the hint is up',
    hintUp && centreHit === 'canvas', `hint up=${hintUp}, centre hit=${centreHit}`)
// start by tap (any tap leaves attract), exactly the forgotten-how-to-play gesture
await phone.touchscreen.tap(...toCss(W / 2, H / 2 - 40))
await phone.waitForTimeout(500)
r.check('#1673 attract yields to a single phone tap',
    (await phone.evaluate(() => window.__carpetTest.probe())).screen === 'play',
    `screen=${(await phone.evaluate(() => window.__carpetTest.probe())).screen}`)
// 1) SPELLS tab by real touch, then the 11th tray cell equips DISSOLVE left-handed
await phone.touchscreen.tap(...toCss(TAP.book[0] + TAP.book[2] / 2, TAP.book[1] + TAP.book[3] / 2))
await phone.waitForTimeout(120)
const bookOpen = (await phone.evaluate(() => window.__carpetTest.probe())).book
await phone.evaluate(() => window.__carpetTest.arm('dissolve'))
const s11 = [TRAY[0] + 10 * 14 + 7, TRAY[1] + TRAY[3] / 2] // slot 11 centre, HUD px
await phone.touchscreen.tap(...toCss(...s11))
await phone.waitForTimeout(120)
const after = await phone.evaluate(() => window.__carpetTest.probe())
r.check('#1673 real touch: SPELLS tab opens the tray at phone size', bookOpen === true)
r.check('#1673 slot 11 is inside the HUD and tappable at 390x844 (tray strip on-screen)',
    s11[0] >= 0 && s11[0] <= W && hud.w > 0 && hud.h > 0,
    `slot@css ${Math.round(toCss(...s11)[0])},${Math.round(toCss(...s11)[1])} of 390x844, hud ${Math.round(hud.w)}x${Math.round(hud.h)}`)
r.check('#1673 tap on the 11th cell equips DISSOLVE to the left hand and closes the tray',
    after.hands.L === 'dissolve' && after.book === false, `L=${after.hands.L} book=${after.book}`)
r.info('#1673 legibility', `each tray cell ≈ ${(14 * hud.w / W).toFixed(1)}x${(22 * hud.h / H).toFixed(1)} CSS px at 390x844 (below the 44pt HIG target — accepted: 11 slots on the original's 320px strip, keyboard/pad carry casts)`)
// 4) the `-` keycap: Minus equips the 11th spell on a desktop keyboard
await phone.evaluate(() => { window.__game.reset(7); window.__carpetTest.start(); window.__carpetTest.arm('dissolve') })
await phone.waitForTimeout(150)
await phone.evaluate(() => { window.__carpetTest.tap(0, 0) })
await phone.keyboard.press('Minus')
await phone.waitForTimeout(120)
r.check('#1673 Minus equips DISSOLVE (the row after Digit0)',
    (await phone.evaluate(() => window.__carpetTest.probe())).hands.L === 'dissolve')
// 2) cold FX: a dissolving ground sprays cyan particles — and provably no ash/fire
await phone.evaluate(() => window.__game.reset(7))
await phone.waitForTimeout(200)
const pBefore = await phone.evaluate(() => window.__carpetTest.trailMotes())
await phone.evaluate(() => window.__carpetTest.fx({ type: 'dissolve', x: 100, y: 100, r: 22, huts: 0 }))
await phone.waitForTimeout(100)
const fxA = await phone.evaluate(() => ({ parts: window.__carpetTest.trailMotes(), ash: window.__carpetTest.crumbles() }))
await phone.screenshot({ path: 'docs/shots/issue-1673-dissolve-fx.png' })
r.check('#1673 DISSOLVE FX: cold cyan spray spawns on the wound, zero fire/ash',
    fxA.parts >= pBefore + 16 && fxA.ash === 0, `particles ${pBefore} -> ${fxA.parts}, ash ${fxA.ash}`)
// 3) the banner row at phone size: cast for real (touch the world) and the shell says it
await phone.evaluate(() => { window.__game.reset(7); window.__carpetTest.start(); window.__carpetTest.arm('dissolve'); window.__carpetTest.equipL('dissolve') })
await phone.waitForTimeout(200)
const mA = (await phone.evaluate(() => window.__carpetTest.probe())).mana
const mM = await phone.evaluate(() => window.__carpetTest.trailMotes())
await phone.touchscreen.tap(...toCss(W / 2, 60)) // world tap above the strip = cast
await phone.waitForTimeout(250)
const cast = await phone.evaluate(() => ({ mana: window.__carpetTest.probe().mana, screen: window.__carpetTest.probe().screen, motes: window.__carpetTest.trailMotes() }))
await phone.screenshot({ path: 'docs/shots/issue-1673-phone-play.png' })
r.check('#1673 world tap casts DISSOLVE at phone size (40 mana paid, spray rides the wound, banner rides the HUD)',
    cast.screen === 'play' && cast.mana <= mA - 40 && cast.motes >= mM + 16,
    `mana ${mA}->${cast.mana}, motes ${mM}->${cast.motes}, screen=${cast.screen}`)
await phone.close()
await pBrowser.close()

r.exit()

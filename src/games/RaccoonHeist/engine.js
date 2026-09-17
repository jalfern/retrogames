// RACCOON HEIST — the simulation.
//
// Everything that *decides* lives here: movement, sight, noise, heat, catching,
// carrying, winning. `world.js` only builds geometry, `art.js` only draws, `levels.js`
// only describes, and `stealth.js` is arithmetic you can test in Node. That split is
// the reason this file has no THREE geometry in it: the engine moves numbers and moves
// transforms, and nothing else.
//
// Three rules in here are load-bearing and were learned by the game being unfair:
//
// 1. **Sight is geometry, and it is drawn.** A guard's cone is a mesh on the floor in
//    the world, so the player can read it. Detection therefore uses the same
//    `losWorld`/`coneAlign` pair the audit tests — the drawn cone and the deadly cone
//    cannot drift apart, which is the classic stealth-game lie.
// 2. **Noise is an event, not a stat.** Every footstep, splash and clattered lid
//    pushes a Noise into a queue; guards ask `hears()` about it. Thunder sets
//    `masked` on that window, which is how a storm becomes a mechanic you plan around
//    instead of weather you look at.
// 3. **Being caught is not game over.** A caught raccoon goes in the pound, and the
//    rest of the crew can chew the lock and get them out. Losing the whole crew ends
//    the job; losing one is a setback with a rescue in it.

import * as THREE from 'three'
import { T, CELL, at, atWorld, cellOf, blocksMove, blocksSight, reachFrom, pathBetween, worldOf, CREW, CELL_NAME } from './levels.js'
import * as S from './stealth.js'
import { makeAgent } from './world.js'
import { makeRaccoon, animRaccoon, animWalker, makeLoot, makeIconTex, makeTex, disposables, lootValue, lootLabel, rng } from './art.js'

const RADIUS = 0.32
const LOOT_CH = '$%&*'
const CAUGHT_FREEZE = 1.1
/**
 * Chase speed per kind, m/s, and the reason it is a table rather than a multiplier:
 * an alerted guard used to run `patrolSpeed * 1.75`, which for the 1.2–1.6 m/s patrols
 * in these levels meant 2.1–2.8 m/s — and a raccoon *walks* at 2.75. So walking away
 * from a chase always worked, which is the same thing as saying the guards could not
 * catch you and the game had no consequence. Now a walk gets you caught and a dash
 * (5.0 m/s, loud, costs wind) is how you actually escape: that is the whole stealth
 * economy, and it only exists if the numbers point this way.
 */
const CHASE = { guard: 3.4, dog: 4.4, cop: 3.55 }

/** Brass filings off a lock that is nearly through. One shared material, many sprites. */
const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })

export function createEngine({ level, world, camera, audio = null, onEvent = null }) {
    const L = level
    const group = new THREE.Group()
    const rnd = rng(L.w * 131 + L.h * 7 + 3)
    const cellNameOf = (wx, wz) => { const [cx, cy] = cellOf(L, wx, wz); return CELL_NAME[at(L, cx, cy)] || '??' }

    const emit = (e) => { if (onEvent) onEvent(e); return e }
    const say = (text, secs = 2.6) => { st.msg = text; st.msgT = secs }

    // ---------------------------------------------------------------- marks -------
    const markOf = (ch) => L.marks.filter(m => m.ch === ch)
    const cartMark = markOf('S')[0]
    const gateMark = markOf('X')[0]
    // Colliders handed over by the world: { x, z, r } in metres, one per prop that
    // stands on a walkable cell. Copied shallowly so the sim owns a flat array of
    // numbers and never reaches into a scene graph to decide where you can walk.
    const props = (world.props || []).map(p => ({ x: p.x, z: p.z, r: p.r }))
    const poundMark = markOf('P')[0]
    const cartW = { x: cartMark.wx, z: cartMark.wz }
    const gateW = { x: gateMark.wx, z: gateMark.wz }
    const poundW = { x: poundMark.wx, z: poundMark.wz }

    // --------------------------------------------------------------- crew ---------
    /**
     * Free cells around a point, spiralling outward. Two rules, both learned from the
     * screenshot where the opening frame was a close-up of the inside of a shopping
     * cart: nothing may spawn inside a wall, and nothing may spawn in a *prop* — the
     * cart, the pound and the gate all occupy walkable cells, and standing inside the
     * cart at the start hides your raccoon behind a wire basket for the whole job.
     */
    function freeAround(wx, wz, want) {
        const [cx, cy] = cellOf(L, wx, wz)
        const taken = L.marks
            .filter(m => 'SXPV'.includes(m.ch))
            .map(m => ({ x: m.wx, z: m.wz }))
        const seen = []
        for (let r = 0; r < 6 && seen.length < want; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
                    const x = cx + dx, y = cy + dy
                    if (blocksMove(at(L, x, y))) continue
                    const [x2, z2] = worldOf(L, x, y)
                    if (seen.some(s => Math.hypot(s.x - x2, s.z - z2) < 0.9)) continue
                    if (taken.some(t => Math.hypot(t.x - x2, t.z - z2) < 1.9)) continue
                    seen.push({ x: x2, z: z2 })
                    if (seen.length >= want) break
                }
            }
        }
        return seen
    }

    const starts = freeAround(cartW.x, cartW.z, 3)
    const crew = CREW.map((def, i) => {
        const mesh = makeRaccoon({ bandana: def.bandana, seed: i + 1 })
        const p = starts[Math.min(i, starts.length - 1)] || cartW
        mesh.position.set(p.x, 0, p.z)
        group.add(mesh)
        return {
            def, mesh, i, x: p.x, z: p.z, yaw: 0, speed: 0,
            crouched: false, hidden: null, caged: false, held: null,
            wind: 1, step: 0, det: 0, spotT: 0, blink: 0, nextBlink: 1.5 + rnd() * 5,
            chew: 0, alive: true, freeT: 0,
        }
    })
    let active = 0
    const actor = () => crew[active]

    // ------------------------------------------------------------- watchers -------
    /** A watcher is a guard, a cop or a dog: same brain, different numbers. */
    function spawnWatcher(spec, wx, wz, pts) {
        const half = spec.cone ?? 0.66
        const range = spec.range ?? 9
        const agent = makeAgent(spec.kind, half, Math.min(range, 11))
        agent.group.position.set(wx, 0, wz)
        group.add(agent.group)
        group.add(agent.cone)
        // Route points arrive as the level's derived `{x,y,wx,wz}` markers; a cop
        // spawn hands over a bare cell. Accept both rather than silently producing a
        // watcher walking toward NaN, which is a guard that stands still forever.
        const route = (pts || []).map(p => (Array.isArray(p)
            ? { x: worldOf(L, p[0], p[1])[0], z: worldOf(L, p[0], p[1])[1] }
            : { x: p.wx ?? p.x, z: p.wz ?? p.z }))
        return {
            ...spec, half, x: wx, z: wz, yaw: 0, state: 'patrol', route, ri: 0, rdir: 1,
            path: null, pi: 0, repath: 0, aim: null, wait: 0, waitT: spec.wait ?? 0.9, cool: 0,
            // Suspicion is per-watcher, per-prey. It used to live on the raccoon as one
            // shared number, which meant every guard who could NOT see you subtracted
            // from the one who could: walking a second guard's route made you
            // invincible, and the level got easier the more enemies it had.
            det: crew.map(() => 0),
            lastSeen: null, lose: 0, stun: 0, torch: spec.kind !== 'dog', mesh: agent.group,
            coneMesh: agent.cone, alertT: 0, home: { x: wx, z: wz }, Speed: spec.speed || 1.5,
        }
    }
    const watchers = L.routes.map((r, i) => {
        const p0 = r.pts[0]
        return spawnWatcher({ ...r, id: i }, p0.wx, p0.wz, r.pts)
    })
    const cops = markOf('C').map((m, i) => ({ spec: { kind: i === 0 ? 'cop' : 'cop2', speed: 2.15, range: 12.5, cone: 1.0, hear: 9, id: 'cop' + i }, m, w: null }))

    // ---------------------------------------------------------------- loot --------
    const glowTex = makeTex('puddle', 1, 1)
    const loot = markOf('$').concat(markOf('%'), markOf('&'), markOf('*')).map((m, i) => {
        const mesh = makeLoot(m.ch)
        mesh.position.set(m.wx, 0, m.wz)
        mesh.rotation.y = rnd() * 6.283
        group.add(mesh)
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTex, color: m.ch === '&' ? 0x7fe8ff : 0xffd47a, transparent: true, opacity: 0.5,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }))
        glow.scale.setScalar(1.9)
        glow.position.set(m.wx, 0.6, m.wz)
        group.add(glow)
        return { kind: m.ch, x: m.wx, z: m.wz, value: lootValue(m.ch), label: lootLabel(m.ch), taken: false, delivered: false, mesh, glow, i }
    })
    const totalValue = loot.reduce((a, l) => a + l.value, 0)

    // ------------------------------------------------- shinies, cans, the cat -----
    const shinies = markOf('N').map((m) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0a8, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }))
        s.scale.setScalar(0.7)
        s.position.set(m.wx, 0.32, m.wz)
        group.add(s)
        const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshStandardMaterial({ color: 0xfff4c0, emissive: 0xffd47a, emissiveIntensity: 1.6, roughness: 0.1, metalness: 0.7 }))
        spark.position.copy(s.position)
        group.add(spark)
        return { x: m.wx, z: m.wz, mesh: s, spark, taken: false }
    })
    const cans = markOf('T').map((m) => ({ x: m.wx, z: m.wz, tipped: false, noise: 0 }))

    // --------------------------------------------- pound lock & gate chain --------
    /**
     * Two props the sim *owes* the player a body for. `CHEW ULTRA LOOSE` used to be a
     * line of HUD text aimed at a cage with no lock on it ("I don't see a lock"), and
     * "the cart is full" used to be answered by a door quietly rising. Both now have
     * hardware that shakes, snaps and falls, and `heistplay` asserts a lock-material mesh
     * sits at every verb's anchor — so an invisible affordance is a build failure rather
     * than a playtest finding. See `affordance()` at the bottom of this file.
     */
    const padlock = (world.cage && world.cage.userData.padlock) || null
    const cageW = { x: poundMark.wx, z: poundMark.wz }
    const gateChain = (world.gate && world.gate.userData.chain) || null
    const gateLock = (world.gate && world.gate.userData.lock) || null
    const home = {
        pad: padlock ? padlock.position.clone() : null,
        chain: gateChain ? gateChain.position.clone() : null,
        gate: gateLock ? gateLock.position.clone() : null,
    }
    const cageYaw = world.cage ? world.cage.rotation.y : 0
    let lockOff = false

    /** A point given in the pound's own space, out where sparks and the HUD can use it. */
    function cagePoint(lx, ly, lz) {
        const c = Math.cos(cageYaw), s = Math.sin(cageYaw)
        return [cageW.x + c * lx + s * lz, ly, cageW.z - s * lx + c * lz]
    }

    /** Hardware that has been bitten off: it falls, tumbles, and rests on the ground. */
    const falling = []
    function drop(o, opts = {}) {
        if (!o) return
        o.userData.shake = 0
        falling.push({ o, y: o.position.y, vy: -0.3, spin: (rnd() - 0.5) * 9, t: 0, rest: opts.rest ?? 0.06, lie: !!opts.lie })
    }
    function rehang(o, at) {
        if (!o || !at) return
        for (let i = falling.length - 1; i >= 0; i--) if (falling[i].o === o) falling.splice(i, 1)
        o.visible = true
        o.position.copy(at)
        o.rotation.set(0, 0, 0)
    }

    /** Brass filings off a lock that is nearly through. Three at a time, half a second each. */
    const sparks = []
    function sparkAt(x, y, z, n = 3) {
        for (let i = 0; i < n; i++) {
            const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), SPARK_MAT)
            s.position.set(x, y, z)
            group.add(s)
            sparks.push({ s, vx: (rnd() - 0.5) * 2.4, vy: 1.1 + rnd() * 1.6, vz: (rnd() - 0.5) * 2.4, life: 0.32 + rnd() * 0.2 })
        }
    }

    // The cat: walks in from wherever it came in, pads over to the cart, and back. The
    // route is *derived* with the same BFS the guards use, so it cannot be unwalkable.
    const catMark = markOf('@')[0]
    let cat = null
    if (catMark) {
        const mesh = makeAgent('cat').group
        mesh.position.set(catMark.wx, 0, catMark.wz)
        group.add(mesh)
        const p = pathBetween(L, [catMark.x, catMark.y], [cartMark.x, cartMark.y])
        cat = {
            mesh, x: catMark.wx, z: catMark.wz, yaw: 0, speed: 1.25,
            route: p ? p.map(([x, y]) => ({ x: worldOf(L, x, y)[0], z: worldOf(L, x, y)[1] })) : [],
            ri: 0, rdir: 1, mode: 'walk', sit: 0,
        }
    }

    // -------------------------------------------------------------- state ---------
    const st = {
        phase: 'brief', t: 0, elapsed: 0, heat: 0, alarm: false, copsOut: false,
        shinies: 2, delivered: 0, deliveredValue: 0, caught: 0, msg: '', msgT: 0,
        hint: '', objective: '', flash: 0, masked: false, nextFlash: 2.5, storm: L.theme === 'manor' ? 1 : 0.18,
        gateOpen: false, shake: 0, result: null, camYaw: 0, camYawEff: 0, camSide: 0, camPitch: 0.62, camDist: 7.2,
        camX: cartW.x, camZ: cartW.z + 7, camY: 4, freeze: 0, caughtWho: -1,
    }
    const noises = []
    const icons = []
    const flying = []
    const closedV = new Set(world.vaults.map(v => cellOf(L, v.x, v.z).join(',')))
    const gateCell = cellOf(L, gateW.x, gateW.z).join(',')

    // ------------------------------------------------------- collision -----------
    /** Solid for *this* moment: grid, plus the vault doors and gate that can change. */
    function solid(wx, wz) {
        const key = cellOf(L, wx, wz).join(',')
        if (closedV.has(key) || (key === gateCell && !st.gateOpen)) return true
        return blocksMove(atWorld(L, wx, wz))
    }

    /**
     * Circle-vs-world. Two layers, because the grid alone was the whole collision model
     * and a raccoon could therefore walk through every hydrant, bin, pallet, lamppost,
     * cart and guard in the game — the map is coarse (2.2 m cells) and all the
     * interesting furniture is *decoration standing on a walkable cell*.
     *
     *  - the grid: walls, fences, crates, dumpsters, shut doors;
     *  - `props`: a radius per stamped prop, so a lamppost stops you at a lamppost
     *    rather than at the middle of its cell.
     *
     * `self` exists so that being *already* inside something is not a prison: an actor
     * pushed inside a radius by a shove, a respawn or a `moveTo` can always walk out.
     */
    function blocked(x, z, self) {
        const [cx, cy] = cellOf(L, x, z)
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const gx = cx + dx, gy = cy + dy
                // `solid` first: a shut vault door is a FLOOR cell in the grid, so the
                // grid alone would happily let a raccoon walk into steel.
                if (!blocksMove(at(L, gx, gy)) && !solid((gx + L.ox) * CELL, (gy + L.oz) * CELL)) continue
                const bx = (gx + L.ox) * CELL, bz = (gy + L.oz) * CELL
                const half = CELL / 2
                const nx = Math.max(bx - half, Math.min(x, bx + half))
                const nz = Math.max(bz - half, Math.min(z, bz + half))
                if ((x - nx) ** 2 + (z - nz) ** 2 < RADIUS * RADIUS) return true
            }
        }
        for (const p of props) {
            const rr = p.r + RADIUS
            const ox = x - p.x, oz = z - p.z
            if (ox * ox + oz * oz >= rr * rr) continue
            if (self) {
                const sx = self.x - p.x, sz = self.z - p.z
                if (sx * sx + sz * sz < rr * rr) continue // already inside: let them out
            }
            return true
        }
        return false
    }

    /** Axis-separated slide: you always get the wall you scraped, never the corner. */
    function move(o, dx, dz) {
        let moved = false
        if (dx && !blocked(o.x + dx, o.z, o)) { o.x += dx; moved = true }
        if (dz && !blocked(o.x, o.z + dz, o)) { o.z += dz; moved = true }
        return moved
    }

    /**
     * Bodies are not ghosts. Two actors that overlap get nudged apart along the line
     * between them, which is what "I was standing on top of the guard" was really
     * complaining about: nothing anywhere in this game pushed back.
     */
    function separate(a, b, r) {
        const dx = b.x - a.x, dz = b.z - a.z
        const d2 = dx * dx + dz * dz
        if (d2 > r * r || d2 < 1e-6) return
        const d = Math.sqrt(d2)
        const push = (r - d) / 2
        const ux = dx / d, uz = dz / d
        if (!blocked(b.x + ux * push, b.z + uz * push, b)) { b.x += ux * push; b.z += uz * push }
        if (!blocked(a.x - ux * push, a.z - uz * push, a)) { a.x -= ux * push; a.z -= uz * push }
    }

    // --------------------------------------------------------- noise pipes --------
    function noise(x, z, r, kind, opts = {}) {
        if (st.masked) return null
        const n = S.makeNoise(x, z, r, kind, opts)
        noises.push(n)
        if (audio && opts.audible !== false && r > 2) audio.step?.(r)
        return n
    }

    function alertWatcher(w, c) {
        if (w.state === 'alert') return
        w.state = 'alert'
        w.alertT = 0
        w.lastSeen = { x: c.x, z: c.z }
        w.path = null
        st.heat = Math.min(100, st.heat + 20)
        st.shake = Math.max(st.shake, 0.5)
        icon(w, '!', 1.4)
        // A shout. Every watcher who can hear the commotion turns toward it and starts
        // filling their own meter, so a spotted run escalates into a *job* instead of
        // one furious guard trailing you forever while his colleague watches the wall.
        for (const o of watchers) {
            if (o === w || o.state === 'alert') continue
            const dd = Math.hypot(o.x - w.x, o.z - w.z)
            if (dd > (o.hear || 6) * 2.2) continue
            o.state = 'suspect'
            o.aim = { x: c.x, z: c.z }
            o.path = null
            o.det[c.i] = Math.max(o.det[c.i], 0.35)
            icon(o, '!', 0.9)
        }
        emit({ type: 'spotted', who: c.def.name, kind: w.kind })
        audio?.spot?.()
        say(`${w.kind === 'dog' ? 'THE DOG' : 'SPOTTED'} — ${w.kind === 'dog' ? 'run' : 'move!'}`, 1.8)
    }

    function icon(w, kind, life) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeIconTex(kind), transparent: true, depthWrite: false, depthTest: false }))
        s.position.set(w.x, w.kind === 'dog' ? 1.1 : 2.25, w.z)
        s.scale.setScalar(kind === '!' ? 0.8 : 0.65)
        group.add(s)
        icons.push({ s, life, max: life })
    }

    // --------------------------------------------------- objectives ------------
    const remaining = () => loot.filter(l => !l.delivered).length
    // Which piles are behind the shut vault door? Derived from the map with the door
    // sealed, once, at mount — the same flood fill the level audit uses, so the HUD and
    // the audit cannot disagree about what is locked away.
    const doorKeys = new Set(world.vaults.map(v => cellOf(L, v.x, v.z).join(',')))
    const shut = reachFrom(L, ...cellOf(L, cartW.x, cartW.z), { block: ['X', 'V'] })
    const behindDoor = loot.filter(l => {
        const [cx, cy] = cellOf(L, l.x, l.z)
        return !shut[cy * L.w + cx]
    })
    const outsidePiles = () => loot.filter(l => !l.delivered && !behindDoor.includes(l)).length
    // A door that hides nothing is not a level feature, it is a bug. Fail loudly here
    // rather than shipping a lock nobody needed to pick.
    if (doorKeys.size && !behindDoor.length) console.warn('[heist] vault seals nothing reachable-only-with-it')
    function refreshObjective() {
        if (st.gateOpen) st.objective = 'GET TO THE GATE'
        else if (crew.some(c => c.caged)) st.objective = `FREE ${crew.find(c => c.caged).def.name}`
        else if (actor().held) st.objective = 'CARRY IT TO THE CART'
        else if (outsidePiles() > 0) st.objective = 'LOAD THE CART'
        else if (doorKeys.size && remaining() > 0) st.objective = 'CHEW THE VAULT LOCK'
        else st.objective = 'LOAD THE CART'
    }
    refreshObjective()

    function openGate() {
        if (st.gateOpen) return
        st.gateOpen = true
        // The chain snaps. A gate that rises in silence reads as a door in a shop;
        // hardware coming off it tells you "GO" from across the yard without a HUD.
        drop(gateChain, { rest: 0.09, lie: true })
        drop(gateLock, { rest: 0.07 })
        audio?.clank?.()
        emit({ type: 'gate' })
        audio?.gate?.()
        say('THE GATE IS UP — GO, GO, GO', 3.4)
        refreshObjective()
    }

    function finish(win) {
        st.phase = win ? 'clear' : 'bust'
        const delivered = st.deliveredValue
        const t = win ? S.tally({
            lootValue: delivered, totalValue, delivered: st.delivered, secs: Math.round(st.elapsed),
            par: L.par, caught: st.caught, shinies: st.shinies,
        }) : { value: Math.round(delivered * 0.25), clean: 0, complete: false }
        st.result = {
            win, value: t.value, clean: t.clean, delivered: st.delivered, total: loot.length,
            secs: Math.round(st.elapsed), caught: st.caught, left: crew.filter(c => !c.caged).length,
        }
        emit({ type: win ? 'clear' : 'bust', ...st.result })
        if (win) audio?.win?.(); else audio?.bust?.()
    }

    // ---------------------------------------------------------- crew action ------
    /** What would pressing the action button do right now? Same scan as `act()`. */
    function focus() {
        const a = actor()
        if (!a || a.caged) return null
        const near = (o, r) => Math.hypot(o.x - a.x, o.z - a.z) <= r
        const caged = crew.find(c => c.caged)
        if (caged && near({ x: poundW.x, z: poundW.z }, 1.7)) return { kind: 'free', label: `CHEW ${caged.def.name} LOOSE`, t: caged }
        if (a.held && near(cartW, 1.9)) return { kind: 'deliver', label: 'LOAD THE CART' }
        const l = loot.find(l => !l.taken && near(l, 1.15))
        if (l) return { kind: 'take', label: `TAKE ${l.label.toUpperCase()}`, t: l }
        const v = world.vaults.find(v => Math.hypot(v.x - a.x, v.z - a.z) < 1.5 && closedV.has(cellOf(L, v.x, v.z).join(',')))
        if (v) return { kind: 'chew', label: a.def.id === 1 ? 'TINKER THE LOCK' : 'CHEW THE LOCK', t: v }
        const s = shinies.find(s => !s.taken && near(s, 1.1))
        if (s) return { kind: 'shiny', label: 'POCKET THE SHINY', t: s }
        const can = cans.find(c => !c.tipped && near(c, 1.25))
        if (can) return { kind: 'can', label: 'TIP THE CAN', t: can }
        return null
    }

    /**
     * The action button. `mode` is 'tap' for one press or 'hold' while the button is
     * down: picking stuff up is a tap, chewing a lock or a cage padlock is a hold,
     * because the hold is the thing that makes a lock feel like work.
     */
    function act(mode, dt) {
        const f = focus()
        if (!f) return
        const a = actor()
        const hold = f.kind === 'chew' || f.kind === 'free'
        if (hold !== (mode === 'hold')) return
        switch (f.kind) {
            case 'take': {
                const l = f.t
                l.taken = true
                l.mesh.visible = false
                l.glow.visible = false
                a.held = l
                audio?.grab?.()
                emit({ type: 'take', label: l.label, value: l.value })
                say(`SWIPED ${l.label.toUpperCase()}`, 1.8)
                noise(a.x, a.z, 2.2, 'grab')
                break
            }
            case 'deliver': {
                const l = a.held
                l.delivered = true
                l.taken = false
                a.held = null
                st.delivered++
                st.deliveredValue += l.value
                pile(l)
                audio?.drop?.()
                emit({ type: 'deliver', n: st.delivered, total: loot.length })
                say(remaining() ? `${remaining()} TO GO — CART LOADED ${st.delivered}/${loot.length}` : 'CART IS FULL', 2.4)
                if (!remaining()) openGate()
                refreshObjective()
                break
            }
            case 'shiny':
                f.t.taken = true
                f.t.mesh.visible = false
                f.t.spark.visible = false
                st.shinies++
                audio?.pickup?.()
                say('A SHINY. THROW IT AND THEY WILL LOOK', 2)
                break
            case 'can': {
                f.t.tipped = true
                f.t.noise = 1
                audio?.clank?.()
                noise(f.t.x, f.t.z, 7.5, 'clatter', { loud: 1.3 })
                say('CLANG. They heard that.', 1.6)
                break
            }
            case 'chew':
            case 'free': {
                const rate = (a.def.grab || 1) * 0.85
                a.chew += rate * dt
                a.crouched = true
                if (audio && Math.random() < dt * 9) audio?.chew?.()
                // The lock is the progress bar. It shakes harder as it gives, and it
                // throws filings once it is nearly through — a HUD ring says "some
                // mechanic is happening", a rattling padlock says "this one is nearly off".
                const need = f.kind === 'chew' ? 1.6 : 1.5
                const p = Math.min(1, a.chew / need)
                if (f.kind === 'free' && padlock && !lockOff) {
                    padlock.userData.shake = 0.01 + p * 0.055
                    if (p > 0.6 && rnd() < dt * 14) sparkAt(...cagePoint(padlock.position.x, padlock.position.y, padlock.position.z))
                } else if (f.kind === 'chew' && f.t.pivot) {
                    f.t.pivot.userData.jig = 0.5 + p
                }
                // A padlock gives faster than a vault tumler, and it must: being locked
                // up is the state where every second of the clock is your friend getting
                // bagged too.
                if (a.chew >= need) {
                    a.chew = 0
                    if (f.kind === 'chew') {
                        const key = cellOf(L, f.t.x, f.t.z).join(',')
                        closedV.delete(key)
                        f.t.wanted = 1
                        audio?.unlock?.()
                        emit({ type: 'unlock' })
                        say('LOCK CHEWED. In we go.', 2.2)
                        noise(a.x, a.z, 4.5, 'chew', { loud: 0.8 })
                    } else {
                        f.t.caged = false
                        // The lock goes where the pound's state says it belongs. If a
                        // second raccoon is still inside, the door gets locked again the
                        // instant this one comes out — otherwise the cage sits open with
                        // the HUD still advertising CHEW, and the next rescue is chewing
                        // air (which is exactly what the padlock, once chewed off, did
                        // for the whole second round). Empty pound: the lock stays off and
                        // rusts on the ground where it fell.
                        const stillInside = crew.some(x => x.caged)
                        if (padlock) {
                            if (stillInside) { sparkAt(...cagePoint(padlock.position.x, padlock.position.y, padlock.position.z), 4); rehang(padlock, home.pad) }
                            else if (!lockOff) { lockOff = true; drop(padlock, { rest: 0.07 }); audio?.clank?.() }
                        }
                        f.t.x = a.x; f.t.z = a.z
                        f.t.wind = 0.35
                        f.t.freeT = 3
                        audio?.free?.()
                        emit({ type: 'free', who: f.t.def.name })
                        say(`${f.t.def.name} IS FREE`, 2)
                    }
                    refreshObjective()
                }
                break
            }
            default: break
        }
    }

    /** Delivered loot visibly piles up in the cart, because the cart is the score. */
    function pile(l) {
        const m = makeLoot(l.kind)
        m.scale.setScalar(0.62)
        m.position.set((rnd() - 0.5) * 0.6, 0.55 + st.delivered * 0.05, (rnd() - 0.5) * 0.4)
        m.rotation.y = rnd() * 6.283
        world.cart.userData.pile.add(m)
    }

    function throwShiny() {
        if (st.shinies <= 0) { say('NO SHINIES LEFT', 1.2); return }
        const a = actor()
        st.shinies--
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0a8, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }))
        s.scale.setScalar(0.45)
        s.position.set(a.x, 0.8, a.z)
        group.add(s)
        flying.push({ s, x: a.x, z: a.z, y: 0.8, vx: Math.sin(a.yaw) * 6.5, vz: Math.cos(a.yaw) * 6.5, vy: 2.6 })
        audio?.throw?.()
    }

    function switchTo(i) {
        const c = crew[i]
        if (!c) return
        if (c.caged) { say(`${c.def.name} IS LOCKED UP`, 1.4); return }
        if (c.i === active) return
        crew[active].crouched = true
        active = c.i
        emit({ type: 'swap', who: c.def.name })
        audio?.swap?.()
        say(`${c.def.name} — ${c.def.note}`, 2)
        refreshObjective()
    }

    function swap() {
        for (let i = 1; i <= crew.length; i++) {
            const c = crew[(active + i) % crew.length]
            if (!c.caged) { switchTo(c.i); return }
        }
        say('NOBODY ELSE TO SWITCH TO', 1.4)
    }

    // -------------------------------------------------------------- update -------
    function updateCrew(dt, input) {
        const a = actor()
        for (const c of crew) {
            c.blink = c.nextBlink < 0 ? 0 : c.blink
            c.nextBlink -= dt
            if (c.nextBlink < -0.13) c.nextBlink = 1.6 + rnd() * 5
            c.blink = c.nextBlink < 0 ? 1 : 0
        }
        if (a.caged) {
            a.mesh.position.set(poundW.x + (a.i - 1) * 0.42, 0.16, poundW.z)
            a.mesh.rotation.y = Math.sin(st.t * 1.5) * 0.4
            animRaccoon(a.mesh, dt, 0, { alert: true })
            return
        }
        const crouch = !!input.crouch
        const wantDash = !!input.dash && a.wind > 0.05
        const prof = S.moveProfile(a.def, { crouch, dash: wantDash, wind: a.wind })
        // Stick is camera-relative, which is the only mapping that survives a camera
        // you can orbit: down-left on the thumb is always "back toward the cart".
        const mx = input.mx || 0, my = input.my || 0
        const mag = Math.min(1, Math.hypot(mx, my))
        // The camera the player is looking through, including any slide around a corner.
        const eff = st.camYawEff ?? st.camYaw
        const sin = Math.sin(eff), cos = Math.cos(eff)
        // The camera looks along (sin, cos), so screen-right — that vector rotated -90°
        // about Y, with Y up and Z flipped the way three.js flips it — is (-cos, sin).
        // The first version had the sign of the whole strafe axis inverted, which made
        // D go left and A go right, and which no screenshot can show and no "did it move"
        // test can catch. Heistplay now pins the direction in world space.
        const wx = my * sin - mx * cos
        const wz = my * cos + mx * sin
        const cell = atWorld(L, a.x, a.z)
        const inWater = cell === T.WATER
        const sp = prof.speed * mag * (inWater ? 0.62 : 1)
        const dx = wx * (mag > 0.02 ? (sp / Math.max(0.001, Math.hypot(wx, wz))) : 0) * dt
        const dz = wz * (mag > 0.02 ? (sp / Math.max(0.001, Math.hypot(wx, wz))) : 0) * dt
        if (mag > 0.02) {
            move(a, dx, dz)
            const want = Math.atan2(wx, wz)
            let d = want - a.yaw
            while (d > Math.PI) d -= Math.PI * 2
            while (d < -Math.PI) d += Math.PI * 2
            a.yaw += d * Math.min(1, dt * 13)
        }
        a.speed += ((mag > 0.02 ? sp : 0) - a.speed) * Math.min(1, dt * 10)
        a.crouched = crouch && mag > 0.02 ? true : crouch
        // Stamina: dashes are finite, and the HUD meter is the reason you learn the cost.
        a.wind = Math.max(0, Math.min(1, a.wind + (wantDash && mag > 0.1 ? -0.34 : 0.17) * dt * (crouch ? 1.25 : 1)))

        // Footfalls. Crouching is silent; water never is.
        const stepRate = prof.noise > 0 ? Math.max(0.16, 0.62 - sp * 0.07) : Infinity
        a.step += dt
        if (mag > 0.05 && a.step > stepRate) {
            a.step = 0
            const r = inWater ? 9.5 : prof.noise * a.def.noise
            noise(a.x, a.z, r, inWater ? 'splash' : 'step', { loud: inWater ? 1.4 : 1 })
            if (inWater && audio) audio.splash?.()
        }
        // Cover is a place, not a skill: crouch inside a bin or a hedge and you are in
        // it — the mesh sinks, the sensor multiplies your visibility down hard.
        const hideCell = cell === T.DUMP || cell === T.BUSH ? cell : null
        a.hidden = crouch && hideCell ? (hideCell === T.DUMP ? 'dump' : 'bush') : null
        const sink = a.hidden === 'dump' ? -0.5 : 0
        a.mesh.position.set(a.x, sink, a.z)
        a.mesh.rotation.y = a.yaw
        animRaccoon(a.mesh, dt, mag > 0.05 ? sp : 0, {
            crouch: crouch || !!a.hidden, carry: !!a.held, alert: watchers.some(w => w.state === 'alert'),
            shine: true, blink: !!a.blink, earTwitch: (st.t * 1 + a.i) % 3.4 > 3.1,
        })
        if (a.held) a.held.mesh.position.set(a.x, 0.62, a.z)
    }

    function updateIdle(dt) {
        for (let i = 0; i < crew.length; i++) {
            if (i === active) continue
            const c = crew[i]
            if (c.caged) {
                c.mesh.position.set(poundW.x + (c.i - 1) * 0.42, 0.16, poundW.z)
                animRaccoon(c.mesh, dt, 0, { alert: true, shine: true })
                continue
            }
            c.mesh.position.set(c.x, c.crouched ? -0.05 : 0, c.z)
            animRaccoon(c.mesh, dt, 0, { crouch: c.crouched, carry: !!c.held, shine: true, blink: !!c.blink })
        }
    }

    function updateWatchers(dt) {
        for (const w of watchers.concat(cops.map(c => c.w).filter(Boolean))) {
            // ---- hear the world -------------------------------------------------
            let pull = null
            for (const n of noises) {
                const h = S.hears(n, w.x, w.z, w.hear || 6, st.masked)
                if (h > 0 && (!pull || h > pull.h)) pull = { h, x: n.x, z: n.z }
            }
            if (pull && w.state === 'patrol') {
                w.state = 'suspect'
                w.aim = { x: pull.x, z: pull.z }
                w.path = null
                w.wait = 0
                icon(w, '?', 1.1)
                emit({ type: 'suspicious', kind: w.kind })
            }

            // ---- pick a destination ---------------------------------------------
            let goal = null
            if (w.state === 'patrol' && w.route.length) {
                const p = w.route[w.ri]
                goal = p
                if (Math.hypot(p.x - w.x, p.z - w.z) < 0.45) {
                    if (w.route.length > 1) {
                        if (w.loop) w.ri = (w.ri + 1) % w.route.length
                        else {
                            w.ri += w.rdir
                            if (w.ri >= w.route.length - 1) w.rdir = -1
                            if (w.ri <= 0) w.rdir = 1
                        }
                    }
                    w.path = null
                    w.wait = (w.waitT || 0) * rnd()
                }
            } else if (w.state === 'suspect') {
                goal = w.aim
            } else if (w.state === 'alert') {
                goal = w.lastSeen
                w.alertT += dt
                // Close, visible, and chasing a *cell* is how a guard loses a race it
                // has already won: waypoints are 2.2 m apart, so the guard stops a metre
                // short of you and stands there looking furious. Inside this radius it
                // abandons the path and walks straight at the actual raccoon.
                w.direct = null
                let pd = 3.6
                for (const c of crew) {
                    if (c.caged) continue
                    const d = Math.hypot(c.x - w.x, c.z - w.z)
                    if (d < pd && S.losWorld(L, w.x, w.z, c.x, c.z)) { w.direct = c; pd = d }
                }
                if (w.direct) goal = w.direct
            } else if (w.state === 'stunned') {
                w.stun -= dt
                if (w.stun <= 0) w.state = 'suspect', w.aim = { x: w.x, z: w.z }
            }
            if (!goal && w.state !== 'stunned') { w.state = 'patrol'; w.path = null; continue }

            // ---- path and step ---------------------------------------------------
            w.repath -= dt
            if (!w.path || w.repath <= 0) {
                const from = cellOf(L, w.x, w.z)
                const to = cellOf(L, goal.x, goal.z)
                // Guards may not use a vault door that is still shut. If they could,
                // they would walk through solid steel and the player would rightly
                // assume the game is cheating.
                w.path = pathBetween(L, from, to, { sealed: closedV })
                w.pi = 1
                w.repath = w.state === 'alert' ? 0.4 : 1.2
            }
            let sp = 0
            if (w.direct && w.state === 'alert' && w.direct.caged !== true) {
                const c = w.direct
                const d = Math.hypot(c.x - w.x, c.z - w.z)
                sp = CHASE[w.kind] || 3.2
                if (d > 0.05) {
                    move(w, ((c.x - w.x) / d) * sp * dt, ((c.z - w.z) / d) * sp * dt)
                    const want = Math.atan2(c.x - w.x, c.z - w.z)
                    let dd = want - w.yaw
                    while (dd > Math.PI) dd -= Math.PI * 2
                    while (dd < -Math.PI) dd += Math.PI * 2
                    w.yaw += dd * Math.min(1, dt * 9)
                }
                w.path = null
            } else if (w.state !== 'stunned' && w.path && w.pi < w.path.length) {
                const [nx, nz] = worldOf(L, w.path[w.pi][0], w.path[w.pi][1])
                const d = Math.hypot(nx - w.x, nz - w.z)
                if (d < 0.22) w.pi++
                else {
                    const mult = w.state === 'alert' ? 1.15 : w.state === 'suspect' ? 1.15 : 1
                    sp = w.state === 'alert' ? (CHASE[w.kind] || 3.1) : (w.Speed || 1.5) * mult
                    w.x += ((nx - w.x) / d) * sp * dt
                    w.z += ((nz - w.z) / d) * sp * dt
                    const want = Math.atan2(nx - w.x, nz - w.z)
                    let dd = want - w.yaw
                    while (dd > Math.PI) dd -= Math.PI * 2
                    while (dd < -Math.PI) dd += Math.PI * 2
                    w.yaw += dd * Math.min(1, dt * 7)
                }
            } else if (w.state === 'suspect' || (w.state === 'alert' && !w.path)) {
                // Arrived and found nothing: sweep the beam around, then give up.
                w.yaw += dt * 1.9
                w.wait += dt
                if (w.wait > (w.state === 'alert' ? 2.6 : 1.9)) { w.state = 'patrol'; w.path = null; w.wait = 0 }
            }
            w.mesh.position.set(w.x, 0, w.z)
            w.mesh.rotation.y = w.yaw
            animWalker(w.mesh, dt, sp, { alert: w.state === 'alert' })

            // ---- the drawn cone IS the deadly cone --------------------------------
            const on = w.state !== 'stunned'
            w.coneMesh.visible = on && (w.torch || st.alarm || w.state !== 'patrol')
            w.coneMesh.position.set(w.x, 0.05, w.z)
            w.coneMesh.rotation.y = w.yaw
            w.coneMesh.material.opacity = w.state === 'alert' ? 0.3 : w.state === 'suspect' ? 0.2 : 0.13

            // ---- see anyone ------------------------------------------------------
            for (const c of crew) {
                const k = c.i
                if (c.caged) { w.det[k] = 0; continue }
                let rate = 0
                // The torch is the threat, not the moon: inside a beam you are lit,
                // outside one, darkness is genuinely protective. That is why `align`
                // feeds `light` — a raccoon in the dark at 3 m takes seconds to notice,
                // the same raccoon in a lamplit patch under a torch takes under one.
                const floor = L.theme === 'museum' ? 0.8 : 0.5
                let align = 0
                if (S.losWorld(L, w.x, w.z, c.x, c.z)) {
                    const d = Math.hypot(c.x - w.x, c.z - w.z)
                    align = d > (w.range || 9) ? 0 : S.coneAlign(S.angleTo(w.yaw, c.x - w.x, c.z - w.z), w.half)
                    if (align > 0) {
                        const cover = S.coverOf(atWorld(L, c.x, c.z), c.crouched) * (c.hidden ? 0.1 : 1)
                        const light = Math.min(1.8, S.lightAt(world.lamps, c.x, c.z, floor) + align * 0.9 + (st.alarm ? 0.3 : 0))
                        rate = S.detectRate(d, align, { cover, light, aware: w.state === 'alert' ? 1.4 : 1 })
                    }
                }
                // Forgetting is slower than noticing, and only this watcher forgets.
                // Already chasing this one and still in the cone: keep the target live.
                // `lastSeen` used to refresh only when suspicion refilled, so an alert
                // guard would run to where you were ten seconds ago and give up there.
                if (rate > 0 && w.state === 'alert' && align > 0.25) { w.lastSeen = { x: c.x, z: c.z }; w.lose = 0 }
                w.det[k] = Math.max(0, w.det[k] + (rate > 0 ? rate * dt : -dt * 0.55))
                if (w.det[k] >= 1) {
                    w.det[k] = 0
                    alertWatcher(w, c)
                }
            }
            // Catch: an alerted watcher that touches an uncovered raccoon bags them.
            // The reach is an arm, not a handshake. It was 0.62 m, which — with a guard
            // that stopped on 2.2 m waypoints and a raccoon about 0.64 m wide — meant
            // "clearly on top of him" was not close enough, and the chase had no
            // consequence. A surprised watcher grabs too: bumping into a raccoon in the
            // dark is not a thing a guard just watches.
            // A guard who has just bagged a raccoon is busy bagging a raccoon. Without
            // this beat, the guard reaches straight past the bag for the next raccoon --
            // and since being caught now *switches you* to whoever is free, usually
            // standing right there, one mistake became three arrests and a bust in about
            // four seconds. That is what "once I'm caught the game is basically done"
            // really was: not a stuck game, a pile-up with no mercy window.
            if (w.cool > 0) w.cool -= dt
            if (w.cool <= 0 && (w.state === 'alert' || w.state === 'suspect')) {
                const reach = w.state === 'alert' ? (w.kind === 'dog' ? 1.25 : 1.15) : 0.85
                for (const c of crew) {
                    if (c.caged || c.hidden) continue
                    if (Math.hypot(c.x - w.x, c.z - w.z) < reach) catchCrew(c)
                }
                if (w.lastSeen && Math.hypot(w.x - w.lastSeen.x, w.z - w.lastSeen.z) < 0.6) {
                    w.lose += dt
                    if (w.lose > 2.2) { w.state = 'suspect'; w.aim = w.lastSeen; w.lose = 0; w.path = null }
                } else w.lose = 0
            } else if (w.state === 'patrol') {
                // Relaxed and looking away: this watcher stops wondering about anyone.
                for (let k = 0; k < w.det.length; k++) w.det[k] = Math.max(0, w.det[k] - dt * 0.5)
            }
        }
    }

    function catchCrew(c) {
        if (c.caged) return
        const wasHeld = c.i === active
        c.caged = true
        // Somebody got thrown in the pound, so the pound gets locked again. Without this
        // the second arrest of a job leaves an open cage with a raccoon rattling the bars,
        // and the verb that follows (`CHEW X LOOSE`) is once again pointing at nothing.
        if (lockOff) { lockOff = false; rehang(padlock, home.pad) }
        // The guard who took them: stand down for a beat, drop every other raccoon's
        // suspicion, and go tie the sack up. 2.8 s is the window the next raccoon gets.
        for (const w of watchers.concat(cops.map(k => k.w).filter(Boolean))) {
            if (Math.hypot(w.x - c.x, w.z - c.z) > 2.6) continue
            w.cool = 2.8
            w.det = w.det.map(() => 0)
            if (w.state === 'alert') {
                w.state = 'suspect'
                w.aim = { x: w.x, z: w.z }
                w.path = null
                w.direct = null
                w.lose = 0
            }
        }
        c.held = null
        st.caught++
        // Hand the player a raccoon that can still walk. This was the worst bug in the
        // build: `active` stayed on the caught raccoon, so the camera kept orbiting a
        // caged animal and every key did nothing -- the game looked hung, the HUD still
        // counted down, and the player had no idea the job was still running. Being
        // caught is supposed to *change* the job, not stop it.
        if (wasHeld) {
            const free = crew.find(x => !x.caged)
            if (free) {
                active = free.i
                emit({ type: 'swap', who: free.def.name })
                audio?.swap?.()
                say(`${free.def.name} TAKES OVER — ${free.def.note}`, 3.2)
                // And look at the new one, or the camera stays on the cage and the
                // player thinks the screen is the problem.
                st.camYaw = free.yaw
                st.camYawEff = free.yaw
                st.camX = free.x
                st.camZ = free.z
            }
        }
        st.shake = 1
        st.freeze = CAUGHT_FREEZE
        st.caughtWho = c.i
        emit({ type: 'caught', who: c.def.name })
        audio?.caught?.()
        say(`${c.def.name} IS IN THE POUND — GET THEM OUT`, 3.4)
        refreshObjective()
        if (crew.every(x => x.caged)) finish(false)
    }

    function updateCops() {
        const hot = st.heat >= 55
        if (hot && !st.copsOut) {
            st.copsOut = true
            emit({ type: 'cops' })
            audio?.siren?.()
            say('BLUE LIGHTS. COPS ON SCENE.', 3)
        }
        if (!st.copsOut) return
        for (const c of cops) {
            if (!c.w) {
                c.w = spawnWatcher(c.spec, c.m.wx, c.m.wz, [{ wx: c.m.wx, wz: c.m.wz }])
                c.w.state = 'suspect'
                c.w.aim = { x: cartW.x, z: cartW.z }
                continue
            }
            // Cops head for the last sighting, then sweep. They never go back to
            // standing still: a cop that loiters is a cop you can ignore.
            if (c.w.state === 'patrol') {
                const t = crew.find(x => !x.caged)
                c.w.state = 'suspect'
                c.w.aim = t ? { x: t.x, z: t.z } : { x: cartW.x, z: cartW.z }
                c.w.path = null
            }
        }
    }

    function updateCat(dt) {
        if (!cat || !cat.route.length) return
        // Does anyone's cone catch the cat? If so it bolts, and the guard chases a
        // shape that is faster and much less interested in the loot than you are.
        for (const w of watchers.concat(cops.map(c => c.w).filter(Boolean))) {
            if (w.state === 'alert' || !w.coneMesh.visible) continue
            const d = Math.hypot(cat.x - w.x, cat.z - w.z)
            if (d > (w.range || 9) * 0.6) continue
            if (S.coneAlign(S.angleTo(w.yaw, cat.x - w.x, cat.z - w.z), 0.5) <= 0) continue
            if (!S.losWorld(L, w.x, w.z, cat.x, cat.z)) continue
            w.state = 'suspect'
            w.aim = { x: cat.x, z: cat.z }
            w.path = null
            w.wait = 0
            icon(w, '?', 1)
            cat.mode = 'flee'
            emit({ type: 'cat' })
            audio?.cat?.()
            say('The cat bolted. They are looking at the cat.', 2)
            break
        }
        if (cat.sit > 0) { cat.sit -= dt; animWalker(cat.mesh, dt, 0, {}); cat.mesh.position.set(cat.x, 0, cat.z); return }
        const p = cat.route[cat.ri]
        const d = Math.hypot(p.x - cat.x, p.z - cat.z)
        const sp = cat.mode === 'flee' ? 3.6 : cat.speed
        if (d < 0.3) {
            cat.ri += cat.rdir
            if (cat.ri >= cat.route.length) { cat.ri = cat.route.length - 1; cat.rdir = -1; cat.mode = 'walk'; cat.sit = 1.6 + rnd() * 2 }
            if (cat.ri <= 0) { cat.ri = 0; cat.rdir = 1; cat.mode = 'walk'; cat.sit = 1 + rnd() * 2 }
        } else {
            cat.x += ((p.x - cat.x) / d) * sp * dt
            cat.z += ((p.z - cat.z) / d) * sp * dt
            cat.yaw = Math.atan2(p.x - cat.x, p.z - cat.z)
        }
        cat.mesh.position.set(cat.x, 0, cat.z)
        cat.mesh.rotation.y = cat.yaw
        animWalker(cat.mesh, dt, sp, {})
    }

    function updateStorm(dt) {
        const manor = L.theme === 'manor'
        st.nextFlash -= dt
        if (st.nextFlash <= 0) {
            st.nextFlash = manor ? 4 + rnd() * 6 : 12 + rnd() * 16
            st.flash = 1
            emit({ type: 'thunder' })
            audio?.thunder?.()
            if (manor) say('THUNDER — they cannot hear you now', 1.4)
        }
        st.flash = Math.max(0, st.flash - dt * (st.flash > 0.55 ? 1.5 : 0.7))
        // The mask window is deliberately *before* the flash fades: real thunder rolls
        // for a second and the noise that masks your footsteps arrives slightly late.
        st.masked = manor && st.flash > 0.25
    }

    /**
     * The hardware tick: locks that shake, locks that have come off, filings, and the
     * gate chain sliding off a gate that is no longer chained. Split out because it has
     * to run on the menu and during the freeze frames too -- a chain that snaps mid-arrest
     * must still land on the floor, or it hangs in the air for the rest of the job.
     */
    function updateHardware(dt) {
        if (padlock && padlock.userData.shake && !lockOff) {
            const s = padlock.userData.shake
            padlock.position.set(
                home.pad.x + (rnd() - 0.5) * s,
                home.pad.y + (rnd() - 0.5) * s,
                home.pad.z + (rnd() - 0.5) * s,
            )
            padlock.rotation.z = (rnd() - 0.5) * s * 7
            padlock.userData.shake = Math.max(0, s - dt * 0.12)
        }
        for (let i = falling.length - 1; i >= 0; i--) {
            const f = falling[i]
            f.t += dt
            f.vy -= 11 * dt
            const y = f.y + f.vy * dt
            if (y <= f.rest) {
                f.y = f.rest
                // Bounce once, then lie flat: a chain that lands and stays standing
                // vertical is the tell that none of this is simulated.
                f.vy = f.t < 0.8 && Math.abs(f.vy) > 1.2 ? -f.vy * 0.3 : 0
                if (f.lie) f.o.rotation.x += (Math.PI / 2 - f.o.rotation.x) * Math.min(1, dt * 6)
                f.spin *= 0.6
            } else f.y = y
            f.o.position.y = f.y
            f.o.rotation.z += f.spin * dt
            if (f.t > 2.2) falling.splice(i, 1)
        }
        for (let i = sparks.length - 1; i >= 0; i--) {
            const s = sparks[i]
            s.life -= dt
            s.vy -= 9 * dt
            s.s.position.set(s.s.position.x + s.vx * dt, s.s.position.y + s.vy * dt, s.s.position.z + s.vz * dt)
            s.s.rotation.y += dt * 12
            s.s.scale.setScalar(Math.max(0.05, s.life * 3))
            if (s.life <= 0 || s.s.position.y < 0.02) { group.remove(s.s); sparks.splice(i, 1) }
        }
    }

    function updateCamera(dt) {
        const a = actor()
        // Drone shot for the brief and the results cards: a slow, high orbit of the
        // whole job. It costs nothing because it is the same rig, and when play starts
        // the position lerp turns the orbit into a dive onto the spawn.
        if (st.phase !== 'play') {
            st.drone = (st.drone || 0) + dt * 0.09
            const R = Math.max(L.w, L.h) * CELL * 0.62
            camera.position.set(Math.sin(st.drone) * R, 13 + Math.sin(st.drone * 0.7) * 1.8, Math.cos(st.drone) * R)
            camera.lookAt(0, 1.2, 0)
            return
        }
        const dist = st.camDist * (a.crouched ? 0.9 : 1)
        const tx = a.x, ty = 0.95 + (a.hidden ? -0.3 : 0), tz = a.z
        st.camX += (tx - st.camX) * Math.min(1, dt * 7.5)
        st.camZ += (tz - st.camZ) * Math.min(1, dt * 7.5)
        const wantY = ty + Math.sin(st.camPitch) * dist
        // Occlusion through the *grid*, with the same sampler the guards' eyes use. A
        // mesh raycast against the merged wall batch would also work, but it would be a
        // second source of truth about where a wall is — and the last time this repo had
        // two of those, the drawn cone and the deadly cone disagreed.
        //
        // THREE-PROBE CAMERA COLLISION: the centre bearing plus a shoulder either side.
        // trick every third-person game uses, and this one badly needed it. Pulling
        // straight in is not an answer to a wall — the rig has a floor under its
        // distance, so "pull in" eventually means *bury the camera in brick*, and the
        // screen becomes one blurred wall with a HUD on it (which is exactly what a
        // walk along the north wall produced in production). So: if the centre probe has
        // no room, look for the direction that does — usually back down the corridor you
        // came from — and slide the rig there instead of clipping through the map.
        const room = (yawTry) => Math.min(dist, S.castWorld(L, tx, tz, -Math.sin(yawTry), -Math.cos(yawTry), dist + 0.5).dist)
        const need = Math.min(dist, 3.1)
        // Probes are yaw *deltas*, and the winning delta is what gets applied. The first
        // version probed rotated direction vectors and then recovered a sign from a cross
        // product, but rotating (-sin y, -cos y) by +a is the yaw y - a, not y + a, so
        // the rig slid to the mirror image of the bearing it had just measured: it would
        // find open ground to the east and put itself in the wall to the south. Where the
        // probe and the move must agree, they have to share one parameterisation.
        const sh = 0.55
        let side = 0
        // The bearing the rig is on *now*, before this frame's correction.
        const basis = st.camYaw + st.camSide
        const centre = room(basis)
        if (centre < need) {
            let best = centre
            // Up to ~2.75 rad (158 degrees) either side. In a corner there is no room
            // anywhere near the ideal bearing and the answer is to look nearly back the
            // way you came; probing only +/-35 degrees is what left the rig inside the
            // north wall in production.
            for (let mult = 1; mult <= 5; mult++) {
                for (const d of [sh * mult, -sh * mult]) {
                    const r = room(basis + d)
                    if (r > best + 0.12) { best = r; side = d }
                }
            }
        }
        // Slide smoothly, never snap: a camera that teleports 40 degrees reads as the
        // world lurching, and players report that as "the controls feel wrong". But slide
        // twice as fast while the rig is buried -- that only happens when the player is
        // wedged into a corner, which is exactly when an instant correction is polite.
        const candX = -Math.sin(basis + side), candZ = -Math.cos(basis + side)
        const stuckNow = blocksSight(atWorld(L, tx + candX * Math.min(dist, 2.4), tz + candZ * Math.min(dist, 2.4)))
        st.camSide += (side - st.camSide) * Math.min(1, dt * (stuckNow ? 11 : 4.5))
        const yaw = st.camYaw + st.camSide
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw)
        const wall = S.castWorld(L, tx, tz, fx, fz, dist + 0.5)
        let allowed = Math.max(1.75, Math.min(dist, wall.dist - 0.35))
        // And if even the slid bearing puts the rig inside geometry, walk it toward the
        // raccoon until there is world to see. Once the camera is *inside* a cell, every
        // probe outwards reads zero clearance and the rig cannot escape on its own — it
        // stays embedded for as long as the player stays there, which is exactly the
        // frozen-brick screen this whole block exists to prevent. Being 1.2 m behind the
        // raccoon is ugly. Being inside a wall is unplayable.
        // Measured from the same anchor the placement below uses, or the retreat decides
        // one thing and the camera goes somewhere else.
        const embedded = (d) => blocksSight(atWorld(L, tx + fx * d, tz + fz * d))
        // The 0.55 m floor has to be on the STEP, not on the loop test. Written as
        // `allowed > 0.55` the last iteration is free to overshoot it — 0.70 became 0.35 —
        // and a rig 35 cm behind a raccoon's ear is the exact "screen full of fur" this
        // whole block exists to prevent. It showed up on a 17 fps box (throttle 32) where
        // the slide lands further per frame; `heistplay` called it "the rig never jams
        // against the raccoon (min 0.35 m in a 2.2 m pocket)".
        for (let i = 0; i < 12 && allowed > 0.6 && embedded(allowed); i++) allowed = Math.max(0.6, allowed - 0.35)
        const k = allowed / dist
        let px = st.camX + fx * allowed
        let pz = st.camZ + fz * allowed
        // The look-at target lerps for smoothness, which is a kindness right up until the
        // raccoon walks into a corner: the lag lets the target drift away from the actor
        // and puts the camera closer than `allowed` just promised. Anchor on the actor
        // itself once the gap goes tight — a slightly stiff camera beats one inside a
        // wall, and this is the frame where the player is already tense.
        if (Math.hypot(px - tx, pz - tz) < allowed * 0.7) {
            px = tx + fx * allowed
            pz = tz + fz * allowed
        }
        // Last gate: never sit closer to the raccoon than MINVIEW if there is room to sit
        // further out. Wedged in a corner with the rig sliding, `allowed` can come out of
        // the retreat loop tiny and the player gets a screen full of raccoon fur -- which
        // is the same complaint as a wall in the lens, only fuzzier.
        const MINVIEW = 2.1
        const gap = Math.hypot(px - tx, pz - tz)
        if (gap < MINVIEW) {
            for (let d = MINVIEW; d >= gap; d -= 0.3) {
                if (blocksSight(atWorld(L, tx + fx * d, tz + fz * d))) continue
                px = tx + fx * d
                pz = tz + fz * d
                break
            }
        }
        // What the player is *looking along* — movement is mapped through this, not
        // through the raw input yaw, so when the rig slides around a corner "forward"
        // stays forward. Two sources of truth about the camera direction is how a game
        // ends up with controls that are correct on paper and wrong in the hands.
        st.camYawEff = yaw
        // When a wall does cut us off, climb rather than merely shorten: looking down
        // over a roof keeps the raccoon framed, whereas sitting two metres behind a wall
        // is just an expensive way to render brick.
        const blocked = k < 0.98
        // Climb, but politely: the first version climbed three metres per metre of
        // occluded camera, which turned every alley into a satellite view.
        const y = Math.min(7.5, wantY + (blocked ? (1 - k) * 1.5 : 0))
        st.camY += (y - st.camY) * Math.min(1, dt * 9)
        const shake = st.shake * 0.16
        camera.position.set(px + (rnd() - 0.5) * shake, st.camY + (rnd() - 0.5) * shake, pz + (rnd() - 0.5) * shake)
        camera.lookAt(st.camX, ty + 0.25 + (blocked ? 0.25 : 0), st.camZ)
        st.shake = Math.max(0, st.shake - dt * 1.8)
    }

    // ------------------------------------------------------------ main tick -------
    function update(dt, input) {
        st.t += dt
        world.animate(dt, st.storm)
        if (st.phase !== 'play') {
            // Brief / results screens: nobody is being controlled, so the crew breathe,
            // the rain falls and the camera keeps its slow drift. A dead-still scene on
            // a menu is the tell that the game is not running.
            for (const c of crew) {
                if (c.caged) continue
                c.mesh.position.set(c.x, 0, c.z)
                animRaccoon(c.mesh, dt, 0, { shine: true, blink: !!c.blink })
            }
            updateHardware(dt)
            updateCamera(dt)
            return st
        }
        st.elapsed += dt
        if (st.freeze > 0) {
            // Being caught stops the world for a beat: the crew you still control
            // continue to breathe, but nothing walks. It reads as a cut, not a lag spike.
            st.freeze -= dt
            updateIdle(dt)
            if (st.caughtWho >= 0) {
                const c = crew[st.caughtWho]
                c.mesh.position.set(c.x, 0, c.z)
                animRaccoon(c.mesh, dt, 0, { alert: true, shine: true })
            }
            updateHardware(dt)
            updateCamera(dt)
            return st
        }
        if (st.msgT > 0) { st.msgT -= dt; if (st.msgT <= 0) st.msg = '' }
        updateStorm(dt)
        updateCrew(dt, input)
        updateIdle(dt)
        // The action button's label is recomputed every tick, not only when it is
        // pressed. A HUD that shows the previous interaction is a HUD that says
        // "LOAD THE CART" while you are standing at a vault with empty hands.
        const f = focus()
        st.hint = f ? f.label : ''
        if (input.actions?.includes('grab')) act('tap', dt)
        if (input.hold) act('hold', dt)
        if (input.actions?.includes('throw')) throwShiny()
        if (input.actions?.includes('swap')) swap()
        if (input.actions?.includes('cam')) { st.camYaw = actor().yaw }
        // `lookX > 0` means "look right", same as dragging right and same as nudgeCamera.
        // Increasing camYaw swings the view to the LEFT, so this sign is a minus.
        st.camYaw -= (input.lookX || 0) * dt * 2.4
        st.camPitch = Math.max(0.22, Math.min(1.25, st.camPitch - (input.lookY || 0) * dt * 1.6))

        const seenBy = watchers.concat(cops.map(c => c.w).filter(Boolean))
        updateWatchers(dt)
        // Publish: each raccoon shows the *worst* suspicion any watcher holds of it.
        // The meter is per-guard inside the sim (that is the whole point — a guard who
        // cannot see you must not be flushing someone else's suspicion), but the HUD
        // and the harness want one number per raccoon: "how close is anyone to seeing
        // you right now".
        for (const c of crew) c.det = Math.max(0, ...seenBy.map(w => w.det[c.i] || 0))
        noises.length = 0
        updateCops()
        updateCat(dt)

        // ---- bodies push back ---------------------------------------------------
        // Every actor was moved independently above, so a guard and a raccoon could and
        // did end up in the same cubic metre of air. "I was on top of him and he did not
        // catch me" was two complaints wearing one hat: no reach (fixed in
        // updateWatchers) and no body. Re-set the meshes after, or a shove lands a frame
        // late and reads as a stutter.
        for (const c of crew) {
            if (c.caged) continue
            for (const w of seenBy) separate(c, w, 0.88)
            for (const o of crew) if (o !== c && !o.caged) separate(c, o, 0.66)
            if (cat) separate(c, cat, 0.62)
            c.mesh.position.set(c.x, c.sink || 0, c.z)
        }
        for (const w of seenBy) w.mesh.position.set(w.x, 0, w.z)
        if (cat) cat.mesh.position.set(cat.x, 0, cat.z)

        // Heat: how loud the night has been. Drives cops, and the HUD bar.
        const alerts = watchers.filter(w => w.state === 'alert').length
        st.heat = Math.max(0, Math.min(100, st.heat + alerts * 9 * dt - (alerts ? 0 : 3.2 * dt)))
        const wasAlarm = st.alarm
        st.alarm = st.heat >= 70 || alerts > 0
        if (st.alarm && !wasAlarm) emit({ type: 'alarm' })

        // Lasers: a beam does not kill you, it *announces* you. Timing beats luck.
        for (const lz of world.lasers) {
            if (!lz.on) continue
            const a = actor()
            if (Math.abs(a.z - lz.z) < 0.42 && a.x > lz.x0 && a.x < lz.x1) {
                st.heat = Math.min(100, st.heat + 55 * dt)
                if (!lz.hot) {
                    lz.hot = true
                    emit({ type: 'laser' })
                    audio?.alarm?.()
                    say('LASER TRIPPED — SOMEBODY IS COMING', 2)
                    for (const w of watchers) {
                        if (Math.hypot(w.x - a.x, w.z - a.z) > 16) continue
                        w.state = 'suspect'; w.aim = { x: a.x, z: a.z }; w.path = null
                    }
                }
            } else lz.hot = false
        }

        // Thrown shinies arcing, then landing with a clatter worth engineering.
        for (let i = flying.length - 1; i >= 0; i--) {
            const f = flying[i]
            f.vy -= 11 * dt
            f.x += f.vx * dt; f.z += f.vz * dt; f.y += f.vy * dt
            f.s.position.set(f.x, Math.max(0.08, f.y), f.z)
            if (f.y <= 0.1) {
                noise(f.x, f.z, 6.5, 'shiny', { loud: 1.2 })
                audio?.clink?.()
                group.remove(f.s)
                flying.splice(i, 1)
            }
        }

        // Trash cans tip over with a noise, and stay tipped.
        for (const c of cans) {
            if (!c.tipped) continue
            c.noise = Math.max(0, c.noise - dt)
        }

        // Icons: float up and fade.
        for (let i = icons.length - 1; i >= 0; i--) {
            const ic = icons[i]
            ic.life -= dt
            ic.s.position.y += dt * 0.35
            ic.s.material.opacity = Math.min(1, ic.life / (ic.max * 0.5))
            if (ic.life <= 0) { group.remove(ic.s); icons.splice(i, 1) }
        }

        // Vault doors swing on their hinge once the lock is chewed through, and jiggle
        // while somebody is chewing it: the door is the thing being attacked, so it is
        // the thing that has to answer.
        for (const v of world.vaults) {
            const k = cellOf(L, v.x, v.z).join(',')
            const want = closedV.has(k) ? 0 : 1
            v.open += (want - v.open) * Math.min(1, dt * 2.2)
            v.pivot.rotation.y = v.open * 1.85
            const jig = v.pivot.userData.jig || 0
            if (jig > 0) {
                v.pivot.rotation.z = (rnd() - 0.5) * 0.014 * jig
                v.pivot.userData.jig = Math.max(0, jig - dt * 1.4)
            } else v.pivot.rotation.z = 0
        }
        // The gate rolls up.
        const gd = world.gate.userData.door
        gd.position.y += ((st.gateOpen ? 3.2 : 0) - gd.position.y) * Math.min(1, dt * 1.6)
        updateHardware(dt)

        // Loot bobs; gems turn, because the moonstone should look worth the trip.
        for (const l of loot) {
            if (l.taken || l.delivered) continue
            const t = st.t * 1.6 + l.i
            l.mesh.position.y = Math.sin(t) * 0.03
            l.glow.material.opacity = 0.4 + Math.sin(t * 1.7) * 0.14
            if (l.kind === '&') l.mesh.rotation.y = t * 0.6
        }
        for (const s of shinies) if (!s.taken) s.spark.rotation.y = st.t * 2

        // Win: gate open, and the raccoon you are standing on is in the gateway.
        if (st.gateOpen) {
            const a = actor()
            if (Math.hypot(a.x - gateW.x, a.z - gateW.z) < 1.1) finish(true)
        }
        refreshObjective()
        updateCamera(dt)
        return st
    }

    function snapshot() {
        const a = actor()
        return {
            phase: st.phase,
            objective: st.objective,
            msg: st.msg,
            hint: st.hint,
            heat: st.heat,
            alarm: st.alarm,
            masked: st.masked,
            elapsed: st.elapsed,
            shinies: st.shinies,
            delivered: st.delivered,
            total: loot.length,
            value: st.deliveredValue,
            totalValue,
            active,
            crew: crew.map(c => ({
                idx: c.i,
                name: c.def.name, bandana: c.def.bandana, caged: c.caged, held: !!c.held,
                wind: c.wind, det: Math.max(0, Math.min(1, c.det)), active: c.i === active,
                hidden: !!c.hidden, x: c.x, z: c.z,
            })),
            result: st.result,
            par: L.par,
            carry: a?.held ? a.held.label : null,
        }
    }

    function start() {
        st.phase = 'play'
        st.elapsed = 0
        // Which way does the level open up? Sample sixteen directions from the spawn
        // and face the one with the most floor in it, so the establishing dive always
        // lands looking *into* the job instead of at the back of a wall.
        const a = actor()
        let best = -1, bestYaw = 0
        for (let i = 0; i < 16; i++) {
            const yaw = (i / 16) * Math.PI * 2
            const d = S.castWorld(L, a.x, a.z, Math.sin(yaw), Math.cos(yaw), 9)
            if (d.dist > best) { best = d.dist; bestYaw = yaw }
        }
        st.camYaw = bestYaw
        st.camPitch = 0.52
        st.camX = a.x
        st.camZ = a.z
        st.camY = 3.4
        emit({ type: 'start', job: L.name })
        say('CART FIRST. SHINY SECOND. PANIC THIRD.', 3.2)
        audio?.start?.(L.theme === 'museum' ? 'creep' : 'sneak')
    }

    function reset() {
        st.phase = 'brief'; st.t = 0; st.elapsed = 0; st.heat = 0; st.alarm = false
        st.copsOut = false; st.delivered = 0; st.deliveredValue = 0; st.caught = 0
        st.gateOpen = false; st.result = null; st.shinies = 2; st.msg = ''
        active = 0
        world.vaults.forEach(v => closedV.add(cellOf(L, v.x, v.z).join(',')))
        for (const c of crew) {
            c.caged = false; c.held = null; c.det = 0; c.chew = 0; c.wind = 1; c.crouched = false
            const p = starts[Math.min(c.i, starts.length - 1)] || cartW
            c.x = p.x; c.z = p.z; c.mesh.visible = true
        }
        for (const l of loot) { l.taken = false; l.delivered = false; l.mesh.visible = true; l.glow.visible = true }
        for (const s of shinies) { s.taken = false; s.mesh.visible = true; s.spark.visible = true }
        // Every bit of snapped hardware goes back on: the padlock, the gate chain, the
        // filings. A retry that starts with the vault already chained-open is the same
        // class of lie as a check that starts with the world already unlocked.
        lockOff = false
        rehang(padlock, home.pad)
        rehang(gateChain, home.chain)
        rehang(gateLock, home.gate)
        falling.length = 0
        for (let i = sparks.length - 1; i >= 0; i--) { group.remove(sparks[i].s) }
        sparks.length = 0
        for (const c of cans) c.tipped = false
        for (const w of watchers) { w.state = 'patrol'; w.path = null; w.ri = 0; w.rdir = 1; w.det = crew.map(() => 0) }
        for (const c of cops) { if (c.w) { group.remove(c.w.mesh); group.remove(c.w.cone) }; c.w = null }
        world.cart.userData.pile.clear()
        refreshObjective()
    }

    function dispose() {
        audio?.stop?.()
        // Geometries only: the materials come out of art.js's module cache and are
        // shared with the next job, so disposing them would poison the next level.
        for (const g of disposables(group)) g.dispose?.()
    }

    return {
        group, st, update, snapshot, start, reset, dispose, focus, switchTo,
        // Harness windows onto the sim. Read-only by convention: the driver is not
        // allowed to write state it could have just asserted, which is why `update`
        // stays the only way anything moves.
        debugWatchers: () => watchers.concat(cops.map(c => c.w).filter(Boolean)).map(w => ({
            kind: w.kind, state: w.state, x: +w.x.toFixed(2), z: +w.z.toFixed(2), yaw: +w.yaw.toFixed(2),
            cell: cellNameOf(w.x, w.z), range: w.range, half: w.half, hear: w.hear,
            wp: w.route.length ? w.route[w.ri] : null, path: w.path ? w.path.length : 0,
            // `cool` is the mercy window after a bagging, and `d` is the worst suspicion
            // anyone currently holds of the raccoon you control: the two numbers that say
            // whether being caught is a setback or a full stop.
            cool: +(w.cool || 0).toFixed(2), chasing: !!w.direct,
            d: +(Math.max(0, ...crew.map(c => w.det[c.i] || 0)) / 1).toFixed(2),
        })),
        debugLoot: () => loot.map(l => ({
            kind: l.kind, label: l.label, value: l.value, x: l.x, z: l.z,
            taken: l.taken, delivered: l.delivered,
        })),
        /**
         * "Why can't they see me?" — the same loop the guards run, instrumented. A
         * stealth game where detection silently never happens is unplayable and every
         * screenshot looks fine, so the arithmetic behind the one number that matters
         * gets printed instead of guessed at.
         */
        why: () => {
            const c = actor()
            return watchers.concat(cops.map(k => k.w).filter(Boolean)).map(w => {
                const d = Math.hypot(c.x - w.x, c.z - w.z)
                const los = S.losWorld(L, w.x, w.z, c.x, c.z)
                const align = S.coneAlign(S.angleTo(w.yaw, c.x - w.x, c.z - w.z), w.half)
                const cover = S.coverOf(atWorld(L, c.x, c.z), c.crouched) * (c.hidden ? 0.1 : 1)
                const light = Math.min(1.8, S.lightAt(world.lamps, c.x, c.z, L.theme === 'museum' ? 0.8 : 0.5) + align * 0.9)
                return {
                    kind: w.kind, state: w.state, d: +d.toFixed(2), los, align: +align.toFixed(2),
                    cover: +cover.toFixed(2), light: +light.toFixed(2), inCone: align > 0, inRange: d <= (w.range || 9),
                    rate: +S.detectRate(d, align, { cover, light }).toFixed(3), det: +(w.det[c.i] || 0).toFixed(3), maxDet: +c.det.toFixed(3),
                }
            }).filter(x => x.inRange).sort((a, b) => b.rate - a.rate)
        },
        focusLabel: () => { const f = focus(); return f ? f.kind + ':' + f.label : '' },
        /**
         * Where the verb on offer *points*, and which material ought to be there to be
         * seen. The anchor is derived from the level and the verb — never from the prop
         * mesh — so that deleting the padlock fails `heistplay`'s affordance check
         * instead of quietly moving the goalpost to wherever the geometry still is.
         * `want` is only set for the two lock verbs: those are the ones where "there is
         * a mesh here" is not enough, because the cage bars and the vault plate are
         * meshes too, and neither of them is a thing you can chew.
         */
        affordance: () => {
            const f = focus()
            if (!f) return null
            const FACE = 0.68
            const at = f.kind === 'free' ? cagePoint(0, 0.62, -FACE)
                : f.kind === 'chew' ? [f.t.x, 1.05, f.t.z]
                    : f.kind === 'deliver' ? [cartW.x, 0.6, cartW.z]
                        : f.kind === 'take' ? [f.t.x, 0.3, f.t.z]
                            : f.kind === 'shiny' ? [f.t.x, 0.32, f.t.z]
                                : f.kind === 'can' ? [f.t.x, 0.35, f.t.z] : null
            const want = f.kind === 'free' ? 'padlock' : f.kind === 'chew' ? 'dial' : null
            return { kind: f.kind, label: f.label, at, want }
        },
        get activeCrew() { return actor() },
        setCam(yaw, pitch, dist) {
            if (yaw !== undefined) { st.camYaw = yaw; st.camSide = 0; st.camYawEff = yaw }
            if (pitch !== undefined) st.camPitch = pitch
            if (dist !== undefined) st.camDist = dist
        },
        /** Clearance from the raccoon along a unit direction, in metres. Used to find
         * the nearest wall so the harness can *walk into it* rather than stroll down an
         * open lane and declare the camera fine. */
        clearAt(dx, dz) {
            const a = actor()
            const d = S.castWorld(L, a.x, a.z, dx, dz, 8)
            // `castWorld` reports the impact point as `x`/`z` and a boolean `hit` — the
            // first draft here did `d.hit[0]`, which threw the first time the harness
            // actually hit a wall and worked perfectly (returning null) in every open
            // yard before that. A test that never reaches its branch is not a test.
            return { clear: +d.dist.toFixed(2), at: d.hit ? [+d.x.toFixed(1), +d.z.toFixed(1)] : null }
        },
        /**
         * How much world is in front of the camera, in metres. The check this serves is
         * "the camera is not inside a wall", which no screenshot of a playable game
         * catches politely and no other number describes: a wall that fills the frame
         * still renders at a healthy 60 fps.
         */
        camClear() {
            const yaw = st.camYawEff ?? st.camYaw
            const d = S.castWorld(L, camera.position.x, camera.position.z, Math.sin(yaw), Math.cos(yaw), 6)
            const a = actor()
            return {
                // Two different failures, because they need different fixes and the
                // first version of this metric could not tell them apart: `inside` means
                // the camera is *in* geometry (unplayable), `clear` means it is merely
                // close to something (framing).
                inside: blocksSight(atWorld(L, camera.position.x, camera.position.z)),
                clear: +d.dist.toFixed(2),
                at: d.hit ? [+d.x.toFixed(1), +d.z.toFixed(1)] : null,
                side: +st.camSide.toFixed(2),
                dist: +Math.hypot(camera.position.x - a.x, camera.position.z - a.z).toFixed(2),
            }
        },
        /**
         * Harness-only: find a corner. Scans for a walkable cell with a wall next to it
         * and returns both, so a test can *stage* being pressed against geometry instead
         * of hoping a stroll runs into some.
         */
        tightSpot() {
            let best = null
            // Cell +y is world +z (worldOf multiplies (y + oz) by CELL), so the world
            // direction of a wall at cell +y is +z. Getting that sign backwards points
            // the camera at the open side and the test then "passes" by testing nothing,
            // which is precisely how the first draft of this check was green in a yard
            // where production was showing brick.
            for (let y = 1; y < L.h - 1; y++) {
                for (let x = 1; x < L.w - 1; x++) {
                    if (at(L, x, y) !== T.FLOOR) continue
                    const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => blocksSight(at(L, x + dx, y + dy)))
                    if (!walls.length) continue
                    // A corner (two walls) is the worst case and the interesting one:
                    // there is no bearing behind the raccoon at all, so the rig has to
                    // slide or die. Prefer those, and only fall back to a flat wall.
                    const [wx, wz] = worldOf(L, x, y)
                    // Verify the spot with the SAME cast the harness will use, and
                    // require it to be tight. The first version trusted `blocksSight`
                    // on the grid neighbour and handed the test a "corner" whose wall
                    // was 3.96 m away -- the precondition, the check and the map
                    // disagreed, and three downstream checks failed while telling me
                    // nothing about why. Where two parts of the system must agree, one
                    // of them has to measure the other.
                    const cands = walls.map(([dx, dy]) => {
                        const d = S.castWorld(L, wx, wz, dx, dy, 6)
                        return { x: wx, z: wz, dx, dz: dy, walls: walls.length, clear: +d.dist.toFixed(2) }
                    }).filter(c => c.clear < 1.9)
                    if (walls.length >= 2 && cands.length) return cands[0]
                    if (!best && cands.length) best = { ...cands[0], walls: 1 }
                }
            }
            return best || null
        },
        /**
         * Harness-only: park a watcher somewhere. Some situations cannot be asked to
         * arise on their own — a guard *already* alerted and *already* breathing on you —
         * and "does getting caught ever happen" has to be a check, not a five-minute
         * walk around a yard hoping the AI cooperates.
         */
        warpWatcher(i, x, z, state) {
            const all = watchers.concat(cops.map(k => k.w).filter(Boolean))
            const w = all[i]
            if (!w) return null
            // Never park a watcher inside geometry. A guard placed in a wall cannot path,
            // cannot see, and fails the "watchers stand on walkable ground" check for a
            // reason that has nothing to do with what is being tested -- which is exactly
            // how one mutation run here reported a phantom wall bug. Nudge outward on a
            // spiral until the cell is floor, and say whether we had to.
            let nx = x, nz = z, moved = false
            if (blocked(x, z, w)) {
                moved = true
                outer: for (let r = 0.6; r < 4.5; r += 0.45) {
                    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
                        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r
                        if (!blocked(px, pz, w)) { nx = px; nz = pz; break outer }
                    }
                }
            }
            w.x = nx; w.z = nz
            if (moved) x = nx, z = nz
            if (state) w.state = state
            w.path = null; w.wait = 0; w.lose = 0
            w.mesh.position.set(x, 0, z)
            return { at: [+x.toFixed(2), +z.toFixed(2)], state: w.state, kind: w.kind }
        },
        /**
         * Harness-only: put a caged raccoon back on its feet, optionally somewhere else.
         * The play driver deliberately gets itself arrested to prove the pound works,
         * then has to keep testing the rest of the job — without this, one staged
         * capture ends the run (and on the last raccoon, ends the job).
         */
        release(i, x, z) {
            const c = crew[i] || actor()
            if (!c) return null
            c.caged = false
            c.hidden = false
            if (x !== undefined) { c.x = x; c.z = z }
            c.mesh.position.set(c.x, 0, c.z)
            st.caughtWho = null
            st.freeze = 0
            st.caught = Math.max(0, st.caught - 1)
            if (st.phase !== 'play') st.phase = 'play'
            refreshObjective()
            return { at: [+c.x.toFixed(2), +c.z.toFixed(2)], caged: c.caged, phase: st.phase }
        },
        /** Harness-only: stand everyone down. Used between staged set-pieces. */
        calmWatchers() {
            for (const w of watchers.concat(cops.map(k => k.w).filter(Boolean))) {
                w.state = 'patrol'
                w.path = null
                w.wait = 0
                w.lose = 0
                w.direct = null
                for (let k = 0; k < w.det.length; k++) w.det[k] = 0
            }
            st.heat = 0
            st.alarm = false
            return watchers.length
        },
        nudgeCamera(dx, dy) { st.camYaw -= dx; st.camPitch = Math.max(0.22, Math.min(1.25, st.camPitch + dy)) },
    }
}

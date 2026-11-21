// DOUBLE DRAGON — S1 "Walnuts Street" (Technōs arcade 1987, issue #2807).
// Shell plumbing per docs/GAME-SHELL.md: one loop, fixed timestep, attract
// first, '?' ops card, phone pad (JUMP / KICK / PUNCH), DEV + contract hooks.
// All rules live in sim.js; all look in art.js.

import React, { useEffect, useRef, useState } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, seedFromQuery, exposeFeedbackState, unexposeFeedbackState } from '../../utils/gameContract'
import { W, H, makeGame, step, autopilot, stateHash, CFG, PROPS_DEPTH, enterStage2 } from './sim.js'
import { drawBackground, drawBilly, drawEnemy, drawPickup, drawProp, drawBarrel, drawProjectile, drawMarian, PROPS, PROPS_YARD, drawHud, drawBanner, drawAttract } from './art.js'

const SIM_MS = 1000 / 60
const HS_KEY = 'double-dragon:hiscore'

export default function DoubleDragon() {
    const wrapRef = useRef(null)
    const pausedRef = useRef(false)
    const [paused, setPaused] = useState(false)
    const [mode, setMode] = useState('attract')

    useEffect(() => {
        const wrap = wrapRef.current
        const canvas = document.createElement('canvas')
        canvas.width = W
        canvas.height = H
        canvas.style.imageRendering = 'pixelated'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeGame((seedFromQuery() ?? ((Date.now() * 2654435761) >>> 8)) >>> 0)
        let screen = 'attract'
        let raf = 0
        let last = 0
        let acc = 0
        let demoHold = 0
        let overAt = 0
        let shake = 0
        const part = []
        const keys = { l: false, r: false, u: false, d: false, j: false, k: false, p: false }
        let jumpQ = false, kickQ = false, punchQ = false
        let hiscore = Number(localStorage.getItem(HS_KEY) || 0)

        const sfx = {
            whoosh: () => audioController.playNoise(0.05, 0.08),
            hit: () => audioController.playTone(220, 0.08, 'square', 0.12),
            hitHard: () => { audioController.playTone(140, 0.14, 'square', 0.16); shake = Math.max(shake, 3) },
            ko: () => { audioController.playSweep(520, 90, 0.28, 'square', 0.14); shake = Math.max(shake, 4) },
            jump: () => audioController.playSweep(180, 420, 0.16, 'square', 0.10),
            land: () => audioController.playNoise(0.04, 0.05),
            pickup: () => { audioController.playTone(660, 0.07, 'square', 0.1); audioController.playTone(880, 0.07, 'square', 0.1, 0.07); audioController.playTone(1320, 0.1, 'square', 0.1, 0.14) },
            grabbed: () => audioController.playTone(90, 0.16, 'sawtooth', 0.14),
            struggle: () => audioController.playNoise(0.03, 0.05),
            escape: () => audioController.playSweep(300, 700, 0.12, 'square', 0.12),
            die: () => { audioController.playSweep(400, 60, 0.5, 'sawtooth', 0.18); shake = Math.max(shake, 6) },
            wave: () => audioController.playSweep(120, 240, 0.3, 'triangle', 0.12),
            chargewind: () => audioController.playFilteredNoise(0.5, 0.06, 240),
            charge: () => { audioController.playSweep(160, 70, 0.24, 'sawtooth', 0.14); shake = Math.max(shake, 2) },
            stomp: () => { audioController.playTone(70, 0.1, 'square', 0.18); shake = Math.max(shake, 3) },
            throw: () => audioController.playSweep(900, 300, 0.12, 'triangle', 0.10),
            whip: () => { audioController.playNoise(0.06, 0.14); audioController.playSweep(1600, 300, 0.08, 'sawtooth', 0.08) },
            knife_hit: () => { audioController.playTone(180, 0.12, 'square', 0.16); shake = Math.max(shake, 3) },
            blade_stick: () => { audioController.playTone(150, 0.05, 'triangle', 0.1); audioController.playTone(1150, 0.04, 'square', 0.04, 0.02) },
            barrel_hit: () => { audioController.playTone(110, 0.06, 'square', 0.12); shake = Math.max(shake, 2) },
            barrel_break: () => { audioController.playNoise(0.18, 0.16); audioController.playTone(70, 0.14, 'square', 0.14, 0.03); shake = Math.max(shake, 5) },
            // S3 the hideout cues
            stage: () => { audioController.playSweep(160, 420, 0.3, 'square', 0.12); audioController.playTone(523, 0.12, 'square', 0.1, 0.24) },
            aim: () => audioController.playTone(980, 0.05, 'square', 0.05),
            goon_throw: () => audioController.playSweep(1100, 400, 0.1, 'triangle', 0.09),
            blade_wood: () => { audioController.playTone(120, 0.05, 'square', 0.12); shake = Math.max(shake, 2) },
            blade_hit: () => { audioController.playSweep(300, 60, 0.3, 'sawtooth', 0.16); shake = Math.max(shake, 4) },
            rope: () => audioController.playNoise(0.05, 0.08),
            rescue: () => {
                const notes = [659, 784, 988, 1319, 988, 1319, 1568]
                notes.forEach((f, i) => audioController.playTone(f, 0.13, 'square', 0.12, i * 0.11))
                shake = Math.max(shake, 3)
            },
            clear: () => {
                const notes = [523, 659, 784, 1046, 784, 1046]
                notes.forEach((f, i) => audioController.playTone(f, 0.12, 'square', 0.12, i * 0.12))
            },
        }

        const sparks = (n, nearBilly, col) => {
            for (let i = 0; i < n; i++) {
                const bx = nearBilly ? gs.billy.x : gs.billy.x + (Math.random() - 0.5) * 30
                const by = (nearBilly ? gs.billy.y : gs.billy.y - 12) + (Math.random() - 0.5) * 8
                part.push({ x: bx, y: by, vx: (Math.random() - 0.5) * 2.4, vy: -Math.random() * 1.8, t: 12 + Math.floor(Math.random() * 10), c: col })
            }
        }

        const drain = () => {
            for (const ev of gs.events) {
                if (sfx[ev]) sfx[ev]()
                if (ev === 'hit') sparks(4, true, 1)
                else if (ev === 'hit_hard' || ev === 'ko') sparks(8, true, 0)
                else if (ev === 'stomp') sparks(6, true, 2)
                else if (ev === 'rescue') sparks(14, true, 1)
                // #2819 item 3: the cabinet showers staves outward when a barrel goes
                else if (ev === 'barrel_break' && gs.fx) {
                    const fx = gs.fx
                    gs.fx = null
                    for (let i = 0; i < 10; i++) {
                        part.push({
                            x: fx.x + (Math.random() - 0.5) * 12,
                            y: fx.y - 10 + (Math.random() - 0.5) * 8,
                            vx: (Math.random() - 0.5) * 3.2, vy: -Math.random() * 2.2 - 0.4,
                            t: 14 + Math.floor(Math.random() * 10), c: 3,
                        })
                    }
                }
            }
            gs.events.length = 0
        }

        // #2810 item 4: Walnuts Street after dark breathes — a very quiet,
        // filtered-noise bed (distant crowd + wind) under the fists. Only ever
        // one burst in flight and never louder than a footprint.
        let ambienceAt = 0
        const ambience = () => {
            if (pausedRef.current) return
            const t = gs.tick
            if (t - ambienceAt >= 112) {
                ambienceAt = t
                audioController.playFilteredNoise(1.8, 0.022, 320)
            }
        }

        const simPad = () => {
            const pad = { left: keys.l, right: keys.r, up: keys.u, down: keys.d, a: keys.j || jumpQ, b: keys.k || kickQ, punch: keys.p || punchQ }
            jumpQ = kickQ = punchQ = false
            return pad
        }

        const startPlay = () => {
            gs = makeGame((seedFromQuery() ?? ((Date.now() * 2654435761) >>> 8)) >>> 0)
            gs.hi = hiscore
            part.length = 0
            demoHold = 0
            setMode('play')
            screen = 'play'
        }

        const endTo = (what) => {
            screen = what
            setMode(what)
            if (what === 'over') {
                overAt = performance.now()
                if (gs.score > hiscore) { hiscore = gs.score; localStorage.setItem(HS_KEY, String(hiscore)) }
            }
        }

        const stepSim = (pad) => {
            step(gs, pad)
            drain()
            ambience()
            if (gs.mode === 'gameover' && screen === 'play') endTo('over')
        }

        const paint = () => {
            shake = Math.max(0, shake - 0.4)
            const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0
            const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0
            drawBackground(ctx, gs.camX, gs.tick, gs.stage)
            ctx.save()
            ctx.translate(Math.round(sx), Math.round(sy))
            // one depth-sorted army: nearest feet drawn last
            const beings = [...gs.enemies.map((e) => ({ y: e.y, kind: 'enemy', o: e })), { y: gs.billy.y, kind: 'billy', o: gs.billy }]
            for (const bar of gs.barrels) beings.push({ y: bar.y, kind: 'barrel', o: bar })
            if (gs.marian) beings.push({ y: gs.marian.y, kind: 'marian', o: gs.marian })
            for (const p of gs.pickups) if (p.y < PROPS_DEPTH) beings.push({ y: p.y, kind: 'pick', o: p })
            beings.sort((a, b) => a.y - b.y)
            for (const q of beings) {
                if (q.kind === 'enemy') drawEnemy(ctx, q.o, gs.camX)
                else if (q.kind === 'billy') drawBilly(ctx, q.o, gs.camX, gs.barrels)
                else if (q.kind === 'barrel') drawBarrel(ctx, q.o, gs.camX)
                else if (q.kind === 'marian') drawMarian(ctx, q.o, gs.camX)
                else drawPickup(ctx, q.o, gs.camX)
            }
            for (const pr of gs.projectiles) drawProjectile(ctx, pr, gs.camX)
            // particles (juice layer — Math.random law: never reaches state)
            for (let i = part.length - 1; i >= 0; i--) {
                const q = part[i]
                q.x += q.vx; q.y += q.vy; q.vy += 0.1; q.t -= 1
                if (q.t <= 0) { part.splice(i, 1); continue }
                ctx.fillStyle = q.c === 0 ? '#ffd23c' : q.c === 1 ? '#ff6a2a' : q.c === 3 ? '#a8763a' : '#d9dde2'
                ctx.fillRect(Math.round(q.x - gs.camX), Math.round(q.y), 2, 2)
            }
            for (const p of (gs.stage === 2 ? PROPS_YARD : PROPS)) drawProp(ctx, p, gs.camX)
            ctx.restore()
            drawHud(ctx, gs)
            if (screen === 'attract') drawAttract(ctx, Math.floor(gs.tick / 150), gs.tick)
            else drawBanner(ctx, gs)
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (!pausedRef.current) {
                if (contractHoldsLoop()) acc = 0
                else {
                    acc += ft
                    while (acc >= SIM_MS) {
                        if (screen === 'play') {
                            stepSim(simPad())
                        } else if (screen === 'attract') {
                            if (demoHold > 0) { demoHold -= 1; if (demoHold === 0) gs = makeGame((gs.seed + 7) >>> 0) }
                            else { stepSim(autopilot(gs)); if (gs.mode !== 'play') demoHold = 120 }
                            gs.tick += 0 // attract demo world-ticks ride stepSim
                        } else if (screen === 'over') {
                            gs.tick += 1
                        }
                        acc -= SIM_MS
                    }
                }
            }
            paint()
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            if (screen === 'attract') { startPlay(); return }
            if (screen === 'over') { if (performance.now() - overAt > 900) endTo('attract'); return }
            if (pausedRef.current || e.repeat) return
            if (e.code === 'ArrowLeft') keys.l = true
            if (e.code === 'ArrowRight') keys.r = true
            if (e.code === 'ArrowUp') keys.u = true
            if (e.code === 'ArrowDown') keys.d = true
            if (e.code === 'Space') { keys.j = true; jumpQ = true }
            if (e.code === 'KeyX') { keys.k = true; kickQ = true }
            if (e.code === 'KeyZ') { keys.p = true; punchQ = true }
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.l = false
            if (e.code === 'ArrowRight') keys.r = false
            if (e.code === 'ArrowUp') keys.u = false
            if (e.code === 'ArrowDown') keys.d = false
            if (e.code === 'Space') keys.j = false
            if (e.code === 'KeyX') keys.k = false
            if (e.code === 'KeyZ') keys.p = false
        }
        const onBlur = () => { keys.l = keys.r = keys.u = keys.d = keys.j = keys.k = keys.p = false }
        const onPointer = () => {
            if (screen === 'attract') { startPlay(); return }
            if (screen === 'over') { if (performance.now() - overAt > 900) endTo('attract') }
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const sc = Math.min(r.width / W, r.height / H)
            canvas.style.width = `${Math.floor(W * sc)}px`
            canvas.style.height = `${Math.floor(H * sc)}px`
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            window.__ddTest = {
                probe: () => ({
                    screen, tick: gs.tick, x: +gs.billy.x.toFixed(2), y: gs.billy.y, z: +gs.billy.z.toFixed(2),
                    lives: gs.billy.lives, score: gs.score, weapon: gs.billy.weapon,
                    mode: gs.mode, waveIdx: gs.waveIdx, enemies: gs.enemies.length,
                    scoreFlash: gs.scoreFlash ? gs.scoreFlash.v : 0,
                    enemyKinds: gs.enemies.map((e) => e.kind + ':' + e.state).join(','),
                    billyState: gs.billy.state, camX: Math.round(gs.camX),
                    barrels: gs.barrels.length, projectiles: gs.projectiles.length,
                    pickups: gs.pickups.map((p) => p.kind).join(','),
                    stage: gs.stage,
                    marian: gs.marian ? (gs.marian.freed ? 'free' : 'tied:' + gs.marian.cuts) : 'none',
                    duel: gs.enemies.some((e) => e.kind === 'duel') ? 1 : 0,
                    casts: gs.enemies.filter((e) => e.hasKnife).length,
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                setup: (opts = {}) => {
                    if (screen !== 'play') return false
                    if (opts.x !== undefined) gs.billy.x = opts.x
                    if (opts.lives !== undefined) gs.billy.lives = opts.lives
                    if (opts.inv !== undefined) gs.billy.inv = opts.inv
                    if (opts.weapon) gs.billy.weapon = opts.weapon
                    if (opts.spawnStick) gs.pickups.push({ x: gs.billy.x + 6, y: gs.billy.y, kind: 'stick', bob: 0 })
                    if (opts.spawnWeapon) { gs.billy.weapon = null; gs.pickups.push({ x: gs.billy.x + 6, y: gs.billy.y, kind: opts.spawnWeapon, bob: 0 }) }
                    if (opts.barrelAt) gs.barrels.push({ id: 99 + gs.barrels.length, x: opts.barrelAt[0], y: opts.barrelAt[1], hp: 3, shake: 0 })
                    if (opts.clearBarrels) gs.barrels.length = 0
                    if (opts.killBilly) { gs.billy.inv = 0; const e = { id: gs.nextId++, kind: 'williams', x: gs.billy.x + 8, y: gs.billy.y, face: -1, hp: 4, state: 'attack', stateT: 2, anim: 0, hasStick: false, stickDropped: false, attackCooldown: 60, inv: 0, spinHit: false }; gs.enemies.push(e) }
                    if (opts.clearEnemies) gs.enemies.length = 0
                    if (opts.warp === 'abobo') {
                        gs.billy.x = 570
                        gs.waveIdx = 2; gs.waveActive = true; gs.camLock = true
                        gs.enemies.push({ id: gs.nextId++, kind: 'abobo', x: 640, y: 170, face: -1, hp: 14, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, attackCooldown: 40, inv: 0, spinHit: false })
                    }
                    if (opts.warp === 'hideout' && gs.stage === 1) {
                        enterStage2(gs)
                        gs.billy.y = 170
                    }
                    if (opts.warp === 'marian') {
                        if (gs.stage === 1) enterStage2(gs)
                        gs.waveIdx = 3; gs.waveActive = false; gs.camLock = false
                        gs.enemies.length = 0
                        gs.camX = 640
                        gs.billy.x = 894; gs.billy.y = gs.marian.y
                    }
                    if (opts.knifeGoon) {
                        gs.enemies.push({ id: gs.nextId++, kind: 'williams', x: gs.billy.x + 70, y: gs.billy.y, face: -1, hp: 4, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, hasKnife: true, castCooldown: 20, attackCooldown: 999, inv: 0, spinHit: false })
                    }
                    if (opts.duel) {
                        gs.enemies.push({ id: gs.nextId++, kind: 'duel', x: gs.billy.x + 90, y: gs.billy.y, face: -1, hp: CFG.duelHp, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, hasKnife: true, castCooldown: 40, attackCooldown: 60, inv: 0, spinHit: false })
                    }
                    if (opts.marianFree && gs.marian) { gs.marian.freed = true; gs.marian.cuts = CFG.rescueCuts; gs.rescueT = CFG.rescueCheer }
                    return true
                },
            }
            mountDbg({
                title: 'DOUBLE DRAGON',
                getState: () => [
                    `x ${gs.billy.x.toFixed(0)}/960  y ${gs.billy.y}  z ${gs.billy.z.toFixed(0)}  cam ${Math.round(gs.camX)}${gs.camLock ? ' LOCK' : ''}  stage ${gs.stage}  wave ${gs.waveIdx}/3${gs.marian ? `  marian ${gs.marian.freed ? 'FREE' : 'tied (' + gs.marian.cuts + '/' + CFG.rescueCuts + ')'}` : ''}`,
                    `score ${gs.score}  hi ${Math.max(hiscore, gs.hi)}  lives ${gs.billy.lives}  weapon ${gs.billy.weapon || '-'}  inv ${gs.billy.inv}  mode ${gs.mode}`,
                    `enemies ${gs.enemies.map((e) => `${e.kind} ${e.state}${e.hasStick ? '+stick' : ''}${e.hasKnife ? '+knife' : ''}(${e.hp})`).join(' | ') || 'none'}`,
                    `screen ${screen}  paused ${pausedRef.current}`,
                ],
                actions: [
                    { label: '+1 LIFE', run: () => { gs.billy.lives += 1; return 'extra life' } },
                    { label: 'GIVE STICK', run: () => { gs.billy.weapon = 'stick'; return 'stick in hand' } },
                    { label: 'GIVE KNIFE', run: () => { gs.billy.weapon = 'knife'; return 'steel in hand — PUNCH throws' } },
                    { label: 'GIVE WHIP', run: () => { gs.billy.weapon = 'whip'; return 'coil in hand — PUNCH lashes' } },
                    { label: 'SPAWN BARREL', run: () => { gs.barrels.push({ id: 90 + gs.barrels.length, x: gs.billy.x + 24, y: gs.billy.y, hp: 3, shake: 0 }); return 'a barrel rolls in' } },
                    { label: 'TO ABOBO', run: () => { window.__ddTest.setup({ warp: 'abobo' }); return 'before the giant' } },
                    { label: 'TO HIDEOUT', run: () => { window.__ddTest.setup({ warp: 'hideout' }); return 'stage 2 — the yard opens' } },
                    { label: 'TO MARIAN', run: () => { window.__ddTest.setup({ warp: 'marian' }); return 'the duel is won — the ropes await' } },
                    { label: 'TO THE DUEL', run: () => { window.__ddTest.setup({ warp: 'marian', duel: true }); return 'Williams himself steps into the light' } },
                    { label: 'FREE MARIAN', run: () => { window.__ddTest.setup({ warp: 'marian', marianFree: true }); return 'ropes cut — the cheer' } },
                    { label: 'SPAWN CASTER', run: () => { window.__ddTest.setup({ knifeGoon: true }); return 'a Williams fingers a knife' } },
                    { label: 'SPAWN GOON', run: () => { gs.enemies.push({ id: gs.nextId++, kind: 'williams', x: gs.billy.x + 40, y: gs.billy.y, face: -1, hp: 4, state: 'walk', stateT: 0, anim: 0, hasStick: false, stickDropped: false, attackCooldown: 30, inv: 0, spinHit: false }); return 'a Williams arrives' } },
                    { label: 'CLEAR WAVE', run: () => { gs.enemies.length = 0; return 'street is clear' } },
                ],
            })
            exposeGame({
                id: 'double-dragon',
                buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
                reset: (seed) => {
                    gs = makeGame(seed >>> 0)
                    part.length = 0
                    keys.l = keys.r = keys.u = keys.d = keys.j = keys.k = keys.p = false
                    jumpQ = kickQ = punchQ = false
                    screen = 'play'
                    setMode('play')
                },
                tick: (pad) => {
                    step(gs, {
                        left: !!pad.left, right: !!pad.right, up: !!pad.up, down: !!pad.down,
                        a: !!pad.a, b: !!pad.b, punch: !!pad.punch,
                    })
                    drain()
                },
                state: () => ({
                    tick: gs.tick, score: gs.score, done: gs.mode === 'gameover',
                    seed: gs.seed, lives: gs.billy.lives,
                    x: Math.round(gs.billy.x), y: gs.billy.y, z: Math.round(gs.billy.z),
                    billyState: gs.billy.state, weapon: gs.billy.weapon || '-',
                    waveIdx: gs.waveIdx, enemies: gs.enemies.length,
                    barrels: gs.barrels.length, projectiles: gs.projectiles.length,
                    stage: gs.stage,
                    marian: gs.marian ? (gs.marian.freed ? 2 : 1) : 0,
                    cleared: gs.cleared ? 1 : 0,
                    hash: stateHash(gs),
                }),
                canvas: () => canvas,
                snapshot: () => JSON.parse(JSON.stringify(gs)),
                restore: (s) => { gs = s },
            })
        }

        exposeFeedbackState(() => ({ tick: gs.tick, score: gs.score, done: gs.mode === 'gameover', lives: gs.billy.lives, seed: gs.seed }))

        return () => {
            unexposeFeedbackState()
            if (import.meta.env.DEV) { if (window.__ddTest) delete window.__ddTest; unexposeGame(); unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            canvas.remove()
        }
    }, [])

    const handleResume = () => { pausedRef.current = false; setPaused(false) }

    return (
        <div ref={wrapRef} className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none">
            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'DOUBLE DRAGON')} onResume={handleResume} />}
            <VirtualControls
                visible={mode === 'play' && !paused}
                secondAction={{ label: 'KICK', code: 'KeyX' }}
                thirdAction={{ label: 'PUNCH', code: 'KeyZ' }}
            />
        </div>
    )
}

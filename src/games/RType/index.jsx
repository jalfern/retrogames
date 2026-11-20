// R-TYPE — S1 "Armament" (Irem M-72 arcade 1987, issue #2808).
// Shell plumbing per docs/GAME-SHELL.md: one loop, fixed timestep, attract
// first, '?' ops card, phone pad (FIRE), DEV + contract hooks.
// All rules live in sim.js; all look in art.js.

import React, { useEffect, useRef, useState } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, seedFromQuery, exposeFeedbackState, unexposeFeedbackState } from '../../utils/gameContract'
import { W, H, STAGE_END, STAGE_END2, POD, makeGame, step, autopilot, stateHash, shieldOn } from './sim.js'
import { drawBackground, drawShip, drawLarva, drawTurret, drawPod, drawMissile, drawBullet, drawCap, drawWave, drawSeg, drawP1, drawP2, drawBit, drawHud, drawBanner, drawAttract, drawText, textWidth, drawSeedPod, drawLance, drawPodTether, drawForceMerge } from './art.js'

const SIM_MS = 1000 / 60
const HS_KEY = 'r-type:hiscore'

export default function RType() {
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

        const freshSeed = () => (seedFromQuery() ?? ((Date.now() * 2654435761) >>> 8)) >>> 0
        let gs = makeGame(freshSeed())
        let screen = 'attract'
        let raf = 0
        let last = 0
        let acc = 0
        let demoHold = 0
        let overAt = 0
        let shake = 0
        const part = []
        let attachFlash = 0 // #2823: capture ceremony countdown (frames)
        let lastStrain = -99 // #2823: throttle for the armour-grind strain tick
        let plugN = 0 // #2823: per-hit pitch rotation for the plug tick
        const keys = { l: false, r: false, u: false, d: false, f: false }
        let podQ = false // POD is a press-verb: latch so sub-frame taps (bots) still reach the sim
        let hiscore = Number(localStorage.getItem(HS_KEY) || 0)

        const sfx = {
            // vulcan body: alternating pitch + a crackle layer so the stream
            // reads as a chain-gun, not a beep repeater (#2818)
            shot: () => { audioController.playTone(860 + (gs.tick % 2) * 70, 0.03, 'square', 0.05); audioController.playNoise(0.02, 0.035) },
            wave: () => audioController.playSweep(220, 940, 0.22, 'triangle', 0.12),
            capsule: () => { audioController.playTone(660, 0.07, 'square', 0.1); audioController.playTone(880, 0.07, 'square', 0.1, 0.07); audioController.playTone(1320, 0.1, 'square', 0.1, 0.14) },
            hit: () => audioController.playTone(300, 0.05, 'square', 0.08),
            boom: () => { audioController.playNoise(0.16, 0.14); audioController.playSweep(160, 50, 0.2, 'sawtooth', 0.1); shake = Math.max(shake, 3) },
            clank: () => audioController.playTone(160, 0.04, 'square', 0.07),
            corehit: () => { audioController.playTone(120, 0.09, 'sawtooth', 0.14); shake = Math.max(shake, 2) },
            bigboom: () => { audioController.playNoise(0.5, 0.2); audioController.playSweep(200, 30, 0.6, 'sawtooth', 0.16); shake = Math.max(shake, 7) },
            die: () => { audioController.playSweep(400, 50, 0.5, 'sawtooth', 0.18); shake = Math.max(shake, 6) },
            // the maw speaks: a dread horn warns the gape, a seal-clank ends it (#2818)
            mawopen: () => { audioController.playSweep(58, 138, 0.55, 'sawtooth', 0.13); audioController.playTone(92, 0.5, 'triangle', 0.08) },
            mawshut: () => { audioController.playSweep(190, 52, 0.26, 'square', 0.12); audioController.playNoise(0.1, 0.09); shake = Math.max(shake, 2) },
            missile: () => { audioController.playTone(620, 0.06, 'square', 0.08); audioController.playTone(520, 0.06, 'square', 0.08, 0.09) },
            laser: () => audioController.playSweep(1400, 320, 0.18, 'sawtooth', 0.11),
            force: () => { const n = [523, 784, 1046, 1568]; n.forEach((f, i) => audioController.playTone(f, 0.08, 'triangle', 0.11, i * 0.06)) },
            podlaunch: () => audioController.playSweep(500, 1150, 0.14, 'square', 0.08),
            poddock: () => { audioController.playTone(240, 0.05, 'square', 0.09); audioController.playTone(360, 0.06, 'square', 0.09, 0.05) },
            // #2823: the plug speaks — pitch rotates per catch so a vulcan
            // stream eaten by the shell reads as a stream, not as nothing
            plug: () => { audioController.playTone(132 + (plugN++ % 5) * 26, 0.035, 'triangle', 0.08); audioController.playNoise(0.015, 0.03) },
            // #2823: strain — the refusal grinds; the sim cries every clamp
            // tick, throttle it into a chugging friction (8-tick gate)
            strain: () => { if (gs.tick - lastStrain >= 8) { lastStrain = gs.tick; audioController.playTone(88 + (gs.tick % 3) * 14, 0.045, 'square', 0.055); audioController.playNoise(0.02, 0.025) } },
            ram: () => { audioController.playNoise(0.08, 0.1); audioController.playTone(90, 0.07, 'sawtooth', 0.12); shake = Math.max(shake, 2) },
            podlost: () => audioController.playSweep(420, 90, 0.3, 'triangle', 0.1),
            // S3: the chain snaps on, the shield rings, deflected lead ticks off it
            bit: () => { audioController.playTone(700, 0.06, 'square', 0.09); audioController.playTone(1050, 0.08, 'square', 0.09, 0.06) },
            shield: () => { const n = [523, 659, 784, 1046, 1318]; n.forEach((f, i) => audioController.playTone(f, 0.1, 'triangle', 0.1, i * 0.05)) },
            deflect: () => audioController.playTone(210, 0.03, 'square', 0.06),
            bitslost: () => audioController.playSweep(500, 120, 0.25, 'triangle', 0.09),
            leg2: () => { audioController.playTone(392, 0.12, 'square', 0.1); audioController.playTone(523, 0.14, 'square', 0.1, 0.1) },
            p2arrive: () => { audioController.playSweep(70, 110, 0.7, 'sawtooth', 0.14); audioController.playTone(140, 0.6, 'triangle', 0.07) },
            p2open: () => audioController.playSweep(70, 150, 0.45, 'sawtooth', 0.11),
            p2shut: () => { audioController.playSweep(200, 60, 0.2, 'square', 0.1); audioController.playNoise(0.08, 0.08) },
            coredown: () => { audioController.playNoise(0.3, 0.18); audioController.playSweep(240, 40, 0.4, 'sawtooth', 0.14); shake = Math.max(shake, 5) },
            enrage: () => { audioController.playTone(880, 0.09, 'square', 0.1); audioController.playTone(660, 0.09, 'square', 0.1, 0.1); audioController.playTone(880, 0.09, 'square', 0.1, 0.2) },
            warn: () => audioController.playTone(500, 0.05, 'square', 0.06),
            tsfire: () => audioController.playTone(340, 0.04, 'square', 0.06),
            '1up': () => { const n = [523, 659, 784, 1046]; n.forEach((f, i) => audioController.playTone(f, 0.09, 'square', 0.1, i * 0.09)) },
            clear: () => { const n = [392, 523, 659, 784, 659, 784, 1046]; n.forEach((f, i) => audioController.playTone(f, 0.12, 'square', 0.12, i * 0.12)) },
        }

        const bursts = (n, x, y, col) => {
            for (let i = 0; i < n; i++) {
                part.push({ x, y, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, t: 10 + Math.floor(Math.random() * 12), c: col })
            }
        }

        // #2823: capture ceremony particles — they run INWARD to the nose,
        // the force gathering itself into the shell (math.random: juice only)
        const converge = (n, x, y, col) => {
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2 + Math.random() * 0.6
                const r = 15 + Math.random() * 9
                part.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: -Math.cos(a) * 1.7, vy: -Math.sin(a) * 1.7, t: 9 + Math.floor(Math.random() * 4), c: col })
            }
        }

        const drain = () => {
            const sx = gs.camX
            for (const ev of gs.events) {
                if (sfx[ev]) sfx[ev]()
                if (ev === 'boom') bursts(10, (gs.lastHitX ?? gs.ship.x + 40) - sx, gs.lastHitY ?? gs.ship.y, 0)
                else if (ev === 'hit') bursts(3, (gs.lastHitX ?? gs.ship.x + 40) - sx, gs.lastHitY ?? gs.ship.y, 1)
                else if (ev === 'corehit') bursts(6, gs.lastHitX ? gs.lastHitX - sx : (gs.p1 ? gs.p1.x + 20 : 40), gs.lastHitY ?? 120, 2)
                else if (ev === 'deflect') bursts(4, (gs.lastHitX ?? gs.ship.x + 14) - sx, gs.lastHitY ?? gs.ship.y, 3)
                else if (ev === 'coredown') bursts(24, (gs.lastHitX ?? 60) - sx, gs.lastHitY ?? 120, 0)
                else if (ev === 'bit') bursts(8, gs.ship.x - sx, gs.ship.y, 1)
                else if (ev === 'shield') bursts(14, gs.ship.x - sx, gs.ship.y, 1)
                else if (ev === 'bigboom') bursts(40, gs.p1 ? gs.p1.x + 30 - sx : 60, 120, 0)
                else if (ev === 'die') bursts(22, gs.ship.x - sx, gs.ship.y, 2)
                else if (ev === 'plug') { bursts(6, (gs.lastHitX ?? gs.ship.x + 14) - sx, gs.lastHitY ?? gs.ship.y, 3); bursts(2, (gs.lastHitX ?? gs.ship.x + 14) - sx, gs.lastHitY ?? gs.ship.y, 2) } // #2823: a plugged hunter POPS — cyan ring, white core
                else if (ev === 'ram') bursts(8, (gs.lastHitX ?? gs.ship.x + 14) - sx, gs.lastHitY ?? gs.ship.y, 0)
                else if (ev === 'force') { // #2823: attach ceremony — flash + converging sparks at the nose
                    bursts(12, gs.ship.x + 14 - sx, gs.ship.y, 3)
                    converge(8, gs.ship.x + 14 - sx, gs.ship.y, 3)
                    attachFlash = 14
                }
            }
            gs.events.length = 0
        }

        const startPlay = () => {
            gs = makeGame(freshSeed())
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
            // charge tell: a rising whine as the wave cannon drinks (#2818)
            const ch = gs.ship.charge
            if (ch > 0 && ch % 9 === 0) audioController.playTone(180 + ch * 9, 0.05, 'triangle', 0.045)
            if (gs.mode === 'gameover' && screen === 'play') endTo('over')
        }

        const simPad = () => {
            const p = { left: keys.l, right: keys.r, up: keys.u, down: keys.d, a: keys.f, b: podQ }
            podQ = false
            return p
        }

        const paint = () => {
            shake = Math.max(0, shake - 0.45)
            const sxo = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0
            const syo = shake > 0 ? Math.round((Math.random() - 0.5) * shake) : 0
            drawBackground(ctx, gs.camX, gs.tick)
            ctx.save()
            ctx.translate(sxo, syo)
            if (gs.p1) drawP1(ctx, gs.p1, gs.camX, gs.tick)
            if (gs.p2) drawP2(ctx, gs.p2, gs.camX, gs.tick)
            for (const e of gs.enemies) {
                if (e.kind === 'hullseg') drawSeg(ctx, e, gs.camX)
            }
            for (const e of gs.enemies) {
                if (e.kind === 'larva') drawLarva(ctx, e, gs.camX)
                else if (e.kind === 'turret') drawTurret(ctx, e, gs.camX)
                else if (e.kind === 'pod') drawPod(ctx, e, gs.camX)
            }
            for (const c of gs.caps) drawCap(ctx, c, gs.camX)
            for (const b of gs.bullets) drawBullet(ctx, b, gs.camX)
            for (const m of gs.missiles) drawMissile(ctx, m, gs.camX)
            for (const q of gs.shots) {
                if (q.kind === 'v') drawBullet(ctx, { x: q.x + 8, y: q.y }, gs.camX)
                else if (q.kind === 'l') drawLance(ctx, q, gs.camX)
                else drawWave(ctx, q, gs.camX)
            }
            drawShip(ctx, gs.ship, gs.camX)
            if (gs.pod) {
                drawPodTether(ctx, gs.pod, gs.ship, gs.camX, gs.tick) // #2823: the pair reads as one
                drawSeedPod(ctx, gs.pod, gs.camX, !gs.ship.dead)
                if (attachFlash > 0) { // capture ceremony flash at the nose
                    drawForceMerge(ctx, Math.round(gs.ship.x - gs.camX + POD.noseX), Math.round(gs.ship.y), attachFlash)
                    attachFlash -= 1
                }
            }
            for (const bt of gs.bits) drawBit(ctx, bt, gs.camX, shieldOn(gs))
            // particles (juice layer — Math.random law: never reaches state)
            for (let i = part.length - 1; i >= 0; i--) {
                const p = part[i]
                p.x += p.vx; p.y += p.vy; p.t -= 1
                if (p.t <= 0) { part.splice(i, 1); continue }
                ctx.fillStyle = p.c === 0 ? (p.t % 4 < 2 ? '#ffd23c' : '#ff6a2a') : p.c === 1 ? '#9ac93c' : p.c === 3 ? '#8ae0ff' : '#d9dde2'
                ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2)
            }
            ctx.restore()
            drawHud(ctx, gs)
            if (screen === 'attract') drawAttract(ctx, Math.floor(gs.tick / 170), gs.tick)
            else drawBanner(ctx, gs)
            if (screen === 'over') {
                ctx.fillStyle = 'rgba(4,4,15,0.72)'
                ctx.fillRect(0, 82, W, 62)
                drawText(ctx, 'GAME OVER', (W - textWidth('GAME OVER', 2)) / 2, 94, '#e03030', 2)
                drawText(ctx, `SCORE ${gs.score}`, (W - textWidth(`SCORE ${gs.score}`)) / 2, 118, '#f0f0f0')
                if (performance.now() - overAt > 900 && (gs.tick >> 4) % 2 === 0) {
                    drawText(ctx, 'PUSH ANY KEY', (W - textWidth('PUSH ANY KEY')) / 2, 134, '#ffd23c')
                }
            }
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
                            else { stepSim(autopilot(gs)); if (gs.mode !== 'play') demoHold = 130 }
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
            if (pausedRef.current) return
            if (e.code === 'ArrowLeft') keys.l = true
            if (e.code === 'ArrowRight') keys.r = true
            if (e.code === 'ArrowUp') keys.u = true
            if (e.code === 'ArrowDown') keys.d = true
            if (e.code === 'Space' || e.code === 'KeyX' || e.code === 'KeyZ') keys.f = true
            if ((e.code === 'KeyB' || e.code === 'KeyC') && !e.repeat) podQ = true
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.l = false
            if (e.code === 'ArrowRight') keys.r = false
            if (e.code === 'ArrowUp') keys.u = false
            if (e.code === 'ArrowDown') keys.d = false
            if (e.code === 'Space' || e.code === 'KeyX' || e.code === 'KeyZ') keys.f = false
        }
        const onBlur = () => { keys.l = keys.r = keys.u = keys.d = keys.f = false }
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
            window.__rTest = {
                probe: () => ({
                    screen, tick: gs.tick, x: Math.round(gs.ship.x), y: Math.round(gs.ship.y),
                    camX: Math.round(gs.camX), lives: gs.lives, score: gs.score,
                    weapon: gs.ship.weapon, charge: gs.ship.charge, inv: gs.ship.inv,
                    mode: gs.mode, cleared: gs.cleared ? 1 : 0,
                    enemies: gs.enemies.length, bullets: gs.bullets.length,
                    missiles: gs.missiles.length, shots: gs.shots.length,
                    pod: gs.pod ? gs.pod.state : '-', podX: gs.pod ? Math.round(gs.pod.x) : 0,
                    p1: gs.p1 ? `${gs.p1.mouth}:${gs.p1.coreHp}` : '-',
                    bits: gs.bits.length, shield: shieldOn(gs) ? 1 : 0, leg: gs.leg,
                    p2: gs.p2 ? `${gs.p2.cores[0].hp}/${gs.p2.cores[1].hp}` : '-',
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                setup: (opts = {}) => {
                    if (screen !== 'play') return false
                    if (opts.camX !== undefined) gs.camX = opts.camX
                    if (opts.lives !== undefined) gs.lives = opts.lives
                    if (opts.inv !== undefined) gs.ship.inv = opts.inv
                    if (opts.weapon) gs.ship.weapon = opts.weapon
                    if (opts.clearEnemies) { gs.enemies.length = 0; gs.missiles.length = 0 }
                    if (opts.clearBullets) { gs.bullets.length = 0 }
                    if (opts.spawnCap) gs.caps.push({ id: gs.nextId++, x: gs.ship.x + 6, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'weapon' })
                    if (opts.spawnFCap) gs.caps.push({ id: gs.nextId++, x: gs.ship.x + 6, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'force' })
                    if (opts.spawnBCap) gs.caps.push({ id: gs.nextId++, x: gs.ship.x + 6, y: gs.ship.y, baseY: gs.ship.y, bob: 0, type: 'bit' })
                    if (opts.giveBits) { while (gs.bits.length < 4) gs.bits.unshift({ id: gs.nextId++ }) }
                    if (opts.force && !gs.pod) gs.pod = { id: gs.nextId++, state: 'attached', x: gs.ship.x + POD.noseX, y: gs.ship.y }
                    if (opts.crushShip) gs.ship.x = gs.camX
                    if (opts.toPhase1) { gs.camX = STAGE_END; step(gs, { left: false, right: false, up: false, down: false, a: false, b: false }) }
                    if (opts.toPhase2) { gs.p1 = null; gs.enemies = gs.enemies.filter((e) => e.on !== 'p1'); gs.bullets.length = 0; gs.camLock = false; gs.leg = 2; gs.camX = STAGE_END2; gs.legAt = gs.tick; step(gs, { left: false, right: false, up: false, down: false, a: false, b: false }) }
                    if (opts.openMouth && gs.p1) { gs.p1.mouth = 'open'; gs.p1.mouthT = 10000 }
                    if (opts.coreHp !== undefined && gs.p1) gs.p1.coreHp = opts.coreHp
                    if (opts.openVents && gs.p2) { for (const c of gs.p2.cores) if (c.hp > 0) { c.mouth = 'open'; c.mouthT = 10000 } }
                    if (opts.y !== undefined) gs.ship.y = opts.y
                    if (opts.p2hp && gs.p2) gs.p2.cores.forEach((c, ci) => { if (opts.p2hp[ci] !== undefined) c.hp = opts.p2hp[ci] })
                    return true
                },
            }
            mountDbg({
                title: 'R-TYPE',
                getState: () => [
                    `x ${Math.round(gs.ship.x)} (screen ${Math.round(gs.ship.x - gs.camX)})  y ${Math.round(gs.ship.y)}  cam ${Math.round(gs.camX)}${gs.camLock ? ' LOCK' : ''}`,
                    `score ${gs.score}  hi ${Math.max(hiscore, gs.score)}  lives ${gs.lives}  arm ${gs.ship.weapon}${gs.ship.charge ? ` charge ${gs.ship.charge}` : ''}  inv ${gs.ship.inv}  mode ${gs.mode}`,
                    `pod ${gs.pod ? `${gs.pod.state} @${Math.round(gs.pod.x - gs.camX)}` : 'none'}  enemies ${gs.enemies.length}  bullets ${gs.bullets.length}  missiles ${gs.missiles.length}  shots ${gs.shots.length}  phase1 ${gs.p1 ? `${gs.p1.mouth} core ${gs.p1.coreHp}/${gs.p1.coreMax}` : 'field'}`,
                    `leg ${gs.leg}  bits ${gs.bits.length}${shieldOn(gs) ? ' SHIELD' : ''}  phase2 ${gs.p2 ? `cores ${gs.p2.cores.map((c) => (c.hp <= 0 ? 'DOWN' : `${c.mouth}:${c.hp}`)).join(' ')}${gs.p2.cores.some((c) => c.enraged) ? ' ENRAGED' : ''}` : (gs.leg === 2 ? 'inbound' : '-')}`,
                    `screen ${screen}  paused ${pausedRef.current}`,
                ],
                actions: [
                    { label: '+1 LIFE', run: () => { gs.lives += 1; return 'extra life' } },
                    { label: 'GIVE WAVE', run: () => { gs.ship.weapon = 'wave'; return 'wave cannon armed' } },
                    { label: 'GIVE LASER', run: () => { gs.ship.weapon = 'laser'; return 'laser lance armed' } },
                    { label: 'GIVE POD', run: () => { if (!gs.pod) gs.pod = { id: gs.nextId++, state: 'attached', x: gs.ship.x + POD.noseX, y: gs.ship.y }; return gs.pod.state === 'attached' ? 'force pod on the nose' : 'pod already riding' } },
                    { label: 'POD OUT/IN', run: () => { if (!gs.pod) return 'no pod — GIVE POD first'; gs.pod.state = gs.pod.state === 'attached' ? 'fly' : 'return'; return `pod → ${gs.pod.state}` } },
                    { label: 'GIVE BITS', run: () => { if (shieldOn(gs)) return 'shield already up'; while (gs.bits.length < 4) gs.bits.unshift({ id: gs.nextId++ }); return shieldOn(gs) ? 'shield — four bits orbiting' : 'bits chained' } },
                    { label: 'TO PHASE-2', run: () => { window.__rTest.setup({ toPhase2: true }); return 'the twin-core fortress looms' } },
                    { label: 'OPEN VENTS', run: () => { if (!gs.p2) return 'no fortress on screen — TO PHASE-2 first'; window.__rTest.setup({ openVents: true }); return 'both vents gape' } },
                    { label: 'TO PHASE-1', run: () => { window.__rTest.setup({ toPhase1: true }); return 'the dreadnought looms' } },
                    { label: 'OPEN MAW', run: () => { window.__rTest.setup({ openMouth: true }); return 'the maw gapes' } },
                    { label: 'CLEAR FIRE', run: () => { gs.bullets.length = 0; gs.missiles.length = 0; return 'lane swept' } },
                ],
            })
            exposeGame({
                id: 'r-type',
                buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
                reset: (seed) => {
                    gs = makeGame(seed >>> 0)
                    part.length = 0
                    keys.l = keys.r = keys.u = keys.d = keys.f = false
                    podQ = false
                    screen = 'play'
                    setMode('play')
                },
                tick: (pad) => {
                    step(gs, { left: !!pad.left, right: !!pad.right, up: !!pad.up, down: !!pad.down, a: !!pad.a, b: !!pad.b })
                    drain()
                },
                state: () => ({
                    tick: gs.tick, score: gs.score, done: gs.mode === 'gameover',
                    seed: gs.seed, lives: gs.lives,
                    x: Math.round(gs.ship.x), y: Math.round(gs.ship.y),
                    weapon: gs.ship.weapon, charge: gs.ship.charge,
                    pod: gs.pod ? gs.pod.state : 'none',
                    bits: gs.bits.length, shield: shieldOn(gs) ? 1 : 0, leg: gs.leg,
                    p2: gs.p2 ? gs.p2.cores.map((c) => c.hp).join('/') : '-',
                    waveIdx: gs.waveIdx, enemies: gs.enemies.length,
                    cleared: gs.cleared ? 1 : 0,
                    hash: stateHash(gs),
                }),
                canvas: () => canvas,
                snapshot: () => JSON.parse(JSON.stringify(gs)),
                restore: (s) => { gs = s },
            })
        }

        exposeFeedbackState(() => ({ tick: gs.tick, score: gs.score, done: gs.mode === 'gameover', lives: gs.lives, seed: gs.seed }))

        return () => {
            unexposeFeedbackState()
            if (import.meta.env.DEV) { if (window.__rTest) delete window.__rTest; unexposeGame(); unmountDbg() }
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
            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'R-TYPE')} onResume={handleResume} />}
            <VirtualControls visible={mode === 'play' && !paused} secondAction={{ label: 'POD', code: 'KeyB' }} />
        </div>
    )
}

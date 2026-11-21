// CONTRA — the run-and-gun joins the arcade (Jon's #1530 commission).
// S1: the jungle. Konami arcade, 1987 — RETRO bar (docs/ART.md).
//
// Shell: one rAF loop with a fixed timestep, attract-first, '?' pause, pad
// (A = JUMP, B = FIRE), DEV hooks + the window.__game contract. All game
// truth lives in ./sim.js (pure, seeded); all pixels are generated in ./art.js;
// all sound is synthesized through audioController on the sim's event stream.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, seedFromQuery, exposeFeedbackState, unexposeFeedbackState } from '../../utils/gameContract'
import { W, H, CFG, PLATFORMS, FALLS_LEDGES, makeGame, step, autopilot, stateHash, warpFalls, warpBoss, dropIn, releaseSeat } from './sim.js'
import { drawBackground, drawFringe, drawGround, drawPlatform, drawPlayer, drawSoldier, drawTurret, drawBarrel, drawCapsule, drawBullet, drawGrenade, drawSniper, drawGate, drawDepot, drawHud, drawCanyon, drawLedge, drawWater, drawGateStructure, drawDeathTumble, drawFireball, drawRappel } from './art.js'

const SIM_MS = 1000 / 60

const MESSAGES = [
    'THE JUNGLE RUNS NORTH TO THE FALLS',
    'CAPSULES CARRY THE WHEEL — S M F L',
    'MACHINE GUN STREAMS · FIRE PIERCES · LASER RUNS HOT',
    'WATCH THE SCOPE GLINT — THE SNIPER TELLS YOU FIRST',
    'THE CORE SHINES WHEN IT IS OPEN — HIT IT THEN',
    'BLUE TAKES THE SECOND SEAT — TWO GUNS, ONE JUNGLE',
    '2P DROP-IN: WASD MOVE · F JUMP · G FIRE',
    'STAND UP FROM THE BLUE SEAT — THE WINGMAN STEPS BACK IN',
    'ONE HIT KILLS. BOTH SIDES.',
    'PRESS ANY KEY',
]

const sfx = {
    shot: () => audioController.playSweep(920, 540, 0.05, 'square', 0.05),
    spread: () => { audioController.playSweep(760, 420, 0.07, 'square', 0.06); audioController.playNoise(0.04, 0.05) },
    efire: () => audioController.playSweep(500, 300, 0.05, 'square', 0.035),
    // the turret's crew-served gun gets its own heavier report (#2782.6)
    efireBig: () => { audioController.playSweep(360, 150, 0.09, 'sawtooth', 0.045); audioController.playNoise(0.05, 0.03) },
    jump: () => audioController.playSweep(260, 520, 0.09, 'square', 0.05),
    boom: () => { audioController.playNoise(0.28, 0.12); audioController.playSweep(160, 40, 0.25, 'triangle', 0.09) },
    spark: () => audioController.playNoise(0.05, 0.03),
    // capsule: the rise plus a bass answer (the original's jingles answer low)
    pickup: () => { audioController.playSweep(320, 980, 0.18, 'triangle', 0.08); setTimeout(() => audioController.playTone(196, 0.16, 'triangle', 0.05), 90) },
    splash: () => audioController.playNoise(0.06, 0.025),
    respawn: () => audioController.playSweep(700, 220, 0.16, 'triangle', 0.06),
    gameover: () => audioController.playSweep(320, 60, 0.6, 'sawtooth', 0.08),
    // S4 co-op: the blue seat's voices — a warmer join chirp, a deeper fall
    p2join: () => { audioController.playSweep(440, 880, 0.12, 'square', 0.05); setTimeout(() => audioController.playTone(1100, 0.1, 'square', 0.04), 90) },
    // #2837 the release chirp: a falling answer to the join's rising one —
    // the wingman taking the seat back.
    p2gone: () => audioController.playSweep(880, 330, 0.14, 'square', 0.045),
    pdown: () => audioController.playSweep(300, 90, 0.3, 'square', 0.07),
    p2down: () => audioController.playSweep(240, 70, 0.3, 'sawtooth', 0.07),
    // stage clear: a 4-note call answered by a bass line (ART.md bar 4 — the
    // original's fanfare is a call-and-response, not a plain triad)
    clear: () => {
        const call = [660, 880, 1046, 1318]
        call.forEach((f, i) => setTimeout(() => audioController.playTone(f, i === 3 ? 0.24 : 0.12, 'square', 0.07), i * 130))
        const bass = [165, 220, 262, 330]
        bass.forEach((f, i) => setTimeout(() => audioController.playTone(f, 0.16, 'triangle', 0.05), 65 + i * 130))
    },
    enter: () => audioController.playSweep(140, 340, 0.35, 'triangle', 0.07),
    drown: () => { audioController.playNoise(0.22, 0.09); audioController.playSweep(300, 70, 0.3, 'sine', 0.07) },
    cannon: () => { audioController.playSweep(220, 90, 0.12, 'square', 0.07); audioController.playNoise(0.06, 0.05) },
    // S3: the wheel's voices + the new roster
    mshot: () => audioController.playSweep(840, 500, 0.03, 'square', 0.035),
    fshot: () => { audioController.playSweep(420, 180, 0.12, 'sawtooth', 0.045); audioController.playNoise(0.08, 0.03) },
    lshot: () => audioController.playSweep(1600, 420, 0.1, 'sawtooth', 0.05),
    sniper: () => audioController.playSweep(1300, 240, 0.09, 'square', 0.055),
    throw: () => audioController.playSweep(300, 560, 0.09, 'triangle', 0.04),
    coreHit: () => { audioController.playTone(1180, 0.05, 'square', 0.06); audioController.playSweep(700, 1100, 0.06, 'sawtooth', 0.04) },
    unlock: () => audioController.playTone(980, 0.07, 'triangle', 0.05),
    door: () => audioController.playSweep(180, 120, 0.1, 'square', 0.05),
    // S3.5 arms depot: the slit gun's heavier bark and the payout arpeggio
    dfire: () => { audioController.playSweep(200, 80, 0.11, 'square', 0.06); audioController.playNoise(0.05, 0.04) },
    volley: () => { [520, 660, 780, 1040].forEach((f, i) => setTimeout(() => audioController.playTone(f, 0.1, 'triangle', 0.06), i * 70)) },
    roar: () => { audioController.playNoise(0.9, 0.14); audioController.playSweep(120, 30, 0.9, 'sawtooth', 0.1); setTimeout(() => audioController.playSweep(90, 25, 0.6, 'triangle', 0.09), 250) },
}

export default function ContraGame () {
    const wrapRef = useRef(null)
    const [mode, setMode] = useState('attract')           // attract | play | over | clear
    const [paused, setPaused] = useState(false)
    const modeRef = useRef('attract')
    const pausedRef = useRef(false)
    modeRef.current = mode
    pausedRef.current = paused

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])

    useEffect(() => {
        const wrap = wrapRef.current
        // StrictMode law: the canvas is created inside the effect (JSX-mounted
        // canvases are detached by the simulated unmount's cleanup — the whole
        // screen goes black in dev and nobody notices until a screenshot).
        const canvas = document.createElement('canvas')
        canvas.className = 'block'
        canvas.style.imageRendering = 'pixelated'
        wrap.appendChild(canvas)
        canvas.width = W
        canvas.height = H
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let raf = 0
        let last = 0
        let acc = 0
        let gs = makeGame(1987)
        let screen = 'attract'
        let demoHold = 0
        let clearHold = 0
        let overAt = 0
        let shake = 0
        let hiscore = Number(localStorage.getItem('contra:hiscore') || 0)
        const part = [] // cosmetic particles — Math.random is law here, never in sim
        const fire = [] // expanding fireballs — sized by the boom's kind (#2782)
        const keys = { l: false, r: false, u: false, d: false, j: false, f: false }
        let jumpQ = false, fireQ = false
        // S4 seat 2 (desktop keyboard, drop-in): WASD move, F jump, G fire.
        // No second touchpad — the phone keeps the CPU ally (Jon's rule).
        const keys2 = { l: false, r: false, u: false, d: false, j: false, f: false }
        let jumpQ2 = false, fireQ2 = false
        let wasGround = true

        const drain = () => {
            for (const e of gs.ev) {
                if (e.type === 'efire' && e.big) sfx.efireBig()
                else if (e.type === 'shot' && e.k === 'machine') sfx.mshot()
                else if (sfx[e.type]) sfx[e.type]()
                if (e.type === 'boom') {
                    shake = Math.min(6, shake + 5)
                    fire.push({ x: e.x, y: e.y, t: 0, kind: e.kind || 'tnt' })
                    const n = e.kind === 'kill' ? 8 : e.kind === 'death' ? 12 : 16
                    for (let i = 0; i < n; i++) {
                        const a = Math.random() * Math.PI * 2, v = 0.8 + Math.random() * 2.4
                        part.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6, t: 22 + Math.random() * 10, c: i % 3 })
                    }
                } else if (e.type === 'spark') {
                    for (let i = 0; i < 5; i++) part.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 1.6, t: 10 + Math.random() * 8, c: 2 })
                }
            }
            // shoreline splash: landing on the sand lip kicks droplets off the
            // water line just below (the sea is at the bottom edge, #2782.1);
            // in the canyon the same landing reads as torrent spray
            if (gs.p.dead === 0 && gs.p.onGround && !wasGround && gs.p.y >= CFG.ground - 0.5) {
                sfx.splash()
                for (let i = 0; i < 7; i++) {
                    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4
                    const v = 0.9 + Math.random() * 1.5
                    part.push({ x: gs.p.x + (Math.random() - 0.5) * 12, y: gs.phase === 'jungle' ? CFG.ground + 8 : gs.p.y + 8, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 12 + Math.random() * 8, c: i % 2 ? 3 : 4 })
                }
            }
            wasGround = gs.p.onGround
            gs.ev.length = 0
        }

        const simPad = () => {
            // Latch taps: a press shorter than one 16.7ms tick must not evaporate
            // between polls (the harness's press() is faster than the loop).
            const pad = { left: keys.l, right: keys.r, up: keys.u, down: keys.d, a: keys.j || jumpQ, b: keys.f || fireQ }
            jumpQ = fireQ = false
            return pad
        }

        const simPad2 = () => {
            const pad = { left: keys2.l, right: keys2.r, up: keys2.u, down: keys2.d, a: keys2.j || jumpQ2, b: keys2.f || fireQ2 }
            jumpQ2 = fireQ2 = false
            return pad
        }

        const startPlay = () => {
            gs = makeGame((seedFromQuery() ?? ((Date.now() * 2654435761) >>> 8)) >>> 0)
            part.length = 0
            fire.length = 0
            wasGround = true
            demoHold = 0
            setMode('play'); screen = 'play'
        }

        const endTo = (what) => {
            screen = what
            setMode(what)
            if (what === 'over') {
                overAt = performance.now()
                if (gs.score > hiscore) { hiscore = gs.score; localStorage.setItem('contra:hiscore', String(hiscore)) }
            }
        }

        const stepSim = (pad) => {
            step(gs, pad, simPad2())
            drain()
            if (gs.end === 'win') { if (screen === 'play') { endTo('clear'); clearHold = 220 } }
            else if (gs.end === 'dead') { if (screen === 'play') endTo('over') }
        }

        const paint = () => {
            shake = Math.max(0, shake - 0.5)
            const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0
            const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0
            const jungle = gs.phase === 'jungle'
            if (jungle) drawBackground(ctx, gs.cam, gs.tick)
            else drawCanyon(ctx, gs.camY, gs.tick)
            ctx.save()
            ctx.translate(-Math.round(gs.cam) + Math.round(sx), (jungle ? 0 : -Math.round(gs.camY)) + Math.round(sy))
            if (jungle) {
                drawGround(ctx, gs.cam, gs.tick)
                for (const pl of PLATFORMS) drawPlatform(ctx, pl)
                if (gs.depot && !gs.depot.dead) drawDepot(ctx, gs.depot, gs.tick)
                drawGate(ctx)
            } else {
                if (gs.phase === 'boss' && gs.boss) drawGateStructure(ctx, gs.boss, gs.tick)
                for (const pl of FALLS_LEDGES) drawLedge(ctx, pl)
            }
            for (const br of gs.barrels) if (!br.gone) drawBarrel(ctx, br)
            for (const t of gs.turrets) if (!t.dead) drawTurret(ctx, t)
            for (const sn of gs.snipers) if (!sn.dead && sn.awake) drawSniper(ctx, sn, gs.tick)
            for (const s of gs.soldiers) if (!s.dead && s.awake) drawSoldier(ctx, s, gs.tick)
            if (gs.capsule) drawCapsule(ctx, gs.capsule, gs.tick)
            for (const c of gs.vc) drawCapsule(ctx, c, gs.tick)
            for (const b of gs.pb) drawBullet(ctx, b, false)
            for (const b of gs.eb) { if (b.gr) drawGrenade(ctx, b); else drawBullet(ctx, b, true) }
            // S4: the blue seat draws at his own body, under the hero. #2837:
            // while the arrival descent runs, his rope paints ahead of him and
            // he doesn't flicker — you see him coming.
            if (gs.p2.dead === 0 && !gs.p2.out && !(gs.end === 'dead')) {
                const rappelling = gs.p2.enterT > 0
                if (rappelling) drawRappel(ctx, gs.p2.x, (gs.phase === 'jungle' ? 0 : gs.camY) - 4, gs.p2.y)
                drawPlayer(ctx, gs.p2, gs.tick, true, rappelling)
            }
            else if (gs.p2.dead > 0) drawDeathTumble(ctx, gs.p2.x, gs.p2.y, Math.floor((CFG.respawnFreeze - gs.p2.dead) / 12) % 4, true)
            if (gs.p.dead === 0 && !(gs.end === 'dead')) drawPlayer(ctx, gs.p, gs.tick)
            else if (gs.p.dead > 0) drawDeathTumble(ctx, gs.p.x, gs.p.y, Math.floor((CFG.respawnFreeze - gs.p.dead) / 12) % 4)
            // expanding fireballs under the sparks (cosmetic, sized by kind)
            for (let i = fire.length - 1; i >= 0; i--) {
                if (!drawFireball(ctx, fire[i])) fire.splice(i, 1)
                else fire[i].t += 1
            }
            // particles (cosmetic layer)
            for (let i = part.length - 1; i >= 0; i--) {
                const q = part[i]
                q.x += q.vx; q.y += q.vy; q.vy += 0.08; q.t -= 1
                if (q.t <= 0) { part.splice(i, 1); continue }
                ctx.fillStyle = q.c === 0 ? '#ffd23c' : q.c === 1 ? '#ff6a2a' : q.c === 2 ? '#d9dde2' : q.c === 3 ? '#7cc7ff' : '#e8f6ff'
                ctx.fillRect(Math.round(q.x), Math.round(q.y), q.c === 2 ? 1 : 2, q.c === 2 ? 1 : 2)
            }
            ctx.restore()
            if (jungle) drawFringe(ctx, gs.cam)
            else drawWater(ctx, gs.tick)
            drawHud(ctx, gs, hiscore)

            ctx.textBaseline = 'top'
            if (screen === 'attract') {
                ctx.fillStyle = '#e23b2e'
                ctx.font = 'bold 30px "Courier New", monospace'
                ctx.fillText('CONTRA', 132, 40)
                ctx.fillStyle = '#ffd23c'
                ctx.font = 'bold 9px "Courier New", monospace'
                ctx.fillText('OPERATION — JUNGLE AND BASE', 136, 76)
                // message rotation rides WORLD ticks, not paint frames: a slow
                // software-rendered page must not cycle attract copy at half speed
                const msg = Math.floor(gs.tick / 150) % MESSAGES.length
                ctx.font = 'bold 10px "Courier New", monospace'
                ctx.fillStyle = msg === MESSAGES.length - 1 && Math.floor(gs.tick / 24) % 2 === 0 ? '#ffffff' : '#cdeea8'
                const t = MESSAGES[msg]
                ctx.fillText(t, 192 - ctx.measureText(t).width / 2, 112)
                ctx.font = '8px "Courier New", monospace'
                ctx.fillStyle = '#7d8f6a'
                ctx.fillText('KONAMI-STYLE RUN & GUN — 1987 HOMAGE', 100, 128)
            } else if (screen === 'clear') {
                ctx.fillStyle = '#ffd23c'
                ctx.font = 'bold 16px "Courier New", monospace'
                ctx.fillText('STAGE CLEAR', 140, 92)
                ctx.fillStyle = '#cdeea8'
                ctx.font = 'bold 9px "Courier New", monospace'
                ctx.fillText('THE CORE IS DUST — THE BASE IS BROKEN', 96, 116)
            } else if (screen === 'over') {
                ctx.fillStyle = '#e23b2e'
                ctx.font = 'bold 16px "Courier New", monospace'
                ctx.fillText('GAME OVER', 144, 96)
                ctx.fillStyle = '#cdeea8'
                ctx.font = '9px "Courier New", monospace'
                ctx.fillText(`SCORE ${gs.score}  HI ${hiscore}`, 150, 120)
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
                            if (gs.end && demoHold > 0) { demoHold -= 1; if (demoHold === 0) gs = makeGame((gs.seed + 7) >>> 0) }
                            else if (!gs.end) { stepSim(autopilot(gs)) }
                            else demoHold = 120
                            if (gs.end === 'win' || gs.end === 'dead') demoHold = 120
                        } else if (screen === 'clear') {
                            gs.tick += 1
                            if (--clearHold <= 0) endTo('attract')
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
            if (screen === 'clear') return
            if (pausedRef.current || e.repeat) return
            if (e.code === 'ArrowLeft') keys.l = true
            if (e.code === 'ArrowRight') keys.r = true
            if (e.code === 'ArrowUp') keys.u = true
            if (e.code === 'ArrowDown') keys.d = true
            if (e.code === 'Space' || e.code === 'KeyZ') { keys.j = true; jumpQ = true }
            if (e.code === 'KeyX' || e.code === 'KeyC') { keys.f = true; fireQ = true }
            // S4 seat 2 keys — and the drop-in law (#2837): the first touch of
            // a P2 key doesn't puppeteer the standing wingman — it calls for a
            // drop; the soldier rappels in at the hero's side (the join chirp
            // rides the sim's p2join event).
            const isP2 = e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'KeyW' || e.code === 'KeyS' || e.code === 'KeyF' || e.code === 'KeyG'
            if (e.code === 'KeyA') keys2.l = true
            if (e.code === 'KeyD') keys2.r = true
            if (e.code === 'KeyW') keys2.u = true
            if (e.code === 'KeyS') keys2.d = true
            if (e.code === 'KeyF') { keys2.j = true; jumpQ2 = true }
            if (e.code === 'KeyG') { keys2.f = true; fireQ2 = true }
            if (isP2 && !gs.p2.human && !gs.p2.out) dropIn(gs)
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.l = false
            if (e.code === 'ArrowRight') keys.r = false
            if (e.code === 'ArrowUp') keys.u = false
            if (e.code === 'ArrowDown') keys.d = false
            if (e.code === 'Space' || e.code === 'KeyZ') keys.j = false
            if (e.code === 'KeyX' || e.code === 'KeyC') keys.f = false
            if (e.code === 'KeyA') keys2.l = false
            if (e.code === 'KeyD') keys2.r = false
            if (e.code === 'KeyW') keys2.u = false
            if (e.code === 'KeyS') keys2.d = false
            if (e.code === 'KeyF') keys2.j = false
            if (e.code === 'KeyG') keys2.f = false
        }
        const onBlur = () => { keys.l = keys.r = keys.u = keys.d = keys.j = keys.f = false; keys2.l = keys2.r = keys2.u = keys2.d = keys2.j = keys2.f = false }
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
            window.__contraTest = {
                probe: () => ({
                    screen, tick: gs.tick, x: +gs.p.x.toFixed(2), y: +gs.p.y.toFixed(2), onGround: gs.p.onGround,
                    lives: gs.lives, score: gs.score, weapon: gs.p.weapon, end: gs.end, cam: Math.round(gs.cam),
                    phase: gs.phase, camY: +gs.camY.toFixed(2),
                    core: gs.boss ? gs.boss.core : null,
                    coreOpen: gs.boss ? (gs.boss.coreT % CFG.coreCycle) < CFG.coreOpen : null,
                    soldiersAlive: gs.soldiers.filter((s) => !s.dead).length, turretsAlive: gs.turrets.filter((t) => !t.dead).length,
                    barrelsLeft: gs.barrels.filter((b) => !b.gone).length, pb: gs.pb.length, eb: gs.eb.length,
                    capsule: gs.capsule ? { x: +gs.capsule.x.toFixed(1), y: gs.capsule.y, kind: gs.capsule.kind || 'spread' } : null,
                    volley: gs.vc.length,
                    depot: gs.depot ? { hp: gs.depot.hp, dead: gs.depot.dead } : null,
                    snipersAlive: gs.snipers.filter((s) => !s.dead).length, nades: gs.eb.filter((b) => b.gr).length,
                    ally: { x: +gs.p2.x.toFixed(2), y: +gs.p2.y.toFixed(2), onGround: gs.p2.onGround, weapon: gs.p2.weapon, out: gs.p2.out, human: gs.p2.human, dead: gs.p2.dead, enter: gs.p2.enterT, idle: gs.p2.idle, padClaim: gs.p2.padClaim },
                    keys: { ...keys },
                    keys2: { ...keys2 },
                    msg: MESSAGES[Math.floor(gs.tick / 150) % MESSAGES.length],
                    tumble: gs.p.dead > 0 ? Math.floor((CFG.respawnFreeze - gs.p.dead) / 12) % 4 : -1,
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                setup: (opts = {}) => {
                    if (screen !== 'play') return false
                    if (opts.warp === 'falls') warpFalls(gs)
                    if (opts.warp === 'boss') warpBoss(gs)
                    if (opts.x !== undefined) gs.p.x = opts.x
                    if (opts.lives !== undefined) gs.lives = opts.lives
                    if (opts.weapon) gs.p.weapon = opts.weapon
                    if (opts.inv !== undefined) gs.p.inv = opts.inv
                    if (opts.coreOpen !== undefined && gs.boss) gs.boss.coreT = opts.coreOpen ? 0 : CFG.coreOpen + 20
                    if (opts.clearBoss && gs.boss) { gs.boss.guns.forEach((g) => { g.t = 1e9 }); gs.boss.doors.forEach((d) => { d.t = 1e9 }); gs.soldiers.length = 0 }
                    if (opts.capsuleNear) gs.capsule = { x: gs.p.x + 8, y: opts.capsuleY ?? gs.p.y - 14, vx: 0, kind: opts.capsuleKind || 'spread' }
                    if (opts.kill) { gs.p.inv = 0; gs.eb.push({ x: gs.p.x + 2, y: gs.p.y - 14, vx: 0.1, vy: 0 }) }
                    if (opts.clearEnemies) for (const s of gs.soldiers) s.dead = true
                    // S4 co-op hooks for the browser legs
                    if (opts.allyHuman) gs.p2.human = true
                    if (opts.allyDrop) dropIn(gs)                 // #2837 ceremony arrival
                    if (opts.allyRelease) releaseSeat(gs)         // #2837 manual release
                    if (opts.allyX !== undefined) gs.p2.x = opts.allyX
                    if (opts.allyWeapon) gs.p2.weapon = opts.allyWeapon
                    if (opts.killAlly) { gs.p2.human = true; gs.p2.inv = 0; gs.eb.push({ x: gs.p2.x + 2, y: gs.p2.y - 14, vx: 0.1, vy: 0 }) }
                    if (opts.allyOut) { gs.p2.out = true }   // #2814: seats don't hold banks — the pin stands the seat down
                    return true
                },
            }
            mountDbg({
                title: 'CONTRA',
                getState: () => [
                    `x ${gs.p.x.toFixed(0)}/${CFG.worldW}  cam ${Math.round(gs.cam)}/${Math.round(gs.camY)}  y ${gs.p.y.toFixed(0)}  ground ${gs.p.onGround ? 1 : 0}  phase ${gs.phase}`,
                    `score ${gs.score}  lives ${gs.lives}  weapon ${gs.p.weapon}  inv ${gs.p.inv}  end ${gs.end || '-'}` + (gs.boss ? `  core ${gs.boss.core}/${CFG.coreHp} ${gs.boss.dying ? 'DYING' : (gs.boss.coreT % CFG.coreCycle) < CFG.coreOpen ? 'OPEN' : 'SHUT'}` : ''),
                    `ALLY ${gs.p2.out ? 'DOWN' : `x ${gs.p2.x.toFixed(0)}  y ${gs.p2.y.toFixed(0)}  ${gs.p2.human ? 'HUMAN' : 'CPU'}  ${gs.p2.weapon}`}  POOL ${gs.lives}`,
                    `soldiers ${gs.soldiers.filter((s) => !s.dead).length}/${gs.soldiers.length} alive  turrets ${gs.turrets.filter((t) => !t.dead).length}  snipers ${gs.snipers.filter((t) => !t.dead).length}  nades ${gs.eb.filter((b) => b.gr).length}  barrels ${gs.barrels.filter((b) => !b.gone).length}  bullets p/e ${gs.pb.length}/${gs.eb.length}`,
                    `screen ${screen}  paused ${pausedRef.current}`,
                ],
                actions: [
                    { label: '+1 LIFE', run: () => { gs.lives += 1; return 'extra life' } },
                    { label: 'SPREAD NOW', run: () => { gs.p.weapon = 'spread'; return 'spread gun racked' } },
                    { label: 'CYCLE WHEEL', run: () => { const w = ['rifle', 'spread', 'machine', 'fire', 'laser']; gs.p.weapon = w[(w.indexOf(gs.p.weapon) + 1) % w.length]; return 'weapon: ' + gs.p.weapon } },
                    { label: 'CAPSULE HERE', run: () => { gs.capsule = { x: gs.p.x + 24, y: gs.p.y - 14, vx: 0 }; return 'capsule inbound' } },
                    { label: 'P2: HUMAN SEAT', run: () => { if (gs.p2.out) return 'seat down — pool spent'; if (gs.p2.human) releaseSeat(gs); else dropIn(gs); return gs.p2.human ? 'human seat: the soldier rappels in (WASD/F/G)' : 'wingman back on the seat' } },
                    { label: 'TO WATERFALL', run: () => { warpFalls(gs); return 'into the canyon' } },
                    { label: 'TO THE GATE', run: () => { warpBoss(gs); return 'before the core' } },
                ],
            })
            exposeGame({
                id: 'contra',
                buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
                reset: (seed) => {
                    gs = makeGame(seed >>> 0)
                    part.length = 0
                    keys.l = keys.r = keys.u = keys.d = keys.j = keys.f = false
                    keys2.l = keys2.r = keys2.u = keys2.d = keys2.j = keys2.f = false
                    jumpQ2 = fireQ2 = false
                    screen = 'play'
                    setMode('play')
                },
                tick: (pad) => {
                    if (gs.end) { gs.tick += 1; drain(); return }
                    step(gs, {
                        left: !!pad.left, right: !!pad.right, up: !!pad.up, down: !!pad.down,
                        a: !!pad.a, b: !!pad.b,
                    })
                    drain()
                },
                state: () => ({
                    tick: gs.tick, score: gs.score, done: gs.end !== null,
                    seed: gs.seed, lives: gs.lives,
                    x: Math.round(gs.p.x), y: Math.round(gs.p.y), weapon: gs.p.weapon,
                    phase: gs.phase, core: gs.boss ? gs.boss.core : null,
                    soldiersAlive: gs.soldiers.filter((s) => !s.dead).length,
                    // #2814: one pool — `lives` above IS both seats' bank; the
                    // seat's own bank no longer exists, only its standing state.
                    allyWeapon: gs.p2.weapon, allyOut: gs.p2.out,
                    hash: stateHash(gs),
                }),
                canvas: () => canvas,
                snapshot: () => JSON.parse(JSON.stringify(gs)),
                restore: (s) => { gs = s },
            })
        }

        exposeFeedbackState(() => ({ tick: gs.tick, score: gs.score, done: gs.end != null, lives: gs.lives, seed: gs.seed }))

        return () => {
            unexposeFeedbackState()
            if (import.meta.env.DEV) { if (window.__contraTest) delete window.__contraTest; unexposeGame(); unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            canvas.remove()
        }
    }, [])

    return (
        <div ref={wrapRef} className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none">
            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'CONTRA')} onResume={handleResume} />}
            <VirtualControls visible={mode === 'play' && !paused} secondAction={{ label: 'FIRE', code: 'KeyX' }} />
        </div>
    )
}

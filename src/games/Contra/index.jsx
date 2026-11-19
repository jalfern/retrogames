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
import { W, H, CFG, PLATFORMS, makeGame, step, autopilot, stateHash } from './sim.js'
import { drawBackground, drawFringe, drawGround, drawPlatform, drawPlayer, drawSoldier, drawTurret, drawBarrel, drawCapsule, drawBullet, drawGate, drawHud } from './art.js'

const SIM_MS = 1000 / 60

const MESSAGES = [
    'THE JUNGLE RUNS NORTH OF THE BASE',
    'CATCH THE CAPSULE — SPREAD KILLS WIDER',
    'ONE HIT KILLS. BOTH SIDES.',
    'PRESS ANY KEY',
]

const sfx = {
    shot: () => audioController.playSweep(920, 540, 0.05, 'square', 0.05),
    spread: () => { audioController.playSweep(760, 420, 0.07, 'square', 0.06); audioController.playNoise(0.04, 0.05) },
    efire: () => audioController.playSweep(500, 300, 0.05, 'square', 0.035),
    jump: () => audioController.playSweep(260, 520, 0.09, 'square', 0.05),
    boom: () => { audioController.playNoise(0.28, 0.12); audioController.playSweep(160, 40, 0.25, 'triangle', 0.09) },
    spark: () => audioController.playNoise(0.05, 0.03),
    pickup: () => audioController.playSweep(320, 980, 0.18, 'triangle', 0.08),
    respawn: () => audioController.playSweep(700, 220, 0.16, 'triangle', 0.06),
    gameover: () => audioController.playSweep(320, 60, 0.6, 'sawtooth', 0.08),
    clear: () => { audioController.playTone(660, 0.12, 'square', 0.07); setTimeout(() => audioController.playTone(880, 0.12, 'square', 0.07), 130); setTimeout(() => audioController.playTone(1180, 0.24, 'square', 0.07), 260) },
}

export default function ContraGame () {
    const wrapRef = useRef(null)
    const canvasRef = useRef(null)
    const [mode, setMode] = useState('attract')           // attract | play | over | clear
    const [paused, setPaused] = useState(false)
    const modeRef = useRef('attract')
    const pausedRef = useRef(false)
    modeRef.current = mode
    pausedRef.current = paused

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])

    useEffect(() => {
        const wrap = wrapRef.current
        const canvas = canvasRef.current
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
        let msg = 0
        let msgTick = 0
        let hiscore = Number(localStorage.getItem('contra:hiscore') || 0)
        const part = [] // cosmetic particles — Math.random is law here, never in sim
        const keys = { l: false, r: false, u: false, d: false, j: false, f: false }
        let jumpQ = false, fireQ = false

        const drain = () => {
            for (const e of gs.ev) {
                if (sfx[e.type]) sfx[e.type]()
                if (e.type === 'boom') {
                    shake = Math.min(6, shake + 5)
                    for (let i = 0; i < 16; i++) {
                        const a = Math.random() * Math.PI * 2, v = 0.8 + Math.random() * 2.4
                        part.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6, t: 22 + Math.random() * 10, c: i % 3 })
                    }
                } else if (e.type === 'spark') {
                    for (let i = 0; i < 5; i++) part.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 1.6, t: 10 + Math.random() * 8, c: 2 })
                }
            }
            gs.ev.length = 0
        }

        const simPad = () => {
            // Latch taps: a press shorter than one 16.7ms tick must not evaporate
            // between polls (the harness's press() is faster than the loop).
            const pad = { left: keys.l, right: keys.r, up: keys.u, down: keys.d, a: keys.j || jumpQ, b: keys.f || fireQ }
            jumpQ = fireQ = false
            return pad
        }

        const startPlay = () => {
            gs = makeGame((seedFromQuery() ?? ((Date.now() * 2654435761) >>> 8)) >>> 0)
            part.length = 0
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
            step(gs, pad)
            drain()
            if (gs.end === 'win') { if (screen === 'play') { endTo('clear'); clearHold = 220 } }
            else if (gs.end === 'dead') { if (screen === 'play') endTo('over') }
        }

        const paint = () => {
            shake = Math.max(0, shake - 0.5)
            const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0
            const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0
            drawBackground(ctx, gs.cam, gs.tick)
            ctx.save()
            ctx.translate(-Math.round(gs.cam) + Math.round(sx), Math.round(sy))
            drawGround(ctx, gs.cam)
            for (const pl of PLATFORMS) drawPlatform(ctx, pl)
            drawGate(ctx)
            for (const br of gs.barrels) if (!br.gone) drawBarrel(ctx, br)
            for (const t of gs.turrets) if (!t.dead) drawTurret(ctx, t)
            for (const s of gs.soldiers) if (!s.dead && s.awake) drawSoldier(ctx, s, gs.tick)
            if (gs.capsule) drawCapsule(ctx, gs.capsule, gs.tick)
            for (const b of gs.pb) drawBullet(ctx, b, false)
            for (const b of gs.eb) drawBullet(ctx, b, true)
            if (gs.p.dead === 0 && !(gs.end === 'dead')) drawPlayer(ctx, gs.p, gs.tick)
            // particles (cosmetic layer)
            for (let i = part.length - 1; i >= 0; i--) {
                const q = part[i]
                q.x += q.vx; q.y += q.vy; q.vy += 0.08; q.t -= 1
                if (q.t <= 0) { part.splice(i, 1); continue }
                ctx.fillStyle = q.c === 0 ? '#ffd23c' : q.c === 1 ? '#ff6a2a' : '#d9dde2'
                ctx.fillRect(Math.round(q.x), Math.round(q.y), q.c === 2 ? 1 : 2, q.c === 2 ? 1 : 2)
            }
            ctx.restore()
            drawFringe(ctx, gs.cam)
            drawHud(ctx, gs, hiscore)

            ctx.textBaseline = 'top'
            if (screen === 'attract') {
                ctx.fillStyle = '#e23b2e'
                ctx.font = 'bold 30px "Courier New", monospace'
                ctx.fillText('CONTRA', 132, 40)
                ctx.fillStyle = '#ffd23c'
                ctx.font = 'bold 9px "Courier New", monospace'
                ctx.fillText('OPERATION — THE JUNGLE', 138, 76)
                msgTick += 1
                if (msgTick > 150) { msgTick = 0; msg = (msg + 1) % MESSAGES.length }
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
                ctx.fillText('THE BASE WAITS BEYOND THE FALLS', 108, 116)
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
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.l = false
            if (e.code === 'ArrowRight') keys.r = false
            if (e.code === 'ArrowUp') keys.u = false
            if (e.code === 'ArrowDown') keys.d = false
            if (e.code === 'Space' || e.code === 'KeyZ') keys.j = false
            if (e.code === 'KeyX' || e.code === 'KeyC') keys.f = false
        }
        const onBlur = () => { keys.l = keys.r = keys.u = keys.d = keys.j = keys.f = false }
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
                    soldiersAlive: gs.soldiers.filter((s) => !s.dead).length, turretsAlive: gs.turrets.filter((t) => !t.dead).length,
                    barrelsLeft: gs.barrels.filter((b) => !b.gone).length, pb: gs.pb.length, eb: gs.eb.length,
                    capsule: gs.capsule ? { x: +gs.capsule.x.toFixed(1), y: gs.capsule.y } : null,
                    keys: { ...keys },
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                setup: (opts = {}) => {
                    if (screen !== 'play') return false
                    if (opts.x !== undefined) gs.p.x = opts.x
                    if (opts.lives !== undefined) gs.lives = opts.lives
                    if (opts.weapon) gs.p.weapon = opts.weapon
                    if (opts.inv !== undefined) gs.p.inv = opts.inv
                    if (opts.capsuleNear) gs.capsule = { x: gs.p.x + 8, y: gs.p.y - 14, vx: 0 }
                    if (opts.kill) { gs.p.inv = 0; gs.eb.push({ x: gs.p.x + 2, y: gs.p.y - 14, vx: 0.1, vy: 0 }) }
                    if (opts.clearEnemies) for (const s of gs.soldiers) s.dead = true
                    return true
                },
            }
            mountDbg({
                title: 'CONTRA',
                getState: () => [
                    `x ${gs.p.x.toFixed(0)}/${CFG.worldW}  cam ${Math.round(gs.cam)}  y ${gs.p.y.toFixed(0)}  ground ${gs.p.onGround ? 1 : 0}`,
                    `score ${gs.score}  lives ${gs.lives}  weapon ${gs.p.weapon}  inv ${gs.p.inv}  end ${gs.end || '-'}`,
                    `soldiers ${gs.soldiers.filter((s) => !s.dead).length}/${gs.soldiers.length} alive  turrets ${gs.turrets.filter((t) => !t.dead).length}  barrels ${gs.barrels.filter((b) => !b.gone).length}  bullets p/e ${gs.pb.length}/${gs.eb.length}`,
                    `screen ${screen}  paused ${pausedRef.current}`,
                ],
                actions: [
                    { label: '+1 LIFE', run: () => { gs.lives += 1; return 'extra life' } },
                    { label: 'SPREAD NOW', run: () => { gs.p.weapon = 'spread'; return 'spread gun racked' } },
                    { label: 'CAPSULE HERE', run: () => { gs.capsule = { x: gs.p.x + 24, y: gs.p.y - 14, vx: 0 }; return 'capsule inbound' } },
                    { label: 'WARP 400', run: () => { gs.p.x += 400; return 'jumped ahead 400' } },
                ],
            })
            exposeGame({
                id: 'contra',
                buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
                reset: (seed) => {
                    gs = makeGame(seed >>> 0)
                    part.length = 0
                    keys.l = keys.r = keys.u = keys.d = keys.j = keys.f = false
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
                    soldiersAlive: gs.soldiers.filter((s) => !s.dead).length,
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
            <canvas ref={canvasRef} className="block" style={{ imageRendering: 'pixelated' }} />
            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'CONTRA')} onResume={handleResume} />}
            <VirtualControls visible={mode === 'play' && !paused} secondAction={{ label: 'FIRE', code: 'KeyX' }} />
        </div>
    )
}

// ARKANOID — the arcade shell. Everything visible is drawn at runtime from
// the pure sim in ./sim.js at 1:1 on a 256x224 canvas: bricks are the grid
// rounds.js says they are, the paddle bounce follows the sim's offset formula
// the harness pins, capsules fall on the timers the sim owns, and the attract
// demo is planner.js's OWN proven full-clear replayed tick for tick through
// the real step() — the same run arkanoidcheck grades (win, 3 phases, 0 deaths).
//
// Layout: 1. palette + painters 2. fixed-timestep loop (250 ms catch-up cap —
// the heist lesson) 3. input 4. DEV hook + DebugKit 5. React + HUD.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { W, H, CFG, makeGame, step, stateHash } from './sim.js'
import { plan } from './planner.js'
import { ROUNDS } from './rounds.js'

const SIM_MS = 1000 / 60

let proven = null
const provenRun = () => {
    if (!proven) proven = plan(0)
    return proven
}

const ROWCOL = ['#ff5d5d', '#ff9d3f', '#ffd23f', '#5dff8f', '#5dc8ff', '#b08cff']
const CAPCOL = { L: '#5dff8f', S: '#5dc8ff', D: '#ff9d3f', C: '#b08cff', B: '#ff5d5d', E: '#ffd23f', '+': '#ffffff' }

const ArkanoidGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const board = () => { try { return JSON.parse(localStorage.getItem('arkanoid.board') || '[]') } catch { return [] } }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.arkanoidStage = '1'
        canvas.width = W; canvas.height = H
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeGame(0)
        let raf = 0, last = 0, acc = 0
        let demoAt = 0, toast = 0, toastMsg = '', shake = 0
        const keys = { l: false, r: false, f: false, fEdge: false }
        const evLog = []
        const parts = []
        const trail = []

        const say = (m) => { toastMsg = m; toast = 110 }
        const burst = (cx, cy, n, col) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 2.4
                parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, col })
            }
        }

        const handleEvents = (evts) => {
            for (const e of evts) evLog.push({ ...e, tick: gs.tick })
            if (evLog.length > 240) evLog.splice(0, evLog.length - 240)
            for (const e of evts) {
                if (e.type === 'brick') { audioController.playTone(420 + (7 - Math.min(e.row ?? 3, 7)) * 60, 0.05, 'square', 0.05); burst(e.x, e.y, 5, e.col || '#ff9d3f') }
                else if (e.type === 'silverHit') { audioController.playNoise(0.04, 0.06); burst(e.x, e.y, 3, '#cfd8ff') }
                else if (e.type === 'capsule') { say(`CAPSULE ${e.kind === '+' ? 'EXTRA LIFE' : e.kind}`); audioController.playSweep(440, 880, 0.25, 'square', 0.07) }
                else if (e.type === 'enemy') { audioController.playNoise(0.05, 0.05); burst(e.x, e.y, 6, '#ff5d5d') }
                else if (e.type === 'laser') audioController.playTone(960, 0.03, 'square', 0.03)
                else if (e.type === 'death') { say('LOST!'); audioController.playDeath(); shake = 8 }
                else if (e.type === 'round') { say(`${ROUNDS[gs.round].name}`); audioController.playSweep(330, 660, 0.3, 'square', 0.07) }
                else if (e.type === 'bossEye') { audioController.playNoise(0.07, 0.07); burst(e.x, e.y, 8, '#ff5d5d'); shake = 3 }
                else if (e.type === 'bossPhase') { say('DOH FLINCHES!'); audioController.playSweep(220, 660, 0.5, 'sawtooth', 0.08) }
                else if (e.type === 'bossShoot') audioController.playTone(300, 0.05, 'sawtooth', 0.04)
                else if (e.type === 'bossThud') audioController.playTone(160, 0.06, 'square', 0.05)
                else if (e.type === 'bossDead') { say('DOH IS NO MORE!'); audioController.playSweep(200, 1400, 0.8, 'square', 0.1); shake = 10 }
                else if (e.type === 'go') audioController.playTone(520, 0.12, 'square', 0.05)
            }
        }

        const finish = (win) => {
            const sc = gs.score
            if (win) localStorage.setItem('arkanoid.board', JSON.stringify([...board(), { score: sc, date: new Date().toISOString().slice(2, 10) }].sort((a, b) => b.score - a.score).slice(0, 8)))
            overAtRef.current = performance.now()
            setMode('over')
        }

        const doSim = (inp) => {
            step(gs, inp)
            handleEvents(gs.events.splice(0))
            if (gs.end) finish(gs.end === 'win')
        }

        const tickDemo = () => {
            const run = provenRun()
            if (demoAt >= run.script.length) { gs = makeGame(0); demoAt = 0; return }
            doSim(run.script[demoAt++])
            if (gs.end) { gs = makeGame(0); demoAt = 0 }
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            doSim({ l: keys.l, r: keys.r, fire: keys.fEdge })
            keys.fEdge = false
        }

        // ---------------------------------------------------------------- paint ----
        const brickCol = (b) => {
            if (b.kind === 'gold') return ['#ffe27a', '#c9932a']
            if (b.kind === 'silver') return ['#e8eefc', '#7d8aa8']
            return [ROWCOL[b.row % ROWCOL.length], '#00000030']
        }
        const drawBrick = (b) => {
            const [main, dark] = brickCol(b)
            ctx.fillStyle = main
            ctx.fillRect(b.x, b.y, CFG.colW - 1, CFG.rowH - 1)
            ctx.fillStyle = 'rgba(255,255,255,0.35)'
            ctx.fillRect(b.x, b.y, CFG.colW - 1, 1)
            ctx.fillStyle = b.kind === 'normal' ? dark : '#00000050'
            ctx.fillRect(b.x, b.y + CFG.rowH - 2, CFG.colW - 1, 1)
            if (b.kind === 'silver' && b.hp > 1) { ctx.fillStyle = '#4d5a78'; ctx.fillRect(b.x + 3, b.y + 3, 3, 2) }
        }
        const drawPaddle = (P) => {
            ctx.fillStyle = '#0e2c4a'
            ctx.fillRect(P.x - P.w / 2, CFG.paddleY, P.w, CFG.paddleH)
            ctx.fillStyle = '#5dc8ff'
            ctx.fillRect(P.x - P.w / 2, CFG.paddleY, P.w, 2)
            ctx.fillStyle = '#e9f7ff'
            ctx.fillRect(P.x - 2, CFG.paddleY + 1, 4, 2)
            ctx.fillStyle = '#ff5db0'
            ctx.fillRect(P.x - P.w / 2, CFG.paddleY, 3, CFG.paddleH)
            ctx.fillRect(P.x + P.w / 2 - 3, CFG.paddleY, 3, CFG.paddleH)
        }
        const drawCapsule = (c) => {
            ctx.fillStyle = CAPCOL[c.kind] || '#fff'
            ctx.fillRect(c.x - 7, c.y - 3, 14, 6)
            ctx.fillStyle = '#06121f'
            ctx.font = 'bold 6px monospace'
            ctx.textAlign = 'center'
            ctx.fillText(c.kind === '+' ? '2P' : c.kind, c.x, c.y + 2.5)
        }
        const drawEnemy = (e) => {
            ctx.fillStyle = e.kind === 'crab' ? '#ff8a5d' : '#b08cff'
            ctx.fillRect(e.x - 5, e.y - 3, 10, 6)
            ctx.fillStyle = '#06121f'
            ctx.fillRect(e.x - 3, e.y - 1, 2, 2); ctx.fillRect(e.x + 1, e.y - 1, 2, 2)
            ctx.fillStyle = e.kind === 'crab' ? '#ffd23f' : '#e9f7ff'
            ctx.fillRect(e.x - 6, e.y + 3, 2, 2); ctx.fillRect(e.x + 4, e.y + 3, 2, 2)
        }
        const drawBoss = (bo) => {
            const x = bo.x, y = bo.y
            ctx.fillStyle = '#1d5c33'
            ctx.fillRect(x - 40, y + 8, 80, 32)
            ctx.beginPath(); ctx.arc(x, y + 20, 40, Math.PI, 0); ctx.fill()
            ctx.fillStyle = '#2f8f4e'
            ctx.fillRect(x - 34, y + 12, 68, 8)
            ctx.fillStyle = '#0a2013'
            ctx.fillRect(x - 26, y + 34, 52, 5)
            for (const e of bo.eyes) {
                const ex = x + e.dx, ey = y + CFG.bossH
                ctx.fillStyle = e.alive ? '#fff' : '#555'
                ctx.beginPath(); ctx.arc(ex, ey - 3, CFG.bossEyeR, 0, Math.PI * 2); ctx.fill()
                if (e.alive) { ctx.fillStyle = '#c0182a'; ctx.beginPath(); ctx.arc(ex + Math.sin(gs.tick / 30 + e.dx) * 2, ey - 3, 2.4, 0, Math.PI * 2); ctx.fill() }
                else { ctx.strokeStyle = '#900'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(ex - 3, ey - 6); ctx.lineTo(ex + 3, ey); ctx.moveTo(ex + 3, ey - 6); ctx.lineTo(ex - 3, ey); ctx.stroke() }
            }
        }
        const text = (s, x, y, size, col, glow) => {
            ctx.font = `bold ${size}px monospace`
            ctx.textAlign = 'center'
            if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow }
            ctx.fillStyle = col
            ctx.fillText(s, x, y)
            ctx.shadowBlur = 0
        }

        const draw = () => {
            ctx.fillStyle = '#050510'
            ctx.fillRect(0, 0, W, H)
            const g = ctx.createLinearGradient(0, 0, 0, H)
            g.addColorStop(0, '#0a0a24'); g.addColorStop(1, '#050510')
            ctx.fillStyle = g
            ctx.fillRect(0, 0, W, H)
            ctx.save()
            if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake -= 0.5 }

            const wg = ctx.createLinearGradient(0, 0, CFG.wallX, 0)
            wg.addColorStop(0, '#7a1f4f'); wg.addColorStop(1, '#241236')
            ctx.fillStyle = wg
            ctx.fillRect(0, 0, CFG.wallX, H)
            const wg2 = ctx.createLinearGradient(W - CFG.wallX, 0, W, 0)
            wg2.addColorStop(0, '#241236'); wg2.addColorStop(1, '#7a1f4f')
            ctx.fillStyle = wg2
            ctx.fillRect(W - CFG.wallX, 0, CFG.wallX, H)
            ctx.fillStyle = '#12081f'
            ctx.fillRect(0, 0, W, CFG.ceilY)

            if (gs.boss) drawBoss(gs.boss)
            for (const b of gs.bricks) if (b.alive) drawBrick(b)
            for (const c of gs.capsules) drawCapsule(c)
            for (const e of gs.enemies) if (e.alive) drawEnemy(e)
            ctx.fillStyle = '#ffd23f'
            for (const u of gs.bullets) ctx.fillRect(u.x - 1, u.y - 3, 2, 6)

            trail.push(gs.balls.map((b) => [b.x, b.y]))
            if (trail.length > 6) trail.shift()
            trail.forEach((fr, i) => {
                const a = (i + 1) / trail.length
                for (const [bx, by] of fr) { ctx.fillStyle = `rgba(233,247,255,${0.12 * a})`; ctx.beginPath(); ctx.arc(bx, by, CFG.ballR * a, 0, Math.PI * 2); ctx.fill() }
            })
            for (const b of gs.balls) {
                ctx.fillStyle = '#e9f7ff'
                ctx.beginPath(); ctx.arc(b.x, b.y, CFG.ballR, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#fff'
                ctx.fillRect(b.x - 1, b.y - CFG.ballR, 2, 2)
            }
            const P = gs.paddle
            drawPaddle(P)

            for (const p of parts) {
                p.x += p.vx; p.y += p.vy; p.t++
                ctx.fillStyle = p.col
                if (p.t < 18) ctx.fillRect(p.x, p.y, 2, 2)
            }
            while (parts.length && parts[0].t >= 18) parts.shift()
            ctx.restore()

            ctx.fillStyle = 'rgba(0,0,0,0.16)'
            for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)

            text(String(gs.score).padStart(6, '0'), 34, 10, 9, '#ffd23f', 4)
            for (let i = 0; i < gs.lives; i++) { ctx.fillStyle = '#5dc8ff'; ctx.fillRect(2 + i * 7, H - 8, 5, 3) }
            if (!ROUNDS[gs.round].boss) text(`${gs.round + 1}-${ROUNDS[gs.round].name.replace('ROUND ', '')}`, W / 2, 10, 8, '#8fa3d8', 0)
            else text('DOH', W / 2, 10, 9, '#ff5d5d', 5)
            if (gs.power.laser === 1) text('LASER', W - 30, 10, 7, '#ff5db0', 3)
            if (gs.power.sticky === 1) text('CATCH', W - 30, 10, 7, '#5dff8f', 3)
            if (gs.power.multi > 1) text(`${gs.power.multi}x BALL`, W - 32, 18, 7, '#ffd23f', 3)
            if (toast > 0) { text(toastMsg, W / 2, H / 2 - 20, 10, '#e9f7ff', 6); toast-- }

            const sc = screenRef.current
            if (sc === 'attract') {
                ctx.fillStyle = 'rgba(3,3,12,0.62)'
                ctx.fillRect(0, 0, W, H)
                text('ARKANOID', W / 2, 76, 26, '#ff5db0', 12)
                text('BREAK THE WALLS — SLAY DOH', W / 2, 96, 8, '#8fa3d8', 0)
                if (Math.floor(gs.tick / 24) % 2 === 0) text('PRESS ANY KEY TO START', W / 2, 132, 9, '#ffd23f', 5)
                const b = board()[0]
                if (b) text(`HI-SCORE ${String(b.score).padStart(6, '0')}`, W / 2, 152, 8, '#5dc8ff', 3)
                text('DEMO PLAYS THE PROVEN FULL CLEAR', W / 2, H - 24, 7, '#5d7094', 0)
            }
            if (sc === 'over') {
                ctx.fillStyle = 'rgba(3,3,12,0.72)'
                ctx.fillRect(0, 0, W, H)
                text(gs.end === 'win' ? 'DOH IS NO MORE' : 'GAME OVER', W / 2, 88, 16, gs.end === 'win' ? '#5dff8f' : '#ff5d5d', 10)
                text(`SCORE ${String(gs.score).padStart(6, '0')}`, W / 2, 112, 10, '#ffd23f', 4)
                if (Math.floor(gs.tick / 24) % 2 === 0) text('PRESS ANY KEY', W / 2, 140, 9, '#e9f7ff', 4)
            }
        }

        // ---------------------------------------------------------------- loop ----
        const frame = (now) => {
            raf = requestAnimationFrame(frame)
            const dt = Math.min(now - last, 250)
            last = now
            if (pausedRef.current) return
            acc += dt
            while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS }
            draw()
            const h = hudRef.current
            if (h.score) h.score.textContent = String(gs.score).padStart(6, '0')
            if (h.lives) h.lives.textContent = String(gs.lives)
            if (h.round) h.round.textContent = ROUNDS[gs.round].name
        }

        // ---------------------------------------------------------------- input ----
        const startPlay = () => {
            gs = makeGame(0)
            setMode('play')
            say(ROUNDS[0].name)
            audioController.playSweep(330, 660, 0.2, 'square', 0.07)
        }
        const onKeyDown = (ev) => {
            if (ev.code === 'ArrowLeft') keys.l = true
            if (ev.code === 'ArrowRight') keys.r = true
            if (ev.code === 'Space') { keys.f = true; keys.fEdge = true }
            if (ev.code === 'Escape' || ev.code === 'Backquote') { ev.preventDefault(); setPaused((p) => !p) }
            if (screenRef.current === 'attract') { startPlay(); return }
            if (screenRef.current === 'over' && performance.now() - overAtRef.current > 900) { startPlay(); return }
        }
        const onKeyUp = (ev) => {
            if (ev.code === 'ArrowLeft') keys.l = false
            if (ev.code === 'ArrowRight') keys.r = false
            if (ev.code === 'Space') keys.f = false
        }
        const onPad = (ev) => {
            const d = ev.detail
            if (!d) return
            keys.l = !!d.left; keys.r = !!d.right
            if (d.action) keys.fEdge = true
            if (screenRef.current === 'attract') startPlay()
        }
        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        window.addEventListener('virtualcontrols', onPad)

        // ------------------------------------------------------------- DEV hook ----
        if (import.meta.env.DEV) {
            window.__arkTest = {
                state: () => gs,
                hash: () => stateHash(gs),
                step: (n = 1) => { for (let i = 0; i < n; i++) doSim({ l: false, r: false, fire: false }) },
                stepWith: (inp) => doSim(inp),
                setKeys: (k) => { keys.l = !!k.l; keys.r = !!k.r; if (k.f) keys.fEdge = true },
                plan: (seed = 0, opts) => plan(seed, opts),
                restart: () => { gs = makeGame(0) },
                setRound: (n) => { gs.round = n; gs.clearAt = 0; gs.bricks = []; const R = ROUNDS[n]; if (!R.boss) { let id = 0; for (let r = 0; r < R.rows.length; r++) for (let c = 0; c < R.rows[r].length; c++) { const ch = R.rows[r][c]; if (ch === '.') continue; gs.bricks.push({ id: id++, col: c, row: r, x: CFG.wallX + c * CFG.colW, y: CFG.ceilY + r * CFG.rowH, kind: ch === 'g' ? 'gold' : ch === 's' ? 'silver' : 'normal', hp: ch === 's' ? 3 : 1, alive: true, capsule: 'LSDCB+E'.includes(ch) ? ch : null }) } } },
                events: () => evLog,
                probe: () => ({
                    tick: gs.tick, screen: screenRef.current, score: gs.score, lives: gs.lives, round: gs.round,
                    hash: stateHash(gs), paddle: gs.paddle.x,
                    ball: gs.balls[0] ? { x: gs.balls[0].x, y: gs.balls[0].y, vx: gs.balls[0].vx, vy: gs.balls[0].vy, stuck: !!gs.balls[0].stuck } : null,
                }),
                gameTime: () => gs.tick / 60,
            }
            mountDbg('arkanoid')
        }

        last = performance.now()
        raf = requestAnimationFrame(frame)
        return () => {
            cancelAnimationFrame(raf)
            if (canvas.parentNode === wrap) wrap.removeChild(canvas)
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
            window.removeEventListener('virtualcontrols', onPad)
            if (import.meta.env.DEV) { unmountDbg('arkanoid'); delete window.__arkTest }
        }
    }, [setMode])

    useEffect(() => { pausedRef.current = paused }, [paused])

    const entry = GAMES.find((g) => g.label === 'ARKANOID')

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-[#050510] select-none">
            <div ref={stageRef} className="relative w-full max-w-[640px] aspect-[256/224] shadow-[0_0_40px_rgba(122,31,79,0.35)]" />
            <div className="flex gap-6 mt-2 text-[11px] font-mono tracking-widest text-[#8fa3d8]">
                <span>SCORE <span ref={setHud('score')} className="text-[#ffd23f]">000000</span></span>
                <span>ROUND <span ref={setHud('round')} className="text-[#e9f7ff]">ROUND 1</span></span>
                <span>LIVES <span ref={setHud('lives')} className="text-[#5dc8ff]">3</span></span>
            </div>
            <VirtualControls visible={screen === 'play' && !paused} />
            {paused && <PauseOverlay game={entry} onResume={() => setPaused(false)} />}
        </div>
    )
}

export default ArkanoidGame

// Q*BERT — the arcade shell over ./sim.js (the pure, audited simulation) and
// ./planner.js (the autopilot that scripts the attract demo). 256x224, the
// Gottlieb cabinet: starfield, the 28-cube iso pyramid, Coily, red balls,
// Ugg/Wrongway, Sam & Slick, flying discs and the "@!#?@!" balloon. The sim
// owns every rule; this file only paints and listens.
// Verify with `npm run qbertcheck` (Node, no browser).

import React, { useEffect, useRef, useState } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { makeGame, step, stateHash, cubeXY, id, ROWS, CUBES, neededCubes, W, H, FIXED_DT } from './sim.js'
import { plan } from './planner.js'
import { sfxFor } from './sound.js'
import {
    cubeSprite, cubeTopCol, cubeDarkCol, bertSprite, ballSprite, discSprite, DISC_FRAMES, DISC_R, DISC_RY,
    coilySprite, runnerSprite, slickSprite, tunnelSprite, text5, textWidth,
    paintBg, lifeGlyph, HW, HH,
    BALL_FRAMES, BALL_W,
} from './art.js'

const SIM_MS = FIXED_DT
// sim.js hops a red ball one cube per BALL_STEP ticks (b.stepT = 20); the render
// boings once per cube, keyed off that same step.
const BALL_STEP = 20

const QBertGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [finalInfo, setFinalInfo] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const setSc = (s) => { screenRef.current = s; setScreen(s) }

        const canvas = document.createElement('canvas')
        canvas.dataset.qbertStage = '1'
        canvas.width = W
        canvas.height = H
        canvas.className = 'block'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = null
        let demo = null
        let raf = 0, last = 0, acc = 0
        const held = { up: false, dn: false, lf: false, rt: false }
        let parts = []
        let popups = []
        let toast = 0, toastMsg = '', toastCol = '#f8d800'
        let shake = 0
        let flash = 0
        let topScore = 0
        try { topScore = Number(localStorage.getItem('arcade.qbert.top') || 0) || 0 } catch { /* private mode */ }

        const say = (m, c = '#f8d800') => { toastMsg = m; toast = 110; toastCol = c }

        const burst = (x, y, col, n = 12) => {
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2
                parts.push({ x, y, vx: Math.cos(a) * (0.6 + (i % 3) * 0.5), vy: Math.sin(a) * (0.6 + (i % 3) * 0.5) - 0.5, ttl: 26 + (i % 3) * 8, col })
            }
        }

        // The SFX table is the pure contract (sound.js), pinned by qbertcheck:
        // the shell is a dumb player and plays exactly what the table says.
        const playSfx = (e) => {
            for (const op of sfxFor(e)) {
                if (op.k === 'tone') audioController.playTone(op.f, op.d, op.type, op.v, op.at)
                else if (op.k === 'sweep') audioController.playSweep(op.f0, op.f1, op.d, op.type, op.v)
                else if (op.k === 'fanfare') audioController.playFanfare()
                else if (op.k === 'jingle') audioController.playDeath()
            }
        }

        const handleEvents = (s, audible) => {
            while (s.events.length) {
                const e = s.events.shift()
                if (e.t === 'points' && e.pts >= 50) popups.push({ x: e.x, y: e.y - 14, msg: `+${e.pts}`, ttl: 55 })
                if (e.t === 'death') { burst(e.x, e.y, '#f88000', 14); shake = 12; flash = 6 }
                if (e.t === 'snakelure') { burst(e.x, e.y, '#00c850', 10); popups.push({ x: e.x, y: e.y - 12, msg: '+500', ttl: 60 }) }
                if (e.t === 'clear') say(`ROUND ${e.level} CLEAR  +${e.bonus}`, '#58f878')
                if (!audible) continue
                playSfx(e)
            }
        }

        const finish = (s) => {
            if (!s.end) return
            if (s.total > topScore) {
                topScore = s.total
                try { localStorage.setItem('arcade.qbert.top', String(topScore)) } catch { /* private mode */ }
            }
            overAtRef.current = performance.now()
            setFinalInfo({ score: s.total, level: s.level, top: topScore })
            setSc('over')
        }

        const startPlay = () => {
            gs = makeGame({ seed: (Date.now() & 0xffff) | 1 })
            parts = []
            popups = []
            setFinalInfo(null)
            setSc('play')
            audioController.startMusic('qbert')
        }

        const buildDemo = () => { demo = makeGame({ seed: 0xbeef }) }

        // ------------------------------------------------------------ paint ----
        const bertPos = (s) => {
            const p = s.player
            if (p.ride) {
                const k = p.ride.t / 44
                return { x: p.ride.discX ?? W / 2, y: 26 - Math.sin(k * Math.PI) * 12 }
            }
            if (p.hop) {
                const k = p.hop.t / 12
                const to = cubeXY(p.hop.tr, p.hop.tc)
                return {
                    x: p.hop.x0 + (to.x - p.hop.x0) * k,
                    y: p.hop.y0 + (to.y - p.hop.y0) * k - Math.sin(k * Math.PI) * 10,
                }
            }
            return cubeXY(p.r, p.c)
        }

        const paintWorld = (s) => {
            const t = s.tick
            paintBg(ctx, W, H)
            ctx.drawImage(tunnelSprite(-1), cubeXY(6, 0).x - HW - 20, cubeXY(6, 0).y + 2)
            ctx.drawImage(tunnelSprite(1), cubeXY(5, ROWS[5] - 1).x + HW + 2, cubeXY(5, ROWS[5] - 1).y + 2)
            // discs
            for (const d of s.discs) ctx.drawImage(discSprite(Math.floor(t / 4) % DISC_FRAMES), Math.round(d.x - DISC_R), Math.round(d.y - (DISC_RY + 1)))
            // cubes back row to front
            const slickCubes = new Set()
            for (const sl of s.slicks) {
                slickCubes.add(id(sl.r, sl.c))
                for (const tr of sl.trail) slickCubes.add(tr.cube)
            }
            for (let r = 0; r < ROWS.length; r++) {
                for (let c = 0; c < ROWS[r]; c++) {
                    const i = id(r, c)
                    const checker = (r + c) % 2 === 0
                    const top = cubeTopCol(s.mode, s.colors[i], checker)
                    const dark = cubeDarkCol(s.mode, s.colors[i], checker)
                    const { x, y } = cubeXY(r, c)
                    ctx.drawImage(cubeSprite(top, dark), Math.round(x - HW), Math.round(y - HH))
                    if (slickCubes.has(i)) {
                        ctx.globalAlpha = 0.8
                        ctx.drawImage(slickSprite(), Math.round(x - HW), Math.round(y - HH))
                        ctx.globalAlpha = 1
                    }
                }
            }
            // snakes
            for (const sn of s.snakes) {
                const fr = Math.floor(t / 6) % 2
                const sp = coilySprite(fr)
                const yy = sn.enter > 0 ? cubeXY(0, 0).y - HH - sn.enter * 4 : sn.y - HH - 10
                ctx.drawImage(sp, Math.round(sn.x - 11), Math.round(yy))
            }
            // runners
            for (const u of s.runners) {
                const { y } = cubeXY(u.row, 0)
                ctx.drawImage(runnerSprite(u.kind, Math.floor(t / 5) % 2), Math.round(u.x - 11), Math.round(y - 4))
            }
            // red balls — one boing per cube (ballScale, pinned by qbertcheck). The
            // frame runs off the ball's own tick so the squash lands on each cube
            // impact (sim.js hops a ball one cube per BALL_STEP ticks).
            for (const b of s.balls) {
                const bf = Math.floor(((b.t % BALL_STEP) / BALL_STEP) * BALL_FRAMES) % BALL_FRAMES
                ctx.drawImage(ballSprite(bf), Math.round(b.x - BALL_W / 2), Math.round(b.y - 18))
            }
            // Q*BERT
            const p = s.player
            if (!(p.invuln > 0 && Math.floor(p.invuln / 4) % 2 === 0 && screenRef.current === 'play')) {
                const pose = p.dying > 0 ? 3 : p.hop ? (p.hop.tr < p.hop.fr ? 1 : 2) : 0
                const facing = p.facing
                const bp = bertPos(s)
                ctx.drawImage(bertSprite(pose, facing), Math.round(bp.x - 9), Math.round(bp.y - 14))
                if (p.dying > 0 && s.balloon) {
                    const bw = textWidth(s.balloon, 1) + 6
                    const bx = Math.round(bp.x - bw / 2), by = Math.round(bp.y - 30)
                    ctx.fillStyle = '#f8f8f8'
                    ctx.fillRect(bx, by, bw, 9)
                    pxTri(bx + bw / 2 - 2, by + 9)
                    text5(ctx, s.balloon, bx + 3, by + 2, '#101010', 1)
                }
            }
        }

        const pxTri = (x, y) => {
            ctx.fillStyle = '#f8f8f8'
            ctx.beginPath()
            ctx.moveTo(x, y); ctx.lineTo(x + 4, y); ctx.lineTo(x + 2, y + 3)
            ctx.closePath(); ctx.fill()
        }

        const paintHud = (s) => {
            text5(ctx, String(s.score).padStart(6, '0'), 4, 3, '#f8f8f8', 1)
            text5(ctx, `TOP ${String(Math.max(topScore, s.total)).padStart(6, '0')}`, 4, 11, '#787878', 1)
            const lv = `ROUND ${s.level}`
            text5(ctx, lv, W / 2 - textWidth(lv, 1) / 2, 3, '#f8d800', 1)
            const left = 28 - neededCubes(s).length
            const pr = `${left}/28`
            text5(ctx, pr, W / 2 - textWidth(pr, 1) / 2, 11, '#58d8f8', 1)
            for (let i = 0; i < s.lives; i++) lifeGlyph(ctx, W - 8 - (i + 1) * 9, 3)
        }

        const paint = () => {
            ctx.save()
            if (shake > 0) {
                ctx.translate(((shake * 7919) % 5) - 2, ((shake * 104729) % 5) - 2)
                shake--
            }
            ctx.fillStyle = '#000'
            ctx.fillRect(-4, -4, W + 8, H + 8)
            const s = screenRef.current === 'attract' ? demo : gs
            if (!s) { ctx.restore(); return }
            paintWorld(s)
            paintHud(s)
            parts = parts.filter((p) => p.ttl > 0)
            for (const p of parts) {
                p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.ttl--
                ctx.fillStyle = p.col
                ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2)
            }
            popups = popups.filter((p) => p.ttl > 0)
            for (const p of popups) {
                p.y -= 0.3; p.ttl--
                text5(ctx, p.msg, p.x - textWidth(p.msg, 1) / 2, p.y, p.ttl > 20 ? '#f8f8f8' : '#787878', 1)
            }
            if (flash > 0) {
                ctx.fillStyle = `rgba(248,128,0,${flash / 20})`
                ctx.fillRect(0, 0, W, H)
                flash--
            }
            if (s.pending && screenRef.current !== 'over') {
                const b = 'ROUND CLEAR!'
                text5(ctx, b, W / 2 - textWidth(b, 2) / 2, 96, '#58f878', 2)
            }
            if (toast > 0) {
                text5(ctx, toastMsg, W / 2 - textWidth(toastMsg, 2) / 2, 118, toastCol, 2)
                toast--
            }
            ctx.restore()
        }

        // ----------------------------------------------------------- frame ----
        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (pausedRef.current) return
            acc += ft
            while (acc >= SIM_MS) {
                acc -= SIM_MS
                const input = {
                    ul: held.up && held.lf,
                    ur: held.up && held.rt,
                    dl: held.dn && held.lf,
                    dr: held.dn && held.rt,
                }
                if (screenRef.current === 'attract' && demo) {
                    step(demo, plan(demo))
                    if (demo.end || (demo.pending && demo.pending.t <= 0)) buildDemo()
                    handleEvents(demo, false)
                } else if (screenRef.current === 'play' && gs && !gs.end) {
                    step(gs, input)
                    handleEvents(gs, true)
                    finish(gs)
                }
            }
            paint()
        }

        // ------------------------------------------------------------ input ----
        const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') {
                if (screenRef.current === 'play') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }
                return
            }
            if (ARROWS.includes(code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 800) return
                if (code === 'Enter' || code === 'KeyR' || code === 'Space') { startPlay(); return }
                setSc('attract'); return
            }
            if (pausedRef.current) return
            if (code === 'ArrowUp') held.up = true
            else if (code === 'ArrowDown') held.dn = true
            else if (code === 'ArrowLeft') held.lf = true
            else if (code === 'ArrowRight') held.rt = true
        }
        const onUp = (e) => {
            if (e.code === 'ArrowUp') held.up = false
            else if (e.code === 'ArrowDown') held.dn = false
            else if (e.code === 'ArrowLeft') held.lf = false
            else if (e.code === 'ArrowRight') held.rt = false
        }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 800) return
                startPlay()
            }
        }

        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const s = Math.max(1, Math.floor(Math.min((r.width - 8) / W, (r.height - 60) / H)))
            canvas.style.width = `${W * s}px`
            canvas.style.height = `${H * s}px`
        }
        window.addEventListener('resize', resize)

        buildDemo()
        resize()
        raf = requestAnimationFrame(frame)

        // ------------------------------------------------------- DEV hook ----
        if (import.meta.env.DEV) {
            const live = () => (screenRef.current === 'attract' ? demo : gs)
            window.__qbertTest = {
                probe: () => {
                    const s = live()
                    const bp = bertPos(s)
                    return {
                        screen: screenRef.current,
                        level: s.level, mode: s.mode, score: s.score, lives: s.lives, flips: s.flips,
                        needed: neededCubes(s).length,
                        cubes: CUBES.map((i) => s.colors[i]).join(''),
                        r: s.player.r, c: s.player.c, px: Math.round(bp.x), py: Math.round(bp.y),
                        hop: !!s.player.hop, ride: !!s.player.ride, dying: s.player.dying,
                        balloon: s.balloon,
                        snakes: s.snakes.map((sn) => ({ r: sn.r, c: sn.c, x: Math.round(sn.x), y: Math.round(sn.y) })),
                        balls: s.balls.map((b) => ({ r: b.r, c: b.c, x: Math.round(b.x), y: Math.round(b.y) })),
                        runners: s.runners.map((u) => ({ row: u.row, x: Math.round(u.x) })),
                        slicks: s.slicks.map((sl) => ({ r: sl.r, c: sl.c })),
                        discs: s.discs.map((d) => ({ x: Math.round(d.x), y: d.y })),
                        pending: !!s.pending, over: !!s.end, tick: s.tick, topScore,
                        hash: stateHash(s),
                    }
                },
                start: () => startPlay(),
                hash: () => (gs ? stateHash(gs) : 0),
                gameTime: () => (gs ? gs.tick / 60 : 0),
                simSleep: (secs) => new Promise((res) => {
                    const target = gs ? gs.tick + Math.round(secs * 60) : 0
                    const iv = setInterval(() => {
                        if (!gs || gs.tick >= target || screenRef.current !== 'play') { clearInterval(iv); res() }
                    }, 16)
                }),
                place: (r, c) => {
                    if (!gs || gs.end) return false
                    gs.player.r = r; gs.player.c = c; gs.player.hop = null; gs.player.ride = null; gs.player.invuln = 0
                    return true
                },
                placeSnake: (r, c) => {
                    if (!gs || gs.end) return false
                    gs.snakes.push({ r, c, enter: 0, dropT: 30, x: cubeXY(r, c).x, y: cubeXY(r, c).y })
                    return true
                },
                calm: () => {
                    if (!gs) return false
                    gs.snakes = []; gs.balls = []; gs.runners = []; gs.slicks = []
                    gs.ballTimer = 1e9; gs.runnerTimer = 1e9; gs.slickTimer = 1e9; gs.nextSnakeAt = 1e9
                    return true
                },
                placeBall: (r, c) => {
                    if (!gs || gs.end) return false
                    gs.balls.push({ side: c === 0 ? -1 : 1, r, c, t: 0, stepT: 999, x: cubeXY(r, c).x, y: cubeXY(r, c).y })
                    return true
                },
                placeDisc: (x) => {
                    if (!gs || gs.end) return false
                    gs.discs[0].x = x
                    return true
                },
                setColors: () => {
                    if (!gs || gs.end) return false
                    for (let i = 0; i < 64; i++) gs.colors[i] = 1
                    return true
                },
            }
            mountDbg({
                title: 'Q*BERT',
                getState: () => gs ? [
                    `round=${gs.level} mode=${gs.mode} score=${gs.score} tick=${gs.tick} end=${gs.end || '-'}`,
                    `@${gs.player.r},${gs.player.c} up=${gs.player.upChain} lives=${gs.lives} flips=${gs.flips} needed=${neededCubes(gs).length}`,
                    `snakes=${gs.snakes.map((s) => `${s.r},${s.c}`).join(' ')} balls=${gs.balls.length} runners=${gs.runners.length} slicks=${gs.slicks.length}`,
                ] : ['no game'],
                actions: [
                    { label: 'START', run: () => { startPlay(); return 'one bird' } },
                    { label: 'ALL GREEN BUT APEX', run: () => {
                        if (!gs || gs.end || screenRef.current !== 'play') return 'no live round'
                        for (let i = 0; i < 64; i++) gs.colors[i] = gs.mode === 1 ? 1 : 0
                        return 'one hop from clearing the round'
                    } },
                    { label: 'DROP COILY', run: () => {
                        if (!gs || gs.end || screenRef.current !== 'play') return 'no live round'
                        if (gs.snakes.length >= 3) return 'pyramid already infested'
                        gs.snakes.push({ r: 0, c: 0, enter: 0, dropT: 40, x: cubeXY(0, 0).x, y: cubeXY(0, 0).y })
                        return 'coily lands at the apex'
                    } },
                    { label: 'NEXT ROUND', run: () => {
                        if (!gs || gs.end || gs.pending) return 'busy'
                        gs.pending = { t: 4 }
                        return 'round advance armed'
                    } },
                ],
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__qbertTest) delete window.__qbertTest; unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('pointerdown', onPointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            audioController.stopMusic()
            canvas.remove()
        }
    }, [])

    const handleResume = () => { setPaused(false); pausedRef.current = false }
    const play = screen === 'play'

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            {screen === 'attract' && (
                <div className="absolute inset-x-0 bottom-8 text-center pointer-events-none px-6">
                    <p className="text-yellow-300 font-mono font-bold mt-1 animate-pulse text-sm">PRESS ANY KEY / TAP TO HOP</p>
                    <p className="text-white/70 font-mono text-[11px] mt-1 leading-4">
                        arrow pairs hop the diagonals: UP+LEFT, UP+RIGHT, DOWN+LEFT, DOWN+RIGHT &middot; touch pad on phones<br />
        land on every cube to turn the pyramid green; hop off an edge and you fall<br />
                        Coily drops in after 9 flips and hops straight at you &mdash; the discs carry you to the top, and he follows, off the edge (+500)<br />
                        red balls ricochet the sides; Ugg and Wrongway run the rows; Sam &amp; Slick wipe your green away<br />
                        rounds after the first cycle five colours &mdash; clear it when every cube matches<br />
                        this demo is the autopilot that scripts/qbertcheck.mjs audits, live
                    </p>
                </div>
            )}

            {screen === 'over' && finalInfo && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-cyan-100 font-mono px-6">
                    <h2 className="text-4xl font-black mb-2 text-red-400" style={{ textShadow: '3px 3px 0 #000' }}>GAME OVER</h2>
                    <p className="text-lg">{String(finalInfo.score).padStart(6, '0')}</p>
                    <p className="text-sm text-cyan-300/80 mb-4">TOP {String(finalInfo.top).padStart(6, '0')} &middot; fell on round {finalInfo.level}</p>
                    <p className="text-sm text-cyan-100/80 mb-2">ENTER / R runs it back</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'Q*BERT')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} diag />
        </div>
    )
}

export default QBertGame

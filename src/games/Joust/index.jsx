// JOUST — the arcade shell over ./sim.js (the pure, audited simulation) and
// ./planner.js (the autopilot that scripts the attract demo). 256x224, the
// cabinet frame: sky gradient, stone ledges over lava, troll hands, five
// waves. Keyboard and touch share one code path; the sim owns physics, the
// joust rule and the egg chain — this file only paints and listens.
// Verify with `npm run joustcheck` (Node, no browser).

import React, { useEffect, useRef, useState } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { rumble } from '../../components/gamepadMap'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import { makeGame, step, stateHash, WAVES, LAVA_TOP, GROUND_Y, FIXED_DT } from './sim.js'
import { plan } from './planner.js'
import { SFX } from './sounds.js'
import { riderSprite, eggSprite, handSprite, stoneTile, text5, textWidth, paintSky, paintLava, lifeGlyph } from './art.js'

const SIM_MS = FIXED_DT
const W = 256, H = 224

const JoustGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [finalInfo, setFinalInfo] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const playersRef = useRef(1)

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const setSc = (s) => { screenRef.current = s; setScreen(s) }

        const canvas = document.createElement('canvas')
        canvas.dataset.joustStage = '1'
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
        let contractSeed = 0
        let raf = 0, last = 0, acc = 0
        let keys = { l: false, r: false, f: false, l2: false, r2: false, f2: false }
        let parts = []
        let popups = []
        let toast = 0, toastMsg = '', toastCol = '#f8d800'
        let shake = 0
        let flash = 0
        let topScore = 0
        try { topScore = Number(localStorage.getItem('arcade.joust.top') || 0) || 0 } catch { /* private mode */ }

        const say = (m, c = '#f8d800') => { toastMsg = m; toast = 110; toastCol = c }

        // the sound table (sounds.js) maps each event class to a recipe of
        // voices; play them in order. No inline audio params in here — the
        // timbres are pinned in scripts/joustcheck.mjs.
        const playSfx = (id) => {
            const recipe = SFX[id]
            if (!recipe) return
            for (const v of recipe) {
                if (v.k === 'tone') audioController.playTone(v.f, v.d, v.w, v.v)
                else if (v.k === 'sweep') audioController.playSweep(v.f0, v.f1, v.d, v.w, v.v)
                else if (v.k === 'noise') audioController.playNoise(v.d, v.v)
                else if (v.k === 'fanfare') audioController.playFanfare()
                else if (v.k === 'death') audioController.playDeath()
            }
        }

        const burst = (x, y, col, n = 12) => {
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2
                parts.push({ x, y, vx: Math.cos(a) * (0.6 + (i % 3) * 0.5), vy: Math.sin(a) * (0.6 + (i % 3) * 0.5) - 0.4, ttl: 26 + (i % 3) * 8, col })
            }
        }

        const handleEvents = (s, audible) => {
            while (s.events.length) {
                const e = s.events.shift()
                if (e.t === 'kill' || e.t === 'joustwin' || e.t === 'hatch' || e.t === 'eggdrop' || e.t === 'eggget' || e.t === 'crumble' || e.t === 'death') {
                    if (e.t === 'death') { burst(e.x, e.y, '#f8f8f8', 16); shake = 14; flash = 8; rumble(400, 1) }
                    if (e.t === 'kill' || e.t === 'joustwin') burst(e.x, e.y, e.kind === 'shadow' ? '#7058b8' : '#f8a800')
                    if (e.t === 'hatch') burst(e.x, e.y, '#f8f800', 8)
                    if (e.t === 'eggget') burst(e.x, e.y, '#58d8f8', 8)
                    if (e.t === 'crumble') burst(e.x, e.y, '#8898a8', 10)
                    if (e.pts) popups.push({ x: e.x, y: e.y, msg: `+${e.pts}`, ttl: 50 })
                }
                if (!audible) continue
                const sfx = e.t === 'joustwin' ? 'joust'
                    : e.t === 'kill' && e.cause === 'terrain' ? 'smite'
                    : e.t === 'death' ? 'death'
                    : e.t === 'eggget' ? 'egg-get'
                    : e.t === 'eggdrop' ? 'egg-drop'
                    : e.t === 'hatch' ? 'hatch'
                    : e.t === 'crumble' ? 'crumble'
                    : e.t === 'clear' ? 'clear'
                    : e.t === '1up' ? 'oneup'
                    : e.t === 'over' ? 'over'
                    : e.t === 'win' ? 'win'
                    : null
                if (sfx) playSfx(sfx)
                if (e.t === 'clear') { if (e.perfect) say('PERFECT! BONUS ' + e.bonus, '#58f878'); else say('WAVE CLEAR +' + e.bonus) }
                else if (e.t === 'wave') say(e.name, '#00e8f8')
                else if (e.t === 'win') say('THE REALMS ARE YOURS!', '#f8d800')
            }
        }

        const finish = (s) => {
            if (!s.end) return
            if (s.total > topScore) {
                topScore = s.total
                try { localStorage.setItem('arcade.joust.top', String(topScore)) } catch { /* private mode */ }
            }
            overAtRef.current = performance.now()
            setFinalInfo({ score: s.total, wave: s.wave, win: s.end === 'win', p2: s.players.length === 2, s1: s.players[0].score, s2: s.players[1] ? s.players[1].score : 0, top: topScore })
            setSc('over')
        }

        const startPlay = (players = 1) => {
            playersRef.current = players
            gs = makeGame({ players })
            parts = []
            popups = []
            setFinalInfo(null)
            setSc('play')
            audioController.startMusic('joust')
        }

        const buildDemo = () => { demo = makeGame({ players: 1 }) }

        // ------------------------------------------------------------ paint ----
        const drawRider = (rd, kind, isP2) => {
            if (!rd || rd.state === 'dead') return
            if (rd.invuln > 0 && Math.floor(rd.invuln / 4) % 2 === 0 && screenRef.current === 'play') return
            const frame = rd.onGround ? 1 : (rd.flapT > 0 ? (Math.floor(rd.flapT / 3) % 2 === 0 ? 0 : 2) : 1)
            const sp = riderSprite(kind, frame)
            ctx.save()
            ctx.translate(Math.round(rd.x), Math.round(rd.y))
            ctx.rotate(rd.a)
            if (rd.vx < -0.05) ctx.scale(-1, 1)
            ctx.drawImage(sp, -sp.width / 2, -(sp.height / 2 + 8), sp.width, sp.height)
            void isP2
            ctx.restore()
        }

        const paintWorld = (s) => {
            const t = s.tick
            paintSky(ctx, W, H, GROUND_Y + 10, t)
            // lava wells: gaps between ground segs
            const pits = []
            let cursor = 0
            const grounds = s.segs.filter((g) => !g.gone && g.y === GROUND_Y).sort((x, y) => x.x0 - y.x0)
            for (const g of grounds) {
                if (g.x0 > cursor) pits.push([cursor, g.x0])
                cursor = Math.max(cursor, g.x1)
            }
            if (cursor < W) pits.push([cursor, W])
            for (const [x0, x1] of pits) paintLava(ctx, x0, x1, LAVA_TOP, H, t)
            // hands rising from the wells
            const hand = handSprite()
            for (const h of s.hands) {
                if (h.y < LAVA_TOP + 6) ctx.drawImage(hand, Math.round(h.x - hand.width / 2), Math.round(h.y - 4))
            }
            // slabs
            for (const g of s.segs) {
                if (g.gone) continue
                const crumbled = g.crumble && g.rideT > 40
                for (let x = g.x0; x < g.x1; x += 16) {
                    const w = Math.min(16, g.x1 - x)
                    ctx.drawImage(stoneTile(crumbled, g.y < LAVA_TOP && g.crumble ? g.rideT / 100 : 0), x, g.y, w, 8)
                }
            }
            // eggs
            for (const e of s.eggs) {
                ctx.drawImage(eggSprite(e.kind === 'bounder' ? 'bounder' : e.kind === 'hunter' ? 'hunter' : 'shadow', e.timer < 90), Math.round(e.x - 6), Math.round(e.y - 7))
            }
            // enemy riders
            for (const e of s.riders) drawRider(e, e.kind, false)
            // players
            for (const p of s.players) drawRider(p.rider, p.id === 0 ? 'p1' : 'p2', p.id === 1)
        }

        const paintHud = (s) => {
            const p1 = s.players[0]
            text5(ctx, 'PLAYER 1', 4, 3, '#38b8f8', 1)
            text5(ctx, String(p1.score).padStart(6, '0'), 4, 10, '#f8f8f8', 1)
            for (let i = 0; i < p1.lives; i++) lifeGlyph(ctx, 4 + i * 10, 19, '#b858f8')
            if (s.players.length === 2) {
                const p2 = s.players[1]
                text5(ctx, 'PLAYER 2', W - 4 - textWidth('PLAYER 2', 1), 3, '#58f878', 1)
                text5(ctx, String(p2.score).padStart(6, '0'), W - 4 - textWidth('000000', 1), 10, '#f8f8f8', 1)
                for (let i = 0; i < p2.lives; i++) lifeGlyph(ctx, W - 4 - (i + 1) * 10, 19, '#28a858')
            }
            const wt = `W${s.wave + 1}`
            text5(ctx, wt, W / 2 - textWidth(wt, 1) / 2, 3, '#f8d800', 1)
            text5(ctx, `TOP ${String(Math.max(topScore, s.total)).padStart(6, '0')}`, W / 2 - textWidth('TOP 000000', 1) / 2, 10, '#787878', 1)
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
            // particles
            parts = parts.filter((p) => p.ttl > 0)
            for (const p of parts) {
                p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.ttl--
                ctx.fillStyle = p.col
                ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2)
            }
            // score popups
            popups = popups.filter((p) => p.ttl > 0)
            for (const p of popups) {
                p.y -= 0.3; p.ttl--
                text5(ctx, p.msg, p.x - textWidth(p.msg, 1) / 2, p.y, p.ttl > 20 ? '#f8f8f8' : '#787878', 1)
            }
            if (flash > 0) {
                ctx.fillStyle = `rgba(248,56,0,${flash / 24})`
                ctx.fillRect(0, 0, W, H)
                flash--
            }
            // wave banner
            if (s.phase === 'banner' && !s.pending && screenRef.current !== 'over') {
                const b = WAVES[s.wave].name
                text5(ctx, b, W / 2 - textWidth(b, 3) / 2, 90, '#00e8f8', 3)
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
            if (contractHoldsLoop()) { acc = 0 }
            else {
                acc += ft
                while (acc >= SIM_MS) {
                    acc -= SIM_MS
                    if (screenRef.current === 'attract' && demo) {
                        step(demo, plan(demo))
                        if (demo.end) buildDemo()
                        handleEvents(demo, false)
                    } else if (screenRef.current === 'play' && gs && !gs.end) {
                        step(gs, { ...keys })
                        handleEvents(gs, true)
                        finish(gs)
                    }
                }
            }
            paint()
        }

        // ------------------------------------------------------------ input ----
        const FLAP = new Set(['Space', 'ArrowUp', 'KeyX'])
        const P2_FLAP = new Set(['KeyW', 'KeyF'])
        const P2_ROT = ['KeyA', 'KeyD']
        const digits = (code) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : null)

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') {
                if (screenRef.current === 'play') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }
                return
            }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') {
                const d = digits(code)
                startPlay(d === '2' ? 2 : 1)
                return
            }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 800) return
                if (code === 'Enter' || code === 'KeyR' || code === 'Space') { startPlay(playersRef.current); return }
                setSc('attract'); return
            }
            if (pausedRef.current) return
            if (code === 'ArrowLeft') keys.l = true
            else if (code === 'ArrowRight') keys.r = true
            else if (FLAP.has(code)) keys.f = true
            else if (code === P2_ROT[0]) keys.l2 = true
            else if (code === P2_ROT[1]) keys.r2 = true
            else if (P2_FLAP.has(code)) keys.f2 = true
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.l = false
            else if (e.code === 'ArrowRight') keys.r = false
            else if (FLAP.has(e.code)) keys.f = false
            else if (e.code === P2_ROT[0]) keys.l2 = false
            else if (e.code === P2_ROT[1]) keys.r2 = false
            else if (P2_FLAP.has(e.code)) keys.f2 = false
        }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(1); return }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 800) return
                startPlay(playersRef.current)
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
            window.__joustTest = {
                probe: () => {
                    const s = screenRef.current === 'attract' ? demo : gs
                    return {
                        screen: screenRef.current,
                        wave: s.wave, score: s.total, over: !!s.end, tick: s.tick,
                        phase: s.phase, players: s.players.length,
                        p1: { score: s.players[0].score, lives: s.players[0].lives, x: s.players[0].rider ? Math.round(s.players[0].rider.x) : null, y: s.players[0].rider ? Math.round(s.players[0].rider.y) : null, onGround: s.players[0].rider ? s.players[0].rider.onGround : null },
                        foes: s.riders.filter((r) => r.state !== 'dead').length,
                        eggs: s.eggs.length,
                        hash: stateHash(s), topScore,
                    }
                },
                start: (players = 1) => startPlay(players),
                hash: () => (gs ? stateHash(gs) : 0),
                place: (x, y) => {
                    const rd = gs && gs.players[0].rider
                    if (rd && rd.state === 'alive') Object.assign(rd, { x, y, vx: 0, vy: 1, a: 0, invuln: 0, onGround: false })
                    return !!rd
                },
                gameTime: () => (gs ? gs.tick / 60 : 0),
                simSleep: (secs) => new Promise((res) => {
                    const target = gs ? gs.tick + Math.round(secs * 60) : 0
                    const iv = setInterval(() => {
                        if (!gs || gs.tick >= target || screenRef.current !== 'play') { clearInterval(iv); res() }
                    }, 16)
                }),
            }
            mountDbg({
                title: 'JOUST',
                getState: () => gs ? [
                    `wave=${gs.wave + 1} total=${gs.total} tick=${gs.tick} phase=${gs.phase} end=${gs.end || '-'}`,
                    gs.players.map((p) => `P${p.id + 1} score=${p.score} lives=${p.lives} out=${p.out} ${p.rider ? `@${Math.round(p.rider.x)},${Math.round(p.rider.y)} a=${p.rider.a.toFixed(2)} g=${p.rider.onGround} st=${p.rider.state}` : 'gone'}`).join('\n'),
                    `foes=${gs.riders.filter((r) => r.state !== 'dead').length} eggs=${gs.eggs.length} hands=${gs.hands.map((h) => Math.round(h.y)).join(',')} segsGone=${gs.segs.filter((s) => s.gone).length}`,
                ] : ['no game'],
                actions: [
                    { label: '1P', run: () => { startPlay(1); return 'one rider' } },
                    { label: '2P', run: () => { startPlay(2); return 'two riders' } },
                    { label: 'SMITE FOES', run: () => {
                        if (!gs || gs.end || screenRef.current !== 'play') return 'no live wave'
                        let n = 0
                        for (const e of gs.riders) if (e.state !== 'dead') { e.state = 'dead'; gs.killsThisWave++; n++ }
                        return `smote ${n} (no eggs — the ledger pauses)`
                    } },
                    { label: 'NEXT WAVE', run: () => {
                        if (!gs || gs.end || gs.pending) return 'busy'
                        gs.pending = { reason: 'wave', t: 2 }
                        return 'wave advance armed'
                    } },
                    { label: 'CRUMBLE L0', run: () => {
                        if (!gs || !gs.segs.some((s) => s.crumble)) return 'no crumble ledge this wave'
                        const s = gs.segs.find((x) => x.crumble && !x.gone)
                        if (!s) return 'ledges already down'
                        s.gone = true
                        return `ledge ${s.x0}-${s.x1} dropped`
                    } },
                ],
            })
            exposeGame({
                id: 'joust',
                buttons: ['left', 'right', 'a'],
                reset: (seed) => {
                    contractSeed = seed >>> 0
                    playersRef.current = 1
                    gs = makeGame({ players: 1 })
                    parts = []; popups = []
                    keys = { l: false, r: false, f: false, l2: false, r2: false, f2: false }
                    toast = 0; shake = 0; flash = 0
                    setSc('play')
                },
                tick: (pad) => {
                    if (gs.end) { gs.tick += 1; return }
                    step(gs, { l: !!pad.left, r: !!pad.right, f: !!pad.a })
                    handleEvents(gs, false)
                },
                state: () => ({
                    tick: gs.tick, score: gs.total, done: !!gs.end,
                    seed: contractSeed, wave: gs.wave, eggsGot: gs.eggsGot,
                    p1: { score: gs.players[0].score, lives: gs.players[0].lives, out: gs.players[0].out },
                    hash: stateHash(gs),
                }),
                canvas: () => canvas,
                snapshot: () => JSON.parse(JSON.stringify(gs)),
                restore: (s) => { gs = s },
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__joustTest) delete window.__joustTest; unmountDbg(); unexposeGame() }
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
                    <p className="text-yellow-300 font-mono font-bold mt-1 animate-pulse text-sm">PRESS ANY KEY / TAP &mdash; PRESS 2 FOR TWO RIDERS</p>
                    <AttractMessage className="mt-1 text-white/70" messages={[
                        '← → turn · UP / X / SPACE beat the wings · momentum is real, the sky is wide',
                        '2P is a keyboard rider: A / D turn · W / F wings — the on-screen pad is P1 only',
                        'the lower lance loses a joust — meet a rider dead-even and you both fall',
                        'defeated riders drop eggs: touch one to bank it, leave it and it hatches into something worse',
                        'troll hands rise from the lava · five waves · the pterodactyl does not get a parachute',
                    ]} />
                </div>
            )}

            {screen === 'over' && finalInfo && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-cyan-100 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-2 ${finalInfo.win ? 'text-yellow-300' : 'text-red-400'}`} style={{ textShadow: '3px 3px 0 #000' }}>{finalInfo.win ? 'THE SKY IS YOURS' : 'GAME OVER'}</h2>
                    {finalInfo.p2 ? (
                        <p className="text-lg"><span className="text-sky-300">P1 {String(finalInfo.s1).padStart(6, '0')}</span> &middot; <span className="text-green-300">P2 {String(finalInfo.s2).padStart(6, '0')}</span></p>
                    ) : (
                        <p className="text-lg">{String(finalInfo.score).padStart(6, '0')}</p>
                    )}
                    <p className="text-sm text-cyan-300/80 mb-4">TOP {String(finalInfo.top).padStart(6, '0')} &middot; {finalInfo.win ? 'all five waves conquered' : `fell in wave ${finalInfo.wave + 1}`}</p>
                    <p className="text-sm text-cyan-100/80 mb-2">ENTER / R runs it back</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'JOUST')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default JoustGame

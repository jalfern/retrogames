import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { GAMES } from '../../config/games'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, contractHoldsLoop } from '../../utils/gameContract'
import { SHIP_SIZE, START_LIVES, makeRun, tickAsteroids, rebuildBoard, stateHash } from './sim.js'

// ASTEROIDS (#1473 batch 16) — the Feb port had no score, no lives and no
// terminal: the ship could not die and the field never refilled. Restored to
// the 1979 arcade law: 20/50/100 per rock size, 3 lives + one bonus life every
// 10,000, respawn grace, wave regen, GAME OVER with restart from any key,
// click or tap — and every die (shape, velocity, position) on one seeded
// stream honoring ?seed=N.
//
// #1637 batch 26 — the whole rule set lives in sim.js (tickAsteroids), and Y
// seats the proven crossing-hunter: watchStep replays the game's own physics
// per tick, so what you watch IS what asteroidscheck certifies. Any other key,
// pad push or tap takes over; watch never lingers past a new run.
const AsteroidsGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)
    // The React mirrors of gs.watching / gs.attract — the sim flag is truth,
    // chrome (pill, toast, attract ▶ WATCH) reads the mirror.
    const [watching, setWatching] = React.useState(false)
    const [attractUi, setAttractUi] = React.useState(true)

    // Resume callback
    const handleResume = () => {
        setPaused(false)
        pausedRef.current = false
        canvasRef.current?.focus()
    }

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        let animationFrameId

        // #1473 run state: one seeded stream; the world (ship, rocks, bullets,
        // score/lives/wave, terminal) is gs from sim.js. Respawn: dark for
        // RESPAWN_DELAY ticks, then a blinking INVULN_TICKS grace.
        let seed = Math.floor(Math.random() * 1000000)
        let gs = makeRun(seed, { attract: true })

        // Input Handling
        const keys = {
            ArrowUp: false,
            ArrowLeft: false,
            ArrowRight: false,
            Space: false
        }

        const seat = () => {
            gs.watching = true
            setWatching(true)
            playWatchStart()
        }
        const release = (blip = true) => {
            gs.watching = false
            setWatching(false)
            if (blip) playWatchStop()
        }

        // Fresh run: seed regenerated (?seed=N wins), whole board rebuilt.
        const startRun = () => {
            seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)
            gs = makeRun(seed, { width: gs.width, height: gs.height })
            keys.ArrowLeft = keys.ArrowRight = keys.ArrowUp = keys.Space = false
            setAttractUi(false)
            gs.watching = false // watch never lingers — a new run starts in your hands
            setWatching(false)
        }

        let initialized = false
        const resize = () => {
            if (containerRef.current && canvas) {
                const { width, height } = containerRef.current.getBoundingClientRect()
                const dpr = window.devicePixelRatio || 1
                canvas.width = width * dpr
                canvas.height = height * dpr
                canvas.style.width = `${width}px`
                canvas.style.height = `${height}px`
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
                gs.width = width
                gs.height = height
                if (!initialized && width > 0 && height > 0) {
                    rebuildBoard(gs) // first real dims: field + ship on them
                    initialized = true
                }
            }
        }
        window.addEventListener('resize', resize)
        resize()

        const overStarts = () => gs.over || gs.attract

        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return

            // WATCH (b24 law): Y toggles the hunter. On attract/game over it
            // starts a fresh run AND seats — the plan runs from tick 0.
            if (isWatchKey(e)) {
                if (gs.attract || gs.over) { startRun(); seat(); return }
                if (gs.watching) release(); else seat()
                return
            }

            if (overStarts()) { startRun(); return }
            if (Object.prototype.hasOwnProperty.call(keys, e.code)) {
                if (gs.watching && isTakeoverKey(e)) release()
                keys[e.code] = true
            }
        }
        const handleKeyUp = (e) => {
            if (Object.prototype.hasOwnProperty.call(keys, e.code)) {
                keys[e.code] = false
            }
        }
        // Phones: any tap starts or restarts the run; a tap DURING a watched
        // run is a takeover (the contract).
        const handleCanvasTap = () => {
            if (pausedRef.current) return
            if (overStarts()) startRun()
            else if (gs.watching) release()
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        canvas.addEventListener('pointerdown', handleCanvasTap)

        // ------------------------------------------------------------------
        // EVENTS — tickAsteroids stamps these; the shell keeps all sound so the
        // sim stays pure enough for Node to replay it.
        // ------------------------------------------------------------------
        // #2001 sound ladder — the machine's heartbeat: a two-tone bass thrum
        // whose tempo climbs as the field thins (danger = fewer rocks), and
        // the two-tone hover warble of any saucer on screen. Silent on
        // attract and at the terminal.
        let heartTick = 0
        let heartHi = false
        const applyEvents = (ev) => {
            if (ev.shot) audioController.playSweep(900 - ev.pitch * 250, 260, 0.09, 'sawtooth', 0.1)
            if (ev.smashed) audioController.playNoise(0.1, 0.1)
            if (ev.died) audioController.playNoise(0.4, 0.4)
            if (ev.wave) audioController.playSweep(300, 900, 0.5, 'sine')
            if (ev.saucerSpawn) audioController.playSweep(180, 640, 0.45, 'square', 0.06)
            if (ev.saucerShot) audioController.playTone(300, 0.05, 'square', 0.07)
            if (ev.saucerKilled) {
                audioController.playNoise(0.3, 0.3)
                audioController.playSweep(ev.saucerKilled === 'small' ? 700 : 400, 120, 0.25, 'square', 0.12)
            }
            if (!gs.attract && !gs.over) {
                heartTick++
                const beat = Math.max(22, 14 + gs.asteroids.length * 14)
                if (heartTick >= beat) {
                    heartTick = 0
                    audioController.playTone(heartHi ? 55 : 74, 0.09, 'sine', 0.25)
                    heartHi = !heartHi
                }
            } else {
                heartTick = 0
                heartHi = false
            }
            if (gs.saucers.length > 0 && gs.tickN % 8 === 0) {
                audioController.playTone(gs.tickN % 16 === 0 ? 560 : 470, 0.045, 'square', 0.05)
            }
            if (ev.over && !gs.attract && gs.watching) release(false) // the run ends in your hands (silent)
        }

        const heldInput = () => ({
            left: keys.ArrowLeft,
            right: keys.ArrowRight,
            thrust: keys.ArrowUp,
            fire: keys.Space,
        })

        let lastTime = 0
        let accumulator = 0
        const FIXED_DT = 1000 / 60
        const loop = (timestamp) => {
            if (!lastTime) lastTime = timestamp
            const frameTime = Math.min(timestamp - lastTime, 100)
            lastTime = timestamp
            if (!pausedRef.current) {
                // QA contract: while __game.step() drives the sim, the rAF loop
                // yields the clock so scripted ticks stay deterministic.
                if (!contractHoldsLoop()) {
                    accumulator += frameTime
                    while (accumulator >= FIXED_DT) {
                        // The watcher and the attract demo own the wheel; held
                        // keys only reach the tick when the human is driving.
                        const input = gs.attract || gs.watching ? null : heldInput()
                        applyEvents(tickAsteroids(gs, input))
                        accumulator -= FIXED_DT
                    }
                }
                draw()
            }
            animationFrameId = requestAnimationFrame(loop)
        }
        animationFrameId = requestAnimationFrame(loop)

        const draw = () => {
            // Clear (Black)
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, gs.width, gs.height)

            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 1.5

            // Draw Ship (hidden while dark; blinks through the respawn grace)
            const invulnBlink = gs.tickN < gs.invulnUntil && Math.floor(gs.tickN / 6) % 2 === 0
            if (gs.respawnAt < 0 && !invulnBlink) {
                ctx.save()
                ctx.translate(gs.ship.x, gs.ship.y)
                ctx.rotate(gs.ship.angle)
                ctx.beginPath()
                ctx.moveTo(SHIP_SIZE, 0)
                ctx.lineTo(-SHIP_SIZE / 2, SHIP_SIZE / 2)
                ctx.lineTo(-SHIP_SIZE / 2, -SHIP_SIZE / 2)
                ctx.closePath()
                ctx.stroke()
                ctx.restore()
            }

            // Draw Asteroids
            gs.asteroids.forEach(a => {
                ctx.save()
                ctx.translate(a.x, a.y)
                ctx.beginPath()
                a.vertices.forEach((v, i) => {
                    if (i === 0) ctx.moveTo(v.x, v.y)
                    else ctx.lineTo(v.x, v.y)
                })
                ctx.closePath()
                ctx.stroke()
                ctx.restore()
            })

            // Draw Saucers — wire-frame hull + dome (docs/ART.md: the original
            // draws them as a stacked ellipse with a cap, lines only).
            gs.saucers.forEach(s => {
                const r = s.big ? 22 : 12
                ctx.save()
                ctx.translate(s.x, s.y)
                ctx.beginPath()
                ctx.ellipse(0, 0, r, r * 0.42, 0, 0, Math.PI * 2)
                ctx.stroke()
                ctx.beginPath()
                ctx.ellipse(0, -r * 0.12, r * 0.45, r * 0.4, 0, Math.PI, Math.PI * 2)
                ctx.stroke()
                ctx.beginPath()
                ctx.moveTo(-r, 0)
                ctx.lineTo(r, 0)
                ctx.stroke()
                ctx.restore()
            })

            // Draw Bullets
            ctx.fillStyle = '#ffffff'
            gs.bullets.forEach(b => {
                ctx.fillRect(b.x - 1, b.y - 1, 3, 3)
            })

            // Draw Particles
            gs.particles.forEach(p => {
                ctx.globalAlpha = p.life
                ctx.fillRect(p.x, p.y, 2, 2)
                ctx.globalAlpha = 1.0
            })

            // HUD — score left, wave center, spare ships right (the arcade's
            // row of bow-ships, drawn as small triangles).
            if (!gs.attract) {
                ctx.fillStyle = '#ffffff'
                ctx.font = '14px monospace'
                ctx.textAlign = 'left'
                ctx.fillText(`SCORE ${gs.score}`, 10, 20)
                ctx.textAlign = 'center'
                ctx.fillText(`WAVE ${gs.wave}`, gs.width / 2, 20)
                for (let i = 0; i < Math.max(0, gs.lives - 1); i++) {
                    const bx = gs.width - 18 - i * 16
                    ctx.beginPath()
                    ctx.moveTo(bx, 10)
                    ctx.lineTo(bx - 6, 20)
                    ctx.lineTo(bx + 6, 20)
                    ctx.closePath()
                    ctx.stroke()
                }
            }

            // UI
            if (gs.attract) {
                ctx.fillStyle = '#ffffff'
                ctx.font = '20px monospace'
                ctx.textAlign = 'center'
                ctx.fillText("PRESS ANY KEY TO START", gs.width / 2, gs.height - 50)
                ctx.fillText("ATTRACT MODE", gs.width / 2, 50)
            }
            if (gs.over) {
                ctx.fillStyle = '#ffffff'
                ctx.textAlign = 'center'
                ctx.font = '22px monospace'
                ctx.fillText('GAME OVER', gs.width / 2, gs.height / 2 - 8)
                ctx.font = '14px monospace'
                ctx.fillText(`FINAL SCORE ${gs.score}`, gs.width / 2, gs.height / 2 + 14)
                if (Math.floor(gs.tickN / 30) % 2 === 0) {
                    ctx.font = '12px monospace'
                    ctx.fillText('PRESS ANY KEY TO PLAY AGAIN', gs.width / 2, gs.height / 2 + 36)
                }
            }
        }

        if (import.meta.env.DEV) {
            window.__asteroidsTest = {
                state: () => ({
                    attract: gs.attract, over: gs.over, score: gs.score, lives: gs.lives, wave: gs.wave,
                    shipX: gs.ship.x, shipY: gs.ship.y, angle: gs.ship.angle, rocks: gs.asteroids.length,
                }),
                // #1637 b26 — the watch contract the pilot drives against.
                watching: () => gs.watching,
                watchSfx: watchSfxLog,
                probe: () => ({
                    tick: gs.tickN, score: gs.score, wave: gs.wave, lives: gs.lives,
                    rocks: gs.asteroids.length, saucers: gs.saucers.length,
                    shipX: Math.round(gs.ship.x), shipY: Math.round(gs.ship.y),
                    alive: gs.respawnAt < 0,
                    attract: gs.attract, over: gs.over,
                }),
                start: startRun,
            }
            mountDbg({
                title: 'ASTEROIDS',
                getState: () => [
                    `score ${gs.score}  wave ${gs.wave}  lives ${gs.lives}  rocks ${gs.asteroids.length}`,
                    `ship ${Math.round(gs.ship.x)},${Math.round(gs.ship.y)} v${gs.ship.vx.toFixed(2)},${gs.ship.vy.toFixed(2)}  watching ${gs.watching}`,
                    `seed ${gs.seed}  tick ${gs.tickN}  over ${gs.over}`,
                ],
                actions: [
                    { label: 'Drop a rock on the ship', run: () => { gs.invulnUntil = 0; gs.respawnAt = -1; gs.asteroids.push({ x: gs.ship.x, y: gs.ship.y, vx: 0, vy: 0, size: 40, vertices: gs.asteroids[0] ? gs.asteroids[0].vertices : [] }) } },
                    { label: 'Clear field', run: () => { gs.asteroids = [] } },
                    { label: 'Fly a saucer', run: () => { gs.saucers.push({ big: true, x: -22, y: gs.height / 3, vx: 2.0, vy: 1.4, phase: 0, amp: 0, cooldown: 60, life: 900 }) } },
                ],
            })
        }

        // QA contract (#377)
        exposeGame({
            id: 'asteroids',
            buttons: ['left', 'right', 'up', 'a'],
            reset: (s) => {
                seed = s >>> 0
                gs = makeRun(seed, { width: gs.width, height: gs.height })
                keys.ArrowLeft = keys.ArrowRight = keys.ArrowUp = keys.Space = false
                setAttractUi(false)
                gs.watching = false // watch never lingers
                setWatching(false)
            },
            tick: (pad) => {
                applyEvents(tickAsteroids(gs, {
                    left: !!pad.left,
                    right: !!pad.right,
                    thrust: !!pad.up,
                    fire: !!pad.a,
                }))
            },
            state: () => ({
                tick: gs.tickN, score: gs.score, done: gs.over, seed: gs.seed, lives: gs.lives, wave: gs.wave,
                shipX: Math.round(gs.ship.x), shipY: Math.round(gs.ship.y),
                rocks: gs.asteroids.length, saucers: gs.saucers.length,
                hash: stateHash(gs),
            }),
            canvas: () => canvas,
            // snapshot/restore omitted: the seeded stream rides gs.rngState,
            // and JSON round-trips would drop the world identity mid-rollout (#391).
        })

        // production report carries the seed (#1473)
        exposeFeedbackState(() => ({
            tick: gs.tickN, score: gs.score, done: gs.over, seed: gs.seed, lives: gs.lives, wave: gs.wave,
        }))

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('resize', resize)
            canvas.removeEventListener('pointerdown', handleCanvasTap)
            cancelAnimationFrame(animationFrameId)
            if (import.meta.env.DEV && window.__asteroidsTest) delete window.__asteroidsTest
            unexposeGame()
            unexposeFeedbackState()
            unmountDbg()
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[3/4] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full" />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'ASTEROIDS')} onResume={handleResume} />}
                {/* #1654: the discoverable WATCH line, before the first Y press. */}
                {attractUi && !paused && (
                    <div className="absolute inset-x-0 z-[70] flex flex-col items-center gap-2 pointer-events-none" style={{ bottom: '24%' }}>
                        <div className="text-emerald-200/70 font-mono text-[11px] tracking-widest">{WATCH_ATTRACT_HINT}</div>
                        <AttractWatchButton />
                    </div>
                )}
                {/* #1637 b26 — the hunter clears the field; any key, pad push or tap takes over. */}
                {!attractUi && watching && <WatchToast className="fixed z-50" />}
                {!attractUi && !paused && (
                    <div className="fixed z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                        <WatchButton on={watching} />
                    </div>
                )}
            </div>
            <VirtualControls visible={!paused} />
        </div>
    )
}

export default AsteroidsGame

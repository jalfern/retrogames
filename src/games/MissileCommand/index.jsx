import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'
import { GAMES } from '../../config/games'
import { attractFrame, DIM } from './attract.js'
import { makeRun, tickMc, gunnerStep, fireAt, startWave, citiesAlive, attractFerry, SCREEN_WIDTH, SCREEN_HEIGHT, GROUND_Y } from './sim.js'
import { exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'

const MissileCommandGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)
    // WATCH (#1637 b29): the React mirrors of gs.watch — the sim flag is truth.
    const [watching, setWatching] = React.useState(false)
    const [attractUi, setAttractUi] = React.useState(true)
    const attractUiRef = useRef(true)
    // #1748 consumer: RotateHint (portrait + wide canvas) lands its card dead
    // center — exactly where this title's attract copy sits. This 4:3 letterbox
    // is the rare attract-pill collision, so the centered block steps aside
    // while the hint is up; the pill itself anchors top-right and stays
    // reachable through it.
    const [rotHint, setRotHint] = React.useState(false)
    const rotHintRef = useRef(false)

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

        // The whole world lives in sim.js now (b27-shape lift, #1637 b29):
        // makeRun/tickMc are wall-clock-free and fully seeded, so ?seed=N
        // replays the entire raid and the WATCH seat drives the SAME physics
        // the missilecmdcheck sweep certifies (waves 1-5 clean on 100 seeds).
        let gs = makeRun(Math.floor(Math.random() * 1000000))
        let attractTick = 0
        let armUntil = 0 // mouse-arming grace after a seat: pill taps (and the
                         // compat mousemove a touch leaves behind) must not
                         // instantly release the watcher they just seated
        const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false }

        const seat = () => {
            if (gs.state !== 'playing' || gs.over || gs.watch || attractUiRef.current) return
            gs.watch = true
            setWatching(true)
            armUntil = gs.tick + 30
            playWatchStart()
        }
        const release = (blip = true) => {
            if (!gs.watch) return
            gs.watch = false
            setWatching(false)
            if (blip) playWatchStop()
        }

        // ---------- attract ----------
        // The attract pilot keeps its old rough-shooting personality (it is a
        // screensaver, not the proof); the proof is gunnerStep in sim.js. The
        // wander clock rides the sim tick, not Date.now (#1525 hygiene).
        const attractCmd = () => {
            if (gs.state !== 'playing') return null
            const crosshair = gs.crosshair
            // #3638: the scripted ferry is the ad — the pilot leads it like an
            // expert (ABM ~15 px/t vs ferry ~2.2, so ~30 ticks of lead) and
            // takes it with its same rough-shooter finger.
            const ferry = gs.saucers.find((s) => !s.dead)
            if (ferry) {
                const leadX = ferry.x + ferry.dir * ferry.speed * 30
                const dx = leadX - crosshair.x
                const dy = ferry.y - crosshair.y
                crosshair.x += dx * 0.12
                crosshair.y += dy * 0.12
                if (gs.rand() < 0.03 && Math.abs(dx) < 40 && Math.abs(dy) < 24) {
                    return { aimX: leadX, aimY: ferry.y }
                }
                return null
            }
            let targetMissile = null
            let minHeight = Infinity
            gs.warheads.forEach((m) => {
                if (m.y < GROUND_Y && m.y < minHeight) {
                    targetMissile = m
                    minHeight = m.y
                }
            })
            if (targetMissile) {
                const leadX = targetMissile.x + Math.cos(Math.atan2(targetMissile.targetY - targetMissile.startX, targetMissile.targetX - targetMissile.startX)) * 50
                const leadY = targetMissile.y + Math.sin(Math.atan2(targetMissile.targetY - targetMissile.startY, targetMissile.targetX - targetMissile.startX)) * 50
                const dx = leadX - crosshair.x
                const dy = leadY - crosshair.y
                crosshair.x += dx * 0.1
                crosshair.y += dy * 0.1
                if (gs.rand() < 0.05 && Math.abs(dx) < 20 && Math.abs(dy) < 20) {
                    return { aimX: crosshair.x, aimY: crosshair.y }
                }
            } else {
                crosshair.x += (Math.sin(gs.tick * 0.06) * SCREEN_WIDTH / 2 + SCREEN_WIDTH / 2 - crosshair.x) * 0.01
                crosshair.y += (SCREEN_HEIGHT / 2 - crosshair.y) * 0.01
            }
            return null
        }

        // ---------- input ----------
        const handleMouseMove = (e) => {
            if (pausedRef.current) return
            if (gs.watch && gs.tick > armUntil) release() // the mouse is the yoke here
            const rect = canvas.getBoundingClientRect()
            const scaleX = SCREEN_WIDTH / rect.width
            const scaleY = SCREEN_HEIGHT / rect.height
            gs.crosshair.x = (e.clientX - rect.left) * scaleX
            gs.crosshair.y = (e.clientY - rect.top) * scaleY
        }

        // phones: a tap on the board starts/restarts the raid (rule: any tap);
        // a tap DURING a watched raid hands the crosshair back.
        const handleCanvasTap = () => {
            if (pausedRef.current) return
            if (attractUiRef.current || gs.over) { startRun(); return }
            if (gs.watch) release()
        }

        const handleClick = () => {
            if (pausedRef.current) return
            if (attractUiRef.current) { startRun(); return }
            if (gs.over) { startRun(); return }
            if (gs.watch) release() // a click means "I'm aiming now" — then it fires
            fireAt(gs, gs.crosshair.x, gs.crosshair.y)
        }

        // fresh raid: new seed (?seed=N wins), whole board rebuilt — called on
        // every human start, key, click or tap (#1473)
        const startRun = () => {
            gs = makeRun(seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000))
            attractUiRef.current = false
            setAttractUi(false)
            release(false) // watch never lingers — a new raid starts in your hands
            audioController.playSweep(220, 440, 0.15, 'square', 0.1)
        }

        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return
            if (isWatchKey(e)) {
                if (gs.watch) { e.preventDefault(); release() }
                else if (gs.over) { e.preventDefault(); startRun() } // Y is a key too — it restarts a dead board
                else if (!attractUiRef.current) { e.preventDefault(); seat() }
                return
            }
            if (gs.over) { startRun(); return }
            if (attractUiRef.current && (e.code === 'Space' || e.code === 'Enter')) { startRun(); return }
            if (gs.watch && isTakeoverKey(e)) release() // then the key drives for real below
            if (e.code in keys) keys[e.code] = true
            if (e.code === 'Space') fireAt(gs, gs.crosshair.x, gs.crosshair.y) // Fire
        }

        const handleKeyUp = (e) => {
            if (e.code in keys) keys[e.code] = false
        }

        const resize = () => {
            if (!canvas || !ctx || !containerRef.current) return
            const { width, height } = containerRef.current.getBoundingClientRect()
            const dpr = window.devicePixelRatio || 1
            canvas.width = width * dpr
            canvas.height = height * dpr
            canvas.style.width = `${width}px`
            canvas.style.height = `${height}px`
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            ctx.imageSmoothingEnabled = false
        }

        const init = () => {
            resize()
            window.addEventListener('keydown', handleKeyDown)
            window.addEventListener('keyup', handleKeyUp)
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mousedown', handleClick)
            window.addEventListener('resize', resize)
            canvas.addEventListener('pointerdown', handleCanvasTap)
            animationFrameId = requestAnimationFrame(loop)
        }

        // ---------- one fixed tick ----------
        const update = () => {
            if (pausedRef.current) return
            const cmd = attractUiRef.current ? attractCmd() : (gs.watch ? gunnerStep(gs) : null)
            const wasOver = gs.over
            tickMc(gs, cmd)
            // #3638 attract ad: after the tick so its announce event survives
            // tickMc's event reset (the warble plays on the live board).
            if (attractUiRef.current) attractFerry(gs)
            for (const ev of gs.events) {
                if (ev === 'pew') audioController.playTone(600, 0.05, 'triangle')
                else if (ev === 'boom') audioController.playTone(100, 0.2, 'noise', 0.5)
                // #3638 saucer mix pass — the warble is two-part and loud enough
                // to cut the wave-6 bed (was a single 0.07 sweep, buried under
                // pew/boom); cruise launches growl below the ICBM whistle; the
                // 125 kill layers a deep thud + long burst + rising chirps so it
                // reads BIGGER than a warhead boom — the game's own hierarchy.
                else if (ev === 'saucer') {
                    audioController.playSweep(300, 900, 0.18, 'sine', 0.16)
                    audioController.playSweep(900, 520, 0.2, 'sine', 0.12, null, 0.18)
                }
                else if (ev === 'cruisefire') audioController.playTone(180, 0.09, 'sawtooth', 0.15)
                else if (ev === 'saucerkill') {
                    audioController.playNoise(0.35, 0.65)
                    audioController.playTone(70, 0.3, 'square', 0.45)
                    audioController.playTone(920, 0.12, 'square', 0.14)
                    audioController.playTone(1240, 0.14, 'square', 0.12, 0.1)
                }
                // #3630 smart bombs — a nervous double-warble announces one,
                // and its kill crunches with a high interrogation ping.
                else if (ev === 'smart') {
                    audioController.playSweep(720, 300, 0.18, 'sawtooth', 0.06)
                    audioController.playTone(300, 0.05, 'square', 0.05)
                }
                else if (ev === 'smartkill') {
                    audioController.playNoise(0.18, 0.45)
                    audioController.playTone(740, 0.12, 'square', 0.09)
                    audioController.playTone(1180, 0.08, 'square', 0.06)
                }
            }
            if (gs.over && !wasOver) release(false) // the raid ends in your hands (silent)
        }

        // ---------- draw (the look is the game's own, verbatim) ----------
        const draw = () => {
            const dpr = window.devicePixelRatio || 1
            const scaleX = canvas.width / dpr / SCREEN_WIDTH
            const scaleY = canvas.height / dpr / SCREEN_HEIGHT
            const scale = Math.min(scaleX, scaleY) * 0.95

            const transX = (canvas.width / dpr - SCREEN_WIDTH * scale) / 2
            const transY = (canvas.height / dpr - SCREEN_HEIGHT * scale) / 2

            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, canvas.width, canvas.height)

            ctx.save()
            ctx.translate(transX, transY)
            ctx.scale(scale, scale)

            ctx.beginPath()
            ctx.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
            ctx.clip()

            ctx.fillStyle = '#ffff00' // Yellow ground line
            ctx.fillRect(0, GROUND_Y, SCREEN_WIDTH, 5)

            ctx.fillStyle = '#0000ff' // Blue cities
            gs.cities.forEach((c) => {
                if (c.alive) {
                    ctx.beginPath()
                    ctx.moveTo(c.x - 15, GROUND_Y)
                    ctx.lineTo(c.x - 15, GROUND_Y - 10)
                    ctx.lineTo(c.x - 5, GROUND_Y - 10)
                    ctx.lineTo(c.x, GROUND_Y - 20)
                    ctx.lineTo(c.x + 5, GROUND_Y - 10)
                    ctx.lineTo(c.x + 15, GROUND_Y - 10)
                    ctx.lineTo(c.x + 15, GROUND_Y)
                    ctx.fill()
                }
            })

            ctx.fillStyle = '#aaaaaa'
            gs.silos.forEach((s) => {
                if (s.alive) {
                    ctx.beginPath()
                    ctx.moveTo(s.x - 20, GROUND_Y)
                    ctx.lineTo(s.x, GROUND_Y - 30)
                    ctx.lineTo(s.x + 20, GROUND_Y)
                    ctx.fill()

                    ctx.fillStyle = '#ffffff'
                    for (let i = 0; i < s.ammo; i++) {
                        let row = 0
                        let col = i
                        if (i > 3) { row = 1; col = i - 4 }
                        if (i > 7) { row = 2; col = i - 8 }
                        ctx.fillRect(s.x - 12 + (col * 6), GROUND_Y - 10 + (row * 4), 4, 4)
                    }
                    ctx.fillStyle = '#aaaaaa'
                }
            })

            gs.abms.forEach((m) => {
                ctx.strokeStyle = '#0000ff' // Blue trail
                ctx.lineWidth = 1
                ctx.beginPath()
                ctx.moveTo(m.startX, m.startY)
                ctx.lineTo(m.x, m.y)
                ctx.stroke()

                ctx.fillStyle = '#ffffff'
                ctx.fillRect(m.x - 1, m.y - 1, 2, 2)

                ctx.strokeStyle = '#ffffff'
                ctx.lineWidth = 1
                const tx = m.targetX, ty = m.targetY
                ctx.beginPath()
                ctx.moveTo(tx - 3, ty - 3); ctx.lineTo(tx + 3, ty + 3)
                ctx.moveTo(tx + 3, ty - 3); ctx.lineTo(tx - 3, ty + 3)
                ctx.stroke()
            })

            gs.warheads.forEach((m) => {
                // #3638: cruise launches read distinct from ICBM trails — same
                // physics, different eyes. Orange trail + warm tip survives the
                // 600px phone letterbox where two reds were one story.
                ctx.strokeStyle = m.cruise ? '#ff9d00' : '#ff0000'
                ctx.lineWidth = m.cruise ? 2 : 1 // #3638: 2 px + orange — at the
                // ~0.7 letterbox scale a 1 px AA line reads as a dim blend;
                // 2 px survives device scale 1 on a 600px phone board
                ctx.beginPath()
                ctx.moveTo(m.startX, m.startY)
                ctx.lineTo(m.x, m.y)
                ctx.stroke()

                ctx.fillStyle = m.cruise ? '#ffd23d' : '#ffffff'
                ctx.fillRect(m.x - 1, m.y - 1, 2, 2)
            })

            // #3630 smart bombs — the arcade said you'd know one by the bend:
            // its path is a polyline of every sidestep, and the head burns a
            // white-hot cyan core that pulses — the tell that this warhead is
            // reading the sky. Same ICBM skeleton (it IS an ICBM), new paint.
            gs.warheads.forEach((m) => {
                if (!m.smart) return
                ctx.strokeStyle = '#ff4040'
                ctx.lineWidth = 1
                ctx.beginPath()
                ctx.moveTo(m.startX, m.startY)
                for (const [tx, ty] of m.trail) ctx.lineTo(tx, ty)
                ctx.lineTo(m.x, m.y)
                ctx.stroke()
                const pulse = Math.floor(gs.tick / 6) % 2 === 0
                ctx.fillStyle = pulse ? '#ffffff' : '#9ff4ff' // hot core
                ctx.beginPath() // diamond head, 45° to the warhead's square
                ctx.moveTo(m.x, m.y - 4)
                ctx.lineTo(m.x + 4, m.y)
                ctx.lineTo(m.x, m.y + 4)
                ctx.lineTo(m.x - 4, m.y)
                ctx.closePath()
                ctx.fill()
                ctx.fillStyle = pulse ? '#00e5ff' : '#ff2020' // spark alternates with the pulse
                ctx.fillRect(m.x - 1, m.y - 1, 2, 2)
            })

            // #3629 cruise saucers — the satellite-shaped ferry (Atari 1981
            // manual §2: "look like satellites"). 4-frame hover bob, chasing
            // rim lights, flickering tail; the look is ours, the shape's era.
            // #3638 legibility pass: hull rx 18→21, dome r 6→7, lights 4×3 —
            // at the 600px letterbox (scale ≈ 0.71) the rim lights read as
            // 3px blocks instead of sub-pixel smudges.
            gs.saucers.forEach((s) => {
                const bob = [0, -1, -2, -1][s.frame]
                const sy = s.y + bob
                ctx.fillStyle = '#8f98a8' // lower hull shade
                ctx.beginPath(); ctx.ellipse(s.x, sy + 2, 21, 7, 0, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#d8dee8' // upper hull
                ctx.beginPath(); ctx.ellipse(s.x, sy, 21, 8, 0, Math.PI, 0); ctx.fill()
                ctx.fillStyle = '#39d0ff' // dome
                ctx.beginPath(); ctx.arc(s.x, sy - 6, 7, Math.PI, 0); ctx.fill()
                ctx.fillStyle = '#083044' // dome slit
                ctx.fillRect(s.x - 1, sy - 11, 2, 4)
                for (let i = 0; i < 4; i++) { // running lights chase the rim
                    ctx.fillStyle = (i + s.frame) % 2 === 0 ? '#ffe14d' : '#ff4d4d'
                    ctx.fillRect(s.x - 16 + i * 9, sy + 1, 4, 3)
                }
                ctx.fillStyle = s.frame % 2 === 0 ? '#ff9a3d' : '#ffd23d' // tail flicker
                ctx.fillRect(s.x + (s.dir === 1 ? -25 : 22), sy + 1, 3, 3)
            })

            gs.blasts.forEach((e) => {
                ctx.fillStyle = e.color
                ctx.beginPath()
                ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2)
                ctx.fill()
            })

            // #3638 kill juice — the flash is the exclamation mark on the 125,
            // the debris ticks carry the wreck down (era-correct: the original's
            // explosions were spectacles of falling fragments, not dots).
            gs.debris.forEach((d) => {
                ctx.globalAlpha = Math.max(0, Math.min(1, d.life / 22))
                ctx.fillStyle = d.color
                ctx.fillRect(d.x - 1, d.y - 1, 2, 2)
            })
            ctx.globalAlpha = 1
            if (gs.flash) {
                ctx.globalAlpha = gs.flash.t / 4
                ctx.fillStyle = '#ffffff'
                ctx.beginPath()
                ctx.arc(gs.flash.x, gs.flash.y, 30 - gs.flash.t * 4, 0, Math.PI * 2)
                ctx.fill()
                ctx.globalAlpha = 1
            }

            ctx.strokeStyle = '#ff00ff'
            ctx.lineWidth = 2
            const cx = gs.crosshair.x, cy = gs.crosshair.y
            ctx.beginPath()
            ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy)
            ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10)
            ctx.stroke()

            ctx.fillStyle = '#ff0000'
            ctx.font = '24px monospace'
            ctx.textAlign = 'center'
            ctx.fillText(`SCORE: ${gs.score}`, SCREEN_WIDTH / 2, 30)
            ctx.fillStyle = '#0000ff'
            ctx.fillText(`WAVE: ${gs.wave}`, SCREEN_WIDTH / 2, 60)

            if (attractUiRef.current) {
                attractTick++
                ctx.fillStyle = DIM
                ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
                ctx.textAlign = 'center'
                for (const l of attractFrame(attractTick, SCREEN_WIDTH, SCREEN_HEIGHT)) {
                    ctx.font = `${l.size}px monospace`
                    ctx.fillStyle = l.col
                    ctx.fillText(l.text, l.x, l.y)
                }
                ctx.textAlign = 'start'
            }

            if (gs.state === 'waveEnd') {
                ctx.fillStyle = '#00ff00'
                ctx.font = '40px monospace'
                ctx.fillText(`WAVE COMPLETE`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)
                ctx.font = '20px monospace'
                ctx.fillText(`BONUS POINTS`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 40)
            }

            if (gs.state === 'gameOver') {
                ctx.fillStyle = '#ff0000'
                ctx.font = '60px monospace'
                ctx.fillText(`THE END`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2)
            }

            ctx.restore()
        }

        let lastTime = 0
        let accumulator = 0
        const FIXED_DT = 1000 / 60
        const loop = (timestamp) => {
            if (!lastTime) lastTime = timestamp
            const frameTime = Math.min(timestamp - lastTime, 100)
            lastTime = timestamp
            if (!pausedRef.current) {
                const rh = document.documentElement.dataset.rotateHint === '1'
                if (rh !== rotHintRef.current) { rotHintRef.current = rh; setRotHint(rh) } // #1748
                accumulator += frameTime
                while (accumulator >= FIXED_DT) {
                    update()
                    accumulator -= FIXED_DT
                }
                draw()
            }
            animationFrameId = requestAnimationFrame(loop)
        }
        init()

        // production report carries the seed (#1473)
        exposeFeedbackState(() => ({
            tick: gs.tick, score: gs.score, done: gs.state === 'gameOver', seed: gs.seed, wave: gs.wave,
        }))

        mountDbg({
            title: 'MISSILE COMMAND',
            getState: () => [
                `score ${gs.score}  wave ${gs.wave}  state ${gs.state}`,
                `cities ${citiesAlive(gs)}/6  ammo ${gs.silos.map((s) => (s.alive ? s.ammo : 'x')).join(',')}  warheads ${gs.warheads.length}  saucers ${gs.saucers.length}`,
                `smarts ${gs.warheads.filter((m) => m.smart && !m.dead).length}  seed ${gs.seed}  tick ${gs.tick}  watch ${gs.watch}`,
            ],
            actions: [
                { label: 'Fire at crosshair', run: () => fireAt(gs, gs.crosshair.x, gs.crosshair.y) },
                { label: 'Skip to wave 6 (saucers)', run: () => { gs.wave = 6; startWave(gs) } },
                { label: 'Skip to wave 7 (smart bombs)', run: () => { gs.wave = 7; startWave(gs) } },
                { label: 'Force game over', run: () => { gs.cities.forEach((c) => { c.alive = false }); gs.over = true; gs.state = 'gameOver' } },
            ],
        })

        // #1637 b29 — the watch contract the pilot drives against (DEV-only).
        if (import.meta.env.DEV) {
            window.__mcTest = {
                watching: () => gs.watch,
                watchSfx: watchSfxLog,
                screen: () => (attractUiRef.current ? 'attract' : gs.state === 'gameOver' ? 'over' : 'play'),
                probe: () => ({
                    tick: gs.tick, score: gs.score, wave: gs.wave, done: gs.over,
                    cities: citiesAlive(gs), silos: gs.silos.filter((s) => s.alive).length,
                    warheads: gs.warheads.length, abms: gs.abms.length, saucers: gs.saucers.length,
                    saucerAt: gs.saucers.map((s) => ({ x: Math.round(s.x), y: Math.round(s.y), dir: s.dir, speed: s.speed })),
                    cruise: gs.warheads.filter((m) => m.cruise).length, // #3638 trail probe
                    cruiseAt: gs.warheads.filter((m) => m.cruise).map((m) => ({ x: Math.round(m.x), y: Math.round(m.y), sx: Math.round(m.startX), sy: Math.round(m.startY) })),
                    juice: gs.debris.length + (gs.flash ? 1 : 0), // #3638 kill-juice probe
                    smarts: gs.warheads.filter((m) => m.smart && !m.dead).length,
                    smartAt: gs.warheads.filter((m) => m.smart && !m.dead)
                        .map((m) => ({ x: Math.round(m.x), y: Math.round(m.y), tx: m.targetX })),
                    abmSpeeds: gs.abms.map((a) => a.speed),
                    ammo: gs.silos.reduce((a, s) => a + (s.alive ? s.ammo : 0), 0),
                    watching: gs.watch, seed: gs.seed,
                }),
                // harness-only ferry lift (same cheat DebugKit offers) so a drive
                // script doesn't sit through five waves at 60 fps
                toWave6: () => { gs.wave = 6; startWave(gs); return gs.wave },
                // ...and the smart-bomb lift (#3630)
                toWave7: () => { gs.wave = 7; startWave(gs); return gs.wave },
                // harness fallback for the seat (the pilot presses Y like a player)
                seat: () => { if (!gs.watch) { seat(); } return gs.watch },
                release: () => { release(); return gs.watch },
                start: () => { startRun(); return gs.seed },
            }
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mousedown', handleClick)
            window.removeEventListener('resize', resize)
            canvas.removeEventListener('pointerdown', handleCanvasTap)
            cancelAnimationFrame(animationFrameId)
            unexposeFeedbackState()
            unmountDbg()
            if (import.meta.env.DEV) { if (window.__mcTest) delete window.__mcTest }
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[4/3] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full cursor-none" />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'MISSILE COMMAND')} onResume={handleResume} />}
                {/* #1654: the discoverable WATCH line, before the first Y press.
                    #1748 consumer: RotateHint's card lands dead-center on this 4:3
                    letterbox (its dismiss button sits exactly on the pill), so the
                    whole centered block steps aside while the hint is up — after a
                    rotate or a PLAY-IN-PORTRAIT dismissal the pill is back, reachable. */}
                {attractUi && !paused && !rotHint && (
                    <div className="absolute inset-x-0 z-[70] flex flex-col items-center gap-2 pointer-events-none" style={{ bottom: '24%' }}>
                        <div className="text-emerald-200/70 font-mono text-[11px] tracking-widest">{WATCH_ATTRACT_HINT}</div>
                        <AttractWatchButton />
                    </div>
                )}
                {/* #1637 b29 — the proven route; any key, click, mouse or tap takes over. */}
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

export default MissileCommandGame

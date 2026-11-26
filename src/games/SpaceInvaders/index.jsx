import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, seedRng } from '../../utils/gameContract'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { attractFrame, DIM } from './attract.js'
import { GW, GH, PLAYER_W, PLAYER_H, PLAYER_Y, INVADER_W, INVADER_H, BULLET_W, BULLET_H, UFO_Y, BUNKER_ROWS, ROW_SCORE, COLS, waveRows, bunkerBricks, makeWorld, step, hash, done, activeCount, watchRoute, ufoBounty } from './sim.js'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'

// SPACE INVADERS (Taito 1978) — world sim lives in sim.js (Node-provable).
// Pixel title: draws at the original's 224x256 world resolution, integer-scaled
// to the canvas, imageSmoothingEnabled off (AGENTS.md / docs/ART.md).

// Monochrome sprites as bit rows ('1' = lit pixel), original shapes.
const SPR = {
    squid: [
        ['00011000', '00111100', '01111110', '11011011', '11111111', '00100100', '01011010', '10100101'],
        ['00011000', '00111100', '01111110', '11011011', '11111111', '01100110', '10011001', '00100100'],
    ],
    crab: [
        ['00100000100', '00010001000', '00111111100', '01101110110', '11111111111', '10111111101', '10100000101', '00011011000'],
        ['00100000100', '10010001001', '10111111101', '11101110111', '11111111111', '01111111110', '00100000100', '01000000010'],
    ],
    octo: [
        ['000011110000', '011111111110', '111111111111', '111000000111', '111111111111', '001110011100', '011001100110', '110000000011'],
        ['000011110000', '011111111110', '111111111111', '111000000111', '111111111111', '001110011100', '110001100011', '011000000110'],
    ],
    player: ['0000001000000', '0000011100000', '0000011100000', '0111111111110', '1111111111111', '1111111111111', '1111111111111', '1111111111111'],
    ufo: ['0000011111100000', '0011111111111100', '0111111111111110', '1111111111111111', '0111111111111110', '0011100110011100', '0001000000001000'],
    // #3582 — the death boom: the cabinet flashed a scrambled glyph where an
    // invader fell. Original shape (our own starburst, two frames — ART.md die
    // law), drawn at the kill spot in the row's colour over the spark fan.
    boomA: ['10000000001', '01000000010', '00110001100', '00001110000', '00110001100', '01000000010', '10000000001'],
    boomB: ['00000000000', '00010001000', '00001010000', '00111111100', '00001010000', '00010001000', '00000000000'],
}
const ROW_SPRITE = ['squid', 'crab', 'crab', 'octo', 'octo'] // #3517 five bands: squid 30 / crab 20 / octopus 10
const ROW_COL = ['#ff3b30', '#ffffff', '#ffffff', '#9be7ff', '#9be7ff'] // squid red, crab white, octopus cyan (#3517 bands)

const drawSprite = (ctx, rows, x, y, col) => {
    ctx.fillStyle = col
    for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
            if (rows[r][c] === '1') ctx.fillRect(x + c, y + r, 1, 1)
        }
    }
}

const SpaceInvadersGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)
    const [uiOver, setUiOver] = React.useState(false)
    const [attractUi, setAttractUi] = React.useState(true) // #1637: DOM mirror of the attract flag
    const [watching, setWatching] = React.useState(false) // #1637 WATCH: mirrors the seat flag for the chrome
    const watchingRef = useRef(false)

    const handleResume = () => {
        setPaused(false)
        pausedRef.current = false
        canvasRef.current?.focus()
    }

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        let animationFrameId

        // ---------- world + seed (#1473 seed-param) ----------
        // All gameplay entropy draws from a seeded mulberry32 stream; the
        // attract demo runs the SAME sim, so the seed regenerates at every
        // human start and ?seed=N replays the exact world.
        let seed = Math.floor(Math.random() * 1000000)
        let rand = seedRng(seed)
        let world = makeWorld(rand)
        const newRun = () => {
            seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)
            rand = seedRng(seed)
            world = makeWorld(rand)
        }

        let viewW = 0
        let viewH = 0
        let viewScale = 1
        let viewOX = 0
        let viewOY = 0
        let initialized = false
        const resize = () => {
            if (!containerRef.current || !canvas) return
            const { width, height } = containerRef.current.getBoundingClientRect()
            if (width === 0 || height === 0) return
            const dpr = window.devicePixelRatio || 1
            canvas.width = width * dpr
            canvas.height = height * dpr
            canvas.style.width = `${width}px`
            canvas.style.height = `${height}px`
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            ctx.imageSmoothingEnabled = false
            viewW = width
            viewH = height
            viewScale = Math.max(1, Math.floor(Math.min(width / GW, height / GH)))
            viewOX = Math.floor((width - GW * viewScale) / 2)
            viewOY = Math.floor((height - GH * viewScale) / 2)
            if (!initialized) {
                initialized = true
            }
        }

        // ---------- input ----------
        let isAttractMode = true
        let attractTick = 0
        const keys = { ArrowLeft: false, ArrowRight: false, Space: false }

        const startFromAttract = () => {
            if (!isAttractMode) return
            isAttractMode = false
            setAttractUi(false)
            newRun()
        }
        const restartToAttract = () => {
            isAttractMode = true
            attractTick = 0
            setUiOver(false)
            setAttractUi(true)
            newRun()
        }

        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const next = !pausedRef.current
                pausedRef.current = next
                setPaused(next)
                return
            }
            if (pausedRef.current) return
            if (done(world)) { restartToAttract(); return }
            startFromAttract()
            // #1637 WATCH: Y seats the proven flight (watchRoute drives the real
            // sim); any driving key hands the wheel back and the player
            // continues from exactly where the prover left it.
            if (isWatchKey(e)) { watchingRef.current = !watchingRef.current; setWatching(watchingRef.current); if (watchingRef.current) playWatchStart(); else playWatchStop(); return }
            if (watchingRef.current && isTakeoverKey(e)) { watchingRef.current = false; setWatching(false); playWatchStop() }
            if (keys[e.code] !== undefined) keys[e.code] = true
        }
        const handleKeyUp = (e) => {
            if (keys[e.code] !== undefined) keys[e.code] = false
        }

        const handlePointerDown = () => {
            if (pausedRef.current) return
            if (watchingRef.current && !isAttractMode && !done(world)) { watchingRef.current = false; setWatching(false); playWatchStop() } // #1637 a tap takes the cannon back
            if (done(world)) restartToAttract()
            else startFromAttract()
        }

        window.addEventListener('resize', resize)
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        window.addEventListener('pointerdown', handlePointerDown)
        resize()

        // ---------- sim driving ----------
        let uiOverMirror = false

        // Decor juice (index.jsx only; sim stays pure). Kill bursts are
        // deterministic from tick — no entropy outside the audited default-seed draw.
        const parts = []
        // #3582 — death booms: a two-frame glyph blinks at the kill spot (the
        // cabinet's scrambled explosion flash). Render decor, deterministic from
        // the death event itself — the sim and its seed anchors stay untouched.
        const booms = []
        const boom = (x, y, col) => booms.push({ x: Math.round(x), y: Math.round(y), life: 12, col })
        // Per-row kill bursts (render only, sim stays pure): the squid (row 0)
        // is a tight red spark fan, crabs (1-2) spray white sideways, octopus
        // (3-4) drops cyan droplets. Deterministic pseudo-angles — no RNG.
        const burst = (x, y, row = 0) => {
            if (row <= 0) {
                for (let k = 0; k < 6; k++) {
                    const a = ((x + y + k * 37) % 62) / 62 * Math.PI * 2 // pseudo-angle from state, no RNG
                    parts.push({ x, y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6, life: 18, col: '#ff3b30', h: 1, grav: 0 })
                }
            } else if (row <= 2) {
                for (let k = 0; k < 7; k++) {
                    const a = ((x + y + k * 29) % 55) / 55 // pseudo-spread from state, no RNG
                    parts.push({ x, y, vx: (a - 0.5) * 2.4, vy: -0.6 - a * 0.6, life: 16, col: '#ffffff', h: 2, grav: 0.05 })
                }
            } else {
                for (let k = 0; k < 5; k++) {
                    const a = ((x + y + k * 23) % 41) / 41
                    parts.push({ x, y, vx: (a - 0.5) * 0.9, vy: 0.9, life: 20, col: '#9be7ff', h: 1, grav: 0.06 })
                }
            }
        }
        // Saucer boom: the payout pays out in bigger chunks — 50: a spark,
        // 100: a spray, 150: a wash, 300: a firework. Tier colour, deterministic.
        const UFO_TIER = { 50: ['#ff3b30', 6], 100: ['#ffaa00', 10], 150: ['#ffe066', 14], 300: ['#ffffff', 20] }
        const ufoBurst = (x, y, bounty) => {
            const tier = UFO_TIER[bounty] || UFO_TIER[50]
            const [col, n] = tier
            for (let k = 0; k < n; k++) {
                const a = ((x + y + k * 31) % 57) / 57 * Math.PI * 2 // pseudo-angle, no RNG
                parts.push({ x, y, vx: Math.cos(a) * 1.9, vy: Math.sin(a) * 1.9, life: 20, col, h: 1, grav: 0.04 })
            }
        }
        const MARCH_TONES = [110, 98, 87, 78] // the original's descending four
        let marchStep = 0
        let marchAt = 0
        let prevMarchEvents = 0 // #3573 — the notes land ON the sim's march steps
        let warbleAt = 0
        let prevShot = false
        let lastKillTick = 0
        let attractOver = 0 // #1906 — the attract loop's losing moment, held visible
        let waveBannerAt = -999 // #1906 attract — wave-advance stamp
        // #1906 — the original flashes the killed invader's value where it died
        // (10/20/30, and the saucer's bounty). Blinking text decor, deterministic.
        const popups = []
        const popup = (x, y, val) => popups.push({ x, y, val, life: 45 })

        const doSim = (input) => {
            const was = world.phase
            const before = world.invaders.map((i) => i.alive)
            const prevCount = activeCount(world)
            const prevScore = world.score
            const prevLives = world.lives
            const prevWave = world.wave
            const prevUfo = world.ufo
            world = step(world, input, rand)
            if (world.score > prevScore) audioController.playNoise(0.08, 0.12)
            else if (prevScore === world.score && was === 'play' && world.phase === 'dying') audioController.playNoise(0.4, 0.25)
            if (was === 'play' && world.phase === 'over') {
                audioController.playSweep(400, 80, 0.5)
                // #1637 WATCH: the end of the run is the end of the route —
                // the seat releases silently, like the racer's finish flag.
                if (watchingRef.current) { watchingRef.current = false; setWatching(false) }
            }
            if (prevCount > 0 && activeCount(world) === 0) audioController.playSweep(200, 600, 0.3)
            // kill detection by index identity -> burst + value popup at the death spot
            let invaderPts = 0
            for (let k = 0; k < before.length; k++) {
                if (before[k] && !world.invaders[k].alive) {
                    burst(world.invaders[k].x + 6, world.invaders[k].y + 4, world.invaders[k].row)
                    // #3582 — the boom centres the 11px glyph on the 12px cell
                    boom(world.invaders[k].x + (INVADER_W - 11) / 2, world.invaders[k].y, ROW_COL[world.invaders[k].row])
                    invaderPts += ROW_SCORE[world.invaders[k].row]
                    popup(world.invaders[k].x + 6, world.invaders[k].y, ROW_SCORE[world.invaders[k].row])
                    lastKillTick = world.tick
                }
            }
            // #1906 — the saucer's payout pops where it fell too (the score delta
            // not owned by invader rows is the table bounty, whatever it was)
            const ufoPts = world.score - prevScore - invaderPts
            if (prevUfo && !world.ufo && ufoPts > 0) {
                popup(prevUfo.x + 8, UFO_Y, ufoPts)
                ufoBurst(prevUfo.x + 8, UFO_Y + 4, ufoPts)
            }
            // #1906 attract law — an advance beat when the demo crosses a wave.
            if (isAttractMode && world.wave !== prevWave && world.phase === 'play') waveBannerAt = world.tick
            // #1906 bonus spare cannon: jingles + stamps when a 100-pt crossing pays.
            if (world.lives > prevLives) {
                audioController.playTone(523, 0.09, 'square', 0.05)
                audioController.playTone(784, 0.10, 'square', 0.05, 0.08)
                audioController.playTone(1046, 0.13, 'square', 0.05, 0.17)
                popup(world.playerX + 6, PLAYER_Y - 14, 'BONUS')
            }
            // fire tone: the shot appearing is the event
            const shotNow = !!world.playerBullet
            if (shotNow && !prevShot) audioController.playTone(980, 0.04, 'square', 0.08)
            prevShot = shotNow
            prevMarchEvents = world.marchEvents // #3573 — step-edge detection refreshes every tick
            // the descending four — #1906: the rate tracks the REMAINING fleet
            // (original march), so the last pair flutters at 3-tick steps; and a
            // saucer overhead replaces the march with its warble, like the arcade.
            if (world.phase === 'play' && prevCount > 0) {
                const n = activeCount(world)
                if (world.ufo) {
                    if (world.tick - warbleAt >= 4) {
                        warbleAt = world.tick
                        audioController.playSweep(240, 350, 0.13, 'sawtooth', 0.05)
                        marchStep++
                    }
                } else {
                    const interval = Math.max(3, Math.round(2 + n * 0.95))
                    // #3573 — one shared clock: the ∝n rate law still decides
                    // WHEN, but a note only fires on a tick where the sim's
                    // march actually stepped (the machine's sound and march
                    // were the same loop — never a parallel metronome).
                    const stepped = world.marchEvents > prevMarchEvents
                    if (stepped && world.tick - marchAt >= interval) {
                        marchAt = world.tick
                        audioController.playTone(MARCH_TONES[marchStep % 4] * 0.5, 0.09, 'sawtooth', 0.04)
                        audioController.playTone(MARCH_TONES[marchStep % 4], 0.08, 'square', 0.05)
                        marchStep++
                    }
                }
            }
            updateParts()
            if (world.phase === 'over' && !isAttractMode && !uiOverMirror) { uiOverMirror = true; setUiOver(true) }
        }
        const updateParts = () => {
            for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += p.grav || 0; p.life-- }
            for (let k = parts.length - 1; k >= 0; k--) if (parts[k].life <= 0) parts.splice(k, 1)
            for (const p of popups) p.life--
            for (let k = popups.length - 1; k >= 0; k--) if (popups[k].life <= 0) popups.splice(k, 1)
            for (const b of booms) b.life--
            for (let k = booms.length - 1; k >= 0; k--) if (booms[k].life <= 0) booms.splice(k, 1)
        }

        const update = () => {
            if (isAttractMode) {
                attractTick++
                doSim(watchRoute(world))
                // #1906 — ART.md attract law: show a losing moment too. The route
                // dies on waves 3-9 across the WITNESS seeds; hold that GAME OVER
                // beat ~2.5 s before the next demo run starts.
                if (done(world)) { attractOver++; if (attractOver > 150) { newRun(); uiOverMirror = false; attractTick = 0; attractOver = 0 } }
                else attractOver = 0
                return
            }
            // #1637 WATCH: the seat drives the SAME sim with the SAME brain the
            // attract screen flies and invaderscheck's WITNESS section proves —
            // reactive per tick, honest from any position.
            if (watchingRef.current) { doSim(watchRoute(world)); return }
            doSim({ left: keys.ArrowLeft, right: keys.ArrowRight, fire: keys.Space })
        }

        // ---------- render ----------
        const drawWorld = () => {
            ctx.save()
            ctx.translate(viewOX, viewOY)
            ctx.scale(viewScale, viewScale)
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, GW, GH)

            // original-style score header (red zone of the overlay)
            ctx.fillStyle = '#ff3b30'
            ctx.font = '8px monospace'
            ctx.textAlign = 'left'
            ctx.fillText(`SCORE ${String(world.score).padStart(4, '0')}`, 40, 10)
            ctx.fillText(`HI ${String(Math.max(world.score, 0)).padStart(4, '0')}`, 160, 10)

            // invaders, marching 2-frame animation; overlay zone colors
            const frame = Math.floor(world.tick / 16) % 2
            // the row band colours live at module scope (ROW_COL) so the kill
            // path can paint the #3582 boom in the fallen invader's own colour
            for (const i of world.invaders) {
                if (!i.alive) continue
                const sp = SPR[ROW_SPRITE[i.row]][frame]
                drawSprite(ctx, sp, i.x + (INVADER_W - sp[0].length) / 2, i.y, ROW_COL[i.row])
            }

            // the four destructible forts (original overlay green), 2x2 bricks
            ctx.fillStyle = '#00ff00'
            for (const b of world.bunkers) {
                for (let r = 0; r < BUNKER_ROWS; r++) {
                    const m = b.cells[r]
                    for (let c = 0; c < 11; c++) if ((m >> c) & 1) ctx.fillRect(b.x + c * 2, b.y + r * 2, 2, 2)
                }
            }

            // the saucer's tier colour tracks its shot count — 50 red, 100 amber,
            // 150 gold, 300 white. The draw reads the same table the sim pays out.
            const UFO_TIER_COL = { 50: '#ff3b30', 100: '#ffaa00', 150: '#ffe066', 300: '#ffffff' }
            if (world.ufo) drawSprite(ctx, SPR.ufo, world.ufo.x, UFO_Y, UFO_TIER_COL[ufoBounty(world.ufo.shots)])

            // shots
            ctx.fillStyle = '#ffffff'
            if (world.playerBullet) {
                // 1x5 with a cyan tip: the sim bullet is 1x4 (hash and WATCH
                // route ride the sim box — keep it untouched); the missile's
                // tip is pure render, one pixel above the sim box.
                ctx.fillStyle = '#e8e8e8'
                ctx.fillRect(world.playerBullet.x, world.playerBullet.y, BULLET_W, BULLET_H)
                ctx.fillStyle = '#00e5ff'
                ctx.fillRect(world.playerBullet.x, world.playerBullet.y - 1, BULLET_W, 1)
            }
            for (const b of world.enemyBullets) ctx.fillRect(b.x, b.y, BULLET_W, BULLET_H)

            // kill bursts (deterministic decor)
            for (const p of parts) {
                ctx.fillStyle = p.col
                ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, p.h || 1)
            }

            // #3582 — the death boom blinks its two frames at the kill spot in
            // the fallen invader's row colour; the spark fan shows through the
            // glyph's gaps, so the burst reads as one event, not two layers.
            for (const b of booms) {
                drawSprite(ctx, Math.floor(b.life / 2) % 2 === 0 ? SPR.boomA : SPR.boomB, b.x, b.y, b.col)
            }

            // #1906 — value flash where an invader (or the saucer) fell: the
            // original blinks 10/20/30 at the kill spot for a beat.
            ctx.font = '8px monospace'
            ctx.textAlign = 'center'
            for (const p of popups) {
                if (Math.floor(p.life / 5) % 2 === 0) {
                    ctx.fillStyle = '#ffffff'
                    ctx.fillText(String(p.val), Math.round(p.x), Math.round(p.y))
                }
            }

            // player cannon — blinks during respawn
            const blink = world.phase === 'dying' && Math.floor(world.tick / 6) % 2 === 0
            if (!blink) drawSprite(ctx, SPR.player, Math.round(world.playerX), PLAYER_Y, '#ffffff')

            // green ground line
            ctx.fillStyle = '#00ff00'
            ctx.fillRect(0, PLAYER_Y + PLAYER_H + 2, GW, 1)

            // remaining lives (original shows n-1 spare cannons bottom-left)
            for (let l = 0; l < world.lives - 1 && world.phase !== 'over'; l++) {
                drawSprite(ctx, SPR.player, 4 + l * 16, GH - 8, '#00e5ff')
            }
            ctx.fillStyle = '#ffffff'
            ctx.font = '8px monospace'
            ctx.textAlign = 'right'
            ctx.fillText(`WAVE ${world.wave}`, GW - 4, GH - 1)

            // #1906 — WATCH pause tell: when the seat holds position between kills
            // it is re-aiming through the shot pattern, not stalling — a blinking
            // target tick over the cannon sells the pause as intent.
            const watchTell = watchingRef.current && !isAttractMode && world.phase === 'play' &&
                world.tick - lastKillTick >= 15 && world.tick - lastKillTick < 240 && // covers b20's measured 172-tick worst gap (pin 220)
                Math.floor(world.tick / 4) % 2 === 0
            if (watchTell) {
                const cx = Math.round(world.playerX + PLAYER_W / 2)
                ctx.fillStyle = '#00e5ff'
                ctx.fillRect(cx, PLAYER_Y - 12, 1, 4)
                ctx.fillRect(cx - 2, PLAYER_Y - 12, 5, 1)
            }

            ctx.restore()
        }

        const draw = () => {
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, viewW, viewH)
            drawWorld()

            if (isAttractMode) {
                ctx.fillStyle = DIM
                ctx.fillRect(viewOX, viewOY, GW * viewScale, GH * viewScale)
                ctx.textAlign = 'center'
                if (done(world)) {
                    // #1906 — the attract losing moment (ART.md attract law): the
                    // demo's own GAME OVER beat, held ~2.5 s by attractOver.
                    ctx.fillStyle = '#ff3b30'
                    ctx.font = `bold ${Math.max(12, Math.floor(viewW / 18))}px monospace`
                    ctx.fillText('GAME OVER', viewW / 2, viewH / 2 - 6)
                    ctx.fillStyle = '#ffffff'
                    ctx.font = `${Math.max(9, Math.floor(viewW / 32))}px monospace`
                    ctx.fillText(`SCORE ${world.score}  WAVE ${world.wave}`, viewW / 2, viewH / 2 + 12)
                } else {
                    for (const l of attractFrame(attractTick, viewW, viewH)) {
                        ctx.font = `${l.size}px monospace`
                        ctx.fillStyle = l.col
                        ctx.fillText(l.text, l.x, l.y)
                    }
                    // #1906 — an advance beat: the demo stamps the new wave for
                    // a beat like the cabinet's wave table tick.
                    if (world.tick - waveBannerAt >= 0 && world.tick - waveBannerAt < 55) {
                        ctx.font = `bold ${Math.max(16, Math.floor(viewW / 14))}px monospace`
                        ctx.fillStyle = '#00e5ff'
                        ctx.fillText(`WAVE ${world.wave}`, viewW / 2, viewH / 2 + 48)
                    }
                }
            } else if (done(world)) {
                ctx.fillStyle = 'rgba(0,0,0,0.72)'
                ctx.fillRect(viewOX, viewOY, GW * viewScale, GH * viewScale)
                ctx.textAlign = 'center'
                ctx.fillStyle = '#ffffff'
                ctx.font = `bold ${Math.max(16, Math.floor(viewW / 14))}px monospace`
                ctx.fillText('GAME OVER', viewW / 2, viewH / 2 - 10)
                ctx.font = `${Math.max(10, Math.floor(viewW / 28))}px monospace`
                ctx.fillText(`SCORE ${world.score}  WAVE ${world.wave}`, viewW / 2, viewH / 2 + 14)
                ctx.fillText('PRESS ANY KEY', viewW / 2, viewH / 2 + 30)
            }
        }

        // ---------- harness contract ----------
        exposeGame({
            id: 'invaders',
            buttons: ['left', 'right', 'a'],
            reset: (s) => {
                seed = s >>> 0
                rand = seedRng(seed)
                world = makeWorld(rand)
                uiOverMirror = false
                setUiOver(false)
                isAttractMode = false
                setAttractUi(false)
                watchingRef.current = false // #1637 a reset hands you the stick
                setWatching(false)
                keys.ArrowLeft = keys.ArrowRight = keys.Space = false
            },
            tick: (pad) => {
                if (done(world)) { world.tick += 1; return }
                doSim({ left: !!pad.left, right: !!pad.right, fire: !!pad.a })
            },
            state: () => ({
                tick: world.tick, score: world.score, done: done(world),
                seed: seed, wave: world.wave, lives: world.lives,
                invadersLeft: activeCount(world), playerX: Math.round(world.playerX),
                bunkerBricks: bunkerBricks(world),
                phase: world.phase, hash: hash(world),
            }),
            canvas: () => canvas,
            // snapshot/restore omitted: state lives in sim.js and JSON-copies
            // cleanly, but the seed stream (rand closure) cannot round-trip —
            // optional part of the contract skipped per #391.
        })

        // production report carries the seed (#1473)
        exposeFeedbackState(() => ({
            tick: world.tick, score: world.score, done: done(world), seed: seed, lives: world.lives, wave: world.wave,
        }))

        if (import.meta.env.DEV) {
            // #1637 watchcheck probes: is the prover flying, did it blip, and
            // a serializable slice of the world for the advance predicates.
            window.__invadersTest = {
                watching: () => watchingRef.current && !isAttractMode && !done(world),
                watchSfx: watchSfxLog,
                probe: () => ({
                    screen: isAttractMode ? 'attract' : done(world) ? 'over' : 'play',
                    tick: world.tick, score: world.score, lives: world.lives,
                    wave: world.wave, fleet: activeCount(world), phase: world.phase,
                    playerX: Math.round(world.playerX),
                }),
            }
        }

        mountDbg({
            title: 'SPACE INVADERS',
            getState: () => [
                `wave ${world.wave}  score ${world.score}  lives ${world.lives}  phase ${world.phase}`,
                `player ${Math.round(world.playerX)}  fleet ${activeCount(world)}/${waveRows(world.wave) * COLS}  fort bricks ${bunkerBricks(world)}/328`,
                `seed ${seed}  tick ${world.tick}  hash ${hash(world)}`,
            ],
            actions: [
                { label: 'Clear wave', run: () => { world.invaders.forEach((i) => { i.alive = false }) } },
                { label: 'Spawn UFO', run: () => { world.ufo = { x: 20, shots: 0 } } },
                { label: 'Wipe forts', run: () => { world.bunkers.forEach((b) => { b.cells = b.cells.map(() => 0) }) } },
                { label: 'Force game over', run: () => { world.lives = 0; world.phase = 'over' } },
            ],
        })

        // ---------- loop ----------
        let lastTime = 0
        let accumulator = 0
        const FIXED_DT = 1000 / 60
        const loop = (timestamp) => {
            if (!lastTime) lastTime = timestamp
            const frameTime = Math.min(timestamp - lastTime, 100)
            lastTime = timestamp
            if (!initialized) resize()
            if (!pausedRef.current && initialized) {
                accumulator += frameTime
                while (accumulator >= FIXED_DT) {
                    update()
                    accumulator -= FIXED_DT
                }
                draw()
            }
            animationFrameId = requestAnimationFrame(loop)
        }
        animationFrameId = requestAnimationFrame(loop)

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('resize', resize)
            window.removeEventListener('pointerdown', handlePointerDown)
            cancelAnimationFrame(animationFrameId)
            if (import.meta.env.DEV && window.__invadersTest) delete window.__invadersTest
            unexposeGame()
            unexposeFeedbackState()
            unmountDbg()
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[7/8] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full" style={{ background: 'black' }} />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'SPACE INVADERS')} onResume={handleResume} />}
                {/* #1654: the discoverable WATCH line, before the first Y press. */}
                {attractUi && !paused && (
                    <div className="absolute inset-x-0 z-[70] flex flex-col items-center gap-2 pointer-events-none" style={{ bottom: '24%' }}>
                        <div className="text-emerald-200/70 font-mono text-[11px] tracking-widest">{WATCH_ATTRACT_HINT}</div>
                        <AttractWatchButton />
                    </div>
                )}
                {/* #1637 WATCH — the proven flight marches; any key, pad push or tap takes over. */}
                {!attractUi && watching && <WatchToast className="fixed z-50" />}
                {!attractUi && !paused && (
                    <div className="fixed z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                        <WatchButton on={watching} />
                    </div>
                )}
            </div>
            <VirtualControls visible={!uiOver && !paused} />
        </div>
    )
}

export default SpaceInvadersGame

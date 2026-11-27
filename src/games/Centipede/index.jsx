import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { attractFrame, DIM } from './attract.js'
import { exposeGame, unexposeGame, exposeFeedbackState, unexposeFeedbackState, seedFromQuery, seedRng } from '../../utils/gameContract'
import { CELL_SIZE, START_LIVES, INVULN_TICKS, scoreForSegment, MUSHROOM_POINTS, mushroomField, SPIDER_POINTS, SCORPION_POINTS, FLEA_POINTS, SPIDER_EVERY, SCORPION_EVERY, FLEA_COOLDOWN, poisonMushroom, bulletEscapes } from './sim.js'

// CENTIPEDE (#1473 batch 16) — the Feb port's score was dead, one touch was
// instant hard-reset, cut bodies never grew heads, and the mushroom field
// scattered off Math.random. Restored to the 1981 arcade law: body 10 / head
// 100 / mushroom 1; the segment behind every cut becomes a new head; three
// lives — death respawns the zapper at the bottom and restarts the centipede
// from the top while the field persists; GAME OVER at zero lives restarts
// from any key, click or tap; the field is seeded and honors ?seed=N.
const CentipedeGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)

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

        // Game Constants
        const PLAYER_SPEED = 4
        const BULLET_SPEED = 8
        const CENTIPEDE_SPEED = 2

        let state = {
            width: 0,
            height: 0,
            player: { x: 0, y: 0, w: 16, h: 16 },
            bullets: [],
            mushrooms: [], // {x, y, health, poison?}
            centipedes: [], // Array of Segments {x, y, vx, vy, head, fast?}
            // #3604 menagerie: the garden's three wandering threats.
            spider: null,   // {x,y,vx,vy,health,seekAt} the bouncing eater
            scorpion: null, // {x,y,vx,vy,wobble} the quicksilver streak
            flea: null,     // {x,y,vx,vy,health,life} the summoned reward
            score: 0,
            frame: 0
        }

        // #1473 run state: seeded field, arcade lives loop, honest terminal.
        let seed = Math.floor(Math.random() * 1000000)
        let rand = seedRng(seed)
        let tickN = 0
        let lives = START_LIVES
        let over = false
        let respawnAt = -1       // tick the zapper returns, -1 = alive
        let invulnUntil = 0
        let spiderAt = SPIDER_EVERY     // tick the next spider enters
        let scorpionAt = SCORPION_EVERY // tick the next scorpion crosses
        let fleaAt = 0                  // earliest tick a high shot may summon again

        // --- #3604 menagerie: fairness of entry + the mushroom rain --------
        // The spider enters on a side, in its roaming band (never inside the
        // zapper's own strip at spawn); the scorpion crosses the garden band,
        // never the player pad. Both enter from a side on the run's stream.
        const spawnSpider = () => {
            const fromLeft = rand() < 0.5
            const y0 = Math.round((state.height * 0.45 + rand() * state.height * 0.3) / CELL_SIZE) * CELL_SIZE
            state.spider = {
                x: fromLeft ? 0 : state.width - 16,
                y: y0,
                vx: (fromLeft ? 1 : -1) * 2,
                vy: 2,
                health: 3,
                seekAt: tickN + 90,
            }
        }
        const spawnScorpion = () => {
            const fromLeft = rand() < 0.5
            const y0 = Math.round((70 + rand() * (state.height - 240)) / CELL_SIZE) * CELL_SIZE
            state.scorpion = {
                x: fromLeft ? -16 : state.width,
                y: y0,
                vx: (fromLeft ? 1 : -1) * 4,
                vy: 1,
                wobble: 0,
            }
        }
        // The zapper calls the flea by firing past the whole garden: it drops
        // in where the shot vanished, at the near edge of the spawn band, so a
        // high empty shot always answers something.
        const spawnFlea = (x) => {
            const dir = rand() < 0.5 ? -1 : 1
            state.flea = {
                x: Math.max(0, Math.min(state.width - 16, Math.floor(x / CELL_SIZE) * CELL_SIZE)),
                y: 50,
                vx: dir * 1.5,
                vy: 2.5,
                health: 2,
                life: 600,
            }
        }
        // A flea hit rains two fresh mushrooms somewhere in the garden — on
        // the grid, in the bands the field law already owns (never the spawn
        // lane, never the zapper strip, never stacked on an existing cap).
        const rainMushrooms = (n) => {
            const cols = Math.floor(state.width / CELL_SIZE)
            const top = Math.ceil(50 / CELL_SIZE)
            const bottom = Math.floor((state.height - 150) / CELL_SIZE)
            for (let i = 0; i < n; i++) {
                for (let tries = 0; tries < 8; tries++) {
                    const x = Math.floor(rand() * cols) * CELL_SIZE
                    const y = (top + Math.floor(rand() * Math.max(1, bottom - top))) * CELL_SIZE
                    if (state.mushrooms.some((m) => m.x === x && m.y === y)) continue
                    state.mushrooms.push({ x, y, health: 3 })
                    break
                }
            }
        }

        const spawnCentipede = () => {
            state.centipedes = []
            // Head
            state.centipedes.push({ x: state.width / 2, y: 0, vx: CENTIPEDE_SPEED, vy: 0, head: true })
            // Body
            for (let i = 1; i < 10; i++) {
                state.centipedes.push({ x: state.width / 2 - i * CELL_SIZE, y: 0, vx: CENTIPEDE_SPEED, vy: 0, head: false })
            }
        }

        const resetPlayer = () => {
            state.player.x = state.width / 2
            state.player.y = state.height - 30
            respawnAt = -1
            invulnUntil = tickN + INVULN_TICKS
        }

        const init = () => {
            // Fresh board: zapper + seeded mushroom field + a centipede on top
            respawnAt = -1
            invulnUntil = 0
            spiderAt = tickN + SPIDER_EVERY
            scorpionAt = tickN + SCORPION_EVERY
            fleaAt = 0
            state.spider = null
            state.scorpion = null
            state.flea = null
            state.bullets = [] // fresh board, fresh gun — a stale volley riding
            // across a reset diverges two identical seeded drives (#3604 drive)
            state.player.x = state.width / 2
            state.player.y = state.height - 30
            state.mushrooms = mushroomField(rand, state.width, state.height)
            spawnCentipede()
        }

        // Fresh run: seed regenerated (?seed=N wins), score and lives reset.
        const startRun = () => {
            seed = seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)
            rand = seedRng(seed)
            state.score = 0
            lives = START_LIVES
            over = false
            isAttractMode = false
            init()
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
                state.width = width
                state.height = height
                if (!initialized) {
                    init()
                    initialized = true
                }
            }
        }
        window.addEventListener('resize', resize)
        resize()

        // Input
        let isAttractMode = true
        let attractTick = 0
        let keys = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false, Space: false }
        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return

            if (over || isAttractMode) { startRun(); return }
            if (keys[e.code] !== undefined) keys[e.code] = true
            if (e.code === 'Space') fireBullet()
        }
        const handleUp = (e) => {
            if (keys[e.code] !== undefined) keys[e.code] = false
        }
        // Phones: any tap starts or restarts the run.
        const handleCanvasTap = () => {
            if (pausedRef.current) return
            if (over || isAttractMode) startRun()
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleUp)
        canvas.addEventListener('pointerdown', handleCanvasTap)

        const fireBullet = () => {
            if (respawnAt >= 0 || over) return
            if (state.bullets.length < 3) { // Limit bullets
                state.bullets.push({
                    x: state.player.x + 8,
                    y: state.player.y,
                    vx: 0,
                    vy: -BULLET_SPEED
                })
                audioController.playTone(600, 0.05, 'square')
            }
        }

        const playerAlive = () => respawnAt < 0

        const killPlayer = () => {
            audioController.playSweep(800, 200, 1.0, 'sawtooth')
            if (isAttractMode) { respawnAt = tickN + 60; return }
            lives--
            if (lives <= 0) {
                lives = 0
                over = true
            } else {
                respawnAt = tickN + 60
            }
        }

        const update = () => {
            state.frame++
            tickN++
            if (over) return

            // Respawn: back to the bottom pad, centipede restarts on top,
            // mushrooms persist (arcade death — not a hard reset).
            if (!playerAlive() && tickN >= respawnAt) {
                resetPlayer()
                spawnCentipede()
                // The garden calms for the respawned zapper — the menagerie
                // leaves, and its cadence restarts from this tick.
                state.spider = null
                state.scorpion = null
                state.flea = null
                spiderAt = tickN + SPIDER_EVERY
                scorpionAt = tickN + SCORPION_EVERY
                fleaAt = 0
            }

            // --- AI LOGIC ---
            if (isAttractMode && playerAlive()) {
                // #3604 — the demo dodges: when a menace looms within reach
                // overhead, the WATCH seat sidesteps before it hunts.
                let dodge = 0
                ;[state.spider, state.flea, state.scorpion].forEach((t) => {
                    if (t && t.y > state.player.y - 110 && t.y < state.player.y + 12 && Math.abs(t.x - state.player.x) < 56) {
                        dodge = t.x >= state.player.x ? -1 : 1
                    }
                })
                // Find lowest centipede
                let target = null
                let maxY = -1
                state.centipedes.forEach(c => {
                    if (c.y > maxY) {
                        maxY = c.y
                        target = c
                    }
                })

                if (dodge !== 0) {
                    keys.ArrowLeft = dodge < 0
                    keys.ArrowRight = dodge > 0
                } else if (target) {
                    const dx = target.x - state.player.x
                    if (Math.abs(dx) > 4) {
                        if (dx > 0) { keys.ArrowRight = true; keys.ArrowLeft = false }
                        else { keys.ArrowLeft = true; keys.ArrowRight = false }
                    } else {
                        keys.ArrowRight = false; keys.ArrowLeft = false
                        // Fire
                        if (state.frame % 10 === 0) fireBullet()
                    }
                }
            }

            // Player Move
            if (playerAlive()) {
                if (keys.ArrowLeft) state.player.x -= PLAYER_SPEED
                if (keys.ArrowRight) state.player.x += PLAYER_SPEED
                if (keys.ArrowUp) state.player.y -= PLAYER_SPEED
                if (keys.ArrowDown) state.player.y += PLAYER_SPEED

                // Clamp Player to bottom area
                const safeZone = state.height - 150
                if (state.player.y < safeZone) state.player.y = safeZone
                if (state.player.y > state.height - 16) state.player.y = state.height - 16
                if (state.player.x < 0) state.player.x = 0
                if (state.player.x > state.width - 16) state.player.x = state.width - 16
            }

            // Bullets
            state.bullets.forEach((b, i) => {
                b.y += b.vy

                // Hit Mushroom?
                let hitMushroom = -1
                state.mushrooms.forEach((m, mi) => {
                    if (Math.abs(b.x - (m.x + 8)) < 8 && Math.abs(b.y - (m.y + 8)) < 8) {
                        hitMushroom = mi
                    }
                })

                if (hitMushroom !== -1) {
                    state.mushrooms[hitMushroom].health--
                    if (state.mushrooms[hitMushroom].health <= 0) {
                        state.mushrooms.splice(hitMushroom, 1)
                        state.score += MUSHROOM_POINTS // arcade: 1 pt per mushroom
                        audioController.playNoise(0.1, 0.1)
                    } else {
                        audioController.playTone(200, 0.05, 'triangle')
                    }
                    state.bullets.splice(i, 1)
                    return
                }

                // Hit Centipede?
                let hitSeg = -1
                state.centipedes.forEach((c, ci) => {
                    if (Math.abs(b.x - (c.x + 8)) < 12 && Math.abs(b.y - (c.y + 8)) < 12) {
                        hitSeg = ci
                    }
                })

                if (hitSeg !== -1) {
                    // Kill the segment: it turns into a mushroom where it fell,
                    // and the arcade table pays 100 for the head, 10 for body.
                    const seg = state.centipedes[hitSeg]
                    state.score += scoreForSegment(seg.head)
                    state.mushrooms.push({ x: Math.floor(seg.x / CELL_SIZE) * CELL_SIZE, y: Math.floor(seg.y / CELL_SIZE) * CELL_SIZE, health: 3 })

                    // The segment behind the gap becomes a new head — the
                    // arcade's chain rule (the pre-batch code punted on it).
                    state.centipedes.splice(hitSeg, 1)
                    if (state.centipedes[hitSeg]) state.centipedes[hitSeg].head = true

                    audioController.playNoise(0.2, 0.3)
                    state.bullets.splice(i, 1)
                    return
                }

                // #3604 — Hit the menagerie? Spider first (three shots, bravery
                // bands), then scorpion (one shot, quicksilver), then flea (two
                // shots, each hit rains mushrooms). All inside the garden only.
                if (state.spider) {
                    const s = state.spider
                    if (Math.abs(b.x - (s.x + 8)) < 12 && Math.abs(b.y - (s.y + 8)) < 12) {
                        s.health--
                        state.bullets.splice(i, 1)
                        if (s.health <= 0) {
                            const dist = Math.abs(s.x - state.player.x) + Math.abs(s.y - state.player.y)
                            state.score += SPIDER_POINTS(dist)
                            state.spider = null
                            spiderAt = tickN + SPIDER_EVERY
                            audioController.playSweep(300, 90, 0.3, 'square')
                        } else {
                            audioController.playNoise(0.15, 0.25)
                        }
                        return
                    }
                }
                if (state.scorpion) {
                    const s = state.scorpion
                    if (Math.abs(b.x - (s.x + 8)) < 12 && Math.abs(b.y - (s.y + 8)) < 10) {
                        state.score += SCORPION_POINTS
                        state.scorpion = null
                        scorpionAt = tickN + SCORPION_EVERY
                        audioController.playSweep(200, 900, 0.4, 'square')
                        state.bullets.splice(i, 1)
                        return
                    }
                }
                if (state.flea) {
                    const f = state.flea
                    if (Math.abs(b.x - (f.x + 8)) < 12 && Math.abs(b.y - (f.y + 8)) < 12) {
                        f.health--
                        rainMushrooms(2) // every hit rains the bonus mushrooms
                        state.bullets.splice(i, 1)
                        if (f.health <= 0) {
                            state.score += FLEA_POINTS
                            state.flea = null
                            audioController.playSweep(500, 180, 0.2, 'triangle')
                        } else {
                            audioController.playTone(520, 0.06, 'triangle')
                        }
                        return
                    }
                }

                if (b.y < 0) {
                    // A shot that flies clear out of the field was aimed at the
                    // empty sky — the arcade answers with a flea, on cooldown so
                    // mashing can't summon a plague.
                    if (!state.flea && playerAlive() && tickN >= fleaAt && bulletEscapes(b.y)) {
                        spawnFlea(b.x)
                        fleaAt = tickN + FLEA_COOLDOWN
                        audioController.playTone(1200, 0.05, 'square')
                    }
                    state.bullets.splice(i, 1)
                }
            })

            // Centipede Logic
            // We need to look ahead for mushrooms
            state.centipedes.forEach(c => {
                // Move — a redened (poison-touched) segment races at double
                // the pace until the wave rebuilds.
                c.x += c.fast ? c.vx * 2 : c.vx
                c.y += c.vy

                // Turn/Drop Logic
                let hitSide = (c.x < 0 || c.x > state.width - 16)
                let hitPoison = false
                let hitShroom = state.mushrooms.some(m => {
                    if (!(Math.abs(c.x - m.x) < 10 && Math.abs(c.y - m.y) < 10)) return false
                    if (m.poison) hitPoison = true
                    return true
                })
                if (hitPoison) c.fast = true // scorpion venom: red and racing

                if (hitSide || hitShroom) {
                    // If just hit, drop down
                    if (c.vy === 0) { // Only if moving horizontally
                        c.vy = CELL_SIZE / 8 // Start drop
                        // c.vx = 0? No, usually descend then flip.
                        // Simplified: Instant drop and reverse
                        c.y += CELL_SIZE
                        c.vx = -c.vx
                        // Unstuck from wall
                        if (c.x < 0) c.x = 0
                        if (c.x > state.width - 16) c.x = state.width - 16
                        c.vy = 0
                    }
                }

                // Collision with Player (honors the respawn grace)
                if (playerAlive() && tickN >= invulnUntil && Math.abs(c.x - state.player.x) < 12 && Math.abs(c.y - state.player.y) < 12) {
                    killPlayer()
                }
            })

            if (state.centipedes.length === 0) {
                spawnCentipede() // Next level
                audioController.playSweep(400, 800, 0.5, 'sine')
            }

            // --- #3604 menagerie: the garden walks --------------------------
            if (!state.spider && tickN >= spiderAt) spawnSpider()
            if (!state.scorpion && tickN >= scorpionAt) spawnScorpion()

            if (state.spider) {
                const s = state.spider
                // Seek: every so often the eater leans toward the nearest
                // mushroom it can smell — that's the bounce grammar of the
                // arcade's lunch run.
                if (tickN >= s.seekAt) {
                    let best = null, bestD = 1e9
                    state.mushrooms.forEach((m) => {
                        const d = Math.abs(m.x - s.x) + Math.abs(m.y - s.y)
                        if (d < bestD) { bestD = d; best = m }
                    })
                    if (best) {
                        if (Math.abs(best.x - s.x) > 4) s.vx = Math.sign(best.x - s.x) * 2
                        if (Math.abs(best.y - s.y) > 4) s.vy = Math.sign(best.y - s.y) * 2
                    }
                    s.seekAt = tickN + 90
                }
                s.x += s.vx
                s.y += s.vy
                if (s.x < 0) { s.x = 0; s.vx = -s.vx }
                if (s.x > state.width - 16) { s.x = state.width - 16; s.vx = -s.vx }
                const sTop = Math.round(state.height * 0.3), sBottom = state.height - 16
                if (s.y < sTop) { s.y = sTop; s.vy = -s.vy }
                if (s.y > sBottom) { s.y = sBottom; s.vy = -s.vy }
                // Eat everything it touches — the garden shrinks behind it.
                const before = state.mushrooms.length
                state.mushrooms = state.mushrooms.filter((m) => !(Math.abs(m.x - s.x) < 12 && Math.abs(m.y - s.y) < 12))
                if (state.mushrooms.length < before) audioController.playNoise(0.08, 0.15)
                if (playerAlive() && tickN >= invulnUntil && Math.abs(s.x - state.player.x) < 12 && Math.abs(s.y - state.player.y) < 12) killPlayer()
            }

            if (state.scorpion) {
                const s = state.scorpion
                s.wobble++
                if (s.wobble % 36 === 0) s.vy = -s.vy // the zigzag dip
                s.x += s.vx
                s.y += s.vy
                if (s.y < 60) { s.y = 60; s.vy = 1 }
                if (s.y > state.height - 180) { s.y = state.height - 180; s.vy = -1 }
                // Venom trail: every full cap under the streak turns red.
                state.mushrooms.forEach((m) => {
                    if (Math.abs(m.x - s.x) < 10 && Math.abs(m.y - s.y) < 10 && poisonMushroom(m)) {
                        audioController.playTone(900, 0.04, 'sawtooth')
                    }
                })
                if (playerAlive() && tickN >= invulnUntil && Math.abs(s.x - state.player.x) < 12 && Math.abs(s.y - state.player.y) < 12) killPlayer()
                // The streak exits the far side and the desert resumes.
                if (s.x < -20 || s.x > state.width + 4) {
                    state.scorpion = null
                    scorpionAt = tickN + SCORPION_EVERY
                }
            }

            if (state.flea) {
                const f = state.flea
                f.life--
                f.x += f.vx
                f.y += f.vy
                if (f.x < 0) { f.x = 0; f.vx = -f.vx }
                if (f.x > state.width - 16) { f.x = state.width - 16; f.vx = -f.vx }
                if (f.y <= 50) { f.y = 50; f.vy = Math.abs(f.vy) }
                if (f.y >= state.height - 40) { f.y = state.height - 40; f.vy = -Math.abs(f.vy) }
                // Fleas chew the garden too.
                const beforeF = state.mushrooms.length
                state.mushrooms = state.mushrooms.filter((m) => !(Math.abs(m.x - f.x) < 10 && Math.abs(m.y - f.y) < 10))
                if (state.mushrooms.length < beforeF) audioController.playNoise(0.08, 0.15)
                if (playerAlive() && tickN >= invulnUntil && Math.abs(f.x - state.player.x) < 12 && Math.abs(f.y - state.player.y) < 12) killPlayer()
                if (f.life <= 0) state.flea = null // done eating, hops off
            }
        }

        // art(#3413): original Centipede mushrooms — a toadstool silhouette (cap +
        // stem) with a coherent per-health palette (teal→amber→pink, the arcade's
        // "mushroom changes colour as you chew it"), a stepped dome, a lighter cap
        // highlight, a dark underside and cream stem shading. All generated in code;
        // nothing traced. Render-only: the field, hitboxes and health→shrink law are
        // untouched, and the sprite stays inside the same 16px cell the collision
        // code tests (m.x+8 ±8).
        const MUSHROOM_SKIN = {
            3: { cap: '#2fd6c3', dark: '#17988a', lite: '#a6f5ec' },
            2: { cap: '#f0a02e', dark: '#b56d10', lite: '#ffd98f' },
            1: { cap: '#ff5c8a', dark: '#c22f5b', lite: '#ffb6c8' },
        }
        const drawMushroom = (m) => {
            const c = m.poison
                ? { cap: '#ff2d2d', dark: '#a3111a', lite: '#ffb3b3' } // scorpion venom (arcade red)
                : (MUSHROOM_SKIN[m.health] || MUSHROOM_SKIN[1])
            const capW = m.health === 3 ? 12 : m.health === 2 ? 10 : 8
            const capX = m.x + Math.round((16 - capW) / 2)
            const capY = m.y + 2
            const capH = 6
            const stemX = m.x + 6
            const stemY = capY + capH - 1
            // stem (cream, shaded on the right)
            ctx.fillStyle = '#ecdcac'
            ctx.fillRect(stemX, stemY, 4, 4)
            ctx.fillStyle = '#c8b17f'
            ctx.fillRect(stemX + 3, stemY, 1, 4)
            // cap underside shade + body + stepped dome
            ctx.fillStyle = c.dark
            ctx.fillRect(capX, capY + capH - 2, capW, 2)
            ctx.fillStyle = c.cap
            ctx.fillRect(capX, capY + 1, capW, capH - 2)
            ctx.fillRect(capX + 2, capY, capW - 4, 2)
            // top-left highlight
            ctx.fillStyle = c.lite
            ctx.fillRect(capX + 2, capY + 1, 2, 2)
            // toadstool spots on a full mushroom
            if (m.health === 3) {
                ctx.fillStyle = '#ffffff'
                ctx.fillRect(capX + capW - 5, capY + 2, 2, 2)
                ctx.fillRect(capX + 4, capY + 3, 2, 1)
            }
        }

        // #3604 — the menagerie sprites. Chunky 16px pixel bugs in the
        // arcade's roles: the purple eater with eight skittering legs, the
        // orange streak with raised claws and curled tail, the tiny blue
        // hopper. All drawn in code; legs animate on a frame parity like the
        // centipede already does (one clock, one garden).
        const drawSpider = (s) => {
            const step = Math.floor(state.frame / 6) % 2 === 0
            ctx.strokeStyle = '#b48cff'
            for (let i = 0; i < 4; i++) {
                const ly = s.y + 3 + i * 2
                const dx = step ? 5 : 3, dy = step ? -2 : 3
                ctx.beginPath(); ctx.moveTo(s.x + 3, ly); ctx.lineTo(s.x + 3 - dx, ly + dy); ctx.stroke()
                ctx.beginPath(); ctx.moveTo(s.x + 13, ly); ctx.lineTo(s.x + 13 + dx, ly + dy); ctx.stroke()
            }
            ctx.fillStyle = '#7f5cff' // body
            ctx.fillRect(s.x + 3, s.y + 2, 10, 9)
            ctx.fillStyle = '#b48cff' // head + back highlight
            ctx.fillRect(s.x + 5, s.y + 1, 6, 3)
            ctx.fillStyle = '#ffd23f' // eyes
            ctx.fillRect(s.x + 6, s.y + 5, 1, 1)
            ctx.fillRect(s.x + 9, s.y + 5, 1, 1)
        }
        const drawScorpion = (s) => {
            const flip = s.vx < 0
            const px = (o) => (flip ? 15 - o : o) // face the travel direction
            ctx.fillStyle = '#f0a02e'
            ctx.fillRect(s.x + 4, s.y + 6, 8, 4)   // body
            ctx.fillStyle = '#ffd98f'
            ctx.fillRect(s.x + 5, s.y + 6, 5, 1)   // back shine
            // tail: curls up over the back, stinger forward
            const tailX = flip ? 3 : 12
            ctx.fillStyle = '#f0a02e'
            ctx.fillRect(s.x + tailX, s.y + 3, 2, 4)
            ctx.fillRect(s.x + (flip ? 1 : 13), s.y + 1, 2, 2)
            ctx.fillStyle = '#ff5c8a' // stinger tip
            ctx.fillRect(s.x + (flip ? 2 : 12), s.y, 2, 2)
            // claws reach ahead
            ctx.fillStyle = '#f0a02e'
            const clawX = flip ? -2 : 14
            ctx.fillRect(s.x + clawX, s.y + 5, 3, 2)
            ctx.fillRect(s.x + clawX + (flip ? -1 : 2), s.y + 8, 3, 2)
            // legs
            ctx.strokeStyle = '#b56d10'
            const step = Math.floor(state.frame / 4) % 2 === 0
            for (let i = 0; i < 3; i++) {
                const ly = s.y + 7 + i
                ctx.beginPath(); ctx.moveTo(s.x + px(5 + i * 2), ly); ctx.lineTo(s.x + px(4 + i * 2) - (step ? 1 : 0), ly + 3); ctx.stroke()
            }
        }
        const drawFlea = (f) => {
            const hop = Math.floor(state.frame / 5) % 2 === 0
            ctx.fillStyle = '#5c6bff' // the arcade's tiny blue menace
            ctx.fillRect(f.x + 5, f.y + 4, 6, 5)
            ctx.fillStyle = '#a6b4ff'
            ctx.fillRect(f.x + 6, f.y + 4, 3, 2)
            ctx.fillStyle = '#2fd6c3' // eyes
            ctx.fillRect(f.x + 9, f.y + 5, 1, 1)
            // spring legs fold and snap as it drives down the garden
            ctx.strokeStyle = '#5c6bff'
            ctx.beginPath(); ctx.moveTo(f.x + 6, f.y + 9); ctx.lineTo(f.x + (hop ? 3 : 5), f.y + (hop ? 13 : 11)); ctx.stroke()
            ctx.beginPath(); ctx.moveTo(f.x + 10, f.y + 9); ctx.lineTo(f.x + (hop ? 13 : 11), f.y + (hop ? 13 : 11)); ctx.stroke()
        }

        const draw = () => {
            // Bg
            ctx.fillStyle = 'black'
            ctx.fillRect(0, 0, state.width, state.height)

            // Mushrooms — colourful toadstools (was flat white squares); red
            // caps are the scorpion's venom (#3604).
            state.mushrooms.forEach(drawMushroom)

            // The menagerie (#3604): spider, scorpion, flea — over the garden,
            // under the shots.
            if (state.spider) drawSpider(state.spider)
            if (state.scorpion) drawScorpion(state.scorpion)
            if (state.flea) drawFlea(state.flea)

            // Centipede
            state.centipedes.forEach(c => {
                ctx.fillStyle = 'white'
                // Circle
                ctx.beginPath()
                ctx.arc(c.x + 8, c.y + 8, 7, 0, Math.PI * 2)
                ctx.fill()
                // Eyes if head
                if (c.head) { // heads earn their eyes now that cuts spawn heads
                    ctx.fillStyle = 'black'
                    ctx.fillRect(c.x + 4, c.y + 4, 2, 2)
                    ctx.fillRect(c.x + 10, c.y + 4, 2, 2)
                }
                // Legs
                ctx.strokeStyle = 'white'
                if (Math.floor(Date.now() / 100) % 2 === 0) {
                    ctx.beginPath(); ctx.moveTo(c.x, c.y + 8); ctx.lineTo(c.x - 4, c.y + 12); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(c.x + 16, c.y + 8); ctx.lineTo(c.x + 20, c.y + 12); ctx.stroke();
                } else {
                    ctx.beginPath(); ctx.moveTo(c.x, c.y + 8); ctx.lineTo(c.x - 4, c.y + 4); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(c.x + 16, c.y + 8); ctx.lineTo(c.x + 20, c.y + 4); ctx.stroke();
                }
            })

            // Bullets
            ctx.fillStyle = 'white'
            state.bullets.forEach(b => {
                ctx.fillRect(b.x, b.y, 2, 8)
            })

            // Player (Ship) — hidden dark, blinks through the invuln grace
            const blink = tickN < invulnUntil && Math.floor(tickN / 6) % 2 === 0
            if (playerAlive() && !blink) {
                ctx.fillStyle = 'white'
                // Triangle
                ctx.beginPath()
                ctx.moveTo(state.player.x + 8, state.player.y)
                ctx.lineTo(state.player.x + 16, state.player.y + 16)
                ctx.lineTo(state.player.x, state.player.y + 16)
                ctx.fill()
            }

            // UI — title + score right, spare lives bottom-left (arcade layout)
            ctx.fillStyle = 'white'
            ctx.font = '14px monospace'
            ctx.textAlign = 'left'
            ctx.fillText("CENTIPEDE", 10, 20)
            if (!isAttractMode) {
                ctx.textAlign = 'right'
                ctx.fillText(`SCORE ${state.score}`, state.width - 10, 20)
                ctx.textAlign = 'left'
                for (let i = 0; i < Math.max(0, lives - 1); i++) {
                    ctx.beginPath()
                    ctx.arc(16 + i * 18, state.height - 12, 6, 0, Math.PI * 2)
                    ctx.fill()
                }
            }

            if (over) {
                ctx.fillStyle = '#ffffff'
                ctx.textAlign = 'center'
                ctx.font = '22px monospace'
                ctx.fillText('GAME OVER', state.width / 2, state.height / 2 - 8)
                ctx.font = '14px monospace'
                ctx.fillText(`FINAL SCORE ${state.score}`, state.width / 2, state.height / 2 + 14)
                if (Math.floor(tickN / 30) % 2 === 0) {
                    ctx.font = '12px monospace'
                    ctx.fillText('PRESS ANY KEY TO PLAY AGAIN', state.width / 2, state.height / 2 + 36)
                }
            }

            if (isAttractMode) {
                attractTick++
                ctx.fillStyle = DIM
                ctx.fillRect(0, 0, state.width, state.height)
                ctx.textAlign = 'center'
                for (const l of attractFrame(attractTick, state.width, state.height)) {
                    ctx.font = `${l.size}px monospace`
                    ctx.fillStyle = l.col
                    ctx.fillText(l.text, l.x, l.y)
                }
                ctx.textAlign = 'start'
            }
        }

        let lastTime = 0
        let accumulator = 0
        const FIXED_DT = 1000 / 60
        const loop = (timestamp) => {
            if (!lastTime) lastTime = timestamp
            const frameTime = Math.min(timestamp - lastTime, 100)
            lastTime = timestamp
            if (!pausedRef.current) {
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

        // QA contract (#377)
        exposeGame({
            id: 'centipede',
            buttons: ['left', 'right', 'up', 'down', 'a'],
            reset: (s) => {
                seed = s >>> 0
                rand = seedRng(seed)
                state.score = 0
                lives = START_LIVES
                over = false
                isAttractMode = false
                keys.ArrowLeft = keys.ArrowRight = keys.ArrowUp = keys.ArrowDown = keys.Space = false
                if (state.width > 0) init()
            },
            tick: (pad) => {
                if (over) { tickN += 1; return }
                keys.ArrowLeft = !!pad.left
                keys.ArrowRight = !!pad.right
                keys.ArrowUp = !!pad.up
                keys.ArrowDown = !!pad.down
                if (pad.a) fireBullet()
                update()
            },
            state: () => ({
                tick: tickN, score: state.score, done: over, seed: seed, lives,
                segments: state.centipedes.length,
                heads: state.centipedes.filter(c => c.head).length,
                mushrooms: state.mushrooms.length,
                spider: state.spider ? 1 : 0,
                scorpion: state.scorpion ? 1 : 0,
                flea: state.flea ? 1 : 0,
                poisoned: state.mushrooms.filter(m => m.poison).length,
                playerX: Math.round(state.player.x),
                playerY: Math.round(state.player.y),
            }),
            canvas: () => canvas,
            // snapshot/restore omitted: rand closure is not JSON-serializable (#391).
        })

        // production report carries the seed (#1473)
        exposeFeedbackState(() => ({
            tick: tickN, score: state.score, done: over, seed: seed, lives,
        }))

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleUp)
            window.removeEventListener('resize', resize)
            canvas.removeEventListener('pointerdown', handleCanvasTap)
            cancelAnimationFrame(animationFrameId)
            unexposeGame()
            unexposeFeedbackState()
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[3/4] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full" />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'CENTIPEDE')} onResume={handleResume} />}
            </div>
            <VirtualControls />
        </div>
    )
}

export default CentipedeGame

import React, { useEffect, useRef } from 'react'
import { audioController } from '../../utils/AudioController'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'

const DonkeyKongGame = () => {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [paused, setPaused] = React.useState(false)
    const pausedRef = useRef(false)

    const handleResume = () => {
        setPaused(false)
        pausedRef.current = false
        canvasRef.current?.focus()
    }

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        let animationFrameId

        // =============================================
        // GAME WORLD (fixed coordinate system 224 x 256)
        // =============================================
        const GW = 224
        const GH = 256

        const GRAVITY = 0.25
        const JUMP_FORCE = -4.5
        const SPEED = 1.5
        const LADDER_SPEED = 1.2
        const BARREL_SPEED = 1.2

        // Arcade-accurate colors
        const COL_GIRDER = '#d03030'    // red girders
        const COL_LADDER = '#00ffff'    // cyan ladders
        const COL_BG = '#000000'

        let viewWidth = 0, viewHeight = 0

        // =============================================
        // LEVEL DATA - sloped girders like the original
        // =============================================
        // Each platform: { x, y, w, slope } - slope is py change per px (positive = slopes right-down)
        // Ladders: { x, yTop, yBot, broken } - broken ladders only appear intermittently

        const platforms = []
        const ladders = []

        const buildLevel = () => {
            platforms.length = 0
            ladders.length = 0

            const SL = 0.035 // slope magnitude

            // Bottom girder (flat) - ground floor, player starts here
            platforms.push({ x: 0, y: 232, w: GW, slope: 0 })

            // 2nd girder - barrel rolls right (slopes down-right), gap on right
            // Left end is higher, right end lower for barrel to roll right
            platforms.push({ x: 0, y: 192, w: GW - 16, slope: SL })

            // 3rd girder - barrel rolls left (slopes down-left), gap on left
            platforms.push({ x: 16, y: 160, w: GW - 16, slope: -SL })

            // 4th girder - rolls right, gap on right
            platforms.push({ x: 0, y: 128, w: GW - 16, slope: SL })

            // 5th girder - rolls left, gap on left
            platforms.push({ x: 16, y: 96, w: GW - 16, slope: -SL })

            // 6th girder (DK's platform) - barrel starts here, rolls right
            platforms.push({ x: 0, y: 72, w: GW, slope: SL * 0.5 })

            // Top platform (Pauline)
            platforms.push({ x: 72, y: 48, w: 80, slope: 0 })

            // Helper: add a ladder that connects platforms at a given x
            const addLadder = (x, topPlatIdx, botPlatIdx, broken) => {
                const tp = platforms[topPlatIdx]
                const bp = platforms[botPlatIdx]
                const yTop = getPlatformY(tp, x) + 8  // below top platform surface
                const yBot = getPlatformY(bp, x)       // at bottom platform surface
                ladders.push({ x, yTop, yBot, broken })
            }

            // Floor 0 (ground) ↔ Floor 1 (2nd girder)
            addLadder(180, 1, 0, false)
            addLadder(120, 1, 0, true)

            // Floor 1 ↔ Floor 2
            addLadder(40, 2, 1, false)
            addLadder(110, 2, 1, true)

            // Floor 2 ↔ Floor 3
            addLadder(180, 3, 2, false)
            addLadder(140, 3, 2, true)

            // Floor 3 ↔ Floor 4
            addLadder(40, 4, 3, false)
            addLadder(90, 4, 3, true)

            // Floor 4 ↔ Floor 5 (DK's level)
            addLadder(180, 5, 4, false)

            // Floor 5 ↔ Top
            addLadder(100, 6, 5, false)
            addLadder(124, 6, 5, false)
        }

        // Get platform Y at a given X position (accounting for slope)
        const getPlatformY = (plat, px) => {
            return plat.y + plat.slope * (px - plat.x)
        }

        // Find what platform an entity is standing on
        const findPlatform = (ex, ey, eh) => {
            const footY = ey + eh
            for (const p of platforms) {
                if (ex >= p.x - 2 && ex <= p.x + p.w + 2) {
                    const surfaceY = getPlatformY(p, ex)
                    if (footY >= surfaceY - 2 && footY <= surfaceY + 6) {
                        return p
                    }
                }
            }
            return null
        }

        // =============================================
        // GAME STATE
        // =============================================
        let player = {
            x: 24, y: 216, w: 11, h: 16,
            vx: 0, vy: 0,
            grounded: false, climbing: false,
            dir: 1, frame: 0, walkFrame: 0, climbFrame: 0,
            jumpedBarrels: new Set()
        }

        let barrels = []
        let barrelTimer = 180
        let score = 0
        let lives = 3
        let gameOver = false
        let deathTimer = 0
        let winTimer = 0
        let isAttractMode = true
        let dkAnimFrame = 0
        let dkAnimTimer = 0
        let dkThrowing = false
        let dkThrowTimer = 0
        let tickCount = 0

        const resetPlayer = () => {
            player.x = 24
            player.y = 216
            player.vx = 0
            player.vy = 0
            player.grounded = false
            player.climbing = false
            player.dir = 1
            player.frame = 0
            player.jumpedBarrels = new Set()
            barrels = []
            barrelTimer = 180
            deathTimer = 0
            winTimer = 0
        }

        // =============================================
        // RESIZE
        // =============================================
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
                viewWidth = width
                viewHeight = height
                if (!initialized) {
                    buildLevel()
                    initialized = true
                }
            }
        }
        window.addEventListener('resize', resize)
        resize()

        // =============================================
        // INPUT
        // =============================================
        const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false }

        const handleKeyDown = (e) => {
            if (e.key === '?' || (e.shiftKey && e.key === '/')) {
                const newState = !pausedRef.current
                pausedRef.current = newState
                setPaused(newState)
                return
            }
            if (pausedRef.current) return

            if (isAttractMode) {
                isAttractMode = false
                resetPlayer()
            }
            if (gameOver) {
                gameOver = false
                score = 0
                lives = 3
                resetPlayer()
            }
            if (keys.hasOwnProperty(e.code)) {
                keys[e.code] = true
            }
            if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'Space') {
                e.preventDefault()
            }
        }
        const handleKeyUp = (e) => {
            if (keys.hasOwnProperty(e.code)) {
                keys[e.code] = false
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)

        // =============================================
        // UPDATE
        // =============================================
        const update = () => {
            if (gameOver) return
            tickCount++

            // Death animation
            if (deathTimer > 0) {
                deathTimer--
                if (deathTimer <= 0) {
                    lives--
                    if (lives <= 0) {
                        gameOver = true
                    } else {
                        resetPlayer()
                    }
                }
                return
            }

            // Win animation
            if (winTimer > 0) {
                winTimer--
                if (winTimer <= 0) {
                    score += 1000
                    resetPlayer()
                }
                return
            }

            // DK animation
            dkAnimTimer++
            if (dkAnimTimer > 15) {
                dkAnimTimer = 0
                dkAnimFrame = (dkAnimFrame + 1) % 2
            }

            // DK throwing animation
            if (dkThrowing) {
                dkThrowTimer--
                if (dkThrowTimer <= 0) dkThrowing = false
            }

            // ---- CONTROLS ----
            let moveDir = 0
            let wantJump = false
            let wantClimbUp = false
            let wantClimbDown = false

            if (isAttractMode) {
                // Simple AI: run toward nearest ladder, climb up, dodge barrels
                const playerFloor = platforms.findIndex(p =>
                    player.x >= p.x && player.x <= p.x + p.w &&
                    Math.abs((player.y + player.h) - getPlatformY(p, player.x)) < 4
                )

                if (player.climbing) {
                    wantClimbUp = true
                } else {
                    // Find nearest ladder that goes up
                    let bestLadder = null
                    let bestDist = Infinity
                    for (const l of ladders) {
                        if (l.broken) continue
                        const footY = player.y + player.h
                        // Ladder bottom should be near player's feet
                        if (Math.abs(l.yBot - footY) < 6) {
                            const dist = Math.abs(player.x - l.x)
                            if (dist < bestDist) {
                                bestDist = dist
                                bestLadder = l
                            }
                        }
                    }

                    if (bestLadder && bestDist < 6) {
                        wantClimbUp = true
                    } else if (bestLadder) {
                        moveDir = bestLadder.x > player.x ? 1 : -1
                    } else {
                        moveDir = player.dir
                        if (player.x < 20) moveDir = 1
                        if (player.x > GW - 20) moveDir = -1
                    }

                    // Dodge barrels
                    for (const b of barrels) {
                        if (Math.abs(b.y - player.y) < 16 &&
                            Math.abs(b.x - player.x) < 30 &&
                            player.grounded) {
                            wantJump = true
                        }
                    }
                }
            } else {
                if (keys.ArrowLeft) moveDir = -1
                if (keys.ArrowRight) moveDir = 1
                if (keys.ArrowUp) wantClimbUp = true
                if (keys.ArrowDown) wantClimbDown = true
                if (keys.Space && player.grounded && !player.climbing) wantJump = true
            }

            // ---- LADDER LOGIC ----
            const nearLadder = ladders.find(l => {
                if (l.broken) return false
                const cx = player.x + player.w / 2
                return Math.abs(cx - l.x) < 8 &&
                    player.y + player.h > l.yTop &&
                    player.y + player.h <= l.yBot + 4
            })

            if (player.climbing) {
                if (wantClimbUp) {
                    player.y -= LADDER_SPEED
                    player.climbFrame++
                } else if (wantClimbDown) {
                    player.y += LADDER_SPEED
                    player.climbFrame++
                }
                player.vx = 0
                player.vy = 0

                // Check if reached top or bottom of ladder
                if (!nearLadder) {
                    player.climbing = false
                    // Snap to nearest platform
                    const plat = findPlatform(player.x + player.w / 2, player.y, player.h)
                    if (plat) {
                        player.y = getPlatformY(plat, player.x + player.w / 2) - player.h
                        player.grounded = true
                    }
                }
            } else {
                // Try to mount ladder
                if (nearLadder && (wantClimbUp || wantClimbDown)) {
                    player.x = nearLadder.x - player.w / 2
                    player.climbing = true
                    player.vy = 0
                    player.vx = 0
                }

                if (!player.climbing) {
                    player.vx = moveDir * SPEED
                    if (moveDir !== 0) player.dir = moveDir

                    if (wantJump && player.grounded) {
                        player.vy = JUMP_FORCE
                        player.grounded = false
                        audioController.playTone(400, 0.08, 'square')
                    }
                }
            }

            // ---- PHYSICS ----
            if (!player.climbing) {
                player.vy += GRAVITY
                player.y += player.vy
                player.x += player.vx
            }

            // Walking animation
            if (Math.abs(player.vx) > 0.1 && player.grounded) {
                player.walkFrame++
            }
            player.frame++

            // Platform collision
            player.grounded = false
            if (!player.climbing && player.vy >= 0) {
                for (const p of platforms) {
                    const cx = player.x + player.w / 2
                    if (cx >= p.x && cx <= p.x + p.w) {
                        const surfaceY = getPlatformY(p, cx)
                        if (player.y + player.h >= surfaceY && player.y + player.h < surfaceY + 8) {
                            player.y = surfaceY - player.h
                            player.vy = 0
                            player.grounded = true
                            break
                        }
                    }
                }
            }

            // Wall constraints
            if (player.x < 0) player.x = 0
            if (player.x > GW - player.w) player.x = GW - player.w

            // Fall death
            if (player.y > GH + 10) {
                killPlayer()
            }

            // ---- BARRELS ----
            barrelTimer--
            if (barrelTimer <= 0) {
                spawnBarrel()
                barrelTimer = 150 + Math.floor(Math.random() * 100)
            }

            for (let i = barrels.length - 1; i >= 0; i--) {
                const b = barrels[i]
                updateBarrel(b)

                // Remove if off screen
                if (b.y > GH + 20) {
                    barrels.splice(i, 1)
                    continue
                }

                // Collision with player
                if (deathTimer <= 0 && winTimer <= 0) {
                    const dx = (player.x + player.w / 2) - (b.x + b.w / 2)
                    const dy = (player.y + player.h / 2) - (b.y + b.h / 2)
                    if (Math.abs(dx) < 8 && Math.abs(dy) < 10) {
                        killPlayer()
                    }

                    // Score for jumping over barrels
                    if (player.vy < 0 || !player.grounded) {
                        if (Math.abs(dx) < 16 && dy < 0 && dy > -24 && !player.jumpedBarrels.has(b)) {
                            player.jumpedBarrels.add(b)
                            score += 100
                            audioController.playTone(600, 0.08, 'square')
                        }
                    }
                }
            }

            // ---- WIN CONDITION ----
            if (player.y + player.h < 56 && player.x > 72 && player.x < 152) {
                winTimer = 90
                audioController.playSweep(400, 1000, 0.8, 'square')
            }
        }

        const killPlayer = () => {
            if (deathTimer > 0) return
            deathTimer = 90
            audioController.playNoise(0.3, 0.4)
            audioController.playSweep(400, 80, 0.4, 'sawtooth')
        }

        const spawnBarrel = () => {
            dkThrowing = true
            dkThrowTimer = 30
            // Spawn near DK, on the 6th platform
            const dkPlat = platforms[5]
            const spawnX = 48
            const spawnY = dkPlat ? getPlatformY(dkPlat, spawnX) - 10 : 60
            barrels.push({
                x: spawnX, y: spawnY,
                w: 10, h: 10,
                vx: BARREL_SPEED, vy: 0,
                rot: 0,
                onLadder: false,
                falling: false
            })
        }

        const updateBarrel = (b) => {
            if (b.onLadder) {
                // Rolling down a ladder
                b.y += 1.5
                b.rot += 0.1

                // Check if reached bottom of ladder
                if (b.y + b.h >= (b.ladderBot || 999)) {
                    b.onLadder = false
                    b.falling = false
                    // Find the platform at the bottom
                    const onPlat = findPlatform(b.x + b.w / 2, b.y, b.h)
                    if (onPlat) {
                        const surfaceY = getPlatformY(onPlat, b.x + b.w / 2)
                        b.y = surfaceY - b.h
                        b.vy = 0
                        if (onPlat.slope < 0) b.vx = -BARREL_SPEED
                        else if (onPlat.slope > 0) b.vx = BARREL_SPEED
                        else b.vx = BARREL_SPEED
                    } else {
                        // Fell off — just apply gravity
                        b.vy = 0
                        b.vx = BARREL_SPEED
                    }
                }
                return
            }

            // Apply gravity
            b.vy += GRAVITY
            b.y += b.vy
            b.x += b.vx
            b.rot += b.vx * 0.15

            // Platform collision
            let landed = false
            for (const p of platforms) {
                const cx = b.x + b.w / 2
                if (cx >= p.x && cx <= p.x + p.w) {
                    const surfaceY = getPlatformY(p, cx)
                    if (b.y + b.h >= surfaceY && b.y + b.h < surfaceY + 10 && b.vy >= 0) {
                        b.y = surfaceY - b.h
                        b.vy = 0
                        b.falling = false
                        landed = true

                        // Roll in direction of slope
                        if (p.slope < 0) b.vx = -BARREL_SPEED
                        else if (p.slope > 0) b.vx = BARREL_SPEED
                        break
                    }
                }
            }

            // Check if barrel should take a ladder down
            if (landed && !b.falling) {
                for (const l of ladders) {
                    if (l.broken) continue
                    const cx = b.x + b.w / 2
                    // Barrel feet should be near the top of this ladder
                    // yTop is 8px below the upper platform, so barrel feet ~ yTop - 8
                    if (Math.abs(cx - l.x) < 6 && Math.abs((b.y + b.h) - (l.yTop - 8)) < 6) {
                        // Random chance to take ladder (like the original)
                        if (Math.random() < 0.35) {
                            b.onLadder = true
                            b.x = l.x - b.w / 2
                            b.vx = 0
                            b.vy = 0
                            b.ladderBot = l.yBot
                            break
                        }
                    }
                }
            }

            // Edge of platform — fall off
            if (!b.onLadder) {
                const onPlat = findPlatform(b.x + b.w / 2, b.y, b.h)
                if (!onPlat && b.vy === 0) {
                    b.falling = true
                }
            }
        }

        // =============================================
        // DRAWING
        // =============================================
        const drawGirder = (p) => {
            ctx.fillStyle = COL_GIRDER
            // Draw platform as a series of small girder bricks
            const brickW = 8
            const brickH = 4
            for (let bx = p.x; bx < p.x + p.w; bx += brickW) {
                const by = getPlatformY(p, bx)
                const bw = Math.min(brickW, p.x + p.w - bx)
                // Two rows of bricks, offset
                ctx.fillRect(bx, by, bw - 0.5, brickH)
                ctx.fillRect(bx, by + brickH, bw - 0.5, brickH)
                // Darker line between rows
                ctx.fillStyle = '#801818'
                ctx.fillRect(bx, by + brickH - 0.5, bw, 1)
                ctx.fillStyle = COL_GIRDER
            }
        }

        const drawLadder = (l) => {
            ctx.strokeStyle = COL_LADDER
            ctx.lineWidth = 1
            const h = l.yBot - l.yTop
            // Uprights
            ctx.fillStyle = COL_LADDER
            ctx.fillRect(l.x - 4, l.yTop, 1.5, h)
            ctx.fillRect(l.x + 3, l.yTop, 1.5, h)
            // Rungs
            for (let ry = l.yTop + 4; ry < l.yBot; ry += 6) {
                ctx.fillRect(l.x - 4, ry, 8.5, 1.5)
            }
        }

        const drawOilBarrel = () => {
            const ox = 8, oy = 224
            // Barrel shape
            ctx.fillStyle = '#0088ff'
            ctx.fillRect(ox, oy, 16, 20)
            ctx.fillStyle = '#00aaff'
            ctx.fillRect(ox + 2, oy + 2, 12, 4)
            ctx.fillRect(ox + 2, oy + 14, 12, 4)
            // OIL text
            ctx.fillStyle = '#ffffff'
            ctx.font = '5px monospace'
            ctx.textAlign = 'center'
            ctx.fillText('OIL', ox + 8, oy + 13)
            // Fire flicker
            if (tickCount % 10 < 5) {
                ctx.fillStyle = '#ff6600'
                ctx.fillRect(ox + 4, oy - 4, 3, 4)
                ctx.fillRect(ox + 9, oy - 6, 3, 6)
                ctx.fillStyle = '#ffff00'
                ctx.fillRect(ox + 5, oy - 2, 2, 2)
                ctx.fillRect(ox + 10, oy - 3, 2, 3)
            } else {
                ctx.fillStyle = '#ff6600'
                ctx.fillRect(ox + 5, oy - 5, 3, 5)
                ctx.fillRect(ox + 8, oy - 3, 3, 3)
                ctx.fillStyle = '#ffff00'
                ctx.fillRect(ox + 6, oy - 2, 2, 2)
            }
        }

        const drawDK = () => {
            // DK position: on 6th platform (index 5), left side
            const dkPlat = platforms[5]
            const dkX = 16
            const dkY = (dkPlat ? getPlatformY(dkPlat, dkX + 14) : 72) - 28
            const s = 1 // pixel scale

            ctx.fillStyle = '#c84c0c' // brown
            // Body
            ctx.fillRect(dkX + 4*s, dkY + 8*s, 20*s, 12*s)
            // Head
            ctx.fillRect(dkX + 6*s, dkY, 16*s, 10*s)
            // Brow
            ctx.fillStyle = '#000000'
            ctx.fillRect(dkX + 8*s, dkY + 2*s, 12*s, 2*s)
            // Face
            ctx.fillStyle = '#e8a060'
            ctx.fillRect(dkX + 8*s, dkY + 4*s, 12*s, 5*s)
            // Eyes
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(dkX + 10*s, dkY + 4*s, 3*s, 2*s)
            ctx.fillRect(dkX + 16*s, dkY + 4*s, 3*s, 2*s)
            ctx.fillStyle = '#000000'
            ctx.fillRect(dkX + 11*s, dkY + 4*s, 1.5*s, 2*s)
            ctx.fillRect(dkX + 17*s, dkY + 4*s, 1.5*s, 2*s)
            // Mouth
            ctx.fillStyle = '#000000'
            ctx.fillRect(dkX + 12*s, dkY + 7*s, 6*s, 1.5*s)

            ctx.fillStyle = '#c84c0c'
            // Arms
            if (dkThrowing) {
                // Throwing pose: arms forward
                ctx.fillRect(dkX + 22*s, dkY + 8*s, 6*s, 4*s)
                ctx.fillRect(dkX - 2*s, dkY + 10*s, 6*s, 4*s)
            } else if (dkAnimFrame === 0) {
                // Beat chest pose 1
                ctx.fillRect(dkX - 2*s, dkY + 8*s, 6*s, 4*s)
                ctx.fillRect(dkX + 24*s, dkY + 8*s, 6*s, 4*s)
            } else {
                // Beat chest pose 2
                ctx.fillRect(dkX, dkY + 6*s, 4*s, 6*s)
                ctx.fillRect(dkX + 22*s, dkY + 6*s, 4*s, 6*s)
            }
            // Legs
            ctx.fillRect(dkX + 6*s, dkY + 20*s, 6*s, 6*s)
            ctx.fillRect(dkX + 16*s, dkY + 20*s, 6*s, 6*s)
        }

        const drawPauline = () => {
            const topPlat = platforms[6]
            const px = topPlat ? topPlat.x + topPlat.w / 2 - 4 : 108
            const py = topPlat ? getPlatformY(topPlat, px + 4) - 20 : 28
            // Dress (pink)
            ctx.fillStyle = '#ff88aa'
            ctx.beginPath()
            ctx.moveTo(px, py + 16)
            ctx.lineTo(px + 4, py + 6)
            ctx.lineTo(px + 8, py + 16)
            ctx.fill()
            // Head
            ctx.fillStyle = '#e8a060'
            ctx.fillRect(px + 2, py, 4, 5)
            // Hair
            ctx.fillStyle = '#ff88aa'
            ctx.fillRect(px + 1, py - 1, 6, 2)
            // HELP text
            if (tickCount % 60 < 40) {
                ctx.fillStyle = '#ffffff'
                ctx.font = '5px monospace'
                ctx.textAlign = 'center'
                ctx.fillText('HELP!', px + 4, py - 4)
            }
        }

        const drawMario = () => {
            const mx = player.x
            const my = player.y
            const dir = player.dir

            ctx.save()
            ctx.translate(mx + player.w / 2, my + player.h)
            ctx.scale(dir, 1)

            if (deathTimer > 0) {
                // Death spin animation
                const angle = (90 - deathTimer) * 0.15
                ctx.rotate(angle)
                // Draw simple X
                ctx.strokeStyle = '#ff0000'
                ctx.lineWidth = 2
                ctx.beginPath()
                ctx.moveTo(-5, -14); ctx.lineTo(5, -2)
                ctx.moveTo(5, -14); ctx.lineTo(-5, -2)
                ctx.stroke()
                ctx.restore()
                return
            }

            // Hat (red)
            ctx.fillStyle = '#e40000'
            ctx.fillRect(-4, -16, 10, 3)
            ctx.fillRect(-5, -13, 3, 2)

            // Head (skin)
            ctx.fillStyle = '#e8a060'
            ctx.fillRect(-4, -13, 8, 5)

            // Eyes
            ctx.fillStyle = '#000000'
            ctx.fillRect(1, -12, 2, 2)

            // Body (blue overalls over red shirt)
            ctx.fillStyle = '#e40000'
            ctx.fillRect(-5, -8, 10, 4)
            ctx.fillStyle = '#0000cc'
            ctx.fillRect(-4, -6, 8, 5)

            // Belt
            ctx.fillStyle = '#ffff00'
            ctx.fillRect(-3, -6, 6, 1)

            if (player.climbing) {
                // Climbing animation
                const climbOff = (Math.floor(player.climbFrame / 6) % 2) * 2
                ctx.fillStyle = '#e8a060'
                ctx.fillRect(-5, -1, 3, 3 + climbOff)
                ctx.fillRect(2, -1, 3, 3 + (2 - climbOff))
                // Arms on ladder
                ctx.fillRect(-6, -10 - climbOff, 3, 3)
                ctx.fillRect(3, -10 - (2 - climbOff), 3, 3)
            } else if (Math.abs(player.vx) > 0.3 && player.grounded) {
                // Walking animation
                const step = Math.floor(player.walkFrame / 4) % 4
                ctx.fillStyle = '#e8a060'
                if (step < 2) {
                    ctx.fillRect(-4, -1, 3, 4)
                    ctx.fillRect(2, -1, 3, 3)
                } else {
                    ctx.fillRect(-4, -1, 3, 3)
                    ctx.fillRect(2, -1, 3, 4)
                }
            } else if (!player.grounded) {
                // Jumping
                ctx.fillStyle = '#e8a060'
                ctx.fillRect(-5, -1, 3, 2)
                ctx.fillRect(3, -1, 3, 2)
            } else {
                // Standing
                ctx.fillStyle = '#e8a060'
                ctx.fillRect(-4, -1, 3, 3)
                ctx.fillRect(2, -1, 3, 3)
            }

            ctx.restore()
        }

        const drawBarrel = (b) => {
            ctx.save()
            ctx.translate(b.x + b.w / 2, b.y + b.h / 2)
            if (!b.onLadder) {
                ctx.rotate(b.rot)
            }

            // Barrel body
            ctx.fillStyle = '#c84c0c'
            ctx.beginPath()
            ctx.arc(0, 0, b.w / 2, 0, Math.PI * 2)
            ctx.fill()

            // Barrel bands
            ctx.strokeStyle = '#ffcc00'
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.arc(0, 0, b.w / 2, 0, Math.PI * 2)
            ctx.stroke()
            // Cross detail
            ctx.beginPath()
            ctx.moveTo(-b.w / 3, 0); ctx.lineTo(b.w / 3, 0)
            ctx.moveTo(0, -b.w / 3); ctx.lineTo(0, b.w / 3)
            ctx.stroke()

            ctx.restore()
        }

        const drawHUD = (sx, sy, scale) => {
            // Draw in screen space
            ctx.fillStyle = '#ffffff'
            ctx.font = `${10 * scale}px monospace`
            ctx.textAlign = 'left'
            ctx.fillText(`SCORE`, sx + 4 * scale, sy - 12 * scale)
            ctx.fillStyle = '#00ffff'
            ctx.fillText(`${score}`, sx + 4 * scale, sy - 4 * scale)

            // Lives
            ctx.fillStyle = '#ffffff'
            ctx.textAlign = 'right'
            const livesX = sx + GW * scale
            for (let i = 0; i < lives; i++) {
                // Small mario head icon
                ctx.fillStyle = '#e40000'
                ctx.fillRect(livesX - 12 * scale - i * 14 * scale, sy - 12 * scale, 8 * scale, 4 * scale)
                ctx.fillStyle = '#e8a060'
                ctx.fillRect(livesX - 11 * scale - i * 14 * scale, sy - 8 * scale, 6 * scale, 4 * scale)
            }
        }

        // =============================================
        // MAIN DRAW
        // =============================================
        const draw = () => {
            ctx.fillStyle = COL_BG
            ctx.fillRect(0, 0, viewWidth, viewHeight)

            // Scale game world to fit view
            const scale = Math.min(viewWidth / GW, viewHeight / (GH + 24)) * 0.95
            const offsetX = (viewWidth - GW * scale) / 2
            const offsetY = (viewHeight - GH * scale) / 2 + 12 * scale

            // HUD above the game area
            drawHUD(offsetX, offsetY, scale)

            ctx.save()
            ctx.translate(offsetX, offsetY)
            ctx.scale(scale, scale)

            // Platforms
            platforms.forEach(p => drawGirder(p))

            // Ladders (broken ones flicker)
            ladders.forEach(l => {
                if (l.broken && tickCount % 30 < 15) return
                drawLadder(l)
            })

            // Oil barrel
            drawOilBarrel()

            // DK
            drawDK()

            // Pauline
            drawPauline()

            // Barrels
            barrels.forEach(b => drawBarrel(b))

            // Player
            drawMario()

            // Attract mode overlay
            if (isAttractMode) {
                ctx.fillStyle = 'rgba(0,0,0,0.4)'
                ctx.fillRect(0, 0, GW, GH)
                ctx.fillStyle = '#ffffff'
                ctx.font = '10px monospace'
                ctx.textAlign = 'center'
                ctx.fillText('PRESS ANY KEY', GW / 2, GH / 2 - 8)
                ctx.fillText('TO START', GW / 2, GH / 2 + 4)
            }

            // Game over
            if (gameOver) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)'
                ctx.fillRect(0, 0, GW, GH)
                ctx.fillStyle = '#ff0000'
                ctx.font = '12px monospace'
                ctx.textAlign = 'center'
                ctx.fillText('GAME OVER', GW / 2, GH / 2)
            }

            ctx.restore()
        }

        // =============================================
        // GAME LOOP
        // =============================================
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

        return () => {
            window.removeEventListener('resize', resize)
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
            cancelAnimationFrame(animationFrameId)
        }
    }, [])

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
            <div ref={containerRef} className="relative w-full max-w-[600px] aspect-[3/4] border-2 border-neutral-800 rounded-lg overflow-hidden shadow-2xl shadow-neutral-900 bg-black">
                <canvas ref={canvasRef} className="block w-full h-full" />
                {paused && <PauseOverlay game={GAMES.find(g => g.label === 'DONKEY KONG')} onResume={handleResume} />}
            </div>
            <VirtualControls />
        </div>
    )
}

export default DonkeyKongGame

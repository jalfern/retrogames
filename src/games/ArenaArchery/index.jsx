// ARENA ARCHERY — the arcade shell. The duel lives in ./sim.js (pure,
// (state,inputs) at 30 Hz, P1-then-P2 stamp per tick) and the two carved
// grounds in ./levels.js; this file only paints, listens, and proves the
// issue's muscles on screen:
//
//   - ballistics      → arrows are drawn along the sim's own (vx,vy); the
//     arc the solver aimed along is the arc the pixels trace,
//   - stuck = terrain → stuck arrows are painted from gs.stuck (the same
//     array the knockout chain reads), pulled arrows vanish the tick the
//     sim says `pull`,
//   - determinism     → attract mode IS recordMatch()'s proven input stream
//     fed back through the real step(), tick for tick; the DEV hook
//     re-replays your own stream and compares hashes.
//
// One stick per archer: arrows/WASD aim and move, SPACE/F draws, release
// looses. Up is jump AND the 45° lob — TowerFall's own bargain. The duel
// (`2` at the marquee) is the desktop-keyboard option per AGENTS.md's
// multiplayer law — on a phone one pad drives you against the autopilot.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { PRESS, MESSAGES } from './attract.js'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { CFG, makeGame, step, botInput, recordMatch, replay, stateHash, cloneGame, heatWarnStep } from './sim.js'
import { ARENAS_COUNT, ARENA_NAMES, buildArena } from './levels.js'
import { exposeFeedbackState, unexposeFeedbackState } from '../../utils/gameContract'
import WatchButton, { WatchToast, AttractWatchButton } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog, WATCH_ATTRACT_HINT } from '../../utils/watch'

const SIM_MS = 1000 / 30
// #2565 item 3 — duel ceremony. TowerFall announces a two-seat match with a
// distinct beat before the first draw: seat pings, then DRAW. Presentation +
// audio only: the fixed-step accumulator HOLDS while the ceremony rings, so
// world ticks are delayed, never skipped or added (the #2565 hit-stop law) —
// the sim, its command stream and every replay hash stay untouched.
const CEREMONY_MS = 900
const CER_PING2_MS = 300   // seat-2 ping after seat-1
const CER_DRAW_MS = 600    // the DRAW! beat
const HOME_LIFE = 18 // #2385 sim ticks a rotted shaft takes to fly home to its quiver
const CW = CFG.cell
const A0 = buildArena(0)
const PXW = A0.W * CW
const PXH = A0.H * CW

const P1_KEYS = { l: 'ArrowLeft', r: 'ArrowRight', u: 'ArrowUp', d: 'ArrowDown', f: 'Space' }
const P2_KEYS = { l: 'KeyA', r: 'KeyD', u: 'KeyW', d: 'KeyS', f: 'KeyF' }
const KEY_SET = new Set([...Object.values(P1_KEYS), ...Object.values(P2_KEYS)])
// #1637 WATCH: seat-2 codes never unseat the watcher — your duel partner
// keeps their seat (the Smash TV rule from batch 2).
const P2_CODES = new Set(Object.values(P2_KEYS))

const inputOf = (held, map) => ({
    mx: (held.has(map.r) ? 1 : 0) - (held.has(map.l) ? 1 : 0),
    my: (held.has(map.u) ? 1 : 0) - (held.has(map.d) ? 1 : 0),
    fire: held.has(map.f),
})

const demoCache = new Map()
const demoFor = (i) => {
    if (!demoCache.has(i)) {
        const g = recordMatch({ arena: i })
        demoCache.set(i, { cmds: g.cmds.map((c) => ({ ...c })), arena: i })
    }
    return demoCache.get(i)
}

const ArenaArcheryGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const [watching, setWatching] = useState(false) // #1637 WATCH: the arena-winning autopilot takes seat 1
    const watchingRef = useRef(false)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const modeRef = useRef('1p')
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.archeryStage = '1'
        canvas.width = PXW; canvas.height = PXH
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        const bg = document.createElement('canvas')
        bg.width = PXW; bg.height = PXH
        const bgx = bg.getContext('2d')
        let bgDirty = true

        let arenaIdx = 0
        let gs = makeGame(buildArena(0))
        let mode = '1p'
        let raf = 0, last = 0, acc = 0
        let toast = 0, toastMsg = ''
        const held = new Set()
        let demo = null, demoG = null, demoBy = null

        // #2314 climb juice: the world must SAY the climb happened. Every
        // effect is DERIVED from the sim's own transitions (the sim stays
        // pure — it never knows a puff exists):
        //   land:    air -> grounded; the fall is measured from the air's top,
        //            so a one-row step lands true. Puff ring at the feet,
        //            squash, and a thud whose pitch drops with the fall.
        //   take-off: grounded -> air on a jump press — a stretch.
        //   head-bump: a jump press that CANNOT leave the ground. The sim's
        //            'jump' event only fires on success, so a wasted press is
        //            derived from the input: one dull tock per airtime,
        //            latched, so a held key doesn't rattle.
        // Dust ages in WORLD time (per sim tick): it freezes on pause, like
        // the stone.
        const puffs = []            // {x, y, r, age, life, ash?}
        const home = []            // #2385 dryout: a shaft flying back to its quiver {sx, sy, owner, t}
        const squash = [0, 0]       // sim ticks: >0 land squash, <0 take-off stretch
        const airTop = [null, null]
        const prevGrounded = [true, true]
        const prevAlive = [true, true]
        const airPress = [false, false]
        let landCount = 0, blockCount = 0
        let warnLatch = 0          // #2385 last telegraph note rung this dry spell
        let warnNotes = 0, dryFx = 0 // receipts: notes rung, dryout FX spawned
        // #2565 KILL JUICE. A hit must pay like TowerFall: the board flinches.
        // All derived-only — the sim and its hashes never know:
        //   hit-stop: the fixed-step accumulator holds ~3 frames, so the world
        //             pauses on the blow (the commands stream is untouched —
        //             ticks are delayed, never skipped or added);
        //   shake:    every paint offset along a stepped table (no Math.random,
        //             so a capture stays reproducible frame-for-frame);
        //   burst:    the victim's fall spot blooms in rings tinted with the
        //             victim's seat colour + a low THUD under the existing crack.
        // killFx is the receipt the browser harness grades.
        const SHAKE_PAT = [[0, 3], [-2, -2], [3, -1], [-3, 2], [2, 3], [-1, -3], [3, 1], [-2, 2]]
        let shake = 0            // paint frames of flinch remaining
        let hitstop = 0          // sim-ms the accumulator holds
        let ceremony = 0         // #2565 item 3: ms of duel ceremony left (world holds)
        let killFx = 0           // receipts: kills that made the board flinch
        const seatLoose = [0, 0] // #2565 receipts: looses counted per seat (the pitch split is readable by ear)
        // #2565 item 3 duel ceremony receipts: pings rung (P1 then P2) and the
        // DRAW beat landed. The browser harness grades these + the painted chips.
        const seatPing = [0, 0]
        let drawBeat = 0

        const resetJuice = () => {
            puffs.length = 0
            home.length = 0
            for (let i = 0; i < 2; i++) {
                squash[i] = 0; airTop[i] = null
                prevGrounded[i] = true; prevAlive[i] = true; airPress[i] = false
                seatLoose[i] = 0
            }
            landCount = 0; blockCount = 0
            warnLatch = 0
            killFx = 0; shake = 0; hitstop = 0
            ceremony = 0; seatPing[0] = 0; seatPing[1] = 0; drawBeat = 0
        }

        const detectJuice = (in1, in2) => {
            for (const u of puffs) u.age++
            while (puffs.length && puffs[0].age >= puffs[0].life) puffs.shift()
            for (const hz of home) hz.t++
            while (home.length && home[0].t >= HOME_LIFE) home.shift()
            // #2385 the heat telegraph: two rising notes across the last two
            // seconds of the cool dry spell, rung off the sim's own stamps so
            // pause freezes the warning with the stone. A hit (dry snaps back)
            // re-arms the latch; once HOT the rumble owns the voice.
            const dry = gs.tick - gs.lastHit
            const ws = heatWarnStep(dry)
            if (dry <= CFG.heatTicks - CFG.heatWarnLead) warnLatch = 0
            if (ws > warnLatch) {
                warnLatch = ws
                warnNotes++
                audioController.playTone(ws === 1 ? 240 : 320, 0.07 + ws * 0.02, 'triangle', 0.03)
            }
            for (let i = 0; i < 2; i++) {
                const p = gs.p[i]
                const inp = [in1, in2][i]
                if (squash[i] > 0) squash[i]--
                else if (squash[i] < 0) squash[i]++
                if (!p.alive || !prevAlive[i]) {
                    prevAlive[i] = p.alive; prevGrounded[i] = p.grounded; airPress[i] = false
                    continue
                }
                if (!prevGrounded[i] && p.grounded) {
                    const drop = airTop[i] != null ? p.y - airTop[i] : 0
                    landCount++
                    if (drop >= 12) {
                        puffs.push({ x: p.x, y: p.y + 8, r: 4 + Math.min(8, drop * 0.12), age: 0, life: 42 })
                        squash[i] = 6
                        // the thud: a harder fall drops the pitch and holds it longer
                        const d = Math.min(drop, 96)
                        audioController.playTone(150 - (d - 8) * 0.7, 0.05 + d * 0.0004, 'sine', 0.05 + d * 0.0003)
                    }
                    airTop[i] = null
                } else if (!p.grounded) {
                    if (prevGrounded[i] && inp && inp.my > 0) squash[i] = -5 // take-off
                    airTop[i] = Math.min(airTop[i] ?? p.y, p.y)
                }
                if (inp && inp.my > 0 && !prevGrounded[i] && !p.grounded && !airPress[i]) {
                    blockCount++
                    airPress[i] = true
                    if (squash[i] >= 0) squash[i] = -3
                    audioController.playTone(90, 0.04, 'sine', 0.035) // dull tock against stone
                }
                if (p.grounded) airPress[i] = false
                prevAlive[i] = true
                prevGrounded[i] = p.grounded
            }
        }

        const say = (m) => { toastMsg = m; toast = 110 }

        // #3873 art pass — the night vault: deterministic hash (no Math.random)
        // so captures stay reproducible. Stars, moon, distant battlements and
        // per-cell shade variance all derive from (x, y) — the same arena
        // always looks the same. Painted once per arena into the cached `bg`
        // canvas; gameplay, sim and replay hashes never see it.
        const hash2 = (x, y) => {
            let h = (x * 374761393 + y * 668265263) ^ 0x9e3779b9
            h = Math.imul(h ^ (h >>> 13), 1274126177) ^ (h >>> 16)
            return (h >>> 0) / 4294967296
        }

        const paintBg = (g) => {
            // sky: deep zenith down to a warm haze at the horizon
            const grd = bgx.createLinearGradient(0, 0, 0, PXH)
            grd.addColorStop(0, '#070912')
            grd.addColorStop(0.55, '#111731')
            grd.addColorStop(0.82, '#251e3a')
            grd.addColorStop(1, '#1a1226')
            bgx.fillStyle = grd
            bgx.fillRect(0, 0, PXW, PXH)

            // faint stars — one dark pixel each, the same sky in every vault
            for (let i = 0; i < 26; i++) {
                const sx = hash2(i, 11) * PXW
                const sy = hash2(i, 23) * PXH * 0.45
                const a = 0.22 + hash2(i, 37) * 0.5
                bgx.fillStyle = 'rgba(226, 232, 248, ' + a.toFixed(2) + ')'
                bgx.fillRect(sx | 0, sy | 0, 1, 1)
            }

            // moon, upper right: soft halo + crescent cut out of the disc
            const mx = PXW * 0.8, my = PXH * 0.2
            const halo = bgx.createRadialGradient(mx, my, 2, mx, my, 26)
            halo.addColorStop(0, 'rgba(255, 236, 200, 0.45)')
            halo.addColorStop(1, 'rgba(255, 236, 200, 0)')
            bgx.fillStyle = halo
            bgx.fillRect(mx - 26, my - 26, 52, 52)
            bgx.fillStyle = '#f5e7c8'
            bgx.beginPath(); bgx.arc(mx, my, 7, 0, Math.PI * 2); bgx.fill()
            bgx.fillStyle = '#111731'
            bgx.beginPath(); bgx.arc(mx + 3.4, my - 2, 6.2, 0, Math.PI * 2); bgx.fill()

            // distant battlements along the horizon — faint, crenellated ridge
            const horizon = PXH * 0.86
            bgx.fillStyle = 'rgba(24, 28, 50, 0.94)'
            let cx = 4, ti = 0
            while (cx < PXW - 10) {
                const tw = 12 + hash2(ti, 7) * 18
                const th = 8 + hash2(ti, 9) * 16
                bgx.fillRect(cx, horizon - th, tw, th)
                for (let tx = cx + 2; tx < cx + tw - 4; tx += 6) bgx.fillRect(tx, horizon - th - 3, 3, 3)
                cx += tw + 8 + hash2(ti, 13) * 16
                ti++
            }

            for (let y = 0; y < g.H; y++) {
                for (let x = 0; x < g.W; x++) {
                    if (g.grid[y * g.W + x] !== 1) continue
                    const px = x * CW, py = y * CW
                    const r = hash2(x, y)
                    // three stone tones — no cell looks like its neighbour
                    bgx.fillStyle = r < 0.34 ? '#343c50' : r < 0.67 ? '#3a4258' : '#404b64'
                    bgx.fillRect(px, py, CW, CW)
                    if (r < 0.5) {
                        // a dark speckle, seeded — grain, never random
                        bgx.fillStyle = 'rgba(0,0,0,0.28)'
                        bgx.fillRect(px + 3 + ((r * 60) | 0) % (CW - 6), py + 3 + ((r * 93) | 0) % (CW - 6), 2, 1)
                    }
                    if (r > 0.33) {
                        // a single warm fleck
                        bgx.fillStyle = 'rgba(255, 214, 130, 0.10)'
                        bgx.fillRect(px + 2 + ((r * 47) | 0) % (CW - 5), py + 2 + ((r * 71) | 0) % (CW - 5), 1, 2)
                    }
                    // top light strip, bottom shade, right edge (unchanged)
                    bgx.fillStyle = '#4a5573'
                    bgx.fillRect(px, py, CW, 3)
                    bgx.fillStyle = '#2a3044'
                    bgx.fillRect(px, py + CW - 3, CW, 3)
                    bgx.fillRect(px + CW - 2, py, 2, CW)
                }
            }

            // warm floor glow — light pools on the lowest air row
            const fg = bgx.createLinearGradient(0, PXH - 80, 0, PXH - 24)
            fg.addColorStop(0, 'rgba(255, 180, 90, 0)')
            fg.addColorStop(1, 'rgba(255, 180, 90, 0.12)')
            bgx.fillStyle = fg
            bgx.fillRect(0, PXH - 80, PXW, 56)

            // vignette — corners darken, the arena stays centered
            const vg = bgx.createRadialGradient(PXW / 2, PXH * 0.45, PXH * 0.32, PXW / 2, PXH * 0.45, PXW * 0.74)
            vg.addColorStop(0, 'rgba(0,0,0,0)')
            vg.addColorStop(1, 'rgba(0,0,0,0.28)')
            bgx.fillStyle = vg
            bgx.fillRect(0, 0, PXW, PXH)
            bgDirty = false
        }

        const drawArrowShape = (c, x, y, ang, dim, hot, t = 0, owner = -1) => {
            c.save()
            c.translate(x, y); c.rotate(ang)
            c.strokeStyle = hot ? '#ff9a4a' : dim ? '#8a7a55' : '#e8d9a0'
            c.lineWidth = 2
            c.beginPath(); c.moveTo(-8, 0); c.lineTo(6, 0); c.stroke()
            c.fillStyle = hot ? '#ff4a1e' : dim ? '#b9a06a' : '#ffd23e'
            c.beginPath(); c.moveTo(8, 0); c.lineTo(3, -3); c.lineTo(3, 3); c.closePath(); c.fill()
            // #2565 fletching: two tail barbs in the OWNER's colour (the same
            // red/cyan the quiver bars use) — at 8 px the originals' arrows
            // still read fletched, and a stuck shaft says whose it is at a
            // glance. Painted at any dim/hot state: ownership survives the fire.
            if (owner === 0 || owner === 1) {
                c.strokeStyle = owner === 0 ? '#ff5d6c' : '#4ad7ff'
                c.lineWidth = 1
                c.beginPath(); c.moveTo(-8, 0); c.lineTo(-4.5, -2.6); c.stroke()
                c.beginPath(); c.moveTo(-8, 0); c.lineTo(-4.5, 2.6); c.stroke()
            }
            if (hot) {
                // #2377 an ember on a burning shaft: a spark that hops
                // between spots driven by the shaft's cell and the SIM tick
                // — never by wall-clock, so pause freezes the fire like the
                // stone.
                const k = Math.floor(x + y + t) % 3
                c.fillStyle = k === 0 ? '#ffd23e' : '#ff7a2e'
                c.fillRect(1, -5 - k, 1, 1)
                c.fillRect(-4 + k, -4, 1, 1)
            }
            c.restore()
        }

        const drawArcher = (c, p, color, sq) => {
            if (!p.alive) return
            if (p.invuln > 0 && Math.floor(p.invuln / 4) % 2) return
            // #2314 squash on land, stretch on take-off — around the FEET, so
            // the archer pushes into the stone instead of floating
            const k = sq > 0 ? sq / 6 : sq < 0 ? -sq / 5 : 0
            const sy = sq > 0 ? 1 - 0.22 * k : 1 + 0.18 * k
            const sx = 2 - sy
            c.save()
            c.translate(p.x, p.y + 8)
            c.scale(sx, sy)
            c.fillStyle = color
            c.fillRect(-6, -12, 12, 12)
            c.fillRect(-4, -20, 8, 7)
            c.strokeStyle = '#f2f5ff'
            c.lineWidth = 2
            const m = Math.hypot(p.aimX, p.aimY) || 1
            const ax = p.aimX / m, ay = p.aimY / m
            c.beginPath()
            c.moveTo(ax * 10 - ay * 7, ay * 10 + ax * 7 - 8)
            c.lineTo(ax * 10 + ay * 7, ay * 10 - ax * 7 - 8)
            c.stroke()
            if (p.firing && p.charge > 0.02) {
                c.strokeStyle = '#ffd23e'
                c.beginPath()
                c.moveTo(ax * 10 - ay * 7, ay * 10 + ax * 7 - 8)
                c.lineTo(ax * (10 - p.charge * 8), ay * (10 - p.charge * 8) - 8)
                c.lineTo(ax * 10 + ay * 7, ay * 10 - ax * 7 - 8)
                c.stroke()
                c.fillStyle = '#ffd23e'
                c.fillRect(-10, -28, Math.max(2, p.charge * 20), 3)
            }
            c.restore()
        }

        const paint = () => {
            const g = screenRef.current === 'attract' && demoG ? demoG : gs
            const play = screenRef.current === 'play'
            if (bgDirty) paintBg(g)
            ctx.clearRect(0, 0, PXW, PXH)
            // #2565 kill flinch: shift the whole board along the stepped table
            // (deterministic — no Math.random — so captures stay reproducible).
            const fl = shake > 0 ? SHAKE_PAT[(SHAKE_PAT.length - shake) % SHAKE_PAT.length] : null
            if (fl) ctx.setTransform(1, 0, 0, 1, fl[0], fl[1])
            ctx.drawImage(bg, 0, 0)
            // #2314 landing dust: a ring that widens and thins at the feet.
            // #2385 ash: a smaller, sootier puff for a rotting shaft.
            if (play) {
                for (let i = puffs.length - 1; i >= 0; i--) {
                    const u = puffs[i]
                    if (u.age >= u.life) { puffs.splice(i, 1); continue }
                    const t = u.age / u.life
                    ctx.globalAlpha = (u.ash ? 0.6 : u.tint ? 0.8 : 0.5) * (1 - t)
                    ctx.fillStyle = u.tint || (u.ash ? '#8a7280' : '#b9c2d8')
                    ctx.beginPath()
                    ctx.arc(u.x, u.y - 2, u.r + t * 9, 0, Math.PI * 2)
                    ctx.fill()
                }
                // #2385 the fly-home: the rotted shaft arcs up toward the
                // owner's quiver bar (top edge of the canvas, where the HUD
                // draws it) and fades as it lands there.
                for (let i = home.length - 1; i >= 0; i--) {
                    const hz = home[i]
                    if (hz.t >= HOME_LIFE) { home.splice(i, 1); continue }
                    const k = hz.t / HOME_LIFE
                    const tx = hz.owner === 0 ? 26 : PXW - 26
                    const ty = 8
                    const px = hz.sx + (tx - hz.sx) * k
                    const py = hz.sy + (ty - hz.sy) * k - Math.sin(k * Math.PI) * 26
                    ctx.globalAlpha = 1 - k * 0.5
                    drawArrowShape(ctx, px, py, Math.atan2(ty - hz.sy, tx - hz.sx), true, false, g.tick, hz.owner)
                }
                ctx.globalAlpha = 1
            }
            const hot = g.heat
            for (const s of g.stuck) {
                const sx = (s.cell % g.W) * CW + CW / 2
                const sy = Math.floor(s.cell / g.W) * CW + CW / 2
                if (hot) {
                    // #2377 cover is burning out: the cell breathes an ember
                    // glow (brighter the closer the shaft is to rotting), the
                    // shaft rattles ±1 px and smoulders orange. Every term is
                    // sim-state only — cell, age, tick — so a paused arena
                    // freezes the fire with the stone.
                    const j = ((s.cell * 7 + g.tick * 5) % 3) - 1
                    const burn = Math.min(1, s.age / CFG.stuckTTL)
                    // #2385 the pulse ACCELERATES as the shaft nears death —
                    // a shape/time cue, not just a hue — and a crackle dither
                    // (dark 1×2 ticks, count ∝ burn, positions hashed off the
                    // cell so each cover cracks differently, crawling every
                    // 10 ticks) makes dying cover legible without any colour.
                    ctx.globalAlpha = 0.22 + 0.16 * Math.sin(g.tick * (0.35 + burn * 1.1) + s.cell) ** 2 + burn * 0.22
                    ctx.fillStyle = '#ff5a24'
                    ctx.fillRect(sx - CW / 2 + 3, sy - CW / 2 + 3, CW - 6, CW - 6)
                    ctx.globalAlpha = 0.85
                    ctx.fillStyle = '#2b0d05'
                    const cracks = 1 + Math.floor(burn * 3)
                    for (let k = 0; k < cracks; k++) {
                        const hx = (s.cell * 13 + k * 7 + Math.floor(g.tick / 10)) % (CW - 10)
                        const hy = (s.cell * 29 + k * 11 + Math.floor(g.tick / 10)) % (CW - 12)
                        ctx.fillRect(sx - CW / 2 + 5 + hx, sy - CW / 2 + 5 + hy, 1, 2)
                    }
                    ctx.globalAlpha = 1
                    drawArrowShape(ctx, sx + j, sy - j, s.ang || 0.6, false, true, g.tick, s.owner)
                } else {
                    drawArrowShape(ctx, sx, sy, s.ang || 0.6, true, false, g.tick, s.owner)
                }
            }
            for (const ar of g.arrows) {
                if (ar.state === 'stuck') continue
                drawArrowShape(ctx, ar.x, ar.y, Math.atan2(ar.vy, ar.vx), ar.state === 'fall', false, g.tick, ar.owner)
            }
            drawArcher(ctx, g.p[0], '#ff5d6c', play ? squash[0] : 0)
            drawArcher(ctx, g.p[1], '#4ad7ff', play ? squash[1] : 0)
            // #2565 item 3 — the ceremony painted: the seat chips name each
            // archer in their own colour (red/cyan, like the quiver bars and
            // fletching), and DRAW! crosses the board when the beat lands.
            // Above the bodies (head top is p.y−12); the centre strip holds no
            // gameplay ink while the board is held at spawn.
            if (play && ceremony > 0 && mode === '2p') {
                ctx.textAlign = 'center'
                ctx.font = 'bold 11px monospace'
                if (seatPing[0]) { ctx.fillStyle = '#ff5d6c'; ctx.fillText('P1', g.p[0].x, g.p[0].y - 24) }
                if (seatPing[1]) { ctx.fillStyle = '#4ad7ff'; ctx.fillText('P2', g.p[1].x, g.p[1].y - 24) }
                if (drawBeat) {
                    ctx.font = 'bold 30px monospace'
                    ctx.fillStyle = '#1a1226'
                    ctx.fillText('DRAW!', PXW / 2 + 2, PXH / 2 - 10)
                    ctx.fillStyle = '#ffd23e'
                    ctx.fillText('DRAW!', PXW / 2, PXH / 2 - 12)
                }
                ctx.textAlign = 'left'
            }
            if (hot) {
                // the arena itself sweats: a breathing ember frame top and
                // bottom says "re-engage" before any text has to
                ctx.globalAlpha = 0.05 + 0.035 * Math.sin(g.tick * 0.2)
                const grd = ctx.createLinearGradient(0, 0, 0, PXH)
                grd.addColorStop(0, 'rgba(255,90,36,1)'); grd.addColorStop(0.32, 'rgba(255,90,36,0)')
                grd.addColorStop(0.68, 'rgba(255,90,36,0)'); grd.addColorStop(1, 'rgba(255,90,36,1)')
                ctx.fillStyle = grd
                ctx.fillRect(0, 0, PXW, PXH)
                ctx.globalAlpha = 1
            }
            if (fl) ctx.setTransform(1, 0, 0, 1, 0, 0)
        }

        const handleEvents = (evts) => {
            for (const e of evts) {
                if (e.type === 'loose') {
                    // #2565 seat-keyed release: dryout already splits by owner
                    // (520/620); splitting the draw's sweep the same way makes a
                    // same-tick exchange readable by ear (the #2558 stamp duel).
                    audioController.playSweep((e.who === 0 ? 320 : 390) + e.charge * 300, 140, 0.12, 'triangle', 0.05)
                    seatLoose[e.who]++
                }
                else if (e.type === 'stick') audioController.playTone(190, 0.05, 'square', 0.045)
                else if (e.type === 'knockout') audioController.playTone(760, 0.05, 'square', 0.05)
                else if (e.type === 'pull') { audioController.playTone(560, 0.05, 'triangle', 0.05); say('ARROW PULLED') }
                else if (e.type === 'hit') {
                    say(e.who === 0 || mode === '2p' ? `PLAYER ${e.who + 1} HITS!` : 'THE BOT HITS YOU')
                    audioController.playNoise(0.09, 0.08)
                    // #2565 the board flinches: three frames of world-hold, a
                    // stepped screen shake, and rings blooming where the victim
                    // fell, tinted with the victim's seat colour. Positions come
                    // from the sim's own victim body at the tick of the blow.
                    const v = gs.p[e.victim]
                    hitstop = 110; shake = 8; killFx++
                    audioController.playTone(72, 0.16, 'square', 0.07) // the THUD under the crack
                    puffs.push({ x: v.x, y: v.y - 4, r: 6, age: 0, life: 34, tint: e.victim === 0 ? '#ff5d6c' : '#4ad7ff' })
                    puffs.push({ x: v.x, y: v.y - 4, r: 2, age: 0, life: 44, tint: '#ffd23e' })
                }
                else if (e.type === 'respawn') audioController.playSweep(200, 420, 0.2, 'sine', 0.04)
                else if (e.type === 'jump') audioController.playTone(300, 0.03, 'square', 0.02)
                // #2385 the dryout POP: the sim already sends the shaft home to
                // its owner's quiver (or loses it to a full one) — paint the
                // economy so rot reads as *returning ammo*, not vanishing: an
                // ash cough at the cell and the shaft arcing to the quiver bar.
                else if (e.type === 'dryout') {
                    const sx = (e.cell % gs.W) * CW + CW / 2
                    const sy = Math.floor(e.cell / gs.W) * CW + CW / 2
                    puffs.push({ x: sx, y: sy, r: 3, age: 0, life: 26, ash: true })
                    home.push({ sx, sy, owner: e.who, t: 0 })
                    dryFx++
                    audioController.playNoise(0.04, 0.03)
                    audioController.playTone(e.who === 0 ? 520 : 620, 0.06, 'triangle', 0.04)
                }
                // #2377 heat: a low rumble climbing out of the floor when
                // the dry spell bakes the arena; a relieved hiss when blood
                // finally cools it.
                else if (e.type === 'heat') { say('THE ARENA HEATS UP'); audioController.playSweep(85, 210, 0.55, 'sawtooth', 0.045) }
                else if (e.type === 'cool') { say('FIRST BLOOD — COVER COOLS'); audioController.playSweep(560, 170, 0.28, 'triangle', 0.05) }
            }
        }

        const gameOver = () => {
            watchingRef.current = false; setWatching(false) // #1637 the duel ends in your hands
            const w = gs.winner
            setEnd({ winner: w, scores: [gs.p[0].score, gs.p[1].score], arena: arenaIdx, time: gs.tick })
            overAtRef.current = performance.now()
            audioController.playSweep(w === 0 || mode === '2p' ? 300 : 40, w === 0 || mode === '2p' ? 900 : 60, 0.9, 'square', 0.09)
            setMode('over')
        }

        const startPlay = (m, idx = 0) => {
            watchingRef.current = false; setWatching(false) // #1637 a new duel starts in your hands
            mode = m; modeRef.current = m
            arenaIdx = ((idx % ARENAS_COUNT) + ARENAS_COUNT) % ARENAS_COUNT
            gs = makeGame(buildArena(arenaIdx))
            held.clear()
            resetJuice()
            bgDirty = true
            setMode('play')
            say(m === '2p' ? 'DUEL — FIRST TO 3' : 'YOU vs THE BOT — FIRST TO 3')
            if (m === '2p') {
                // #2565 item 3: the duel is ANNOUNCED, not just started — seat
                // pings in the seats' own pitches (the #2565 loose split,
                // 320/390), then DRAW!, then the board releases. The generic
                // sweep stays the solo start so the two modes sound distinct.
                ceremony = CEREMONY_MS
            } else {
                audioController.playSweep(220, 660, 0.25, 'square', 0.07)
            }
        }

        const buildDemo = (i) => {
            demo = demoFor(i)
            demoG = makeGame(buildArena(i))
            demoBy = new Map(demo.cmds.map((c) => [c.tick, c]))
            bgDirty = true
        }

        const tickDemo = () => {
            if (!demoG || demoG.end) { buildDemo(((demo ? demo.arena : 0) + 1) % ARENAS_COUNT); return }
            const c = demoBy.get(demoG.tick)
            step(demoG, c ? c.p1 : null, c ? c.p2 : null)
            demoG.events.length = 0
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play' || gs.end) return
            // #1637 WATCH: seat 1 takes the proven autopilot — botInput(0, 1)
            // is the exact skill-1 brain archerycheck wins both arenas with
            // (and recordMatch feeds the attract witness); it reads only state,
            // so takeover and re-seat resume from exactly where you left it.
            const in1 = watchingRef.current ? botInput(gs, 0, 1) : inputOf(held, P1_KEYS)
            const in2 = mode === '2p' ? inputOf(held, P2_KEYS) : botInput(gs, 1, 0)
            gs.cmds.push({ tick: gs.tick, p1: in1, p2: in2 })
            const before = gs.events.length
            step(gs, in1, in2)
            detectJuice(in1, in2)
            handleEvents(gs.events.splice(before))
            if (gs.end) gameOver()
        }

        const syncHud = () => {
            const g = screenRef.current === 'play' ? gs : demoG || gs
            const h = hudRef.current
            if (h.p1) h.p1.textContent = `P1 ${g.p[0].score}`
            if (h.p2) h.p2.textContent = `${modeRef.current === '1p' ? 'BOT' : 'P2'} ${g.p[1].score}`
            if (h.q1) h.q1.textContent = '▮'.repeat(g.p[0].quiver) + '▯'.repeat(Math.max(0, CFG.quiver - g.p[0].quiver))
            if (h.q2) h.q2.textContent = '▮'.repeat(g.p[1].quiver) + '▯'.repeat(Math.max(0, CFG.quiver - g.p[1].quiver))
            if (h.time) { h.time.textContent = `${Math.max(0, Math.ceil((CFG.matchTicks - g.tick) / 30))}s`; h.time.style.color = g.heat ? '#ff7a4a' : '#a5f3fc' }
            if (h.arena) h.arena.textContent = g.name
            if (h.toast) { h.toast.textContent = toastMsg; h.toast.style.opacity = toast > 0 ? '1' : '0' }
            if (toast > 0 && !pausedRef.current) toast--
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (!pausedRef.current) {
                // #2565 item 3: the ceremony holds the board like the hit-stop —
                // the accumulator spends the frame on the freeze, so ticks are
                // delayed, never skipped; pings and the DRAW beat fire off the
                // frame clock and freeze on pause with everything else.
                if (ceremony > 0) {
                    const el = CEREMONY_MS - ceremony
                    if (seatPing[0] === 0) { seatPing[0] = 1; audioController.playTone(320, 0.1, 'triangle', 0.06) }
                    if (el >= CER_PING2_MS && seatPing[1] === 0) { seatPing[1] = 1; audioController.playTone(390, 0.1, 'triangle', 0.06) }
                    if (el >= CER_DRAW_MS && drawBeat === 0) { drawBeat = 1; audioController.playSweep(520, 940, 0.16, 'square', 0.07) }
                    ceremony -= ft
                }
                // #2565 hit-stop: the accumulator holds (ft is spent on the
                // freeze, not queued) — the world pauses, nothing is skipped.
                if (hitstop > 0) hitstop -= ft
                else if (ceremony > 0) { /* the board holds until DRAW releases it */ }
                else { acc += ft; while (acc >= SIM_MS) { doFrameSim(); acc -= SIM_MS } }
                if (shake > 0) shake--
            }
            paint()
            syncHud()
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (KEY_SET.has(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') {
                if (e.code === 'Digit2') return startPlay('2p', 0)
                if (e.code === 'Digit1') return startPlay('1p', 0)
                startPlay('1p', 0); return
            }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 900) return
                if (e.code === 'Enter' || e.code === 'KeyR') { startPlay(modeRef.current, arenaIdx); return }
                setMode('attract'); return
            }
            if (pausedRef.current) return
            // #1637 WATCH: Y seats the arena-winning autopilot at seat 1; any
            // seat-1 key takes the bow back. Seat-2 codes never unseat it —
            // your duel partner keeps their seat (Smash TV rule).
            if (isWatchKey(e)) {
                if (watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() }
                else if (!gs.end) { watchingRef.current = true; setWatching(true); playWatchStart() }
                return
            }
            if (watchingRef.current && isTakeoverKey(e) && !(mode === '2p' && P2_CODES.has(e.code))) {
                watchingRef.current = false; setWatching(false); playWatchStop()
            }
            if (KEY_SET.has(e.code)) held.add(e.code)
        }
        const onUp = (e) => { held.delete(e.code) }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay('1p', 0); return }
            if (sc === 'over' && performance.now() - overAtRef.current > 900) setMode('attract')
        }
        // #1637 WATCH: a touch on the arena means you want the bow — hand back.
        const onStagePointer = () => {
            if (screenRef.current === 'play' && watchingRef.current) { watchingRef.current = false; setWatching(false); playWatchStop() }
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('pointerdown', onPointer)
        canvas.addEventListener('pointerdown', onStagePointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const s = Math.min(r.width / PXW, r.height / PXH)
            canvas.style.width = `${PXW * s}px`
            canvas.style.height = `${PXH * s}px`
        }
        window.addEventListener('resize', resize)
        resize()
        buildDemo(0)
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            window.__archeryTest = {
                probe: () => ({
                    screen: screenRef.current, mode, arena: arenaIdx, tick: gs.tick, end: gs.end,
                    scores: [gs.p[0].score, gs.p[1].score],
                    quiver: [gs.p[0].quiver, gs.p[1].quiver],
                    p1: { x: gs.p[0].x, y: gs.p[0].y, alive: gs.p[0].alive, charge: gs.p[0].charge, quiver: gs.p[0].quiver, receipts: gs.receipts[0] },
                    p2: { x: gs.p[1].x, y: gs.p[1].y, alive: gs.p[1].alive, charge: gs.p[1].charge, quiver: gs.p[1].quiver, receipts: gs.receipts[1] },
                    flying: gs.arrows.filter((a) => a.state === 'fly').length,
                    stuck: gs.stuck.length,
                    // #2377 the heat engine, visible to the browser harness
                    heat: gs.heat, lastHit: gs.lastHit, dryTicks: gs.tick - gs.lastHit,
                    stuckCells: gs.stuck.map((s) => ({ cell: s.cell, age: s.age, id: s.id, owner: s.owner, ang: s.ang, x: (s.cell % gs.W) * CW + CW / 2, y: Math.floor(s.cell / gs.W) * CW + CW / 2 })),
                    arrows: gs.arrows.map((a) => ({ id: a.id, state: a.state, owner: a.owner, born: a.born, x: Math.round(a.x), y: Math.round(a.y) })),
                    ledger: { ...gs.ledger, total: gs.total + gs.supplied, now: gs.p[0].quiver + gs.p[1].quiver + gs.arrows.filter((a) => a.state !== 'stuck').length + gs.stuck.length + gs.ledger.hit + gs.ledger.lost },
                    // attract is a separate sim instance — the harness grades
                    // THAT moving, not the idle gs
                    demo: demoG ? { tick: demoG.tick, end: demoG.end, scores: [demoG.p[0].score, demoG.p[1].score] } : null,
                    // #2314 juice is derived-only — the counters are its receipt
                    juice: { puffs: puffs.length, landings: landCount, blocked: blockCount,
                        // #2565 kill juice receipts: every kill flinched the board
                        kills: killFx, shake, hitstop },
                    // #2385 heat telegraph + dryout FX receipts (derived-only):
                    // warnNotes must stay 0 through any honest bot duel, and
                    // a driven match must show dryout FX at least once.
                    // #2565 seatLoose: releases counted per seat — the pitched
                    // split that makes a same-tick exchange audible.
                    fx: { ash: puffs.filter((u) => u.ash).length, homes: home.length, warnNotes, dryFx, warnStep: heatWarnStep(gs.tick - gs.lastHit), seatLoose: [...seatLoose] },
                    // #2565 item 3 ceremony receipts: ms of board-hold left,
                    // seat pings rung (P1 first, then P2), DRAW beat landed.
                    ceremony: { ms: Math.max(0, ceremony), pings: [...seatPing], draw: drawBeat },
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                // #1637 watchcheck pilot drives these.
                watching: () => watchingRef.current,
                watchSfx: watchSfxLog,
                // drive N ticks of the BOT (not the human) into the live game,
                // so a harness can advance the duel through real step() calls
                drive: (n) => {
                    for (let k = 0; k < n && !gs.end; k++) {
                        const i1 = botInput(gs, 0, 1)
                        const i2 = botInput(gs, 1, 0)
                        gs.cmds.push({ tick: gs.tick, p1: i1, p2: i2 })
                        const before = gs.events.length
                        step(gs, i1, i2)
                        detectJuice(i1, i2)
                        handleEvents(gs.events.splice(before))
                    }
                    if (gs.end) gameOver()
                },
                keysDown: (codes) => { for (const c of codes) held.add(c) },
                keysUp: (codes) => { for (const c of codes) held.delete(c) },
                // #2377 DEV cheat for the browser harness: make the arena
                // remember no blood for an age — the gate itself then fires
                // on the next REAL tick (state → step → paint, uncheated).
                forceHeat: () => { gs.lastHit = Math.min(gs.lastHit, gs.tick - CFG.heatTicks) },
                replayCheck: () => {
                    // +1 so a match that ENDED on the last recorded command
                    // gets that command applied in the twin too — stopping the
                    // referee early is not measuring divergence
                    // exact tick parity: live has applied every command
                    // stamped < gs.tick and stepped once per tick, so the
                    // twin must stop AT gs.tick — not one past it, or the
                    // hash mixes a tick the live board never lived
                    const g2 = replay(buildArena(arenaIdx), gs.cmds, { maxTicks: gs.tick })
                    return {
                        live: stateHash(gs), replay: stateHash(g2), match: stateHash(gs) === stateHash(g2),
                        cmds: gs.cmds.length, tick: gs.tick, twinTick: g2.tick,
                        liveP1: [Math.round(gs.p[0].x), Math.round(gs.p[0].y), gs.p[0].quiver, gs.p[0].charge],
                        twinP1: [Math.round(g2.p[0].x), Math.round(g2.p[0].y), g2.p[0].quiver, g2.p[0].charge],
                        liveStuck: gs.stuck.map((s) => s.cell), twinStuck: g2.stuck.map((s) => s.cell),
                    }
                },
                prognose: () => {
                    if (gs.end) return `already ${gs.end}`
                    const g2 = cloneGame(gs)
                    let t = 0
                    while (!g2.end && t < CFG.matchTicks) { step(g2, botInput(g2, 0, 1), botInput(g2, 1, 0)); t++ }
                    return g2.winner === 0
                        ? `WINNABLE: the autopilot still wins from THIS exact state (${g2.p[0].score}-${g2.p[1].score} in ${t} more ticks)`
                        : `NOT WINNABLE from here: autopilot ends ${g2.p[0].score}-${g2.p[1].score} (winner ${g2.winner})`
                },
            }
            mountDbg({
                title: 'ARENA ARCHERY',
                getState: () => [
                    `${gs.name} tick ${gs.tick} end ${gs.end || '-'} mode ${mode}`,
                    `P1 ${gs.p[0].score} (${gs.p[0].quiver} arrows) vs P2 ${gs.p[1].score} (${gs.p[1].quiver} arrows)`,
                    `flying ${gs.arrows.filter((a) => a.state === 'fly').length} stuck ${gs.stuck.length} hit ${gs.ledger.hit} lost ${gs.ledger.lost} total ${gs.total}`,
                ],
                actions: [
                    { label: 'PROGNOSIS', run: () => window.__archeryTest.prognose() },
                    { label: '+1 ARROW', run: () => { gs.p[0].quiver++; gs.total++; return `P1 quiver ${gs.p[0].quiver} — extra slack the solver is NOT allowed to assume` } },
                    { label: 'FORCE HEAT', run: () => { gs.lastHit = Math.min(gs.lastHit, gs.tick - CFG.heatTicks); return 'dry spell forced — the arena bakes on the next tick, and cover starts rotting' } },
                ],
            })
        }

        // #1473: production-safe feedback state, every build. ArenaArchery duels
        // are deterministic (sim.js: two-player collisions "resolve identically" —
        // zero Math.random in the whole title, fixed arena tables): the report
        // carries P1's score + the winner slot: {tick,score,done,winner}.
        exposeFeedbackState(() => ({ tick: gs.tick, score: gs.p[0].score, done: gs.end != null, winner: gs.winner }))

        return () => {
            unexposeFeedbackState()
            if (import.meta.env.DEV) { if (window.__archeryTest) delete window.__archeryTest; unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('pointerdown', onPointer)
            canvas.removeEventListener('pointerdown', onStagePointer)
            window.removeEventListener('resize', resize)
            cancelAnimationFrame(raf)
            canvas.remove()
            bg.width = 0; bg.height = 0
        }
    }, [setMode])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])

    const play = screen === 'play'
    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-2 left-3 right-3 flex items-center gap-3 text-white font-mono text-xs">
                    <span ref={setHud('p1')} className="text-red-300 font-bold">P1 0</span>
                    <span ref={setHud('q1')} className="text-red-200/70">▮▮▮▮▮▮</span>
                    <span ref={setHud('arena')} className="border border-amber-300/60 text-amber-200 px-2 py-0.5 rounded bg-black/40">CROSSGLOVE</span>
                    <span className="text-white/60">first to 3</span>
                    <span ref={setHud('time')} className="text-cyan-200">120s</span>
                    <span ref={setHud('q2')} className="text-sky-200/70">▮▮▮▮▮▮</span>
                    <span ref={setHud('p2')} className="text-sky-300 font-bold">BOT 0</span>
                </div>
                <div ref={setHud('toast')} className="absolute inset-x-0 top-1/4 text-center text-amber-100 font-mono font-bold text-xl transition-opacity duration-500" style={{ opacity: 0, textShadow: '0 0 12px #f60' }} />
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center text-center px-6 pointer-events-none [html[data-rotate-hint]_&]:invisible">
                    <h1 className="text-4xl font-black mb-6" style={{ color: '#ffd23e', textShadow: '3px 0 0 #b06a3f, -3px 0 0 #4ad7ff, 0 10px 24px #000' }}>ARENA ARCHERY</h1>
                    <AttractMessage className="mb-6 text-amber-100/80" messages={MESSAGES} />
                    <p className="text-lg font-mono font-bold animate-pulse text-yellow-300">{PRESS}</p>
                    <span className="block mt-4 text-amber-200/70 font-mono font-bold tracking-wider">{WATCH_ATTRACT_HINT}</span>
                    {/* #2565 item 3 — the duel's seat keys, discoverable at the
                        marquee (the desktop-keyboard option per AGENTS.md). */}
                    <span className="block mt-2 text-red-300/80 font-mono font-bold tracking-wider">2 DUEL ON ONE KEYBOARD — P1 ARROWS+SPACE · P2 WASD+F</span>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-amber-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.winner === 0 || modeRef.current === '2p' ? 'text-yellow-300' : 'text-red-400'}`}>
                        {end.winner < 0 ? 'DRAW' : modeRef.current === '2p' ? `PLAYER ${end.winner + 1} TAKES THE ARENA` : end.winner === 0 ? 'YOU TAKE THE ARENA' : 'THE BOT TAKES THE ARENA'}
                    </h2>
                    <p className="text-lg mb-1">{end.scores[0]} &mdash; {end.scores[1]} in {(end.time / 30).toFixed(1)}s on {ARENA_NAMES[end.arena] || 'CROSSGLOVE'}</p>
                    <p className="text-sm text-amber-200/80 mb-4">every missed arrow became terrain on that board &middot; the replay reproduces this match hash-for-hash</p>
                    <p className="text-sm text-amber-100/80 mb-4">R runs it back &middot; any other key returns to the marquee</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {/* #1637 WATCH — the prover duels seat 1; any seat-1 input takes over. */}
            {screen === 'play' && watching && <WatchToast className="absolute z-50" />}
            {/* #1656 — the forgotten-how-to-play tap: start AND watch, one button. */}
            {screen === 'attract' && (
                <div className="absolute inset-x-0 z-[70] flex justify-center pointer-events-none" style={{ bottom: '24%' }}>
                    <AttractWatchButton />
                </div>
            )}
            {screen === 'play' && !paused && (
                <div className="absolute z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
                    <WatchButton on={watching} />
                </div>
            )}
            {paused && <PauseOverlay game={GAMES.find(g => g.label === 'ARENA ARCHERY')} onResume={handleResume} />}
            {/* AGENTS.md, Jon's multiplayer law: the CPU opponent is the default
                (phone gets one pad); two players is a DESKTOP KEYBOARD option —
                no second on-screen touchpad. `2` seats the duel; WASD+F drives
                seat two. (The pad used to ship anyway, and painted even in 1p
                mode where seat 2 belongs to the bot — dead buttons.) */}
            <VirtualControls visible={play && !paused} />
        </div>
    )
}

export default ArenaArcheryGame

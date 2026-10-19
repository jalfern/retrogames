// MAGIC CARPET — Bullfrog's 1994 DOS god-game, rebuilt whole in code. The rules
// live in ./sim.js (pure, seeded, harness-provable); art in ./art.js. This file
// is the shell: per-column voxel terrain with fog + checker dither, sprite passes
// clipped by the terrain depth buffer, the blue-stone HUD, and the loop.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import {
    W, H, HUD_H, QUOTA, HORIZON, MAP, WATER,
    SPILLS, spellById,
    makeGame, step, autopilot, stateHash, sampleH, setHand, cycleR,
} from './sim.js'
import {
    drawPearl, drawBook, drawBalloon, drawCastle, drawTower, drawWizard,
    drawGiant, drawWolf, drawCow, drawHut, drawFireball, drawBolt,
} from './art.js'

const FIXED_DT = 1000 / 60
const FOCAL = 240
const VIEW_D = 190
const HAZE = [172, 190, 208]

const mix = (a, b, t) => `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`
const BI_RGB = [[0x1c, 0x4a, 0x86], [0x25, 0x5c, 0x9e], [0xc9, 0xae, 0x6c], [0xb3, 0x97, 0x5a],
    [0x48, 0x81, 0x2f], [0x3a, 0x6c, 0x26], [0x75, 0x65, 0x4f], [0x5e, 0x51, 0x40],
    [0xe6, 0xeb, 0xf2], [0xc9, 0xd2, 0xdd]]

const SPELL_COLORS = {
    fireball: '#ff7a28', lightning: '#ffe24a', heal: '#ff5060',
    protect: '#58b8ff', slow: '#b070ff', telekinesis: '#58e8d8',
}

function drawSpellIcon(ctx, id, x, y, s) {
    const c = SPELL_COLORS[id] || '#ccc'
    if (id === 'fireball') {
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.7, y + s * 0.6); ctx.lineTo(x - s * 0.7, y + s * 0.6); ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#ffe0a0'; ctx.fillRect(x - s * 0.25, y - s * 0.1, s * 0.5, s * 0.5)
    } else if (id === 'lightning') {
        ctx.fillStyle = c
        ctx.fillRect(x - s * 0.2, y - s, s * 0.8, s * 0.55)
        ctx.fillRect(x - s * 0.5, y - s * 0.2, s * 0.9, s * 0.5)
        ctx.fillRect(x - s * 0.1, y + s * 0.2, s * 0.7, s * 0.8)
    } else if (id === 'heal') {
        ctx.fillStyle = c; ctx.fillRect(x - s * 0.25, y - s, s * 0.5, s * 2); ctx.fillRect(x - s, y - s * 0.25, s * 2, s * 0.5)
    } else if (id === 'protect') {
        ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, s * 0.35)
        ctx.beginPath(); ctx.arc(x, y, s * 0.85, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke()
    } else if (id === 'slow') {
        ctx.fillStyle = c
        ctx.fillRect(x - s * 0.7, y - s, s * 1.4, s * 0.4)
        ctx.fillRect(x - s * 0.7, y + s * 0.6, s * 1.4, s * 0.4)
        ctx.beginPath(); ctx.moveTo(x - s * 0.45, y - s * 0.5); ctx.lineTo(x + s * 0.45, y - s * 0.5); ctx.lineTo(x, y + s * 0.4); ctx.closePath(); ctx.fill()
    } else {
        ctx.fillStyle = c
        ctx.fillRect(x - s * 0.8, y + s * 0.2, s * 0.5, s * 0.8)
        ctx.fillRect(x - s * 0.2, y - s * 0.4, s * 0.5, s * 1.4)
        ctx.fillRect(x + s * 0.4, y, s * 0.5, s * 1)
    }
}

const MagicCarpetGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [end, setEnd] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const canvas = document.createElement('canvas')
        canvas.dataset.mcStage = '1'
        canvas.width = W; canvas.height = H
        canvas.className = 'block w-full h-full'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let gs = makeGame(7)
        let demoSeed = 7, demoT = 0
        let raf = 0, last = 0, acc = 0
        let toast = 0, toastMsg = '', shake = 0
        let flashL = 0, flashR = 0, hurtFlash = 0
        const keys = { l: false, r: false, u: false, d: false }
        let throwL = false, throwR = false
        const part = []
        const groundTop = new Float32Array(W)
        const groundD = new Float32Array(W)
        const f = { n: 0 }

        const say = (m) => { toastMsg = m; toast = 150 }
        const burst = (cx, cy, n, col, sp0 = 0.8) => {
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2, sp = sp0 + ((i * 7) % 10) / 6
                part.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.7, t: 0, col })
            }
        }

        const project = (wx, wy, wz) => {
            const dx = ((wx - gs.x + MAP / 2) % MAP + MAP) % MAP - MAP / 2
            const dy = ((wy - gs.y + MAP / 2) % MAP + MAP) % MAP - MAP / 2
            const fwd = dx * Math.cos(gs.yaw) + dy * Math.sin(gs.yaw)
            if (fwd < 5 || fwd > VIEW_D + 20) return null
            const side = -dx * Math.sin(gs.yaw) + dy * Math.cos(gs.yaw)
            const k = FOCAL / fwd
            return { sx: W / 2 + side * k, sy: HORIZON + (gs.alt - wz) * k, k, d: fwd }
        }

        const finish = (win) => {
            setEnd({ win, score: gs.score, deaths: gs.deaths })
            overAtRef.current = performance.now()
            setMode('over')
        }

        const handleEvents = (evts) => {
            for (const e of evts) {
                if (e.type === 'bank') {
                    audioController.playTone(760 + (e.m || 3) * 30, 0.05, 'triangle', 0.05)
                } else if (e.type === 'cast') {
                    if (e.hand === 'L') flashL = 14; else flashR = 14
                    const id = e.id
                    if (id === 'fireball') audioController.playSweep(640, 180, 0.16, 'sawtooth', 0.07)
                    else if (id === 'telekinesis') audioController.playSweep(260, 520, 0.12, 'sine', 0.06)
                    else if (id !== 'heal' && id !== 'protect' && id !== 'slow') audioController.playTone(500, 0.05, 'square', 0.05)
                } else if (e.type === 'zap') {
                    audioController.playNoise(0.16, 0.09)
                    audioController.playSweep(1500, 260, 0.2, 'square', 0.06)
                } else if (e.type === 'heal') {
                    audioController.playTone(660, 0.09, 'sine', 0.06)
                    audioController.playTone(880, 0.14, 'sine', 0.06, 0.09)
                }
                else if (e.type === 'learn') {
                    audioController.playTone(523, 0.09, 'square', 0.06)
                    audioController.playTone(659, 0.09, 'square', 0.06, 0.09)
                    audioController.playTone(784, 0.14, 'square', 0.06, 0.18)
                    say(`${spellById(e.id).name} LEARNED!`)
                } else if (e.type === 'fizzle') {
                    audioController.playSweep(420, 130, 0.24, 'triangle', 0.06)
                    say('THE SPELL ELUDES YOU')
                } else if (e.type === 'boom') {
                    audioController.playNoise(0.28, 0.11)
                    audioController.playTone(70, 0.18, 'square', 0.07)
                    const p = project(e.x, e.y, WATER + 2)
                    if (p) burst(p.sx, p.sy, 10, '#ffb040', 1)
                    shake = Math.max(shake, 4)
                } else if (e.type === 'wizHit') {
                    audioController.playTone(240, 0.07, 'square', 0.06)
                } else if (e.type === 'wizardDown') {
                    audioController.playNoise(0.5, 0.12)
                    audioController.playSweep(300, 50, 0.7, 'sawtooth', 0.09)
                    shake = 8
                    say('THE RIVAL WIZARD FALLS — HIS TREASURE SCATTERS')
                } else if (e.type === 'wizfire') audioController.playSweep(920, 380, 0.14, 'sawtooth', 0.05)
                else if (e.type === 'rocksling') audioController.playNoise(0.07, 0.05)
                else if (e.type === 'bite') audioController.playTone(170, 0.06, 'square', 0.05)
                else if (e.type === 'hurt') {
                    audioController.playNoise(0.1, 0.07)
                    audioController.playTone(120, 0.09, 'square', 0.06)
                    hurtFlash = 8
                    shake = Math.max(shake, 3)
                } else if (e.type === 'shieldHit') audioController.playTone(980, 0.05, 'sine', 0.05)
                else if (e.type === 'respawn') {
                    audioController.playSweep(220, 540, 0.3, 'sine', 0.07)
                    say('THE CASTLE RESTORES YOU')
                } else if (e.type === 'stage') {
                    audioController.playTone(392, 0.1, 'square', 0.06)
                    audioController.playTone(523, 0.1, 'square', 0.06, 0.1)
                    audioController.playTone(659, 0.16, 'square', 0.06, 0.2)
                    say(`THE CASTLE GROWS — STAGE ${e.n}`)
                } else if (e.type === 'spawn') audioController.playTone(140, 0.1, 'triangle', 0.05)
                else if (e.type === 'win') {
                    audioController.playTone(523, 0.12, 'square', 0.07)
                    audioController.playTone(659, 0.12, 'square', 0.07, 0.12)
                    audioController.playTone(784, 0.12, 'square', 0.07, 0.24)
                    audioController.playTone(1046, 0.34, 'square', 0.07, 0.36)
                    say('EQUILIBRIUM RESTORED')
                    finish(true)
                } else if (e.type === 'dead') {
                    audioController.playSweep(320, 40, 1, 'sawtooth', 0.1)
                    say('THE CARPET FALLS…')
                    finish(false)
                } else if (e.type === 'deny' || e.type === 'nomana') {
                    audioController.playTone(90, 0.06, 'square', 0.05)
                    if (e.type === 'nomana') say('NOT ENOUGH MANA')
                }
            }
        }

        const doSim = (inp) => {
            step(gs, inp)
            handleEvents(gs.events.splice(0))
        }

        const tickDemo = () => {
            if (gs.end || demoT > 2600) { demoSeed = (demoSeed * 31 + 17) % 9973; gs = makeGame(demoSeed); demoT = 0 }
            demoT++
            doSim(autopilot(gs))
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            doSim({
                left: keys.l, right: keys.r, up: keys.u, down: keys.d,
                castL: throwL, castR: throwR,
            })
            throwL = throwR = false
        }

        // --------------------------------------------------------------- paint ----
        const paintTerrain = () => {
            f.n = gs.tick
            const grad = ctx.createLinearGradient(0, 0, 0, HORIZON + 12)
            grad.addColorStop(0, '#141b4d')
            grad.addColorStop(0.62, '#3a5f96')
            grad.addColorStop(1, '#a8bcc8')
            ctx.fillStyle = grad
            ctx.fillRect(0, 0, W, HORIZON + 12)
            const sunAz = 2.1
            let sa = ((sunAz - gs.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI
            const sx = W / 2 + sa * FOCAL
            if (sx > -20 && sx < W + 20) {
                ctx.fillStyle = '#f2e0a0'
                ctx.beginPath(); ctx.arc(sx, 42, 7, 0, Math.PI * 2); ctx.fill()
                ctx.globalAlpha = 0.25
                ctx.beginPath(); ctx.arc(sx, 42, 12, 0, Math.PI * 2); ctx.fill()
                ctx.globalAlpha = 1
            }
            ctx.globalAlpha = 0.55
            ctx.fillStyle = '#c9d4e2'
            for (let c = 0; c < 5; c++) {
                const caz = c * 1.27 + 0.4 + gs.tick * 0.00018
                let ca = ((caz - gs.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI
                const cx = W / 2 + ca * FOCAL
                const cy = 26 + (c % 3) * 14
                if (cx < -40 || cx > W + 40) continue
                ctx.fillRect(cx - 16, cy, 34, 5)
                ctx.fillRect(cx - 9, cy - 4, 18, 5)
            }
            ctx.globalAlpha = 1

            for (let i = 0; i < W; i++) {
                const az = gs.yaw + Math.atan((i - W / 2) / FOCAL)
                const dx = Math.cos(az), dy = Math.sin(az)
                let prevY = H - HUD_H
                let topSilD = VIEW_D + 1
                let prevH = gs.alt
                for (let d = 7; d <= VIEW_D; d += 1 + d * 0.02) {
                    const wx = gs.x + dx * d, wy = gs.y + dy * d
                    const raw = sampleH(gs, wx, wy)
                    const h = Math.max(raw, WATER)
                    const y = HORIZON + (gs.alt - h) * FOCAL / d
                    if (y < prevY - 0.6) {
                        const biomeIdx = BIOMES_IDX(raw)
                        const water = raw <= WATER
                        const ci = biomeIdx * 2
                        const shade = Math.max(0.62, Math.min(1.25, 1 - (raw - prevH) * 0.045))
                        let ca = BI_RGB[ci], cb = BI_RGB[ci + 1]
                        if (water) {
                            const spark = ((Math.floor(wx / 3) + Math.floor(wy / 3) + ((gs.tick >> 3) & 1)) & 3) === 0
                            ca = spark ? [0x7a, 0xb4, 0xe0] : [0x2a, 0x62, 0xaa]
                            cb = spark ? [0x58, 0x9a, 0xd0] : [0x1c, 0x4a, 0x86]
                        }
                        const chk = ((Math.floor(wx / 2) + Math.floor(wy / 2)) & 1) === 0
                        const fog = Math.min(1, d / VIEW_D)
                        let col = mix(chk ? ca : cb, HAZE, fog * 0.72)
                        if (shade > 1.02) col = mix(col, [255, 250, 220], (shade - 1) * 0.8)
                        if (shade < 0.98) col = mix(col, [10, 14, 30], (1 - shade) * 0.7)
                        ctx.fillStyle = col
                        ctx.fillRect(i, y, 1, Math.max(1, prevY - y))
                        topSilD = d
                        prevY = y
                    }
                    prevH = raw
                    if (prevY < 4) break
                }
                groundTop[i] = prevY
                groundD[i] = topSilD
            }
        }
        const BIOMES_IDX = (h) => (h <= WATER ? 0 : h <= 20 ? 1 : h <= 54 ? 2 : h <= 74 ? 3 : 4)

        const clipTop = (p, halfW) => {
            const lo = Math.max(0, Math.floor(p.sx - halfW)), hi = Math.min(W - 1, Math.ceil(p.sx + halfW))
            let top = 0
            for (let c = lo; c <= hi; c++) if (p.d >= groundD[c] && groundTop[c] > top) top = groundTop[c]
            return top
        }

        const paintSprites = () => {
            const items = []
            for (const p of gs.pearls) {
                if (!p.alive) continue
                const pr = project(p.x, p.y, p.z)
                if (pr) items.push({ d: pr.d, sx: pr.sx, hw: 3 * pr.k, fn: () => drawPearl(ctx, pr.sx, pr.sy, Math.max(0.5, pr.k / 3), f.n + p.x * 7) })
            }
            for (const b of gs.books) {
                if (b.taken) continue
                const pr = project(b.x, b.y, Math.max(sampleH(gs, b.x, b.y), WATER) + 4)
                if (pr) items.push({ d: pr.d, sx: pr.sx, hw: 6 * pr.k, fn: () => drawBook(ctx, pr.sx, pr.sy, Math.max(0.5, pr.k / 5), f.n) })
            }
            for (const hs of (gs.huts || [])) {
                const pr = project(hs.x, hs.y, sampleH(gs, hs.x, hs.y))
                if (pr) items.push({ d: pr.d, sx: pr.sx, hw: 6 * pr.k, fn: () => drawHut(ctx, pr.sx, pr.sy, Math.max(0.3, pr.k / 5), hs.v) })
            }
            const prC = project(gs.castle.x, gs.castle.y, sampleH(gs, gs.castle.x, gs.castle.y))
            if (prC && gs.castleStage > 0) {
                items.push({ d: prC.d, sx: prC.sx, hw: 16 * prC.k, fn: () => drawCastle(ctx, prC.sx, prC.sy, Math.max(0.3, prC.k / 5), gs.castleStage) })
                for (let bi = 0; bi < gs.castleStage; bi++) {
                    const bx = gs.castle.x + Math.cos(bi * 2.1) * 26, by = gs.castle.y + Math.sin(bi * 2.1) * 26
                    const pb = project(bx, by, sampleH(gs, bx, by) + 16 + Math.sin(gs.tick * 0.02 + bi) * 3)
                    if (pb) items.push({ d: pb.d, sx: pb.sx, hw: 4 * pb.k, fn: () => drawBalloon(ctx, pb.sx, pb.sy, Math.max(0.3, pb.k / 5), f.n, bi) })
                }
            }
            const wz = gs.wizard
            const prT = project(wz.tx, wz.ty, sampleH(gs, wz.tx, wz.ty))
            if (prT) items.push({ d: prT.d, sx: prT.sx, hw: 7 * prT.k, fn: () => drawTower(ctx, prT.sx, prT.sy, Math.max(0.3, prT.k / 4), f.n, wz.alive) })
            if (wz.alive) {
                const prW = project(wz.x, wz.y, sampleH(gs, wz.x, wz.y) + 10 + Math.sin(gs.tick * 0.05) * 2)
                if (prW) items.push({ d: prW.d, sx: prW.sx, hw: 5 * prW.k, fn: () => drawWizard(ctx, prW.sx, prW.sy, Math.max(0.4, prW.k / 4), f.n) })
            }
            for (const m of gs.monsters) {
                if (m.grabbed) continue
                const pr = project(m.x, m.y, sampleH(gs, m.x, m.y))
                if (!pr) continue
                const k = Math.max(0.3, pr.k / 5)
                if (m.kind === 'giant') items.push({ d: pr.d, sx: pr.sx, hw: 6 * k * 1.5, fn: () => drawGiant(ctx, pr.sx, pr.sy, k * 1.5, f.n, m.hp < 12) })
                else if (m.kind === 'wolf') items.push({ d: pr.d, sx: pr.sx, hw: 5 * k, fn: () => drawWolf(ctx, pr.sx, pr.sy, k, f.n, true) })
                else items.push({ d: pr.d, sx: pr.sx, hw: 4 * k, fn: () => drawCow(ctx, pr.sx, pr.sy, k, f.n) })
            }
            for (const fm of gs.fireMarks) {
                const pr = project(fm.x, fm.y, sampleH(gs, fm.x, fm.y))
                if (!pr) continue
                const age = gs.tick - fm.t
                if (age > 900) continue
                items.push({
                    d: pr.d - 0.1, sx: pr.sx, hw: 5 * Math.max(0.4, pr.k / 4), fn: () => {
                        const fk = Math.max(0.4, pr.k / 4)
                        ctx.globalAlpha = 0.75
                        ctx.fillStyle = '#3a2418'
                        ctx.beginPath(); ctx.ellipse(pr.sx, pr.sy, 5 * fk, 1.8 * fk, 0, 0, Math.PI * 2); ctx.fill()
                        if (age < 240) {
                            const fl = Math.sin(gs.tick * 0.3 + fm.x) * fk
                            ctx.fillStyle = '#e05818'
                            ctx.fillRect(pr.sx - 1.5 * fk, pr.sy - (3 + Math.abs(fl)) * fk, 3 * fk, 3 * fk)
                            ctx.fillStyle = '#ffc040'
                            ctx.fillRect(pr.sx - 0.7 * fk, pr.sy - 2.4 * fk, 1.4 * fk, 1.6 * fk)
                        }
                        ctx.globalAlpha = 1
                    },
                })
            }
            for (const p of gs.projs) {
                const pr = project(p.x, p.y, p.z)
                if (!pr) continue
                const k = Math.max(0.4, pr.k / 4)
                if (p.kind === 'fireball') items.push({ d: pr.d, sx: pr.sx, hw: 3 * k, fn: () => drawFireball(ctx, pr.sx, pr.sy, k) })
                else if (p.kind === 'bolt') items.push({ d: pr.d, sx: pr.sx, hw: 3 * k, fn: () => drawBolt(ctx, pr.sx, pr.sy, k, '#c060ff') })
                else if (p.kind === 'rock') items.push({ d: pr.d, sx: pr.sx, hw: 2.5 * k, fn: () => { ctx.fillStyle = '#7a6a54'; ctx.beginPath(); ctx.arc(pr.sx, pr.sy, 2 * k, 0, Math.PI * 2); ctx.fill() } })
                else if (p.kind === 'arrow') items.push({ d: pr.d, sx: pr.sx, hw: 2.5 * k, fn: () => { ctx.fillStyle = '#d8d8e0'; ctx.fillRect(pr.sx - 2 * k, pr.sy - 0.4 * k, 4 * k, 0.8 * k) } })
                else if (p.kind === 'throw') items.push({ d: pr.d, sx: pr.sx, hw: 3 * k, fn: () => { ctx.fillStyle = '#9a6a3a'; ctx.beginPath(); ctx.arc(pr.sx, pr.sy, 2.2 * k, 0, Math.PI * 2); ctx.fill() } })
            }
            items.sort((a, b) => b.d - a.d)
            for (const it of items) {
                ctx.save()
                const top = clipTop(it, it.hw)
                ctx.beginPath()
                ctx.rect(0, 0, W, Math.max(top, 0))
                ctx.clip()
                it.fn()
                ctx.restore()
            }
        }

        const paintCarpetAndHands = () => {
            const sway = keys.l ? -3 : keys.r ? 3 : 0
            const bob = Math.sin(gs.tick * 0.09) * 1.5
            ctx.fillStyle = '#8a1f28'
            ctx.beginPath()
            ctx.moveTo(96 + sway, H - HUD_H); ctx.lineTo(150 + sway, H - HUD_H); ctx.lineTo(128 + sway, H - HUD_H - 16 + bob); ctx.closePath(); ctx.fill()
            ctx.beginPath()
            ctx.moveTo(170 + sway, H - HUD_H); ctx.lineTo(224 + sway, H - HUD_H); ctx.lineTo(192 + sway, H - HUD_H - 16 + bob); ctx.closePath(); ctx.fill()
            ctx.fillStyle = '#b8303c'
            ctx.beginPath()
            ctx.moveTo(104 + sway, H - HUD_H); ctx.lineTo(144 + sway, H - HUD_H); ctx.lineTo(128 + sway, H - HUD_H - 11 + bob); ctx.closePath(); ctx.fill()
            ctx.beginPath()
            ctx.moveTo(176 + sway, H - HUD_H); ctx.lineTo(216 + sway, H - HUD_H); ctx.lineTo(192 + sway, H - HUD_H - 11 + bob); ctx.closePath(); ctx.fill()
            ctx.fillStyle = '#d8a840'
            for (let i = 0; i < 4; i++) {
                ctx.fillRect(100 + i * 12 + sway, H - HUD_H - 2, 2, 2)
                ctx.fillRect(178 + i * 12 + sway, H - HUD_H - 2, 2, 2)
            }
            const handY = (fl) => H - HUD_H - 2 + (fl > 0 ? -10 - fl : 0)
            ctx.fillStyle = '#caa888'
            ctx.fillRect(118 + sway, handY(flashL), 7, 8)
            ctx.fillRect(196 + sway, handY(flashR), 7, 8)
            const orbL = gs.hands.L ? SPELL_COLORS[gs.hands.L] : null
            const orbR = gs.hands.R ? SPELL_COLORS[gs.hands.R] : null
            if (flashL > 0 && orbL) { ctx.fillStyle = orbL; ctx.beginPath(); ctx.arc(121 + sway, handY(flashL) - 3, 3.4, 0, Math.PI * 2); ctx.fill() }
            if (flashR > 0 && orbR) { ctx.fillStyle = orbR; ctx.beginPath(); ctx.arc(199 + sway, handY(flashR) - 3, 3.4, 0, Math.PI * 2); ctx.fill() }
            if (gs.heldEnt) {
                ctx.fillStyle = '#58e8d8'
                ctx.beginPath(); ctx.arc(W / 2, H - HUD_H - 30 + Math.sin(gs.tick * 0.2), 4, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#9a6a3a'
                ctx.beginPath(); ctx.arc(W / 2, H - HUD_H - 30 + Math.sin(gs.tick * 0.2), 2.4, 0, Math.PI * 2); ctx.fill()
            }
            ctx.fillStyle = '#e8e8f0'
            ctx.fillRect(W / 2 - 5, HORIZON + 16, 2, 1)
            ctx.fillRect(W / 2 + 3, HORIZON + 16, 2, 1)
            ctx.fillRect(W / 2, HORIZON + 13, 1, 2)
            if (gs.shield > 0) {
                ctx.globalAlpha = 0.25 + Math.sin(gs.tick * 0.2) * 0.1
                ctx.strokeStyle = '#58c8ff'
                ctx.lineWidth = 1
                ctx.beginPath(); ctx.ellipse(W / 2, H - HUD_H - 24, 46, 26, 0, 0, Math.PI * 2); ctx.stroke()
                ctx.globalAlpha = 1
            }
        }

        const paintHud = () => {
            const y0 = H - HUD_H
            const g = ctx.createLinearGradient(0, y0, 0, H)
            g.addColorStop(0, '#2c3678')
            g.addColorStop(1, '#161c48')
            ctx.fillStyle = g
            ctx.fillRect(0, y0, W, HUD_H)
            ctx.fillStyle = '#46529a'
            ctx.fillRect(0, y0, W, 1)
            ctx.fillStyle = '#0e1230'
            ctx.fillRect(0, H - 1, W, 1)
            for (let i = 6; i < W; i += 24) {
                ctx.fillStyle = '#5a66aa'
                ctx.fillRect(i, y0 + 2, 1, 1)
            }
            // radar
            ctx.fillStyle = '#0e1a38'
            ctx.beginPath(); ctx.arc(17, y0 + 14, 11, 0, Math.PI * 2); ctx.fill()
            ctx.strokeStyle = '#5a66aa'
            ctx.stroke()
            const sc = 11 / 240
            const dot = (wx, wy, col, sz = 1) => {
                const dx = ((wx - gs.x + MAP / 2) % MAP + MAP) % MAP - MAP / 2
                const dy = ((wy - gs.y + MAP / 2) % MAP + MAP) % MAP - MAP / 2
                const fwd = dx * Math.cos(gs.yaw) + dy * Math.sin(gs.yaw)
                const side = -dx * Math.sin(gs.yaw) + dy * Math.cos(gs.yaw)
                const rx = 17 + side * sc, ry = y0 + 14 - fwd * sc
                if ((rx - 17) ** 2 + (ry - y0 - 14) ** 2 > 100) return
                ctx.fillStyle = col
                ctx.fillRect(rx - sz / 2, ry - sz / 2, sz, sz)
            }
            for (const p of gs.pearls) if (p.alive) dot(p.x, p.y, '#e8e0c0')
            for (const m of gs.monsters) dot(m.x, m.y, m.kind === 'cow' ? '#d8d0c0' : '#e05040', 1.6)
            for (const b of gs.books) if (!b.taken) dot(b.x, b.y, '#40e0d0')
            dot(gs.castle.x, gs.castle.y, '#ffd84a', 2.4)
            if (gs.wizard.alive) dot(gs.wizard.x, gs.wizard.y, '#c060ff', 2.4)

            // mana bar
            ctx.fillStyle = '#0e1a38'
            ctx.fillRect(34, y0 + 6, 168, 7)
            const fill = Math.min(1, gs.mana / QUOTA)
            ctx.fillStyle = '#e8b830'
            ctx.fillRect(35, y0 + 7, 166 * fill, 5)
            ctx.fillStyle = '#0e1a38'
            for (let q = 1; q < 6; q++) ctx.fillRect(34 + (168 * q) / 6, y0 + 6, 1, 7)
            ctx.fillStyle = '#ffd860'
            ctx.font = '6px monospace'
            ctx.fillText(`MANA ${Math.floor(gs.mana)}/${QUOTA}`, 34, y0 + 21)
            // hearts
            for (let i = 0; i < 5; i++) {
                const full = gs.hp >= (i + 1) * 20
                const half = !full && gs.hp > i * 20
                ctx.fillStyle = '#401018'
                ctx.fillRect(210 + i * 9, y0 + 5, 7, 6)
                ctx.fillStyle = full ? '#e83848' : half ? '#e83848' : 'transparent'
                if (full) ctx.fillRect(211 + i * 9, y0 + 6, 5, 4)
                else if (half) ctx.fillRect(211 + i * 9, y0 + 6, 2, 4)
            }
            ctx.fillStyle = '#ffd860'
            ctx.fillText('LIFE', 212, y0 + 21)
            // hands
            const slot = (x, id, cool, label) => {
                ctx.fillStyle = '#0e1a38'
                ctx.fillRect(x, y0 + 3, 14, 14)
                const ready = id && cool <= 0 && gs.mana >= (spellById(id)?.cost ?? 0)
                ctx.strokeStyle = ready ? '#ffd84a' : '#3a4478'
                ctx.strokeRect(x + 0.5, y0 + 3.5, 13, 13)
                if (id) drawSpellIcon(ctx, id, x + 7, y0 + 10, 4)
                ctx.fillStyle = '#8890c0'
                ctx.fillText(label, x + 5, y0 + 24)
            }
            slot(262, gs.hands.L, gs.coolL, 'A')
            slot(284, gs.hands.R, gs.coolR, 'X')
            // score
            ctx.fillStyle = '#fff'
            ctx.font = '7px monospace'
            ctx.fillText(String(gs.score).padStart(6, '0'), 302, y0 + 11)
            if (toast > 0) {
                const a = toast > 120 ? 1 : toast / 120
                ctx.globalAlpha = a
                ctx.fillStyle = '#ffe9a0'
                ctx.font = 'bold 9px monospace'
                ctx.textAlign = 'center'
                ctx.fillText(toastMsg, W / 2, 24)
                ctx.textAlign = 'left'
                ctx.globalAlpha = 1
                if (!pausedRef.current) toast--
            }
            if (gs.wizSlow > 0) {
                ctx.globalAlpha = 0.08
                ctx.fillStyle = '#8040ff'
                ctx.fillRect(0, 0, W, H - HUD_H)
                ctx.globalAlpha = 1
            }
            if (hurtFlash > 0) {
                ctx.globalAlpha = hurtFlash / 24
                ctx.fillStyle = '#e02030'
                ctx.fillRect(0, 0, W, H - HUD_H)
                ctx.globalAlpha = 1
                hurtFlash--
            }
        }

        const paint = () => {
            const sx = shake > 0 ? ((performance.now() % 7) - 3) * shake * 0.35 : 0
            const sy = shake > 0 ? ((performance.now() % 5) - 2) * shake * 0.35 : 0
            if (shake > 0) { shake *= 0.85; if (shake < 0.35) shake = 0 }
            if (flashL > 0) flashL--
            if (flashR > 0) flashR--
            ctx.clearRect(0, 0, W, H)
            ctx.save()
            ctx.translate(sx, sy)
            paintTerrain()
            paintSprites()
            paintCarpetAndHands()
            ctx.restore()
            for (let i = part.length - 1; i >= 0; i--) {
                const pa = part[i]
                pa.t++; pa.x += pa.vx; pa.y += pa.vy; pa.vy += 0.07
                if (pa.t > 30 || pa.y > H) { part.splice(i, 1); continue }
                ctx.globalAlpha = 1 - pa.t / 30
                ctx.fillStyle = pa.col
                ctx.fillRect(pa.x, pa.y, 2, 2)
            }
            ctx.globalAlpha = 1
            paintHud()
        }

        const startPlay = () => {
            gs = makeGame((performance.now() * 977) >>> 0)
            demoT = 0
            part.length = 0
            keys.l = keys.r = keys.u = keys.d = false
            throwL = throwR = false
            setMode('play')
            say('RESTORE THIS WORLD TO EQUILIBRIUM')
            audioController.playSweep(330, 660, 0.25, 'square', 0.07)
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (pausedRef.current || e.repeat) return
            if (e.code === 'ArrowLeft') keys.l = true
            if (e.code === 'ArrowRight') keys.r = true
            if (e.code === 'ArrowUp') keys.u = true
            if (e.code === 'ArrowDown') keys.d = true
            if (e.code === 'Space') throwL = true
            if (e.code === 'KeyX' || e.code === 'KeyZ') throwR = true
            if (e.code === 'KeyQ') cycleR(gs)
            const digit = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code)
            if (digit >= 0 && SPILLS[digit]) setHand(gs, 'L', SPILLS[digit].id)
        }
        const onUp = (e) => {
            if (e.code === 'ArrowLeft') keys.l = false
            if (e.code === 'ArrowRight') keys.r = false
            if (e.code === 'ArrowUp') keys.u = false
            if (e.code === 'ArrowDown') keys.d = false
        }
        const onBlur = () => { keys.l = keys.r = keys.u = keys.d = false }
        const onPointer = (e) => {
            if (e.target instanceof Element && e.target.closest('[data-vc], button')) return
            const sc = screenRef.current
            if (sc === 'attract') { startPlay(); return }
            if (sc === 'over') { if (performance.now() - overAtRef.current > 900) setMode('attract'); return }
            if (sc === 'play' && !pausedRef.current) {
                if (e.button === 2) throwR = true
                else if (e.button === 0) throwL = true
            }
        }
        const onCtx = (e) => e.preventDefault()
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        canvas.addEventListener('pointerdown', onPointer)
        canvas.addEventListener('contextmenu', onCtx)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const sc = Math.min(r.width / W, r.height / H)
            canvas.style.width = `${W * sc}px`
            canvas.style.height = `${H * sc}px`
        }
        window.addEventListener('resize', resize)
        resize()

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (!pausedRef.current) {
                if (contractHoldsLoop()) { acc = 0 }
                else {
                    acc += ft
                    while (acc >= FIXED_DT) { doFrameSim(); acc -= FIXED_DT }
                }
            }
            paint()
        }
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            window.__carpetTest = {
                probe: () => ({
                    screen: screenRef.current, tick: gs.tick, end: gs.end, score: gs.score,
                    mana: gs.mana, hp: gs.hp, deaths: gs.deaths, kills: gs.kills,
                    wizAlive: gs.wizard.alive, wizHp: gs.wizard.hp,
                    learned: [...gs.learned], hands: { ...gs.hands },
                    x: +gs.x.toFixed(2), y: +gs.y.toFixed(2), alt: +gs.alt.toFixed(2), yaw: +gs.yaw.toFixed(4),
                    pearlsAlive: gs.pearls.filter((p) => p.alive).length,
                    projs: gs.projs.length, keys: { ...keys },
                }),
                start: startPlay,
                hash: () => stateHash(gs),
            }
            mountDbg({
                title: 'MAGIC CARPET',
                getState: () => [
                    `mana ${Math.floor(gs.mana)}/${QUOTA} stage ${gs.castleStage} hp ${Math.round(gs.hp)} shield ${gs.shield} deaths ${gs.deaths}`,
                    `wizard ${gs.wizard.alive ? `hp ${gs.wizard.hp} hoard ${gs.wizard.mana}` : 'SLAIN'} learned ${gs.learned.join(',')} hands ${gs.hands.L}/${gs.hands.R}`,
                    `pos ${gs.x.toFixed(0)},${gs.y.toFixed(0)} alt ${gs.alt.toFixed(0)} yaw ${gs.yaw.toFixed(2)} pearls ${gs.pearls.filter((p) => p.alive).length} monsters ${gs.monsters.length}`,
                    `screen ${screenRef.current} paused ${pausedRef.current} end ${gs.end} score ${gs.score}`,
                ],
                actions: [
                    {
                        label: 'PROGNOSIS', run: () => {
                            if (gs.end) return `already ${gs.end}`
                            const clone = JSON.parse(JSON.stringify(gs))
                            clone.events = []
                            let t = 0
                            while (!clone.end && t < 60000) { step(clone, autopilot(clone)); t++ }
                            return clone.end === 'win'
                                ? `WINNABLE from here: equilibrium at tick ${clone.tick} (${clone.score} pts)`
                                : `NOT winnable by the autopilot from here: end=${clone.end || 'timeout'} mana ${Math.floor(clone.mana)}/${QUOTA}`
                        },
                    },
                    { label: '+30 MANA', run: () => { gs.mana += 30; return `mana ${Math.floor(gs.mana)}` } },
                    { label: 'LEARN ALL SPELLS', run: () => { for (const sp of SPILLS) if (!gs.learned.includes(sp.id)) gs.learned.push(sp.id); if (!gs.hands.R) gs.hands.R = 'lightning'; return 'spellbook full' } },
                    { label: 'WIZARD -20', run: () => { gs.wizard.hp -= 20; return `wizard hp ${gs.wizard.hp}` } },
                ],
            })
            let contractSeed = 0
            exposeGame({
                id: 'magic-carpet',
                buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
                reset: (seed) => {
                    contractSeed = seed >>> 0
                    gs = makeGame(contractSeed)
                    demoT = 0
                    part.length = 0
                    keys.l = keys.r = keys.u = keys.d = false
                    throwL = throwR = false
                    setMode('play')
                },
                tick: (pad) => {
                    if (gs.end) { gs.tick += 1; return }
                    doSim({ left: pad.left, right: pad.right, up: pad.up, down: pad.down, castL: pad.a, castR: pad.b })
                },
                state: () => ({
                    tick: gs.tick, score: gs.score, done: gs.end !== null,
                    seed: contractSeed, mana: Math.floor(gs.mana), hp: Math.round(gs.hp),
                    deaths: gs.deaths, kills: gs.kills, wizAlive: gs.wizard.alive,
                    stage: gs.castleStage, hash: stateHash(gs),
                }),
                canvas: () => canvas,
                snapshot: () => JSON.parse(JSON.stringify(gs)),
                restore: (s) => { gs = s },
            })
        }

        return () => {
            if (import.meta.env.DEV) { if (window.__carpetTest) delete window.__carpetTest; unexposeGame(); unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('resize', resize)
            canvas.removeEventListener('pointerdown', onPointer)
            canvas.removeEventListener('contextmenu', onCtx)
            cancelAnimationFrame(raf)
            canvas.remove()
        }
    }, [setMode])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])
    const play = screen === 'play'

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0 flex items-center justify-center" />

            {screen === 'attract' && (
                <div className="absolute inset-x-0 top-4 text-center pointer-events-none">
                    <h1 className="text-4xl font-black" style={{ color: '#e8c860', textShadow: '0 0 18px #6a4ad0, 3px 3px 0 #3a1a5a' }}>MAGIC CARPET</h1>
                    <p className="text-purple-200/90 font-mono mt-1 text-sm">fly . gather mana . restore the world</p>
                    <p className="text-white font-mono font-bold mt-2 animate-pulse">TAP / PRESS ANY KEY TO START</p>
                    <p className="text-purple-100/80 font-mono text-[11px] mt-2 px-8 leading-4">
                        arrows steer the carpet (it banks and cannot crash) — A casts your left hand, X your right<br />
                        fly through glowing grimoires to learn spells — some elude you the first time<br />
                        mana pearls flow to your castle; grow it to 180 stored mana to restore equilibrium<br />
                        the rival wizard hoards too — destroy him and his hoard scatters into pearls
                    </p>
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-purple-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'EQUILIBRIUM RESTORED' : 'THE WORLD KEEPS ITS MANA'}</h2>
                    <p className="text-lg mb-2">{end.score} pts · {end.deaths} fall{end.deaths === 1 ? '' : 's'}</p>
                    <p className="text-purple-200/80 mb-4 text-sm">{end.win ? 'the castle holds the quota — this world is whole' : 'dying with an empty castle unravels the flight'}</p>
                    <p className="mt-2 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'MAGIC CARPET')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} secondAction={{ label: '✦', code: 'KeyX' }} />
        </div>
    )
}

export default MagicCarpetGame

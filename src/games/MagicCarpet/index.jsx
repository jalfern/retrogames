// MAGIC CARPET — Bullfrog's 1994 DOS god-game, rebuilt whole in code. The rules
// live in ./sim.js (pure, seeded, harness-provable). #1083 moved the world to
// the GPU: ./renderer.js is a fresh WebGL2 pass (heightmap-sampled terrain,
// real water, sky, fire/smoke particles, lightning, bloom) and this file is the
// shell: the loop, the blue-stone HUD (2D overlay canvas), input and hooks.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop } from '../../utils/gameContract'
import {
    W, H, HUD_H, HORIZON, MAP,
    LEVELS,
    SPILLS, spellById,
    makeGame, step, autopilot, stateHash, setHand, cycleR, crater,
} from './sim.js'
import { createCarpetGL } from './renderer.js'

const FIXED_DT = 1000 / 60

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
        const lite = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lite')
        const glCanvas = document.createElement('canvas')
        glCanvas.dataset.mcStage = '1'
        glCanvas.className = 'absolute block'
        glCanvas.style.touchAction = 'none'
        glCanvas.style.width = '100%'
        glCanvas.style.height = '100%'
        wrap.appendChild(glCanvas)
        const canvas = document.createElement('canvas')
        canvas.dataset.mcHud = '1'
        canvas.width = W; canvas.height = H
        canvas.className = 'absolute block'
        canvas.style.imageRendering = 'pixelated'
        canvas.style.touchAction = 'none'
        canvas.style.pointerEvents = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = false

        let renderer = null
        try {
            renderer = createCarpetGL(glCanvas, { lite })
        } catch {
            renderer = null
        }

        let gs = makeGame(7)
        let demoSeed = 7, demoT = 0
        let raf = 0, last = 0, acc = 0
        let toast = 0, toastMsg = '', shake = 0
        let flashL = 0, flashR = 0, hurtFlash = 0
        let vaultFlash = 0, prevSeg = -1
        let bankS = 0, sinkS = 0, prevAlt = gs.alt
        let bankHum = 0
        const keys = { l: false, r: false, u: false, d: false }
        let throwL = false, throwR = false
        let boostKey = false, upHold = 0, boostOn = false, boostPrev = false

        const say = (m) => { toastMsg = m; toast = 150 }

        const finish = (win) => {
            setEnd({ win, score: gs.score, deaths: gs.deaths, worlds: gs.levelClears + (win ? 1 : 0) })
            overAtRef.current = performance.now()
            setMode('over')
        }

        const handleEvents = (evts) => {
            for (const e of evts) {
                if (e.type === 'pickup') {
                    audioController.playTone(760 + (e.m || 3) * 30, 0.05, 'triangle', 0.05)
                } else if (e.type === 'bankIn') {
                    bankHum = 30
                    if (e.m >= 3) {
                        audioController.playTone(560, 0.035, 'sine', 0.045)
                        audioController.playTone(660, 0.035, 'sine', 0.045, 0.07)
                        audioController.playTone(784, 0.05, 'sine', 0.045, 0.14)
                    } else {
                        audioController.playTone(520 + Math.min(6, e.m) * 40, 0.04, 'sine', 0.04)
                    }
                } else if (e.type === 'spill') {
                    audioController.playSweep(600, 120, 0.5, 'triangle', 0.08)
                    say('YOUR LOAD OF MANA IS LOST')
                } else if (e.type === 'ignite') {
                    audioController.playNoise(0.12, 0.05)
                } else if (e.type === 'hutDown') {
                    audioController.playNoise(0.2, 0.08)
                    audioController.playTone(85, 0.12, 'square', 0.06)
                    shake = Math.max(shake, 3)
                } else if (e.type === 'level') {
                    audioController.playTone(523, 0.12, 'square', 0.07)
                    audioController.playTone(659, 0.12, 'square', 0.07, 0.12)
                    audioController.playTone(784, 0.12, 'square', 0.07, 0.24)
                    audioController.playTone(1046, 0.3, 'square', 0.07, 0.36)
                    say(`WORLD RESTORED — ENTER ${e.name}`)
                } else if (e.type === 'cast') {
                    if (e.hand === 'L') flashL = 14; else flashR = 14
                    const id = e.id
                    if (id === 'fireball') audioController.playSweep(640, 180, 0.16, 'sawtooth', 0.07)
                    else if (id === 'telekinesis') audioController.playSweep(260, 520, 0.12, 'sine', 0.06)
                    else if (id !== 'heal' && id !== 'protect' && id !== 'slow') audioController.playTone(500, 0.05, 'square', 0.05)
                } else if (e.type === 'zap') {
                    audioController.playNoise(0.16, 0.09)
                    audioController.playSweep(1500, 260, 0.2, 'square', 0.06)
                    audioController.playTone(210, 0.26, 'triangle', 0.028, 0.14)
                    audioController.playTone(140, 0.4, 'triangle', 0.016, 0.3)
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
                    audioController.playTone(58, 0.28, 'square', 0.032, 0.15)
                    audioController.playTone(46, 0.42, 'square', 0.018, 0.32)
                    shake = Math.max(shake, 4)
                } else if (e.type === 'wizHit') {
                    audioController.playTone(240, 0.07, 'square', 0.06)
                } else if (e.type === 'wizardDown') {
                    audioController.playNoise(0.5, 0.12)
                    audioController.playSweep(300, 50, 0.7, 'sawtooth', 0.09)
                    shake = 8
                    say('THE RIVAL WIZARD FALLS — HIS TREASURE SCATTERS')
                } else if (e.type === 'towerDown') {
                    audioController.playNoise(0.55, 0.12)
                    audioController.playTone(60, 0.3, 'square', 0.08)
                    shake = Math.max(shake, 6)
                    say('THE WIZARD\'S TOWER TOPPLES')
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
            const evts = gs.events.splice(0)
            if (renderer) renderer.handleEvents(evts, gs)
            handleEvents(evts)
        }

        const tickDemo = () => {
            upHold = 0; boostOn = false; boostPrev = false
            if (gs.end || demoT > 2600) { demoSeed = (demoSeed * 31 + 17) % 9973; gs = makeGame(demoSeed); demoT = 0 }
            demoT++
            doSim(autopilot(gs))
        }

        const doFrameSim = () => {
            const sc = screenRef.current
            if (sc === 'attract') { tickDemo(); return }
            if (sc !== 'play') return
            upHold = keys.u ? upHold + 1 : 0
            boostOn = boostKey || upHold >= 24
            if (boostOn && !boostPrev) audioController.playSweep(220, 520, 0.22, 'sine', 0.05)
            if (boostOn && gs.tick % 12 === 0) audioController.playNoise(0.06, 0.02)
            if (gs.tick % 46 === 0) audioController.playSweep(74, 58, 0.5, 'sine', boostOn ? 0.028 : 0.015)
            if (bankHum > 0) {
                if (gs.tick % 9 === 0) audioController.playTone(98 + (gs.tick % 3) * 7, 0.2, 'sine', 0.022)
                bankHum--
            }
            if (gs.tick % 170 === 0) {
                const near = gs.monsters.find((m) => m.kind !== 'cow' &&
                    Math.hypot(((m.x - gs.x + MAP / 2) % MAP + MAP) % MAP - MAP / 2, ((m.y - gs.y + MAP / 2) % MAP + MAP) % MAP - MAP / 2) < 95)
                if (near) {
                    audioController.playTone(near.kind === 'giant' ? 44 : 62, 0.34, 'sawtooth', 0.026)
                    audioController.playTone(near.kind === 'giant' ? 33 : 47, 0.5, 'sawtooth', 0.016, 0.2)
                }
            }
            boostPrev = boostOn
            doSim({
                left: keys.l, right: keys.r, up: keys.u, down: keys.d,
                castL: throwL, castR: throwR, boost: boostOn,
            })
            throwL = throwR = false
        }

        const paintCarpetAndHands = (bk = 0) => {
            const sway = (keys.l ? -3 : keys.r ? 3 : 0) + bk * 26
            const squash = Math.abs(bk) * 4
            const bob = Math.sin(gs.tick * 0.09) * 1.5
            if (boostOn) {
                ctx.globalAlpha = 0.3
                ctx.fillStyle = '#dfe8f5'
                for (let i = 0; i < 4; i++) {
                    const yy = 40 + ((gs.tick * 3 + i * 37) % (H - HUD_H - 52))
                    ctx.fillRect(6 + i * 5, yy, 1, 7)
                    ctx.fillRect(W - 7 - i * 5, yy + 11, 1, 7)
                }
                ctx.globalAlpha = 1
            }
            const stretch = boostOn ? 4 : 0
            const flut = boostOn ? 2.3 : 1.1
            const flapL = Math.sin(gs.tick * 0.26) * flut
            const flapR = Math.sin(gs.tick * 0.26 + Math.PI) * flut
            const baseY = H - HUD_H
            const yL = baseY - bk * 5
            const yR = baseY + bk * 5
            const yC = baseY - bk * 2.5
            ctx.fillStyle = '#8a1f28'
            ctx.beginPath()
            ctx.moveTo(96 + sway, yL); ctx.lineTo(150 + sway, yC); ctx.lineTo(128 + sway + bk * 6, baseY - 16 + bob - stretch + flapL + squash); ctx.closePath(); ctx.fill()
            ctx.beginPath()
            ctx.moveTo(170 + sway, yC); ctx.lineTo(224 + sway, yR); ctx.lineTo(192 + sway + bk * 6, baseY - 16 + bob - stretch + flapR + squash); ctx.closePath(); ctx.fill()
            ctx.fillStyle = '#b8303c'
            ctx.beginPath()
            ctx.moveTo(104 + sway, yL + bk); ctx.lineTo(144 + sway, yC); ctx.lineTo(128 + sway + bk * 4, baseY - 11 + bob - stretch + flapL * 0.6 + squash); ctx.closePath(); ctx.fill()
            ctx.beginPath()
            ctx.moveTo(176 + sway, yC); ctx.lineTo(216 + sway, yR - bk); ctx.lineTo(192 + sway + bk * 4, baseY - 11 + bob - stretch + flapR * 0.6 + squash); ctx.closePath(); ctx.fill()
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
            const orbReady = (id, cool) => id && cool <= 0 && gs.mana >= (spellById(id)?.cost ?? 99)
            if (!(flashL > 0) && orbReady(gs.hands.L, gs.coolL)) {
                ctx.globalAlpha = 0.4 + Math.sin(gs.tick * 0.15) * 0.12
                ctx.fillStyle = orbL; ctx.beginPath(); ctx.arc(121 + sway, handY(0) - 3, 2.4, 0, Math.PI * 2); ctx.fill()
                ctx.globalAlpha = 1
            }
            if (!(flashR > 0) && orbReady(gs.hands.R, gs.coolR)) {
                ctx.globalAlpha = 0.4 + Math.sin(gs.tick * 0.15 + 2) * 0.12
                ctx.fillStyle = orbR; ctx.beginPath(); ctx.arc(199 + sway, handY(0) - 3, 2.4, 0, Math.PI * 2); ctx.fill()
                ctx.globalAlpha = 1
            }
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
            for (const hs of gs.huts) dot(hs.x, hs.y, hs.dead ? '#5a5262' : '#c89040', 1.2)
            for (const fm of gs.fireMarks) dot(fm.x, fm.y, '#ff5030', 1.6)
            dot(gs.castle.x, gs.castle.y, '#ffd84a', 2.4)
            if (gs.wizard.alive) dot(gs.wizard.x, gs.wizard.y, '#c060ff', 2.4)

            // vault bar (banked mana = the score) + carried pouch
            ctx.fillStyle = '#0e1a38'
            ctx.fillRect(34, y0 + 6, 130, 7)
            const fill = Math.min(1, gs.bank / gs.quota)
            ctx.fillStyle = '#e8b830'
            ctx.fillRect(35, y0 + 7, 128 * fill, 5)
            ctx.fillStyle = '#0e1a38'
            for (let q = 1; q < 5; q++) ctx.fillRect(34 + (130 * q) / 5, y0 + 6, 1, 7)
            const seg = Math.min(5, Math.floor(fill * 5))
            if (seg > prevSeg) { if (prevSeg >= 0) vaultFlash = 8; prevSeg = seg }
            else if (seg < prevSeg) prevSeg = seg
            if (vaultFlash > 0) {
                ctx.globalAlpha = (vaultFlash / 8) * 0.8
                ctx.fillStyle = '#fff'
                ctx.fillRect(35, y0 + 7, 128 * fill, 5)
                ctx.globalAlpha = 1
                vaultFlash--
            }
            ctx.fillStyle = '#ffd860'
            ctx.font = '6px monospace'
            ctx.fillText(`VAULT ${Math.floor(gs.bank)}/${gs.quota}`, 34, y0 + 21)
            ctx.fillStyle = '#0e1a38'
            ctx.fillRect(170, y0 + 6, 34, 7)
            ctx.fillStyle = '#f0d060'
            ctx.fillRect(171, y0 + 7, 32 * Math.min(1, gs.mana / 40), 5)
            ctx.fillStyle = '#ffe9a0'
            ctx.fillText(`CARRY ${Math.floor(gs.mana)}`, 168, y0 + 21)
            ctx.fillStyle = 'rgba(232, 200, 96, 0.85)'
            ctx.font = '7px monospace'
            ctx.fillText(`WORLD ${gs.level + 1}/${LEVELS.length}`, 6, 12)
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

        let prevYaw = gs.yaw
        let lastVisTick = -1
        const paint = () => {
            const sx = shake > 0 ? ((performance.now() % 7) - 3) * shake * 0.35 : 0
            const sy = shake > 0 ? ((performance.now() % 5) - 2) * shake * 0.35 : 0
            if (shake > 0) { shake *= 0.85; if (shake < 0.35) shake = 0 }
            const visual = gs.tick !== lastVisTick
            lastVisTick = gs.tick
            if (visual) {
                if (flashL > 0) flashL--
                if (flashR > 0) flashR--
                const steer = (keys.r ? 1 : 0) - (keys.l ? 1 : 0)
                const yawDelta = gs.yaw - prevYaw
                prevYaw = gs.yaw
                const bankTarget = screenRef.current === 'play' ? steer : Math.max(-1, Math.min(1, yawDelta * 14))
                bankS += (bankTarget - bankS) * 0.12
                sinkS += (Math.max(-1.2, Math.min(1.2, (gs.alt - prevAlt) * 0.6)) - sinkS) * 0.15
                prevAlt = gs.alt
            }
            if (renderer) {
                renderer.frame(gs, {
                    bank: bankS,
                    boost: boostOn || screenRef.current === 'attract',
                    pitch: 0.06 + (keys.d ? 0.05 : 0) - (keys.u ? 0.04 : 0),
                    sink: sinkS * 0.08,
                    shakeX: sx, shakeY: sy,
                })
            }
            ctx.clearRect(0, 0, W, H)
            ctx.save()
            ctx.translate(sx, sy)
            paintCarpetAndHands(screenRef.current === 'play' ? bankS : bankS * 0.5)
            ctx.restore()
            ctx.globalAlpha = 1
            paintHud()
        }

        const startPlay = () => {
            gs = makeGame((performance.now() * 977) >>> 0)
            demoT = 0
            if (renderer) renderer.resetWorld()
            keys.l = keys.r = keys.u = keys.d = false
            throwL = throwR = false
            boostKey = boostOn = boostPrev = false; upHold = 0
            vaultFlash = 0; prevSeg = -1
            setMode('play')
            say(`WORLD 1 — ${LEVELS[0].name} · FILL THE VAULT`)
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
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') boostKey = true
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
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') boostKey = false
        }
        const onBlur = () => { keys.l = keys.r = keys.u = keys.d = false; boostKey = false; upHold = 0; boostOn = false; boostPrev = false }
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
        glCanvas.addEventListener('pointerdown', onPointer)
        glCanvas.addEventListener('contextmenu', onCtx)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            const dprCap = lite ? 1 : 1.5
            const dpr = Math.min(window.devicePixelRatio || 1, dprCap)
            if (renderer) renderer.resize(Math.round(r.width * dpr), Math.round(r.height * dpr))
            const sc = Math.min(r.width / W, r.height / H)
            const hw = Math.round(W * sc), hh = Math.round(H * sc)
            canvas.style.width = `${hw}px`
            canvas.style.height = `${hh}px`
            canvas.style.left = `${Math.round((r.width - hw) / 2)}px`
            canvas.style.top = `${Math.round((r.height - hh) / 2)}px`
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
                    bank: Math.floor(gs.bank), level: gs.level, quota: gs.quota,
                    wizAlive: gs.wizard.alive, wizHp: gs.wizard.hp,
                    learned: [...gs.learned], hands: { ...gs.hands },
                    x: +gs.x.toFixed(2), y: +gs.y.toFixed(2), alt: +gs.alt.toFixed(2), yaw: +gs.yaw.toFixed(4),
                    pearlsAlive: gs.pearls.filter((p) => p.alive).length,
                    projs: gs.projs.length, keys: { ...keys }, boost: boostOn,
                    towerDown: gs.towerDown, craters: gs.craters.length,
                }),
                start: startPlay,
                hash: () => stateHash(gs),
                gl2: () => !!renderer,
                digHot: () => {
                    gs.quota = 999999
                    crater(gs, gs.x + Math.cos(gs.yaw) * 70, gs.y + Math.sin(gs.yaw) * 70, 16, 10, 1)
                    return gs.craters.length
                },
                fx: (e) => { if (renderer) renderer.handleEvents([e], gs) },
                killHut: () => { const hs = gs.huts[0]; hs.burn = 0; hs.dead = true; return 1 },
                smokePuffs: () => (renderer ? renderer.smokeCount() : -1),
                glowCells: () => (renderer ? renderer.glowCells() : -1),
                scorchCells: () => (renderer ? renderer.scorchCells() : -1),
                pixels: (x, y, w, h) => {
                    if (!renderer) return null
                    const g = renderer.gl
                    const cw = renderer.renderer.domElement.width, ch = renderer.renderer.domElement.height
                    const px0 = Math.min(Math.max(0, Math.floor(x * cw)), cw - 1)
                    const py0 = Math.min(Math.max(0, Math.floor(ch - y * ch)), ch - 1)
                    const pw = Math.min(Math.max(1, w), cw - px0)
                    const ph = Math.min(Math.max(1, h), ch - py0)
                    const buf = new Uint8Array(pw * ph * 4)
                    g.readPixels(px0, py0, pw, ph, g.RGBA, g.UNSIGNED_BYTE, buf)
                    return Array.from(buf)
                },
                forceDeath: () => {
                    gs.shield = 0; gs.bank = 0; gs.mana = 0; gs.hp = 0; gs.end = 'dead'
                    gs.events.push({ type: 'dead' })
                },
            }
            mountDbg({
                title: 'MAGIC CARPET',
                getState: () => [
                    `VAULT ${Math.floor(gs.bank)}/${gs.quota} CARRY ${Math.floor(gs.mana)} WORLD ${gs.level + 1}/${LEVELS.length} stage ${gs.castleStage} hp ${Math.round(gs.hp)} shield ${gs.shield} deaths ${gs.deaths}`,
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
                                ? `WINNABLE from here: vault quota banked at tick ${clone.tick} (${clone.score} pts)`
                                : `NOT winnable by the autopilot from here: end=${clone.end || 'timeout'} vault ${Math.floor(clone.bank)}/${clone.quota}`
                        },
                    },
                    { label: '+30 CARRY', run: () => { gs.mana += 30; return `carry ${Math.floor(gs.mana)}` } },
                    { label: 'LEARN ALL SPELLS', run: () => { for (const sp of SPILLS) if (!gs.learned.includes(sp.id)) gs.learned.push(sp.id); if (!gs.hands.R) gs.hands.R = 'lightning'; return 'spellbook full' } },
                    { label: 'WIZARD -20', run: () => { gs.wizard.hp -= 20; return `wizard hp ${gs.wizard.hp}` } },
                ],
            })
            let contractSeed = 0
            exposeGame({
                id: 'magic-carpet',
                buttons: ['left', 'right', 'up', 'down', 'a', 'b', 'boost'],
                reset: (seed) => {
                    contractSeed = seed >>> 0
                    gs = makeGame(contractSeed)
                    demoT = 0
                    if (renderer) renderer.resetWorld()
                    keys.l = keys.r = keys.u = keys.d = false
                    throwL = throwR = false
                    boostKey = boostOn = boostPrev = false; upHold = 0
                    vaultFlash = 0; prevSeg = -1
                    setMode('play')
                },
                tick: (pad) => {
                    if (gs.end) { gs.tick += 1; handleEvents(gs.events.splice(0)); return }
                    boostOn = !!pad.boost
                    if (boostOn && !boostPrev) audioController.playSweep(220, 520, 0.22, 'sine', 0.05)
                    boostPrev = boostOn
                    doSim({ left: pad.left, right: pad.right, up: pad.up, down: pad.down, castL: pad.a, castR: pad.b, boost: boostOn })
                },
                state: () => ({
                    tick: gs.tick, score: gs.score, done: gs.end !== null,
                    seed: contractSeed, mana: Math.floor(gs.mana), hp: Math.round(gs.hp),
                    bank: Math.floor(gs.bank), level: gs.level,
                    deaths: gs.deaths, kills: gs.kills, wizAlive: gs.wizard.alive,
                    stage: gs.castleStage, hash: stateHash(gs),
                }),
                canvas: () => glCanvas,
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
            glCanvas.removeEventListener('pointerdown', onPointer)
            glCanvas.removeEventListener('contextmenu', onCtx)
            cancelAnimationFrame(raf)
            if (renderer) renderer.dispose()
            canvas.remove()
            glCanvas.remove()
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
                    <p className="text-purple-200/90 font-mono mt-1 text-sm">fly . gather mana . fly it home . restore three worlds</p>
                    <p className="text-white font-mono font-bold mt-2 animate-pulse">TAP / PRESS ANY KEY TO START</p>
                    <AttractMessage
                        className="text-purple-100/80 font-mono text-[11px] mt-2 px-8 leading-4"
                        messages={[
                            'ARROWS STEER THE CARPET · IT BANKS AND CANNOT CRASH',
                            'A CASTS YOUR LEFT HAND · X YOUR RIGHT',
                            'GATHER MANA PEARLS · HOVER YOUR CASTLE TO FILL THE VAULT',
                            'DIE AND THE LOAD IS LOST',
                            'FIREBALLS CRATER THE LAND · BURNING VILLAGES BREED WOLVES',
                            'THREE WORLDS · EACH GUARDED BY A RIVAL WIZARD',
                        ]}
                    />
                </div>
            )}

            {screen === 'over' && end && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-purple-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${end.win ? 'text-yellow-300' : 'text-red-400'}`}>{end.win ? 'EQUILIBRIUM RESTORED' : 'THE WORLDS KEEP THEIR MANA'}</h2>
                    <p className="text-lg mb-2">{end.score} pts · {end.deaths} fall{end.deaths === 1 ? '' : 's'} · {end.worlds}/{LEVELS.length} worlds</p>
                    <p className="text-purple-200/80 mb-4 text-sm">{end.win ? 'every vault holds its quota — the worlds are whole' : 'dying with an empty vault unravels the flight'}</p>
                    <p className="mt-2 animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'MAGIC CARPET')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} secondAction={{ label: '✦', code: 'KeyX' }} />
        </div>
    )
}

export default MagicCarpetGame

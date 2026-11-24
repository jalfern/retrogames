// STOMPTOWN — the arcade shell. The rules live in ./sim.js (pure, seeded);
// ./planner.js is the attract autopilot the harness grades; ./art.js is the
// renderer. This file only loops, listens, paints juice and hooks the harness.
// Verify with `npm run stompcheck` (Node rules, no browser) and the browser
// drive inside it. A MODERN title (#3094): vector dusk city, drawn in code.

import React, { useEffect, useRef, useState } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { exposeGame, unexposeGame, contractHoldsLoop, exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import { fitFill } from '../../utils/fitCanvas'
import { W, H, GROUND, FIXED_DT, MONSTERS, MONSTER_KEYS, HP_MAX, cityName, buildingsLeft, makeGame, step, stateHash, damagePlayer, windowRect } from './sim.js'
import { plan } from './planner.js'
import { MESSAGES, PRESS } from './attract.js'
import { pal, buildSkyline, makeStars, makeClouds, drawSky, drawSkylineRow, drawGround, drawBuildings, drawRubble, drawCivilian, drawTank, drawCar, drawHeli, drawHuman, drawBlimp, drawMonster, drawBullets, drawHud } from './art.js'

const rand = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

const StomptownGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [finalInfo, setFinalInfo] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const overAtRef = useRef(0)
    const selRef = useRef(0)
    const [sel, setSel] = useState(0)

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const setSc = (s) => { screenRef.current = s; setScreen(s) }

        const lite = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('lite') === '1'
        const canvas = document.createElement('canvas')
        canvas.dataset.stomptownStage = '1'
        canvas.width = lite ? W / 2 : W
        canvas.height = lite ? H / 2 : H
        canvas.className = 'block'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)
        const ctx = canvas.getContext('2d')

        let gs = null
        let demo = makeGame({ seed: 0xbeef })
        let raf = 0, last = 0, acc = 0
        const held = { left: false, right: false, up: false, down: false, a: false, b: false }
        let parts = []
        let popups = []
        let debris = []
        let shake = 0
        let flash = 0
        let banner = ''
        let bannerT = 0
        const FAR = buildSkyline(Math.random, 80, 220)
        const MID = buildSkyline(Math.random, 60, 170)
        const STARS = makeStars(Math.random)
        const CLOUDS = makeClouds(Math.random)

        // ---------- juice spawns (shell-side only; the sim never sees them) ----------
        const burst = (x, y, n, col, sp = 1, g = 420) => {
            for (let i = 0; i < n; i++) {
                parts.push({ x, y, vx: rand(-130, 130) * sp, vy: rand(-160, 40) * sp, g, t: 0, life: rand(0.3, 0.7), r: rand(2, 5), col })
            }
        }
        const dust = (x, y, n) => {
            for (let i = 0; i < n; i++) {
                parts.push({ x: x + rand(-40, 40), y: y + rand(-10, 10), vx: rand(-50, 50), vy: rand(-90, -10), g: 160, t: 0, life: rand(0.5, 1.2), r: rand(8, 20), col: 'rgba(150,130,120,0.42)', fog: true })
            }
        }
        const fire = (x, y, s) => {
            for (let i = 0; i < 30 * s; i++) {
                parts.push({ x, y, vx: rand(-260, 260) * s, vy: rand(-260, 160) * s, g: 500, t: 0, life: rand(0.4, 1.1), r: rand(3, 9) * s, col: pick(['#ff5470', '#ffb347', '#ffd166', '#ff3b30']), fire: true })
            }
        }

        // ---------- destruction theatre: shell-side debris & dust ----------
        const windowDust = (b) => {
            if (!b) return
            const cols = b.cols, rows = b.rows
            let spawned = 0
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (Math.random() < 0.4) continue
                    const wr = windowRect(b, r, c)
                    parts.push({ x: wr.x + wr.w / 2 + rand(-wr.w * 0.4, wr.w * 0.4), y: wr.y + wr.h / 2, vx: rand(-70, 70), vy: rand(-95, -25), g: 170, t: 0, life: rand(0.45, 1.0), r: rand(6, 13), col: 'rgba(158,140,124,0.46)', fog: true, grow: 0.4 })
                    if (++spawned >= 60) return
                }
            }
        }
        const debrisChunks = (b) => {
            if (!b) return
            const n = Math.min(10, 5 + Math.floor(b.w / 30))
            for (let i = 0; i < n; i++) {
                debris.push({ x: b.x + rand(b.w * 0.15, b.w * 0.85), y: GROUND - rand(b.h * 0.55, b.h * 0.98), vx: rand(90, 270) * (Math.random() < 0.5 ? -1 : 1), vy: rand(-250, -80), g: 900, r: rand(4, 10), rot: rand(0, 6.28), vr: rand(-6, 6), bounces: 0, life: rand(1.3, 2.3), t: 0, col: pick(['#3c3244', '#54455a', '#4a3d4e', '#5c4a5e']) })
            }
        }
        const dustColumn = (x, w) => {
            for (let i = 0; i < 10; i++) {
                parts.push({ x: x + rand(-w * 0.4, w * 0.4), y: GROUND + rand(-4, 4), vx: rand(-45, 45), vy: rand(-70, -25), g: -36, t: 0, life: rand(2.3, 3.5), r: rand(22, 34), col: 'rgba(158,140,124,0.5)', fog: true, grow: 0.22 })
            }
        }
        const rubbleAt = (g, e) => {
            if (!g) return null
            let best = null, bd = 80
            for (const rb of g.rubbles) {
                const d = Math.abs(rb.x + rb.w / 2 - e.x)
                if (d < bd) { bd = d; best = rb }
            }
            return best
        }
        const nearestCrumbling = (g, e) => {
            if (!g) return null
            let best = null, bd = 80
            for (const b of g.buildings) {
                if (!b.crumbling) continue
                const d = Math.abs(b.x + b.w / 2 - e.x)
                if (d < bd) { bd = d; best = b }
            }
            return best
        }

        // ---------- sound: every cue synthesized via AudioController ----------
        const tone = (f, d, ty, v) => audioController.playTone(f, d, ty, v)
        const sweep = (f0, f1, d, ty, v) => audioController.playSweep(f0, f1, d, ty, v)
        const nzs = (d, v, freq) => audioController.playFilteredNoise(d, v, freq)
        const sfx = {
            punch() { tone(120, 0.12, 'triangle', 0.16); nzs(0.08, 0.1, 500) },
            crumble() { nzs(0.55, 0.22, 420); sweep(70, 30, 0.4, 'sawtooth', 0.12) },
            eat() { sweep(320, 520, 0.09, 'sine', 0.12); sweep(180, 90, 0.14, 'sine', 0.12) },
            hit() { sweep(220, 70, 0.2, 'sawtooth', 0.1) },
            jump() { sweep(180, 340, 0.12, 'sine', 0.07) },
            boom() { nzs(0.6, 0.3, 300); sweep(55, 25, 0.5, 'sawtooth', 0.2) },
            shoot() { tone(880, 0.06, 'square', 0.04) },
            select() { sweep(660, 880, 0.08, 'square', 0.07) },
            shatter() { nzs(0.14, 0.16, 3200); tone(1500, 0.05, 'triangle', 0.06) },
            pickup() { sweep(880, 1320, 0.07, 'square', 0.07) },
            bomb() { nzs(0.4, 0.28, 220); sweep(60, 24, 0.35, 'sawtooth', 0.2) },
            stun() { sweep(1200, 300, 0.28, 'sine', 0.08) },
            blimp() { sweep(75, 70, 0.5, 'sawtooth', 0.1); nzs(0.35, 0.06, 260) },
            revert() { sweep(520, 90, 0.3, 'sine', 0.12); nzs(0.3, 0.14, 500) },
        }

        const handleEvents = (g, audible) => {
            while (g.events.length) {
                const e = g.events.shift()
                switch (e.t) {
                    case 'points': if (e.pts >= 100) popups.push({ x: e.x, y: e.y, msg: `+${e.pts}`, ttl: 55 }); break
                    case 'popup': popups.push({ x: e.x, y: e.y, msg: e.msg, ttl: 66 }); break
                    case 'punch': if (audible) sfx.punch(); shake = Math.max(shake, 7); dust(e.x, e.y + H * 0, 0); break
                    case 'punchswipe': for (let i = 0; i < 5; i++) parts.push({ x: e.x, y: e.y, vx: rand(40, 150) * (gs ? gs.player.facing : 1), vy: rand(-60, 20), g: -60, t: 0, life: rand(0.2, 0.45), r: rand(3, 7), col: pick(['#ff9a4d', '#ffd166']), fire: true }); break
                    case 'crumble': if (audible) sfx.crumble(); shake = Math.max(shake, 22); flash = Math.max(flash, 8); { const nb = nearestCrumbling(g, e); if (nb) { windowDust(nb); debrisChunks(nb) } } break
                    case 'landed': { const rb = rubbleAt(g, e); dust(e.x, GROUND, 14); shake = Math.max(shake, 9); dustColumn(e.x, rb ? rb.w : 120) } break
                    case 'shatter': if (audible) sfx.shatter(); burst(e.x, e.y, 12, '#cfe4ff', 0.8); break
                    case 'pickup': if (audible) sfx.pickup(); break
                    case 'bomb': if (audible) sfx.bomb(); shake = Math.max(shake, 16); flash = Math.max(flash, 7); fire(e.x, GROUND - 140, 1.4); break
                    case 'stun': if (audible) sfx.stun(); flash = Math.max(flash, 4); break
                    case 'hit': if (audible) sfx.hit(); burst(gs ? gs.player.x : W / 2, gs ? gs.player.y - 70 : H / 2, 10, '#ff5470', 0.8); shake = Math.max(shake, 8); break
                    case 'kill': if (audible) sfx.hit(); burst(e.x, GROUND - 30, 8, '#d9b27a', 0.6); break
                    case 'eat': if (audible) sfx.eat(); shake = Math.max(shake, 5); for (let i = 0; i < 12; i++) parts.push({ x: e.x, y: e.y, vx: rand(-100, 100), vy: rand(-160, -40), g: 320, t: 0, life: rand(0.3, 0.7), r: rand(3, 6), col: pick(['#3a2a1a', '#5a4a2a', '#2a1a3e', '#8ad97a']) }); break
                    case 'boom': if (audible) sfx.boom(); fire(e.x, e.y, e.s); break
                    case 'jump': if (audible) sfx.jump(); break
                    case 'land': dust(e.x, e.y, 6); break
                    case 'shoot': if (audible) sfx.shoot(); break
                    case 'revert': if (audible) sfx.revert(); banner = 'HUMAN!'; bannerT = 9999; break
                    case 'blimp_in': if (audible) sfx.blimp(); banner = 'BLIMP INCOMING'; break
                    case 'back': banner = ''; popups.push({ x: e.x, y: e.y, msg: 'BACK!', ttl: 60 }); flash = Math.max(flash, 8); if (audible) sfx.jump(); break
                    case 'clear':
                        if (audible) audioController.playFanfare()
                        for (let i = 0; i < 60; i++) parts.push({ x: gs ? gs.player.x + rand(-300, 300) : W / 2, y: rand(0, GROUND - 200), vx: rand(-60, 60), vy: rand(20, 120), g: 40, t: 0, life: rand(1, 2.2), r: rand(3, 6), col: pick(['#ffd166', '#4dffb8', '#ff8ad8', '#9fd4ff']) })
                        break
                    case 'newday': banner = ''; popups.push({ x: gs ? gs.player.x : W / 2, y: GROUND - 200, msg: `DAY ${e.day} — ${e.city}`, ttl: 100 }); break
                    case 'over':
                        if (audible) audioController.playDeath()
                        overAtRef.current = performance.now()
                        setFinalInfo({ score: g.score, day: g.day, won: false })
                        setSc('over')
                        break
                    case 'win':
                        if (audible) audioController.playFanfare()
                        overAtRef.current = performance.now()
                        setFinalInfo({ score: g.score, day: g.day, won: true })
                        setSc('over')
                        break
                    default: break
                }
            }
        }

        const startPlay = () => {
            const pin = seedFromQuery()
            gs = makeGame(pin != null ? { seed: pin >>> 0 || 1, monster: MONSTER_KEYS[selRef.current] } : { seed: (Date.now() & 0xffff) | 1, monster: MONSTER_KEYS[selRef.current] })
            parts = []; popups = []; debris = []; shake = 0; flash = 0; banner = ''; bannerT = 0
            held.left = held.right = held.up = held.down = held.a = held.b = false
            setFinalInfo(null)
            setSc('play')
            audioController.startMusic('stomptown')
        }

        // ------------------------------------------------------------ paint ----
        const paint = () => {
            const bs = (lite ? W / 2 : W) / W
            ctx.setTransform(bs, 0, 0, bs, 0, 0)
            ctx.fillStyle = '#060309'
            ctx.fillRect(0, 0, W, H)
            const g = screenRef.current === 'attract' ? demo : gs
            if (!g) return
            const t = g.tick / 60
            const sx = shake > 0 ? rand(-shake, shake) : 0
            const sy = shake > 0 ? rand(-shake, shake) * 0.6 : 0
            ctx.save()
            ctx.translate(sx, sy)
            drawSky(ctx, g.cityIndex, t, STARS, CLOUDS)
            drawSkylineRow(ctx, FAR, 0.16, pal(g.cityIndex).far, 'rgba(255,190,120,0.16)', g.camX, t)
            drawSkylineRow(ctx, MID, 0.4, pal(g.cityIndex).mid, 'rgba(255,210,140,0.22)', g.camX, t)
            drawGround(ctx, g.cityIndex)
            drawRubble(ctx, g)
            drawBuildings(ctx, g, (a, b) => rand(a, b))
            for (const c of g.cars) drawCar(ctx, c, g.camX, t)
            for (const tr of g.tanks) drawTank(ctx, tr, g.camX, t)
            for (const c of g.civilians) drawCivilian(ctx, c, g.camX, t)
            const p = g.player
            if (p.reverting) {
                if (p.revertPhase === 'walk' || p.revertPhase === 'blimp_in') drawHuman(ctx, p.humanX - g.camX, p.humanY, p.humanDir, t)
                if (p.blimp) drawBlimp(ctx, p.blimp, g.camX, t, p.revertPhase === 'descend' || p.revertPhase === 'carry' ? { dir: p.humanDir } : null)
            } else {
                drawMonster(ctx, g, t)
            }
            if (g.blimpOut) drawBlimp(ctx, g.blimpOut, g.camX, t, null)
            for (const h of g.helicopters) drawHeli(ctx, h, g.camX, t)
            drawBullets(ctx, g)
            // particles
            parts = parts.filter((p) => p.t < p.life)
            for (const p of parts) {
                p.t += 1 / 60; p.x += p.vx / 60; p.y += p.vy / 60; p.vy += p.g / 60
                if (p.fog) p.r += (p.grow ?? 0.5)
                const a = 1 - p.t / p.life
                ctx.globalAlpha = p.fog ? a * 0.65 : a
                ctx.fillStyle = p.col
                ctx.beginPath(); ctx.arc(p.x - g.camX, p.y, p.r, 0, 6.28); ctx.fill()
            }
            ctx.globalAlpha = 1
            // debris (shell-side chunks bouncing off the ground)
            debris = debris.filter((p) => p.t < p.life)
            for (const p of debris) {
                p.t += 1 / 60
                p.vy += p.g / 60
                p.x += p.vx / 60
                p.y += p.vy / 60
                p.rot += p.vr / 60
                if (p.y > GROUND + 3 && p.vy > 0) {
                    p.y = GROUND + 3
                    p.vy *= -0.36; p.vx *= 0.58; p.vr *= 0.66
                    p.bounces++
                    if (p.bounces >= 2) p.life = Math.min(p.life, p.t + 0.45)
                }
                const a = Math.max(0, 1 - p.t / p.life)
                ctx.globalAlpha = a * 0.42
                ctx.fillStyle = '#000'
                ctx.beginPath(); ctx.ellipse(p.x - g.camX, GROUND + 4, p.r * 1.25, p.r * 0.38, 0, 0, 6.28); ctx.fill()
                ctx.save()
                ctx.globalAlpha = a * 0.9
                ctx.translate(p.x - g.camX, p.y)
                ctx.rotate(p.rot)
                ctx.fillStyle = p.col
                ctx.fillRect(-p.r, -p.r * 0.7, p.r * 2, p.r * 1.4)
                ctx.restore()
            }
            ctx.globalAlpha = 1
            // score popups
            popups = popups.filter((p) => p.ttl > 0)
            ctx.textAlign = 'center'
            ctx.font = '700 15px ui-monospace, monospace'
            for (const p of popups) {
                p.y -= 0.8; p.ttl--
                ctx.globalAlpha = Math.min(1, p.ttl / 20)
                ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 8
                ctx.fillText(p.msg, p.x - g.camX, p.y)
                ctx.shadowBlur = 0
            }
            ctx.globalAlpha = 1
            if (flash > 0) { ctx.fillStyle = `rgba(255,230,190,${flash / 30})`; ctx.fillRect(0, 0, W, H); flash-- }
            ctx.restore()

            // banners (never over the HUD band)
            if (banner) {
                ctx.textAlign = 'center'
                ctx.font = '900 26px ui-monospace, monospace'
                ctx.fillStyle = '#ffd166'
                ctx.shadowColor = 'rgba(255,209,102,.6)'; ctx.shadowBlur = 14
                ctx.fillText(banner, W / 2, H * 0.22)
                ctx.shadowBlur = 0
            }
            // city-clear card
            if (g.state === 'clear' && screenRef.current === 'play') {
                ctx.textAlign = 'center'
                ctx.fillStyle = 'rgba(6,4,12,0.55)'
                ctx.fillRect(W / 2 - 240, H * 0.34, 480, 150)
                ctx.fillStyle = '#4dffb8'; ctx.font = '900 34px ui-monospace, monospace'
                ctx.fillText('CITY CLEARED', W / 2, H * 0.34 + 52)
                ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '700 12px ui-monospace, monospace'
                ctx.fillText(`DAY ${g.day} — ${cityName(g.cityIndex)} RAZED`, W / 2, H * 0.34 + 84)
                ctx.fillStyle = '#ffd166'; ctx.font = '900 22px ui-monospace, monospace'
                ctx.fillText(String(g.score).toLocaleString(), W / 2, H * 0.34 + 114)
                ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '700 10px ui-monospace, monospace'
                ctx.fillText('NEXT CITY LOADING…', W / 2, H * 0.34 + 138)
            }
            if (screenRef.current !== 'attract') drawHud(ctx, g)
            // vignette + scanlines (MODERN dusk over CRT memory)
            const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85)
            vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(5,3,10,0.55)')
            ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H)
            ctx.fillStyle = 'rgba(0,0,0,0.08)'
            for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1.4)
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
                let guard = 0
                while (acc >= FIXED_DT && guard++ < 6) {
                    acc -= FIXED_DT
                    if (screenRef.current === 'attract') {
                        step(demo, plan(demo))
                        handleEvents(demo, false)
                        if (demo.end || (demo.state === 'clear' && demo.clearT <= 0)) demo = makeGame({ seed: (demo.seed * 7 + 13) >>> 0 || 1, monster: MONSTER_KEYS[selRef.current] })
                    } else if (screenRef.current === 'play' && gs) {
                        if (!gs.end) { step(gs, held); handleEvents(gs, true) }
                        else handleEvents(gs, true)   // end set between frames (harness hooks): let the over story through
                    }
                    if (bannerT > 0 && bannerT !== 9999) bannerT--
                    if (shake > 0) shake = Math.max(0, shake - 0.77)
                }
            }
            paint()
        }

        // ------------------------------------------------------------ input ----
        const BLOCK = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']
        const onDown = (e) => {
            const code = (e.shiftKey && e.code === 'Slash') ? 'Question' : e.code
            if (code === 'Question' || code === 'Backquote' || (code === 'Escape' && screenRef.current === 'play')) {
                if (screenRef.current === 'play') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }
                return
            }
            if (BLOCK.includes(code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') {
                if (code === 'ArrowLeft' || code === 'KeyA') { selRef.current = (selRef.current + MONSTER_KEYS.length - 1) % MONSTER_KEYS.length; setSel(selRef.current); sfx.select(); return }
                if (code === 'ArrowRight' || code === 'KeyD') { selRef.current = (selRef.current + 1) % MONSTER_KEYS.length; setSel(selRef.current); sfx.select(); return }
                startPlay()
                return
            }
            if (sc === 'over') {
                if (performance.now() - overAtRef.current < 800) return
                startPlay()
                return
            }
            if (pausedRef.current) return
            if (code === 'ArrowLeft' || code === 'KeyA') held.left = true
            else if (code === 'ArrowRight' || code === 'KeyD') held.right = true
            else if (code === 'ArrowUp' || code === 'KeyW') held.up = true
            else if (code === 'ArrowDown' || code === 'KeyS') held.down = true
            else if (code === 'Space' || code === 'KeyJ') held.a = true
            else if (code === 'KeyB' || code === 'KeyK' || code === 'KeyE') held.b = true
        }
        const onUp = (e) => {
            const code = e.code
            if (code === 'ArrowLeft' || code === 'KeyA') held.left = false
            else if (code === 'ArrowRight' || code === 'KeyD') held.right = false
            else if (code === 'ArrowUp' || code === 'KeyW') held.up = false
            else if (code === 'ArrowDown' || code === 'KeyS') held.down = false
            else if (code === 'Space' || code === 'KeyJ') held.a = false
            else if (code === 'KeyB' || code === 'KeyK' || code === 'KeyE') held.b = false
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
            const s = fitFill(W, H, r.width - 8, r.height - 60)
            canvas.style.width = `${W * s}px`
            canvas.style.height = `${H * s}px`
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        // #1200: production-safe feedback state — seed reported AND consumed
        exposeFeedbackState(() => ({ tick: gs ? gs.tick : 0, score: gs ? gs.score : 0, done: gs ? !!gs.end : false, seed: gs ? gs.seed : 0, x: gs ? Math.round(gs.player.x) : 0 }))

        if (import.meta.env.DEV) {
            window.__errors = []
            const live = () => (screenRef.current === 'attract' ? demo : gs)
            window.__stomptownTest = {
                ready: true,
                state: () => {
                    const g = live()
                    return {
                        tick: g.tick, score: g.score, done: !!g.end, won: !!g.won, st: screenRef.current,
                        day: g.day, city: g.cityIndex, hp: g.player.hp, lives: g.lives, combo: g.combo,
                        left: buildingsLeft(g), x: Math.round(g.player.x), y: Math.round(g.player.y),
                        climb: !!g.player.climb, reverting: g.player.reverting, phase: g.player.revertPhase,
                        stunned: g.player.stunT, err: window.__errors.slice(0, 3),
                    }
                },
                probe: () => ({ screen: screenRef.current, day: live().day, score: live().score, hp: live().player.hp, x: Math.round(live().player.x), y: Math.round(live().player.y), left: buildingsLeft(live()), lives: live().lives, st: live().state, end: live().end || '', tick: live().tick }),
                start: () => startPlay(),
                hash: () => (gs ? stateHash(gs) : 0),
                gameTime: () => (gs ? gs.tick / 60 : 0),
                simSleep: (secs) => new Promise((res) => {
                    const target = gs ? gs.tick + Math.round(secs * 60) : 0
                    const iv = setInterval(() => {
                        if (!gs || gs.tick >= target || screenRef.current !== 'play') { clearInterval(iv); res() }
                    }, 16)
                }),
                damage: (n) => { if (gs && screenRef.current === 'play') { gs.player.invuln = 0; damagePlayer(gs, n) } },
                raze: () => { if (gs && screenRef.current === 'play') { for (const b of gs.buildings) if (b.alive && Math.abs(b.x + b.w / 2 - gs.player.x) < 500) { b.hp = 1 } } },
                calm: () => { if (gs) { gs.tanks = []; gs.helicopters = []; gs.cars = []; gs.bullets = [] } },
                winNow: () => { if (gs && screenRef.current === 'play') { for (const b of gs.buildings) { b.alive = false; b.crumbling = 0 } } },
                setMonster: (k) => { const i = MONSTER_KEYS.indexOf(k); if (i >= 0) { selRef.current = i; setSel(i) } },
                monster: () => (gs || demo).monster,
            }
            mountDbg({
                title: 'STOMPTOWN',
                getState: () => gs ? [
                    `day=${gs.day} city=${gs.cityIndex} score=${gs.score} combo=${gs.combo.toFixed(1)} lives=${gs.lives} tick=${gs.tick} end=${gs.end || '-'}`,
                    `@${Math.round(gs.player.x)},${Math.round(gs.player.y)} hp=${gs.player.hp} climb=${gs.player.climb ? gs.player.climbSide : '-'} reverting=${gs.player.revertPhase || '-'}`,
                    `buildings left=${buildingsLeft(gs)} tanks=${gs.tanks.length} helis=${gs.helicopters.length} cars=${gs.cars.length} civilians=${gs.civilians.filter((c) => !c.corpse).length}`,
                ] : ['no game'],
                actions: [
                    { label: 'START', run: () => { startPlay(); return 'giant loose' } },
                    { label: 'WEAKEN NEAR TOWERS', run: () => { if (!gs || gs.end) return 'no live run'; let n = 0; for (const b of gs.buildings) if (b.alive && Math.abs(b.x + b.w / 2 - gs.player.x) < 500) { b.hp = 1; n++ } return `${n} tower(s) one hit from flat` } },
                    { label: 'CLEAR MILITARY', run: () => { if (!gs) return 'no game'; gs.tanks = []; gs.helicopters = []; gs.cars = []; gs.bullets = []; return 'guns stilled' } },
                    { label: 'FLATTEN CITY', run: () => { if (!gs || gs.end) return 'no live run'; for (const b of gs.buildings) { b.alive = false; b.crumbling = 0 } return 'city gone' } },
                ],
            })
            exposeGame({
                id: 'stomptown',
                buttons: ['left', 'right', 'up', 'down', 'a', 'b'],
                reset: (seed) => {
                    gs = makeGame({ seed: seed >>> 0 || 1, monster: MONSTER_KEYS[selRef.current] })
                    parts = []; popups = []; debris = []; shake = 0; flash = 0; banner = ''
                    held.left = held.right = held.up = held.down = held.a = held.b = false
                    setSc('play')
                },
                tick: (pad) => {
                    if (!gs) return
                    if (gs.end) { gs.tick++; return }
                    step(gs, pad || {})
                    handleEvents(gs, false)
                    if (gs.end) { setFinalInfo({ score: gs.score, day: gs.day, won: gs.won }); setSc('over') }
                },
                state: () => ({
                    tick: gs ? gs.tick : 0, score: gs ? gs.score : 0, done: gs ? !!gs.end : false,
                    won: gs ? gs.won : false, seed: gs ? gs.seed : 0, day: gs ? gs.day : 0, city: gs ? gs.cityIndex : 0,
                    hp: gs ? gs.player.hp : 0, lives: gs ? gs.lives : 0, combo: gs ? gs.combo : 1,
                    left: gs ? buildingsLeft(gs) : 0, x: gs ? Math.round(gs.player.x) : 0, y: gs ? Math.round(gs.player.y) : 0,
                    hash: gs ? stateHash(gs) : 0,
                }),
                canvas: () => canvas,
                // snapshot/restore omitted on purpose (#391): gs.rng is a closure JSON cannot copy.
            })
        }

        return () => {
            unexposeFeedbackState()
            if (import.meta.env.DEV) { if (window.__stomptownTest) delete window.__stomptownTest; unmountDbg(); unexposeGame(); if (window.__errors) delete window.__errors }
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
                <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                    <h1 className="font-mono font-black leading-none mb-1" style={{ fontSize: 'clamp(44px, 9vw, 84px)', letterSpacing: '.02em', background: 'linear-gradient(180deg,#fff 10%,#ffb347 45%,#ff5470 70%,#c74bff)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 6px 24px rgba(255,84,112,.35))' }}>STOMPTOWN</h1>
                    <div className="font-mono mb-6" style={{ fontSize: 10, letterSpacing: '.5em', color: 'rgba(255,255,255,.55)' }}>SMASH THE CITY · 12 DAYS</div>
                    <AttractMessage className="mb-6 text-yellow-100/80" messages={MESSAGES} />
                    <div className="flex gap-3 mb-6">
                        {MONSTER_KEYS.map((k, i) => (
                            <div key={k} className="font-mono px-3 py-2 rounded-lg border" style={{ borderColor: i === sel ? MONSTERS[k].ac : 'rgba(255,255,255,.14)', color: i === sel ? MONSTERS[k].ac : 'rgba(255,255,255,.55)', boxShadow: i === sel ? `0 0 18px ${MONSTERS[k].ac}44` : 'none' }}>
                                <span className="font-bold text-sm">{MONSTERS[k].name}</span>
                                <span className="block text-[8px] tracking-widest opacity-70">{MONSTERS[k].sub}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-lg font-mono font-bold animate-pulse text-yellow-300">{PRESS}</p>
                    <span className="block mt-2 text-[10px] text-white/50 tracking-widest">◀ ▶ CHOOSE YOUR MONSTER</span>
                </div>
            )}

            {screen === 'over' && finalInfo && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-center font-mono px-6">
                    <h2 className="text-4xl font-black mb-3" style={{ color: finalInfo.won ? '#4dffb8' : '#ff5470', textShadow: '3px 3px 0 #000' }}>{finalInfo.won ? 'THE WHOLE TOUR IS YOURS' : 'THE STOMP ENDS'}</h2>
                    <p className="text-sm text-white/60 tracking-[.4em] mb-2">{finalInfo.won ? `${finalInfo.day} CITIES RAZED` : `IT TOOK ${finalInfo.day} DAY${finalInfo.day === 1 ? '' : 'S'} TO STOP YOU`}</p>
                    <div className="text-5xl font-black text-yellow-300 mb-6">{String(finalInfo.score).toLocaleString()}</div>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY TO STOMP AGAIN</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'STOMPTOWN')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused} secondAction={{ label: 'EAT', code: 'KeyB' }} />
        </div>
    )
}

export default StomptownGame

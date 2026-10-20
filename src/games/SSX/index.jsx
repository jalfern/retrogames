// SSX — the cabinet. The mountain lives in ./course.js, the rules in ./sim.js
// (pure, 60 Hz, zero Math.random), the field and the attract witness in
// ./planner.js; this file only paints, listens and makes noise: chase-cam
// three.js with vertex-coloured snow, spray off every carve, FOV kick and
// shake so speed reads on the body, animated rigs, and a synth pulse that
// ducks in the air and drops back when you land.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import PauseOverlay from '../../components/PauseOverlay'
import VirtualControls from '../../components/VirtualControls'
import AttractMessage from '../../components/AttractMessage'
import { PRESS, MESSAGES } from './attract.js'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { makeGame, step, CFG, fmtTime, RIDER_COLORS, cloneGame, stateHash, CARVE_FADE } from './sim.js'
import { decide } from './planner.js'
import { slopePos, terrainY, DS } from './course.js'
import { buildTerrain, buildRails, buildScenery, makeRider, poseRider, sprayField, makeSprite, THEMES } from './art.js'

const TOUCH = typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)')?.matches === true || 'ontouchstart' in window)

const BASS = [0, 0, 7, 0, 5, 0, 3, 7]

const SSXGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [result, setResult] = useState(null)
    const screenRef = useRef('attract')
    const pausedRef = useRef(false)
    const hudRef = useRef({})
    const setHud = (k) => (el) => { hudRef.current[k] = el }
    const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])

    useEffect(() => {
        const wrap = stageRef.current
        if (!wrap) return undefined
        const LITE = new URLSearchParams(location.search).has('lite')
        const canvas = document.createElement('canvas')
        canvas.dataset.ssxStage = '1'
        canvas.className = 'block w-full h-full'
        canvas.style.touchAction = 'none'
        wrap.appendChild(canvas)

        const renderer = new THREE.WebGLRenderer({
            canvas, antialias: !LITE, alpha: false, powerPreference: 'high-performance',
            preserveDrawingBuffer: !!import.meta.env.DEV,
        })
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.setPixelRatio(LITE ? 1 : Math.min(window.devicePixelRatio || 1, 2))

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 900)
        scene.add(camera)
        const sun = new THREE.DirectionalLight(0xffffff, 1.6)
        sun.position.set(-80, 160, 60)
        scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x888888, 0.8))

        let world = null
        let riders = []
        let spray = sprayField(LITE)
        scene.add(spray.pts)
        const sprayVel = new Float32Array(spray.n * 3)
        const sprayLife = new Float32Array(spray.n)

        // carved tracks: two dark grooves laid along the player's last ~5 s line
        const GROOVE_MAX = 420
        const mkGroove = () => {
            const geo = new THREE.BufferGeometry()
            const pos = new Float32Array(GROOVE_MAX * 6 * 3)
            const col = new Float32Array(GROOVE_MAX * 6 * 4)
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
            geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage))
            geo.setDrawRange(0, 0)
            const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
                vertexColors: true, transparent: true, depthWrite: false,
                polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
            }))
            mesh.frustumCulled = false
            scene.add(mesh)
            return { mesh, geo, pos, col }
        }
        const grooves = [mkGroove(), mkGroove()]

        // speed streaks: additive points streaming past the camera over ~90 km/h
        const STREAKS = LITE ? 0 : 56
        let streaks = null
        const spawnStreak = (d, far) => {
            const z = -(6 + Math.random() * 36)
            const halfH = -z * Math.tan((66 * Math.PI) / 360)
            const halfW = halfH * (camera.aspect || 1.6)
            const band = Math.random()
            if (band < 0.42) { d.px = (0.55 + 0.45 * Math.random()) * halfW * (Math.random() < 0.5 ? -1 : 1); d.py = (Math.random() - 0.5) * halfH * 0.7 }
            else if (band < 0.62) { d.py = (0.6 + 0.4 * Math.random()) * halfH * (Math.random() < 0.5 ? -1 : 1); d.px = (Math.random() - 0.5) * halfW * 0.7 }
            else { d.px = (0.4 + 0.6 * Math.random()) * halfW * (Math.random() < 0.5 ? -1 : 1); d.py = (Math.random() - 0.5) * halfH }
            d.z = far ? z : -(34 + Math.random() * 12)
        }
        if (STREAKS) {
            const geo = new THREE.BufferGeometry()
            const pos = new Float32Array(STREAKS * 3)
            const data = []
            for (let i = 0; i < STREAKS; i++) {
                const d = { px: 0, py: 0, z: -40, sp: 8 + Math.random() * 14 }
                spawnStreak(d, true)
                data.push(d)
                pos[i * 3] = d.px; pos[i * 3 + 1] = d.py; pos[i * 3 + 2] = d.z
            }
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
            const pts = new THREE.Points(geo, new THREE.PointsMaterial({
                size: 0.5, map: makeSprite('190,235,255'), transparent: true, depthWrite: false,
                blending: THREE.AdditiveBlending, opacity: 0,
            }))
            pts.frustumCulled = false
            camera.add(pts)
            streaks = { pts, geo, pos, data }
        }

        let g = makeGame('race')
        let raf = 0, last = 0, acc = 0
        let shake = 0, camPos = new THREE.Vector3()
        let musicAcc = 0, musicStep = 0
        let pop = '', popT = 0
        const keys = new Set()
        const disposables = []
        const keep = (o) => { disposables.push(o); return o }

        const setCourseVisuals = () => {
            if (world) {
                scene.remove(world)
                world.traverse((o) => { if (o.geometry) o.geometry.dispose() })
            }
            const T = THEMES[g.course.theme]
            scene.background = new THREE.Color(T.sky)
            scene.fog = new THREE.FogExp2(T.fog, T.fogD)
            sun.color.setHex(T.sun)
            scene.children.find((c) => c.isHemisphereLight).color.setHex(T.hemiSky)
            world = new THREE.Group()
            world.add(keep(buildTerrain(g.course)))
            world.add(keep(buildRails(g.course)))
            world.add(keep(buildScenery(g.course)))
            scene.add(world)
            for (const m of riders) scene.remove(m)
            riders = g.riders.map((r) => {
                const rig = keep(makeRider(RIDER_COLORS[r.id]))
                scene.add(rig)
                return rig
            })
        }
        setCourseVisuals()
        let shownHeat = g.heat

        const putSpray = (x, y, z, vx, vy, vz) => {
            const i = spray.head
            spray.head = (spray.head + 1) % spray.n
            spray.pos[i * 3] = x; spray.pos[i * 3 + 1] = y; spray.pos[i * 3 + 2] = z
            sprayVel[i * 3] = vx; sprayVel[i * 3 + 1] = vy; sprayVel[i * 3 + 2] = vz
            sprayLife[i] = 1
        }

        const sfx = (evs) => {
            for (const e of evs) {
                const mine = e.who === 0 || e.who === undefined
                if (e.type === 'count') audioController.playTone(660, 0.1, 'square', 0.1)
                if (e.type === 'go') audioController.playSweep(440, 880, 0.4, 'square', 0.12)
                if (e.type === 'jump' && mine) audioController.playSweep(300, 700, 0.18, 'triangle', 0.05)
                if (e.type === 'land' && mine) {
                    audioController.playNoise(0.08, 0.08)
                    const f = 520 + Math.min(900, e.pts * 0.4)
                    audioController.playTone(f, 0.09, 'square', 0.08)
                    if (e.mult > 1) audioController.playTone(f * 1.25, 0.09, 'square', 0.06)
                    if (e.bigAir) shake = Math.max(shake, 0.35)
                    if (e.over) audioController.playSweep(600, 1400, 0.3, 'sawtooth', 0.09)
                }
                if (e.type === 'crash' && mine) { audioController.playNoise(0.3, 0.14); shake = 0.7 }
                if (e.type === 'up' && mine) audioController.playTone(330, 0.08, 'square', 0.05)
                if (e.type === 'boost' && mine) audioController.playSweep(240, 960, 0.35, 'sawtooth', 0.08)
                if (e.type === 'grind' && mine) audioController.playTone(1100, 0.08, 'square', 0.05)
                if (e.type === 'grindstart' && mine) audioController.playSweep(900, 1500, 0.15, 'square', 0.05)
                if (e.type === 'finish' && mine) { e.place === 1 ? audioController.playFanfare() : audioController.playTone(300, 0.2, 'square', 0.08) }
                if (e.type === 'win') audioController.playFanfare()
                if (e.type === 'lose' || e.type === 'time') audioController.playDeath()
                if (e.type === 'land' && mine && e.pts > 800) { pop = `${e.name} +${e.pts}`; popT = 140 }
                else if (e.type === 'land' && mine && e.pts > 0) { pop = `${e.name} +${e.pts}`; popT = 110 }
                if (e.type === 'crash' && mine) { pop = 'BAIL!'; popT = 90 }
                if (e.type === 'heat') audioController.playTone(520, 0.12, 'square', 0.08)
            }
        }

        const doSim = () => {
            const p = g.riders[0]
            let inp
            if (screenRef.current === 'attract') inp = decide(g, p)
            else inp = {
                steer: (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0),
                jump: keys.has('Space'),
                boost: keys.has('ShiftLeft') || keys.has('ShiftRight'),
                grab: keys.has('KeyX'),
                flip: keys.has('KeyZ') ? 1 : keys.has('KeyC') ? 2 : 0,
                tuck: keys.has('ArrowUp'),
                scrub: keys.has('ArrowDown'),
            }
            step(g, inp)
            sfx(g.events.splice(0))
            if (g.heat !== shownHeat) { shownHeat = g.heat; setCourseVisuals() }
            if (g.end && screenRef.current === 'play') {
                setResult({ end: g.end, why: g.why, tricks: p.tricksLanded, crashes: p.crashes, place: p.place, score: p.score })
                overAt = performance.now()
                setMode('over')
            }
            if (g.end && screenRef.current === 'attract') g = makeGame('race')
        }

        let overAt = 0

        const placeRider = (rig, r) => {
            const p = slopePos(g.course, r.s, r.x)
            rig.position.set(p.x, r.air ? r.y : terrainY(g.course, r.s, r.x), p.z)
            rig.userData.yaw.rotation.y = p.th - Math.PI / 2 + (r.spin * Math.PI) / 180
            poseRider(rig, r, g.tick)
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            last = ts
            if (!pausedRef.current) {
                acc += ft
                let guard = 0
                while (acc >= 1000 / 60 && guard < 12) { doSim(); acc -= 1000 / 60; guard++ }
                if (guard >= 12) acc = 0
            }
            const p = g.riders[0]
            const pp = slopePos(g.course, p.s, p.x)
            const fwdX = Math.sin(pp.th), fwdZ = Math.cos(pp.th)
            const back = 9.5, up = 4.1 + p.v * 0.028
            const goal = new THREE.Vector3(pp.x - fwdX * back, (p.air ? p.y : pp.y) + up, pp.z - fwdZ * back)
            if (shake > 0) {
                goal.x += Math.sin(g.tick * 3.7) * shake
                goal.y += Math.cos(g.tick * 4.9) * shake
                shake = Math.max(0, shake - 0.03)
            }
            camPos.lerp(goal, 0.18)
            camera.position.copy(camPos)
            camera.lookAt(pp.x + fwdX * 16, (p.air ? p.y : pp.y) + 1.2, pp.z + fwdZ * 16)
            const fov = 66 + Math.min(16, Math.max(0, (p.v - 12) * 0.55)) + (p.boost ? 8 : 0)
            if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix() }

            for (const m of riders) m.visible = true
            g.riders.forEach((r, i) => placeRider(riders[i], r))

            // snow spray: carving, landings, boost — powder density scales with speed
            const steer = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)
            if (!pausedRef.current) {
                if (!p.air && p.v > 8 && (Math.abs(steer) > 0.2 || screenRef.current === 'attract')) {
                    const n = 1 + Math.min(4, Math.floor((p.v - 8) / 5))
                    for (let k = 0; k < n; k++) {
                        const fan = (Math.random() - 0.5) * (0.4 + p.v * 0.06)
                        putSpray(
                            pp.x - fwdX * 0.8 + Math.cos(pp.th) * fan, pp.y + 0.15, pp.z - fwdZ * 0.8 - Math.sin(pp.th) * fan,
                            -fwdX * (1.5 + Math.random() * 2) - Math.cos(pp.th) * steer * 2,
                            1.5 + Math.random() * 1.5 + p.v * 0.05,
                            -fwdZ * (1.5 + Math.random() * 2) + Math.sin(pp.th) * steer * 2,
                        )
                    }
                }
                if (p.boost) {
                    for (let k = 0; k < 3; k++) {
                        const fan = (Math.random() - 0.5) * 0.8
                        putSpray(pp.x - fwdX * 1.2 + Math.cos(pp.th) * fan, pp.y + 0.2, pp.z - fwdZ * 1.2 - Math.sin(pp.th) * fan, -fwdX * (4 + Math.random() * 2.5), 0.6, -fwdZ * (4 + Math.random() * 2.5))
                    }
                }
                const dt = ft / 1000
                for (let i = 0; i < spray.n; i++) {
                    if (sprayLife[i] <= 0) continue
                    sprayLife[i] -= dt * 1.6
                    spray.pos[i * 3] += sprayVel[i * 3] * dt
                    spray.pos[i * 3 + 1] += sprayVel[i * 3 + 1] * dt
                    spray.pos[i * 3 + 2] += sprayVel[i * 3 + 2] * dt
                    sprayVel[i * 3 + 1] -= 6 * dt
                    if (sprayLife[i] <= 0) spray.pos[i * 3 + 1] = -9999
                }
                spray.geo.attributes.position.needsUpdate = true
            }

            // carved grooves under the board, fading with age
            {
                const cv = p.carves
                grooves.forEach((gr, side) => {
                    const off = (side === 0 ? -1 : 1) * 0.094
                    let v = 0
                    for (let i = 0; i < cv.length - 1; i++) {
                        const a = cv[i], b = cv[i + 1]
                        const aa = 1 - (g.tick - a.t) / CARVE_FADE
                        const ab = 1 - (g.tick - b.t) / CARVE_FADE
                        if (aa <= 0 || ab <= 0) continue
                        const a1 = slopePos(g.course, a.s, a.x + off - 0.02), a2 = slopePos(g.course, a.s, a.x + off + 0.02)
                        const b1 = slopePos(g.course, b.s, b.x + off - 0.02), b2 = slopePos(g.course, b.s, b.x + off + 0.02)
                        const al = aa * aa * 0.5, be = ab * ab * 0.5
                        const quad = [a1, a2, b2, a1, b2, b1], alph = [al, al, be, al, be, be]
                        for (let k = 0; k < 6; k++) {
                            const q = quad[k], o = (v + k) * 3, co = (v + k) * 4
                            gr.pos[o] = q.x; gr.pos[o + 1] = q.y + 0.02; gr.pos[o + 2] = q.z
                            gr.col[co] = 0.06; gr.col[co + 1] = 0.09; gr.col[co + 2] = 0.16; gr.col[co + 3] = alph[k]
                        }
                        v += 6
                        if (v >= GROOVE_MAX * 6) break
                    }
                    gr.geo.setDrawRange(0, v)
                    gr.geo.attributes.position.needsUpdate = true
                    gr.geo.attributes.color.needsUpdate = true
                })
            }

            // speed streaks past the screen edges
            if (streaks) {
                const kmh = p.v * 3.6
                const k = Math.max(0, (kmh - 90) / 35) + (p.boost ? 0.55 : 0)
                const target = p.air || screenRef.current !== 'play' ? 0 : Math.min(0.8, k * 0.85)
                streaks.pts.material.opacity += (target - streaks.pts.material.opacity) * 0.22
                if (target > 0.02) {
                    const dtS = ft / 1000
                    for (let i = 0; i < STREAKS; i++) {
                        const d = streaks.data[i]
                        d.z += (p.v * 1.6 + d.sp) * dtS
                        if (d.z > -4) { spawnStreak(d); streaks.pos[i * 3] = d.px; streaks.pos[i * 3 + 1] = d.py }
                        streaks.pos[i * 3 + 2] = d.z
                    }
                    streaks.geo.attributes.position.needsUpdate = true
                }
            }

            // synth pulse: kick + bass, ducked in the air, chorus on landing
            if (screenRef.current === 'play' && !pausedRef.current && p.v > 1) {
                musicAcc += ft
                if (musicAcc > 145) {
                    musicAcc = 0
                    musicStep++
                    audioController.playNoise(0.03, p.air ? 0.015 : 0.035)
                    if (!p.air && musicStep % 2 === 0) {
                        const n = BASS[(musicStep / 2) % BASS.length]
                        audioController.playTone(55 * Math.pow(2, n / 12), 0.12, 'square', 0.03)
                    }
                }
            }

            if (popT > 0) popT--
            syncHud()
            renderer.render(scene, camera)
        }

        let lastHud = 0
        const syncHud = () => {
            const now = performance.now()
            if (now - lastHud < 66) return
            lastHud = now
            const p = g.riders[0]
            const h = hudRef.current
            if (h.score) h.score.textContent = String(p.score)
            if (h.mult) { h.mult.textContent = `x${Math.min(CFG.comboCap, p.chain + 1)}`; h.mult.style.opacity = p.chain > 0 ? '1' : '0.35' }
            if (h.meterFill) h.meterFill.style.width = `${p.meter.toFixed(0)}%`
            if (h.meterFull) h.meterFull.style.opacity = p.meter >= 100 ? (Math.floor(now / 160) % 2 ? '1' : '0.3') : '0'
            if (h.speed) h.speed.textContent = String(Math.round(p.v * 3.6))
            if (h.rank) h.rank.textContent = g.mode === 'showoff' ? 'SHOWOFF' : `P${p.place}/6`
            if (h.heat) h.heat.textContent = g.mode === 'showoff' ? `TARGET ${CFG.showoffTarget}` : `HEAT ${g.heat + 1}/3 · ${g.course.name}`
            if (h.clock) h.clock.textContent = g.mode === 'showoff' ? String(Math.max(0, Math.ceil(g.showoffLeft))) : fmtTime(g.heatT / 60)
            if (h.pop) { h.pop.textContent = pop; h.pop.style.opacity = popT > 0 ? '1' : '0' }
            if (h.air) h.air.style.opacity = p.air && p.airT > 0.25 ? '1' : '0'
        }

        const startPlay = (mode) => {
            g = makeGame(mode)
            shownHeat = g.heat
            setCourseVisuals()
            keys.clear()
            setResult(null)
            setMode('play')
            audioController.playSweep(220, 660, 0.3, 'square', 0.07)
        }

        const onDown = (e) => {
            const code = e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') {
                audioController.init()
                startPlay(e.code === 'Digit2' ? 'showoff' : 'race')
                return
            }
            if (sc === 'over') {
                if (performance.now() - overAt < 900) return
                setMode('attract')
                return
            }
            if (pausedRef.current) return
            keys.add(e.code)
        }
        const onUp = (e) => keys.delete(e.code)
        const onBlur = () => keys.clear()
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') { startPlay('race'); return }
            if (sc === 'over' && performance.now() - overAt > 900) setMode('attract')
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        window.addEventListener('pointerdown', onPointer)

        const resize = () => {
            const r = wrap.getBoundingClientRect()
            if (!r.width || !r.height) return
            renderer.setSize(r.width, r.height, false)
            camera.aspect = r.width / r.height
            camera.updateProjectionMatrix()
        }
        window.addEventListener('resize', resize)
        resize()
        raf = requestAnimationFrame(frame)

        if (import.meta.env.DEV) {
            window.__ssxTest = {
                probe: () => {
                    const p = g.riders[0]
                    return {
                        screen: screenRef.current, end: g.end, why: g.why, mode: g.mode, heat: g.heat, tick: g.tick,
                        p: { s: p.s, x: p.x, y: p.y, v: p.v, air: p.air, spin: p.spin, flip: p.flip, tumble: p.tumble, meter: p.meter, chain: p.chain, score: p.score, tricks: p.tricksLanded, crashes: p.crashes, place: p.place, finished: p.finished, tuck: p.tuck, scrub: p.scrub, carves: p.carves.length },
                        standings: [...g.standings], hash: stateHash(g),
                    }
                },
                keys,
                start: (m) => startPlay(m === 'showoff' ? 'showoff' : 'race'),
                toAttract: () => { g = makeGame('race'); shownHeat = 0; setCourseVisuals(); setMode('attract') },
                prognose: () => {
                    if (g.end) return `already ${g.end}: ${g.why}`
                    const g2 = cloneGame(g)
                    let t = 0
                    while (!g2.end && t < 400000) { step(g2, decide(g2, g2.riders[0])); t++ }
                    return g2.end === 'win' ? `WINNABLE from here (${g2.mode}${g2.mode === 'race' ? ` heat ${g2.heat + 1}` : ''})` : `NOT winnable: ${g2.end} — ${g2.why}`
                },
            }
            mountDbg({
                title: 'SSX',
                getState: () => {
                    const p = g.riders[0]
                    return [
                        `${g.mode} heat ${g.heat + 1} ${g.course.name} phase ${g.phase} end ${g.end || '-'} tick ${g.tick}`,
                        `v ${p.v.toFixed(1)}  air ${p.air} (spin ${p.spin.toFixed(0)} flip ${p.flip.toFixed(0)})  tumble ${p.tumble}`,
                        `score ${p.score}  meter ${p.meter.toFixed(0)} chain x${p.chain + 1}  tricks ${p.tricksLanded} bails ${p.crashes}`,
                        `standings ${g.standings.join(',')}`,
                    ]
                },
                actions: [
                    { label: 'PROGNOSIS', run: () => window.__ssxTest.prognose() },
                    { label: 'FULL METER', run: () => { g.riders[0].meter = 100; return 'OVER armed — next takeoff doubles' } },
                    { label: 'BAIL ME', run: () => { g.riders[0].tumble = 60; return 'tumbling' } },
                    { label: 'TO FINISH', run: () => { g.riders[0].s = g.course.finish * DS - 60; return 'near the line' } },
                ],
            })
        }

        return () => {
            if (import.meta.env.DEV) { delete window.__ssxTest; unmountDbg() }
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('resize', resize)
            window.removeEventListener('pointerdown', onPointer)
            cancelAnimationFrame(raf)
            disposables.forEach((d) => { if (d.dispose) d.dispose() })
            spray.geo.dispose(); spray.pts.material.map?.dispose(); spray.pts.material.dispose()
            for (const gr of grooves) { gr.geo.dispose(); gr.mesh.material.dispose(); scene.remove(gr.mesh) }
            if (streaks) { streaks.geo.dispose(); streaks.pts.material.map?.dispose(); streaks.pts.material.dispose(); camera.remove(streaks.pts) }
            renderer.forceContextLoss()
            renderer.dispose()
            canvas.remove()
        }
    }, [setMode])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])
    const play = screen === 'play'

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0" />

            <div className={`absolute inset-0 pointer-events-none font-mono transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute top-2 left-3 bg-black/45 border border-cyan-300/30 rounded px-3 py-1.5 text-cyan-50">
                    <div className="text-[9px] tracking-widest opacity-70">SCORE</div>
                    <div ref={setHud('score')} className="text-2xl font-black text-yellow-200 leading-6">0</div>
                    <div ref={setHud('mult')} className="text-sm font-bold text-orange-300" style={{ opacity: 0.35 }}>x1</div>
                </div>
                <div className="absolute top-2 left-1/2 -translate-x-1/2 text-center">
                    <div ref={setHud('heat')} className="bg-black/45 border border-cyan-300/30 rounded px-3 py-1 text-[11px] tracking-widest text-cyan-100">HEAT 1/3</div>
                    <div ref={setHud('pop')} className="mt-2 text-xl font-black text-fuchsia-300 transition-opacity duration-300" style={{ opacity: 0, textShadow: '0 0 14px #f0f, 2px 2px 0 #000' }} />
                    <div ref={setHud('air')} className="mt-1 text-xs tracking-[0.35em] text-cyan-200 transition-opacity duration-150" style={{ opacity: 0 }}>A I R</div>
                </div>
                <div className="absolute top-2 right-3 text-right">
                    <div className="bg-black/45 border border-cyan-300/30 rounded px-3 py-1.5">
                        <div className="text-[9px] tracking-widest opacity-70">SPEED</div>
                        <div ref={setHud('speed')} className="text-2xl font-black leading-6">0<span className="text-[10px]"> km/h</span></div>
                    </div>
                    <div className="mt-1 bg-black/45 border border-cyan-300/30 rounded px-3 py-1 text-sm" ref={setHud('rank')}>P1/6</div>
                    <div className="mt-1 bg-black/45 border border-cyan-300/30 rounded px-3 py-1 text-sm" ref={setHud('clock')}>0:00</div>
                </div>
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-64">
                    <div className="h-3 rounded bg-black/50 border border-cyan-300/30 overflow-hidden">
                        <div ref={setHud('meterFill')} className="h-full bg-gradient-to-r from-cyan-400 to-fuchsia-400" style={{ width: '0%' }} />
                    </div>
                    <div ref={setHud('meterFull')} className="text-center text-xs font-black tracking-widest text-yellow-300 mt-1" style={{ opacity: 0 }}>OVER!!</div>
                </div>
            </div>

            {screen === 'attract' && (
                <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                    <h1 className="text-6xl font-black italic mb-6" style={{ color: '#fff', textShadow: '4px 0 0 #b0147a, -4px 0 0 #1490b0, 0 12px 30px #000' }}>SSX</h1>
                    <AttractMessage className="mb-6 text-cyan-100/80" messages={MESSAGES} />
                    <p className="text-lg font-mono font-bold animate-pulse text-yellow-300">{PRESS}</p>
                </div>
            )}

            {screen === 'over' && result && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-cyan-50 font-mono px-6">
                    <h2 className={`text-4xl font-black mb-1 ${result.end === 'win' ? 'text-yellow-300' : 'text-red-400'}`}>
                        {result.end === 'win' ? 'MOUNTAIN CHAMPION' : result.end === 'time' ? 'TIME UP' : 'THE FIELD TOOK IT'}
                    </h2>
                    <p className="text-lg mb-3">{result.why}</p>
                    <p className="text-sm text-cyan-200/80 mb-4">tricks banked: {result.tricks} · bails: {result.crashes} · best finish P{result.place}</p>
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'SSX')} onResume={handleResume} />}
            <VirtualControls visible={play && !paused && TOUCH} secondAction={{ label: 'BST', code: 'ShiftLeft' }} />
        </div>
    )
}

export default SSXGame

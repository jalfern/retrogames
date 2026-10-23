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
import { makeGame, step, loadHeat, CFG, fmtTime, RIDER_COLORS, cloneGame, stateHash, CARVE_FADE, GRAB_NAMES, flipDirFromTilt, bodyFromTilt } from './sim.js'
import { decide } from './planner.js'
import { createRoom, decodeCode, seatKinds } from '../../utils/room.js'
import { seatIds, encodeState, decodeState, applyGhost, computeStandings, pruneGhosts } from './net.js'
import { slopePos, terrainY, DS, HEATS, rotationName, expressAt } from './course.js'
import { padState } from '../../utils/padState'
import { buildTerrain, buildRails, buildScenery, buildSky, buildSparkles, buildRimJags, attachShelf, makeHeroRider, poseRider, sprayField, makeSprite, makeBoard, THEMES, RIDER_MODELS, SUN, GROOVE, SPARKLE_PULSE, slopeAt, cpuSprayCount, landingSound, carveVoice, retunePose, MUSIC_TRACKS, MUSIC_STEP, START_VISTA, animateDecor, crowdHype, speedStreakK } from './art.js'

const TOUCH = typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)')?.matches === true || 'ontouchstart' in window)
// #844: the harness forces the touch trick-pad on headless Chrome (no coarse
// pointer there): ?touchpad=1 shows the pad exactly as a phone sees it.
const TOUCH_PAD = TOUCH || (typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('touchpad'))

const SSXGame = () => {
    const stageRef = useRef(null)
    const [screen, setScreen] = useState('attract')
    const [paused, setPaused] = useState(false)
    const [result, setResult] = useState(null)
    const [netUi, setNetUi] = useState(null)   // #845 online lobby/standings overlay
    const [podium, setPodium] = useState(null) // #845 final friends' podium
    const [trickHeld, setTrickHeld] = useState(() => new Set())
    const trickApi = useRef(null)
    const stickApi = useRef(null)
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
        const camera = new THREE.PerspectiveCamera(START_VISTA.fov, 1, 0.1, 900)
        scene.add(camera)
        const sun = new THREE.DirectionalLight(0xffffff, 1.6)
        sun.position.set(-80, 160, 60)
        scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x9aa2b4, 0.95))

        let world = null
        let worldGen = 0
        let skyObj = null
        let sparkles = null
        let rimJags = null
        let riders = []
        let spray = sprayField(LITE)
        scene.add(spray.pts)
        const sprayVel = new Float32Array(spray.n * 3)
        const sprayLife = new Float32Array(spray.n)

        // #844 wipeout debris: the board flies off the rider on every crash —
        // a tumbling, spinning deck that tumbles away through the snow cloud.
        const debris = []
        const disposeMesh = (mesh) => mesh.traverse((o) => {
            if (o.geometry) o.geometry.dispose()
            if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose())
        })
        const spawnDebris = (r) => {
            if (debris.length >= 8) { const d0 = debris.shift(); scene.remove(d0.mesh); disposeMesh(d0.mesh) }
            const rp = slopePos(g.course, r.s, r.x)
            const mesh = makeBoard(RIDER_COLORS[r.id], r.id, r.id)
            mesh.position.set(rp.x, rp.y + 0.45, rp.z)
            mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
            scene.add(mesh)
            debris.push({
                mesh, life: 1.15,
                vx: (Math.random() - 0.5) * 5.5, vy: 3.5 + Math.random() * 3.2, vz: (Math.random() - 0.5) * 5.5,
                wx: 7 + Math.random() * 9, wz: 5 + Math.random() * 7,
            })
        }

        // fake contact shadow keeps the pack readable mid-air (#548): a dark
        // ellipse pinned to the snow under the leader, fading as air grows;
        // colour + base opacity are per-theme so it survives night/dusk (#615)
        const shadowGeo = new THREE.CircleGeometry(0.72, 20)
        shadowGeo.rotateX(-Math.PI / 2)
        const shadowMat = new THREE.MeshBasicMaterial({ color: 0x0b1524, transparent: true, opacity: 0.28, depthWrite: false })
        const shadow = new THREE.Mesh(shadowGeo, shadowMat)
        scene.add(shadow)
        let shadowBase = 0.28

        // carved tracks: two dark grooves laid along the player's last ~5 s line
        const GROOVE_MAX = 420
        const mkGroove = () => {
            const geo = new THREE.BufferGeometry()
            const pos = new Float32Array(GROOVE_MAX * 18 * 3)
            const col = new Float32Array(GROOVE_MAX * 18 * 4)
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

        // board top surface height (roll space) at lateral offset x — deck
        // top 0.115 plus the tip rocker lift; the one true surface the
        // grab/boot probes measure against
        const deckTop = (x) => {
            const a = Math.abs(x) / 0.89
            return 0.115 + 0.16 * Math.pow(Math.max(0, a - 0.62) / 0.38, 2)
        }

        let g = makeGame('race')
        let raf = 0, last = 0, acc = 0
        let fpsEMA = 60
        let shake = 0, camPos = new THREE.Vector3()
        let camFresh = true
        let musicTrack = null, musicStepT = 0
        let swishT = 0, windT = 0, boostT = 0
        let pop = '', popT = 0
        let gapFlash = 0, wasChute = false
        let poseOverride = null
        const keys = new Set()
        // #844: the touch trick pad synthesises the same key codes the desktop
        // reads (KeyX grab, KeyZ flip, KeyC front-flip, KeyV invert) into the
        // same held-key set, so phones get grab/flip/invert with no second path.
        const pressTrick = (code, down) => {
            if (down) keys.add(code); else keys.delete(code)
            setTrickHeld((prev) => {
                const s = new Set(prev)
                if (down) s.add(code); else s.delete(code)
                return s
            })
        }
        trickApi.current = pressTrick
        // #894 (the #873 answer — Jon picked analogue): a PHYSICAL stick on the
        // touch pad. The knob offset from the base centre is the analog input —
        // x is steer depth (the same #791 press line the canvas drag rides, so
        // shallow tilt = shallow carve, saturating at ±1), y is body tilt:
        // forward tucks and commits a FRONT flip, back scrubs / back flips.
        let tiltX = 0, tiltY = 0, tiltActive = false, tiltPtr = null
        const STICK_R = 38
        const tiltApply = (cx, cy) => {
            const el = document.querySelector('[data-ssx-stick]')
            if (!el) return
            const r = el.getBoundingClientRect()
            const dx = cx - (r.left + r.width / 2)
            const dy = cy - (r.top + r.height / 2)
            tiltX = Math.max(-1, Math.min(1, dx / STICK_R))
            tiltY = Math.max(-1, Math.min(1, dy / STICK_R))
            const knob = document.querySelector('[data-ssx-stick-knob]')
            if (knob) knob.style.transform = `translate(-50%, -50%) translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`
        }
        const tiltReset = () => {
            tiltX = 0; tiltY = 0; tiltActive = false; tiltPtr = null
            const knob = document.querySelector('[data-ssx-stick-knob]')
            if (knob) knob.style.transform = 'translate(-50%, -50%)'
        }
        stickApi.current = {
            down: (id, cx, cy) => { if (tiltPtr !== null) return; tiltPtr = id; tiltActive = true; tiltApply(cx, cy) },
            move: (id, cx, cy) => { if (id === tiltPtr) tiltApply(cx, cy) },
            up: (id) => { if (id === tiltPtr) tiltReset() },
        }
        const disposables = []
        const keep = (o) => { disposables.push(o); return o }

        const clearDebris = () => {
            for (const d of debris) { scene.remove(d.mesh); disposeMesh(d.mesh) }
            debris.length = 0
        }

        const setCourseVisuals = () => {
            clearDebris()
            if (world) {
                scene.remove(world)
                world.traverse((o) => { if (o.geometry && !o.userData.keepGeo) o.geometry.dispose() })
            }
            const gen = ++worldGen
            const T = THEMES[g.course.theme]
            scene.background = new THREE.Color(T.sky)
            scene.fog = new THREE.FogExp2(T.fog, T.fogD)
            sun.color.setHex(T.sun)
            scene.children.find((c) => c.isHemisphereLight).color.setHex(T.hemiSky)
            shadowMat.color.setHex(T.shC)
            shadowBase = T.shO
            world = new THREE.Group()
            const terrainMesh = keep(buildTerrain(g.course))
            world.add(terrainMesh)
            if (sparkles) sparkles.forEach((sp) => sp.material.dispose())
            sparkles = LITE ? null : [0, 1].map((layer) => buildSparkles(g.course, terrainMesh.geometry, layer))
            if (sparkles) sparkles.forEach((sp) => world.add(sp))
            world.add(keep(buildRails(g.course)))
            world.add(keep(buildScenery(g.course)))
            rimJags = LITE ? null : buildRimJags(g.course)
            if (rimJags) world.add(keep(rimJags))
            skyObj = buildSky(g.course)
            world.add(keep(skyObj))
            scene.add(world)
            camFresh = true
            attachShelf(g.course, world, () => gen === worldGen).catch(() => {})
            for (const m of riders) scene.remove(m)
            riders = g.riders.map((r) => {
                const rig = keep(makeHeroRider(RIDER_COLORS[r.id], RIDER_MODELS[r.id] || 'rogue', r.id))
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
                // ollie = small chirp; roller/lip auto-launch (#665) = deeper,
                // louder pop scaled with launch power — a crest is not silent
                if (e.type === 'jump' && mine) {
                    if (e.power === undefined) audioController.playSweep(300, 700, 0.18, 'triangle', 0.05)
                    else {
                        audioController.playSweep(140, 420 + Math.min(260, e.power * 24), 0.24, 'triangle', 0.07 + Math.min(0.05, e.power * 0.004))
                        audioController.playSweep(950, 300, 0.4, 'sine', 0.045)
                    }
                }
                if (e.type === 'land' && mine) {
                    const rr = g.riders[e.who ?? 0] || g.riders[0]
                    const snd = landingSound(slopeAt(g.course, rr.s, rr.x), rr.v)
                    audioController.playNoise(snd.dur, snd.vol)
                    if (snd.crust) audioController.playSweep(snd.swish[0], snd.swish[1], 0.06, 'triangle', 0.045)
                    const f = 520 + Math.min(900, e.pts * 0.4)
                    audioController.playTone(f, 0.09, 'square', 0.08)
                    if (e.mult > 1) audioController.playTone(f * 1.25, 0.09, 'square', 0.06)
                    if (e.bigAir) { shake = Math.max(shake, 0.35); audioController.playTone(58, 0.22, 'sine', 0.14); audioController.duckMusic(0.4, 0.4) }
                    else if (e.impact > 0.25) audioController.playTone(74, 0.16, 'sine', Math.min(0.12, 0.04 + e.impact * 0.1))
                    // #791: the landing throws a powder burst sized by impact —
                    // a soft roller sets off a puff, a hard drop a full cloud.
                    if (e.impact > 0.25) {
                        const rp = slopePos(g.course, rr.s, rr.x)
                        const nb = 4 + Math.round(e.impact * 10)
                        for (let k = 0; k < nb; k++) {
                            const fan = (Math.random() - 0.5) * (0.8 + e.impact * 1.4)
                            putSpray(
                                rp.x + Math.cos(rp.th) * fan, rp.y + 0.12, rp.z - Math.sin(rp.th) * fan,
                                Math.cos(rp.th) * fan * 2 + (Math.random() - 0.5) * 2,
                                1.8 + e.impact * 3.5 + Math.random() * 1.6,
                                Math.sin(rp.th) * fan * 2 + (Math.random() - 0.5) * 2,
                            )
                        }
                    }
                    if (e.over) audioController.playSweep(600, 1400, 0.3, 'sawtooth', 0.09)
                    if (e.revert) audioController.playSweep(500, 1050, 0.14, 'square', 0.055)
                }
                if (e.type === 'crash' && mine) {
                    audioController.playNoise(0.3, 0.14)
                    audioController.playFilteredNoise(0.55, 0.16, 260)
                    audioController.duckMusic(0.2, 0.7)
                    shake = 0.7
                    if (e.what === 'gap') {
                        // #911: the crevasse callout — a distinct low rumble
                        // under the generic crash noise, and a white flash so
                        // the hole reads as an event, not a stumble.
                        audioController.playSweep(72, 26, 0.6, 'sine', 0.2)
                        gapFlash = 1
                    }
                }
                // #844: a wipeout is a scene, not a pause — the whole field sees
                // it: a wide snow blast and the board torn off, tumbling away.
                if (e.type === 'crash') {
                    const rr = g.riders[e.who] || g.riders[0]
                    const rp = slopePos(g.course, rr.s, rr.x)
                    const nb = 14 + Math.round(Math.min(10, rr.v))
                    for (let k = 0; k < nb; k++) {
                        const fan = (Math.random() - 0.5) * 2.6
                        const up = 2.2 + Math.random() * 3.6
                        putSpray(
                            rp.x + Math.cos(rp.th) * fan, rp.y + 0.18, rp.z - Math.sin(rp.th) * fan,
                            Math.cos(rp.th) * fan * 2.6 + (Math.random() - 0.5) * 3,
                            up,
                            -Math.sin(rp.th) * fan * 2.6 + (Math.random() - 0.5) * 2.5,
                        )
                    }
                    spawnDebris(rr)
                }
                // #791 line-bobble: a rival clipping a line it should have dodged
                // throws a rock-dust burst and a low thunk — the field is messy now,
                // not a procession. The player never bobbles, so this reads CPU-only.
                if (e.type === 'bobble') {
                    const rr = g.riders[e.who] || g.riders[0]
                    const rp = slopePos(g.course, rr.s, rr.x)
                    const nb = 6
                    for (let k = 0; k < nb; k++) {
                        const fan = (Math.random() - 0.5) * 1.6
                        putSpray(
                            rp.x + Math.cos(rp.th) * fan, rp.y + 0.14, rp.z - Math.sin(rp.th) * fan,
                            Math.cos(rp.th) * fan * 2.4 + (Math.random() - 0.5) * 2,
                            1.6 + Math.random() * 1.8,
                            Math.sin(rp.th) * fan * 2.4 + (Math.random() - 0.5) * 2,
                        )
                    }
                    audioController.playFilteredNoise(0.22, 0.07, 220)
                }
                if (e.type === 'up' && mine) audioController.playTone(330, 0.08, 'square', 0.05)
                if (e.type === 'boost' && mine) audioController.playSweep(80, 190, 0.22, 'sawtooth', 0.09)
                if (e.type === 'grind' && mine) audioController.playTone(1100, 0.08, 'square', 0.05)
                if (e.type === 'grindstart' && mine) audioController.playSweep(900, 1500, 0.15, 'square', 0.05)
                if (e.type === 'rockbounce' && mine) audioController.playSweep(180, 520, 0.16, 'square', 0.1)
                if (e.type === 'rockbounce' && mine) { pop = `${e.name || 'ROCK BOUNCE'} +${e.pts}`; popT = 110 }
                if (e.type === 'finish' && mine) { e.place === 1 ? audioController.playFanfare() : audioController.playTone(300, 0.2, 'square', 0.08) }
                if (e.type === 'win') audioController.playFanfare()
                if (e.type === 'lose' || e.type === 'time') audioController.playDeath()
                if (e.type === 'land' && mine && e.pts > 800) { pop = `${e.name} +${e.pts}`; popT = 140 }
                else if (e.type === 'land' && mine && e.pts > 0) { pop = `${e.name} +${e.pts}`; popT = 110 }
                if (e.type === 'crash' && mine) { pop = e.what === 'gap' ? 'CREVASS!' : 'BAIL!'; popT = e.what === 'gap' ? 110 : 90 }
                if (e.type === 'heat') audioController.playTone(520, 0.12, 'square', 0.08)
            }
        }

        // ---- #845 ONLINE -----------------------------------------------------
        // ?net=host / ?net=join&room=CODE / ?relay=wss://host. One racer hosts,
        // friends join by code (up to 4), CPU riders fill the rest of the six-rider
        // field, the host starts everyone on one seed, and the others ride as live
        // ghosts. No lockstep (riders don't collide): everyone races the SAME three
        // mountains locally and exchanges per-heat finish times; the relay forwards
        // each racer's finish to all others so every box holds the same table and
        // runs the same pure reducer -> an identical friends' podium.
        const nq = new URLSearchParams(location.search)
        const netRole = nq.get('net') === 'host' ? 'host' : nq.get('net') === 'join' ? 'guest' : null
        const relayUrl = (nq.get('relay') || 'wss://retrogames.jalfern.workers.dev').replace(/^http/, 'ws')
        const SEAT_NAMES = ['P1', 'P2', 'P3', 'P4']
        const net = {
            role: netRole, active: !!netRole, racing: false, phase: netRole ? 'idle' : 'off',
            code: '', slot: -1, cap: 4, seed: 0,
            seatToId: {}, remoteIds: [], cpuIds: [], seats: [],
            ghosts: {}, fin: {}, reportedHeat: -1, lastSend: 0,
            standings: null, standingsDone: false, reconnectTimer: 0, attempt: 0,
        }
        const nameFor = (seat) => (seat === net.slot ? 'YOU' : SEAT_NAMES[seat] || ('P' + (seat + 1)))
        const pushNet = () => setNetUi(net.active ? {
            role: net.role, phase: net.phase, code: net.code, cap: net.cap, slot: net.slot,
            seats: seatKinds(net.cap, net.seats.length ? net.seats : [0]),
            standings: net.standings, done: net.standingsDone, names: SEAT_NAMES.slice(0, net.cap),
        } : null)

        let ws = null
        const makeTransport = (url) => {
            ws = new WebSocket(url)
            return {
                send: (s) => { try { if (ws && ws.readyState === 1) ws.send(s) } catch { /* gone */ } },
                onMessage: (cb) => { ws.onmessage = (ev) => cb(ev.data) },
                onClose: (cb) => { ws.onclose = () => cb() },
                close: () => { try { if (ws) ws.close() } catch { /* gone */ } },
            }
        }

        const syncSeats = () => {
            net.slot = room.yourSlot
            net.cap = room.cap || 4
            net.seats = (room.slots || []).slice()
            const ids = seatIds(room.yourSlot, room.slots, net.cap)
            net.seatToId = ids.seatToId
            net.remoteIds = ids.remoteSeats.map((s) => ids.seatToId[s])
            net.cpuIds = ids.cpuIds
            pruneGhosts(net.ghosts, net.remoteIds)
            for (const s of net.seats) if (!net.fin[s]) net.fin[s] = []
        }

        const recomputeStandings = () => {
            if (net.seats.length < 1) return
            const st = computeStandings(net.seats, net.fin, HEATS)
            net.standings = st.totals
            net.standingsDone = st.done
            if (st.done) setPodium({ podium: st.podium, totals: st.totals, names: net.seats.map(nameFor) })
            pushNet()
        }

        const netStartRace = (seed) => {
            net.seed = seed >>> 0
            net.racing = true
            net.phase = 'racing'
            net.fin = {}
            net.seats.forEach((s) => { net.fin[s] = [] })
            net.reportedHeat = -1
            net.ghosts = {}
            net.standingsDone = false
            g = makeGame('race', net.seed)
            shownHeat = 0
            setCourseVisuals()
            keys.clear()
            tiltReset()
            setResult(null)
            setPodium(null)
            setMode('play')
            pushNet()
            audioController.playSweep(220, 660, 0.3, 'square', 0.07)
        }

        const room = createRoom({
            relay: relayUrl, makeTransport,
            onPhase: (p) => { net.phase = p; pushNet() },
            onRoster: () => { syncSeats(); pushNet() },
            onJoin: () => audioController.playTone(660, 0.07, 'square', 0.05),
            onLeave: () => audioController.playSweep(660, 200, 0.22, 'square', 0.05),
            on: {
                go: (m) => { if (net.role === 'guest') netStartRace(m.seed | 0) },
                st: (m) => { const id = net.seatToId[m.s]; if (id != null) net.ghosts[id] = decodeState(m) },
                fin: (m) => {
                    if (m.s === net.slot) return
                    if (!net.fin[m.s]) net.fin[m.s] = []
                    net.fin[m.s][m.h | 0] = m.t
                    recomputeStandings()
                },
            },
        })

        const netHostStart = () => {
            if (net.role !== 'host' || net.racing) return
            const seed = (Math.random() * 2147483647) >>> 0
            room.send('go', { seed })
            netStartRace(seed)
        }

        if (net.active) {
            if (net.role === 'host') room.connect(net.code || (net.code = randomCode()), 4)
            else net.code = decodeCode(nq.get('room')); if (net.code) room.connect(net.code, 0)
            pushNet()
        }

        function randomCode() {
            const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
            let s = ''
            for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]
            return s
        }

        // broadcast our hero pose a few times a second; park nothing, just report.
        const onlineTick = () => {
            const p = g.riders[0]
            if (net.racing && g.phase === 'run' && g.tick % 2 === 0) room.send('st', encodeState(p, g.heat))
            for (const id of net.remoteIds) { const gs = net.ghosts[id]; if (gs && gs.heat === g.heat) applyGhost(g.riders[id], gs) }
            if (net.racing && p.finished && net.reportedHeat !== g.heat) {
                net.reportedHeat = g.heat
                const t = g.heatT / 60
                if (!net.fin[net.slot]) net.fin[net.slot] = []
                net.fin[net.slot][g.heat] = t
                room.send('fin', { h: g.heat, t })
                recomputeStandings()
            }
        }

        const doSim = () => {
            const p = g.riders[0]
            let inp
            if (screenRef.current === 'attract') inp = decide(g, p, true)
            else inp = {
                // #791: a canvas drag IS the analog stick — horizontal offset from
                // where the finger went down sets steer depth; keyboard/pad ±1 falls
                // back through the sim's pressure ramp. #828: a physical stick
                // (padState) rides the same analog line as the drag. #894: the pad's
                // physical stick outranks both — x depth, y tilt for tuck/scrub and
                // the flip direction (forward commits the FRONT flip, sim ledger −).
                steer: tiltActive ? tiltX : dragSteer !== null ? dragSteer : padState.engaged ? padState.x : (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0),
                jump: keys.has('Space'),
                boost: keys.has('ShiftLeft') || keys.has('ShiftRight'),
                grab: keys.has('KeyX'),
                invert: keys.has('KeyV'),
                flip: keys.has('KeyZ') ? (tiltActive ? flipDirFromTilt(tiltY) || 1 : 1) : keys.has('KeyC') ? 2 : 0,
                tuck: keys.has('ArrowUp') || (tiltActive && bodyFromTilt(tiltY).tuck),
                scrub: keys.has('ArrowDown') || (tiltActive && bodyFromTilt(tiltY).scrub),
            }
            step(g, inp)
            sfx(g.events.splice(0))
            if (net.active) onlineTick()
            if (g.heat !== shownHeat) { shownHeat = g.heat; setCourseVisuals(); wasChute = false }
            if (g.end && screenRef.current === 'play') {
                setResult({ end: g.end, why: g.why, tricks: p.tricksLanded, crashes: p.crashes, place: p.place, score: p.score, online: net.racing })
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
            poseRider(rig, r, g.tick, poseOverride)
        }

        const frame = (ts) => {
            raf = requestAnimationFrame(frame)
            if (!last) last = ts
            const ft = Math.min(ts - last, 250)
            fpsEMA = fpsEMA * 0.92 + (1000 / Math.max(1, ts - last || 16)) * 0.08
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
            // #780: the countdown is a SUMMIT VISTA, not a chase-cam tunnel —
            // park high and far with a slow drift, the valley falling away
            // below the gate; at GO the chase goal takes over and the lerp
            // swoops you down into the run.
            const counting = g.phase === 'count'
            let goal
            if (counting) {
                const V = START_VISTA
                const pan = Math.sin(g.tick * 0.008) * V.drift
                goal = new THREE.Vector3(
                    pp.x - Math.sin(pp.th + pan) * V.back,
                    pp.y + V.up,
                    pp.z - Math.cos(pp.th + pan) * V.back,
                )
            } else {
                const back = 9.5, up = 4.1 + p.v * 0.028
                goal = new THREE.Vector3(pp.x - fwdX * back, (p.air ? p.y : pp.y) + up, pp.z - fwdZ * back)
            }
            if (shake > 0 && !counting) {
                goal.x += Math.sin(g.tick * 3.7) * shake
                goal.y += Math.cos(g.tick * 4.9) * shake
            }
            shake = Math.max(0, shake - 0.03)
            camPos.lerp(goal, camFresh ? 1 : counting ? 0.06 : 0.18)
            camFresh = false
            camera.position.copy(camPos)
            if (counting) camera.lookAt(pp.x + fwdX * START_VISTA.look, pp.y - START_VISTA.drop, pp.z + fwdZ * START_VISTA.look)
            else camera.lookAt(pp.x + fwdX * 16, (p.air ? p.y : pp.y) + 1.2, pp.z + fwdZ * 16)
            if (skyObj) {
                skyObj.position.set(camPos.x, camPos.y - 60, camPos.z)
                const sunMesh = skyObj.userData.sun
                if (sunMesh) {
                    const sd = SUN[skyObj.userData.theme] || SUN.day
                    const az = pp.th + sd.az, rad = Math.cos(sd.el) * 680
                    sunMesh.position.set(Math.sin(az) * rad, Math.sin(sd.el) * 680, Math.cos(az) * rad)
                    sunMesh.lookAt(camPos.x, camPos.y, camPos.z)
                }
            }
            if (sparkles) sparkles.forEach((sp, i) => {
                const P = SPARKLE_PULSE[i] || SPARKLE_PULSE[0]
                sp.material.opacity = P.base + P.amp * Math.sin(g.tick * P.rate + P.phase) + P.slow * Math.sin(g.tick * P.slowRate + P.phase * 1.7)
            })
            const fov = counting ? START_VISTA.fov : 66 + Math.min(16, Math.max(0, (p.v - 12) * 0.55)) + (p.boost ? 8 : 0)
            if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * 0.12; camera.updateProjectionMatrix() }

            for (const m of riders) m.visible = true
            g.riders.forEach((r, i) => placeRider(riders[i], r))
            {
                const airH = p.air ? p.y - pp.y : 0
                shadow.position.set(pp.x, pp.y + 0.04, pp.z)
                shadow.material.opacity = Math.max(0.05, shadowBase - airH * 0.05)
                shadow.scale.setScalar(1 + airH * 0.05)
            }

            // snow spray: carving, landings, boost — powder density scales with speed
            // #791: the board's analog edge pressure drives spray and swish, not
            // the raw key state — a shallow press throws a whisper, full lock a plume.
            const steer = p.press
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
                // #685: the CPU field cuts snow too — rivals kick powder when
                // they carve hard on the slope, so the field looks alive
                for (let ri = 1; ri < g.riders.length; ri++) {
                    const r = g.riders[ri]
                    const n = cpuSprayCount(r)
                    if (!n) continue
                    const rp = slopePos(g.course, r.s, r.x)
                    const rX = Math.sin(rp.th), rZ = Math.cos(rp.th)
                    for (let k = 0; k < n; k++) {
                        const fan = (Math.random() - 0.5) * (0.3 + r.v * 0.05)
                        putSpray(
                            rp.x - rX * 0.8 + Math.cos(rp.th) * fan, rp.y + 0.15, rp.z - rZ * 0.8 - Math.sin(rp.th) * fan,
                            -rX * (1.5 + Math.random() * 2) - Math.cos(rp.th) * r.steerSm * 1.6,
                            1.4 + Math.random() * 1.4 + r.v * 0.04,
                            -rZ * (1.5 + Math.random() * 2) + Math.sin(rp.th) * r.steerSm * 1.6,
                        )
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
                // #844: debris boards tumble away from the wipeout site
                for (let i = debris.length - 1; i >= 0; i--) {
                    const d = debris[i]
                    d.life -= dt
                    d.vy -= 9.8 * dt
                    d.mesh.position.x += d.vx * dt
                    d.mesh.position.y += d.vy * dt
                    d.mesh.position.z += d.vz * dt
                    d.mesh.rotation.x += d.wx * dt
                    d.mesh.rotation.z += d.wz * dt
                    if (d.life <= 0) {
                        scene.remove(d.mesh); disposeMesh(d.mesh)
                        debris.splice(i, 1)
                    }
                }
            }

            // #780 physical mix: wind rising with speed, a swish off the edge
            // on hard carves, an open-air hush on hangs, a rising boost engine
            // (#791: pitch climbs with how long Shift is held) — short
            // filtered bursts re-triggered on a throttle read as one bed.
            if (screenRef.current === 'play' && !pausedRef.current && g.phase === 'run' && p.v > 1) {
                if (!p.air) {
                    if (p.v > 16 && (windT = (windT + 1) % 9) === 0) {
                        audioController.playFilteredNoise(0.24, Math.min(0.05, 0.012 + (p.v - 16) * 0.0035), 420 + p.v * 28)
                    }
                    if (p.v > 8 && Math.abs(steer) > 0.45 && (swishT = (swishT + 1) % 5) === 0) {
                        const s = Math.abs(steer)
                        const cv = carveVoice(slopeAt(g.course, p.s, p.x), p.v, s)
                        audioController.playFilteredNoise(cv.dur, cv.vol, cv.cutoff)
                    }
                    if (p.boost && (boostT = (boostT + 1) % 8) === 0) {
                        const hum = p.boostHum || 0
                        audioController.playSweep(150 + hum * 300, 260 + hum * 520, 0.16, 'sawtooth', 0.026 + hum * 0.012)
                    }
                } else if ((windT = (windT + 1) % 12) === 0) {
                    audioController.playFilteredNoise(0.3, Math.min(0.055, 0.02 + p.v * 0.0015), 900)
                }
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
                        const al = aa * aa * GROOVE.alpha, be = ab * ab * GROOVE.alpha
                        const lipAl = aa * aa * GROOVE.lipAlpha, lipBe = ab * ab * GROOVE.lipAlpha
                        const strips = [
                            { dOff: -0.035, c: GROOVE.lipColor, a0: lipAl, a1: lipBe },
                            { dOff: 0, c: GROOVE.color, a0: al, a1: be },
                            { dOff: 0.035, c: GROOVE.lipColor, a0: lipAl, a1: lipBe },
                        ]
                        for (const st of strips) {
                            const half = st.dOff === 0 ? 0.02 : 0.018
                            const a1 = slopePos(g.course, a.s, a.x + off + st.dOff - half)
                            const a2 = slopePos(g.course, a.s, a.x + off + st.dOff + half)
                            const b1 = slopePos(g.course, b.s, b.x + off + st.dOff - half)
                            const b2 = slopePos(g.course, b.s, b.x + off + st.dOff + half)
                            const quad = [a1, a2, b2, a1, b2, b1]
                            const alph = [st.a0, st.a0, st.a1, st.a0, st.a1, st.a1]
                            for (let k = 0; k < 6; k++) {
                                const q = quad[k], o = (v + k) * 3, co = (v + k) * 4
                                gr.pos[o] = q.x; gr.pos[o + 1] = q.y + 0.02; gr.pos[o + 2] = q.z
                                gr.col[co] = st.c[0]; gr.col[co + 1] = st.c[1]; gr.col[co + 2] = st.c[2]; gr.col[co + 3] = alph[k]
                            }
                            v += 6
                        }
                        if (v >= GROOVE_MAX * 18) break
                    }
                    gr.geo.setDrawRange(0, v)
                    gr.geo.attributes.position.needsUpdate = true
                    gr.geo.attributes.color.needsUpdate = true
                })
            }

            // speed streaks past the screen edges
            if (streaks) {
                const kmh = p.v * 3.6
                // #911: the express chute lights streaks up at far lower
                // speed — the trough's own speed cue while expressAt > 1.
                const k = speedStreakK(kmh, p.boost, !p.air && expressAt(g.course, p.s, p.x) > 1)
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

            // #780/#791 score: one original big-beat bed per mountain theme (the
            // melodies live in AudioController.MUSIC). The grid lifts with your
            // speed — faster riding pushes the tempo. The attract loop runs the
            // same bed at low gain (the original's attract had its soundtrack
            // running); pause and results stay silent.
            const wantBed = !pausedRef.current && !g.end && g.phase === 'run' &&
                (screenRef.current === 'play' || screenRef.current === 'attract')
            if (wantBed) {
                const track = MUSIC_TRACKS[g.course.theme]
                if (track && musicTrack !== track) { audioController.startMusic(track); musicTrack = track }
                if (track) {
                    audioController.setMusicLevel(screenRef.current === 'attract' ? 0.45 : 1)
                    if ((musicStepT = (musicStepT + 1) % 24) === 0) {
                        audioController.setMusicStep(MUSIC_STEP[track] * Math.max(0.86, 1 - 0.14 * Math.max(0, p.v - 12) / 26))
                    }
                }
            } else if (musicTrack) { audioController.stopMusic(); musicTrack = null }

            if (popT > 0) popT--
            if (gapFlash > 0) gapFlash = Math.max(0, gapFlash - ft / 450)
            // #911: the express boost kicks the moment you drop into the
            // trough — a HUD tick says so, unless a trick pop already owns
            // the line.
            const inChute = !p.air && expressAt(g.course, p.s, p.x) > 1
            if (inChute && !wasChute) {
                audioController.playTone(980, 0.07, 'square', 0.06)
                if (popT <= 0) { pop = 'EXPRESS'; popT = 70 }
            }
            wasChute = inChute
            // #791 slice 11: the face is never frozen — flags ride the wind
            // everywhere, and the finish grandstands hop as the line comes up.
            animateDecor(world, g.tick, crowdHype(p.s, world.userData.standS ?? Infinity))
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
            // #911: the ribbon names the tour the seed rotated to, not just
            // the mountain, so the backcountry side is out in the open.
            if (h.heat) h.heat.textContent = g.mode === 'showoff' ? `TARGET ${CFG.showoffTarget}` : `HEAT ${g.heat + 1}/3 · ${rotationName(g.seed)} · ${g.course.name}`
            if (h.clock) h.clock.textContent = g.mode === 'showoff' ? String(Math.max(0, Math.ceil(g.showoffLeft))) : fmtTime(g.heatT / 60)
            if (h.pop) { h.pop.textContent = pop; h.pop.style.opacity = popT > 0 ? '1' : '0' }
            if (h.flash) h.flash.style.opacity = (gapFlash * 0.45).toFixed(3)
            if (h.aPop) {
                const show = popT > 0 && pop.startsWith('OVER!!')
                h.aPop.textContent = pop
                h.aPop.style.opacity = show ? '1' : '0'
            }
            if (h.air) h.air.style.opacity = p.air && p.airT > 0.25 ? '1' : '0'
            if (h.count) {
                if (g.phase === 'count' && !g.end) {
                    const n = Math.ceil(g.count / 60)
                    h.count.textContent = n > 0 ? String(n) : 'GO!'
                    h.count.style.opacity = '1'
                } else if (g.phase === 'run' && g.heatT < 45) {
                    h.count.textContent = 'GO!'
                    h.count.style.opacity = g.heatT < 28 ? '1' : '0'
                } else h.count.style.opacity = '0'
            }
        }

        const startPlay = (mode) => {
            g = makeGame(mode)
            shownHeat = g.heat
            setCourseVisuals()
            keys.clear()
            setTrickHeld(new Set())
            poseOverride = null
            setResult(null)
            dragId = null
            dragSteer = null
            tiltReset()
            setMode('play')
            audioController.playSweep(220, 660, 0.3, 'square', 0.07)
        }

        let dragId = null
        let dragX0 = 0
        let dragSteer = null
        const DRAG_FULL_PX = 64
        const onCanvasDown = (e) => {
            if (screenRef.current !== 'play' || pausedRef.current || dragId !== null) return
            dragId = e.pointerId
            dragX0 = e.clientX
            dragSteer = 0
        }
        const onCanvasMove = (e) => {
            if (dragId === null || e.pointerId !== dragId) return
            dragSteer = Math.max(-1, Math.min(1, (e.clientX - dragX0) / DRAG_FULL_PX))
        }
        const onCanvasUp = (e) => {
            if (dragId === null || e.pointerId !== dragId) return
            dragId = null
            dragSteer = null
        }

        const onDown = (e) => {
            // #828: any '?' reaches the pause regardless of layout or how it was
            // synthesized (non-US keyboards deliver '?' without shiftKey; other
            // codes carry it) — trust the key the browser resolved.
            const code = e.key === '?' ? 'Question' : e.shiftKey && e.code === 'Slash' ? 'Question' : e.code
            if (code === 'Question') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
            const sc = screenRef.current
            if (sc === 'attract') {
                audioController.init()
                if (net.active) {
                    if (net.role === 'host' && (e.code === 'Space' || e.code === 'Enter')) netHostStart()
                    return
                }
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
        const onBlur = () => { keys.clear(); tiltReset() }
        const onPointer = () => {
            const sc = screenRef.current
            if (sc === 'attract') {
                if (net.active) { if (net.role === 'host') netHostStart(); return }
                startPlay('race'); return
            }
            if (sc === 'over' && performance.now() - overAt > 900) setMode('attract')
        }
        window.addEventListener('keydown', onDown)
        window.addEventListener('keyup', onUp)
        window.addEventListener('blur', onBlur)
        window.addEventListener('pointerdown', onPointer)
        canvas.addEventListener('pointerdown', onCanvasDown)
        window.addEventListener('pointermove', onCanvasMove)
        window.addEventListener('pointerup', onCanvasUp)
        window.addEventListener('pointercancel', onCanvasUp)

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
                        screen: screenRef.current, end: g.end, why: g.why, mode: g.mode, heat: g.heat, tick: g.tick, phase: g.phase,
                        p: { s: p.s, x: p.x, y: p.y, v: p.v, air: p.air, spin: p.spin, flip: p.flip, tumble: p.tumble, meter: p.meter, chain: p.chain, score: p.score, tricks: p.tricksLanded, crashes: p.crashes, place: p.place, finished: p.finished, tuck: p.tuck, scrub: p.scrub, boost: p.boost, boostHum: p.boostHum, press: p.press, takeSpin: p.takeSpin, stomp: p.stomp, stompPow: p.stompPow, bobble: p.bobble, grabKind: p.grab, grab: p.grabKind, grabName: p.grab ? GRAB_NAMES[p.grabKind] : null, invert: p.invert, lastTrick: p.lastTrick, carves: p.carves.length },
                        standings: [...g.standings], hash: stateHash(g),
                    }
                },
                netProbe: () => ({
                    role: net.role, phase: net.phase, code: net.code, cap: net.cap, slot: net.slot,
                    racing: net.racing, seed: net.seed, heat: g.heat, tick: g.tick,
                    slots: net.seats.length, ghosts: net.remoteIds.filter((id) => net.ghosts[id]).length,
                    standings: net.standings ? Object.assign({}, net.standings) : null, done: net.standingsDone,
                }),
                hostStart: () => netHostStart(),
                keys,
                // #791 slice 11: decor life probe — shelf tag counts + whether
                // the crowd is actually moving (y samples across two frames).
                decor: () => {
                    const anim = world.userData.anim || { flags: [], crowd: [] }
                    return {
                        flags: anim.flags.length, crowd: anim.crowd.length,
                        standS: Number.isFinite(world.userData.standS) ? world.userData.standS : -1,
                        ys: anim.crowd.slice(0, 4).map((c) => +c.m.position.y.toFixed(3)),
                    }
                },
                setPose: (n) => { poseOverride = n || null },
                hero: () => {
                    const h = riders[0]?.userData?.hero
                    if (!h) return { ready: false, failed: h === false ? 1 : 0 }
                    return { ready: true, pose: h.pose, bones: Object.keys(h.bones).length }
                },
                // board top surface height (roll space) at lateral offset x — deck
                // top 0.115 plus the tip rocker lift; the one true surface the
                // grab/boot probes measure against
                deckTop: (x) => {
                    const a = Math.abs(x) / 0.89
                    return 0.115 + 0.16 * Math.pow(Math.max(0, a - 0.62) / 0.38, 2)
                },
                // grab depth (#615): wrist distance to the board's nose-edge band
                // (x 0.45..0.89 across the topsheet) in roll space, per arm
                grabReach: () => {
                    const rig = riders[0]
                    const h = rig && rig.userData.hero
                    if (!h) return { ready: false }
                    const roll = rig.userData.roll
                    const out = {}
                    for (const side of ['l', 'r']) {
                        const w = h.bones[`wrist${side}`]
                        if (!w) continue
                        const lp = roll.worldToLocal(w.getWorldPosition(new THREE.Vector3()))
                        let best = Infinity, bx = 0, bz = 0
                        for (let i = 0; i <= 10; i++) {
                            const x = 0.45 + (i / 10) * 0.44
                            const top = deckTop(x)
                            for (const z of [-0.19, -0.095, 0, 0.095, 0.19]) {
                                const d = Math.hypot(lp.x - x, lp.y - top, lp.z - z)
                                if (d < best) { best = d; bx = x; bz = z }
                            }
                        }
                        out[side] = { d: +best.toFixed(3), hand: [lp.x.toFixed(2), lp.y.toFixed(2), lp.z.toFixed(2)], pt: [bx.toFixed(2), bz.toFixed(2)] }
                    }
                    return out
                },
                // boot fit (#615): boot-box underside vs the deck top under each
                // boot (roll space) — welded when the gap is ~0..small, floating
                // when it grows positive, sunken when well negative
                bootClear: () => {
                    const rig = riders[0]
                    const h = rig && rig.userData.hero
                    if (!h) return { ready: false }
                    const roll = rig.userData.roll
                    rig.updateMatrixWorld(true)
                    const out = {}
                    for (const side of ['l', 'r']) {
                        const foot = h.bones[`foot${side}`]
                        const boot = foot && foot.children.find((c) => c.isMesh)
                        if (!boot) continue
                        // underside measured in roll space: under the leg-chain
                        // rotations of grab/tuck poses the world AABB min corner
                        // is not the deck-side of the boot (#883)
                        if (!boot.geometry.boundingBox) boot.geometry.computeBoundingBox()
                        const gb = boot.geometry.boundingBox
                        let low = Infinity, xs = 0, n = 0
                        for (let i = 0; i < 8; i++) {
                            const v = new THREE.Vector3(
                                i & 1 ? gb.max.x : gb.min.x, i & 2 ? gb.max.y : gb.min.y, i & 4 ? gb.max.z : gb.min.z)
                            boot.localToWorld(v)
                            roll.worldToLocal(v)
                            if (v.y < low) low = v.y
                            xs += v.x; n++
                        }
                        const a = Math.abs(xs / n) / 0.89
                        out[side] = +(low - (0.115 + 0.16 * Math.pow(Math.max(0, a - 0.62) / 0.38, 2))).toFixed(3)
                    }
                    return out
                },
                // pose life (#615): how far the stand pose's baked Idle frames
                // move between opposite phases of the loop — 0 means the rider
                // is mannequin-still again
                standBreath: () => {
                    const h = riders[0]?.userData?.hero
                    if (!h || !h.idleRing) return null
                    const A = h.idleRing.frames[0]
                    const B = h.idleRing.frames[Math.floor(h.idleRing.n / 2)]
                    let d = 0
                    for (const b of Object.keys(A)) {
                        if (A[b].p && B[b].p) d = Math.max(d, Math.hypot(A[b].p[0] - B[b].p[0], A[b].p[1] - B[b].p[1], A[b].p[2] - B[b].p[2]))
                    }
                    return +d.toFixed(3)
                },
                // board liveries (#615): per-rider bib number + logo + top-base
                // darkening factor
                boardInfo: () => riders.map((rig) => {
                    const b = rig?.userData?.hero?.board
                    return b ? { num: b.userData.num, logo: b.userData.logo, decal: b.children.some((c) => c.isMesh && c.material?.map) } : { num: null }
                }),
                shadowInfo: () => ({ theme: g.course.theme, color: shadowMat.color.getHexString(), base: shadowBase }),
                // DEV #615: swap the course theme without finishing the heat
                // (geometry is unchanged; visuals + shelf tint rebuild)
                setTheme: (t) => { if (!THEMES[t]) return false; g.course.theme = t; shownHeat = g.heat; setCourseVisuals(); return true },
                boneNames: () => { const h = riders[0]?.userData?.hero; return h ? Object.keys(h.bones) : null },
                // DEV probe loop: replace one pose's offset table live, then read
                // joint positions in roll space to re-aim the grab/boot weld
                retune: (name, offs) => { for (const rig of riders) { const h = rig?.userData?.hero; if (h) retunePose(name, offs, h) } },
                joints: () => {
                    const rig = riders[0]; const h = rig?.userData?.hero
                    if (!h) return null
                    const roll = rig.userData.roll
                    const out = {}
                    for (const n of ['chest', 'upperarml', 'lowerarml', 'wristl', 'upperarmr', 'lowerarmr', 'wristr', 'footl', 'footr']) {
                        const b = h.bones[n]
                        if (b) out[n] = roll.worldToLocal(b.getWorldPosition(new THREE.Vector3())).toArray().map((v) => +v.toFixed(3))
                    }
                    return out
                },
                riders: () => riders.map((rig) => {
                    const h = rig.userData.hero
                    return { hero: h ? 1 : h === false ? 2 : 0, pose: h ? h.pose : null, bones: h ? Object.keys(h.bones).length : 0 }
                }),
                fps: () => Math.round(fpsEMA),
                // #844 QA probes: wipeout scene (flying board + live spray
                // particles) and whether the touch trick-pad layer is mounted.
                wipeout: () => ({
                    debris: debris.length,
                    spray: sprayLife.reduce((a, b) => a + (b > 0 ? 1 : 0), 0),
                }),
                touchpad: () => TOUCH_PAD,
                // #894: the physical stick's live analog state — the drive drags
                // the knob and reads depth + tilt back out of here.
                stick: () => ({
                    x: +tiltX.toFixed(3), y: +tiltY.toFixed(3), active: tiltActive,
                    flipDir: tiltActive ? flipDirFromTilt(tiltY) : 0,
                    tuck: tiltActive && bodyFromTilt(tiltY).tuck,
                    scrub: tiltActive && bodyFromTilt(tiltY).scrub,
                }),
                // #780: what the chase/vista camera is doing + whether the bed
                // is running — the headless drive proves summit-before-GO.
                cam: () => {
                    const d = new THREE.Vector3()
                    camera.getWorldDirection(d)
                    return {
                        phase: g.phase,
                        fov: +camera.fov.toFixed(1),
                        pos: camera.position.toArray().map((v) => +v.toFixed(2)),
                        dir: d.toArray().map((v) => +v.toFixed(3)),
                        music: audioController._musicState(),
                    }
                },
                start: (m) => startPlay(m === 'showoff' ? 'showoff' : 'race'),
                boostMeter: () => { g.riders[0].meter = 100; return g.riders[0].meter },
                seek: (m) => { g.riders[0].s = m; camFresh = true; return g.riders[0].s },
                // DEV QA (#844): shove the rider across the valley-wall line so
                // the ground-step crash fires on the next tick, deterministically
                // (curve push can outrun the pad on a random line — the wipeout
                // gates must not depend on luck)
                nudgeWall: () => { const p = g.riders[0]; p.x = (p.x >= 0 ? 1 : -1) * 1.78; camFresh = true; return p.x },
                // DEV QA (#894): park the rider back on the centreline.
                center: () => { const p = g.riders[0]; p.x = 0; camFresh = true; return p.x },
                heat: (h) => { loadHeat(g, h); shownHeat = g.heat; setCourseVisuals(); return g.course.name },
                toAttract: () => { g = makeGame('race'); shownHeat = 0; poseOverride = null; setCourseVisuals(); setMode('attract') },
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
            room.reset()
            if (ws) { try { ws.close() } catch { /* gone */ } }
            trickApi.current = null
            stickApi.current = null
            clearDebris()
            audioController.stopMusic()
            window.removeEventListener('keydown', onDown)
            window.removeEventListener('keyup', onUp)
            window.removeEventListener('blur', onBlur)
            window.removeEventListener('resize', resize)
            window.removeEventListener('pointerdown', onPointer)
            canvas.removeEventListener('pointerdown', onCanvasDown)
            window.removeEventListener('pointermove', onCanvasMove)
            window.removeEventListener('pointerup', onCanvasUp)
            window.removeEventListener('pointercancel', onCanvasUp)
            cancelAnimationFrame(raf)
            disposables.forEach((d) => { if (d.dispose) d.dispose() })
            spray.geo.dispose(); spray.pts.material.map?.dispose(); spray.pts.material.dispose()
            shadowGeo.dispose(); shadowMat.dispose(); scene.remove(shadow)
            for (const gr of grooves) { gr.geo.dispose(); gr.mesh.material.dispose(); scene.remove(gr.mesh) }
            if (streaks) { streaks.geo.dispose(); streaks.pts.material.map?.dispose(); streaks.pts.material.dispose(); camera.remove(streaks.pts) }
            renderer.forceContextLoss()
            renderer.dispose()
            canvas.remove()
        }
    }, [setMode])

    const handleResume = useCallback(() => { setPaused(false); pausedRef.current = false }, [])
    const play = screen === 'play'
    const seatName = (seat) => (netUi && netUi.slot === seat ? 'YOU' : 'P' + (seat + 1))

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden select-none" style={{ touchAction: 'none' }}>
            <div ref={stageRef} className="absolute inset-0" />

            <div className={`absolute inset-0 pointer-events-none font-mono transition-opacity duration-300 ${play ? 'opacity-100' : 'opacity-0'}`}>
                {/* #911: the crevasse flash — the hole hits like an event */}
                <div ref={setHud('flash')} className="absolute inset-0 bg-cyan-100" style={{ opacity: 0, mixBlendMode: 'screen' }} />
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
                <div ref={setHud('count')} className="absolute top-[34%] left-1/2 -translate-x-1/2 text-8xl font-black italic text-yellow-300 transition-opacity duration-100" style={{ opacity: 0, textShadow: '0 0 26px rgba(0,0,0,0.9), 4px 4px 0 #b0147a' }} />
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
                    <span ref={setHud('aPop')} data-apop="1" className="block mb-4 text-2xl font-black italic text-yellow-300 transition-opacity duration-200" style={{ opacity: 0, textShadow: '0 0 18px #f0f, 3px 3px 0 #000' }} />
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

            {/* #845 waiting room — host shows the code, seats fill as friends join. */}
            {screen === 'attract' && netUi && netUi.role && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-cyan-50 font-mono px-6">
                    <div className="text-[10px] tracking-[0.3em] text-cyan-300/70 mb-1">{netUi.role === 'host' ? 'HOST A RACE' : 'JOINING RACE'}</div>
                    {netUi.code ? (
                        <div className="text-5xl font-black italic tracking-widest mb-3" style={{ color: '#fff', textShadow: '3px 0 0 #b0147a, -3px 0 0 #1490b0' }}>
                            {netUi.code.split('').join(' ')}
                        </div>
                    ) : (
                        <div className="text-lg mb-3 animate-pulse">{netUi.phase === 'offline' ? 'RELAY OFFLINE' : 'CONNECTING…'}</div>
                    )}
                    <div className="flex gap-2 mb-4">
                        {(() => { let cpu = 0; return netUi.seats.map((k, i) => {
                            const isCpu = k === 'cpu'
                            if (isCpu) cpu++
                            return (
                                <div key={i} className={`px-3 py-2 rounded border text-xs font-bold ${isCpu ? 'border-white/15 text-white/40' : 'border-cyan-300/40 text-cyan-100'} ${i === netUi.slot ? 'ring-2 ring-yellow-300' : ''}`}>
                                    <div className="text-[9px] opacity-70">{isCpu ? 'CPU' : k.toUpperCase()}</div>
                                    <div>{i === netUi.slot ? 'YOU' : (isCpu ? `CPU ${cpu}` : (netUi.names[i] || ('P' + (i + 1))))}</div>
                                </div>
                            )
                        }) })()}
                    </div>
                    {netUi.role === 'host'
                        ? <p className="text-sm text-yellow-300 animate-pulse">{netUi.phase === 'racing' ? 'RACING…' : 'PRESS SPACE / TAP TO START · FRIENDS JOIN AT /retrogames/ssx?net=join&room=' + netUi.code}</p>
                        : <p className="text-sm text-cyan-200/80 animate-pulse">waiting for the host to start…</p>}
                </div>
            )}

            {/* #845 live friends' standings — shown while racing online. */}
            {screen === 'play' && netUi && netUi.standings && (
                <div className="absolute bottom-24 right-3 bg-black/45 border border-cyan-300/30 rounded px-3 py-1.5 font-mono text-cyan-50 pointer-events-none">
                    <div className="text-[9px] tracking-widest opacity-70 mb-0.5">FRIENDS</div>
                    {Object.keys(netUi.standings).map(Number).sort((a, b) => netUi.standings[b] - netUi.standings[a]).map((seat) => (
                        <div key={seat} className="text-[11px] leading-4">
                            <span className={seat === netUi.slot ? 'text-yellow-300 font-bold' : ''}>{seatName(seat)}</span>
                            <span className="opacity-70"> · {netUi.standings[seat]}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* #845 final friends' podium. */}
            {screen === 'over' && podium && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-cyan-50 font-mono px-6 pointer-events-none">
                    <h2 className="text-3xl font-black italic mb-4" style={{ color: '#fff', textShadow: '3px 0 0 #b0147a, -3px 0 0 #1490b0' }}>FRIENDS PODIUM</h2>
                    <div className="flex items-end gap-3 mb-5">
                        {podium.podium.map((seat, i) => (
                            <div key={seat} className="text-center" style={{ order: i === 0 ? 2 : i === 1 ? 1 : 3 }}>
                                <div className="text-5xl mb-1">{['🥇', '🥈', '🥉'][i] || ''}</div>
                                <div className={`font-black ${seat === netUi?.slot ? 'text-yellow-300' : 'text-cyan-100'}`}>{seatName(seat)}</div>
                                <div className="text-xs opacity-70">{podium.totals[seat]} pts</div>
                                <div className="mt-1 mx-auto bg-gradient-to-t from-cyan-500/40 to-fuchsia-500/40 rounded-t" style={{ width: 56, height: [64, 44, 30][i] || 22 }} />
                            </div>
                        ))}
                    </div>
                    {podium.podium.length > 3 && <p className="text-xs opacity-70 mb-3">{podium.podium.slice(3).map((s) => `${seatName(s)} ${podium.totals[s]}`).join('  ·  ')}</p>}
                    <p className="animate-pulse font-bold">TAP / PRESS ANY KEY</p>
                </div>
            )}

            {paused && <PauseOverlay game={GAMES.find((g) => g.label === 'SSX')} onResume={handleResume} />}
            {/* #894 (Jon's #873 answer): the physical analogue stick — always
                visible base + knob. x = carve depth through the sim's press ramp,
                y = body tilt (forward tucks + commits a FRONT flip, back scrubs). */}
            {play && !paused && TOUCH_PAD && (
                <div
                    data-ssx-stick="1"
                    className="fixed z-[60] rounded-full pointer-events-auto select-none"
                    style={{
                        left: 'calc(1.5rem + env(safe-area-inset-left))',
                        bottom: 'calc(8.5rem + env(safe-area-inset-bottom))',
                        width: 128, height: 128, touchAction: 'none',
                        background: 'radial-gradient(circle, rgba(8,20,38,0.72) 0%, rgba(8,20,38,0.35) 70%, transparent 100%)',
                        border: '1px solid rgba(103,232,249,0.35)',
                        boxShadow: 'inset 0 0 18px rgba(103,232,249,0.12), 0 4px 14px rgba(0,0,0,0.5)',
                    }}
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); stickApi.current?.down(e.pointerId, e.clientX, e.clientY) }}
                    onPointerMove={(e) => { e.preventDefault(); e.stopPropagation(); stickApi.current?.move(e.pointerId, e.clientX, e.clientY) }}
                    onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); stickApi.current?.up(e.pointerId) }}
                    onPointerCancel={(e) => { e.stopPropagation(); stickApi.current?.up(e.pointerId) }}
                >
                    <div className="absolute left-1/2 top-1/2 rounded-full" style={{ width: 104, height: 104, transform: 'translate(-50%, -50%)', border: '1px solid rgba(103,232,249,0.25)' }} />
                    <div className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full bg-cyan-300/40" style={{ transform: 'translate(-50%, -50%)' }} />
                    <div
                        data-ssx-stick-knob="1"
                        className="absolute left-1/2 top-1/2 rounded-full"
                        style={{
                            width: 44, height: 44, transform: 'translate(-50%, -50%)',
                            background: 'radial-gradient(circle at 35% 30%, rgba(186,240,250,0.85) 0%, rgba(34,160,190,0.75) 55%, rgba(12,70,95,0.85) 100%)',
                            boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5), 0 2px 8px rgba(0,0,0,0.5)',
                        }}
                    />
                    <div className="absolute left-1/2 -translate-x-1/2 text-[8px] tracking-[0.2em] text-cyan-200/60 font-bold" style={{ bottom: 6 }}>TILT</div>
                </div>
            )}
            {/* #844: phone trick buttons — grab / flip / invert feed the same
                key codes the desktop reads, so the trick economy works one-handed
                on the slope (INV needs GRAB held, like on the keyboard). #894:
                FLIP is one button now — stick tilt picks its direction
                (forward = FRONT flip), replacing the discrete FLIP/FRNT pair;
                keyboard Z/C and gamepad L1/R1 keep both flips explicit. */}
            {play && !paused && TOUCH_PAD && (
                <div
                    className="fixed z-50 right-0 flex gap-2 pointer-events-auto select-none"
                    style={{ bottom: 'calc(9.5rem + env(safe-area-inset-bottom))', paddingRight: 'calc(2rem + env(safe-area-inset-right))' }}
                >
                    {[['GRAB', 'KeyX'], ['FLIP', 'KeyZ'], ['INV', 'KeyV']].map(([label, code]) => (
                        <button
                            key={code}
                            data-ssx-trick={code}
                            className={`rounded-full font-bold text-white border border-white/10 shadow-lg backdrop-blur-sm transition-transform ${trickHeld.has(code) ? 'bg-cyan-400/90 scale-95' : 'bg-cyan-600/50'}`}
                            style={{ width: 52, height: 52, fontSize: 11, touchAction: 'none' }}
                            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); trickApi.current?.(code, true) }}
                            onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); trickApi.current?.(code, false) }}
                            onPointerCancel={() => trickApi.current?.(code, false)}
                        >{label}</button>
                    ))}
                </div>
            )}
            <VirtualControls visible={play && !paused && TOUCH} secondAction={{ label: 'BST', code: 'ShiftLeft' }} />
        </div>
    )
}

export default SSXGame

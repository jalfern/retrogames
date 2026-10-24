// MYST — Cyan, 1993. A first-person, node-to-node adventure: every view is a
// still, richly rendered scene; click (or tap) hot spots to move and act, the
// arrow keys step and turn. The island is the spec: the library with Sirrus's
// red book and Achenar's blue, the locked safe, the fireplace that burns the
// wooden book, the clock tower behind the palm illusion, the star panel that
// opens Channelwood, four Ages each hiding a red and a blue page, and three
// endings. All art and audio generated in code; the sea, fire, gears,
// illusions and starlight never stop moving. Four endings: Atrus, the two
// brothers — and the rocket, if you find the note that opens its seam.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import PauseOverlay from '../../components/PauseOverlay'
import AttractMessage from '../../components/AttractMessage'
import VirtualControls from '../../components/VirtualControls'
import { GAMES } from '../../config/games'
import { audioController } from '../../utils/AudioController'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { NODES, AGE_LIST } from './nodes.js'
import { freshState, dispatch, runSolver, solveScript, RIDE, WHEEL_POINTS, WHEEL_RINGS, WHEEL_NOTCH, spectatorViews } from './state.js'
import { seedFromSearch, notebookSeed, storeSeed, loadSeed } from './codes.js'
import { MESSAGES, PRESS } from './attract.js'
import { buildWorld, atmosphere, updateTrueStars, updateWheel } from './scene.js'
import { drawVision } from './visions.js'
import { sfx, sfxTone, ambience } from './sound.js'
import { singTicks } from './soundplan.js'

const VW = 960, VH = 540
const SIM_MS = 1000 / 60
const NODE_IDS = Object.keys(NODES)
const NODE_IX = Object.fromEntries(NODE_IDS.map((id, i) => [id, i]))
const GAP = 4000
const SILO_FOG = new THREE.Color(0x241a28)
const SPACE_FOG = new THREE.Color(0x05050f)
const ATTRACT_WALK = ['dockBeach', 'toLanding', 'toStairs', 'libraryDoor', 'outLibrary', 'backLanding', 'backCliff', 'backDock']
const attractSpots = () => ATTRACT_WALK

const MystGame = () => {
  const stageRef = useRef(null)
  const [screen, setScreen] = useState('attract')
  const [paused, setPaused] = useState(false)
  const [hud, setHud] = useState(() => ({ message: '', caption: '', pages: {}, placed: { red: 0, blue: 0 }, panel: null, book: null, ending: null, links: {} }))
  const [singRing, setSingRing] = useState(-1)
  const singRingRef = useRef(-1)
  const visionRefs = useRef({})
  const screenRef = useRef('attract')
  const pausedRef = useRef(false)
  const setMode = useCallback((m) => { screenRef.current = m; setScreen(m) }, [])
  const ctl = useRef(null)
  const syncHud = (s) => setHud({ message: s.message, caption: NODES[s.node].caption, pages: { ...s.pages }, placed: { ...s.placed }, panel: s.panelOpen, book: s.bookOpen, ending: s.ending, links: Object.fromEntries(AGE_LIST.map((a) => [a, !!s.flags[`link_${a}`]])), visions: spectatorViews(s), sphere: [...s.sphereDial], star: [...s.starDial], wheel: [...s.wheelDial], switches: [...s.switches], dial: s.safeDial })

  useEffect(() => {
    const wrap = stageRef.current
    if (!wrap) return undefined
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(VW, VH, false)
    renderer.setPixelRatio(1)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.22
    const canvas = renderer.domElement
    canvas.dataset.mystStage = '1'
    canvas.id = 'myst-stage'
    canvas.className = 'block w-full h-full'
    canvas.style.touchAction = 'none'
    wrap.appendChild(canvas)
    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x0a0a12, 60, 700)
    const camera = new THREE.PerspectiveCamera(72, VW / VH, 0.1, 2000)
    scene.add(new THREE.HemisphereLight(0xcfd8e8, 0x2a2418, 0.9))
    const sun = new THREE.DirectionalLight(0xffe8c8, 1.1)
    sun.position.set(-40, 60, 30)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.left = -36; sun.shadow.camera.right = 36
    sun.shadow.camera.top = 36; sun.shadow.camera.bottom = -36
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 200
    sun.shadow.bias = -0.0007
    scene.add(sun); scene.add(sun.target)
    const SUN_OFF = new THREE.Vector3(-38, 54, 26)

    const { root, hot, anim, mech } = buildWorld(NODE_IDS)
    scene.add(root)

    let gs = freshState(seedFromSearch())
    let seedStamp = -1
    const syncStars = () => { if (gs.seed !== seedStamp) { seedStamp = gs.seed; updateTrueStars(root, gs.codes.star); updateWheel(root, gs.codes.wheel) } }
    syncStars()
    const toneBulbs = []
    root.traverse((o) => { if (o.userData && o.userData.tone != null && o.material) toneBulbs.push(o) })
    let sing = null
    let raf = 0, last = 0, acc = 0, wt = 0
    let fade = 1, fadeDir = -1
    let attractIx = 0, attractT = 0, hudStamp = -1
    let lookYaw = 0

    const gotoNode = (id) => {
      const i = NODE_IX[id]
      camera.position.set(i * GAP + NODES[id].pos[0], NODES[id].pos[1], NODES[id].pos[2])
      sun.position.copy(camera.position).add(SUN_OFF)
      sun.target.position.copy(camera.position)
      const at = atmosphere(id)
      scene.fog.color.set(at.fog.color); scene.fog.near = at.fog.near; scene.fog.far = at.fog.far
      sun.color.set(at.sun.color); sun.intensity = at.sun.i
    }
    const aim = () => {
      const n = NODES[gs.node]
      const yaw = Math.PI + THREE.MathUtils.degToRad(n.yaw + gs.turn * 90 + lookYaw)
      camera.rotation.set(0.02, yaw, 0)
    }
    gotoNode(gs.node); aim()

    const smooth = (x) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c) }
    // saddle height above the pad, per ride stage+tick — up in quadratic, a
    // held coast in the dark, and a long downhill home.
    const rocketH = (ride, t) => {
      if (!ride || ride === 'seated' || ride === 'ignite') return 0
      if (ride === 'liftoff') return 34 * smooth(t / RIDE.liftoff) ** 1.4
      if (ride === 'ascent') return 34 + 152 * smooth(t / RIDE.ascent)
      if (ride === 'coast') return 186
      if (ride === 'reentry') return 186 - 180 * smooth(t / RIDE.reentry)
      return 6
    }
    const darkAt = (ride, t) => {
      if (!ride || ride === 'seated' || ride === 'ignite') return 0
      if (ride === 'coast') return 1
      return Math.max(0, Math.min(1, (rocketH(ride, t) - 24) / 110))
    }

    const updateMech = (s, dt) => {
      const k = Math.min(1, dt * 2.4)
      const F = s.flags
      for (const m of mech) {
        switch (m.kind) {
          case 'cageWalk': m.o.position.y += ((F.mechCarDown ? 0.6 : 15) - m.o.position.y) * k; break
          case 'cageTop': m.o.position.y += ((F.mechCarDown ? m.y0 - 16 : m.y0) - m.o.position.y) * k; break
          case 'cageShaft': m.o.position.y += ((F.mechCarDown ? m.y0 : m.y0 + 3.2) - m.o.position.y) * k; break
          case 'doorTop': { const o = F.mechDoorOpen ? 1 : 0; m.o.position.x += (m.x0 + 1.95 * o - m.o.position.x) * k; m.o.rotation.y += (-0.9 * o - m.o.rotation.y) * k; break }
          case 'plateD': m.o.position.y += ((F.mechPlateD ? m.y0 - 0.07 : m.y0) - m.o.position.y) * k; break
          case 'plateE': m.o.position.y += ((F.mechPlateE ? m.y0 - 0.07 : m.y0) - m.o.position.y) * k; break
          case 'latch': m.o.rotation.z += ((F.mechLatchD || F.mechLatchE ? -0.5 : 0.55) - m.o.rotation.z) * k; break
          case 'topGear': { const open = !!F.switchPanel; m.o.position.z += (m.z0 - (open ? 1.5 : 0) - m.o.position.z) * k; m.o.rotation.z += dt * (open ? 1.4 : 0.3); break }
          // SELENITIC: stones sink when rung, the gate slab grinds down, the
          // throne swivels notch by notch, the sun appears only at the true
          // alignment, the mountain door slides aside, the gear lifts from its slot
          case 'selPathSlab': m.o.position.y += ((F.selPath ? m.y0 - 6.9 : m.y0) - m.o.position.y) * k; break
          case 'selChair': m.o.rotation.y += ((s.selChair || 0) * Math.PI / 4 - m.o.rotation.y) * k; break
          case 'selSun': { let p = m.o.userData.p || 0; p = Math.max(0, Math.min(1, p + (F.selAlign ? k : -k * 1.3))); m.o.userData.p = p; const rise = p * p * (3 - 2 * p); m.o.scale.setScalar(0.02 + 0.98 * rise); m.o.position.y = m.y0 - 2.4 * (1 - rise); m.o.material.emissiveIntensity = 1.1 * rise; m.o.visible = rise > 0.005; break }
          case 'selNotch': { const tgt = F.selAlign ? 2.4 : (m.o.userData.notch === (s.selChair || 0) ? 1.5 : 0); m.o.material.emissiveIntensity += (tgt - m.o.material.emissiveIntensity) * k; break }
          case 'selAlignDoor': m.o.position.z += ((F.selAlign ? m.z0 - 3.2 : m.z0) - m.o.position.z) * k; break
          case 'selGear': { const sc = F.gearSelenitic ? 0.001 : 1; m.o.scale.x += (sc - m.o.scale.x) * k; m.o.scale.y = m.o.scale.x; m.o.scale.z = m.o.scale.x; break }
          // CHANNELWOOD: the sluice gate drops to dam the channels, the water
          // climbs the stone cuts, and the float lifts with it; the star-wheel
          // holds its detent, and the shelter's gear lifts free once the bite
          case 'chanSluice': m.o.position.y += ((F.chanFlood ? m.y0 - 4.3 : m.y0) - m.o.position.y) * k; break
          case 'chanWater': m.o.position.y += ((F.chanFlood ? m.y0 + 0.62 : m.y0) - m.o.position.y) * k; break
          case 'chanFloat': m.o.position.y += ((F.chanFlood ? m.y0 + 0.58 : m.y0) - m.o.position.y) * k; break
          case 'starWheel': {
            const tgt = (s.wheel || 0) * (Math.PI * 2 / 5)
            let d = tgt - m.o.rotation.z
            d = Math.atan2(Math.sin(d), Math.cos(d))
            m.o.rotation.z += d * Math.min(1, dt * 3.2)
            break
          }
          case 'chanGear': {
            const on = F.wheelBite && !F.gearChannelwood ? 1 : 0.001
            m.o.scale.x += (on - m.o.scale.x) * k
            m.o.scale.y = m.o.scale.z = m.o.scale.x
            m.o.rotation.y += dt * (on > 0.5 ? 0.9 : 0)
            m.o.visible = on > 0.02
            break
          }
          // THE STAR-WHEEL (#1014): the rings turn to the dials (shortest way
          // round), and the hub cover slides clear only when the stars agree.
          case 'chanRing0': case 'chanRing1': case 'chanRing2': {
            const i = Number(m.kind.slice(-1))
            const tgt = ((s.wheelDial || [0, 0, 0])[i]) * Math.PI * 2 / WHEEL_NOTCH
            let d = (tgt - m.o.rotation.z) % (Math.PI * 2)
            if (d > Math.PI) d -= Math.PI * 2
            if (d < -Math.PI) d += Math.PI * 2
            m.o.rotation.z += d * Math.min(1, dt * 7)
            break
          }
          case 'chanHub': m.o.position.x += ((F.wheelOpen ? m.x0 + 0.48 : m.x0) - m.o.position.x) * k; break
          // THE ROCKET (#1010): the silver climbs, the flame breathes, the
          // high stars fade in — all driven from the pure ride state.
          case 'rocketBody': {
            const H = rocketH(s.ride, s.rideT)
            const jt = s.ride === 'ignite' ? Math.sin(performance.now() * 0.055) * 0.02 : s.ride === 'liftoff' ? Math.sin(performance.now() * 0.09) * 0.012 : 0
            m.o.position.y += (m.y0 + H + jt - m.o.position.y) * Math.min(1, dt * 8)
            break
          }
          case 'rocketFlame': {
            const on = s.ride === 'ignite' ? 0.3 + 0.12 * Math.sin(performance.now() * 0.05)
              : s.ride === 'liftoff' || s.ride === 'ascent' ? 1.15
                : s.ride === 'reentry' ? 0.7 : 0.001
            const fx = on + 0.1 * Math.sin(performance.now() * 0.07)
            m.o.scale.x += (fx - m.o.scale.x) * Math.min(1, dt * 5)
            m.o.scale.z = m.o.scale.x
            m.o.scale.y = m.o.scale.x * (1 + 0.14 * Math.sin(performance.now() * 0.083))
            break
          }
          case 'rideStars': {
            const t2 = darkAt(s.ride, s.rideT)
            m.o.material.opacity += (t2 - m.o.material.opacity) * Math.min(1, dt * 1.5)
            break
          }
          default: {
            if (m.kind.startsWith('selStone')) {
              const i = Number(m.kind.slice('selStone'.length))
              m.o.position.y += (((s.selStone || 0) > i ? m.y0 - 0.1 : m.y0) - m.o.position.y) * k
            } else if (m.kind.startsWith('selTell')) {
              const i = Number(m.kind.slice('selTell'.length))
              const next = !F.selPath && (s.selStone || 0) === i
              const base = next ? 1.9 + 0.9 * Math.sin(performance.now() * 0.0065 - i) : 0.55
              m.o.material.emissiveIntensity += (base - m.o.material.emissiveIntensity) * k
            }
            break
          }
        }
      }
    }

    const doAction = (a) => {
      const prevNode = gs.node
      const r = dispatch(gs, a)
      gs = r.state
      syncStars()
      for (const e of r.events) {
        if (e === 'travel' || e === 'restart' || e === 'endSurface') fadeDir = 1
        if (e.startsWith('sing:')) sing = { t0: wt, ticks: singTicks(e.slice(5)) }
        sfx(e)
      }
      if (gs.node !== prevNode) { gotoNode(gs.node); gs.turn === 0 && (lookYaw = 0) }
      aim()
      if (gs.ending && screenRef.current !== 'ending') setMode('ending')
      hudStamp = -1
    }
    const doClick = (spotId) => {
      if (gs.panelOpen || gs.bookOpen) return
      doAction({ t: 'click', id: spotId })
    }
    ctl.current = { action: doAction, click: doClick }

    const centerSpot = () => {
      const view = NODES[gs.node].yaw + gs.turn * 90
      let best = null, bd = 999
      for (const s of NODES[gs.node].spots) {
        if (s.gone && gs.flags[s.gone]) continue
        let d = ((s.yaw - view + 540) % 360) - 180
        d = Math.abs(d)
        if (d < bd && d < 55) { bd = d; best = s }
      }
      return best
    }

    // ------------------------------------------------------------- input ----
    const onKeyDown = (e) => {
      audioController.unlock?.()
      if (e.key === '?') { setPaused((p) => { pausedRef.current = !p; return !p }); return }
      if (pausedRef.current) return
      if (screenRef.current === 'attract') { if (e.key !== 'Shift' && e.key !== 'Control') startPlay(); return }
      if (screenRef.current === 'ending') { if (e.code === 'Space' || e.key === 'Enter') restart(); return }
      if (gs.panelOpen || gs.bookOpen) {
        if (e.key === 'Escape' || e.code === 'Space' || e.key === 'Enter') doAction({ t: gs.bookOpen ? 'closeBook' : 'closePanel' })
        return
      }
      switch (e.code) {
        case 'ArrowLeft': e.preventDefault(); doAction({ t: 'turn', dir: 3 }); break
        case 'ArrowRight': e.preventDefault(); doAction({ t: 'turn', dir: 1 }); break
        case 'ArrowUp': case 'KeyW': {
          e.preventDefault()
          const s = centerSpot()
          if (s) doClick(s.id)
          break
        }
        case 'Space': case 'Enter': {
          const s = centerSpot()
          if (s) doClick(s.id)
          break
        }
        case 'KeyX': doAction({ t: 'turn', dir: 3 }); break
        default: break
      }
    }
    const onPad = (e) => {
      if (screenRef.current === 'attract') { startPlay(); return }
      if (screenRef.current === 'ending') { restart(); return }
      const c = e.detail?.code
      if (!c) return
      if (gs.panelOpen || gs.bookOpen) { doAction({ t: gs.bookOpen ? 'closeBook' : 'closePanel' }); return }
      if (c === 'ArrowLeft') doAction({ t: 'turn', dir: 3 })
      else if (c === 'ArrowRight') doAction({ t: 'turn', dir: 1 })
      else if (c === 'ArrowUp') { const s = centerSpot(); if (s) doClick(s.id) }
      else if (c === 'Space') { const s = centerSpot(); if (s) doClick(s.id) }
      else if (c === 'KeyX') doAction({ t: 'turn', dir: 3 })
    }

    const ray = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const pick = (ev) => {
      const r = canvas.getBoundingClientRect()
      pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1
      pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1
      ray.setFromCamera(pointer, camera)
      const list = hot.filter((h) => h.node === gs.node && !(h.mesh.userData.noPick)).map((h) => h.mesh)
      const hit = ray.intersectObjects(list, false)[0]
      return hit ? hot.find((h) => h.mesh === hit.object) : null
    }
    const onPointer = (ev) => {
      audioController.unlock?.()
      if (screenRef.current === 'attract') { startPlay(); return }
      if (screenRef.current === 'ending') { restart(); return }
      if (pausedRef.current || gs.panelOpen || gs.bookOpen) return
      const h = pick(ev)
      if (h) doClick(h.id)
      else sfx('look')
    }
    const onMove = (ev) => {
      if (screenRef.current !== 'play' || gs.panelOpen || gs.bookOpen) { canvas.style.cursor = 'default'; return }
      canvas.style.cursor = pick(ev) ? 'pointer' : 'default'
    }
    const onCloseEv = (ev) => doAction({ t: ev.detail?.book ? 'closeBook' : 'closePanel' })
    window.addEventListener('mystclose', onCloseEv)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('virtualcontrols', onPad)
    canvas.addEventListener('pointerdown', onPointer)
    canvas.addEventListener('pointermove', onMove)

    const startPlay = () => {
      gs = freshState(notebookSeed())
      storeSeed(gs.seed)
      sing = null; singRingRef.current = -1; setSingRing(-1)
      syncStars()
      gotoNode(gs.node); aim()
      setMode('play')
      hudStamp = -1
    }
    const restart = () => {
      doAction({ t: 'restart' })
      storeSeed(gs.seed)
      gs.message = 'A fresh link, a fresh island — the stone is the same, the locks are new. (seed ' + gs.seed + ')'
      sing = null; singRingRef.current = -1; setSingRing(-1)
      setMode('play')
    }

    // -------------------------------------------------------------- loop ----
    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(100, now - last)
      last = now
      if (pausedRef.current) return
      acc += dt
      while (acc >= SIM_MS) {
        acc -= SIM_MS
        wt += SIM_MS / 1000
        updateMech(gs, SIM_MS / 1000)
        if (screenRef.current === 'play' && gs.ride && gs.ride !== 'seated' && gs.ride !== 'landed') {
          const rr = dispatch(gs, { t: 'tick' })
          gs = rr.state
          for (const e of rr.events) { if (e === 'endSurface') fadeDir = 1; sfx(e) }
          const yy = NODES[gs.node].pos[1] + rocketH(gs.ride, gs.rideT)
          camera.position.y = yy
          sun.position.copy(camera.position).add(SUN_OFF)
          sun.target.position.copy(camera.position)
          const dk = darkAt(gs.ride, gs.rideT)
          scene.fog.color.copy(SILO_FOG.clone().lerp(SPACE_FOG, dk))
          scene.fog.far = 640 - 380 * dk
          sun.intensity = 1.15 * (1 - 0.88 * dk)
          if (gs.ending) setMode('ending')
          hudStamp = -1
        }
        if (sing) {
          const el = wt - sing.t0
          let ring = -1, frac = 0, lit = -1
          for (const k of sing.ticks) {
            if (el >= k.at && el < k.at + 0.34) { ring = k.ring; lit = k.tone; frac = (el - k.at) / 0.34 }
          }
          if (el >= sing.ticks[sing.ticks.length - 1].at + 0.34) sing = null
          if (ring !== singRingRef.current) { singRingRef.current = ring; setSingRing(ring) }
          for (const b of toneBulbs) b.material.emissiveIntensity = 0.6 + (b.userData.tone === lit ? 2.6 * Math.max(0, 1 - frac * 1.3) : 0)
        }
        fade = Math.max(0, Math.min(1, fade + fadeDir * (SIM_MS / 380)))
        if (fade >= 1 && fadeDir > 0) fadeDir = -1
        if (screenRef.current === 'attract') {
          attractT += SIM_MS
          lookYaw += (SIM_MS / 1000) * 6
          aim()
          if (attractT > 2300) {
            attractT = 0
            const ids = attractSpots()
            const id = ids[attractIx % ids.length]
            attractIx += 1
            const prev = gs.node
            const r = dispatch(gs, { t: 'click', id })
            gs = r.state
            if (gs.node !== prev) { gotoNode(gs.node); lookYaw = 0; fadeDir = 1; aim(); sfx('travel') }
          }
        }
        if (screenRef.current === 'play' && !gs.panelOpen && !gs.bookOpen && !gs.ride) ambience(NODES[gs.node].amb, SIM_MS / 1000)
      }
      for (const a of anim) a.f(wt)
      if (gs.panelOpen === 'spectator') {
        for (const v of spectatorViews(gs)) {
          const cv = visionRefs.current[v.age]
          if (cv) drawVision(cv.getContext('2d'), v.age, wt, v.unlocked, cv.width, cv.height)
        }
      }
      renderer.render(scene, camera)
      canvas.style.filter = fade > 0 ? `brightness(${1 - fade})` : 'none'
      if (gs.time !== hudStamp || fade > 0.9) { hudStamp = gs.time; syncHud(gs) }
    }
    last = performance.now()
    raf = requestAnimationFrame(frame)

    // --------------------------------------------------- DEV hook + kit ----
    if (import.meta.env.DEV) {
      window.__mystTest = {
        state: () => gs,
        action: (a) => { doAction(a); return gs.message },
        click: (id) => doClick(id),
        solve: () => { gs = runSolver(freshState(gs.seed)); syncStars(); gotoNode(gs.node); aim(); hudStamp = -1; if (gs.ending) setMode('ending'); return gs.ending },
        script: () => solveScript(gs.codes),
        codes: () => ({ seed: gs.seed, ...gs.codes }),
        stars: () => { const out = []; root.traverse((o) => { if (o.userData && o.userData.trueStar != null) out[o.userData.trueStar] = +o.scale.x.toFixed(3) }); return out },
        fresh: (seed) => { gs = freshState(seed); storeSeed(gs.seed); syncStars(); gotoNode('dock'); aim(); sing = null; singRingRef.current = -1; setSingRing(-1); return gs.seed },
        goto: (id) => { gs.node = id; gs.turn = 0; gotoNode(id); aim(); hudStamp = -1; return gs.node },
        notebook: () => ({ stored: loadSeed(), current: gs.seed }),
        sing: () => ({ ring: singRingRef.current, ticks: sing ? sing.ticks : null }),
        nearRocket: () => {
          let s = freshState(gs.seed)
          for (const a of solveScript(s.codes)) { s = dispatch(s, a).state; if (s.flags.obsNote) break }
          for (const a of [{ t: 'move', id: 'retStoneObs' }, { t: 'move', id: 'retStoneDeck' }, { t: 'move', id: 'retStoneship' }, { t: 'click', id: 'ladderDown' }]) s = dispatch(s, a).state
          gs = s; gotoNode(gs.node); aim(); hudStamp = -1
          return { node: gs.node, obsNote: !!gs.flags.obsNote }
        },
        // #1014 — park on the star terrace with the wheel untouched, so the
        // harness can drive the rings for real and watch the hub answer.
        nearWheel: () => {
          let s = freshState(gs.seed)
          for (const a of solveScript(s.codes)) { s = dispatch(s, a).state; if (s.node === 'chanWheel' && s.flags.pageRed_channelwood) break }
          s = { ...s, flags: { ...s.flags, chanFlood: true }, node: 'chanWheel', turn: 0 }
          gs = s; gotoNode(gs.node); aim(); hudStamp = -1
          return { node: gs.node, target: [...gs.codes.wheel], dial: [...gs.wheelDial], open: !!gs.flags.wheelOpen }
        },
        wheel: () => ({ dial: [...gs.wheelDial], target: [...gs.codes.wheel], open: !!gs.flags.wheelOpen, panel: gs.panelOpen }),
        // #1024 — park in the control room at the SPECTATOR. 'all' thaws every
        // lens (a returning explorer); the default keeps only what the walk to
        // Mechanical discovered, so the harness sees sealed lenses too.
        nearSpectator: (mode) => {
          let s = freshState(gs.seed)
          for (const a of solveScript(s.codes)) {
            s = dispatch(s, a).state
            if (a.t === 'closePanel' && s.node === 'mechRoom') break
          }
          s = { ...s, node: 'mechRoom', turn: 0 }
          if (mode === 'all') {
            s = { ...s, flags: { ...s.flags, link_selenitic: true, link_stoneship: true, link_channelwood: true } }
          }
          gs = s; gotoNode(gs.node); aim(); hudStamp = -1
          return { node: gs.node, views: spectatorViews(gs) }
        },
        visions: () => ({ panel: gs.panelOpen, clock: wt, views: spectatorViews(gs).map((v) => ({ ...v, live: !!visionRefs.current[v.age] })) }),
        visionSig: (age) => {
          const cv = visionRefs.current[age]
          if (!cv) return null
          const w = cv.width, h = cv.height
          const d = cv.getContext('2d').getImageData(0, 0, w, h).data
          const cx = w / 2, cy = h / 2, rr2 = (Math.min(w, h) * 0.48 * 0.82) ** 2
          let sum = 0, lit = 0
          for (let i = 0; i < d.length; i += 16) {
            sum = (sum * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) >>> 0
            const px = i / 4 % w, py = Math.floor(i / 4 / w)
            const chroma = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2])
            if ((px - cx) ** 2 + (py - cy) ** 2 < rr2 && chroma > 24) lit++
          }
          return { sum, lit, t: wt }
        },
        clueStars: () => { const out = []; root.traverse((o) => { if (o.userData && o.userData.clueStar != null) out[o.userData.clueStar] = o.geometry.attributes.position.count }); return out },
        probe: () => ({ node: gs.node, nodeCount: NODE_IDS.length, flags: Object.keys(gs.flags), pages: Object.keys(gs.pages), placed: gs.placed, ending: gs.ending, ride: gs.ride }),
        rocket: () => ({ ride: gs.ride, rideT: gs.rideT, h: rocketH(gs.ride, gs.rideT), dark: darkAt(gs.ride, gs.rideT) }),
        // Audit every node's framing against its caption: the camera must sit
        // OUTSIDE all solids, no single surface may fill >=80% of the view, and
        // the caption's landmark must be in frame (visible, not occluded).
        views: (overrides) => {
          root.updateMatrixWorld(true)
          const cam = new THREE.PerspectiveCamera(72, VW / VH, 0.1, 2000)
          const ray = new THREE.Raycaster()
          const isEnv = (m) => !!m.userData.sky || (m.material && m.material.side === THREE.BackSide) || m.geometry.type === 'PlaneGeometry' || m.geometry.type === 'CircleGeometry'
          const label = (m) => (m && (m.userData.landmark || m.userData.spot || m.geometry.type)) || null
          const COLS = 10, ROWS = 6
          const out = {}
          NODE_IDS.forEach((id, idx) => {
            const n = Object.assign({}, NODES[id], overrides && overrides[id])
            const g = root.children[idx]
            const meshes = []
            g.traverse((o) => { if (o.isMesh) meshes.push(o) })
            const solid = meshes.filter((m) => !isEnv(m))
            const camPos = new THREE.Vector3(idx * GAP + n.pos[0], n.pos[1], n.pos[2])
            cam.position.copy(camPos)
            cam.rotation.set(0.02, Math.PI + THREE.MathUtils.degToRad(n.yaw), 0)
            cam.updateMatrixWorld(true)
            // buried: camera point inside a solid volume (room shells are BackSide -> the
            // player is meant to be inside them, so they are excluded from `solid`). Only
            // boxes are tested: the "inside a block" bug is a buried camera, and boxes are
            // where the island's rock/plank/building volume lives (rings/rooms are the hole).
            let buried = null
            for (const m of solid) {
              if (m.geometry.type !== 'BoxGeometry') continue
              m.updateWorldMatrix(true, false)
              const lp = camPos.clone().applyMatrix4(m.matrixWorld.clone().invert())
              if (!m.geometry.boundingBox) m.geometry.computeBoundingBox()
              if (m.geometry.boundingBox && m.geometry.boundingBox.containsPoint(lp)) { buried = m; break }
            }
            // view grid: first hit per cell over ALL meshes (occlusion-aware)
            const cnt = {}
            let dom = null
            for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) {
              const u = ((i + 0.5) / COLS) * 2 - 1
              const v = -(((j + 0.5) / ROWS) * 2 - 1)
              ray.setFromCamera(new THREE.Vector2(u, v), cam)
              const h = ray.intersectObjects(meshes, false)[0]
              if (!h || isEnv(h.object)) continue
              cnt[h.object.uuid] = (cnt[h.object.uuid] || 0) + 1
              if (dom === null || cnt[h.object.uuid] > cnt[dom]) dom = h.object.uuid
            }
            const maxFrac = dom ? cnt[dom] / (COLS * ROWS) : 0
            const domMesh = dom ? meshes.find((m) => m.uuid === dom) : null
            // the caption's landmark(s) in frame: a tagged mesh the camera sees before any occluder
            const expect = n.expect || []
            const lm = meshes.filter((m) => m.userData.landmark && expect.includes(m.userData.landmark))
            let landmarkSeen = expect.length === 0
            let dbgFirst = null
            const inFrustum = (c) => c.clone().applyMatrix4(cam.matrixWorldInverse).z < 0
            for (const m of lm) {
              m.updateWorldMatrix(true, false)
              const c = new THREE.Vector3()
              m.getWorldPosition(c)
              const dir = c.clone().sub(camPos)
              if (dir.lengthSq() < 1e-6) continue
              if (!inFrustum(c)) continue
              dir.normalize()
              ray.set(camPos, dir)
              const h = ray.intersectObjects(meshes, false)[0]
              if (dbgFirst === null && h) dbgFirst = label(h.object)
              if (h && h.object === m) { landmarkSeen = true; break }
            }
            out[id] = {
              buried: !!buried,
              buriedMesh: buried ? label(buried) : null,
              maxFrac: Math.round(maxFrac * 100) / 100,
              dominant: domMesh ? label(domMesh) : null,
              expect,
              landmarkSeen,
              dbgFirst,
              pass: !buried && maxFrac < 0.8 && landmarkSeen,
            }
          })
          return out
        },
      }
      mountDbg({
        title: 'MYST',
        getState: () => [`node ${gs.node} turn ${gs.turn}`, `pages held ${Object.keys(gs.pages).length} · red ${gs.placed.red} blue ${gs.placed.blue}`, gs.message.slice(0, 80)],
        actions: [
          { label: 'PROGNOSIS', run: () => { const w = runSolver(); return w.ending === 'atrus' ? 'puzzles still winnable from scratch' : 'NOT winnable' } },
          { label: 'all pages', run: () => { AGE_LIST.forEach((a) => { gs.pages[`red:${a}`] = true; gs.pages[`blue:${a}`] = true }); return 'eight pages in hand' } },
          { label: 'goto library', run: () => { gs.node = 'library'; gotoNode('library'); aim(); hudStamp = -1; return 'library' } },
          { label: 'white page', run: () => { gs.flags.whitePage = true; return 'the white page appears' } },
        ],
      })
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mystclose', onCloseEv)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('virtualcontrols', onPad)
      canvas.removeEventListener('pointerdown', onPointer)
      canvas.removeEventListener('pointermove', onMove)
      if (import.meta.env.DEV) { unmountDbg(); delete window.__mystTest }
      renderer.dispose()
      if (canvas.parentNode === wrap) wrap.removeChild(canvas)
    }
  }, [setMode])

  useEffect(() => { pausedRef.current = paused }, [paused])

  const dots = (n) => '●'.repeat(n) + '○'.repeat(Math.max(0, 4 - n))
  const heldBy = (c) => AGE_LIST.filter((a) => hud.pages?.[`${c}:${a}`])

  return (
    <div className="relative w-full h-full bg-black overflow-hidden font-mono select-none">
      <div ref={stageRef} className="absolute inset-0" />

      {screen === 'play' && !hud.ending && (
        <>
          <div className="absolute top-0 left-0 right-0 flex justify-between px-4 py-1 text-[11px] tracking-widest text-amber-100/80 pointer-events-none">
            <div><span className="text-red-400">RED {dots(hud.placed?.red || 0)}</span> <span className="text-blue-300 ml-3">BLUE {dots(hud.placed?.blue || 0)}</span></div>
            <div className="text-right">
              {heldBy('red').length > 0 && <span className="text-red-400 mr-2">holding R:{heldBy('red').length}</span>}
              {heldBy('blue').length > 0 && <span className="text-blue-300 mr-2">holding B:{heldBy('blue').length}</span>}
              {AGE_LIST.filter((a) => hud.links?.[a]).map((a) => <span key={a} className="text-emerald-300/70 mr-2 uppercase">{a}</span>)}
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-4 py-2 text-[13px] text-amber-50/90 min-h-[52px]" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}>
            {hud.message}
          </div>
        </>
      )}

      {hud.panel === 'safe' && screen === 'play' && (
        <Panel title="IRON SAFE — three dials" onClose={() => closeHud(false)}>
          <div className="flex gap-6 justify-center my-2">
            {[0, 1, 2].map((i) => (
              <button key={i} className="px-4 py-2 border border-amber-500 text-amber-200 text-2xl" onClick={() => ctl.current?.action({ t: 'dial', pad: 'safe', i, v: (Number(hud.dial[i]) + 1) % 10 })}>
                {hud.dial[i]}
              </button>
            ))}
          </div>
          <div className="text-xs text-amber-200/60">tap a dial to click it forward · A / Enter closes</div>
        </Panel>
      )}
      {hud.panel === 'sphere' && screen === 'play' && (
        <Panel title="THE SPHERE — four ring dials" onClose={() => closeHud(false)}>
          <div className="flex gap-4 justify-center my-2 items-center">
            {(hud.sphere || []).map((v, i) => (
              <button key={i} className={`px-3 py-2 border text-xl ${singRing === i ? 'border-amber-300 bg-emerald-500/40 text-amber-100' : 'border-emerald-500 text-emerald-200'}`} onClick={() => { sfxTone((v + 1) % 4); ctl.current?.action({ t: 'dial', pad: 'sphere', i }) }}>
                {v < 0 ? '·' : v + 1}
              </button>
            ))}
          </div>
          <div className="text-xs text-emerald-200/60">listen to the four posts, set the rings to match · the ring that lights answers the post that sings</div>
        </Panel>
      )}
      {hud.panel === 'star' && screen === 'play' && (
        <Panel title="STAR PANEL — points of light" onClose={() => closeHud(false)}>
          <div className="flex gap-4 justify-center my-2">
            {(hud.star || []).map((v, i) => (
              <button key={i} className="px-3 py-2 border border-sky-400 text-sky-200 text-xl" onClick={() => ctl.current?.action({ t: 'dial', pad: 'star', i })}>
                {'✦'.repeat(v || 0) || '·'}
              </button>
            ))}
          </div>
          <div className="text-xs text-sky-200/60">the dome over the panel holds this save's four true stars — set each dial to its star's size</div>
        </Panel>
      )}
      {hud.panel === 'wheel' && screen === 'play' && (
        <Panel title="THE STAR WHEEL — three rings of stars" onClose={() => closeHud(false)}>
          <div className="flex gap-4 justify-center my-2">
            {(hud.wheel || new Array(WHEEL_RINGS).fill(0)).map((v, i) => (
              <button key={i} className="px-3 py-2 border border-teal-400 text-teal-100" onClick={() => ctl.current?.action({ t: 'dial', pad: 'wheel', i })}>
                <span className="block text-[10px] uppercase tracking-widest text-teal-300/70">{['outer', 'middle', 'inner'][i]}</span>
                <span className="block text-lg leading-tight">✦ {WHEEL_POINTS[v]}pt</span>
              </button>
            ))}
          </div>
          <div className="text-xs text-teal-200/60">click a ring to turn it one notch · the drum in the observatory keeps this island's sky: outer, middle, inner — the points must match the stars · A / Enter closes</div>
        </Panel>
      )}
      {hud.panel === 'switches' && screen === 'play' && (
        <Panel title="SWITCH PANEL — five iron levers" onClose={() => closeHud(false)}>
          <div className="flex gap-4 justify-center my-2">
            {(hud.switches || []).map((v, i) => (
              <button key={i} className={`px-3 py-3 border text-lg ${v ? 'bg-amber-500/40 border-amber-300 text-amber-100' : 'border-zinc-500 text-zinc-400'}`} onClick={() => ctl.current?.action({ t: 'toggle', i })}>
                {v ? '▲' : '▼'}
              </button>
            ))}
          </div>
          <div className="text-xs text-amber-200/60">each lever throws its neighbours too — light them all</div>
        </Panel>
      )}
      {hud.panel === 'spectator' && screen === 'play' && (
        <Panel title="THE SPECTATOR — a sphere of other ages" onClose={() => closeHud(false)}>
          <div className="my-2 text-sm min-h-[3rem] text-sky-200">{hud.message}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 justify-items-center mb-1">
            {(hud.visions || []).map((v) => (
              <div key={v.age} className="text-center">
                <canvas
                  ref={(el) => { visionRefs.current[v.age] = el }}
                  data-vision={v.age}
                  data-unlocked={v.unlocked ? '1' : '0'}
                  width={152}
                  height={114}
                  className="block"
                />
                <div className={`text-[10px] uppercase tracking-widest mt-1 ${v.unlocked ? 'text-amber-200/80' : 'text-zinc-500'}`}>
                  {v.unlocked ? v.age : 'sealed'}
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs text-sky-200/60">ages, all of them — worlds inside books · a lens clears when you walk its age · A / Enter closes</div>
        </Panel>
      )}
      {hud.panel === 'soundbook' && screen === 'play' && (
        <Panel title="THE SOUND-BOOK — six painted pages" onClose={() => closeHud(false)}>
          <div className="flex gap-3 justify-center my-2 items-baseline">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <button key={i} className="px-2 py-2 border border-emerald-600 text-emerald-200" style={{ fontSize: `${26 - i * 3}px` }} onClick={() => ctl.current?.action({ t: 'echo', i })}>
                ●
              </button>
            ))}
          </div>
          <div className="text-xs text-emerald-200/60">biggest stone, lowest note — the path's order, page by page · A / Enter closes</div>
        </Panel>
      )}
      {hud.book && screen === 'play' && (
        <Panel title={hud.book === 'red' ? 'THE RED BOOK — Sirrus' : 'THE BLUE BOOK — Achenar'} onClose={() => closeHud(false)}>
          <div className={`my-2 text-sm min-h-[3rem] ${hud.book === 'red' ? 'text-red-300' : 'text-blue-200'}`} style={{ filter: `blur(${Math.max(0, (1 - (hud.placed[hud.book] || 0) / 4))}px)` }}>
            {hud.message}
          </div>
          <div className="text-xs text-zinc-400">pages returned: {dots(hud.placed[hud.book] || 0)} · the words clear as the pages come home</div>
        </Panel>
      )}

      {screen === 'attract' && (
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-black/80 flex flex-col items-center justify-center text-center p-6">
          <h1 className="text-6xl font-bold tracking-[0.5em] text-amber-100 drop-shadow-[0_0_18px_rgba(255,190,90,0.6)] mb-8">MYST</h1>
          <AttractMessage className="mb-8 text-amber-200/70 max-w-xl tracking-wide" messages={MESSAGES} />
          <p className="text-lg animate-pulse text-amber-300">{PRESS}</p>
        </div>
      )}

      {screen === 'ending' && (
        <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center text-center p-8">
          <h1 className={`text-3xl font-bold mb-4 ${hud.ending === 'atrus' || hud.ending === 'surface' ? 'text-emerald-300' : 'text-red-400'}`}>
            {hud.ending === 'atrus' ? 'ATRUS COMES HOME' : hud.ending === 'surface' ? 'YOU LEAVE MYST' : hud.ending === 'sirrus' ? 'SIRRUUS IS FREE — AND YOU ARE NOT' : 'ACHENAR IS FREE — AND YOU ARE NOT'}
          </h1>
          <p className="text-amber-50/80 max-w-lg mb-8">{hud.message}</p>
          <p className="text-amber-300 animate-pulse">SPACE / TAP — LINK TO MYST AGAIN</p>
        </div>
      )}

      <VirtualControls visible={screen === 'play' && !paused} secondAction={{ label: '↺', code: 'KeyX' }} />

      {paused && (
        <PauseOverlay
          game={GAMES.find((g) => g.label === 'MYST') || { label: 'MYST', description: '', controls: [] }}
          onResume={() => { pausedRef.current = false; setPaused(false) }}
        />
      )}
    </div>
  )
}

function closeHud(book) { window.dispatchEvent(new CustomEvent('mystclose', { detail: { book: !!book } })) }
function Panel({ title, children, onClose }) {
  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-40" onPointerDown={onClose}>
      <div className="bg-zinc-900 border-2 border-amber-600/70 rounded-lg px-6 py-4 max-w-md text-center" onPointerDown={(e) => e.stopPropagation()}>
        <h2 className="text-amber-300 text-sm tracking-widest mb-1">{title}</h2>
        {children}
      </div>
    </div>
  )
}

export default MystGame

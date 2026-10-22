// EMBERWOOD — HD-2D renderer: pixel sprites and tiles on a lit 3D diorama.
//
// Coordinate convention: X = east (tileX*TS), Y = south (tileY*TS), Z = height.
// The camera perches south-above and looks north-down (Octopath's tilted stage).
// A +Z-up stage viewed from above with camera.up=(0,-1,0) puts north on top but
// mirrors the X axis (screen-right = world west), so every view-space x passes
// through FX() — east reads right on screen, matching the tile data (#772).
// Floor planes keep their default +Z normal (they face the sky); blob shadows
// lie flat on them. Sprites billboard to the camera. Post chain: bright → blur →
// bloom, big-radius soft blur mixed by tilt-shift focus on the hero, vignette.
// `?lite=1` skips post + shadows.

import * as THREE from 'three'
import { SCREENS, TS, SW, SH, tileAt } from './world.js'

const WALL_H = 12
const FX = (x) => SW * TS - x

const SOLID_H = { '#': WALL_H, 'T': 2, 'H': WALL_H, 'R': WALL_H, '=': 5, 'I': 3 }

export function createRenderer(canvas, { lite = false, width = 480, height = 288 } = {}) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true })
    renderer.setPixelRatio(1)
    renderer.setSize(width, height, false)
    renderer.shadowMap.enabled = !lite
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.35

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#1a1626')

    const aspect = width / height
    const viewH = 210
    const camera = new THREE.OrthographicCamera(-viewH * aspect / 2, viewH * aspect / 2, viewH / 2, -viewH / 2, 1, 900)
    const CAM_Y = 88 + 120 // perch south of the screen centre
    camera.position.set(128, CAM_Y, 150)
    camera.up.set(0, -1, 0)
    camera.lookAt(128, 88, 2)

    const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3c3226, 1.15)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xffd9a0, 2.4)
    sun.position.set(FX(-80), 200, 150)
    sun.target.position.set(128, 88, 0)
    if (!lite) {
        sun.castShadow = true
        sun.shadow.mapSize.set(1024, 1024)
        sun.shadow.camera.left = -180; sun.shadow.camera.right = 180
        sun.shadow.camera.top = 180; sun.shadow.camera.bottom = -180
        sun.shadow.camera.near = 1; sun.shadow.camera.far = 600
        sun.shadow.bias = -0.0018
    }
    scene.add(sun); scene.add(sun.target)
    const lantern = new THREE.PointLight(0xffb36b, 0, 90, 1.4)
    scene.add(lantern)
    const torchLights = []
    for (let i = 0; i < 4; i++) {
        const l = new THREE.PointLight(0xff9a3c, 0, 72, 1.3)
        scene.add(l); torchLights.push(l)
    }

    const makeTex = (cnv) => {
        const t = new THREE.CanvasTexture(cnv)
        t.magFilter = THREE.NearestFilter
        t.minFilter = THREE.NearestFilter
        t.generateMipmaps = false
        t.colorSpace = THREE.SRGBColorSpace
        return t
    }
    let TEX = null
    const texCache = new Map()
    const T = (key) => {
        if (!TEX) return null
        const raw = key.split('/').reduce((o, k) => o && o[k], TEX)
        if (!raw) return null
        if (!texCache.has(key)) texCache.set(key, makeTex(raw))
        return texCache.get(key)
    }

    const mkRT = (w, h, srgb = false) => {
        const rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter })
        if (srgb) rt.texture.colorSpace = THREE.SRGBColorSpace
        return rt
    }
    const rtScene = mkRT(width, height, true)
    const rtA = mkRT(width / 2, height / 2)
    const rtB = mkRT(width / 2, height / 2)
    const rtC = mkRT(width / 2, height / 2)
    const rtD = mkRT(width / 2, height / 2)
    const quadGeo = new THREE.PlaneGeometry(2, 2)
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad = new THREE.Mesh(quadGeo, null)
    const quadScene = new THREE.Scene()
    quadScene.add(quad)

    const VS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }'
    const brightMat = new THREE.ShaderMaterial({
        uniforms: { tSrc: { value: null } },
        vertexShader: VS,
        fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; void main(){ vec3 c=texture2D(tSrc,vUv).rgb; float l=dot(c,vec3(.25,.6,.15)); gl_FragColor=vec4(c*smoothstep(0.55,0.92,l),1.0); }',
    })
    const blurMat = new THREE.ShaderMaterial({
        uniforms: { tSrc: { value: null }, dir: { value: new THREE.Vector2(1, 0) }, r: { value: 1.0 } },
        vertexShader: VS,
        fragmentShader: 'uniform sampler2D tSrc; uniform vec2 dir; uniform float r; varying vec2 vUv; void main(){ vec2 px=dir*r/vec2(480.0,288.0); vec3 s=texture2D(tSrc,vUv).rgb*0.227; s+=texture2D(tSrc,vUv+px*1.384).rgb*0.316; s+=texture2D(tSrc,vUv-px*1.384).rgb*0.316; s+=texture2D(tSrc,vUv+px*3.230).rgb*0.070; s+=texture2D(tSrc,vUv-px*3.230).rgb*0.070; gl_FragColor=vec4(s,1.0); }',
    })
    const compMat = new THREE.ShaderMaterial({
        uniforms: { tScene: { value: null }, tBloom: { value: null }, tSoft: { value: null }, focus: { value: new THREE.Vector2(0.5, 0.5) } },
        vertexShader: VS,
        fragmentShader: `
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tSoft;
uniform vec2 focus; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tScene, vUv).rgb;
  c += texture2D(tBloom, vUv).rgb * 0.7;
  float f = smoothstep(0.16, 0.42, distance(vUv, focus));
  c = mix(c, texture2D(tSoft, vUv).rgb, f * 0.5);
  float v = 1.0 - 0.4 * pow(length(vUv - 0.5) * 1.42, 2.2);
  c *= clamp(v, 0.55, 1.0);
  gl_FragColor = vec4(c, 1.0);
}`,
    })

    let screenGroup = new THREE.Group()
    scene.add(screenGroup)
    let currentScreen = null
    let structureSig = ''
    const staticMeshes = []
    const dynamic = { doors: new Map(), cracks: new Map(), chests: new Map(), switches: new Map(), npcs: new Map() }

    const tileTexKey = (ch) => ({
        '.': 'grass', '"': 'tallgrass', ',': 'path', '~': 'water', 'T': 'grass', '#': 'stone',
        '=': 'grass', 'H': 'house', 'R': 'roof', 'I': 'grass', 'C': 'stone', 'S': 'stairs', '<': 'stone', 'A': 'stone',
    }[ch] || 'grass')

    function buildScreen(id, flags, cut) {
        disposeScreen()
        currentScreen = id
        const s = SCREENS[id]
        const dark = !!s.dark
        scene.background = new THREE.Color(dark ? '#0d0b14' : '#22305a')
        hemi.intensity = dark ? 0.5 : 1.15
        sun.intensity = dark ? 0.12 : 2.4
        lantern.intensity = dark ? 4 : 0
        const spots = []
        if (dark) {
            for (const d of s.doors || []) spots.push([d.x, d.y === 0 ? 1 : d.y - 1])
            for (const c of s.chests || []) spots.push([c.x, c.y === 0 ? 1 : c.y - 1])
            spots.push([2, 1], [13, 9])
        }
        spots.slice(0, 4).forEach((p, i) => {
            torchLights[i].position.set(FX(p[0] * TS + 8), p[1] * TS + 8, 10)
            torchLights[i].intensity = dark ? 7 : 0
        })

        const floorGeo = new THREE.PlaneGeometry(TS, TS)
        for (let y = 0; y < SH; y++) {
            for (let x = 0; x < SW; x++) {
                const ch = tileAt(s, x, y)
                const tex = T(tileTexKey(ch))
                const z0 = ch === '~' ? -0.6 : 0
                const m = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ map: tex }))
                m.position.set(FX(x * TS + 8), y * TS + 8, z0)
                m.receiveShadow = !lite
                if (ch === '~') m.material.color.set('#9fc8e8')
                if (ch === '"' && cut && cut[`${id}:${x},${y}`]) m.material.map = T('grass')
                screenGroup.add(m); staticMeshes.push(m)
                if (ch === 'T') {
                    const tr = new THREE.Mesh(new THREE.PlaneGeometry(24, 30), new THREE.MeshLambertMaterial({ map: T('tree'), transparent: true, alphaTest: 0.4 }))
                    tr.quaternion.copy(camera.quaternion)
                    tr.position.set(FX(x * TS + 8), y * TS + 6, 12)
                    screenGroup.add(tr); staticMeshes.push(tr)
                }
                if (ch === 'I') {
                    const sg = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshLambertMaterial({ map: T('sign'), transparent: true, alphaTest: 0.4 }))
                    sg.quaternion.copy(camera.quaternion)
                    sg.position.set(FX(x * TS + 8), y * TS + 6, 8)
                    screenGroup.add(sg); staticMeshes.push(sg)
                }
                if (ch === '<') {
                    const pt = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: T('portal'), transparent: true }))
                    pt.position.set(FX(x * TS + 8), y * TS + 8, 0.2)
                    screenGroup.add(pt); staticMeshes.push(pt)
                }
                const h = SOLID_H[ch]
                if (h && ch !== 'T' && ch !== 'I' && ch !== '<' && ch !== 'C') {
                    const topKey = ch === '#' ? 'wallTop' : (ch === 'H' || ch === 'R' ? 'roof' : (ch === '=' ? 'fence' : 'rock'))
                    const box = new THREE.Mesh(new THREE.BoxGeometry(TS, TS, h), new THREE.MeshLambertMaterial({ map: ch === '#' ? T('wall') : (ch === '=' ? T('fence') : T(topKey)), color: ch === '#' ? '#9a95ad' : 0xffffff }))
                    box.position.set(FX(x * TS + 8), y * TS + 8, h / 2)
                    if (!lite) { box.castShadow = true; box.receiveShadow = true }
                    screenGroup.add(box); staticMeshes.push(box)
                }
            }
        }
        for (const p of s.plates || []) {
            const ring = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: T('plate'), transparent: true, color: 0xc9a24a }))
            ring.position.set(FX(p.x * TS + 8), p.y * TS + 8, 0.15)
            screenGroup.add(ring); staticMeshes.push(ring)
        }
        for (const sw of s.switches || []) {
            const plaque = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshLambertMaterial({ map: T('switchP') }))
            plaque.position.set(FX(sw.x * TS + 8), sw.y * TS + 8, 8)
            screenGroup.add(plaque); staticMeshes.push(plaque)
            dynamic.switches.set(sw.id, plaque)
        }
        for (const c of s.chests || []) {
            const ch2 = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), new THREE.MeshLambertMaterial({ map: T('chest/closed'), transparent: true, alphaTest: 0.4 }))
            ch2.quaternion.copy(camera.quaternion)
            ch2.position.set(FX(c.x * TS + 8), c.y * TS + 8, 6)
            screenGroup.add(ch2); staticMeshes.push(ch2)
            dynamic.chests.set(c.id, ch2)
        }
        for (const d of s.doors || []) {
            const box = new THREE.Mesh(new THREE.BoxGeometry(TS, TS, WALL_H), new THREE.MeshLambertMaterial({ map: T(d.kind === 'bigkey' ? 'doorBig' : 'door') }))
            box.position.set(FX(d.x * TS + 8), d.y * TS + 8, WALL_H / 2)
            if (!lite) box.castShadow = true
            screenGroup.add(box); staticMeshes.push(box)
            dynamic.doors.set(d.id, box)
        }
        for (const cr of s.cracks || []) {
            const box = new THREE.Mesh(new THREE.BoxGeometry(TS, TS, WALL_H), new THREE.MeshLambertMaterial({ map: T('crack') }))
            box.position.set(FX(cr.x * TS + 8), cr.y * TS + 8, WALL_H / 2)
            if (!lite) box.castShadow = true
            screenGroup.add(box); staticMeshes.push(box)
            dynamic.cracks.set(cr.id, box)
        }
        for (const n of s.npcs || []) {
            const cnv = document.createElement('canvas'); cnv.width = 14; cnv.height = 18
            const g = cnv.getContext('2d')
            g.fillStyle = n.kind === 'shop' ? '#a04a3c' : '#7a6a8a'; g.fillRect(3, 6, 8, 8)
            g.fillStyle = '#e8b48a'; g.fillRect(4, 1, 6, 5)
            g.fillStyle = n.kind === 'shop' ? '#3c2c1c' : '#cfc8dc'; g.fillRect(3, 0, 8, 2)
            const nn = new THREE.Mesh(new THREE.PlaneGeometry(14, 18), new THREE.MeshLambertMaterial({ map: makeTex(cnv), transparent: true, alphaTest: 0.4 }))
            nn.quaternion.copy(camera.quaternion)
            nn.position.set(FX(n.x * TS + 8), n.y * TS + 8, 9)
            screenGroup.add(nn); staticMeshes.push(nn)
            dynamic.npcs.set(n.id, nn)
        }
    }

    function disposeScreen() {
        const cached = new Set(texCache.values())
        screenGroup.traverse(o => {
            if (o.geometry) o.geometry.dispose()
            if (o.material) { if (o.material.map && !cached.has(o.material.map)) o.material.map.dispose(); o.material.dispose() }
        })
        scene.remove(screenGroup)
        screenGroup = new THREE.Group()
        scene.add(screenGroup)
        staticMeshes.length = 0
        dynamic.doors.clear(); dynamic.cracks.clear(); dynamic.chests.clear(); dynamic.switches.clear(); dynamic.npcs.clear()
    }

    // ---- entity billboards ----
    const billboards = []
    const mkBillboard = (w, h) => {
        const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
        m.quaternion.copy(camera.quaternion)
        scene.add(m)
        const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.5), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }))
        scene.add(shadow)
        const b = { mesh: m, shadow, mat, texKey: '' }
        billboards.push(b)
        return b
    }
    const heroBB = mkBillboard(16, 18)
    // ---- sword swipe arc: additive crescent that sweeps in the facing direction ----
    const ARC_DUR = 12
    const ARC_DIRS = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }
    const ARC_DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
    const arcCnv = document.createElement('canvas'); arcCnv.width = 32; arcCnv.height = 32
    {
        const g = arcCnv.getContext('2d')
        g.clearRect(0, 0, 32, 32)
        g.lineCap = 'round'
        g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 4
        g.beginPath(); g.arc(16, 23, 15, Math.PI * 1.12, Math.PI * 1.88); g.stroke()
        g.strokeStyle = 'rgba(255,244,210,1)'; g.lineWidth = 2
        g.beginPath(); g.arc(16, 23, 15, Math.PI * 1.18, Math.PI * 1.82); g.stroke()
    }
    const arcMat = new THREE.MeshBasicMaterial({ map: makeTex(arcCnv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })
    const arcMesh = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), arcMat)
    arcMesh.quaternion.copy(camera.quaternion)
    arcMesh.visible = false
    scene.add(arcMesh)
    const bbPool = []
    for (let i = 0; i < 12; i++) bbPool.push(mkBillboard(16, 16))
    const projPool = []
    for (let i = 0; i < 10; i++) projPool.push(mkBillboard(12, 8))
    const dropPool = []
    for (let i = 0; i < 14; i++) dropPool.push(mkBillboard(10, 10))
    const bombPool = []
    for (let i = 0; i < 4; i++) bombPool.push(mkBillboard(10, 12))
    const blockBBs = []
    for (let i = 0; i < 2; i++) {
        const b = mkBillboard(14, 14)
        const cnv = document.createElement('canvas'); cnv.width = 14; cnv.height = 14
        const g = cnv.getContext('2d')
        g.fillStyle = '#6e6a7e'; g.fillRect(1, 1, 12, 12)
        g.fillStyle = '#84809a'; g.fillRect(2, 2, 10, 4)
        g.strokeStyle = '#3f3c4c'; g.strokeRect(1.5, 1.5, 11, 11)
        b.mat.map = makeTex(cnv); b.mat.needsUpdate = true
        blockBBs.push(b)
    }

    const setTex = (b, key) => {
        if (b.texKey === key) return
        const t = T(key)
        if (t) { b.mat.map = t; b.mat.needsUpdate = true; b.texKey = key }
    }

    // ---- particles ----
    const PARTS = 90
    const parts = []
    const partGeo = new THREE.PlaneGeometry(3, 3)
    for (let i = 0; i < PARTS; i++) {
        const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }))
        m.visible = false
        scene.add(m)
        parts.push({ m, life: 0, vx: 0, vy: 0, vz: 0 })
    }
    let partIdx = 0
    function spawnParts(x, y, colors, n, spread = 2.4, up = 1.6) {
        for (let i = 0; i < n; i++) {
            const p = parts[partIdx]; partIdx = (partIdx + 1) % PARTS
            p.m.visible = true
            p.m.material.color.set(colors[Math.floor(Math.random() * colors.length)])
            p.m.position.set(FX(x), y, 6 + Math.random() * 8)
            p.vx = (Math.random() - 0.5) * spread
            p.vy = (Math.random() - 0.5) * spread
            p.vz = Math.random() * up
            p.life = 18 + Math.random() * 18
        }
    }
    const JUICE = { hit: ['#ffd27a', '#ff9a3c'], blood: ['#8a4030', '#c96a4a'], cut: ['#8cc45f', '#b7e08a'], boom: ['#ffd27a', '#ff9a3c', '#ff5a2a'], coin: ['#ffe08a', '#ffb238'], magic: ['#8ce0ff', '#bff2ff'] }

    let shake = 0
    function onFx(events) {
        if (!events || !events.length) return
        for (const e of events) {
            switch (e.k) {
                case 'sword': spawnParts(e.x + (e.dir === 'left' ? -8 : e.dir === 'right' ? 8 : 0), e.y + (e.dir === 'down' ? 8 : e.dir === 'up' ? -8 : 0), ['#ffffff', '#ffd87a'], 3, 1.4, 1); break
                case 'hit': spawnParts(e.x, e.y, JUICE.hit, 7); shake = Math.max(shake, 3); break
                case 'die': spawnParts(e.x, e.y, JUICE.blood, 12); shake = Math.max(shake, 4); break
                case 'cut': spawnParts(e.x, e.y, JUICE.cut, 6, 1.8, 1.2); break
                case 'boom': spawnParts(e.x, e.y, JUICE.boom, 26, 4.5, 3); shake = Math.max(shake, 7); break
                case 'crack': spawnParts(e.x, e.y, ['#8d8999', '#4e4a5a', '#ffd27a'], 16, 3.5, 2.4); break
                case 'coin': spawnParts(e.x, e.y, JUICE.coin, 4, 1.2, 1.4); break
                case 'heart': spawnParts(e.x, e.y, ['#ff8896', '#e8384a'], 5, 1.4, 1.4); break
                case 'key': case 'unlock': spawnParts(e.x, e.y, ['#e8c24a', '#fff3cf'], 8, 2, 1.6); break
                case 'switch': spawnParts(e.x, e.y, ['#c9a24a', '#ffe08a'], 10, 2.2, 1.8); break
                case 'shoot': spawnParts(e.x, e.y, ['#e8e2d0'], 2, 1, 0.6); break
                case 'spit': spawnParts(e.x, e.y, JUICE.magic, 4, 1.6, 1); break
                case 'hurt': shake = Math.max(shake, 6); break
                case 'clank': spawnParts(e.x, e.y, ['#ffffff', '#cfd6e6'], 5, 2, 1.2); break
                case 'stagger': spawnParts(e.x, e.y, ['#ff9a3c', '#ffd27a', '#ffffff'], 22, 4, 3); shake = Math.max(shake, 8); break
                case 'pop': spawnParts(e.x, e.y, JUICE.cut, 6, 2, 1.4); break
                case 'warp': spawnParts(e.x, e.y, ['#8ce0ff', '#bff2ff'], 12, 2.4, 2); break
                case 'grant': spawnParts(e.x, e.y, ['#ffd27a', '#fff3cf', '#8ce0ff'], 14, 2.6, 2.2); break
            }
        }
    }

    const probeLight = (x, y, dark) => {
        if (!dark) return 1
        let v = 0.5
        for (const l of torchLights) {
            if (l.intensity <= 0) continue
            const d = Math.hypot(l.position.x - FX(x), l.position.y - y)
            v += Math.max(0, 1 - d / 70) * 1.6
        }
        const dl = Math.hypot(lantern.position.x - FX(x), lantern.position.y - y)
        v += Math.max(0, 1 - dl / 66) * 0.9
        return Math.min(1.3, v)
    }

    const simFocus = [128, 88]
    let waterTime = 0

    function sync(sim, tSec) {
        if (!TEX) return
        const dark = !!SCREENS[sim.screen]?.dark
        const sig = sim.screen + '|' + Object.keys(sim.flags.cracked).length + '|' + Object.keys(sim.flags.doorsOpen).length + '|' + Object.keys(sim.flags.chestsOpen).length
        if (sig !== structureSig || sim.screen !== currentScreen) {
            buildScreen(sim.screen, sim.flags, sim.cut)
            structureSig = sig
            for (const [cid, mesh] of dynamic.chests) if (sim.flags.chestsOpen[cid]) { mesh.material.map = T('chest/open'); mesh.material.needsUpdate = true }
            for (const [did, mesh] of dynamic.doors) if (sim.flags.doorsOpen[did]) mesh.visible = false
            for (const [kid, mesh] of dynamic.cracks) if (sim.flags.cracked[kid]) mesh.visible = false
            for (const [sid2, mesh] of dynamic.switches) if (sim.flags.switchesOn[sid2]) mesh.material.color.set('#4aff7a')
        }
        const s = SCREENS[sim.screen]
        for (const d of s.doors || []) {
            const mesh = dynamic.doors.get(d.id)
            if (!mesh) continue
            const open = (d.kind === 'switch' ? !!sim.flags.switchesOn[d.switch] : !!sim.flags.doorsOpen[d.id])
            mesh.visible = !open
        }

        const hx = sim.hero.x, hy = sim.hero.y
        camera.position.x += (FX(128 + (hx - 128) * 0.5) - camera.position.x) * 0.08
        camera.position.y += ((CAM_Y + (hy - 88) * 0.5) - camera.position.y) * 0.08
        const lookX = camera.position.x, lookY = camera.position.y - 120
        camera.lookAt(lookX, lookY, 2)
        if (shake > 0.2) {
            camera.position.x += (Math.random() - 0.5) * shake
            camera.position.y += (Math.random() - 0.5) * shake
            shake *= 0.82
        }
        lantern.position.set(FX(hx), hy, 12)

        const anim = Math.floor(tSec * 7) % 2
        const pose = sim.swing > 0 ? 'slash' : (sim.drawing ? 'draw' : (sim.moving ? 'w' + (anim + 1) : 'w1'))
        setTex(heroBB, `hero/${sim.hero.dir}/${pose}`)
        heroBB.mesh.position.set(FX(hx), hy, 9)
        heroBB.mesh.scale.x = 1
        const hl = probeLight(hx, hy, dark)
        heroBB.mat.color.setRGB(hl, hl, hl)
        if (sim.hero.hurt > 0 && Math.floor(tSec * 14) % 2 === 0) heroBB.mat.color.set('#ff5c5c')
        heroBB.shadow.position.set(FX(hx), hy, 0.12)

        if (sim.arc > 0) {
            const af = sim.arc / ARC_DUR
            const [avx, avy] = ARC_DIRV[sim.arcDir] || [0, -1]
            arcMesh.visible = true
            arcMesh.quaternion.copy(camera.quaternion)
            arcMesh.rotateZ((ARC_DIRS[sim.arcDir] || 0) + (0.5 - af) * 0.9)
            arcMesh.position.set(FX(hx + avx * 11), hy + avy * 11, 10)
            const grow = 0.82 + (1 - af) * 0.4
            arcMesh.scale.set(grow, grow, 1)
            arcMat.opacity = af
            arcMat.color.setRGB(1.15, 1.0, 0.72)
        } else {
            arcMesh.visible = false
        }

        for (let i = 0; i < bbPool.length; i++) {
            const b = bbPool[i]
            const e = sim.enemies[i]
            if (!e || e.dead || e.hidden) { b.mesh.visible = false; b.shadow.visible = false; continue }
            b.mesh.visible = true; b.shadow.visible = true
            let key
            if (e.type === 'bat') key = `bat/${anim}`
            else if (e.type === 'spitter') key = `spitter/${e.t % 60 < 8 ? 1 : 0}`
            else if (e.type === 'husk') key = `husk/${anim}`
            else if (e.type === 'wisp') key = `wisp/${anim}`
            else if (e.type === 'sprig') key = `sprig/${e.hidden ? 0 : 1}`
            else if (e.type === 'maw') key = `maw/${e.open ? 'open' : 'closed'}`
            else if (e.type === 'wyrm') key = `wyrm/${e.open ? 'open' : 'closed'}`
            else key = `cinder/${anim}`
            setTex(b, key)
            b.mesh.scale.set(1, 1, 1)
            if (e.type === 'maw') b.mesh.scale.set(28 / 16, 28 / 16, 1)
            if (e.type === 'wyrm') b.mesh.scale.set(24 / 16, 20 / 16, 1)
            b.mesh.position.set(FX(e.x), e.y, 8 + (e.type === 'bat' || e.type === 'wisp' ? 6 : 0))
            b.mesh.scale.x *= (e.fx > 0.1 ? -1 : 1)
            const el = e.hitT > 0 ? 1.7 : probeLight(e.x, e.y, dark)
            b.mat.color.setRGB(Math.min(1.6, el), e.hitT > 0 ? 1.1 : el, e.hitT > 0 ? 1.1 : el)
            b.mat.opacity = e.type === 'wisp' ? 0.65 + 0.3 * Math.sin(tSec * 6 + e.i) : 1
            b.shadow.position.set(FX(e.x), e.y, 0.12)
            b.shadow.scale.setScalar(e.boss ? 2 : 1)
        }
        const wyrm = sim.enemies.find(en => en.type === 'wyrm' && !en.dead)
        for (let i = 0; i < dropPool.length; i++) {
            const d = dropPool[i]
            if (wyrm && wyrm.seg && i < wyrm.seg.length && i * 3 < wyrm.seg.length) {
                const p = wyrm.seg[i * 3 + 1]
                if (p) {
                    d.mesh.visible = true; setTex(d, 'wyrm/seg')
                    d.mesh.position.set(FX(p.x), p.y, 6); d.mesh.scale.setScalar(1 - i * 0.06)
                    const wl = probeLight(p.x, p.y, dark)
                    d.mat.color.setRGB(wl, wl, wl); d.shadow.visible = false
                    continue
                }
            }
            const dr = sim.drops[i]
            if (!dr) { d.mesh.visible = false; d.shadow.visible = false; continue }
            d.mesh.visible = true; d.shadow.visible = true
            setTex(d, dr.kind === 'ember' ? `ember/${anim}` : dr.kind)
            d.mesh.position.set(FX(dr.x), dr.y, 5 + Math.sin(tSec * 5 + dr.t * 0.1) * 1.5)
            const dl2 = probeLight(dr.x, dr.y, dark)
            d.mat.color.setRGB(dl2, dl2, dl2)
            d.shadow.position.set(FX(dr.x), dr.y, 0.12)
        }
        for (let i = 0; i < projPool.length; i++) {
            const p = projPool[i]
            const pr = sim.projectiles[i]
            if (!pr) { p.mesh.visible = false; p.shadow.visible = false; continue }
            p.mesh.visible = true
            setTex(p, pr.kind === 'arrow' ? 'arrow' : 'orb')
            p.mesh.position.set(FX(pr.x), pr.y, 8)
            p.mesh.rotation.z = Math.atan2(pr.vy, pr.vx)
            const pl = probeLight(pr.x, pr.y, dark)
            p.mat.color.setRGB(pl, pl, pl)
            p.shadow.visible = false
        }
        for (let i = 0; i < bombPool.length; i++) {
            const b = bombPool[i]
            const bb = sim.bombs[i]
            if (!bb) { b.mesh.visible = false; b.shadow.visible = false; continue }
            b.mesh.visible = true; setTex(b, 'bomb')
            const puls = bb.fuse < 22 && Math.floor(tSec * 10) % 2 === 0
            b.mesh.position.set(FX(bb.x), bb.y, 6)
            b.mat.color.setRGB(puls ? 2 : 1, puls ? 1.2 : 1, puls ? 1.2 : 1)
            b.shadow.position.set(FX(bb.x), bb.y, 0.12)
        }
        const blocks = sim.blocks || []
        for (let i = 0; i < blockBBs.length; i++) {
            const b = blockBBs[i]
            const bk = blocks[i]
            if (!bk) { b.mesh.visible = false; b.shadow.visible = false; continue }
            b.mesh.visible = true
            b.mesh.position.set(FX(bk.x * TS + 8), bk.y * TS + 8, 7)
            const bl = probeLight(bk.x * TS + 8, bk.y * TS + 8, dark)
            b.mat.color.setRGB(bl, bl, bl)
            b.shadow.position.set(FX(bk.x * TS + 8), bk.y * TS + 8, 0.12)
        }
        for (const p of parts) {
            if (p.life <= 0) { p.m.visible = false; continue }
            p.life--
            p.m.position.x += p.vx
            p.m.position.y += p.vy
            p.m.position.z += p.vz
            p.vz -= 0.06
            p.m.material.opacity = Math.min(1, p.life / 14)
            p.m.quaternion.copy(camera.quaternion)
        }
        for (const l of torchLights) if (l.intensity > 0) l.intensity = 6.5 + Math.sin(tSec * 11 + l.position.x) * 0.25 + Math.random() * 0.12
    }

    function draw() {
        if (!TEX) return
        waterTime += 0.01
        const wt = texCache.get('water')
        if (wt) { wt.offset.x = Math.sin(waterTime) * 0.06; wt.offset.y = waterTime * 0.05 }
        if (lite) {
            renderer.setRenderTarget(null)
            renderer.render(scene, camera)
            return
        }
        renderer.setRenderTarget(rtScene); renderer.render(scene, camera)
        quad.material = brightMat; brightMat.uniforms.tSrc.value = rtScene.texture
        renderer.setRenderTarget(rtA); renderer.render(quadScene, quadCam)
        quad.material = blurMat
        blurMat.uniforms.r.value = 1
        blurMat.uniforms.tSrc.value = rtA.texture; blurMat.uniforms.dir.value.set(1, 0)
        renderer.setRenderTarget(rtB); renderer.render(quadScene, quadCam)
        blurMat.uniforms.tSrc.value = rtB.texture; blurMat.uniforms.dir.value.set(0, 1)
        renderer.setRenderTarget(rtA); renderer.render(quadScene, quadCam)
        blurMat.uniforms.r.value = 2.2
        blurMat.uniforms.tSrc.value = rtScene.texture; blurMat.uniforms.dir.value.set(1, 0)
        renderer.setRenderTarget(rtC); renderer.render(quadScene, quadCam)
        blurMat.uniforms.tSrc.value = rtC.texture; blurMat.uniforms.dir.value.set(0, 1)
        renderer.setRenderTarget(rtD); renderer.render(quadScene, quadCam)
        quad.material = compMat
        compMat.uniforms.tScene.value = rtScene.texture
        compMat.uniforms.tBloom.value = rtA.texture
        compMat.uniforms.tSoft.value = rtD.texture
        const v = new THREE.Vector3(FX(simFocus[0]), simFocus[1], 0).project(camera)
        compMat.uniforms.focus.value.set((v.x + 1) / 2, (v.y + 1) / 2)
        renderer.setRenderTarget(null)
        renderer.render(quadScene, quadCam)
    }

    function setFocus(x, y) { simFocus[0] = x; simFocus[1] = y }
    function screenPos(x, y, z = 0) {
        const v = new THREE.Vector3(FX(x), y, z).project(camera)
        return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 }
    }
    function loadTex(texObj) { TEX = texObj; texCache.clear() }
    function dispose() {
        disposeScreen()
        billboards.forEach(b => { b.mesh.geometry.dispose(); b.mesh.material.dispose(); b.shadow.geometry.dispose(); b.shadow.material.dispose() })
        parts.forEach(p => { p.m.geometry.dispose(); p.m.material.dispose() })
        rtScene.dispose(); rtA.dispose(); rtB.dispose(); rtC.dispose(); rtD.dispose()
        renderer.dispose()
    }

    return { loadTex, buildScreen, sync, draw, onFx, setFocus, screenPos, dispose, get camera() { return camera } }
}

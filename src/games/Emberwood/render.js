// EMBERWOOD — HD-2D renderer: pixel sprites and tiles on a lit 3D diorama.
// Tilted orthographic stage, real sun + torch lights, cast shadows on extruded
// walls, billboarded pixel entities that catch torchlight, bloom + tilt-shift
// post. Canvas backing store stays small (pixel look); the shell CSS-scales it.

import * as THREE from 'three'
import { SCREENS, TS, SW, SH, tileAt } from './world.js'

const WALL_H = 12
const SOLID_H = { '#': WALL_H, 'T': 2, 'H': WALL_H, 'R': WALL_H, '=': 5, 'I': 3, 'C': WALL_H }

export function createRenderer(canvas, { lite = false, width = 480, height = 288 } = {}) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false })
    renderer.setPixelRatio(1)
    renderer.setSize(width, height, false)
    renderer.shadowMap.enabled = !lite
    renderer.shadowMap.type = THREE.PCFShadowMap

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#1a1626')

    const aspect = width / height
    const viewH = 205
    const camera = new THREE.OrthographicCamera(-viewH * aspect / 2, viewH * aspect / 2, viewH / 2, -viewH / 2, 1, 600)
    camera.position.set(128, -88, 150)
    camera.up.set(0, 1, 0)
    camera.lookAt(128, 88, 4)

    // lights
    const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3c3226, 0.5)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xffd9a0, 1.15)
    sun.position.set(-90, -60, 120)
    sun.target.position.set(128, 88, 0)
    if (!lite) {
        sun.castShadow = true
        sun.shadow.mapSize.set(1024, 1024)
        sun.shadow.camera.left = -160; sun.shadow.camera.right = 160
        sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160
        sun.shadow.camera.near = 1; sun.shadow.camera.far = 400
        sun.shadow.bias = -0.0015
    }
    scene.add(sun); scene.add(sun.target)
    const lantern = new THREE.PointLight(0xffb36b, 0, 78, 1.8)
    scene.add(lantern)
    const torchLights = []
    for (let i = 0; i < 4; i++) {
        const l = new THREE.PointLight(0xff9a3c, 0, 62, 1.9)
        scene.add(l); torchLights.push(l)
    }

    // textures
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

    // post FX targets
    const mkRT = (w, h) => new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter })
    const rtScene = mkRT(width, height)
    const rtA = mkRT(width / 2, height / 2)
    const rtB = mkRT(width / 2, height / 2)
    const rtC = mkRT(width / 2, height / 2)
    const rtD = mkRT(width / 2, height / 2)
    const quadGeo = new THREE.PlaneGeometry(2, 2)
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad = new THREE.Mesh(quadGeo, null)
    const quadScene = new THREE.Scene()
    quadScene.add(quad)

    const brightMat = new THREE.ShaderMaterial({
        uniforms: { tSrc: { value: null }, t: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
        fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; uniform float t; void main(){ vec3 c=texture2D(tSrc,vUv).rgb; float l=dot(c,vec3(.25,.6,.15)); gl_FragColor=vec4(c*smoothstep(0.62,0.95,l),1.0); }',
    })
    const blurMat = new THREE.ShaderMaterial({
        uniforms: { tSrc: { value: null }, dir: { value: new THREE.Vector2(1, 0) }, r: { value: 1.0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
        fragmentShader: 'uniform sampler2D tSrc; uniform vec2 dir; uniform float r; varying vec2 vUv; void main(){ vec2 px=dir*r/vec2(480.0,288.0); vec3 s=texture2D(tSrc,vUv).rgb*0.227; s+=texture2D(tSrc,vUv+px*1.384).rgb*0.316; s+=texture2D(tSrc,vUv-px*1.384).rgb*0.316; s+=texture2D(tSrc,vUv+px*3.230).rgb*0.070; s+=texture2D(tSrc,vUv-px*3.230).rgb*0.070; gl_FragColor=vec4(s,1.0); }',
    })
    const compMat = new THREE.ShaderMaterial({
        uniforms: {
            tScene: { value: null }, tBloom: { value: null }, tSoft: { value: null },
            focus: { value: new THREE.Vector2(0.5, 0.5)}, time: { value: 0 },
        },
        vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
        fragmentShader: `
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tSoft;
uniform vec2 focus; uniform float time; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tScene, vUv).rgb;
  c += texture2D(tBloom, vUv).rgb * 0.75;
  float d = distance(vUv, focus);
  float f = smoothstep(0.16, 0.40, d);
  vec3 soft = texture2D(tSoft, vUv).rgb;
  c = mix(c, soft, f * 0.55);
  float v = 1.0 - 0.42 * pow(length(vUv - 0.5) * 1.42, 2.2);
  c *= clamp(v, 0.55, 1.0);
  c = pow(c, vec3(0.94));
  gl_FragColor = vec4(c, 1.0);
}`,
    })

    // ---- per-screen build ----
    let screenGroup = new THREE.Group()
    scene.add(screenGroup)
    let currentScreen = null
    let structureSig = ''
    const staticMeshes = []
    const dynamic = { doors: new Map(), cracks: new Map(), chests: new Map(), switches: new Map(), plates: new Map(), blocks: new Map() }

    const tileTexKey = (ch) => ({
        '.': 'grass', '"': 'tallgrass', ',': 'path', '~': 'water', 'T': 'grass', '#': 'stone',
        '=': 'grass', 'H': 'house', 'R': 'roof', 'I': 'grass', 'C': 'stone', 'S': 'stairs', '<': 'stone', 'A': 'stone',
    }[ch] || 'grass')

    function buildScreen(id, flags, cut) {
        disposeScreen()
        currentScreen = id
        const s = SCREENS[id]
        const dark = !!s.dark
        scene.background = new THREE.Color(dark ? '#0d0b14' : '#1c1730')
        hemi.intensity = dark ? 0.16 : 0.5
        sun.intensity = dark ? 0.05 : 1.15
        sun.color.set(dark ? 0x8a90c0 : 0xffd9a0)
        lantern.intensity = dark ? 1.5 : 0.0
        torchLights.forEach((l, i) => {
            const wall = (s.doors && s.doors[i]) || null
            void wall
            l.intensity = 0
        })
        // torch placements: near doors, chests and room corners in dungeons
        const spots = []
        if (dark) {
            for (const d of s.doors || []) spots.push([d.x, d.y === 0 ? 1 : d.y - 1])
            for (const c of s.chests || []) spots.push([c.x, c.y === 0 ? 1 : c.y - 1])
            spots.push([2, 1], [13, 9])
        }
        spots.slice(0, 4).forEach((p, i) => {
            torchLights[i].position.set(p[0] * TS + 8, p[1] * TS + 8, 10)
            torchLights[i].intensity = dark ? 1.7 : 0
        })

        const floorGeo = new THREE.PlaneGeometry(TS, TS)
        for (let y = 0; y < SH; y++) {
            for (let x = 0; x < SW; x++) {
                const ch = tileAt(s, x, y)
                const tk = tileTexKey(ch)
                const tex = T(tk)
                const z0 = ch === '~' ? -0.6 : 0
                const m = new THREE.Mesh(floorGeo, new THREE.MeshLambertMaterial({ map: tex }))
                m.rotation.x = -Math.PI / 2
                m.position.set(x * TS + 8, -(y * TS + 8), z0)
                m.receiveShadow = !lite
                screenGroup.add(m)
                staticMeshes.push(m)
                if (ch === '~') {
                    m.material.color.set('#9fc8e8')
                }
                if (ch === '"' && cut && cut[`${id}:${x},${y}`]) {
                    m.material.map = T('grass')
                }
                if (ch === 'T') {
                    const tr = new THREE.Mesh(new THREE.PlaneGeometry(24, 30), new THREE.MeshLambertMaterial({ map: T('tree'), transparent: true, alphaTest: 0.4 }))
                    tr.quaternion.copy(camera.quaternion)
                    tr.position.set(x * TS + 8, -(y * TS + 6), 12)
                    screenGroup.add(tr); staticMeshes.push(tr)
                }
                if (ch === 'I') {
                    const sg = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshLambertMaterial({ map: T('sign'), transparent: true, alphaTest: 0.4 }))
                    sg.quaternion.copy(camera.quaternion)
                    sg.position.set(x * TS + 8, -(y * TS + 6), 8)
                    screenGroup.add(sg); staticMeshes.push(sg)
                }
                if (ch === '<') {
                    const pt = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: T('portal'), transparent: true }))
                    pt.rotation.x = -Math.PI / 2
                    pt.position.set(x * TS + 8, -(y * TS + 8), 0.2)
                    screenGroup.add(pt); staticMeshes.push(pt)
                }
                const h = SOLID_H[ch]
                if (h && ch !== 'T' && ch !== 'I' && ch !== '<' && ch !== 'C') {
                    const topKey = ch === '#' ? 'wallTop' : (ch === 'H' ? 'roof' : (ch === 'R' ? 'roof' : (ch === '=' ? 'fence' : 'rock')))
                    const box = new THREE.Mesh(
                        new THREE.BoxGeometry(TS, TS, h),
                        new THREE.MeshLambertMaterial({ map: ch === '#' ? T('wall') : (ch === '=' ? T('fence') : T(topKey)), color: ch === '#' ? '#9a95ad' : 0xffffff })
                    )
                    box.position.set(x * TS + 8, -(y * TS + 8), h / 2)
                    if (!lite) { box.castShadow = true; box.receiveShadow = true }
                    screenGroup.add(box); staticMeshes.push(box)
                }
            }
        }
        // plates / switches / chests / doors / cracks
        for (const p of s.plates || []) {
            const ring = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: T('plate'), transparent: true, color: '#c9a24a' }))
            ring.rotation.x = -Math.PI / 2
            ring.position.set(p.x * TS + 8, -(p.y * TS + 8), 0.15)
            screenGroup.add(ring); staticMeshes.push(ring)
        }
        for (const sw of s.switches || []) {
            const plaque = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshLambertMaterial({ map: T('switchP'), transparent: false }))
            plaque.position.set(sw.x * TS + 8, -(sw.y * TS + 8), 8)
            screenGroup.add(plaque); staticMeshes.push(plaque)
            dynamic.switches.set(sw.id, plaque)
        }
        for (const c of s.chests || []) {
            const ch2 = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), new THREE.MeshLambertMaterial({ map: T('chest/closed'), transparent: true, alphaTest: 0.4 }))
            ch2.quaternion.copy(camera.quaternion)
            ch2.position.set(c.x * TS + 8, -(c.y * TS + 8), 6)
            screenGroup.add(ch2); staticMeshes.push(ch2)
            dynamic.chests.set(c.id, ch2)
        }
        for (const d of s.doors || []) {
            const tex = d.kind === 'bigkey' ? 'doorBig' : 'door'
            const box = new THREE.Mesh(new THREE.BoxGeometry(TS, TS, WALL_H), new THREE.MeshLambertMaterial({ map: T(tex) }))
            box.position.set(d.x * TS + 8, -(d.y * TS + 8), WALL_H / 2)
            if (!lite) box.castShadow = true
            screenGroup.add(box); staticMeshes.push(box)
            dynamic.doors.set(d.id, box)
        }
        for (const cr of s.cracks || []) {
            const box = new THREE.Mesh(new THREE.BoxGeometry(TS, TS, WALL_H), new THREE.MeshLambertMaterial({ map: T('crack') }))
            box.position.set(cr.x * TS + 8, -(cr.y * TS + 8), WALL_H / 2)
            if (!lite) box.castShadow = true
            screenGroup.add(box); staticMeshes.push(box)
            dynamic.cracks.set(cr.id, box)
        }
        // NPC billboards
        dynamic.npcs = new Map()
        for (const n of s.npcs || []) {
            const cnv = document.createElement('canvas'); cnv.width = 14; cnv.height = 18
            const g = cnv.getContext('2d')
            g.fillStyle = n.kind === 'shop' ? '#a04a3c' : '#7a6a8a'; g.fillRect(3, 6, 8, 8)
            g.fillStyle = '#e8b48a'; g.fillRect(4, 1, 6, 5)
            g.fillStyle = n.kind === 'shop' ? '#3c2c1c' : '#cfc8dc'; g.fillRect(3, 0, 8, 2)
            const nn = new THREE.Mesh(new THREE.PlaneGeometry(14, 18), new THREE.MeshLambertMaterial({ map: makeTex(cnv), transparent: true, alphaTest: 0.4 }))
            nn.quaternion.copy(camera.quaternion)
            nn.position.set(n.x * TS + 8, -(n.y * TS + 8), 9)
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
        dynamic.doors.clear(); dynamic.cracks.clear(); dynamic.chests.clear(); dynamic.switches.clear()
    }

    // ---- entities (billboards) ----
    const billboards = []
    const mkBillboard = (w, h) => {
        const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
        m.quaternion.copy(camera.quaternion)
        scene.add(m)
        const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.4), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }))
        shadow.rotation.x = -Math.PI / 2
        scene.add(shadow)
        const b = { mesh: m, shadow, mat, texKey: '' }
        billboards.push(b)
        return b
    }
    const heroBB = mkBillboard(16, 18)
    const heroShadow = heroBB.shadow
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
            p.m.position.set(x, -y, 6 + Math.random() * 8)
            p.vx = (Math.random() - 0.5) * spread
            p.vy = (Math.random() - 0.5) * spread
            p.vz = Math.random() * up
            p.life = 18 + Math.random() * 18
        }
    }

    const { JUICE } = { JUICE: { hit: ['#ffd27a', '#ff9a3c'], blood: ['#8a4030', '#c96a4a'], cut: ['#8cc45f', '#b7e08a'], boom: ['#ffd27a', '#ff9a3c', '#ff5a2a'], coin: ['#ffe08a', '#ffb238'], magic: ['#8ce0ff', '#bff2ff'] } }
    const JUICE_COLORS = JUICE

    let shake = 0
    function onFx(events) {
        if (!events || !events.length) return
        for (const e of events) {
            switch (e.k) {
                case 'sword': spawnParts(e.x + (e.dir === 'left' ? -8 : e.dir === 'right' ? 8 : 0), e.y + (e.dir === 'up' ? -8 : e.dir === 'down' ? 8 : 0), ['#ffffff', '#ffd87a'], 3, 1.4, 1); break
                case 'hit': spawnParts(e.x, e.y, JUICE_COLORS.hit, 7); shake = Math.max(shake, 3); break
                case 'die': spawnParts(e.x, e.y, JUICE_COLORS.blood, 12); shake = Math.max(shake, 4); break
                case 'cut': spawnParts(e.x, e.y, JUICE_COLORS.cut, 6, 1.8, 1.2); break
                case 'boom': spawnParts(e.x, e.y, JUICE_COLORS.boom, 26, 4.5, 3); shake = Math.max(shake, 7); break
                case 'crack': spawnParts(e.x, e.y, ['#8d8999', '#4e4a5a', '#ffd27a'], 16, 3.5, 2.4); break
                case 'coin': spawnParts(e.x, e.y, JUICE_COLORS.coin, 4, 1.2, 1.4); break
                case 'heart': spawnParts(e.x, e.y, ['#ff8896', '#e8384a'], 5, 1.4, 1.4); break
                case 'key': case 'unlock': spawnParts(e.x, e.y, ['#e8c24a', '#fff3cf'], 8, 2, 1.6); break
                case 'switch': spawnParts(e.x, e.y, ['#c9a24a', '#ffe08a'], 10, 2.2, 1.8); break
                case 'shoot': spawnParts(e.x, e.y, ['#e8e2d0'], 2, 1, 0.6); break
                case 'spit': spawnParts(e.x, e.y, JUICE_COLORS.magic, 4, 1.6, 1); break
                case 'hurt': shake = Math.max(shake, 6); break
                case 'clank': spawnParts(e.x, e.y, ['#ffffff', '#cfd6e6'], 5, 2, 1.2); break
                case 'stagger': spawnParts(e.x, e.y, ['#ff9a3c', '#ffd27a', '#ffffff'], 22, 4, 3); shake = Math.max(shake, 8); break
                case 'pop': spawnParts(e.x, e.y, JUICE_COLORS.cut, 6, 2, 1.4); break
                case 'warp': spawnParts(e.x, e.y, ['#8ce0ff', '#bff2ff'], 12, 2.4, 2); break
                case 'grant': spawnParts(e.x, e.y, ['#ffd27a', '#fff3cf', '#8ce0ff'], 14, 2.6, 2.2); break
            }
        }
    }

    // torch flicker + hero light probe
    const probeLight = (x, y, dark) => {
        if (!dark) return 1
        let v = 0.16
        for (const l of torchLights) {
            if (l.intensity <= 0) continue
            const d = Math.hypot(l.position.x - x, l.position.y + y)
            v += Math.max(0, 1 - d / 70) * 1.05
        }
        const dl = Math.hypot(lantern.position.x - x, lantern.position.y + y)
        v += Math.max(0, 1 - dl / 66) * 0.9
        return Math.min(1.25, v)
    }

    function sync(sim, tSec) {
        if (!TEX) return
        const dark = !!SCREENS[sim.screen]?.dark
        const sig = sim.screen + '|' + Object.keys(sim.flags.cracked).length + '|' + Object.keys(sim.flags.doorsOpen).length + '|' + Object.keys(sim.flags.chestsOpen).length
        if (sig !== structureSig || sim.screen !== currentScreen) {
            if (sim.screen !== currentScreen || sig !== structureSig) buildScreen(sim.screen, sim.flags, sim.cut)
            structureSig = sig
            // chest visual state may already be open
            for (const [cid, mesh] of dynamic.chests) {
                if (sim.flags.chestsOpen[cid]) {
                    mesh.material.map = T('chest/open')
                    mesh.material.needsUpdate = true
                }
            }
            for (const [did, mesh] of dynamic.doors) if (sim.flags.doorsOpen[did]) mesh.visible = false
            for (const [kid, mesh] of dynamic.cracks) if (sim.flags.cracked[kid]) mesh.visible = false
            for (const [sid2, mesh] of dynamic.switches) if (sim.flags.switchesOn[sid2]) mesh.material.color.set('#4aff7a')
        }
        const s = SCREENS[sim.screen]
        // doors animate open
        for (const d of s.doors || []) {
            const mesh = dynamic.doors.get(d.id)
            if (!mesh) continue
            const open = (d.kind === 'switch' ? !!sim.flags.switchesOn[d.switch] : !!sim.flags.doorsOpen[d.id])
            mesh.visible = !open
        }

        // camera follows hero softly
        const hx = sim.hero.x, hy = -sim.hero.y
        camera.position.x += ((128 + (hx - 128) * 0.55) - camera.position.x) * 0.08
        camera.position.y += ((-88 + (hy + 88) * 0.55) - camera.position.y) * 0.08
        camera.lookAt(camera.position.x, camera.position.y + 176, 4)
        if (shake > 0.2) {
            camera.position.x += (Math.random() - 0.5) * shake
            camera.position.y += (Math.random() - 0.5) * shake
            shake *= 0.82
        }
        lantern.position.set(hx, hy, 12)

        // hero billboard
        const anim = Math.floor(tSec * 7) % 2
        const pose = sim.swing > 0 ? 'slash' : (sim.drawing ? 'draw' : (Math.abs(sim.hero.vx || 0) + Math.abs(sim.hero.vy || 0) >= 0 && sim.moving ? 'w' + (anim + 1) : 'w1'))
        setTex(heroBB, `hero/${sim.hero.dir}/${pose}`)
        heroBB.mesh.position.set(hx, hy, 9)
        heroBB.mesh.scale.x = sim.hero.dir === 'right' ? -1 : 1
        const hl = probeLight(hx, hy, dark)
        heroBB.mat.color.setRGB(hl, hl, hl)
        if (sim.hero.hurt > 0 && Math.floor(tSec * 14) % 2 === 0) heroBB.mat.color.set('#ff5c5c')
        heroShadow.position.set(hx, hy, 0.12)

        // enemies
        for (let i = 0; i < bbPool.length; i++) {
            const b = bbPool[i]
            const e = sim.enemies[i]
            if (!e || e.dead) { b.mesh.visible = false; b.shadow.visible = false; continue }
            b.mesh.visible = true; b.shadow.visible = true
            if (e.hidden) { b.mesh.visible = false }
            let key = 'cinder/0'
            if (e.type === 'bat') key = `bat/${anim}`
            else if (e.type === 'spitter') key = `spitter/${e.t % 60 < 8 ? 1 : 0}`
            else if (e.type === 'husk') key = `husk/${anim}`
            else if (e.type === 'wisp') key = `wisp/${anim}`
            else if (e.type === 'sprig') key = `sprig/${e.hidden ? 0 : 1}`
            else if (e.type === 'maw') key = `maw/${e.open ? 'open' : 'closed'}`
            else if (e.type === 'wyrm') key = `wyrm/${e.open ? 'open' : 'closed'}`
            else key = `cinder/${anim}`
            setTex(b, key)
            b.mesh.scale.setScalar(1)
            if (e.type === 'maw') { b.mesh.scale.set(28 / 16, 28 / 16, 1) }
            if (e.type === 'wyrm') { b.mesh.scale.set(24 / 16, 20 / 16, 1) }
            b.mesh.position.set(e.x, -e.y, 8 + (e.type === 'bat' || e.type === 'wisp' ? 6 : 0))
            b.mesh.scale.x *= (e.fx > 0.1 ? -1 : 1)
            const el = probeLight(e.x, -e.y, dark)
            const lit = e.hitT > 0 ? 1.6 : el
            b.mat.color.setRGB(Math.min(1.5, lit), e.hitT > 0 ? 1.1 : lit, e.hitT > 0 ? 1.1 : lit)
            if (e.type === 'wisp') b.mat.opacity = 0.65 + 0.3 * Math.sin(tSec * 6 + e.i)
            else b.mat.opacity = 1
            b.shadow.position.set(e.x, -e.y, 0.12)
            b.shadow.scale.setScalar(e.boss ? 2 : 1)
            // wyrm tail segments
            if (e.type === 'wyrm' && e.seg) {
                // reuse drop pool tail proxies is wrong; draw with particles instead
            }
        }
        // wyrm segments via dedicated quads
        const wyrm = sim.enemies.find(en => en.type === 'wyrm' && !en.dead)
        for (let i = 0; i < dropPool.length; i++) {
            const d = dropPool[i]
            if (wyrm && wyrm.seg && i * 4 < wyrm.seg.length) {
                const p = wyrm.seg[i * 4 + 1]
                if (p) {
                    d.mesh.visible = true
                    setTex(d, 'wyrm/seg')
                    d.mesh.position.set(p.x, -p.y, 6)
                    d.mesh.scale.setScalar(1 - i * 0.07)
                    d.mat.color.setRGB(...vec3(probeLight(p.x, -p.y, dark)))
                    d.shadow.visible = false
                    continue
                }
            }
            const dr = sim.drops[i]
            if (!dr) { d.mesh.visible = false; d.shadow.visible = false; continue }
            d.mesh.visible = true; d.shadow.visible = true
            setTex(d, dr.kind === 'ember' ? `ember/${anim}` : dr.kind)
            d.mesh.position.set(dr.x, -dr.y, 5 + Math.sin(tSec * 5 + dr.t * 0.1) * 1.5)
            const dl2 = probeLight(dr.x, -dr.y, dark)
            d.mat.color.setRGB(dl2, dl2, dl2)
            d.shadow.position.set(dr.x, -dr.y, 0.12)
        }
        // projectiles
        for (let i = 0; i < projPool.length; i++) {
            const p = projPool[i]
            const pr = sim.projectiles[i]
            if (!pr) { p.mesh.visible = false; p.shadow.visible = false; continue }
            p.mesh.visible = true
            setTex(p, pr.kind === 'arrow' ? 'arrow' : 'orb')
            p.mesh.position.set(pr.x, -pr.y, 8)
            p.mesh.rotation.z = Math.atan2(-pr.vy, pr.vx)
            const pl = probeLight(pr.x, -pr.y, dark)
            p.mat.color.setRGB(pl, pl, pl)
            p.shadow.visible = false
        }
        // bombs
        for (let i = 0; i < bombPool.length; i++) {
            const b = bombPool[i]
            const bb = sim.bombs[i]
            if (!bb) { b.mesh.visible = false; b.shadow.visible = false; continue }
            b.mesh.visible = true
            setTex(b, 'bomb')
            const puls = bb.fuse < 22 && Math.floor(tSec * 10) % 2 === 0
            b.mesh.position.set(bb.x, -bb.y, 6)
            b.mat.color.setRGB(puls ? 2 : 1, puls ? 1.2 : 1, puls ? 1.2 : 1)
            b.shadow.position.set(bb.x, -bb.y, 0.12)
        }
        // push blocks
        const blocks = sim.blocks || []
        for (let i = 0; i < blockBBs.length; i++) {
            const b = blockBBs[i]
            const bk = blocks[i]
            if (!bk) { b.mesh.visible = false; b.shadow.visible = false; continue }
            b.mesh.visible = true
            b.mesh.position.set(bk.x * TS + 8, -(bk.y * TS + 8), 7)
            const bl = probeLight(bk.x * TS + 8, -(bk.y * TS + 8), dark)
            b.mat.color.setRGB(bl, bl, bl)
            b.shadow.position.set(bk.x * TS + 8, -(bk.y * TS + 8), 0.12)
        }

        // particles step
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
        // torch flicker
        for (const l of torchLights) if (l.intensity > 0) l.intensity = 1.55 + Math.sin(tSec * 11 + l.position.x) * 0.25 + Math.random() * 0.12
    }

    function vec3(v) { return [v, v, v] }

    // water scroll
    let waterTime = 0

    function draw() {
        if (!TEX) return
        waterTime += 0.01
        if (TEX.water) {
            const wt = texCache.get('water')
            if (wt) { wt.offset.x = Math.sin(waterTime) * 0.06; wt.offset.y = waterTime * 0.05 }
        }
        if (lite) {
            renderer.setRenderTarget(null)
            renderer.render(scene, camera)
            return
        }
        renderer.setRenderTarget(rtScene)
        renderer.render(scene, camera)
        quad.material = brightMat
        brightMat.uniforms.tSrc.value = rtScene.texture
        renderer.setRenderTarget(rtA); renderer.render(quadScene, quadCam)
        quad.material = blurMat
        blurMat.uniforms.tSrc.value = rtA.texture; blurMat.uniforms.dir.value.set(1, 0); blurMat.uniforms.r.value = 1
        renderer.setRenderTarget(rtB); renderer.render(quadScene, quadCam)
        blurMat.uniforms.tSrc.value = rtB.texture; blurMat.uniforms.dir.value.set(0, 1)
        renderer.setRenderTarget(rtA); renderer.render(quadScene, quadCam)
        // soft focus blur (bigger radius, whole scene)
        blurMat.uniforms.r.value = 2.2
        blurMat.uniforms.tSrc.value = rtScene.texture; blurMat.uniforms.dir.value.set(1, 0)
        renderer.setRenderTarget(rtC); renderer.render(quadScene, quadCam)
        blurMat.uniforms.tSrc.value = rtC.texture; blurMat.uniforms.dir.value.set(0, 1)
        renderer.setRenderTarget(rtD); renderer.render(quadScene, quadCam)

        quad.material = compMat
        compMat.uniforms.tScene.value = rtScene.texture
        compMat.uniforms.tBloom.value = rtA.texture
        compMat.uniforms.tSoft.value = rtD.texture
        // focus = hero in NDC-ish (0..1)
        const v = new THREE.Vector3(simFocus[0], simFocus[1], 0).project(camera)
        compMat.uniforms.focus.value.set((v.x + 1) / 2, (v.y + 1) / 2)
        renderer.setRenderTarget(null)
        renderer.render(quadScene, quadCam)
    }

    const simFocus = [128, -88]
    function setFocus(x, y) { simFocus[0] = x; simFocus[1] = y }

    function loadTex(texObj) { TEX = texObj; texCache.clear() }

    function dispose() {
        disposeScreen()
        billboards.concat(parts.map(p => ({ mesh: p.m }))).forEach(b => {
            b.mesh.geometry.dispose(); b.mesh.material.dispose()
        })
        rtScene.dispose(); rtA.dispose(); rtB.dispose(); rtC.dispose(); rtD.dispose()
        renderer.dispose()
    }

    return { loadTex, buildScreen, sync, draw, onFx, setFocus, dispose, get camera() { return camera } }
}

// Ad-hoc scene diagnostic (dev server must be running). Prints only problems:
// materials whose maps are not textures, materials bound to disposed geometry, and a
// rough draw-call count. Not a gate — scripts/heistcheck.mjs is the gate.
import { chromium } from 'playwright-core'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await b.newPage({ viewport: { width: 600, height: 400 } })
const errs = []
p.on('pageerror', e => errs.push(e.message))
await p.goto(process.argv[2] || 'http://localhost:5173/retrogames/raccoon-heist', { waitUntil: 'load' })
await p.waitForTimeout(1500)
console.log(await p.evaluate(() => {
  const t = window.__heistTest; if (!t) return 'NO HOOK'
  const scene = t.scene()
  const bad = [], seen = new Set(), mats = new Set()
  let meshes = 0, tris = 0
  scene.traverse(o => {
    if (o.isMesh || o.isPoints) meshes++
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []
    for (const m of ms) {
      if (seen.has(m)) continue
      seen.add(m); mats.add(m)
      for (const slot of ['map', 'roughnessMap', 'normalMap', 'aoMap', 'emissiveMap']) {
        const tx = m[slot]
        if (tx && tx.isTexture !== true) bad.push(`${m.name || m.type}.${slot} is ${Object.prototype.toString.call(tx)} not a Texture`)
      }
      if (o.geometry?.attributes?.position) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3
    }
  })
  return { bad, materials: mats.size, meshes, tris: tris | 0, info: t.state() }
}))
console.log('pageerrors:', errs.length, errs.slice(0, 2))
await b.close()

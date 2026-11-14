// scratch law probe: runs fox.html's real scripts in Node with a DOM stub
import { readFileSync } from 'node:fs'
const html = readFileSync('public/demos/fox.html', 'utf8')
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
const noop = () => {}
const grad = { addColorStop: noop }
const ctxStub = new Proxy({}, { get: (t, k) => {
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad
  if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) })
  return noop
}, set: () => true })
const el = (tag) => ({ style: {}, getContext: () => ctxStub, addEventListener: noop, setPointerCapture: noop, width: 0, height: 0 })
global.window = { innerWidth: 1180, innerHeight: 780, devicePixelRatio: 1, addEventListener: noop, location: { search: '' }, AudioContext: undefined }
global.document = { getElementById: el, addEventListener: noop }
global.location = global.window.location
global.requestAnimationFrame = noop
let src = scripts.join('\n').replace(/window\.__foxTest = /, 'global.__foxTest = ').replace(/window\.DEMO_CREDITS/, 'global.DEMO_CREDITS')
new Function(src)()
const t = global.__foxTest
const g = t.gait()
console.log('order:', JSON.stringify(g.order), 'susp:', g.susp.toFixed(3))
console.log('slip:', t.slipAudit())
console.log('seam:', t.seam().toExponential(2))
console.log('arch:', t.arch())
console.log('law:', JSON.stringify(t.law))
// chord fit: relative travel during stance vs chord
for (const name of ['LH','RH','LF','RF']) {
  const d = t.law.durs[name], travel = t.law.L * d
  console.log(name, 'stance rel travel', travel.toFixed(3), 'm')
}
// paw positions at sample phases — sanity vs joint reach
for (const p of [0, 0.1, 0.3, 0.5, 0.65, 0.85]) {
  const s = t.stateAt(p)
  const rel = {}
  for (const n of ['LH','RH','LF','RF']) rel[n] = `${(s.paws[n].x - s.x).toFixed(2)}/${s.paws[n].z.toFixed(2)}${s.paws[n].stance ? '*' : ''}`
  console.log('p=' + p, JSON.stringify(rel), 'z=' + s.z.toFixed(3), 'pitch=' + s.pitch.toFixed(3), 'fl=' + s.fl.toFixed(3))
}

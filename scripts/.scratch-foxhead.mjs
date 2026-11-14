// scratch: where does the head project at gathered phase?
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
const el = () => ({ style: {}, getContext: () => ctxStub, addEventListener: noop, setPointerCapture: noop })
global.window = { innerWidth: 1180, innerHeight: 780, devicePixelRatio: 1, addEventListener: noop, location: { search: '' } }
global.document = { getElementById: el, addEventListener: noop }
global.location = global.window.location
global.requestAnimationFrame = noop
let src = scripts.join('\n').replace(/window\.__foxTest = /, 'global.__foxTest = ').replace(/window\.DEMO_CREDITS/, 'global.DEMO_CREDITS')
// expose internals: append debug getters
src += `
global.__dbg = { poseAt, camFor, proj, pushFace, facesRef: () => faces, getCAM: () => [CAM, fwd, rgt] };`
new Function(src)()
const t = global.__foxTest
t.setPhase(0.02)
const P = global.__dbg.poseAt(0.02 * t.law.T)
const { camFor, proj } = global.__dbg
camFor(P)
console.log('poll world', P.poll.map(v => v.toFixed(2)), 'screen', proj(P.poll)?.map(v => Math.round(v)))
console.log('lastHead', P.hpts[3].slice(0, 3).map(v => v.toFixed(2)), 'screen', proj(P.hpts[3].slice(0, 3))?.map(v => Math.round(v)))
console.log('hips', proj([P.X, 0, 0.3])?.map(v => Math.round(v)), 'withers', proj([P.X + 0.42, 0, 0.34])?.map(v => Math.round(v)))
const faces = global.__dbg.facesRef()
let headF = 0, torsoF = 0, legF = 0, groundF = 0
for (const f of faces) {
  const cx = f.s.reduce((a, p) => a + p[0], 0) / f.s.length
  const cy = f.s.reduce((a, p) => a + p[1], 0) / f.s.length
  if (cx > 600 && cx < 720 && cy < 450) headF++
  else if (cy < 320) groundF++
  else torsoF++
}
console.log('faces total', faces.length, 'headish', headF)
// swing reach check at p=0.02: LF target vs body
const s = t.stateAt(0.02)
console.log('LF rel x', (s.paws.LF.x - s.x).toFixed(2), 'z', s.paws.LF.z.toFixed(2), 'stance', s.paws.LF.stance)
const s2 = t.stateAt(0.9)
console.log('p0.9 LF rel', (s2.paws.LF.x - s2.x).toFixed(2), 'RF rel', (s2.paws.RF.x - s2.x).toFixed(2), 'LH rel', (s2.paws.LH.x - s2.x).toFixed(2))
const s3 = t.stateAt(0.5)
console.log('p0.5 LF rel', (s3.paws.LF.x - s3.x).toFixed(2), 'LH rel', (s3.paws.LH.x - s3.x).toFixed(2), 'RH rel', (s3.paws.RH.x - s3.x).toFixed(2))

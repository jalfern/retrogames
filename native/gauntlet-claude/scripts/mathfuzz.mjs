// V8's Math.sin / cos / atan2 and Number#toFixed on 300k inputs (angles,
// tick-sized arguments, cell coordinates, toFixed ties and near-ties), as raw
// float64 rows for `gauntlet-trace math` — the port's math must be V8's, bit
// for bit.   node scripts/mathfuzz.mjs <out.bin> <out.json>
import { writeFileSync } from 'node:fs'
let s = 99
const r = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296 }
const n = 300000, a = new Float64Array(n * 6), tf = []
for (let i = 0; i < n; i++) {
    const k = i % 4
    const x = k === 0 ? (r() - 0.5) * 8 : k === 1 ? (r() - 0.5) * 40 : k === 2 ? Math.floor(r() * 200000) : (r() - 0.5) * 1e-3
    const y = (r() - 0.5) * 48, z = (r() - 0.5) * 48
    a.set([x, Math.sin(x), Math.cos(x), y, z, Math.atan2(y, z)], i * 6)
    if (i % 3 === 0) {
        const v = k === 1 ? Math.round(r() * 48000) / 1000 + (r() < 0.5 ? 0 : 0.0005) : k === 2 ? Math.floor(r() * 384) / 16 - 12 : y
        tf.push([v, v.toFixed(1), v.toFixed(2), v.toFixed(3)])
    }
}
writeFileSync(process.argv[2], Buffer.from(a.buffer))
writeFileSync(process.argv[3], JSON.stringify(tf))

import fs from 'fs'
const rows = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').slice(1)
  .map(l => l.split(',').map(Number))
  .filter(r => Number.isFinite(r[2]))
const lev = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').slice(1)
// keep last 150 ticks of the first life (level column is a string, keep raw)
const raw = lev.map(l => l.split(','))
const last = raw.slice(-150)
const hdr = 'tick lvl x y vx vy og wj brk jmp pf0 pf1'
console.log(hdr)
for (const r of last) {
  const [t, l, x, y, vx, vy, og, wj, brk, jmp, pf0, pf1] = r
  console.log([t, l, (+x).toFixed(1), (+y).toFixed(1), vx, vy, og, wj, brk, jmp, pf0, pf1].join(' '))
}

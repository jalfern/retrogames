// analyze qa2111-ticktrace.csv — where the pit-2 death really comes from
import fs from 'fs'
const rows = fs.readFileSync('scripts/.shots/qa2111-ticktrace.csv', 'utf8').trim().split('\n').slice(1)
  .map(l => l.split(',')).map(p => ({ t: +p[0], lv: p[1], x: +p[2], y: +p[3], vx: +p[4], vy: +p[5], og: p[6] === '1', wj: p[7] === '1', br: p[8] === '1', jp: p[9] === '1', pf0: +p[10], pf1: +p[11] }))
const leg = rows.filter(r => r.lv === '1-3')
console.log(`1-3 rows: ${leg.length}`)
// group into lives: a respawn is tick-jump with x reset small after a death-ish frame
let seg = [], segs = []
for (const r of leg) {
    if (seg.length && r.x < seg[seg.length - 1].x - 8 && r.x < 40) { segs.push(seg); seg = [] }
    seg.push(r)
}
if (seg.length) segs.push(seg)
segs.forEach((s, i) => {
    const maxc = Math.max(...s.map(r => Math.floor(r.x / 16)))
    console.log(`life ${i}: ticks ${s[0].t}-${s[s.length - 1].t}, maxCol ${maxc}`)
})
// dump the final segment fully
const last = segs[segs.length - 1]
console.log('\nFINAL LIFE, per-tick (col = x/16):')
for (const r of last) {
    const col = (r.x / 16).toFixed(1)
    if (+col > 2 && +col < 8 || r.br || r.wj || (r.pf0 === 0)) {
        console.log(`t=${r.t} x=${r.x} col=${col} y=${r.y} vx=${r.vx} vy=${r.vy} ${r.og ? 'GRND' : 'air '} wj=${r.wj ? 1 : 0} brk=${r.br ? 1 : 0} jmp=${r.jp ? 1 : 0} pf=${r.pf0}/${r.pf1}`)
    }
}

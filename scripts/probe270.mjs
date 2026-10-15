// temp probe: what does each proven run actually build, and when do fires strike?
import { newCity, step, T, CFG } from '../src/games/SimCityMin/sim.js'
import { plan } from '../src/games/SimCityMin/planner.js'

for (const sc of process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [0, 1]) {
    const g = newCity(sc)
    const r = plan(sc)
    const places = []
    const fires = []
    for (const inp of r.script) {
        step(g, inp)
        for (const e of g.events) {
            if (e.type === 'place' && [T.PLANT, T.FIRE].includes(e.t)) places.push(`y${g.year}:${e.t === T.PLANT ? 'PLANT' : 'FIRE'}@${e.x},${e.y}`)
            if (e.type === 'fire') fires.push(`fire y${e.year}@${e.x},${e.y}`)
            if (e.type === 'doused') fires.push(`  doused y${e.year}@${e.x},${e.y}`)
        }
    }
    console.log(`s${sc}: ${g.end} ${g.endWhy} y${g.year} pop ${g.pop} plants ${r.receipts.plants} stations ${r.receipts.fires}`)
    console.log('  builds:', places.join(' '))
    console.log('  fires :', fires.join(' ') || '(none)')
    const fundsByYear = []
    const g2 = newCity(sc)
    for (const inp of r.script) {
        step(g2, inp)
        const ye = g2.events.find((e) => e.type === 'year')
        if (ye && g2.year <= 16) fundsByYear.push(`y${g2.year}:f${g2.funds}/p${g2.pop}`)
    }
    console.log('  early :', fundsByYear.join(' '))
}

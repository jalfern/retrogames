// diagnostic: do the competent (planner) runs actually SEE the scripted disasters?
import { newCity, step, T, CFG } from '../src/games/SimCityMin/sim.js'
import { plan } from '../src/games/SimCityMin/planner.js'
import { SCEN } from '../src/games/SimCityMin/scen.js'

for (const sc of [0, 1, 2]) {
    const g = newCity(sc)
    const r = plan(sc)
    let fired = 0, dud = 0, doused = 0, spread = 0, wrecks = 0, tornadoes = 0
    const fireYears = []
    for (const inp of r.script) {
        step(g, inp)
        for (const e of g.events) {
            if (e.type === 'fire') { fired++; fireYears.push(e.year) }
            else if (e.type === 'dudfire') dud++
            else if (e.type === 'doused') doused++
            else if (e.type === 'spread') spread++
            else if (e.type === 'wreck') wrecks++
            else if (e.type === 'tornado') tornadoes++
        }
    }
    const S = SCEN[sc]
    console.log(`s${sc} ${S.name}: end ${g.end} ${g.endWhy} @y${g.year} | scripted fires [${S.fires.map(f=>f.year)}] ${S.tornado?`tornado y${S.tornado.startYear}-${S.tornado.startYear+S.tornado.path.length-1}`:''}`)
    console.log(`   ignited ${fired} (years ${fireYears.join(',')})  doused ${doused}  spread ${spread}  dudfire ${dud}  wrecks ${wrecks}  tornado-frames ${tornadoes}`)
}

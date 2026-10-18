import { makeGame, step } from './src/games/Gauntlet/sim.js'
const gs = makeGame(0, 'warrior', { topDown: true, partner: true })
gs.monsters = []; gs.gens.forEach((g) => { g.alive = false }); gs.hero.hp = 1e9
const door = gs.doors.find((d) => !d.locked)
door.open = false; door.closeT = -1
gs.hero.x = door.x + 3.0; gs.hero.y = door.y + 0.5; gs.hero.a = 0   // well east, idle
gs.partner.x = door.x - 1.0; gs.partner.y = door.y + 0.5; gs.partner.a = 0
console.log('door', door.x, '| hero', gs.hero.x.toFixed(2), '(cell', Math.floor(gs.hero.x), ') partner', gs.partner.x.toFixed(2), '(cell', Math.floor(gs.partner.x), ')')
let opened = false
for (let i = 0; i < 400; i++) {
    step(gs, {})
    for (const ev of gs.events) if (ev.type === 'doorOpen') opened = true
    gs.events.length = 0
}
const crossed = Math.floor(gs.partner.x) > door.x
console.log('doorOpen event fired?', opened, '| crossed to far cell?', crossed, '| partner', gs.partner.x.toFixed(2), 'broken?', door.broken)
console.log(crossed && opened && !door.broken ? 'OK: pushed open + followed through' : 'FAIL')

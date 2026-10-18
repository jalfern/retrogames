// REPRO: the CPU partner cannot pass a slammed door; the hero can.
import { makeGame, step } from './src/games/Gauntlet/sim.js'

const gs = makeGame(0, 'warrior', { topDown: true, partner: true })
gs.monsters = []
gs.gens.forEach((g) => { g.alive = false })
gs.hero.hp = 1e9; gs.hero.maxHp = 1e9

const door = gs.doors.find((d) => !d.locked)
console.log('slam door at cell', door.x, door.y)

// both start on the west side of the door
gs.hero.x = door.x - 0.5; gs.hero.y = door.y + 0.5; gs.hero.a = 0            // facing east
gs.partner.x = door.x - 1.8; gs.partner.y = door.y + 0.5; gs.partner.a = 0

// 1) hero walks east until well past the door cell -> the door opens, then
//    (hero off the cell) it slams shut behind
for (let i = 0; i < 200 && gs.hero.x < door.x + 2.2; i++) step(gs, { right: true })
console.log('hero now at', gs.hero.x.toFixed(2), '| door.open =', door.open)

// 2) idle: the door is left behind and must slam closed
for (let i = 0; i < 120 && door.open; i++) step(gs, {})
console.log('after idle: door.open =', door.open, '| hero', gs.hero.x.toFixed(2), 'partner', gs.partner.x.toFixed(2))

// 3) CPU partner auto-follows the hero east and hits the CLOSED door.
let partnerCrossed = false
for (let i = 0; i < 400; i++) {
    step(gs, {})
    if (Math.floor(gs.partner.x) > door.x) { partnerCrossed = true; break }
}
console.log('partner crossed the closed door?', partnerCrossed)
console.log('FINAL hero', gs.hero.x.toFixed(2), 'partner', gs.partner.x.toFixed(2), 'door.open', door.open)
console.log(partnerCrossed
    ? 'RESULT: partner got through (unexpected before fix)'
    : 'RESULT: partner STRANDED west of the closed door — the bug')

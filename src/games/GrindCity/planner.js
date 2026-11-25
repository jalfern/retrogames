// GRIND CITY — the autopilot. It drives the attract mode and is the witness
// grindcheck grades: seed + this rule-set ⇒ every goal inside 2:00.
// Rule-based over the sim's JSON state; emits one pad per tick.

export const WP = [
    { x: 5, z: -16, r: 3.0 },      // bottom of the drop-in (speed!)
    { x: 4, z: -4.5, r: 2.0 },     // letter T, the gap lane
    { x: 4, z: 3.2, r: 1.5 },      // kicker lip — launch
    { x: 5, z: 12.5, r: 2.6 },     // letter E, past the trench
    { x: -25, z: 4, r: 3.5 },      // halfpipe mouth
    { x: -44, z: 0, r: 2.4 },      // far coping — air time
    { x: -25, z: -2, r: 3.0 },     // exit the pipe east
    { x: -9, z: -2, r: 1.9 },      // diagonal rail — boardslide
    { x: -2, z: 12, r: 5.0 },      // cruise south
    { x: -2, z: 16, r: 7.0 },      // coast
]

// Attract variety (#3233 item 4): the line is fixed, but its STYLE rotates per
// attract loop so long idles don't loop one choreography. v = 0 is the classic
// witness line — byte-identical to before (grindcheck grades exactly this bot).
// v = 1 FLIPS the trench gap: the 57-tick gap air clears the 300° bail floor
// with ~35 ticks spare; the press waits for a true B rising edge in the air
// (the pump holds B up the kicker face, so a naive press never edges).
// v = 2 rides a MANUAL after the gap landing — the classic line never arms one
// (the gap choreography blocks it); manuals can't bail, and the chip shows it.
// Showcase only — the graded win line, letters and every bail law are untouched.
export function makeBot(v = 0) {
    return { i: 0, seq: -1, gseq: 0, rpulse: 0, cool: 0, m: 0, wasAir: false, wasGrind: false, v, bWas: false, flipF: false }
}

const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a }

/** pad for one tick given the sim's JSON state */
export function botPad(st, bot) {
    const pad = botInner(st, bot)
    bot.bWas = pad.b   // the flip press needs its own B rising edge, and the
    return pad         // sim's bPrev isn't in stateOf — remember it on the bot
}

function botInner(st, bot) {
    const pad = { left: false, right: false, up: false, down: false, a: false, b: false }
    if (st.phase !== 'play') { bot.wasAir = st.air; return pad }

    // grinding: counter-balance only
    if (st.grinding) {
        if (st.grindBal > 0.12) pad.left = true
        if (st.grindBal < -0.12) pad.right = true
        bot.wasAir = false
        bot.wasGrind = true
        return pad
    }
    if (bot.wasGrind && !st.grinding) { bot.wasGrind = false; if (bot.i === 7) bot.i = 8 }

    // manual timing: arm on landing, press in the grace window, hold, release.
    // The classic gates (gseq===0 && seq<0) put the gap landing in cooldown, so
    // the witness line never manuals; v2 opens the gates to show the manual chip.
    const gate = bot.v === 2 ? bot.cool === 0 : bot.cool === 0 && bot.gseq === 0 && bot.seq < 0
    if (bot.wasAir && !st.air && bot.m === 0 && gate) bot.m = 90
    bot.wasAir = st.air
    if (bot.m > 0) {
        bot.m--
        if (bot.m >= 55) pad.a = true    // press at 89 (edge), hold to 55
    }

    // far-coping air: big ollie + grab (no flip — the rising wall eats airtime)
    if (bot.seq >= 0) {
        bot.seq++
        if (bot.seq === 1) pad.a = true
        if (bot.seq >= 14 && bot.seq < 28) pad.a = true
        if (bot.seq >= 34) { bot.seq = -1; bot.cool = 40 }
    } else if (bot.i === 5 && st.x <= -41.5 && st.speed > 4 && !st.air) {
        bot.seq = 0
    }

    // gap line: pop at the lip, grab over the hole, release before landing;
    // v1 adds the FLIP — the pump holds B up the kicker face, so the press
    // waits for the first airborne tick that arrives with B released, giving a
    // real rising edge; the 57-tick gap air then clears the 300° bail floor.
    if (bot.gseq > 0) {
        bot.gseq++
        if (bot.gseq === 1) pad.a = true
        if (bot.v === 1 && st.air && !bot.flipF && !bot.bWas) { pad.b = true; bot.flipF = true }
        if (bot.gseq >= 10 && st.z < 8.2) pad.a = true
        if (bot.gseq > 70) { bot.gseq = 0; bot.flipF = false }
    } else if (bot.i === 2 && !st.air && st.z > 1.6 && st.z < 3.6 && st.speed > 4 && bot.seq < 0) {
        bot.gseq = 1
    }

    // rail entry: pop before the middle so the fall lands on the rail
    if (bot.i === 7 && !st.air && st.speed > 4 && Math.hypot(st.x - WP[7].x, st.z - WP[7].z) < 2.6 && bot.seq < 0 && bot.gseq === 0) {
        bot.rpulse = 2
    }
    if (bot.rpulse > 0) { pad.a = true; bot.rpulse-- }

    // U-turn at the far wall
    if (st.x <= -43.5 && Math.cos(st.heading) < -0.05) {
        pad.right = true
        if (st.slope > 0.18 && !st.air) pad.b = true
        if (bot.m > 2) bot.m = 0
        return pad
    }
    if (bot.i === 5 && st.x < -30 && Math.cos(st.heading) > 0.2) bot.i = 6

    // steer toward waypoint
    if (bot.i < WP.length) {
        const w = WP[bot.i]
        if (Math.hypot(st.x - w.x, st.z - w.z) < w.r) bot.i++
        const err = wrap(Math.atan2(w.z - st.z, w.x - st.x) - st.heading)
        const s = Math.max(-1, Math.min(1, err * 2.6))
        if (s > 0.12) pad.right = true
        if (s < -0.12) pad.left = true
    }

    // pump the transitions
    if (st.slope > 0.18 && st.speed < 10 && !st.air) pad.b = true

    if (bot.cool > 0) bot.cool--
    return pad
}

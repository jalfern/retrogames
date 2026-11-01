/**
 * RALLY pace-card sensor (#1427) — the model seat's eyes.
 *
 * The spine rule (docs/AI.md): brains never touch the sim heap directly; this
 * is the only seam. It reports EXACTLY what a fair driver can perceive:
 *   - the pace card (what the co-driver has called — the audio channel),
 *   - the road the line of sight actually reaches (gs.vis, the same honest
 *     crest trim the renderer uses — corners behind a crest are NOT reported,
 *     even though the stage truth holds them),
 *   - the ego pose the driver sees on their own HUD (speed, cross position,
 *     heading, lap counter).
 * No field is ever missing: a hole is null + conf 0 (percept.js law).
 *
 * `sensor: 'ram'` because it reads the sim's own state and TRIMS it to sight;
 * the honesty of the trim is what rallycheck's #1427 gates pin.
 */

import { makePercept } from '../../../ai/percept.js'
import { cornerAhead, distAhead } from '../stage.js'
import { callLabel } from '../calls.js'

const q = (x, n = 100) => Math.round(x * n) / n

export function senseRally(gs) {
    const car = gs.car
    const st = gs.stage
    const fog = Math.floor(gs.vis)

    // the audio channel: the nearest live card entry still ahead (the same
    // 700-unit window the driver's eyes scan on the HUD)
    let note = null
    for (const n of gs.card) {
        if (n.atS == null) continue
        const d = distAhead(st, car.s, n.atS)
        if (d > 0 && d < 700 && (!note || d < note.d)) note = { d, dir: n.dir, sev: n.sev }
    }

    // the visible road ONLY: cornerAhead through gs.vis, never raw stage truth
    const corners = cornerAhead(st, car.s, fog)
        .map((c) => ({ d: Math.round(c.d), dir: c.dir, sev: c.sev }))

    return makePercept({
        room: `stage:${gs.seed}:${gs.weather}`,
        ego: { x: q(car.lat), y: Math.round(car.s), dir: q(car.align, 1000), moving: car.v > 0.05, conf: 1 },
        actors: [],
        inventory: [],
        message: note
            ? { text: `${callLabel({ dir: note.dir, sev: note.sev })} in ${Math.round(note.d)}`, conf: 1 }
            : { text: null, conf: 0 },
        score: gs.lapsDone,
        moves: gs.tick,
        extra: {
            v: q(car.v, 1000),
            off: !!car.off,
            fog,
            corners,
            note: note ? { d: Math.round(note.d), dir: note.dir, sev: note.sev } : null,
            done: !!gs.done,
            conf: 1,
        },
        ts: gs.tick,
        sensor: 'ram',
    })
}

// #2402 — the pad→input fold, verbatim from index.jsx, in one shared module.
// The tab (contract seats, __emberwoodTest.step) and the golden-trace harness
// (scripts/goldentrace.mjs) decode recorded `retrogames-rec/v1` pads through
// THIS function, so a replay is the same fold the browser runs — the sim was
// already shared, now the input decode is too. `prev` is the caller's
// per-seat edge memory ({a,b,b2,up,down}); the function mutates it, matching
// the inline original exactly.

export function padToInput(pad, prev) {
    const lx = (pad.right ? 1 : 0) - (pad.left ? 1 : 0) || (pad.x || 0)
    const ly = (pad.down ? 1 : 0) - (pad.up ? 1 : 0) || (pad.y || 0)
    const inp = {
        lx: Math.abs(lx) > 0.15 ? lx : 0, ly: Math.abs(ly) > 0.15 ? ly : 0,
        aHeld: !!pad.a, aPressed: !!pad.a && !prev.a, aReleased: !pad.a && prev.a,
        bPressed: !!pad.b && !prev.b, bHeld: !!pad.b, bReleased: !pad.b && prev.b,
        cPressed: !!pad.b2 && !prev.b2,
        upPressed: !!pad.up && !prev.up, downPressed: !!pad.down && !prev.down,
    }
    prev.a = !!pad.a; prev.b = !!pad.b; prev.b2 = !!pad.b2; prev.up = !!pad.up; prev.down = !!pad.down
    return inp
}

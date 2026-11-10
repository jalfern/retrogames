// #1871 helper — bombdrive's strike gates used to REMEMBER that seed 7 round 1
// parks a wrong cut under the cursor. THE DRAIN (#1909) and THE RAIL (#1917)
// both consume module-rng draws at bomb-build time, so the remembered premise
// went stale: seed 7's round-1 bomb became N1 with the RED wire at index 0, the
// press SOLVED the module, and two gates turned red (#1888's playtest surfaced
// it). The premise is now DERIVED: the panel the browser paints is read back
// through the RULEBOOK — the same table the printed page, the CPU partner and
// the solver use — until the cursor sits on a wire the rule provably does not
// want. No seed is trusted, so the next generator move cannot orphan the gate.

import { RULEBOOK } from '../../src/games/TalkMeDown/engine.js'

// simState module + features -> the rulebook's target for that module.
// simState strips `lit` to a 0/1 flag and `cut` to 0/1; the rules want the
// live objects' shape, so the flags are restored before the rule runs.
export function wrongWireAt(state) {
    const m = state.modules[state.cursor.mod]
    if (!m || m.solved || m.locked || !m.wires) return null
    const rule = RULEBOOK[m.type].find((r) => r.id === m.stamp)
    if (!rule) return null
    const wires = m.wires.map(([color, lit, cut]) => ({ color, lit: !!lit, cut: !!cut }))
    const target = rule.target(
        { ...state, serialDigit: Number(String(state.serial).slice(-1)) },
        { ...m, wires },
        state.modules,
    )
    if (typeof target !== 'number' || target < 0) return null
    const free = wires.findIndex((w, i) => i !== target && !w.cut)
    return free < 0 ? null : { stamp: m.stamp, target, wrong: free, cursor: state.cursor.sub }
}

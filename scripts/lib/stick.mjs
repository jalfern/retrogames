// The ONE stick-mapping law: world delta + camera yaw -> (mx, my), exactly as
// index.jsx's frame loop feeds engine.update (raw pad values; the engine rotates
// by st.camYawEff and negates nothing, while the hook negates y for glass).
// Every driver and probe in this repo used to hand-roll this — and three of them
// got the signs wrong, which is how a bot spent a week "walking" backwards into
// guards and a chase-measurement suite reported three jobs surviving point-blank
// arrests. The full stick is also dampened by the engine (it is a thumb, not an
// actuator), so `walkStep`/`dashStep` are exported too: anyone measuring who
// escapes must rescale the ACTOR with them, or measure a number nobody walks.
export function stickTo(camYaw, dx, dz) {
    const s = Math.sin(camYaw), c = Math.cos(camYaw)
    const m = Math.hypot(dx, dz) || 1
    const ux = dx / m, uz = dz / m
    return [uz * s - ux * c, ux * s + uz * c]
}
// Nominal metres per second per gait, and the pad fraction that achieves them.
// Measured in the live engine, not from a constant nobody checked.
export const GAITS = { walk: 2.75, crouch: 1.35, dash: 5.0 }
export function stepScale(dt, gait, achievedMeters) {
    const want = GAITS[gait] * dt
    return achievedMeters > 1e-4 ? want / achievedMeters : 1
}

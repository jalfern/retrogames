// SMASH TV — HUD spec (pure: the component draws exactly this).
//   the POWER label sits BELOW the energy bar (the old baseline-20 label
//   clipped the bar's right end at 256 px), a BOMB-ready pip lights at the
//   firebomb cost, the rack name flashes for one second after a pickup, and
//   the HI readout rolls up to the new high one sixthteenth of the gap per
//   frame (right-hand digits move first, like the cabinet's odometer).

// right block geometry, native 256 px, HUD_H = 24
export const BAR = { x: 160, y: 12, w: 78, h: 5 }
export const PIP = { x: 240, y: 12, w: 4, h: 5 }
export const POWER_LABEL = { x: 244, y: 23, size: 6 }
export const ICON = { x: 160, y: 4, w: 12, h: 8 }

// the label box (baseline y, top ~= y - size * 0.8) must clear the bar bottom
export const labelClearsBar = () => POWER_LABEL.y - POWER_LABEL.size * 0.8 >= BAR.y + BAR.h

// the pip lights exactly at the firebomb cost, and sits in the strip beside the bar
export const bombReady = (energy, cost) => energy >= cost
export const pipFits = () => PIP.x >= BAR.x + BAR.w && PIP.x + PIP.w <= 256 && PIP.y + PIP.h <= 24

// the rack name flashes for one second (60 ticks) after a pickup
export const RACK_FLASH = 60

// the HI readout: close 1/16 of the remaining gap per frame, never overshoot
export const HI_ROLL_DIV = 16
export const hiRoll = (cur, target) => {
    if (cur >= target) return target
    return Math.min(target, cur + Math.max(1, Math.ceil((target - cur) / HI_ROLL_DIV)))
}

// #508: a DOWN seat's slot blinks a respawn countdown so a partner's death
// reads through the kill-shake. deadT counts deadFreeze -> 0, so the whole
// seconds left is ceil(deadT/60); the slot blinks on a 4-tick cadence.
export const RESPAWN_BLINK_SHIFT = 2
export const respawnState = (deadT, tick) => {
    if (deadT <= 0) return { down: false, on: true, secs: 0 }
    return { down: true, on: (tick >> RESPAWN_BLINK_SHIFT) % 2 === 0, secs: Math.max(1, Math.ceil(deadT / 60)) }
}

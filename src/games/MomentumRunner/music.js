// MOMENTUM RUNNER — the music seam (#833). Pure, browser-free, audited by runnercheck.
//
// SSX (#780) taught the arcade that a bed which reacts to play reads as a
// living soundtrack: the cabinet lifts its tempo with your speed. The runner's
// whole language is speed, so the sector bed rides the same seam — the pinned
// grid in AudioController.MUSIC is the RESTING tempo, held while you coast at
// the flat-run cap (RUN_TOP); from there the step tightens linearly to
// (1 - LIFT) at VMAX, so a downhill/boost run pushes the music ahead of you
// exactly when the screen already does (speed lines, camera lead).

import { RUN_TOP, VMAX } from './sim.js'

export const LIFT = 0.16

export function musicStep(baseStep, spd) {
    return baseStep * Math.max(1 - LIFT, 1 - LIFT * Math.max(0, spd - RUN_TOP) / (VMAX - RUN_TOP))
}

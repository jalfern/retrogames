// Shared attract-message plumbing (ART.md rule 6, #365).
//
// A canvas title keeps ONE informational line on screen at a time and cycles
// it, so it never stacks a wall of controls/rules text over the demo. Titles
// that render their attract on canvas use cycleAttract to pick this frame's
// line from a short list; React titles use <AttractMessage> instead.

export const cycleAttract = (tick, msgs, hold = 144) =>
    msgs.length ? msgs[Math.floor(tick / hold) % msgs.length] : ''

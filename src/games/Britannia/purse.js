// PURSE (#2345) — gold rides with the pilgrim, and passage is not free.
// In the original (Ultima IV, Origin 1985) the party carries gold from the
// first minute (the HUD's GOLD 250), and no captain weighs anchor without a
// fare. Stage 2's shops will sell, trade and loot; until that economy exists
// the land keeps the purse alive: the eight gate-towns tithe their Avatar at
// every day turn. The tithe is OURS, not Origin's — the README's honest tail
// says so, and stage 2 replaces it with real income.
// Pure + deterministic: numbers in, numbers out; never positions or flags.

export const START_GOLD = 250 // the original's starting purse
export const FARE = 5 // gold per boarding. The original's fares ran by port
// distance (5/10/25); stage 1 has no port pairs, so we honour its RULE —
// every passage is paid for, in gold — rather than fake its rows (#1862
// doctrine). Per-port fares return with stage 2's docks.
export const TRIBUTE = 20 // the day-turn tithe of the eight gate-towns

// Boarding pays the captain: a sound purse lightens by the fare; a light one
// is refused — the gold stays, the land keeps the pilgrim, the law just says
// no (the chapel-stone pattern: refusal with a cooldown, never a lie).
export function payToll(gold) {
    const g = gold > 0 ? gold : 0
    if (g >= FARE) return { paid: true, gold: g - FARE }
    return { paid: false, gold: g }
}

// The day turn pays the tithe — and the tithe never lifts the purse above
// the starting bounty: this economy taxes the land, it does not mint gold.
export function tribute(gold) {
    const g = gold > 0 ? gold : 0
    return Math.min(START_GOLD, g + TRIBUTE)
}

// #2351: the toll made SEEN before the step. A captain who can be paid moors
// his boat at the waterline (reach 1); a light purse sees her ride an extra
// tile out — the refusal reads on the water before the toast says it. Pure
// like the rest of the purse: gold in, a distance out.
export function moorReach(gold) {
    const g = gold > 0 ? gold : 0
    return g >= FARE ? 1 : 2
}

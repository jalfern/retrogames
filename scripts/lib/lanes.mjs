// lanes.mjs — the Studio fleet planner (#1258). Pure core; the IO shell is
// scripts/lanes.mjs (issues JSON on stdin), the gates are scripts/lanecheck.mjs.
//
// Jon's brief: 2 builder slots + 1 QA slot on the Studio, every lane works the
// WHOLE queue, no lane idles while anything claimable waits, and never two
// lanes on one issue (#878). One place computes the claim order so the warden,
// the board and both playbooks read the same ladder:
//
//   Builder ladder — games first ("builders the reverse"):
//     corpses (`building`: half-built or multi-stage) → jalfern `steer` →
//     `next` → oldest `game-queue` → oldest unclaimed `feedback` (the FORGE.md
//     "borrow the QA lane" rule, now a ranked position instead of a last
//     resort). Items a QA lane holds (`building-qa`) never enter the ladder.
//   QA studio — feedback first (FORGE-QA.md keeps its own pick order inside
//     that); when NO free feedback item exists it may take the queue, but only
//     when queue items outnumber the free builder slots — a queued game goes to
//     a builder first, and the #878 flagship-gap fallback stays cheaper still
//     (the warden only asks it when neither kick happened).
//   QA mini (#1290) — the same whole-queue right, one step behind studio: mini
//     joins the queue only when items remain AFTER builders and studio each
//     take theirs (studioReserve = studio lane idle+up+queue-bound, passed in
//     as studioUp by the warden). If studio is down or busy, its share goes to
//     mini instead — no lane idles while a claimable game waits. Transient
//     over/under-reserve is harmless: claim time (#878) owns collision safety.
//
// Targets are assigned to FREE slots in slot order (a before b): a busy slot
// takes nothing, so the next free slot inherits its ladder position — the two
// builders always aim at two different issues. Actual collision safety lives
// at claim time (scripts/forge-claim.sh + qa-claim.sh, cross-namespace); this
// plan only avoids the wasted race.

export const OWNER = 'jalfern'

const has = (i, name) => (i.labels || []).some((l) => (typeof l === 'string' ? l : l.name) === name)
export const isOpenIssue = (i) => i.state === 'open' && !i.pull_request
const parked = (i) => has(i, 'needs-approval') || has(i, 'waiting-jon') || has(i, 'question') || has(i, 'stalled')
const qaHeld = (i) => has(i, 'building-qa')
const byAge = (a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0)

// builderLadder — every claimable issue for a builder slot, best first.
export function builderLadder(issues, { owner = OWNER } = {}) {
    const ok = (issues || []).filter((i) => isOpenIssue(i) && !parked(i) && !qaHeld(i))
    const isB = (i) => has(i, 'building')
    const steer = (i) => has(i, 'steer') && i.user && i.user.login === owner
    const tier = [...ok.filter(isB),
        ...ok.filter((i) => !isB(i) && steer(i)),
        ...ok.filter((i) => !isB(i) && !steer(i) && has(i, 'next')),
        ...ok.filter((i) => !isB(i) && !steer(i) && !has(i, 'next') && has(i, 'game-queue')).sort(byAge),
        ...ok.filter((i) => !isB(i) && !steer(i) && !has(i, 'next') && !has(i, 'game-queue') && has(i, 'feedback')).sort(byAge)]
    const seen = new Set()
    return tier.filter((i) => (seen.has(i.number) ? false : (seen.add(i.number), true)))
}

// lanePlan — targets + kick flags for the two builder slots and the QA lanes'
// queue-fallthrough flags. freeA/freeB = that slot has no live session;
// bLoaded = the slot-b launchd job exists (trial not reverted);
// studioUp (#1290) = the studio QA lane is idle, its model answers and its job
// exists — i.e. it will consume one queue item this tick, so mini reserves it.
export function lanePlan({ issues = [], owner = OWNER, freeA = false, freeB = false, bLoaded = true, studioUp = true } = {}) {
    const ladder = builderLadder(issues, { owner })
    const rest = ladder.slice()
    const targets = { a: null, b: null }
    if (freeA && rest.length) targets.a = rest.shift().number
    if (freeB && bLoaded && rest.length) targets.b = rest.shift().number
    const kick = { a: targets.a != null, b: targets.b != null }

    const ok = issues.filter((i) => isOpenIssue(i) && !parked(i))
    const feedbackFree = ok.filter((i) => has(i, 'feedback') && !qaHeld(i) && !has(i, 'building')).length
    const queueFree = ok.filter((i) => (has(i, 'game-queue') || has(i, 'next') || has(i, 'steer'))
        && !has(i, 'building') && !qaHeld(i)).length
    const freeSlots = (freeA ? 1 : 0) + (freeB && bLoaded ? 1 : 0)
    const qaStudioQueue = feedbackFree === 0 && queueFree > freeSlots
    // #1290: mini is the LAST lane — it takes the queue only when items remain
    // after builders and (if it can run) studio have each taken theirs.
    const studioReserve = studioUp && qaStudioQueue ? 1 : 0
    const qaMiniQueue = feedbackFree === 0 && queueFree > freeSlots + studioReserve

    return {
        targets,
        kick,
        qaStudioQueue,
        qaMiniQueue,
        counts: { ladder: ladder.length, feedbackFree, queueFree, freeSlots, studioReserve },
    }
}

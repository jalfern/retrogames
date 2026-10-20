// seat.js — who is "me" and who is "the other hero" on THIS screen (#554).
// Canonical seats on both boxes: gs.hero is the host's entity, gs.partner the
// guest's. On the guest self is gs.partner, so the hero it must still draw is
// gs.hero — drawing only gs.partner (the old bug) left the host invisible there.

export function selfHero(gs, role) {
    return role === 'guest' && gs.partner ? gs.partner : gs.hero
}

// the hero that isn't self, present whenever a second hero exists (2P or online)
export function otherHero(gs, role) {
    return gs.partner ? (selfHero(gs, role) === gs.hero ? gs.partner : gs.hero) : null
}

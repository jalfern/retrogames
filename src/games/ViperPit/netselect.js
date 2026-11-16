// netselect — the online select-start gate (#2476), as a pure state machine so
// the whole decision is provable in Node.
//
// The wire carries the guest's pick on its own 'pick' message; the host is the
// one who launches the match. Before #2476 the host launched on its own FIGHT
// press and backfilled a missing guest pick with a seeded placeholder
// (`guestPick.char || seededChar(...)`), so a pick that landed AFTER the host
// started was silently dropped — the challenger would find themselves fighting
// as a stranger, on both boxes. This is the IronRing #1761 law, ported: the
// host may only launch once the guest's pick has arrived, and a pick that
// arrives after the host has already committed to FIGHT must still fire the
// start, with the guest's REAL choice — never a placeholder.

export function createHostSelect() {
    let committed = false // the host pressed FIGHT
    let hostChar = null   // the host's fighter, chosen at commit
    let guestChar = null  // the guest's pick, from the wire
    let launched = false  // the match already started — no second launch

    return {
        get state() { return { committed, hostChar, guestChar, launched } },
        get waiting() { return committed && guestChar == null && !launched },

        // Host presses FIGHT. `commit` returns { start: {hostChar, guestChar} | null }.
        // When the guest has not picked yet, start is null and `waiting` is true —
        // the host stays on select until the guest's pick arrives.
        commit(char) {
            if (launched) return { start: null, waiting: false }
            hostChar = char
            committed = true
            // The gate: the host may launch only once the guest's pick has
            // arrived. If it has not, defer — the match starts when the pick
            // lands (onPick), never with a seeded placeholder standing in for
            // the challenger's choice.
            if (guestChar == null) return { start: null, waiting: true }
            launched = true
            return { start: { hostChar, guestChar }, waiting: false }
        },

        // A guest 'pick' packet lands. If the host has already committed, this
        // is the moment to launch (the gate releases); otherwise just store it.
        // Re-picks before launch update the choice; a re-pick after the match
        // has started never relaunches it.
        onPick(char) {
            if (launched) return { start: null, waiting: false }
            guestChar = char
            if (!committed) return { start: null, waiting: false }
            launched = true
            return { start: { hostChar, guestChar }, waiting: false }
        },

        // The challenger left the room (#2476: no ghost waits). Whatever was
        // pending — a stored pick, a committed-but-deferred FIGHT, or both —
        // is void: the next joiner's pick is fresh and the host's FIGHT press
        // re-arms the wait.
        reset() { committed = false; hostChar = null; guestChar = null; launched = false }
    }
}

// ---- #2482 select polish (presentation-only) --------------------------------------
// What the net select screen SAYS and how it breathes, as pure answers so the
// Node harness can pin the exact strings and curves. None of this touches the
// gate above, the pads, or the netplay hashes.

export function gateLines({ role, code = '', waiting = false, guestId = null, guestName = null }) {
    // Host side: the FIGHT prompt or the (breathing) wait line. Guest side:
    // once they pick, the choice prints and LOCKS — it survives a re-seat
    // because it is derived from myPick, which the re-declare law keeps.
    if (role === 'host') {
        return {
            header: 'HOST — CHOOSE',
            bottom: waiting ? `ROOM ${code} — AWAITING CHALLENGER'S PICK…` : `ROOM ${code} — SPACE: FIGHT`,
            pulse: waiting,
            lockedId: null,
        }
    }
    if (guestName) {
        return {
            header: `${guestName} — PICK LOCKED`,
            bottom: 'PICK LOCKED — WAITING FOR HOST…',
            pulse: true,
            lockedId: guestId || null,
        }
    }
    return { header: 'GUEST — CHOOSE', bottom: 'WAITING FOR HOST…', pulse: false, lockedId: null }
}

export function awaitingPulse(t) {
    // The stall breathes like the attract PRESS prompt (the shimmer law) — but
    // slower, and never under 0.50 so the line stays readable at its dimmest.
    return +(0.5 + 0.4 * (0.5 + 0.5 * Math.sin(t / 480))).toFixed(3)
}

export function attractTag({ active, role, phase }) {
    // #2482 item 4: the marquee advertises the open room — host side, lobby
    // waiting for a challenger. A guest, an offline cabinet, or a live match
    // never tags.
    return !!(active && role === 'host' && phase === 'waiting')
}

export function cardRim(hovered, def) {
    // #2482 item 5: the selected card's rim wears the fighter's OWN accent
    // instead of flat cabinet teal (five identities, five rims); idle cards
    // keep the dark frame.
    return hovered ? `#${def.color.accent.toString(16).padStart(6, '0')}` : '#31364a'
}

export function arrivalCue(arrived, id) {
    // #2482 item 2: a challenger 'pick' packet lit this card; returns the
    // cue's alpha for this frame (full, then fading over the last 24 ticks)
    // or null when this card is not the arrival.
    return arrived && arrived.t > 0 && arrived.char === id ? +Math.min(1, arrived.t / 24).toFixed(3) : null
}

// netselect — the online select-start gate (#1761 item 4), as a pure state
// machine so the whole decision is provable in Node.
//
// The wire carries the guest's pick on its own 'pick' message; the host is the
// one who launches the match. Before #1761 the host launched on its own FIGHT
// press and backfilled a missing guest pick with a seeded placeholder
// (`guestPick.char || seededChar(...)`), so a pick that landed AFTER the host
// started was silently dropped — the challenger would find themselves fighting
// as a stranger. The host may therefore only launch once the guest's pick has
// arrived, and a pick that arrives after the host has already committed to
// FIGHT must still fire the start.

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
        // A re-pick after the match has started never relaunches it.
        onPick(char) {
            guestChar = char
            if (!committed || launched) return { start: null, waiting: false }
            launched = true
            return { start: { hostChar, guestChar }, waiting: false }
        },

        reset() { committed = false; hostChar = null; guestChar = null; launched = false },
    }
}

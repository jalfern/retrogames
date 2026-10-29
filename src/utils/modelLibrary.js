// Shared 3D model LIBRARY index (#1140) — where to look for free models
// before modelling anything, and the license gate that decides whether a
// candidate may ship. The shelf (`modelShelf.js`) is what the arcade owns;
// this index is links + provenance, never mirrors. Side-effect free for the
// harness: nothing touches fetch until browseLibraries() is called.
//
//   const gate = licenseGate('CC-BY-4.0 + CC-BY-NC-4.0')  // 'review'
//   const libs = await browseLibraries()
//   const simready = await library('nvidia-simready')
//   const ship = await shortlist({ gate: 'ship', physics: false })
//
// Gates: 'ship' (CC0) < 'credit' (attribution) < 'review' (per-asset check)
// < 'never' (no redistribution). A multi-license string takes the strictest.

const base = () => (import.meta.env && import.meta.env.BASE_URL) || '/'

export function librariesUrl() {
    return `${base()}models/libraries.json`
}

let cache = null

export async function browseLibraries(force = false) {
    if (force || !cache) {
        const res = await fetch(librariesUrl())
        if (!res.ok) throw new Error(`libraries index ${res.status}`)
        cache = await res.json()
    }
    return cache
}

export async function library(id) {
    const idx = await browseLibraries()
    return idx.libraries.find((l) => l.id === id) || null
}

// SPDX-ish -> gate rank. Unknown licenses are never 'ship' by default: an
// unrecognised string is a review, not a free pass.
const RANK = { ship: 0, credit: 1, review: 2, never: 3 }
const GATES = ['ship', 'credit', 'review', 'never']

export function licenseGate(license) {
    const tokens = String(license || '').split(/\s*\+\s*/).map((t) => t.trim()).filter(Boolean)
    if (!tokens.length) return 'review'
    let rank = null
    for (const t of tokens) {
        let r
        if (/CC0|PDM|Public.?Domain|CC-PDDC/i.test(t)) r = RANK.ship
        else if (/NC/i.test(t)) r = RANK.review
        else if (/CC-BY/i.test(t)) r = RANK.credit
        else if (/SCEA|\bARR\b|Restricted|GPL|AGPL|BSD.?Clause.?3/i.test(t)) r = RANK.never
        else if (/LegalMark|Trademark|TM/i.test(t)) r = RANK.review
        else r = RANK.review
        rank = rank === null ? r : Math.max(rank, r)
    }
    return GATES[rank]
}

// A shortlist entry's declared gate must equal what the law computes from its
// license string — data cannot drift from the gate.
export function gateFor(entry) {
    return licenseGate(entry && entry.license)
}

export async function shortlist(filter = {}) {
    const idx = await browseLibraries()
    return idx.models.filter((m) =>
        (filter.library === undefined || m.library === filter.library) &&
        (filter.gate === undefined || m.gate === filter.gate) &&
        (filter.physics === undefined || !!m.physics === filter.physics) &&
        (!filter.need || (m.use || '').toLowerCase().includes(filter.need.toLowerCase())))
}

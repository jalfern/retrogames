import React from 'react'

// SYNC BADGE (#1711 S7) — the small honest pill: what happened to the takes
// this phone is holding for the PLAICRAFT store. Rules live in
// src/utils/syncBadgeCore.js (pure, recordcheck-pinned); this is the paint.
//
// It sits bottom-center, clear of the VirtualControls pads, and never steals a
// touch (pointer-events:none). The look is the PLAICRAFT system family —
// mono glyphs, arcade border, amber while pending, green when the store has
// it — ConsentGate's sibling, not another game's skin. DOM truth for the
// harness: [data-sync-badge="<kind>"].

const KIND_STYLE = {
    syncing: 'border-[#ffd840] text-[#ffd840] animate-pulse',
    queued: 'border-[#ffd840] text-[#ffd840]',
    uploaded: 'border-[#39ff14] text-[#39ff14]',
    synced: 'border-[#39ff14] text-[#39ff14]',
}

const SyncBadge = ({ view = { kind: 'hidden' } }) => {
    if (!view || view.kind === 'hidden') return null
    return (
        <div
            data-sync-badge={view.kind}
            aria-live="polite"
            className={`pointer-events-none fixed left-1/2 bottom-2 z-[9500] -translate-x-1/2 select-none rounded-md border-2 bg-black/80 px-3 py-1.5 font-mono text-xs font-bold tracking-widest ${KIND_STYLE[view.kind] || KIND_STYLE.queued}`}
        >
            {view.text}
        </div>
    )
}

export default SyncBadge

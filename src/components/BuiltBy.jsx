/**
 * BuiltBy — the "who built this" tag on the arcade menu (issue #172).
 *
 * The registry field is the source of truth (`builtBy` on each GAMES entry):
 *   'qwen'   — built by hand with Qwen (the Sep 2026 run)
 *   'forge'  — built by THE FORGE (the autonomous game lane)
 *   'claude' — built with Claude (the original arcade, Feb–Mar 2026)
 *
 * Presentational only: a pixel dot in the builder's color + the name, with a
 * tooltip saying what it means. `scripts/builtbycheck.mjs` asserts every
 * registry entry carries a valid value and that this tag is actually wired
 * into the menu, so a new game cannot ship with no attribution.
 */

const BUILT_BY = {
    qwen: { name: 'QWEN', color: '#00e676', tip: 'built by hand with Qwen' },
    forge: { name: 'FORGE', color: '#ffb347', tip: 'built by THE FORGE' },
    claude: { name: 'CLAUDE', color: '#60a5fa', tip: 'built with Claude' },
}

export default function BuiltBy({ builtBy }) {
    const b = BUILT_BY[builtBy]
    if (!b) return null
    return (
        <span
            data-built-by={builtBy}
            className="absolute bottom-1.5 left-3 flex items-center gap-1.5 text-[10px] tracking-widest opacity-60 group-hover:opacity-100 transition-opacity"
            title={b.tip}
        >
            <span className="inline-block h-2 w-2" style={{ background: b.color }} />
            <span style={{ color: b.color }}>{b.name}</span>
        </span>
    )
}

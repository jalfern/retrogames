import { Link } from 'react-router-dom'
import { GAMES } from '../config/games'

const PALETTE = ['#ff5470', '#ffb347', '#4dffb8', '#66b3ff', '#c58aff',
    '#ffd166', '#00e5ff', '#ff6f00', '#7cffcb', '#f78c6b']

const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++)h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h }
const rng = seed => () => {
    seed = (seed + 0x6D2B79F5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// Tiny deterministic signature per game: mirrored 7x5 pixel mark, ~54px wide.
const Mark = ({ seed, color }) => {
    const r = rng(hash(seed))
    const grid = Array.from({ length: 5 }, () => Array(7).fill(false))
    for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) {
        const on = r() > 0.5
        grid[y][x] = on
        grid[y][6 - x] = on
    }
    const cells = []
    for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) {
        if (grid[y][x]) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />)
    }
    return (
        <svg viewBox="0 0 7 5" className="h-9 w-[54px] shrink-0 opacity-40 transition-opacity duration-300 group-hover:opacity-100"
            fill={color} shapeRendering="crispEdges" aria-hidden="true">{cells}</svg>
    )
}

const tagline = d => {
    if (!d) return ''
    const s = d.split(/\.( |\n)/)[0]
    return s.length > 120 ? s.slice(0, 118).trimEnd() + '…' : s
}
const MAKER = { qwen: '#ffd166', forge: '#ffb347', claude: '#c58aff' }
// control hint, trimmed at a word/slash boundary so it never cuts mid-token
const hintOf = c => {
    const t = (c || '').split(':')[0].trim()
    if (t.length <= 24) return t.toUpperCase()
    const cut = t.slice(0, 24)
    const b = Math.max(cut.lastIndexOf('/'), cut.lastIndexOf(' '))
    return (b > 8 ? cut.slice(0, b) : cut).trim().toUpperCase()
}

const ArcadeShowcase = () => {
    const games = GAMES.filter(g => !g.hidden)
    return (
        <div className="absolute inset-0 overflow-y-auto bg-[#0a0a0c] text-zinc-100 font-mono">
            <style>{`
                @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
                .tile { animation: rise .45s cubic-bezier(.2,.7,.2,1) both; animation-delay: var(--d); }
            `}</style>

            <header className="mx-auto max-w-7xl px-5 pt-10 pb-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="text-[9px] tracking-[0.5em] text-zinc-500 mb-2">JALFERN.COM / RETRO GAMES</p>
                        <h1 className="text-4xl md:text-5xl font-black tracking-tighter leading-none">
                            THE <span className="text-transparent bg-clip-text"
                                style={{ backgroundImage: 'linear-gradient(90deg,#ff5470,#ffb347,#4dffb8,#66b3ff)' }}>ARCADE</span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-5 text-[10px] tracking-widest text-zinc-500 pb-1">
                        <span><b className="text-zinc-200">{games.length}</b> GAMES</span>
                        <span className="hidden md:inline">100% SYNTHESIZED</span>
                        <Link to="/forge" className="text-[#ffb347] hover:text-white transition-colors">⚒ FORGE</Link>
                        <Link to="/games-classic" className="text-zinc-500 hover:text-white transition-colors">CLASSIC MENU</Link>
                    </div>
                </div>
                <div className="mt-5 h-px bg-gradient-to-r from-[#ff5470] via-[#4dffb8] to-[#66b3ff] opacity-50" />
            </header>

            <main className="mx-auto max-w-7xl px-5 pb-24">
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                    {games.map((g, i) => {
                        const color = PALETTE[hash(g.label) % PALETTE.length]
                        return (
                            <Link key={g.path} to={g.path}
                                className="tile group relative flex flex-col gap-2 border border-zinc-800/90 bg-[#0c0c0f] p-4
                                    hover:-translate-y-0.5 hover:border-[var(--a)] transition-[transform,border-color] duration-300"
                                style={{ '--a': color, '--d': `${Math.min(i, 20) * 30}ms` }}>
                                <div className="flex items-start justify-between gap-3">
                                    <span className="text-[9px] tracking-[0.3em] text-zinc-600 group-hover:text-zinc-400 transition-colors">
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                    <Mark seed={g.label} color={color} />
                                </div>
                                <h2 className="text-sm font-bold tracking-[0.14em] leading-snug">{g.label}</h2>
                                <p className="text-[10px] leading-relaxed text-zinc-500 line-clamp-2 group-hover:text-zinc-400 transition-colors">
                                    {tagline(g.description)}
                                </p>
                                <div className="mt-auto flex items-center justify-between pt-1 border-t border-zinc-800/70">
                                    <span className="text-[9px] tracking-[0.25em]" style={{ color }}>
                                        {hintOf(g.controls?.[0])}
                                    </span>
                                    <span className="flex items-center gap-1.5 text-[8px] tracking-[0.3em] text-zinc-600">
                                        {g.builtBy && <i className="h-1 w-1 rounded-full" style={{ background: MAKER[g.builtBy] || '#71717a' }} />}
                                        {(g.builtBy || '').toUpperCase()}
                                    </span>
                                </div>
                                <span className="absolute bottom-0 left-0 h-px w-0 bg-[var(--a)] transition-all duration-300 group-hover:w-full" />
                                <span className="absolute top-2 right-2 text-[9px] tracking-[0.3em] opacity-0 -translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300"
                                    style={{ color }}>
                                    PLAY ▸
                                </span>
                            </Link>
                        )
                    })}
                </div>

                <footer className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-[9px] tracking-[0.4em] text-zinc-600">
                    <span>SELECT ANY CARD TO PLAY</span>
                    <span className="opacity-70">THE ARCADE MENU · v3 · CLASSIC AT /games-classic</span>
                </footer>
            </main>
        </div>
    )
}

export default ArcadeShowcase

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

// Deterministic block-art per game: a mirrored 7x5 identicon seeded by the
// label — every game gets its own mark, no assets, nothing to go stale.
const Mark = ({ seed, color }) => {
    const r = rng(hash(seed))
    const grid = Array.from({ length: 5 }, () => Array(7).fill(false))
    for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) {
        const on = r() > 0.45
        grid[y][x] = on
        grid[y][6 - x] = on
    }
    const cells = []
    for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) {
        if (grid[y][x]) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />)
    }
    return (
        <svg viewBox="0 0 7 5" className="absolute inset-0 h-full w-full opacity-25 transition-opacity duration-500 group-hover:opacity-60"
            fill={color} shapeRendering="crispEdges" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            {cells}
        </svg>
    )
}

const tagline = d => {
    if (!d) return ''
    const s = d.split(/\.( |\n)/)[0]
    return (s.length > 130 ? s.slice(0, 128).trimEnd() + '…' : s) + '.'
}
const chips = cs => (cs || []).slice(0, 2).map(c => (c.split(':')[0] || c).slice(0, 30))
const MAKER = { qwen: '#ffd166', forge: '#ffb347', claude: '#c58aff' }

const ArcadeShowcase = () => {
    const games = GAMES.filter(g => !g.hidden)
    return (
        <div className="absolute inset-0 overflow-y-auto bg-[#0a0a0c] text-zinc-100 font-mono">
            <style>{`
                @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
                @keyframes flicker { 0%,92%,100% { opacity: .85 } 94% { opacity: .6 } 96% { opacity: .9 } }
                .tile { animation: rise .5s cubic-bezier(.2,.7,.2,1) both; animation-delay: var(--d); }
                .scan::after { content:""; position:fixed; inset:0; pointer-events:none; z-index:10;
                    background: repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 1px, transparent 1px 3px); }
            `}</style>

            <header className="relative mx-auto max-w-6xl px-6 pt-20 pb-14 scan">
                <div className="absolute inset-x-0 top-0 h-64 opacity-30"
                    style={{ background: 'radial-gradient(60% 100% at 30% 0%, #66b3ff22, transparent 70%)' }} />
                <p className="text-[10px] tracking-[0.5em] text-zinc-500 mb-4" style={{ animation: 'flicker 6s infinite' }}>
                    JALFERN.COM / RETRO GAMES
                </p>
                <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-none">
                    THE <span className="text-transparent bg-clip-text"
                        style={{ backgroundImage: 'linear-gradient(90deg,#ff5470,#ffb347,#4dffb8,#66b3ff)' }}>ARCADE</span>
                </h1>
                <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] tracking-widest text-zinc-400">
                    <span><b className="text-zinc-100">{games.length}</b> GAMES</span>
                    <span>ALL ART &amp; SOUND SYNTHESIZED AT RUNTIME</span>
                    <span>BUILT IN THE OPEN</span>
                    <Link to="/forge" className="text-[#ffb347] hover:text-white transition-colors">⚒ THE FORGE →</Link>
                    <Link to="/games" className="text-zinc-500 hover:text-white transition-colors">← CLASSIC MENU</Link>
                </div>
                <div className="mt-10 h-px bg-gradient-to-r from-[#ff5470] via-[#4dffb8] to-[#66b3ff] opacity-60" />
            </header>

            <main className="mx-auto max-w-6xl px-6 pb-32">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-auto">
                    {games.map((g, i) => {
                        const color = PALETTE[hash(g.label) % PALETTE.length]
                        const wide = i % 7 === 0
                        return (
                            <Link key={g.path} to={g.path}
                                className={`tile group relative flex flex-col border border-zinc-800 bg-[#0e0e11] overflow-hidden
                                    hover:-translate-y-1 hover:border-[var(--a)] transition-[transform,border-color] duration-300
                                    ${wide ? 'sm:col-span-2' : ''}`}
                                style={{ '--a': color, '--d': `${Math.min(i, 24) * 45}ms` }}>
                                <div className={`relative ${wide ? 'aspect-[21/6]' : 'aspect-[7/4]'} overflow-hidden`}
                                    style={{ background: `linear-gradient(135deg, ${color}14, #0e0e11 60%)` }}>
                                    <Mark seed={g.label} color={color} />
                                    <span className="absolute top-3 left-4 text-[10px] tracking-[0.35em] text-zinc-600 group-hover:text-zinc-400 transition-colors">
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                    <span className="absolute bottom-3 right-4 text-[11px] tracking-[0.3em] opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                        style={{ color }}>
                                        PLAY ▸
                                    </span>
                                </div>
                                <div className="flex flex-col gap-3 p-5 grow">
                                    <h2 className="text-xl font-bold tracking-[0.12em] leading-tight">{g.label}</h2>
                                    <p className="text-[11px] leading-relaxed text-zinc-400">{tagline(g.description)}</p>
                                    <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                                        {chips(g.controls).map((c, j) => (
                                            <span key={j} className="border border-zinc-800 px-2 py-0.5 text-[9px] tracking-wider text-zinc-500 group-hover:border-zinc-700">
                                                {c.toUpperCase()}
                                            </span>
                                        ))}
                                        {g.builtBy && (
                                            <span className="ml-auto flex items-center gap-1.5 text-[9px] tracking-[0.3em] text-zinc-600">
                                                <i className="h-1.5 w-1.5 rounded-full" style={{ background: MAKER[g.builtBy] || '#71717a' }} />
                                                {g.builtBy.toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <span className="absolute bottom-0 left-0 h-0.5 w-0 bg-[var(--a)] transition-all duration-300 group-hover:w-full" />
                            </Link>
                        )
                    })}
                </div>

                <footer className="mt-16 flex flex-col items-center gap-2 text-[10px] tracking-[0.4em] text-zinc-600">
                    <span>INSERT COIN — SELECT ANY CARD</span>
                    <span className="opacity-70">GAMES-V2 PREVIEW · NOT YET LINKED FROM THE NAV</span>
                </footer>
            </main>
        </div>
    )
}

export default ArcadeShowcase

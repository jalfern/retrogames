import { Link } from 'react-router-dom'
import { GAMES } from '../config/games'
import BuiltBy from './BuiltBy'

const SECTIONS = [
    { key: 'claude', title: 'CLAUDE — THE EARLY ARCADE' },
    { key: 'qwen', title: 'QWEN — BY HAND, NO FORGE' },
    { key: 'forge', title: 'BUILT BY THE FORGE' },
]

const GamesList = () => {
    const games = GAMES.filter((g) => !g.hidden)
    const sections = SECTIONS.map((s) => ({
        ...s,
        games: games.filter((g) => g.builtBy === s.key)
            .sort((a, b) => (b.added || '').localeCompare(a.added || '')),
    })).filter((s) => s.games.length > 0)
    return (
        <div className="absolute inset-0 overflow-y-auto bg-black text-white font-mono flex flex-col items-center p-8 pb-32">
            <div className="mt-12 mb-12 flex flex-col items-center">
                <h1 className="text-4xl tracking-widest text-[#00ff00] animate-pulse">
                    ARCADE MENU
                </h1>
                <div className="w-24 h-1 bg-[#00ff00] mt-4 opacity-50"></div>
            </div>

            {sections.map((section) => (
                <div key={section.key} data-section={section.key} className="w-full max-w-4xl mb-12">
                    <h2 className="text-sm tracking-[0.35em] text-gray-500 mb-6 border-b border-gray-800 pb-2">
                        {section.title}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {section.games.map((game) => (
                            <Link
                                key={game.path}
                                to={game.path}
                                className="group relative border-2 border-white p-6 hover:bg-white hover:text-black transition-colors duration-200"
                            >
                                <div className="flex justify-between items-center">
                                    <span className="text-xl tracking-wider font-bold">
                                        {game.label}
                                    </span>
                                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        PLAY &gt;
                                    </span>
                                </div>
                                <BuiltBy builtBy={game.builtBy} />
                            </Link>
                        ))}
                    </div>
                </div>
            ))}

            <div className="mt-16 text-xs text-gray-500 flex flex-col items-center gap-3">
                <span>SELECT A GAME TO START</span>
                <Link to="/forge" className="text-[#ffb347] hover:text-white transition-colors tracking-wider">
                    ⚒ VISIT THE FORGE — SEE WHAT GETS BUILT NEXT
                </Link>
            </div>
        </div>
    )
}

export default GamesList

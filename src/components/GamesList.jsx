import { Link } from 'react-router-dom'
import { GAMES } from '../config/games'

const GamesList = () => {
    return (
        <div className="absolute inset-0 overflow-y-auto bg-black text-white font-mono flex flex-col items-center p-8 pb-32">
            <div className="mt-12 mb-12 flex flex-col items-center">
                <h1 className="text-4xl tracking-widest text-[#00ff00] animate-pulse">
                    ARCADE MENU
                </h1>
                <div className="w-24 h-1 bg-[#00ff00] mt-4 opacity-50"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
                {GAMES.map((game) => (
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
                    </Link>
                ))}
            </div>

            <div className="mt-16 text-xs text-gray-500">
                SELECT A GAME TO START
            </div>
        </div>
    )
}

export default GamesList

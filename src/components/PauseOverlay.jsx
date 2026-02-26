import React from 'react'

const PauseOverlay = ({ game, onResume }) => {
    return (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white z-50 p-8 font-mono">
            <h1 className="text-4xl font-bold mb-4 text-[#ff0000] drop-shadow-[2px_2px_0_rgba(255,255,255,0.5)]">
                {game.label}
            </h1>

            <p className="text-lg mb-8 max-w-2xl text-center text-gray-300">
                {game.description}
            </p>

            <div className="bg-gray-900 border-2 border-white p-6 rounded-lg mb-8 min-w-[300px]">
                <h2 className="text-xl font-bold mb-4 text-[#ffff00] border-b border-gray-700 pb-2">CONTROLS</h2>
                <ul className="space-y-2">
                    {game.controls.map((control, i) => (
                        <li key={i} className="flex items-center">
                            <span className="text-[#00ff00] mr-2">▶</span>
                            {control}
                        </li>
                    ))}
                    <li className="flex items-center pt-2 mt-2 border-t border-gray-800 text-gray-400">
                        <span className="mr-2">?</span>
                        Toggle Help / Pause
                    </li>
                </ul>
            </div>

            <button
                onClick={onResume}
                className="px-8 py-3 bg-[#ff0000] text-white font-bold text-xl hover:bg-[#cc0000] transition-colors border-2 border-white animate-pulse"
            >
                RESUME GAME
            </button>

            <div className="mt-4 text-sm text-gray-500">
                Press '?' or click Resume to continue
            </div>
        </div>
    )
}

export default PauseOverlay

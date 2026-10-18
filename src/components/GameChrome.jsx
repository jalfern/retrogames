import { useLocation, useNavigate } from 'react-router-dom'
import { GAMES } from '../config/games'
import { dispatchPause } from '../utils/pauseEvent'

// Shared in-game chrome (#437): two always-visible corner buttons on every game
// screen, sized for a thumb inside the iOS safe area. Installed in fullscreen
// PWA mode there is no address bar and no '?' key, so without these a phone
// player has no way back to the showcase and no way to pause.
//
// PAUSE does NOT reimplement pause per game — it dispatches the same synthetic
// '?' KeyboardEvent VirtualControls already uses for arrows, so it lands in each
// game's own pause handler and does exactly what '?' does there (incl. Mario
// Original, whose '?' returns to the /mario options menu).

const isGameRoute = (pathname) =>
    pathname === '/' || GAMES.some((g) => g.path === pathname)

const btn = (theme) =>
    `z-[60] font-mono text-[10px] tracking-[0.2em] select-none px-2.5 py-1.5 rounded-md border backdrop-blur-sm transition-opacity duration-300 opacity-50 hover:opacity-100 active:opacity-100 ${theme === 'dark' ? 'text-white border-white/25 bg-black/40' : 'text-black border-black/25 bg-white/50'}`

const GameChrome = ({ theme = 'light' }) => {
    const location = useLocation()
    const navigate = useNavigate()
    if (!isGameRoute(location.pathname)) return null

    return (
        <>
            <button
                data-nav="arcade"
                aria-label="Arcade"
                onClick={() => navigate('/games')}
                className={`${btn(theme)} fixed`}
                style={{ top: 'calc(0.75rem + var(--sat, 0px))', left: 'calc(0.75rem + var(--sal, 0px))' }}
            >
                ARCADE
            </button>
            <button
                data-nav="pause"
                aria-label="Pause"
                onClick={dispatchPause}
                className={`${btn(theme)} fixed`}
                style={{ top: 'calc(0.75rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}
            >
                PAUSE
            </button>
        </>
    )
}

export default GameChrome

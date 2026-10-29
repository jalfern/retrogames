import { useState, useEffect, useContext, useCallback, useMemo, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GAMES } from './config/games'
import GamesList from './components/GamesList'
import GamepadBridge from './components/GamepadBridge'
import GameChrome from './components/GameChrome'
import LinkPads from './components/LinkPads'
import PadLink from './pages/PadLink'
import { PadContext } from './components/padContext'
import { GameLabelContext } from './components/gameLabelContext'
import { padButton, extraButtonsOf } from './components/gamepadMap'
import { methodOf } from './utils/onePad'
import ArcadeShowcase from './pages/ArcadeShowcase'
import ForgeBoard from './pages/ForgeBoard'
import ForgeLog from './pages/ForgeLog'
import ShiftReport from './pages/ShiftReport'
import { audioController } from './utils/AudioController'

function RandomHome() {
  const { setGameInfo } = useContext(GameLabelContext)
  const [GameComponent, setGameComponent] = useState(null)
  const [randomGame, setRandomGame] = useState(null)

  useEffect(() => {
    const g = GAMES[Math.floor(Math.random() * GAMES.length)]
    setGameComponent(() => g.component)
    setRandomGame(g)
        setGameInfo(g.label, g.theme, g.footer)
  }, [setGameInfo])

  useTapStart(randomGame)

  if (!GameComponent) return null
  return (
    <Suspense fallback={<LoadingCard />}>
      <GameComponent />
    </Suspense>
  )
}

// Shown while a lazy route chunk (RACCOON HEIST's three.js bundle) downloads.
function LoadingCard() {
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <p className="font-mono text-xs tracking-[0.35em] text-neutral-500 animate-pulse">
        OPENING THE BACK DOOR…
      </p>
    </div>
  )
}

// #430 — tap-to-start in the shared shell. A game that declares `tapStart`
// gets the shell contract for real ("any keydown or pointerdown starts the
// game"): a tap anywhere synthesizes the start key (Space), exactly like a
// keyboard keydown — no per-game pointerdown handlers. Taps on the on-screen
// controls ([data-vc]) and on UI chrome keep their own semantics; pointer-
// method games own their canvas and opt out by declaration.
function useTapStart(game) {
  useEffect(() => {
    if (!game || !game.tapStart) return
    const pad = game.pad || null
    if (pad && methodOf(pad) === 'pointer') return
    const onPointerDown = (e) => {
      const t = e.target
      if (t instanceof Element && t.closest('[data-vc], button, a, input, select, textarea')) return
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true }))
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [game])
}

// Wrapper for direct routes
function GameRoute({ game }) {
  const { setGameInfo } = useContext(GameLabelContext)
  const Component = game.component
  const pad = game.pad || null
  useEffect(() => {
    setGameInfo(game.label, game.theme, game.footer)
  }, [game.label, game.theme, game.footer, setGameInfo])

  useTapStart(game)

  const extraButtons = useMemo(() => extraButtonsOf(pad), [pad])

  return (
    <PadContext.Provider value={pad}>
      <GamepadBridge secondAction={padButton(pad)?.code} extraButtons={extraButtons} />
      <LinkPads secondAction={padButton(pad)?.code} />
      <Suspense fallback={<LoadingCard />}>
        <Component />
      </Suspense>
    </PadContext.Provider>
  )
}

function Layout({ children }) {
  const [info, setInfo] = useState({ label: '', theme: 'light', footer: undefined })

  // Stabilize the setter to check for changes and prevent unnecessary updates
  const setGameInfo = useCallback((l, t, f) => {
    setInfo(prev => {
      if (prev.label === l && prev.theme === t && prev.footer === f) return prev
      return { label: l, theme: t, footer: f }
    })
  }, [])

  // Context provider value
  const contextValue = useMemo(() => ({
    label: info.label,
    setGameInfo
  }), [info.label, setGameInfo])

  // Dynamic text color
  const textColor = info.theme === 'dark' ? 'text-white' : 'text-black'
  const borderColor = info.theme === 'dark' ? 'hover:border-white' : 'hover:border-black'

  // #885: on phones the touch pad owns the bottom band (84px buttons + a 180px
  // stick span nearly the whole width), so the JALFERN.COM mark moves to the top
  // center band — the controls must never sit on top of it. Desktop keeps the
  // classic bottom-center footer.
  const [padBand, setPadBand] = useState(() =>
    window.matchMedia?.('(max-width: 480px) and (pointer: coarse)')?.matches === true)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 480px) and (pointer: coarse)')
    const on = (e) => setPadBand(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  return (
    <GameLabelContext.Provider value={contextValue}>
      <div className="w-full h-screen bg-white overflow-hidden relative">
        {children}

        {/* Footer Label (a route can opt out — MYST's caption bar owns the bottom) */}
        {info.footer !== 'none' && (
          <div className={`fixed left-0 right-0 text-center pointer-events-none opacity-40 hover:opacity-100 transition-opacity duration-500 flex flex-col items-center gap-1`} style={padBand ? { top: 'calc(0.375rem + var(--sat, 0px))', paddingLeft: 'var(--sal, 0px)', paddingRight: 'var(--sar, 0px)' } : { bottom: 'calc(2rem + var(--sab, 0px))', paddingLeft: 'var(--sal, 0px)', paddingRight: 'var(--sar, 0px)' }}>
            <h1 className={`${textColor} font-mono text-sm tracking-widest border-b-2 border-transparent ${borderColor} inline-block pb-1`}>
              JALFERN.COM
            </h1>
            {info.label && (
              <p className={`${textColor} font-mono text-xs tracking-wider opacity-75`}>
                {info.label}
              </p>
            )}
          </div>
        )}

        {/* Mute Toggle (Positioned here to read Theme) */}
        <MuteToggle theme={info.theme} />

        {/* In-game corner buttons (#437): ARCADE back to the showcase, PAUSE
            for thumbs with no '?' key — gated to game routes inside. */}
        <GameChrome theme={info.theme} />
      </div>
    </GameLabelContext.Provider>
  )
}

function MuteToggle({ theme }) {
  const [muted, setMuted] = useState(false)

  const textColor = theme === 'dark' ? 'text-white' : 'text-black'

  const toggleMute = () => {
    const newMuted = !muted
    setMuted(newMuted)
    audioController.init()
    audioController.setMuted(newMuted)
    if (!newMuted) {
      setTimeout(() => audioController.playTone(440, 0.1, 'sine'), 100)
    }
  }

  return (
    <button
      onClick={toggleMute}
      data-nav="mute"
      aria-label="Mute"
      className={`${textColor} opacity-20 hover:opacity-100 transition-opacity duration-300 z-[60] p-2`}
      // #745: top-right chrome cluster (beside PAUSE, the #437 convention), NOT
      // bottom-right — there it covered the A action button's right edge and a
      // tap on A muted the game instead of firing.
      style={{ position: 'fixed', top: 'calc(0.75rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px) + 4.5rem)' }}
    >
      {muted ? (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.75-4.75a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.75-4.75H4.5a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 1 .75-.75h2.25Z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.75-4.75a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.75-4.75H4.5a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 1 .75-.75h2.25Z" />
        </svg>
      )}
    </button>
  )
}

function App() {
  // Audio Unlock - init AudioContext on first user gesture (browser autoplay policy)
  useEffect(() => {
    const unlockAudio = () => {
      audioController.init()
    }
    window.addEventListener('touchstart', unlockAudio, { once: true })
    window.addEventListener('click', unlockAudio, { once: true })
    window.addEventListener('keydown', unlockAudio, { once: true })
    return () => {
      window.removeEventListener('touchstart', unlockAudio)
      window.removeEventListener('click', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
  }, [])

  // Version 1.1 - Force Refresh
  useEffect(() => { console.log("Jalfern Arcade v1.2 - Games List") }, [])

  return (
    <BrowserRouter basename="/retrogames">
      {/* #893: the phone pad page is its own surface — chromeless, no footer,
          no mute toggle; phones are controllers, not a browser window. */}
      <Routes>
        <Route path="/pad" element={<PadLink />} />
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </BrowserRouter>
  )
}

function AppShell() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<RandomHome />} />
        <Route path="/random" element={<RandomHome />} />
        <Route path="/games" element={<ArcadeShowcase />} />
        <Route path="/games-classic" element={<GamesList />} />
        <Route path="/games-v2" element={<ArcadeShowcase />} />
        <Route path="/forge" element={<div className="w-full h-full relative"><ForgeBoard /></div>} />
        <Route path="/forge/log" element={<div className="w-full h-full relative"><ForgeLog /></div>} />
        <Route path="/forge/report" element={<div className="w-full h-full relative bg-black"><ShiftReport /></div>} />
        <Route path="*" element={<Navigate to="/" replace />} />
        {GAMES.map(game => (
          <Route
            key={game.path}
            path={game.path}
            element={<GameRoute game={game} />}
          />
        ))}
      </Routes>
    </Layout>
  )
}

export default App

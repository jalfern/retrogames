import { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { GAMES } from './config/games'
import GamesList from './components/GamesList'
import { audioController } from './utils/AudioController'

const GameLabelContext = createContext({
  label: '',
  setGameInfo: () => { }
})

function RandomHome() {
  const { setGameInfo } = useContext(GameLabelContext)
  const [GameComponent, setGameComponent] = useState(null)

  useEffect(() => {
    const randomGame = GAMES[Math.floor(Math.random() * GAMES.length)]
    setGameComponent(() => randomGame.component)
    setGameInfo(randomGame.label, randomGame.theme)
  }, [setGameInfo])

  if (!GameComponent) return null
  return <GameComponent />
}

// Wrapper for direct routes
function GameRoute({ component: Component, label, theme }) {
  const { setGameInfo } = useContext(GameLabelContext)
  useEffect(() => {
    setGameInfo(label, theme)
  }, [label, theme, setGameInfo])
  return <Component />
}

function Layout({ children }) {
  const [info, setInfo] = useState({ label: '', theme: 'light' })

  // Stabilize the setter to check for changes and prevent unnecessary updates
  const setGameInfo = useCallback((l, t) => {
    setInfo(prev => {
      if (prev.label === l && prev.theme === t) return prev
      return { label: l, theme: t }
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

  return (
    <GameLabelContext.Provider value={contextValue}>
      <div className="w-full h-screen bg-white overflow-hidden relative">
        {children}

        {/* Footer Label */}
        <div className={`fixed bottom-8 left-0 right-0 text-center pointer-events-none opacity-40 hover:opacity-100 transition-opacity duration-500 flex flex-col items-center gap-1`}>
          <h1 className={`${textColor} font-mono text-sm tracking-widest border-b-2 border-transparent ${borderColor} inline-block pb-1`}>
            JALFERN.COM
          </h1>
          {info.label && (
            <p className={`${textColor} font-mono text-xs tracking-wider opacity-75`}>
              {info.label}
            </p>
          )}
        </div>

        {/* Mute Toggle (Positioned here to read Theme) */}
        <MuteToggle theme={info.theme} />
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
      className={`fixed bottom-8 right-8 ${textColor} opacity-20 hover:opacity-100 transition-opacity duration-300 z-50 p-2`}
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
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<RandomHome />} />
          <Route path="/games" element={<GamesList />} />
          {GAMES.map(game => (
            <Route
              key={game.path}
              path={game.path}
              element={<GameRoute component={game.component} label={game.label} theme={game.theme} />}
            />
          ))}
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App

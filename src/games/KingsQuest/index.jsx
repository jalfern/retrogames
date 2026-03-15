import React, { useEffect, useRef, useState, useCallback } from 'react'
import PauseOverlay from '../../components/PauseOverlay'
import { GAMES } from '../../config/games'

function DosGame({ bundleUrl, label }) {
  const rootRef = useRef(null)
  const dosRef = useRef(null)
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!rootRef.current) return
    if (typeof window.Dos === 'undefined') {
      setError('DOSBox emulator failed to load')
      return
    }

    let stopped = false

    try {
      const base = import.meta.env.BASE_URL
      const instance = window.Dos(rootRef.current, {
        url: `${base}${bundleUrl}`,
        autoStart: true,
        theme: 'dark',
        imageRendering: 'pixelated',
        renderAspect: '4/3',
        noNetworking: true,
        noCloud: true,
        kiosk: true,
        onEvent: (event) => {
          if (event === 'ci-ready') {
            if (!stopped) setLoading(false)
          }
        },
      })
      dosRef.current = instance
    } catch (e) {
      console.error('DOSBox init error:', e)
      setError(e.message)
    }

    return () => {
      stopped = true
      if (dosRef.current) {
        dosRef.current.stop()
        dosRef.current = null
      }
    }
  }, [bundleUrl])

  // Pause handler
  useEffect(() => {
    const handlePause = (e) => {
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setPaused(p => !p)
      }
    }
    window.addEventListener('keydown', handlePause)
    return () => window.removeEventListener('keydown', handlePause)
  }, [])

  const handleResume = useCallback(() => {
    setPaused(false)
    if (rootRef.current) rootRef.current.focus()
  }, [])

  const game = GAMES.find(g => g.label === label)

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="relative w-full h-full max-w-4xl max-h-full flex items-center justify-center">
        {error && (
          <div className="text-red-400 font-mono text-center p-8">
            Failed to load game: {error}
          </div>
        )}
        <div
          ref={rootRef}
          className="w-full h-full"
          style={{ display: error ? 'none' : 'block' }}
        />
        {paused && game && <PauseOverlay game={game} onResume={handleResume} />}
      </div>
    </div>
  )
}

const KingsQuestGame = () => (
  <DosGame bundleUrl="games/kingsquest.jsdos" label="KING'S QUEST" />
)

export default KingsQuestGame

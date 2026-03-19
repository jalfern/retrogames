import React, { useEffect, useRef, useState, useCallback } from "react"
import PauseOverlay from "../../components/PauseOverlay"
import { GAMES } from "../../config/games"

function DosGame({ bundleUrl, label }) {
  const rootRef = useRef(null)
  const dosRef = useRef(null)
  const inputRef = useRef(null)
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [inputVal, setInputVal] = useState("")
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900 || "ontouchstart" in window)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  useEffect(() => {
    if (!rootRef.current) return
    if (typeof window.Dos === "undefined") {
      setError("DOSBox emulator failed to load")
      return
    }
    let stopped = false
    try {
      const base = import.meta.env.BASE_URL
      const instance = window.Dos(rootRef.current, {
        url: `${base}${bundleUrl}`,
        autoStart: true,
        theme: "dark",
        imageRendering: "pixelated",
        renderAspect: "4/3",
        noNetworking: true,
        noCloud: true,
        kiosk: true,
        onEvent: (event) => {
          if (event === "ci-ready") {
            if (!stopped) setLoading(false)
          }
        },
      })
      dosRef.current = instance
    } catch (e) {
      console.error("DOSBox init error:", e)
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

  useEffect(() => {
    const handlePause = (e) => {
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault()
        setPaused((p) => !p)
      }
    }
    window.addEventListener("keydown", handlePause)
    return () => window.removeEventListener("keydown", handlePause)
  }, [])

  const handleResume = useCallback(() => {
    setPaused(false)
    if (rootRef.current) rootRef.current.focus()
  }, [])

  const kqHandlersRef = useRef({ down: null, up: null, canvas: null })

  const injectKey = useCallback((keyCode, holdMs = 80) => {
    const { down, up, canvas } = kqHandlersRef.current
    if (!down) {
      document.querySelectorAll("canvas").forEach((c) => {
        const key = String.fromCharCode(keyCode)
        c.dispatchEvent(new KeyboardEvent("keydown", { keyCode, which: keyCode, key, bubbles: true, cancelable: true }))
        c.dispatchEvent(new KeyboardEvent("keyup", { keyCode, which: keyCode, key, bubbles: true, cancelable: true }))
      })
      return
    }
    const fakeEvt = { keyCode, location: 0, target: canvas || {}, stopPropagation: () => {}, preventDefault: () => {} }
    down(fakeEvt)
    if (up) setTimeout(() => up(fakeEvt), holdMs)
  }, [])

  const dispatchKey = useCallback((keySpec) => { injectKey(keySpec.keyCode) }, [injectKey])

  const KEY = {
    esc:   { key: "Escape",    code: "Escape",     keyCode: 27 },
    enter: { key: "Enter",     code: "Enter",      keyCode: 13 },
    space: { key: " ",         code: "Space",      keyCode: 32 },
  }

  const typeIntoDos = useCallback((text) => {
    let delay = 0
    for (const char of text) {
      const upper = char.toUpperCase()
      const kc = upper.charCodeAt(0)
      if ((kc >= 65 && kc <= 90) || (kc >= 48 && kc <= 57) || kc === 32) {
        const spec = { key: char, code: kc === 32 ? "Space" : `Key${upper}`, keyCode: kc }
        const d = delay
        setTimeout(() => dispatchKey(spec), d)
        delay += 120
      }
    }
    setTimeout(() => dispatchKey(KEY.enter), delay + 60)
  }, [dispatchKey])

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    const text = inputVal.trim()
    if (!text) return
    setInputVal("")
    if (text.toLowerCase() === "esc" || text.toLowerCase() === "escape") {
      dispatchKey({ key: "Escape", code: "Escape", keyCode: 27 })
    } else {
      typeIntoDos(text)
    }
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [inputVal, typeIntoDos])

  const game = GAMES.find((g) => g.label === label)

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center">
      <div className="relative flex flex-col w-full h-full max-w-4xl max-h-full">
        {error && (
          <div className="text-red-400 font-mono text-center p-8">
            Failed to load game: {error}
          </div>
        )}
        <div ref={rootRef} style={{ flex: 1, display: error ? "none" : "block", minHeight: 0 }} />
        {!error && (
          <div style={{
            flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
            padding: "5px 10px", background: "#0a0a0a", borderTop: "1px solid #222",
          }}>
            {[
              { label: "ESC", spec: { key: "Escape", code: "Escape", keyCode: 27 } },
              { label: "↵",   spec: { key: "Enter",  code: "Enter",  keyCode: 13 } },
              { label: "␣",   spec: { key: " ",      code: "Space",  keyCode: 32 } },
            ].map(({ label, spec }) => (
              <button key={label} onClick={() => dispatchKey(spec)} style={{
                flexShrink: 0, background: "#111", border: "1px solid #444",
                borderRadius: 6, color: "#aaa", fontFamily: "monospace", fontSize: 13,
                padding: "4px 10px", cursor: "pointer", minWidth: 38, textAlign: "center",
              }}>{label}</button>
            ))}
            <form onSubmit={handleSubmit} style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#555", fontFamily: "monospace", fontSize: 14 }}>▶</span>
              <input
                ref={inputRef}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="type command, tap Send…"
                autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: "#ccc", fontFamily: "monospace", fontSize: 15, caretColor: "#fff",
                }}
              />
              <button type="submit" style={{
                background: "#1a3a1a", border: "1px solid #2a6a2a", borderRadius: 6,
                color: "#4ade80", fontFamily: "monospace", fontSize: 13,
                padding: "5px 14px", cursor: "pointer",
              }}>
                Send
              </button>
            </form>
          </div>
        )}
        {paused && game && <PauseOverlay game={game} onResume={handleResume} />}
      </div>
    </div>
  )
}

const Ultima2Game = () => (
  <DosGame bundleUrl="games/ultima2.jsdos" label="ULTIMA II" />
)

export default Ultima2Game

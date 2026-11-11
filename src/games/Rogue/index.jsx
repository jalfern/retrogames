import { useReducer, useEffect, useCallback, useRef, useState } from 'react'
import { exposeFeedbackState, unexposeFeedbackState, seedFromQuery } from '../../utils/gameContract'
import { mountDbg, unmountDbg } from '../../utils/DebugKit'
import { audioController } from '../../utils/AudioController'
import WatchButton, { WatchToast } from '../../components/WatchButton'
import { isWatchKey, isTakeoverKey, playWatchStart, playWatchStop, watchSfxLog } from '../../utils/watch'
import {
  COLORS,
  createInitialState, stepGame, buildGrid, watchStep,
  getItemName, playerAC, runScore, done, hash,
} from './sim.js'

// ROGUE (1980, Eglit/Upl — the ur-dungeon). The whole game logic lives in
// sim.js (Node-provable, zero entropy of its own): every dice roll, dungeon
// layout, item dice, monster roll, the potion-colour and scroll-title ciphers
// draw from the seedRng(seed) stream. #1473 seed-param port: the seed is drawn
// at every human start honoring ?seed=N (pin), reported via __feedbackInfo with
// the turn count, so a filed run replays room-for-room, kestrel-for-kestrel.

// Roll the seed for the next world: the pin wins, else fresh entropy.
function freshSeed() {
  return seedFromQuery(window.location.search) ?? Math.floor(Math.random() * 1000000)
}

// #1502: the sim RECORDS audible moments in state.fx (the audibility gate in
// roguecheck asserts they fire); the view turns them into synth (Emberwood's
// #1512 pattern). Green-phosphor machine, so the palette is low square/saw
// blips — a dragon's death roars, the door creak is a thud.
const fxSound = (e) => {
  const ac = audioController
  try {
    switch (e.k) {
      case 'hit':       ac.playNoise(0.06, 0.10); ac.playTone(170, 0.05, 'square', 0.06); break
      case 'kill':      ac.playSweep(520, 110, 0.18, 'square', 0.07); break
      case 'hurt':      ac.playSweep(220, 90, 0.16, 'sawtooth', 0.09); break
      case 'die':
        if (e.killer === 'D') { ac.playSweep(150, 35, 0.6, 'sawtooth', 0.13); ac.playNoise(0.45, 0.09) }
        else ac.playSweep(300, 50, 0.5, 'sawtooth', 0.1)
        break
      case 'levelup':   [440, 550, 660, 880].forEach((f, i) => ac.playTone(f, 0.09, 'square', 0.05, i * 0.08)); break
      case 'quaff':     ac.playSweep(320, 720, 0.18, 'sine', 0.06); break
      case 'eat':       ac.playNoise(0.05, 0.05); ac.playTone(200, 0.07, 'triangle', 0.05); break
      case 'gold':      ac.playTone(988, 0.05, 'square', 0.05); ac.playTone(1319, 0.07, 'square', 0.05, 0.05); break
      case 'descend':   ac.playSweep(420, 110, 0.3, 'triangle', 0.06); break
      case 'door-open': ac.playNoise(0.05, 0.06); ac.playTone(260, 0.07, 'triangle', 0.05); break
      case 'door-found': ac.playTone(660, 0.06, 'triangle', 0.05); ac.playTone(990, 0.09, 'triangle', 0.05, 0.06); break
      default: break
    }
  } catch { /* audio is best-effort — never break a turn over a tone */ }
}

// ============================================================
// VIEW (index.jsx keeps only presentation — buildGrid lives in sim.js so the
// harness can fingerprint the drawn grid against the logical state)
// ============================================================

// ── Mobile d-pad ──────────────────────────────────────────────────────────────
function DPad({ onAction }) {
  const btn = (label, action, style = {}) => {
    const press = (e) => { e.preventDefault(); onAction(action) }
    return (
      <button onPointerDown={press}
              style={{
                background: '#111', border: '1px solid #333', color: '#888',
                fontFamily: 'monospace', fontSize: 18, borderRadius: 6,
                width: 52, height: 52, cursor: 'pointer', userSelect: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent', touchAction: 'none',
                ...style
              }}>
        {label}
      </button>
    )
  }

  const ab = (label, action, color = '#446') => {
    const press = (e) => { e.preventDefault(); onAction(action) }
    return (
      <button onPointerDown={press}
              style={{
                background: '#0a0a14', border: `1px solid ${color}`, color: color,
                fontFamily: 'monospace', fontSize: 12, borderRadius: 6,
                padding: '4px 8px', cursor: 'pointer', userSelect: 'none',
                WebkitTapHighlightColor: 'transparent', touchAction: 'none',
              }}>
        {label}
      </button>
    )
  }

  return (
    <div style={{ flexShrink: 0, background: '#0a0a0a', borderTop: '1px solid #222', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Action buttons — row 1: items */}
      <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
        {ab('i inv',   { type: 'SHOW_INVENTORY' }, '#446')}
        {ab(', pick',  { type: 'PICKUP' },          '#464')}
        {ab('q drink', { type: 'SHOW_QUAFF' },      '#446')}
        {ab('r read',  { type: 'SHOW_READ' },       '#446')}
        {ab('e eat',   { type: 'SHOW_EAT' },        '#464')}
        {ab('d drop',  { type: 'SHOW_DROP' },       '#644')}
      </div>
      {/* Action buttons — row 2: equip / movement */}
      <div style={{ display: 'flex', gap: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
        {ab('w wield',  { type: 'SHOW_WIELD' },  '#446')}
        {ab('W wear',   { type: 'SHOW_WEAR' },   '#446')}
        {ab('T takeoff',{ type: 'TAKE_OFF' },    '#446')}
        {ab('s srch',   { type: 'SEARCH' },      '#664')}
        {ab('. rest',   { type: 'MOVE', dx:0, dy:0 }, '#444')}
        {ab('> down',   { type: 'DESCEND' },     '#644')}
        {ab('? help',   { type: 'SHOW_HELP' },   '#444')}
      </div>
      {/* D-pad */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 52px)', gridTemplateRows: 'repeat(3, 52px)', gap: 3 }}>
          {btn('↖', { type: 'MOVE', dx:-1, dy:-1 })}
          {btn('↑', { type: 'MOVE', dx: 0, dy:-1 }, { color: '#aaa' })}
          {btn('↗', { type: 'MOVE', dx: 1, dy:-1 })}
          {btn('←', { type: 'MOVE', dx:-1, dy: 0 }, { color: '#aaa' })}
          {btn('·', { type: 'SEARCH' },              { color: '#555' })}
          {btn('→', { type: 'MOVE', dx: 1, dy: 0 }, { color: '#aaa' })}
          {btn('↙', { type: 'MOVE', dx:-1, dy: 1 })}
          {btn('↓', { type: 'MOVE', dx: 0, dy: 1 }, { color: '#aaa' })}
          {btn('↘', { type: 'MOVE', dx: 1, dy: 1 })}
        </div>
      </div>
    </div>
  )
}

export default function RogueGame() {
  const [state, dispatch] = useReducer(stepGame, null, () => createInitialState(freshSeed()))
  const containerRef = useRef(null)
  const [isMobile, setIsMobile] = useState(false)
  const [mapScale, setMapScale] = useState(1)
  const mapRef = useRef(null)
  const touchStartRef = useRef(null)

  // latest state for the feedback report (mounted once, read per report)
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state })

  // #1637 batch 23 WATCH: Y hands the dungeon to sim.js's own BFS crawler.
  // A turn-based seat runs on its own clock, not the frame clock: one reducer
  // action per SEAT_MS, so the route keeps pace while the browser is idle.
  const [watching, setWatching] = useState(false)
  const watchingRef = useRef(false)
  const releaseWatch = useCallback((silent) => {
    if (!watchingRef.current) return
    watchingRef.current = false
    setWatching(false)
    if (!silent) playWatchStop()
  }, [])

  useEffect(() => {
    if (!watching) return undefined
    const SEAT_MS = 140
    const id = setInterval(() => {
      const s = stateRef.current
      if (done(s)) { releaseWatch(true); return }   // the dungeon keeps the run; the guide releases
      const act = watchStep(s)
      if (!act) { releaseWatch(false); return }      // no route from here — hand back honestly
      dispatch(act)                                   // the state effect carries stateRef onward
    }, SEAT_MS)
    return () => clearInterval(id)
  }, [watching, releaseWatch])

  // #1502: drain the sim's fx log into audio. The log grows through the run
  // and resets to [] on NEW_GAME — the length compare handles both.
  const fxSeenRef = useRef(0)
  useEffect(() => {
    const n = state.fx.length
    let seen = fxSeenRef.current
    if (seen > n) seen = 0
    if (seen < n) {
      state.fx.slice(seen, n).forEach(fxSound)
      fxSeenRef.current = n
    }
  }, [state])

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      // Scale map to fit screen width: map is 80 chars × 9.6px = 768px
      if (mobile) setMapScale(Math.min(1, window.innerWidth / 768))
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  // production report carries the seed + turn count (#1473)
  useEffect(() => {
    exposeFeedbackState(() => ({
      tick: stateRef.current.turn,
      score: runScore(stateRef.current),
      done: done(stateRef.current),
      seed: stateRef.current.seed,
      dungeon: stateRef.current.dungeonLevel,
      hp: stateRef.current.player.hp,
    }))

    mountDbg({
      title: 'ROGUE',
      getState: () => {
        const s = stateRef.current
        return [
          `dlvl ${s.dungeonLevel}  hp ${s.player.hp}/${s.player.maxHp}  gold ${s.player.gold}  xl ${s.player.level}  hunger ${s.player.hunger}`,
          `pos ${s.player.x},${s.player.y}  monsters ${s.monsters.length}  items ${s.items.length}  inv ${s.player.inventory.length}`,
          `seed ${s.seed}  turn ${s.turn}  hash ${hash(s)}`,
        ]
      },
      actions: [
        // Real reducer actions only — the panel cheats through the same door
        // the keyboard does, so what DebugKit proves is the shipped path.
        { label: 'Rest x10', run: () => { for (let i = 0; i < 10; i++) dispatch({ type: 'MOVE', dx: 0, dy: 0 }) } },
        { label: 'Descend (>)', run: () => dispatch({ type: 'DESCEND' }) },
        { label: 'Force game over (Q)', run: () => dispatch({ type: 'QUIT' }) },
      ],
    })

    // #1637 WATCH probes (DEV-only): seat state, the shared blip log, and a
    // prover-only view — `turn` only moves when the sim takes a turn, which an
    // idle watcher never does.
    if (import.meta.env.DEV) {
      window.__rogueTest = {
        watching: () => watchingRef.current,
        watchSfx: watchSfxLog,
        probe: () => {
          const s = stateRef.current
          return {
            turn: s.turn, dlvl: s.dungeonLevel, gold: s.player.gold, score: runScore(s),
            x: s.player.x, y: s.player.y, hp: s.player.hp, phase: s.phase,
            monsters: s.monsters.length, done: done(s),
          }
        },
        hash: () => hash(stateRef.current),
      }
    }

    return () => {
      unexposeFeedbackState()
      unmountDbg()
      if (import.meta.env.DEV && window.__rogueTest) delete window.__rogueTest
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleKey = (e) => {
      const { phase } = state

      // Prevent page scrolling for game keys
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
        e.preventDefault()
      }

      // #1637 batch 23 WATCH: Y seats the game's OWN BFS crawler (the route
      // roguecheck descends 20/20 seeds with) at any live position — it plans
      // from the state it is handed, never a bench script. Y again hands back;
      // any ordinary key/tap takes over first. Lowercase `y` is the 1980 NW
      // key — the shared Y contract wins, numpad 7 keeps the compass whole.
      if (isWatchKey(e)) {
        e.preventDefault()
        if (watchingRef.current) releaseWatch(false)
        else if (phase === 'playing' && !done(state)) { watchingRef.current = true; setWatching(true); playWatchStart() }
        return
      }
      if (watchingRef.current && isTakeoverKey(e)) releaseWatch(false)

      if (phase === 'gameover') {
        if (e.key === 'Enter' || e.key === ' ') {
          // every human start rolls a fresh world — the pin wins when set
          dispatch({ type: 'NEW_GAME', seed: freshSeed() })
        }
        return
      }

      if (phase === 'inventory') {
        if (e.key === 'Escape' || e.key === 'i' || e.key === ' ') dispatch({ type: 'CLOSE_MENU' })
        return
      }

      if (phase === 'help') {
        if (e.key === 'Escape' || e.key === '?' || e.key === ' ') dispatch({ type: 'CLOSE_MENU' })
        return
      }

      // Menu phases: select by letter
      const menuPhases = { drop: 'DROP_ITEM', quaff: 'QUAFF_ITEM', read: 'READ_ITEM', wield: 'WIELD_ITEM', wear: 'WEAR_ITEM', eat: 'EAT_ITEM' }
      if (menuPhases[phase]) {
        if (e.key === 'Escape') { dispatch({ type: 'CLOSE_MENU' }); return }
        const idx = e.key.charCodeAt(0) - 97 // 'a' = 97
        if (idx >= 0 && idx < 26) dispatch({ type: menuPhases[phase], index: idx })
        return
      }

      // Playing
      switch (e.key) {
        case 'ArrowUp':    case 'k': case '8': dispatch({ type: 'MOVE', dx: 0,  dy: -1 }); break
        case 'ArrowDown':  case 'j': case '2': dispatch({ type: 'MOVE', dx: 0,  dy:  1 }); break
        case 'ArrowLeft':  case 'h': case '4': dispatch({ type: 'MOVE', dx: -1, dy:  0 }); break
        case 'ArrowRight': case 'l': case '6': dispatch({ type: 'MOVE', dx:  1, dy:  0 }); break
        case 'y': case '7': dispatch({ type: 'MOVE', dx: -1, dy: -1 }); break
        case 'u': case '9': dispatch({ type: 'MOVE', dx:  1, dy: -1 }); break
        case 'b': case '1': dispatch({ type: 'MOVE', dx: -1, dy:  1 }); break
        case 'n': case '3': dispatch({ type: 'MOVE', dx:  1, dy:  1 }); break
        case ',': case 't': dispatch({ type: 'PICKUP' }); break
        case 'i': dispatch({ type: 'SHOW_INVENTORY' }); break
        case 'd': dispatch({ type: 'SHOW_DROP' }); break
        case 'q': dispatch({ type: 'SHOW_QUAFF' }); break
        case 'r': dispatch({ type: 'SHOW_READ' }); break
        case 'w': dispatch({ type: 'SHOW_WIELD' }); break
        case 'W': dispatch({ type: 'SHOW_WEAR' }); break
        case 'T': dispatch({ type: 'TAKE_OFF' }); break
        case '>': dispatch({ type: 'DESCEND' }); break
        case 'e': dispatch({ type: 'SHOW_EAT' }); break
        case 's': dispatch({ type: 'SEARCH' }); break
        case '?': dispatch({ type: 'SHOW_HELP' }); break
        case 'Q': dispatch({ type: 'QUIT' }); break
        default: break
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [state, releaseWatch])

  // Swipe to move on mobile
  const handleTouchStart = useCallback((e) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, [])

  const handleTouchEnd = useCallback((e) => {
    if (!touchStartRef.current) return
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y
    touchStartRef.current = null
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return // too small
    const adx = Math.abs(dx), ady = Math.abs(dy)
    const mx = adx > ady * 2 ? (dx > 0 ? 1 : -1) : (adx > ady * 0.5 ? (dx > 0 ? 1 : -1) : 0)
    const my = ady > adx * 2 ? (dy > 0 ? 1 : -1) : (ady > adx * 0.5 ? (dy > 0 ? 1 : -1) : 0)
    if (mx !== 0 || my !== 0) { releaseWatch(false); dispatch({ type: 'MOVE', dx: mx, dy: my }) } // #1637: a swipe takes over
  }, [releaseWatch])

  const handleMobileAction = useCallback((action) => {
    releaseWatch(false) // #1637: the pad takes over before it acts
    dispatch(action)
  }, [releaseWatch])

  const { player, phase, messages, dungeonLevel, finalScore, killer } = state
  // #1637: the dungeon only drives while phase is playing — every menu/help/
  // death screen already returned above, so this also mirrors the pill's door.
  const paused = phase !== 'playing'

  const base = {
    background: '#000',
    color: '#aaa',
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: '15px',
    lineHeight: '19px',
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    userSelect: 'none',
    outline: 'none',
    boxSizing: 'border-box',
    // #1833: the fixed ARCADE/PAUSE chrome sat right on the message line —
    // give every screen a band clear of it (buttons top out ~40px + safe area).
    paddingTop: 'calc(2.75rem + var(--sat, 0px))',
  }

  // ── GAME OVER ──────────────────────────────────────────────
  if (phase === 'gameover') {
    return (
      <div ref={containerRef} style={base} tabIndex={0}
           onPointerDown={() => dispatch({ type: 'NEW_GAME', seed: freshSeed() })}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <div style={{ color: '#ff4444', fontSize: '30px', letterSpacing: '4px' }}>✝  GAME OVER  ✝</div>
          <div style={{ color: '#ff6644', fontSize: '20px', letterSpacing: '1px' }}>
            {killer === 'starvation' ? 'Starved to death' : killer ? `Killed by a ${killer}` : ''}
          </div>
          <div style={{ color: '#aaa', marginTop: '8px' }}>Slain in the Dungeons of Doom!</div>
          <div style={{ marginTop: '16px', color: '#ccc' }}>
            <div>Dungeon Level: <span style={{ color: '#ffff55' }}>{dungeonLevel}</span></div>
            <div>Gold: <span style={{ color: '#ffff00' }}>{player.gold}</span></div>
            <div>Experience Level: <span style={{ color: '#88ff88' }}>{player.level}</span></div>
          </div>
          <div style={{ color: '#ffffff', fontSize: '22px', marginTop: '12px' }}>
            Final Score: {finalScore}
          </div>
          <div style={{ color: '#555', marginTop: '20px', fontSize: '13px' }}>Press ENTER or SPACE — or tap — to try again</div>
        </div>
      </div>
    )
  }

  // ── INVENTORY / MENU SCREENS ───────────────────────────────
  const menuPhaseTitle = {
    inventory: 'Inventory',
    drop:   'Drop which item? (press letter, ESC to cancel)',
    quaff:  'Quaff which potion?',
    read:   'Read which scroll?',
    wield:  'Wield which weapon?',
    wear:   'Wear which armor?',
    eat:    'Eat which food?',
  }

  const menuTypeFilter = {
    drop: null, inventory: null,
    quaff: '!', read: '?', wield: ')', wear: '[', eat: ':',
  }

  if (menuPhaseTitle[phase]) {
    const filterType = menuTypeFilter[phase]
    const shown = filterType
      ? player.inventory.map((item, i) => ({ item, i })).filter(({ item }) => item.type === filterType)
      : player.inventory.map((item, i) => ({ item, i }))

    return (
      <div ref={containerRef} style={base} tabIndex={0}>
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
          <div style={{ color: '#ffff55', fontSize: '16px', marginBottom: '12px', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
            {menuPhaseTitle[phase]}
          </div>
          {shown.length === 0 ? (
            <div style={{ color: '#666' }}>Nothing here.</div>
          ) : (
            shown.map(({ item, i }, listIdx) => (
              <div key={i} style={{ marginBottom: '3px', display: 'flex', gap: '8px' }}>
                <span style={{ color: '#888', minWidth: '24px' }}>{String.fromCharCode(97 + listIdx)})</span>
                <span style={{ color: COLORS[item.type] || '#aaa' }}>{item.type}</span>
                <span style={{ color: '#ddd' }}>{getItemName(item, state)}</span>
                {item === player.weapon && <span style={{ color: '#888' }}> (wielding)</span>}
                {item === player.armor  && <span style={{ color: '#888' }}> (wearing)</span>}
              </div>
            ))
          )}
          {phase === 'inventory' && (
            <>
              <div style={{ marginTop: '16px', borderTop: '1px solid #222', paddingTop: '8px' }}>
                <div style={{ color: '#888', fontSize: '13px' }}>Wielding: <span style={{ color: '#aaa' }}>{player.weapon?.name || 'nothing'}</span></div>
                <div style={{ color: '#888', fontSize: '13px' }}>Wearing:  <span style={{ color: '#aaa' }}>{player.armor?.name || 'nothing'}</span></div>
              </div>
              <div style={{ marginTop: '12px', color: '#444', fontSize: '12px' }}>Press i, SPACE, or ESC to close</div>
            </>
          )}
          {phase !== 'inventory' && (
            <div style={{ marginTop: '12px', color: '#444', fontSize: '12px' }}>Press letter to select, ESC to cancel</div>
          )}
        </div>
      </div>
    )
  }

  // ── HELP SCREEN ────────────────────────────────────────────
  if (phase === 'help') {
    const keys = [
      ['h/j/k/l', 'Move left/down/up/right'],
      ['y/u/b/n', 'Move diagonally (NW/NE/SW/SE)'],
      ['Arrow Keys', 'Move (also numpad 1-9)'],
      [',  or  t', 'Pick up item'],
      ['i', 'Show inventory'],
      ['d', 'Drop item'],
      ['e', 'Eat food'],
      ['q', 'Quaff (drink) a potion'],
      ['r', 'Read a scroll'],
      ['w', 'Wield a weapon'],
      ['W', 'Wear armor'],
      ['T', 'Take off armor'],
      ['>', 'Go down stairs (%)'],
      ['s', 'Search for hidden doors'],
      ['?', 'This help screen'],
      ['Q', 'Quit the game'],
      ['GOAL', 'Descend as deep as you dare — gold multiplies with depth'],
    ]
    const syms = [
      ['@', COLORS['@'], 'You, the adventurer'],
      ['-', COLORS['-'], 'Wall — SOLID, you cannot walk through it'],
      ['|', COLORS['|'], 'Wall (vertical stroke)'],
      ['#', COLORS['#'], 'Corridor'],
      ['.', '#3a5a3a', 'Floor'],
      ['+', COLORS['+'], 'Door (bump to open)'],
      ["'", COLORS["'"], 'Open doorway'],
      ['%', COLORS['%'], 'Stairs down'],
      ['*', COLORS['*'], 'Gold'],
      ['!', COLORS['!'], 'Potion'],
      ['?', COLORS['?'], 'Scroll'],
      [')', COLORS[')'], 'Weapon'],
      ['[', COLORS['['], 'Armor'],
      [':', COLORS[':'], 'Food'],
      ['A-Z', '#ff4444', 'Monsters'],
    ]
    return (
      <div ref={containerRef} style={base} tabIndex={0}>
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#ffff55', fontSize: '16px', marginBottom: '12px' }}>Commands</div>
            {keys.map(([k, d], i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '3px' }}>
                <span style={{ color: '#ffcc44', minWidth: '100px', fontSize: '13px' }}>{k}</span>
                <span style={{ color: '#bbb', fontSize: '13px' }}>{d}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ color: '#ffff55', fontSize: '16px', marginBottom: '12px' }}>Symbols</div>
            {syms.map(([sym, col, name], i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '3px' }}>
                <span style={{ color: col, minWidth: '30px', fontWeight: 'bold', fontSize: '14px' }}>{sym}</span>
                <span style={{ color: '#bbb', fontSize: '13px' }}>{name}</span>
              </div>
            ))}
            <div style={{ marginTop: '16px', color: '#444', fontSize: '12px' }}>Press ?, SPACE, or ESC to close</div>
          </div>
        </div>
      </div>
    )
  }

  // ── MAIN GAME VIEW ─────────────────────────────────────────
  const grid = buildGrid(state)
  const lastMsg = messages[messages.length - 1] || ''
  const hungerStr = player.hunger !== 'full' ? ` [${player.hunger.toUpperCase()}]` : ''
  const statusStr = `Dlvl:${dungeonLevel}  Gold:${player.gold}  Hp:${player.hp}(${player.maxHp})  Str:${player.str}(${player.maxStr})  Arm:${playerAC(player)}  Exp:${player.level}/${player.exp}${hungerStr}`

  const charW = isMobile ? 9.6 * mapScale : 9.6
  const charH = isMobile ? 19 * mapScale : 19
  const fontSize = isMobile ? 15 * mapScale : 15

  return (
    <div ref={containerRef} style={base} tabIndex={0}
         onClick={() => containerRef.current?.focus()}
         onTouchStart={handleTouchStart}
         onTouchEnd={handleTouchEnd}>

      {/* Message line */}
      <div style={{
        padding: '1px 6px', flexShrink: 0,
        color: '#dddd88', fontSize: isMobile ? 11 : 13, lineHeight: '18px',
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}>
        {lastMsg || '\u00A0'}
      </div>

      {/* Map */}
      <div ref={mapRef} style={{ flex: isMobile ? '0 0 auto' : 1, overflow: 'hidden' }}>
        <pre style={{
          margin: 0, padding: 0,
          fontFamily: '"Courier New", Courier, monospace',
          fontSize, lineHeight: `${charH}px`,
          letterSpacing: isMobile ? 0 : '1px',
          transformOrigin: 'top left',
        }}>
          {grid.map((row, y) => (
            <div key={y} style={{ height: charH, display: 'flex' }}>
              {row.map((cell, x) => (
                <span key={x} style={{ color: cell.color, minWidth: charW, display: 'inline-block', textAlign: 'center' }}>
                  {cell.char}
                </span>
              ))}
            </div>
          ))}
        </pre>
      </div>

      {/* Status bar */}
      <div style={{
        padding: '1px 6px', flexShrink: 0,
        color: '#88ee88', fontSize: isMobile ? 10 : 12, lineHeight: '18px',
        borderTop: '1px solid #222', overflow: 'hidden', whiteSpace: 'nowrap',
      }}>
        {statusStr}
      </div>

      {/* #1637 WATCH — the crawler's banner; top-anchored pill (#1656 law) */}
      {watching && <WatchToast className="fixed z-50" />}
      {!paused && (
        <div className="fixed z-50 pointer-events-auto" style={{ top: 'calc(3.5rem + var(--sat, 0px))', right: 'calc(0.75rem + var(--sar, 0px))' }}>
          <WatchButton on={watching} />
        </div>
      )}

      {/* Mobile controls */}
      {isMobile && <DPad onAction={handleMobileAction} />}
    </div>
  )
}

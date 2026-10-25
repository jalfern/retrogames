// LOBBYCHECK (#1039) — one join flow, three games, proven offline.
//
//   A. lobby.js pure rules: canonical role/relay query parsing, the identical
//      join-href shape for ssx/blob-battle/gauntlet, the generic slot model
//      (host/human/cpu/model — a model label never overwrites a friend), the
//      host-only waiting-only start gate, code hygiene (no I/O/0/1), and the
//      refusal phase.
//   B. the SAME three game shapes over the real relay (relay/server.mjs):
//      host opens -> guest joins by code -> both rosters agree -> host starts
//      -> the guest's onStart gets the host's payload and both go racing.
//      Run for SSX (cap 4), Blob Battle (cap 2) and Gauntlet (cap 2): the
//      state machine emits the same sequence everywhere — that sameness is the
//      feature the issue asked for.
//   C. the #546 reconnect ladder rides the lobby: a dropped socket while
//      waiting becomes 'reconnecting' and a second connect attempt.
//
//   node scripts/lobbycheck.mjs            # must go green
//   node scripts/lobbycheck.mjs --mutate # must go RED: the host never sends
//                                        # 'go' — the guest's kickoff has teeth

import { CODE_RE } from '../relay/core.js'
import { startRelay } from '../relay/server.mjs'
import { WebSocket } from 'ws'
import { createLobby, lobbyRole, relayFromQuery, joinHref, seatModel, displayPhase, decodeCode } from '../src/utils/lobby.js'

const MUTATE = process.argv.indexOf('--mutate') >= 0

let pass = 0, fail = 0
const ok = (cond, name, info = '') => {
    if (cond) { pass++; console.log(`  ok   ${name}`) }
    else { fail++; console.log(`FAIL   ${name}${info ? ' — ' + info : ''}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ------------------------------------------------------------------ tier A ----
console.log('A. lobby.js pure rules')
{
    ok(lobbyRole('?net=host') === 'host' && lobbyRole('?net=join&room=CODE') === 'guest' && lobbyRole('') === null && lobbyRole('?net=nope') === null,
        'role parsing is canonical: ?net=host / ?net=join / nothing')
    ok(relayFromQuery('') === 'wss://retrogames.jalfern.workers.dev' && relayFromQuery('?relay=http://x') === 'ws://x',
        'relay defaults and http->ws upgrade')

    const hrefs = ['ssx', 'blob-battle', 'gauntlet'].map((s) => joinHref(s, 'RACE2', '').replace(/^https?:\/\/[^/]+/, ''))
    ok(hrefs.every((h, i) => h === `/retrogames/${['ssx', 'blob-battle', 'gauntlet'][i]}?net=join&room=RACE2`),
        'every game shares ONE join-link shape', hrefs.join(' | '))
    ok(joinHref('ssx', 'RACE2', 'wss://other').includes('&relay=wss://other'), 'a relay override rides the share link')

    ok(seatModel(4, [0, 1, 3], []).join(',') === 'host,human,cpu,human', 'seat model labels host/human and fills cpu')
    ok(seatModel(4, [0, 1], [1, 3]).join(',') === 'host,human,cpu,model',
        'a model label never overwrites a human seat', seatModel(4, [0, 1], [1, 3]).join(','))
    ok(seatModel(2, [0], [1]).join(',') === 'host,model', 'an open seat can be a model')

    ok(decodeCode('race') === 'RACE' && decodeCode('SNOW') === '' && CODE_RE.test('SNOW') === false,
        'codes exclude I/O/0/1 — SNOW is not a legal room code')
    ok(displayPhase({ phase: 'offline', info: 'full' }) === 'refused' && displayPhase({ phase: 'waiting', info: '' }) === 'waiting',
        'a refusal reads as refused everywhere')

    const dead = () => ({ send: () => { }, onMessage: () => { }, onClose: () => { }, close: () => { } })
    const hl = createLobby({ slug: 'ssx', cap: 4, relay: 'ws://x', makeTransport: dead })
    ok(!hl.start({ seed: 1 }), 'nobody can start before the room is even open')
    hl.room.recv({ t: 'welcome', you: 1, cap: 4 })
    ok(!hl.start({ seed: 1 }), 'a guest can NEVER start the room (host-only gate)')
    hl.room.recv({ t: 'welcome', you: 0, cap: 4 })
    ok(hl.state().role === 'host' && hl.start({ seed: 7 }), 'the host, once waiting, starts')
    ok(hl.state().phase === 'racing', 'start puts the host at the front line')

    const gj = createLobby({ slug: 'gauntlet', cap: 2, relay: 'ws://x', makeTransport: dead })
    ok(!gj.join('SNOW'), 'joining with an illegal code is refused before any socket')

    const mm = createLobby({ slug: 'blob-battle', cap: 2, relay: 'ws://x', makeTransport: dead, models: [1] })
    mm.room.recv({ t: 'welcome', you: 0, cap: 2 })
    ok(mm.state().seats.join(',') === 'host,model' && mm.modelSeats().join(',') === '1', 'model seats come from the shelf, not the pad')
    mm.room.recv({ t: 'roster', n: 2, cap: 2, slots: [0, 1] })
    ok(mm.state().seats.join(',') === 'host,human', 'a friend who joins outranks the model')
}

// ------------------------------------------------------------------ tier B ----
console.log('B. one join flow over the real relay — ssx / blob-battle / gauntlet')
{
    const srv = startRelay(0)
    await new Promise((done) => { const iv = setInterval(() => { if (srv.boundPort()) { clearInterval(iv); done() } }, 20) })
    const relay = `ws://127.0.0.1:${srv.boundPort()}`
    const T = (url) => {
        const ws = new WebSocket(url)
        ws.on('error', () => { /* the close event owns the retry decision (#546) */ })
        return {
            send: (s) => { try { if (ws.readyState === 1) ws.send(s) } catch { /* gone */ } },
            onMessage: (cb) => { ws.on('message', (m) => cb(m.toString())) },
            onClose: (cb) => { ws.on('close', () => cb()) },
            close: () => { try { ws.close() } catch { /* gone */ } },
        }
    }
    const until = (pred, ms = 2000) => new Promise((done) => {
        const t0 = Date.now()
        const iv = setInterval(() => { if (pred() || Date.now() - t0 > ms) { clearInterval(iv); done(pred()) } }, 20)
    })

    const GAMES = [
        { slug: 'ssx', cap: 4, filled: 'host,human,cpu,cpu', payload: { seed: 42 } },
        { slug: 'blob-battle', cap: 2, filled: 'host,human', payload: { seed: 1337 } },
        { slug: 'gauntlet', cap: 2, filled: 'host,human', payload: { seed: 3, hero: 'wizard', peerHero: 'elf' } },
    ]

    let roomN = 0
    for (const gm of GAMES) {
        const code = 'HJ' + (22 + roomN++) // letters+digits from the I/O/0/1-free alphabet
        const hostGo = []
        const host = createLobby({ slug: gm.slug, cap: gm.cap, relay, makeTransport: T, onStart: (p) => hostGo.push(p) })
        ok(host.open(code), `${gm.slug}: host opens room ${code}`)
        ok(await until(() => host.state().phase === 'waiting' && host.state().role === 'host'), `${gm.slug}: host welcome makes it the host`)

        const guestGo = []
        const guest = createLobby({ slug: gm.slug, cap: gm.cap, relay, makeTransport: T, onStart: (p) => guestGo.push(p) })
        ok(guest.join(decodeCode(new URLSearchParams(joinHref(gm.slug, code, '').split('?')[1]).get('room'))), `${gm.slug}: guest joins via the shared href`)
        ok(await until(() => guest.state().phase === 'waiting' && guest.state().role === 'guest'), `${gm.slug}: guest is seated`)
        ok(await until(() => host.state().seats.join(',') === gm.filled), `${gm.slug}: host roster shows ${gm.filled}`, host.state().seats.join(','))
        ok(await until(() => guest.state().seats.join(',') === gm.filled), `${gm.slug}: guest sees the SAME roster`, guest.state().seats.join(','))
        ok(guest.state().slot === 1 && guest.state().cap === gm.cap, `${gm.slug}: guest slot + capacity from the welcome`)

        if (!MUTATE) ok(host.start(gm.payload), `${gm.slug}: host starts the room`)
        ok(await until(() => guestGo.length === 1), `${gm.slug}: the guest's onStart fires`, JSON.stringify(guestGo))
        ok(guestGo.length && Object.keys(gm.payload).every((k) => guestGo[0][k] === gm.payload[k]),
            `${gm.slug}: the kickoff payload crosses intact`, JSON.stringify(guestGo[0]))
        ok(guest.state().phase === 'racing' && host.state().phase === 'racing', `${gm.slug}: both boxes leave the waiting room together`)

        ok(!guest.start({ seed: 0 }), `${gm.slug}: the guest still cannot start after kickoff`)
        host.close(); guest.close()
        await sleep(120)
    }
    await srv.close()
}

// ------------------------------------------------------------------ tier C ----
console.log('C. dropped socket while waiting becomes a reconnect (#546 ladder on the lobby)')
{
    let attempts = 0
    let closeCb = null
    const flaky = () => {
        attempts++
        return {
            send: () => { },
            onMessage: (cb) => { setTimeout(() => cb(JSON.stringify({ t: 'welcome', you: 0, cap: 2 })), 5) },
            onClose: (cb) => { closeCb = cb },
            close: () => { },
        }
    }
    const l = createLobby({ slug: 'ssx', cap: 2, relay: 'ws://x', makeTransport: flaky })
    l.open('WAND')
    await sleep(40)
    ok(l.state().phase === 'waiting', 'first connect reaches waiting')
    closeCb()
    ok(l.state().phase === 'reconnecting', `a dropped socket while waiting says RECONNECTING (phase=${l.state().phase})`)
    await sleep(500)
    ok(attempts >= 2, `the lobby redials on the backoff ladder (attempts=${attempts})`)
    l.close()
    ok(l.state().phase === 'idle', 'close() parks the lobby back at idle')
}

console.log(`\nlobbycheck: ${pass} passed, ${fail} failed${MUTATE ? '  [MUTANT]' : ''}`)
process.exit(fail ? 1 : 0)

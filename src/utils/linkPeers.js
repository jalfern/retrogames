// WebRTC data-channel factories for link pads (#893). Both sides speak the
// padlink.js peer contract ({ offer/answer/ice/send/close/onOpen/onMessage/
// onState/onIce }). ICE is host-candidates only (empty iceServers): the whole
// point is the direct same-Wi-Fi path; when ICE can't pair, padlink settles
// onto the relay fallback. Kept out of the component files so fast-refresh
// stays happy and both halves share one factory.

export const RELAY_DEFAULT = 'wss://retrogames.jalfern.workers.dev'

// room.js transport over a plain WebSocket (both halves, same contract).
export function makeTransport(url) {
    const ws = new WebSocket(url)
    return {
        send: (s) => ws.send(s),
        onMessage: (cb) => { ws.onmessage = (e) => cb(e.data) },
        onClose: (cb) => { ws.onclose = cb },
        close: () => { try { ws.close() } catch { /* gone */ } },
    }
}

export function makeHostPeer() {
    const pc = new RTCPeerConnection({ iceServers: [] })
    let chan = null
    let openCb = null, msgCb = null, stateCb = null, iceCb = null
    pc.onicecandidate = (ev) => { if (ev.candidate && iceCb) iceCb(ev.candidate) }
    pc.onconnectionstatechange = () => { if (stateCb) stateCb(pc.connectionState) }
    return {
        offer: async () => {
            if (!chan) {
                chan = pc.createDataChannel('pad', { ordered: false, maxRetransmits: 0 })
                chan.onopen = () => openCb && openCb()
                chan.onmessage = (ev) => msgCb && msgCb(ev.data)
            }
            const sd = await pc.createOffer()
            await pc.setLocalDescription(sd)
            return sd
        },
        answer: async (sd) => { await pc.setRemoteDescription(sd) },
        ice: (c) => { pc.addIceCandidate(c).catch(() => { /* stale candidate */ }) },
        send: (s) => { if (chan && chan.readyState === 'open') chan.send(s) },
        close: () => { try { pc.close() } catch { /* gone */ } },
        onOpen: (cb) => { openCb = cb; if (chan && chan.readyState === 'open') cb() },
        onMessage: (cb) => { msgCb = cb },
        onState: (cb) => { stateCb = cb },
        onIce: (cb) => { iceCb = cb },
    }
}

export function makePadPeer() {
    const pc = new RTCPeerConnection({ iceServers: [] })
    let chan = null
    let openCb = null, msgCb = null, stateCb = null, iceCb = null
    pc.ondatachannel = (ev) => {
        chan = ev.channel
        chan.onopen = () => openCb && openCb()
        chan.onmessage = (ev2) => msgCb && msgCb(ev2.data)
    }
    pc.onconnectionstatechange = () => { if (stateCb) stateCb(pc.connectionState) }
    pc.onicecandidate = (ev) => { if (ev.candidate && iceCb) iceCb(ev.candidate) }
    return {
        answer: async (sd) => {
            await pc.setRemoteDescription(sd)
            const a = await pc.createAnswer()
            await pc.setLocalDescription(a)
            return a
        },
        ice: (c) => { pc.addIceCandidate(c).catch(() => { /* stale candidate */ }) },
        send: (s) => { if (chan && chan.readyState === 'open') chan.send(s) },
        close: () => { try { pc.close() } catch { /* gone */ } },
        onOpen: (cb) => { openCb = cb },
        onMessage: (cb) => { msgCb = cb },
        onState: (cb) => { stateCb = cb },
        onIce: (cb) => { iceCb = cb },
    }
}

// JOUST — the native shell over Sim.swift (a tick-exact port of the web
// sim) and Planner.swift (the attract demo / WATCH autopilot). Mirrors
// src/games/Joust/index.jsx: attract → play → over, a fixed 60 Hz sim step,
// the same paint order, particles, popups, toasts, shake and flash. The sim
// owns physics and rules; this file only paints, plays sounds and listens.

import UIKit
import GameController
import CoreHaptics

#if os(tvOS)
typealias BaseViewController = GCEventViewController
#else
typealias BaseViewController = UIViewController
#endif

final class GameViewController: BaseViewController {
    enum Screen { case attract, play, over }

    private let fb = Surface(256, 224)
    private let stage = UIView()
    private let controls = Controls()
    private let synth = Synth.shared
    private var link: CADisplayLink?

    private var screen = Screen.attract
    private var paused = false
    private var watching = false
    private var gs: Game?
    private var demo = Game(players: 1)
    private var playersCount = 1
    private var last: CFTimeInterval = 0
    private var acc: Double = 0
    private var overAt: CFTimeInterval = 0
    private var attractT: Double = 0
    private var frameN = 0

    private struct Part { var x, y, vx, vy: Double; var ttl: Int; var col: RGBA }
    private struct Popup { var x, y: Double; var msg: String; var ttl: Int }
    private var parts: [Part] = []
    private var popups: [Popup] = []
    private var toast = 0, toastMsg = "", toastCol = hex("#f8d800")
    private var shake = 0, flash = 0
    private var topScore = UserDefaults.standard.integer(forKey: "arcade.joust.top")
    private var finalInfo: (score: Int, wave: Int, win: Bool, p2: Bool, s1: Int, s2: Int, top: Int)?

    private static let MESSAGES = [
        "A FLAPS · LEFT / RIGHT TURNS",
        "JOUST FROM ABOVE: 200 / 400 / 800",
        "THE LOWER LANCE LOSES · EVEN IS A WIPEOUT",
        "DEFEATED RIDERS DROP EGGS - CATCH THEM",
        "TROLL HANDS RISE FROM THE LAVA · 5 WAVES",
        "TWO CONTROLLERS: TWO RIDERS",
    ]

    // ------------------------------------------------------------ setup ----
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        stage.layer.magnificationFilter = .nearest
        stage.layer.contentsGravity = .resizeAspect
        stage.backgroundColor = .black
        view.addSubview(stage)
        #if os(tvOS)
        controllerUserInteractionEnabled = true // Menu leaves the app from the title screen
        #endif
        #if os(iOS)
        view.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tap)))
        #endif
        let l = CADisplayLink(target: self, selector: #selector(frame(_:)))
        l.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 60, preferred: 60)
        l.add(to: .main, forMode: .common)
        link = l
        launchOptions()
        NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self, self.screen == .play else { return }
            self.setPaused(true)
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        #if os(iOS)
        // leave the bottom of a portrait phone for the on-screen pad
        let safe = view.bounds.inset(by: view.safeAreaInsets)
        if safe.height > safe.width {
            stage.frame = CGRect(x: safe.minX, y: safe.minY + 8, width: safe.width, height: safe.width * 224 / 256)
        } else {
            stage.frame = safe
        }
        #else
        stage.frame = view.bounds
        #endif
    }

    #if os(iOS)
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    @objc private func tap() {
        if screen == .attract { startPlay(1) }
        else if screen == .over, CACurrentMediaTime() - overAt > 0.8 { startPlay(playersCount) }
        else if screen == .play && paused { setPaused(false) }
        else if screen == .play && watching { watching = false }
    }
    #endif

    // ---------------------------------------------------- test hooks ----
    // `-start 1|2` jumps into a game, `-watch YES` hands it to the autopilot,
    // `-selfcheck YES` replays the bundled golden traces ON THIS DEVICE and
    // prints MATCH/DIVERGE lines (log + screen): parity on the real hardware.
    private var checkLines: [String] = []

    private func launchOptions() {
        let d = UserDefaults.standard
        let n = d.integer(forKey: "start")
        if n == 1 || n == 2 { startPlay(n, watch: d.bool(forKey: "watch")) }
        if d.bool(forKey: "selfcheck") {
            checkLines = ["SELF-CHECK RUNNING..."]
            DispatchQueue.global(qos: .userInitiated).async {
                let lines = Self.selfCheck()
                for l in lines { NSLog("JOUST SELFCHECK %@", l); print("JOUST SELFCHECK \(l)") }
                fflush(stdout)
                DispatchQueue.main.async { self.checkLines = lines }
            }
        }
    }

    static func selfCheck() -> [String] {
        guard let dir = Bundle.main.resourceURL?.appendingPathComponent("traces"),
              let names = try? FileManager.default.contentsOfDirectory(atPath: dir.path) else { return ["NO BUNDLED TRACES"] }
        var out: [String] = []
        for n in names.filter({ !$0.hasSuffix(".trace.json") }).sorted() {
            do {
                let rec = try Recording(data: Data(contentsOf: dir.appendingPathComponent(n)))
                let (states, mm) = replay(rec)
                let g = try Data(contentsOf: dir.appendingPathComponent(n.replacingOccurrences(of: ".json", with: ".trace.json")))
                let (ticks, d) = try compare(golden: g, port: states)
                if let d { out.append("DIVERGE \(n) TICK \(d.tick) \(d.field) GOLDEN \(d.golden) PORT \(d.port)") }
                else { out.append("MATCH \(n) \(ticks)/\(ticks) TICKS" + (mm == nil ? "" : " HASH DIFF \(mm!)")) }
            } catch { out.append("ERROR \(n) \(error)") }
        }
        return out
    }

    private func setScreen(_ s: Screen) {
        screen = s
        #if os(tvOS)
        controllerUserInteractionEnabled = (s == .attract)
        #endif
    }

    private func setPaused(_ p: Bool) {
        paused = p
        synth.suspended = p
    }

    private func say(_ m: String, _ c: RGBA = hex("#f8d800")) { toastMsg = m; toast = 110; toastCol = c }

    private func startPlay(_ players: Int, watch: Bool = false) {
        playersCount = players
        gs = Game(players: players)
        parts = []; popups = []
        finalInfo = nil
        watching = watch
        setPaused(false)
        acc = 0
        setScreen(.play)
        synth.startMusic()
    }

    // ----------------------------------------------------------- events ----
    private func burst(_ x: Double, _ y: Double, _ col: RGBA, _ n: Int = 12) {
        for i in 0..<n {
            let a = Double(i) / Double(n) * .pi * 2
            let sp = 0.6 + Double(i % 3) * 0.5
            parts.append(Part(x: x, y: y, vx: cos(a) * sp, vy: sin(a) * sp - 0.4, ttl: 26 + (i % 3) * 8, col: col))
        }
    }

    private func handleEvents(_ s: Game, audible: Bool) {
        let evs = s.events
        s.events.removeAll()
        for e in evs {
            switch e.t {
            case "death": burst(e.x, e.y, hex("#f8f8f8"), 16); shake = 14; flash = 8; rumble()
            case "kill", "joustwin": burst(e.x, e.y, e.kind == "shadow" ? hex("#7058b8") : hex("#f8a800"))
            case "hatch": burst(e.x, e.y, hex("#f8f800"), 8)
            case "eggget": burst(e.x, e.y, hex("#58d8f8"), 8)
            case "crumble": burst(e.x, e.y, hex("#8898a8"), 10)
            default: break
            }
            if ["kill", "joustwin", "hatch", "eggdrop", "eggget", "crumble", "death"].contains(e.t) && e.pts != 0 {
                popups.append(Popup(x: e.x, y: e.y, msg: "+\(e.pts)", ttl: 50))
            }
            if !audible { continue }
            let sfx: String? = switch e.t {
            case "joustwin": "joust"
            case "kill" where e.cause == "terrain": "smite"
            case "death": "death"
            case "eggget": "egg-get"
            case "eggdrop": "egg-drop"
            case "hatch": "hatch"
            case "crumble": "crumble"
            case "clear": "clear"
            case "1up": "oneup"
            case "over": "over"
            case "win": "win"
            default: nil
            }
            if let sfx { synth.sfx(sfx) }
            if e.t == "clear" { if e.perfect { say("PERFECT! BONUS \(e.bonus)", hex("#58f878")) } else { say("WAVE CLEAR +\(e.bonus)") } }
            else if e.t == "wave" { say(e.name ?? "", hex("#00e8f8")) }
            else if e.t == "win" { say("THE REALMS ARE YOURS!", hex("#f8d800")) }
        }
    }

    private func rumble() {
        // a short thud on controllers that have haptics (the web build's rumble(400, 1))
        for c in GCController.controllers().prefix(2) {
            guard let engine = c.haptics?.createEngine(withLocality: .default) else { continue }
            try? engine.start()
            let ev = CHHapticEvent(eventType: .hapticContinuous, parameters: [CHHapticEventParameter(parameterID: .hapticIntensity, value: 1)], relativeTime: 0, duration: 0.4)
            if let pat = try? CHHapticPattern(events: [ev], parameters: []), let pl = try? engine.makePlayer(with: pat) {
                try? pl.start(atTime: 0)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { engine.stop() }
            }
        }
    }

    private func finish(_ s: Game) {
        guard s.end != nil else { return }
        if s.total > topScore {
            topScore = s.total
            UserDefaults.standard.set(topScore, forKey: "arcade.joust.top")
        }
        overAt = CACurrentMediaTime()
        finalInfo = (s.total, s.wave, s.end == "win", s.players.count == 2, s.players[0].score, s.players.count > 1 ? s.players[1].score : 0, topScore)
        setScreen(.over)
    }

    // ------------------------------------------------------------ input ----
    private func handleInput() {
        controls.poll()
        let p = controls.pressed
        switch screen {
        case .attract:
            if p[0].y { startPlay(1, watch: true) }
            else if p[1].a || p[1].flap || (p[0].x && controls.seatCount >= 2) { startPlay(2) }
            else if p[0].a || p[0].flap { startPlay(1) }
        case .over:
            if CACurrentMediaTime() - overAt < 0.8 { return }
            if p[0].a || p[0].flap || p[1].a { startPlay(playersCount) }
            else if p[0].b || p[0].menu { setScreen(.attract); demo = Game(players: 1) }
        case .play:
            if p[0].menu || p[1].menu {
                setPaused(!paused)
                return
            }
            if paused {
                if p[0].a { setPaused(false) }
                else if p[0].b { setPaused(false); setScreen(.attract); demo = Game(players: 1); synth.stopMusic() }
                return
            }
            if p[0].y { watching.toggle(); return }
            if watching && (p[0].left || p[0].right || p[0].flap || p[0].a || p[0].b) { watching = false }
        }
    }

    // ------------------------------------------------------------ frame ----
    @objc private func frame(_ l: CADisplayLink) {
        let ts = l.timestamp
        if last == 0 { last = ts }
        let ft = min(ts - last, 0.25)
        last = ts
        frameN += 1
        handleInput()
        synth.pump()
        if !paused {
            acc += ft
            let dt = 1.0 / 60.0
            while acc >= dt {
                acc -= dt
                if screen == .attract {
                    demo.step(demo.plan())
                    if demo.end != nil { demo = Game(players: 1) }
                    handleEvents(demo, audible: false)
                    attractT += dt
                } else if screen == .play, let g = gs, g.end == nil {
                    let s = controls.seats
                    let inp = watching ? g.plan() : Input(l: s[0].left, r: s[0].right, f: s[0].flap, l2: s[1].left, r2: s[1].right, f2: s[1].flap)
                    g.step(inp)
                    handleEvents(g, audible: true)
                    finish(g)
                }
            }
        }
        paint()
        present()
    }

    // ------------------------------------------------------------ paint ----
    private func drawRider(_ rd: Rider?, _ kind: String) {
        guard let rd, rd.state != "dead" else { return }
        if rd.invuln > 0 && (rd.invuln / 4) % 2 == 0 && screen == .play { return }
        let frame = rd.onGround ? 1 : (rd.flapT > 0 ? ((rd.flapT / 3) % 2 == 0 ? 0 : 2) : 1)
        fb.blitRotated(riderSprite(kind, frame), Int(jsRound(rd.x)), Int(jsRound(rd.y)), rd.a, flip: rd.vx < -0.05, ax: 20, ay: 30)
    }

    private func paintWorld(_ s: Game) {
        let t = s.tick
        paintSky(fb, GROUND_Y + 10, t)
        var pits: [(Int, Int)] = []
        var cursor = 0.0
        for g in s.segs.filter({ !$0.gone && $0.y == GROUND_Y }).sorted(by: { $0.x0 < $1.x0 }) {
            if g.x0 > cursor { pits.append((Int(cursor), Int(g.x0))) }
            cursor = max(cursor, g.x1)
        }
        if cursor < W { pits.append((Int(cursor), Int(W))) }
        for (x0, x1) in pits { paintLava(fb, x0, x1, Int(LAVA_TOP), Int(H), t) }
        let hand = handSprite()
        for h in s.hands where h.y < LAVA_TOP + 6 {
            fb.blit(hand, Int(jsRound(h.x - Double(hand.w) / 2)), Int(jsRound(h.y - 4)))
        }
        for g in s.segs where !g.gone {
            let crumbled = g.crumble == true && g.rideT > 40
            var x = g.x0
            while x < g.x1 {
                let w = min(16, g.x1 - x)
                let warm = g.y < LAVA_TOP && g.crumble == true ? Double(g.rideT) / 100 : 0
                fb.blitScaled(stoneTile(crumbled, warm), Int(x), Int(g.y), Int(w), 8)
                x += 16
            }
        }
        for e in s.eggs {
            fb.blit(eggSprite(e.kind, e.timer < 90), Int(jsRound(e.x - 6)), Int(jsRound(e.y - 7)))
        }
        for e in s.riders { drawRider(e, e.kind ?? "bounder") }
        for p in s.players { drawRider(p.rider, p.id == 0 ? "p1" : "p2") }
    }

    private func pad6(_ n: Int) -> String { let s = String(n); return String(repeating: "0", count: max(0, 6 - s.count)) + s }

    private func paintHud(_ s: Game) {
        let p1 = s.players[0]
        text5(fb, "PLAYER 1", 4, 3, hex("#38b8f8"))
        text5(fb, pad6(p1.score), 4, 10, hex("#f8f8f8"))
        for i in 0..<max(0, p1.lives) { lifeGlyph(fb, 4 + Double(i) * 10, 19, hex("#b858f8")) }
        if s.players.count == 2 {
            let p2 = s.players[1]
            text5(fb, "PLAYER 2", W - 4 - textWidth("PLAYER 2"), 3, hex("#58f878"))
            text5(fb, pad6(p2.score), W - 4 - textWidth("000000"), 10, hex("#f8f8f8"))
            for i in 0..<max(0, p2.lives) { lifeGlyph(fb, W - 4 - Double(i + 1) * 10, 19, hex("#28a858")) }
        }
        let wt = "W\(s.wave + 1)"
        text5(fb, wt, W / 2 - textWidth(wt) / 2, 3, hex("#f8d800"))
        text5(fb, "TOP \(pad6(max(topScore, s.total)))", W / 2 - textWidth("TOP 000000") / 2, 10, hex("#787878"))
    }

    private func paint() {
        fb.ox = 0; fb.oy = 0
        if shake > 0 {
            fb.ox = ((shake * 7919) % 5) - 2
            fb.oy = ((shake * 104729) % 5) - 2
            shake -= 1
        }
        fb.clear(0xFF00_0000)
        let s = screen == .attract ? demo : (gs ?? demo)
        paintWorld(s)
        paintHud(s)
        if !paused {
            parts = parts.filter { $0.ttl > 0 }
            for i in parts.indices { parts[i].x += parts[i].vx; parts[i].y += parts[i].vy; parts[i].vy += 0.05; parts[i].ttl -= 1 }
            popups = popups.filter { $0.ttl > 0 }
            for i in popups.indices { popups[i].y -= 0.3; popups[i].ttl -= 1 }
        }
        for p in parts { fb.fill(jsRound(p.x), jsRound(p.y), 2, 2, p.col) }
        for p in popups { text5(fb, p.msg, p.x - textWidth(p.msg) / 2, p.y, p.ttl > 20 ? hex("#f8f8f8") : hex("#787878")) }
        if flash > 0 {
            fb.fill(0, 0, W, H, hex("#f83800"), Double(flash) / 24)
            if !paused { flash -= 1 }
        }
        if s.phase == "banner" && s.pending == nil && screen != .over {
            let b = WAVES[s.wave].name
            text5(fb, b, W / 2 - textWidth(b, 3) / 2, 90, hex("#00e8f8"), 3)
        }
        if toast > 0 {
            text5(fb, toastMsg, W / 2 - textWidth(toastMsg, 2) / 2, 118, toastCol, 2)
            if !paused { toast -= 1 }
        }
        fb.ox = 0; fb.oy = 0
        paintOverlay()
        for (i, l) in checkLines.enumerated() {
            let col = l.hasPrefix("MATCH") ? hex("#58f878") : l.hasPrefix("SELF") ? hex("#f8d800") : hex("#f83800")
            fb.fill(0, 168 + Double(i) * 8 - 1, W, 8, 0xFF00_0000, 0.7)
            text5(fb, String(l.prefix(63)), 2, 168 + Double(i) * 8, col)
        }
    }

    private func paintOverlay() {
        let pulse = (frameN / 30) % 2 == 0
        switch screen {
        case .attract:
            fb.fill(0, 0, W, H, 0xFF00_0000, 0.55)
            centered(fb, "JOUST", 44, hex("#f8d800"), 5)
            let msg = Self.MESSAGES[Int(attractT / 2.6) % Self.MESSAGES.count]
            centered(fb, msg, 90, hex("#fef3c7"), 1, alpha: 0.85)
            #if os(iOS)
            let start = "TAP OR PRESS A"
            #else
            let start = "PRESS A TO START"
            #endif
            centered(fb, start, 112, hex("#fde047"), 2, alpha: pulse ? 1 : 0.45)
            if controls.seatCount >= 2 { centered(fb, "PLAYER 2 PRESS A · OR X · FOR TWO RIDERS", 136, hex("#58f878")) }
            centered(fb, "Y: WATCH THE AUTOPILOT RIDE", 148, 0xFFFF_FFFF, 1, alpha: 0.5)
        case .over:
            guard let f = finalInfo else { break }
            fb.fill(0, 0, W, H, 0xFF00_0000, 0.7)
            centered(fb, f.win ? "THE SKY IS YOURS" : "GAME OVER", 64, f.win ? hex("#fde047") : hex("#f87171"), 3)
            if f.p2 {
                text5(fb, "P1 \(pad6(f.s1))", 128 - 4 - textWidth("P1 000000", 2), 94, hex("#7dd3fc"), 2)
                text5(fb, "P2 \(pad6(f.s2))", 128 + 4, 94, hex("#86efac"), 2)
            } else {
                centered(fb, pad6(f.score), 94, hex("#cffafe"), 2)
            }
            centered(fb, "TOP \(pad6(f.top)) · " + (f.win ? "ALL FIVE WAVES CONQUERED" : "FELL IN WAVE \(f.wave + 1)"), 114, hex("#67e8f9"))
            centered(fb, "A RUNS IT BACK · B FOR THE TITLE", 134, hex("#cffafe"), 1, alpha: pulse ? 1 : 0.5)
        case .play:
            if paused {
                fb.fill(0, 0, W, H, 0xFF00_0000, 0.6)
                centered(fb, "PAUSED", 80, hex("#f8f8f8"), 3)
                centered(fb, "MENU OR A RESUMES · B QUITS", 110, hex("#cffafe"))
            } else if watching {
                centered(fb, "WATCHING · ANY BUTTON TAKES THE REINS", 30, hex("#f8d800"), 1, alpha: pulse ? 1 : 0.6)
            }
        }
    }

    private func present() {
        let data = fb.pix.withUnsafeBufferPointer { Data(buffer: $0) }
        guard let prov = CGDataProvider(data: data as CFData),
              let img = CGImage(width: 256, height: 224, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: 256 * 4,
                                space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                bitmapInfo: CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue),
                                provider: prov, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
        else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        stage.layer.contents = img
        CATransaction.commit()
    }
}

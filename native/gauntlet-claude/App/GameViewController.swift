// GAUNTLET — the native shell over Sim.swift (a tick-exact port of the web
// sim) and Planner.swift (the pilot + CPU partner seat). Mirrors
// src/games/Gauntlet/index.jsx: attract → hero select → play → over, a fixed
// 60 Hz step, the event sounds and narrator, the cabinet view (View.swift).
// Two seats: the second controller joins as player 2 on the hero select, or
// X seats the CPU partner (partnerPad — the same pad-only seat the web runs).
// Y is WATCH: the pilot (decide) drives seat 1 until any other button.

import UIKit
import GameController
import RetroKit
import RetroKitApp

#if os(tvOS)
typealias BaseViewController = GCEventViewController
#else
typealias BaseViewController = UIViewController
#endif

final class GameViewController: BaseViewController {
    enum Mode { case attract, select, play, pause, over }

    private let stage = UIView()
    private let controls = Controls.gauntlet()
    private let synth = Synth.shared
    private let painter = Painter()
    private var link: CADisplayLink?

    private var mode = Mode.attract
    private var gs: Game!
    private var last: CFTimeInterval = 0, acc = 0.0, clock = 0.0, overAt = 0.0
    private var watching = false
    private var seat2 = "off" // off | cpu | human
    private var pick = [0, 3] // hero index per seat (warrior / elf)
    private var seatPrevA = false, p2PrevA = false, p2PrevB = false
    private var checkLines: [String] = []
    private var demoWin = 0
    private var hi = UserDefaults.standard.integer(forKey: "arcade.gauntlet.hi")
    private let perf = UserDefaults.standard.bool(forKey: "perf")
    private var perfT = 0.0, perfFrames = 0, perfSteps = 0, perfWorst = 0.0

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        stage.layer.magnificationFilter = .nearest
        stage.layer.contentsGravity = .resizeAspect
        stage.backgroundColor = .black
        view.addSubview(stage)
        #if os(tvOS)
        controllerUserInteractionEnabled = true
        #endif
        #if os(iOS)
        view.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tap)))
        #endif
        painter.hi = hi
        painter.onReveal = { [weak self] in for (i, f) in [98.0, 82].enumerated() { self?.synth.tone(f, 0.12, .square, 0.05, Double(i) * 0.06) } }
        newDemo()
        let l = CADisplayLink(target: self, selector: #selector(frame(_:)))
        l.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 60, preferred: 60)
        l.add(to: .main, forMode: .common)
        link = l
        launchOptions()
        NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            if self?.mode == .play { self?.setMode(.pause) }
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        #if os(iOS)
        // the on-screen stick and buttons sit in the side margins of a phone;
        // a portrait iPad keeps the cabinet at the top
        let safe = view.bounds.inset(by: view.safeAreaInsets)
        if safe.height > safe.width { stage.frame = CGRect(x: safe.minX, y: safe.minY + 8, width: safe.width, height: safe.width * 3 / 4) }
        else { let w = min(safe.width - 360, safe.height * 4 / 3); stage.frame = CGRect(x: safe.midX - w / 2, y: safe.minY, width: w, height: safe.height) }
        #else
        stage.frame = view.bounds
        #endif
    }

    #if os(iOS)
    override func viewDidAppear(_ animated: Bool) { super.viewDidAppear(animated); controls.screenAppeared() }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { traitCollection.userInterfaceIdiom == .phone ? .landscape : .all }
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    @objc private func tap() {
        switch mode {
        case .attract: setMode(.select)
        case .select: startPlay()
        case .pause: setMode(.play)
        case .over: if clock - overAt > 1 { toTitle() }
        case .play: if watching { watching = false }
        }
    }
    #endif

    // MARK: hooks — -start 1|2 (2 = CPU partner), -watch YES, -selfcheck YES, -perf YES

    private func launchOptions() {
        let d = UserDefaults.standard
        SelfCheck.startIfAsked(tag: "GAUNTLET", check: GameViewController.selfCheck) { self.checkLines = $0 }
        let n = d.integer(forKey: "start")
        if n == 1 || n == 2 { seat2 = n == 2 ? "cpu" : "off"; startPlay(); watching = d.bool(forKey: "watch") }
    }

    static func selfCheck() -> [String] {
        SelfCheck.goldens { n, data in
            let rec = try Recording(data: data)
            let (states, mm) = replay(rec)
            var extra: [String] = []
            if !n.contains("death") { // these pads ARE the web planner's answers
                if let why = plannerRaceOwnPads(rec) { extra.append("DIVERGE PLANNER \(n) \(why)") }
                else { extra.append("MATCH PLANNER \(n) \(rec.ticks)/\(rec.ticks) TICKS SAID WHAT PLANNER.JS SAID") }
            }
            return SelfCheck.Run(states: states, hashMismatch: mm, extra: extra)
        }
    }

    // MARK: modes

    private func setMode(_ m: Mode) {
        mode = m
        #if os(tvOS)
        controllerUserInteractionEnabled = (m == .attract)
        #endif
        synth.suspended = (m == .pause)
    }

    private func newDemo() {
        gs = newGame(Int.random(in: 0..<97), partner: true)
        seatPrevA = false
        demoWin = 0
    }

    private func toTitle() { watching = false; newDemo(); setMode(.attract) }

    private func startPlay() {
        let heroKey = HERO_ORDER[pick[0]]
        var pk = HERO_ORDER[pick[1]]
        if pk == heroKey { pk = HERO_ORDER[(pick[1] + 1) % 4] }
        gs = Game(seed: Int.random(in: 0..<97), hero: heroKey, partner: seat2 != "off", partnerKey: pk, topDown: true)
        gs.partnerOn = seat2 != "off"
        gs.partnerMode = seat2 == "human" ? "human" : seat2 == "cpu" ? "cpu" : "off"
        gs.partnerHuman = seat2 == "human"
        seatPrevA = false; p2PrevA = false; p2PrevB = false
        watching = false
        painter.parts = []; painter.debris = []
        acc = 0
        setMode(.play)
        painter.toast = 150; painter.toastMsg = "\(HEROES[heroKey]!.who) ENTERS THE GAUNTLET"
        synth.narrate(painter.toastMsg)
    }

    private func finish() {
        if gs.score > hi { hi = gs.score; painter.hi = hi; UserDefaults.standard.set(hi, forKey: "arcade.gauntlet.hi") }
        overAt = clock
        watching = false
        setMode(.over)
    }

    // MARK: events → sound, toasts, juice (index.jsx handleEvents)

    private func handleEvents() {
        let evs = gs.events
        gs.events.removeAll()
        let audible = mode == .play
        let V = Double(VWI) / 2, Hh = Double(VHI) / 2
        for e in evs {
            switch e.type {
            case "say": painter.toastMsg = e.text; painter.toast = 150; if audible { synth.narrate(e.text) }
            case "sword": if audible { synth.sweep(e.hit ? 180 : 320, e.hit ? 90 : 180, 0.07, .sawtooth, 0.05) }
            case "shoot": if audible { synth.sweep(880, 1500, 0.06, .square, 0.04) }
            case "monsterHit": if audible { synth.noise(0.04, 0.05) }; painter.burst(0, 0, 4, "#ffd23f")
            case "kill": if audible { synth.sweep(520, 120, 0.18, .square, 0.07) }; painter.burst(0, 0, 8, e.potion ? "#8fb0ff" : "#ff8a5d")
            case "hit": if audible { synth.noise(0.09, 0.09); synth.tone(120, 0.1, .square, 0.08) }; painter.shake = 5; painter.flash = 6
            case "cast": if audible { synth.sweep(240, 480, 0.14, .sawtooth, 0.05) }
            case "drain": if audible { synth.tone(70 + Double(gs.tick % 3) * 10, 0.05, .triangle, 0.05) }; painter.flash = 3
            case "pickup":
                guard audible else { break }
                if e.t == "food" { synth.sweep(330, 660, 0.18, .square, 0.07) }
                else if e.t == "key" { synth.tone(1320, 0.08, .square, 0.06); synth.tone(1760, 0.1, .square, 0.05) }
                else if e.t == "potion" { synth.sweep(440, 1760, 0.35, .square, 0.08); painter.flash = 10 }
                else if e.t == "gold" { synth.tone(990 + Double(e.v), 0.06, .square, 0.05) }
            case "keyUsed": if audible { synth.sweep(660, 990, 0.12, .triangle, 0.06) }
            case "doorOpen": if audible { synth.sweep(160, 90, 0.12, .sawtooth, 0.05) }
            case "wallHit": if audible { synth.tone(150, 0.04, .square, 0.05) }
            case "wallBreak":
                if audible { synth.noise(0.2, 0.09); for (i, f) in [147.0, 110, 82].enumerated() { synth.tone(f, 0.07, .triangle, 0.05, Double(i) * 0.05) } }
                painter.shake = 5
                for i in 0..<3 { painter.debris.append(.init(x: e.x + 0.5, y: e.y + 0.5, vx: (Double(i) - 1) * 0.8 * 0.05, vy: (0.4 + 0.35 * Double(i)) * 0.05, g: 0.18 * 0.05, t: 0)) }
            case "trapClose": if audible { synth.tone(80, 0.14, .square, 0.09) }; painter.shake = 4
            case "trapOpen": if audible { synth.sweep(90, 160, 0.12, .triangle, 0.04) }
            case "teleport": if audible { synth.sweep(300, 1500, 0.22, .sine, 0.07) }; painter.wflash = 5
            case "stun": if audible { synth.sweep(220, 90, 0.2, .sawtooth, 0.06) }
            case "slam": if audible { synth.tone(70, 0.16, .square, 0.1) }; painter.shake = 6
            case "genHit": if audible { synth.tone(200, 0.05, .square, 0.05) }
            case "genKill": if audible { synth.noise(0.25, 0.1); synth.sweep(300, 80, 0.3, .sawtooth, 0.08) }; painter.shake = 8
            case "spawn": if audible { synth.sweep(80, 220, 0.14, .triangle, 0.04) }
            case "deathSpawn": if audible { synth.sweep(220, 55, 0.8, .sawtooth, 0.09) }
            case "death": if audible { synth.death() }; painter.shake = 9; painter.flash = 14
            case "levelClear":
                if e.warp != nil {
                    if audible { for (i, f) in [330.0, 660, 990].enumerated() { synth.tone(f, 0.1, .sine, 0.07, Double(i) * 0.06) } }
                    painter.burst(0, 0, 14, "#5dff8f"); painter.wflash = 6
                }
                if audible { for (i, f) in [523.0, 659, 784, 1047].enumerated() { synth.tone(f, 0.13, .square, 0.08, Double(i) * 0.11) } }
                let nm = LEVELS[e.level].name
                painter.toastMsg = (nm.range(of: " · ").map { String(nm[$0.upperBound...]) } ?? nm) + " CLEARED"; painter.toast = 150
                if audible { synth.narrate(painter.toastMsg) }
            case "level": if audible { synth.sweep(220, 440, 0.3, .triangle, 0.07) }
            case "1up": if audible { synth.sweep(440, 1760, 0.5, .square, 0.08) }
            case "respawn": if audible { synth.sweep(110, 330, 0.3, .triangle, 0.06) }
            case "win": if audible { synth.sweep(220, 1760, 0.9, .square, 0.1) }; painter.shake = 10
            default: break
            }
        }
        _ = (V, Hh)
    }

    // MARK: loop

    @objc private func frame(_ l: CADisplayLink) {
        let now = l.timestamp
        if last == 0 { last = now }
        var dt = now - last
        last = now
        if dt > 0.25 { dt = 0.25 }
        clock += dt
        controls.poll()
        let p = controls.pressed, held = controls.held

        switch mode {
        case .attract:
            if p[0].a || p[0].up || p[0].down || p[0].left || p[0].right { setMode(.select); paint(); return }
            if p[0].y { seat2 = "cpu"; startPlay(); watching = true }
        case .select:
            if p[0].left { pick[0] = (pick[0] + 3) % 4; synth.tone(660, 0.04, .square, 0.04) }
            if p[0].right { pick[0] = (pick[0] + 1) % 4; synth.tone(660, 0.04, .square, 0.04) }
            if p[0].x { seat2 = seat2 == "cpu" ? "off" : "cpu"; synth.tone(seat2 == "cpu" ? 880 : 440, 0.05, .square, 0.05) }
            if p[1].a && seat2 != "human" { seat2 = "human"; synth.sweep(440, 880, 0.12, .square, 0.06) }
            if seat2 == "human" {
                if p[1].left { pick[1] = (pick[1] + 3) % 4 }
                if p[1].right { pick[1] = (pick[1] + 1) % 4 }
                if p[1].b { seat2 = "off" }
            }
            if p[0].a { startPlay(); paint(); return }
            if p[0].b || p[0].menu { toTitle(); paint(); return }
            paint(); return
        case .pause:
            if p[0].a || p[0].menu { setMode(.play) }
            else if p[0].b { toTitle() }
            paint(); return
        case .over:
            if (p[0].a || p[0].b) && clock - overAt > 1 { toTitle() }
            paint(); return
        case .play:
            if p[0].menu || p[1].menu { setMode(.pause); paint(); return }
            if p[0].y { watching.toggle(); synth.tone(watching ? 660 : 880, 0.07, .square, 0.06); synth.tone(watching ? 990 : 440, 0.1, .square, 0.06, 0.07) }
            else if watching && (p[0].a || p[0].b || p[0].up || p[0].down || p[0].left || p[0].right) { watching = false; synth.tone(880, 0.07, .square, 0.06); synth.tone(440, 0.12, .square, 0.06, 0.07) }
        }

        acc += dt
        var steps = 0
        while acc >= 1.0 / 60 && steps < 8 {
            acc -= 1.0 / 60; steps += 1
            if mode == .attract {
                if gs.end != nil {
                    if demoWin > 0 { demoWin -= 1; if demoWin == 0 { newDemo() } }
                    else { demoWin = gs.end == "win" ? 240 : 60 }
                    continue
                }
                let inp = gs.decide()
                let raw = gs.partnerPad(prevA: seatPrevA)
                seatPrevA = raw.a
                gs.step(inp, Input(left: raw.left, right: raw.right, fwd: raw.up, back: raw.down, sword: raw.a))
            } else if mode == .play {
                var pInp: Input? = nil
                if gs.partnerOn, let pt = gs.partner, !pt.down {
                    if seat2 == "cpu" {
                        let raw = gs.partnerPad(prevA: seatPrevA)
                        pInp = Input(left: raw.left, right: raw.right, fwd: raw.up, back: raw.down, sword: raw.a)
                        seatPrevA = raw.a
                    } else {
                        let h2 = held[1]
                        pInp = Input(left: h2.left, right: h2.right, fwd: h2.up, back: h2.down, sword: (h2.a && !p2PrevA) || (h2.b && !p2PrevB))
                        p2PrevA = h2.a; p2PrevB = h2.b
                    }
                }
                let inp: Input
                if watching { inp = gs.decide() }
                else {
                    let h1 = held[0], e1 = steps == 1 ? p[0] : Buttons()
                    inp = Input(left: h1.left, right: h1.right, fwd: h1.up, back: h1.down, sword: e1.a, arrow: e1.b)
                }
                gs.step(inp, pInp)
                handleEvents()
                if gs.end != nil { finish(); break }
            }
        }
        if mode == .attract { gs.events.removeAll() }
        if perf {
            perfFrames += 1; perfSteps += steps; perfWorst = max(perfWorst, dt)
            if clock - perfT > 2 {
                print(String(format: "GAUNTLET PERF %.1f fps, %.2f steps/frame, worst frame %.1f ms", Double(perfFrames) / (clock - perfT), Double(perfSteps) / Double(max(1, perfFrames)), perfWorst * 1000)); fflush(stdout)
                perfT = clock; perfFrames = 0; perfSteps = 0; perfWorst = 0
            }
        }
        paint()
        synth.pump()
    }

    // MARK: paint

    private func paint() {
        let fb = painter.fb
        if mode == .select { paintSelect() }
        else {
            painter.draw(gs)
            let cx = Double(CW) / 2
            switch mode {
            case .attract:
                fb.fill(0, 0, Double(CW), Double(CH), hex("#05050c"), 0.55)
                text(fb, "GAUNTLET", cx, 62, 25, hex("#ffd23f"))
                text(fb, "TEN MAZES · WARPS · OVERHEAD", cx, 80, 5, hex("#8fa3d8"))
                if Int(clock * 2) % 2 == 0 { text(fb, controls.remoteDriving ? "CLICK TO START" : "PRESS A TO START", cx, 128, 10, 0xFFFF_FFFF) }
                text(fb, "Y · WATCH THE PROVEN ROUTE", cx, 148, 5, hex("#ffd23f"))
                text(fb, "HI " + String(hi), cx, 162, 5, hex("#ff5d5d"))
                text(fb, "A SWORD · B ARROW · TWO CONTROLLERS: TWO HEROES", cx, 186, 5, hex("#8fa3d8"))
            case .pause:
                fb.fill(0, 0, Double(CW), Double(CH), hex("#05050c"), 0.6)
                text(fb, "PAUSED", cx, 100, 15, hex("#ffd23f"))
                text(fb, "A RESUME · B QUIT TO TITLE", cx, 124, 5, 0xFFFF_FFFF)
            case .over:
                fb.fill(0, 0, Double(CW), Double(CH), hex("#05050c"), 0.7)
                text(fb, gs.end == "win" ? "THE GAUNTLET IS DONE!" : "GAME OVER", cx, 96, 15, hex(gs.end == "win" ? "#ffd23f" : "#ff5d5d"))
                text(fb, "SCORE \(gs.score)", cx, 118, 10, 0xFFFF_FFFF)
                text(fb, "HI \(hi)", cx, 134, 5, hex("#ffd23f"))
                if clock - overAt > 1 { text(fb, "PRESS A", cx, 156, 5, hex("#8fa3d8")) }
            case .play:
                if watching { text(fb, "WATCHING · ANY BUTTON TAKES THE REINS", Double(VWI) / 2, 14, 5, hex("#ffd23f"), alpha: Int(clock * 3) % 2 == 0 ? 1 : 0.6) }
            default: break
            }
        }
        if !checkLines.isEmpty {
            fb.fill(4, 4, Double(CW) - 8, Double(checkLines.count) * 8 + 6, hex("#05050c"), 0.9)
            for (i, l) in checkLines.enumerated() { text(fb, l, 8, 12 + Double(i) * 8, 5, hex(l.hasPrefix("MATCH") ? "#5dff8f" : "#ff8a5d"), align: "left") }
        }
        present()
    }

    private func paintSelect() {
        let fb = painter.fb
        fb.clear(hex("#05050c"))
        let cx = Double(CW) / 2
        text(fb, "CHOOSE YOUR HERO", cx, 30, 10, hex("#ffd23f"))
        for i in 0..<4 {
            let key = HERO_ORDER[i], hd = HEROES[key]!
            let x = 20 + Double(i) * 72, y = 50.0
            let sel1 = pick[0] == i, sel2 = seat2 == "human" && pick[1] == i
            fb.fill(x, y, 64, 112, hex(sel1 ? "#2a1f0b" : "#0b0e18"))
            let edge = hex(sel1 ? "#ffd23f" : sel2 ? "#54c8ff" : "#2b3348")
            fb.fill(x, y, 64, 1, edge); fb.fill(x, y + 111, 64, 1, edge); fb.fill(x, y, 1, 112, edge); fb.fill(x + 63, y, 1, 112, edge)
            Sprites.draw(fb, key, x + 32, y + 34, 36, tick: Int(clock * 60))
            text(fb, hd.name, x + 32, y + 70, 5, hex("#ffd23f"))
            text(fb, hd.label, x + 32, y + 82, 5, hex("#8fa3d8"))
            text(fb, "HP \(hd.hp)", x + 32, y + 96, 5, 0xFFFF_FFFF)
            if sel1 { text(fb, "1P", x + 10, y + 108, 5, hex("#ff5d5d")) }
            if sel2 { text(fb, "2P", x + 54, y + 108, 5, hex("#54c8ff")) }
        }
        let s2 = seat2 == "human" ? "PLAYER 2: \(HEROES[HERO_ORDER[pick[1]]]!.name) (B ON PAD 2 LEAVES)" : seat2 == "cpu" ? "CPU PARTNER ON (X TOGGLES)" : "SOLO · X SEATS A CPU PARTNER · PAD 2: PRESS A TO JOIN"
        text(fb, s2, cx, 182, 5, hex(seat2 == "off" ? "#8fa3d8" : "#54c8ff"))
        text(fb, "LEFT / RIGHT PICK · A START · B BACK", cx, 200, 5, 0xFFFF_FFFF)
        present()
    }

    private func present() {
        let fb = painter.fb
        let data = fb.pix.withUnsafeBufferPointer { Data(buffer: $0) }
        guard let prov = CGDataProvider(data: data as CFData),
              let img = CGImage(width: CW, height: CH, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: CW * 4,
                                space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                bitmapInfo: CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue),
                                provider: prov, decode: nil, shouldInterpolate: false, intent: .defaultIntent) else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        stage.layer.contents = img
        CATransaction.commit()
    }
}

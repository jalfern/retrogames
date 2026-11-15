// EMBERWOOD — the native shell over Sim.swift (a tick-exact port of the web
// sim). Mirrors src/games/Emberwood/index.jsx: attract (the web bot's own
// route, recorded by scripts/demo.mjs and replayed with its loan) → play,
// a fixed 60 Hz sim step, autosave/continue, the shop, the fx→sound map, the
// three music beds with the combat-heat tempo. The sim owns every rule; this
// file paints (Stage), plays sounds (Synth) and listens (Controls).

import UIKit
import SpriteKit
import GameController

#if os(tvOS)
typealias BaseViewController = GCEventViewController
#else
typealias BaseViewController = UIViewController
#endif

final class GameViewController: BaseViewController {
    private let skView = SKView()
    private var scene: GameScene!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        skView.ignoresSiblingOrder = true
        view.addSubview(skView)
        scene = GameScene(size: CGSize(width: 320, height: 180))
        scene.scaleMode = .aspectFit
        scene.host = self
        skView.presentScene(scene)
        #if os(tvOS)
        controllerUserInteractionEnabled = true // Menu leaves the app from the title screen
        #endif
        #if os(iOS)
        view.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tap)))
        #endif
        NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.scene.appResigned()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        #if os(iOS)
        skView.frame = view.bounds
        scene.layout(view.bounds.size, safe: view.safeAreaInsets)
        #else
        skView.frame = view.bounds
        #endif
    }

    func titleMenuExits(_ yes: Bool) {
        #if os(tvOS)
        controllerUserInteractionEnabled = yes
        #endif
    }

    #if os(iOS)
    override func viewDidAppear(_ animated: Bool) { super.viewDidAppear(animated); scene.controls.screenAppeared() }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        traitCollection.userInterfaceIdiom == .phone ? .landscape : .all
    }
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    @objc private func tap() { scene.tapped() }
    #endif
}

// MARK: - the scene

final class GameScene: SKScene {
    enum Mode { case attract, play, pause, win }
    weak var host: GameViewController?
    let controls = Controls()
    private let synth = Synth.shared
    private let stage = Stage()
    private let room = SKCropNode()
    private let hud = SKNode(), overlay = SKNode()
    /// the 320x180 game block (room + side HUD + overlays); on iOS the scene is
    /// shaped like the screen and this block sits clear of the on-screen pad
    private let canvas = SKNode()
    #if os(iOS)
    private let pauseButton = SKNode()
    #endif

    private var mode = Mode.attract
    private var sim = Sim(seed: 11)
    private var prev = PadPrev()
    private var demo: Demo? = {
        guard let u = Bundle.main.url(forResource: "emberwood-demo", withExtension: "json"), let d = try? Data(contentsOf: u) else { return nil }
        return try? Demo(data: d)
    }()
    private var demoT = 0
    private var last: TimeInterval = 0, acc = 0.0, clock = 0.0
    private var frameN = 0
    private var lastSaveScreen = "", lastSaveTick = 0
    private var hudSig = ""
    private var checkLines: [String] = []
    private var winAt = 0.0

    static let SAVE_KEY = "emberwood.save.v1"

    override func didMove(to view: SKView) {
        backgroundColor = rgb("#0d0b14")
        anchorPoint = .zero
        let mask = SKSpriteNode(color: .white, size: CGSize(width: ROOM_W, height: ROOM_H))
        mask.anchorPoint = .zero
        room.maskNode = mask
        room.position = CGPoint(x: 32, y: 2)
        room.addChild(stage)
        addChild(canvas)
        canvas.addChild(room)
        let frameRect = SKShapeNode(rect: CGRect(x: 31, y: 1, width: ROOM_W + 2, height: ROOM_H + 2))
        frameRect.strokeColor = rgb("#3a2a1c"); frameRect.lineWidth = 1; frameRect.zPosition = 5
        canvas.addChild(frameRect)
        let vig = SKSpriteNode(texture: Tex.soft("vignette", 128, [(0, 0), (0.7, 0), (1, 0.4)]), size: CGSize(width: ROOM_W * 1.4, height: ROOM_H * 1.5))
        vig.position = CGPoint(x: ROOM_W / 2, y: ROOM_H / 2); vig.zPosition = 4000
        room.addChild(vig) // inside the crop: the vignette darkens the room's edge, never the margins
        hud.zPosition = 10; overlay.zPosition = 20
        canvas.addChild(hud); canvas.addChild(overlay)
        #if os(iOS)
        let pb = SKShapeNode(circleOfRadius: 9)
        pb.fillColor = SKColor.black.withAlphaComponent(0.45); pb.strokeColor = rgb("#c9a24a"); pb.lineWidth = 0.8
        pauseButton.addChild(pb)
        for dx in [-2.5, 2.5] {
            let bar = SKShapeNode(rect: CGRect(x: dx - 1.2, y: -4, width: 2.4, height: 8))
            bar.fillColor = rgb("#e8d9b8"); bar.strokeColor = .clear
            pauseButton.addChild(bar)
        }
        pauseButton.zPosition = 30
        addChild(pauseButton)
        #endif
        launchOptions()
        enterAttract()
    }

    /// iOS: shape the scene like the screen. Phone (wide): the block is centred
    /// between two margins kept clear for the on-screen pad (D-pad left, A/B/X
    /// right). iPad (squarer): the block fills the width at the top and the pad
    /// lives in the band below. A pause button sits in the top-right corner,
    /// since the on-screen pad has no Menu button.
    func layout(_ pts: CGSize, safe: UIEdgeInsets) {
        guard pts.width > 0, pts.height > 0 else { return }
        let aspect = pts.width / pts.height
        var unit: CGFloat // points per scene unit
        var origin: CGPoint
        if aspect >= 16.0 / 9.0 {
            let reserve: CGFloat = max(190, max(safe.left, safe.right) + 140)
            unit = min((pts.width - 2 * reserve) / 320, (pts.height - safe.top - safe.bottom) / 180)
            let w = pts.width / unit, h = pts.height / unit
            origin = CGPoint(x: (w - 320) / 2, y: (h - 180) / 2 + (safe.bottom - safe.top) / unit / 2)
        } else {
            unit = min(pts.width / 320, (pts.height - safe.top - 240) / 180)
            let w = pts.width / unit, h = pts.height / unit
            origin = CGPoint(x: (w - 320) / 2, y: h - 180 - safe.top / unit - 4)
        }
        size = CGSize(width: pts.width / unit, height: pts.height / unit)
        scaleMode = .aspectFit
        canvas.position = origin
        #if os(iOS)
        pauseButton.position = CGPoint(x: size.width - max(safe.right, 12) / unit - 14, y: size.height - max(safe.top, 12) / unit - 14)
        #endif
    }

    #if os(iOS)
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches {
            let p = t.location(in: self)
            if mode == .play || mode == .pause, hypot(p.x - pauseButton.position.x, p.y - pauseButton.position.y) < 16 {
                setMode(mode == .play ? .pause : .play); return
            }
        }
    }
    #endif

    // MARK: test hooks
    // `-start 1` jumps into a new game, `-room <id>` starts one in that room
    // (act-two kit lent, for screenshots), `-continue YES` loads the save,
    // `-selfcheck YES` replays the bundled golden traces and the attract
    // run ON THIS DEVICE and prints MATCH/DIVERGE lines (log + screen).
    private func launchOptions() {
        let d = UserDefaults.standard
        if d.bool(forKey: "selfcheck") {
            checkLines = ["SELF-CHECK RUNNING..."]
            DispatchQueue.global(qos: .userInitiated).async {
                let lines = GameScene.selfCheck()
                for l in lines { NSLog("EMBERWOOD SELFCHECK %@", l); print("EMBERWOOD SELFCHECK \(l)") }
                fflush(stdout)
                DispatchQueue.main.async { self.checkLines = lines }
            }
        }
        DispatchQueue.main.async {
            if let r = d.string(forKey: "room"), World.screens[r] != nil { // dev: start a new game in that room
                self.startPlay(continueSave: false)
                self.sim.flags.emberTaken = true
                self.sim.items.bow = true; self.sim.items.arrows = 10; self.sim.items.gale = true; self.sim.items.bombs = 4
                self.sim.spawnRoom(r, nil)
            } else if d.integer(forKey: "start") == 1 { self.startPlay(continueSave: false) }
            else if d.bool(forKey: "continue") { self.startPlay(continueSave: true) }
        }
    }

    static func selfCheck() -> [String] {
        var out: [String] = []
        if let dir = Bundle.main.resourceURL?.appendingPathComponent("traces"),
           let names = try? FileManager.default.contentsOfDirectory(atPath: dir.path) {
            for n in names.filter({ !$0.hasSuffix(".trace.json") }).sorted() {
                do {
                    let rec = try Recording(data: Data(contentsOf: dir.appendingPathComponent(n)))
                    let (states, mm) = replay(rec)
                    let g = try Data(contentsOf: dir.appendingPathComponent(n.replacingOccurrences(of: ".json", with: ".trace.json")))
                    let (ticks, fields, d) = try compare(golden: g, port: states)
                    if let d { out.append("DIVERGE \(n) TICK \(d.tick) \(d.field) GOLDEN \(d.golden) PORT \(d.port)") }
                    else { out.append("MATCH \(n) \(ticks)/\(ticks) TICKS, \(fields) FIELDS" + (mm == nil ? "" : " HASH DIFF \(mm!)")) }
                } catch { out.append("ERROR \(n) \(error)") }
            }
        } else { out.append("NO BUNDLED TRACES") }
        if let u = Bundle.main.url(forResource: "emberwood-demo", withExtension: "json"), let d = try? Data(contentsOf: u), let demo = try? Demo(data: d) {
            if let t = demo.hashCheck() { out.append("DIVERGE emberwood-demo.json HASH AT TICK \(t)") }
            else { out.append("MATCH emberwood-demo.json \(demo.inputs.count)/\(demo.inputs.count) TICK HASHES") }
        } else { out.append("NO BUNDLED DEMO") }
        return out
    }

    // MARK: modes

    private func setMode(_ m: Mode) {
        mode = m
        host?.titleMenuExits(m == .attract)
        synth.suspended = (m == .pause)
    }

    private func enterAttract() {
        sim = Sim(seed: demo?.seed ?? 11)
        demoT = 0
        stage.build(sim)
        setMode(.attract)
        synth.musicLevel = 0.45
        synth.startMusic("emberwoodVale")
    }

    private var hasSave: Bool { UserDefaults.standard.data(forKey: GameScene.SAVE_KEY) != nil }

    private func startPlay(continueSave: Bool) {
        var s: Sim? = nil
        if continueSave, let d = UserDefaults.standard.data(forKey: GameScene.SAVE_KEY), let sd = try? JSONDecoder().decode(SaveData.self, from: d) {
            s = Sim.load(sd)
        }
        sim = s ?? Sim(seed: 11)
        prev = PadPrev()
        stage.build(sim)
        lastSaveScreen = sim.screen; lastSaveTick = sim.tick
        acc = 0
        synth.musicLevel = 1
        synth.stopMusic()
        setMode(.play)
    }

    private func autosave() {
        guard mode == .play, !sim.death, !sim.win else { return }
        let moved = sim.screen != lastSaveScreen
        let boss = sim.flags.boss1 || sim.flags.boss2
        if moved || boss || sim.tick - lastSaveTick > 900 {
            lastSaveScreen = sim.screen; lastSaveTick = sim.tick
            if let d = try? JSONEncoder().encode(sim.save()) { UserDefaults.standard.set(d, forKey: GameScene.SAVE_KEY) }
        }
    }

    func appResigned() { if mode == .play { setMode(.pause) } }

    func tapped() {
        switch mode {
        case .attract: startPlay(continueSave: false)
        case .pause: break // the pause button (touchesBegan) or A resumes
        case .win: if clock - winAt > 1.5 { enterAttract() }
        case .play: break
        }
    }

    // MARK: loop

    override func update(_ currentTime: TimeInterval) {
        if last == 0 { last = currentTime }
        var dt = currentTime - last
        last = currentTime
        if dt > 0.25 { dt = 0.25 }
        clock += dt
        frameN += 1
        controls.poll()
        let p = controls.pressed, held = controls.held

        switch mode {
        case .attract:
            if p.a || (p.any && !p.y && !p.menu && !p.b) { startPlay(continueSave: false); return }
            if (p.y || p.b) && hasSave { startPlay(continueSave: true); return }
        case .pause:
            if p.a || p.menu { setMode(.play) }
            else if p.b { synth.stopMusic(); enterAttract() }
            render(); return
        case .win:
            if (p.a || p.b) && clock - winAt > 1.5 { enterAttract() }
        case .play:
            if p.menu { setMode(.pause); render(); return }
        }

        acc += dt
        var steps = 0
        let FIXED = 1.0 / 60
        while acc >= FIXED && steps < 8 {
            acc -= FIXED; steps += 1
            if mode == .attract {
                if sim.win || sim.death || demo == nil || demoT >= demo!.inputs.count { sim = Sim(seed: demo?.seed ?? 11); demoT = 0 }
                if let d = demo {
                    Demo.lend(sim)
                    sim.step(d.inputs[demoT]); demoT += 1
                } else { sim.step(Input()) }
            } else if mode == .play {
                let wasWin = sim.win
                let pad = Pad(up: held.up, down: held.down, left: held.left, right: held.right, a: held.a, b: held.b, b2: held.x)
                sim.step(padToInput(pad, &prev))
                if sim.win && !wasWin {
                    winAt = clock
                    UserDefaults.standard.removeObject(forKey: GameScene.SAVE_KEY)
                    synth.fanfare()
                    setMode(.win)
                    break
                }
            }
        }
        autosave()

        let fx = sim.fx
        sim.fx.removeAll()
        if mode == .play || mode == .win { for e in fx { synth.fx(e.k, boss: e.boss) } }
        stage.onFx(fx)
        if mode == .play && sim.galing && sim.tick % 6 == 0 {
            let k = min(1, Double(sim.bHoldT - 12) / 24)
            synth.filteredNoise(0.1, 0.02 + k * 0.05, 420 + k * 900)
        }
        music()
        render()
        synth.pump()
    }

    private func music() {
        let s = World.screens[sim.screen]!
        if mode == .play {
            if sim.death { synth.stopMusic(); return }
            let bed = s.req == "emberTaken" ? "emberwoodAshfell" : s.dark ? "emberwoodDeep" : "emberwoodVale"
            synth.startMusic(bed)
            if frameN % 24 == 0, let b = Synth.BEDS[bed] {
                // battleHeat → musicStepFor (art.js): crowd + proximity lift the grid up to 12%
                let live = sim.enemies.filter { !$0.dead }
                var heat = 0.0
                if live.contains(where: { $0.boss != 0 }) { heat = 1 }
                else if !live.isEmpty {
                    let near = live.map { jsHypot($0.x - sim.hero.x, $0.y - sim.hero.y) }.min() ?? 999
                    heat = min(1, 0.35 * min(1, Double(live.count) / 4) + 0.75 * max(0, 1 - min(near, 96) / 96))
                }
                synth.setStep(b.step * (1 - 0.12 * heat))
            }
        }
    }

    // MARK: paint

    private func label(_ text: String, _ size: CGFloat, _ x: CGFloat, _ y: CGFloat, _ col: SKColor = .white, align: SKLabelHorizontalAlignmentMode = .center, width: CGFloat = 0) -> SKLabelNode {
        let l = SKLabelNode(fontNamed: "Menlo-Bold")
        l.text = text; l.fontSize = size; l.fontColor = col
        l.horizontalAlignmentMode = align; l.verticalAlignmentMode = .center
        l.position = CGPoint(x: x, y: y)
        if width > 0 { l.numberOfLines = 0; l.preferredMaxLayoutWidth = width; l.lineBreakMode = .byWordWrapping }
        return l
    }

    private func panel(_ r: CGRect, alpha: CGFloat = 0.82) -> SKShapeNode {
        let p = SKShapeNode(rect: r, cornerRadius: 2)
        p.fillColor = rgb("#140e18").withAlphaComponent(alpha); p.strokeColor = rgb("#c9a24a"); p.lineWidth = 0.6
        return p
    }

    private func icon(_ tex: String, _ w: CGFloat, _ h: CGFloat, _ x: CGFloat, _ y: CGFloat) -> SKSpriteNode {
        let s = SKSpriteNode(texture: Tex.get(tex), size: CGSize(width: w, height: h)); s.position = CGPoint(x: x, y: y); return s
    }

    private func render() {
        #if os(iOS)
        pauseButton.isHidden = !(mode == .play || mode == .pause)
        #endif
        stage.sync(sim, clock)
        drawHud()
        drawOverlay()
    }

    private func drawHud() {
        let it = sim.items, h = sim.hero
        let sig = "\(mode == .attract)|\(h.hp)|\(h.max)|\(sim.score)|\(it.keys)|\(it.bigkey)|\(it.bow)|\(it.arrows)|\(it.bombs)|\(it.potions)|\(it.gale)|\(it.step)|\(it.blade)|\(it.shield)"
        if sig == hudSig { return }
        hudSig = sig
        hud.removeAllChildren()
        if mode == .attract { return }
        // left column: hearts, embers, keys
        for i in 0..<h.max {
            let s = icon("heart", 6, 5.4, CGFloat(9 + (i % 3) * 7), CGFloat(170 - (i / 3) * 7))
            if i >= h.hp { s.color = rgb("#3a2230"); s.colorBlendFactor = 1 }
            hud.addChild(s)
        }
        let ey = CGFloat(170 - ((h.max + 2) / 3) * 7 - 6)
        hud.addChild(icon("ember_0", 5, 5, 7, ey))
        hud.addChild(label("\(sim.score)", 6, 11, ey, rgb("#ffd27a"), align: .left))
        hud.addChild(icon("key", 6, 6, 7, ey - 9))
        hud.addChild(label("\(it.keys)" + (it.bigkey ? "+B" : ""), 6, 11, ey - 9, rgb("#e8c24a"), align: .left))
        // right column: what you carry
        var y: CGFloat = 170
        func row(_ tex: String, _ w: CGFloat, _ hh: CGFloat, _ text: String, _ col: SKColor = .white) {
            hud.addChild(icon(tex, w, hh, 296, y))
            if !text.isEmpty { hud.addChild(label(text, 6, 302, y, col, align: .left)) }
            y -= 10
        }
        if it.blade { row("ember_1", 5, 5, "BLD", rgb("#ff9a3c")) }
        if it.bow { row("arrow", 9, 3, "\(it.arrows)") }
        row("bomb", 6, 7, "\(it.bombs)")
        row("orb", 5, 5, "\(it.potions)", rgb("#8ce0ff"))
        if it.shield { row("plate", 6, 6, "SHD") }
        if it.gale { row("runeGust", 6, 6, "GAL", rgb("#bff2ff")) }
        if it.step { row("cinderface", 6, 6, "STP", rgb("#ff7a3c")) }
    }

    private func drawOverlay() {
        overlay.removeAllChildren()
        let cx = 32 + ROOM_W / 2
        if !checkLines.isEmpty {
            let box = panel(CGRect(x: 40, y: 120, width: 240, height: CGFloat(checkLines.count) * 9 + 6))
            overlay.addChild(box)
            for (i, l) in checkLines.enumerated() {
                overlay.addChild(label(l, 4.5, 44, 120 + CGFloat(checkLines.count - i) * 9 - 2, l.hasPrefix("MATCH") ? rgb("#8cc45f") : rgb("#ff7a3c"), align: .left))
            }
        }
        switch mode {
        case .attract:
            let glow = 0.75 + 0.25 * sin(clock * 2)
            overlay.addChild(panel(CGRect(x: cx - 92, y: 64, width: 184, height: 62), alpha: 0.7))
            overlay.addChild(label("EMBERWOOD", 18, cx, 108, rgb("#ffb238").withAlphaComponent(glow)))
            overlay.addChild(label("ASH OF THE VALE", 6, cx, 95, rgb("#e8d9b8")))
            let blink = Int(clock * 2) % 2 == 0
            overlay.addChild(label(blink ? "PRESS A TO BEGIN" : "", 7, cx, 82, .white))
            if hasSave { overlay.addChild(label("B / Y: CONTINUE", 5.5, cx, 71, rgb("#8ce0ff"))) }
            overlay.addChild(label("A SWORD (HOLD: BOW)  B BOMB (HOLD: GALE)  X POTION", 4.5, 160, 8, rgb("#cfc8dc")))
            return
        case .pause:
            overlay.addChild(panel(CGRect(x: cx - 70, y: 66, width: 140, height: 48)))
            overlay.addChild(label("PAUSED", 11, cx, 101, rgb("#ffb238")))
            overlay.addChild(label("A RESUME   B QUIT TO TITLE", 5.5, cx, 84, .white))
            overlay.addChild(label("THE VALE REMEMBERS (AUTOSAVE)", 4.5, cx, 74, rgb("#cfc8dc")))
        case .win:
            overlay.addChild(panel(CGRect(x: cx - 100, y: 60, width: 200, height: 60)))
            overlay.addChild(label(sim.flags.dawnheart ? "DAWN OVER EMBERWOOD" : "THE EMBER HEART", 11, cx, 104, rgb("#ffd27a")))
            overlay.addChild(label(sim.flags.dawnheart ? "THE VALE IS FREE AT LAST" : "THE WOOD IS SAFE", 6, cx, 90, .white))
            overlay.addChild(label("EMBERS \(sim.score)", 6, cx, 79, rgb("#ffb238")))
            if clock - winAt > 1.5 { overlay.addChild(label("PRESS A", 6, cx, 68, rgb("#8ce0ff"))) }
        case .play: break
        }
        if mode == .attract { return }
        // room name banner
        if sim.nameT > 0 && !sim.death {
            let a = CGFloat(min(1, Double(sim.nameT) / 30))
            let n = label(sim.roomName, 8, cx, 2 + ROOM_H - 16, rgb("#ffe9c9").withAlphaComponent(a))
            let bg = SKShapeNode(rect: CGRect(x: cx - 70, y: 2 + ROOM_H - 23, width: 140, height: 14), cornerRadius: 2)
            bg.fillColor = SKColor.black.withAlphaComponent(0.45 * a); bg.strokeColor = .clear
            overlay.addChild(bg); overlay.addChild(n)
        }
        // shop
        if sim.shop.open {
            let menu = sim.menu
            let hgt = CGFloat(menu.count) * 11 + 30
            overlay.addChild(panel(CGRect(x: cx - 80, y: 90 - hgt / 2, width: 160, height: hgt)))
            overlay.addChild(label(sim.shop.id == "colporter" ? "THE COLPORTER" : "THE KEEPER'S STALL", 6.5, cx, 90 + hgt / 2 - 9, rgb("#ffb238")))
            for (i, o) in menu.enumerated() {
                let y = 90 + hgt / 2 - 22 - CGFloat(i) * 11
                let sel = i == sim.shop.sel
                overlay.addChild(label((sel ? "> " : "  ") + o.label, 6, cx - 72, y, sel ? .white : rgb("#cfc8dc"), align: .left))
                overlay.addChild(label("\(o.price)", 6, cx + 72, y, sim.score >= o.price ? rgb("#ffd27a") : rgb("#8a5050"), align: .right))
            }
            overlay.addChild(label("A BUY   B LEAVE   EMBERS \(sim.score)", 4.5, cx, 90 - hgt / 2 + 5, rgb("#8ce0ff")))
        }
        // message box
        if let m = sim.msg, sim.msgT > 0 {
            let a = CGFloat(min(1, Double(sim.msgT) / 20))
            let bg = panel(CGRect(x: 40, y: 6, width: 240, height: 30), alpha: 0.85 * a)
            overlay.addChild(bg)
            overlay.addChild(label(m, 6, cx, 21, rgb("#fff3cf").withAlphaComponent(a), width: 228))
        }
        if sim.death {
            overlay.addChild(panel(CGRect(x: cx - 70, y: 74, width: 140, height: 34)))
            overlay.addChild(label("YOU FELL", 11, cx, 96, rgb("#ff5c5c")))
            if sim.deathT > 90 { overlay.addChild(label(Int(clock * 2) % 2 == 0 ? "PRESS A TO RISE" : "", 6, cx, 82, .white)) }
        }
    }
}

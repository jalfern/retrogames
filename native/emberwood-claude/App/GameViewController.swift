// EMBERWOOD — the native shell over Sim.swift (a tick-exact port of the web
// sim). Mirrors src/games/Emberwood/index.jsx: attract (the bot's proven
// route, a new seed each lap) → play (Y = WATCH),
// a fixed 60 Hz sim step, autosave/continue, the shop, the fx→sound map, the
// three music beds with the combat-heat tempo. The sim owns every rule; this
// file drives the diorama (Diorama: render.js on MiniThree, under the HUD),
// plays sounds (Synth) and listens (Controls). The attract and WATCH both run
// Bot.swift, a tick-exact port of bot.js.

import UIKit
import SpriteKit
import GameController
import RetroKit
import RetroKitApp

#if os(tvOS)
typealias BaseViewController = GCEventViewController
#else
typealias BaseViewController = UIViewController
#endif

final class GameViewController: BaseViewController {
    private let skView = SKView()
    private var scene: GameScene!
    private var diorama: Diorama!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        // the 3D diorama underneath, the SpriteKit HUD on top (transparent)
        diorama = Diorama(frame: view.bounds)
        view.addSubview(diorama.view)
        skView.ignoresSiblingOrder = true
        skView.allowsTransparency = true
        skView.backgroundColor = .clear
        view.addSubview(skView)
        scene = GameScene(size: CGSize(width: 320, height: 180))
        scene.scaleMode = .aspectFit
        scene.backgroundColor = .clear
        scene.diorama = diorama
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
        diorama.view.frame = view.bounds
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
    let controls = Controls.emberwood()
    private let synth = Synth.shared
    var diorama: Diorama!
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
    private var bot = Bot()
    private var watching = false
    private var watchSnap: (items: Items, score: Int, hp: Int, max: Int)? = nil
    private var potionQueued = false
    // -perf YES: frame timing to the console every 2 s
    private let perf = UserDefaults.standard.bool(forKey: "perf")
    private var perfT = 0.0, perfFrames = 0, perfSteps = 0, perfWorst = 0.0, perfCost = 0.0
    private var last: TimeInterval = 0, acc = 0.0, clock = 0.0
    private var frameN = 0
    private var lastSaveScreen = "", lastSaveTick = 0
    private var hudSig = ""
    private var checkLines: [String] = []
    private var winAt = 0.0

    static let SAVE_KEY = "emberwood.save.v1"

    override func didMove(to view: SKView) {
        backgroundColor = .clear
        anchorPoint = .zero
        addChild(canvas)
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
        SelfCheck.startIfAsked(tag: "EMBERWOOD", check: GameScene.selfCheck) { self.checkLines = $0 }
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
        var out = SelfCheck.goldens { _, data in
            let (states, mm) = replay(try Recording(data: data))
            return SelfCheck.Run(states: states, hashMismatch: mm)
        }
        if let u = Bundle.main.url(forResource: "emberwood-demo", withExtension: "json"), let d = try? Data(contentsOf: u), let demo = try? Demo(data: d) {
            if let t = demo.hashCheck() { out.append("DIVERGE emberwood-demo.json HASH AT TICK \(t)") }
            else { out.append("MATCH emberwood-demo.json \(demo.inputs.count)/\(demo.inputs.count) TICK HASHES") }
            if let d = demo.botRace() { out.append("DIVERGE WATCH BOT \(d)") }
            else { out.append("MATCH WATCH BOT \(demo.inputs.count)/\(demo.inputs.count) TICKS SAID WHAT BOT.JS SAID") }
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
        stopWatch(sound: false)
        sim = Sim(seed: 11)
        bot = Bot()
        diorama.build(sim)
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
        bot = Bot()
        watching = false; watchSnap = nil
        prev = PadPrev()
        diorama.build(sim)
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
        case .play: if watching { stopWatch() }
        }
    }

    // MARK: WATCH (#1624): the proven route plays your game; the kit is a loan

    private func startWatch() {
        if sim.death || sim.win || watching { return }
        watchSnap = (sim.items, sim.score, sim.hero.hp, sim.hero.max)
        watching = true
        synth.tone(660, 0.07, .square, 0.06); synth.tone(990, 0.1, .square, 0.06, 0.07)
    }

    private func stopWatch(sound: Bool = true) {
        guard watching else { return }
        watching = false
        if sound { synth.tone(880, 0.07, .square, 0.06); synth.tone(440, 0.12, .square, 0.06, 0.07) }
        if let w = watchSnap, !sim.win, !sim.death {
            let e = sim.items.e
            sim.items = w.items; sim.items.e = e
            sim.score = w.score; sim.hero.max = w.max; sim.hero.hp = min(w.hp, w.max)
        }
        watchSnap = nil
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
        let p = controls.pressed[0], held = controls.held[0]

        switch mode {
        case .attract:
            if p.y { startPlay(continueSave: hasSave); startWatch(); return }
            if p.a || (p.any && !p.y && !p.menu && !p.b) { startPlay(continueSave: false); return }
            if p.b && hasSave { startPlay(continueSave: true); return }
        case .pause:
            // gamepad: A / Options resume, X drinks, B quits. Siri Remote: click
            // resumes, Play/Pause drinks (B-hold is the Gale Charm in play, so
            // the potion lives here), Menu quits to the title.
            let remote = controls.remoteDriving
            if p.x || (remote && p.b) { potionQueued = true; setMode(.play) }
            else if p.a || (p.menu && !remote) { setMode(.play) }
            else if p.b || (p.menu && remote) { synth.stopMusic(); enterAttract() }
            render(); return
        case .win:
            if (p.a || p.b) && clock - winAt > 1.5 { enterAttract() }
        case .play:
            if p.menu { setMode(.pause); render(); return }
            if p.y { if watching { stopWatch() } else { startWatch() } }
            else if watching && (p.a || p.b || p.x || p.up || p.down || p.left || p.right) { stopWatch() }
        }
        let t0 = CACurrentMediaTime()

        acc += dt
        var steps = 0
        let FIXED = 1.0 / 60
        while acc >= FIXED && steps < 8 {
            acc -= FIXED; steps += 1
            if mode == .attract {
                // index.jsx resetAttract: a fresh vale, seed + 7, every time the route ends
                if sim.win || sim.death { sim = Sim(seed: sim.seed &+ 7); bot = Bot() }
                sim.step(bot.tick(sim))
            } else if mode == .play {
                let wasWin = sim.win
                let pad = Pad(up: held.up, down: held.down, left: held.left, right: held.right, a: held.a, b: held.b, b2: held.x || potionQueued)
                potionQueued = false
                let mine = padToInput(pad, &prev) // edges stay fresh while the bot drives
                if watching {
                    if sim.win || sim.death { stopWatch(); sim.step(mine) }
                    else { sim.step(bot.tick(sim)) }
                } else { sim.step(mine) }
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
        if perf {
            perfFrames += 1; perfSteps += steps; perfWorst = max(perfWorst, dt)
            perfCost += CACurrentMediaTime() - t0
            if clock - perfT > 2 {
                let ds = diorama.view.drawableSize
                let line = String(format: "EMBERWOOD PERF %.1f fps, %.2f steps/frame, worst frame %.1f ms, sim %.2f ms/frame, 3D cpu %.2f ms gpu %.2f ms at %dx%d (buffer %dx%d), screen %@, hud nodes %d",
                                  Double(perfFrames) / (clock - perfT), Double(perfSteps) / Double(max(1, perfFrames)), perfWorst * 1000,
                                  perfCost / Double(max(1, perfFrames)) * 1000, diorama.cpuMs, diorama.gpuMs, Int(ds.width), Int(ds.height),
                                  diorama.stage.bufW, diorama.stage.bufH, sim.screen, countNodes(self))
                print(line); fflush(stdout)
                perfT = clock; perfFrames = 0; perfSteps = 0; perfWorst = 0; perfCost = 0
            }
        }

        let fx = sim.fx
        sim.fx.removeAll()
        if mode == .play || mode == .win { for e in fx { synth.fx(e.k, boss: e.boss) } }
        diorama.onFx(fx)
        if mode == .play && sim.galing && sim.tick % 6 == 0 {
            let k = min(1, Double(sim.bHoldT - 12) / 24)
            synth.filteredNoise(0.1, 0.02 + k * 0.05, 420 + k * 900)
        }
        music()
        render()
        synth.pump()
    }

    private func countNodes(_ n: SKNode) -> Int { 1 + n.children.reduce(0) { $0 + countNodes($1) } }

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
        diorama.frame(sim, clock)
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
        // the columns sit over the diorama now (as the web's HTML HUD sits over
        // its canvas): a dusk backing keeps them legible over a lit vale
        func backing(_ r: CGRect) {
            let p = SKShapeNode(rect: r, cornerRadius: 3)
            p.fillColor = rgb("#140e18").withAlphaComponent(0.55); p.strokeColor = .clear; p.zPosition = -1
            hud.addChild(p)
        }
        let rows = 2 + [it.blade, it.bow, it.shield, it.gale, it.step].filter { $0 }.count
        backing(CGRect(x: 2, y: CGFloat(170 - ((h.max + 2) / 3) * 7 - 21), width: 29, height: CGFloat(((h.max + 2) / 3) * 7 + 27)))
        backing(CGRect(x: 291, y: CGFloat(170 - rows * 10 + 4), width: 28, height: CGFloat(rows * 10 + 2)))
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
            if hasSave { overlay.addChild(label("B: CONTINUE", 5.5, cx, 71, rgb("#8ce0ff"))) }
            overlay.addChild(label("Y / \u{25B3} — WATCH THE PROVEN ROUTE", 4.5, cx, 18, rgb("#ffd27a")))
            overlay.addChild(label("A SWORD (HOLD: BOW)  B BOMB (HOLD: GALE)  X POTION", 4.5, 160, 8, rgb("#cfc8dc")))
            return
        case .pause:
            overlay.addChild(panel(CGRect(x: cx - 70, y: 66, width: 140, height: 48)))
            overlay.addChild(label("PAUSED", 11, cx, 101, rgb("#ffb238")))
            overlay.addChild(label(controls.remoteDriving ? "CLICK RESUME   \u{23EF} DRINK   MENU QUIT" : "A RESUME   X DRINK   B QUIT TO TITLE", 5.5, cx, 84, .white))
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
        if watching {
            let w = label("WATCHING — ANY BUTTON TAKES THE REINS", 5, cx, 2 + ROOM_H - 6, rgb("#ffd27a").withAlphaComponent(0.75 + 0.25 * sin(clock * 3)))
            overlay.addChild(w)
        }
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

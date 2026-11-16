// MiniThree scene graph: Object3D and its kin, named and behaving as in
// three.js r180 so a game's render.js ports line for line.

import Foundation

nonisolated(unsafe) private var nextObjectId = 1
nonisolated(unsafe) var nextMaterialId = 1

open class Object3D {
    public let id: Int
    public var name = ""
    public var position = Vector3()
    public var scale = Vector3(1, 1, 1)
    public var up = Vector3(0, 1, 0)
    /// rotation and quaternion stay in step, as three's onChange callbacks keep them
    public var rotation = Euler() { didSet { if !syncing { syncing = true; quaternion = Quaternion.fromEuler(rotation); syncing = false } } }
    public var quaternion = Quaternion() { didSet { if !syncing { syncing = true; rotation = Euler.fromQuaternion(quaternion); syncing = false } } }
    private var syncing = false
    public var matrix = Matrix4()
    public var matrixWorld = Matrix4()
    public var matrixAutoUpdate = true
    public var visible = true
    public var castShadow = false
    public var receiveShadow = false
    public var renderOrder = 0
    public var frustumCulled = true
    public weak var parent: Object3D?
    public private(set) var children: [Object3D] = []
    public var userData: [String: Any] = [:]

    public init() { id = nextObjectId; nextObjectId += 1 }

    public func add(_ objs: Object3D...) {
        for o in objs {
            o.parent?.remove(o)
            o.parent = self
            children.append(o)
        }
    }
    public func remove(_ o: Object3D) {
        if let i = children.firstIndex(where: { $0 === o }) { children.remove(at: i); o.parent = nil }
    }
    public func clear() { for c in children { c.parent = nil }; children.removeAll() }

    /// rotateOnAxis(z, angle): quaternion.multiply(q)
    public func rotateZ(_ a: Double) { quaternion = quaternion.multiplied(.axisAngle(Vector3(0, 0, 1), a)) }
    public func rotateX(_ a: Double) { quaternion = quaternion.multiplied(.axisAngle(Vector3(1, 0, 0), a)) }
    public func rotateY(_ a: Double) { quaternion = quaternion.multiplied(.axisAngle(Vector3(0, 1, 0), a)) }

    var looksAlongNegativeZ: Bool { false }

    /// three's Object3D.lookAt (world-space target; parent rotation honoured)
    public func lookAt(_ x: Double, _ y: Double, _ z: Double) {
        let target = Vector3(x, y, z)
        updateWorldMatrix(updateParents: true, updateChildren: false)
        let pos = Vector3.fromMatrixPosition(matrixWorld)
        let m = looksAlongNegativeZ ? Matrix4.lookAt(pos, target, up) : Matrix4.lookAt(target, pos, up)
        var q = Quaternion.fromRotationMatrix(m)
        if let p = parent {
            let pq = Quaternion.fromRotationMatrix(p.matrixWorld.decomposedRotation)
            q = Quaternion(-pq.x, -pq.y, -pq.z, pq.w).multiplied(q) // premultiply(inverse)
        }
        quaternion = q
    }

    public func updateMatrix() { matrix = Matrix4.compose(position, quaternion, scale) }

    public func updateMatrixWorld(force: Bool = false) {
        if matrixAutoUpdate { updateMatrix() }
        if let p = parent { matrixWorld = p.matrixWorld * matrix } else { matrixWorld = matrix }
        for c in children { c.updateMatrixWorld(force: force) }
        didUpdateWorld()
    }
    public func updateWorldMatrix(updateParents: Bool, updateChildren: Bool) {
        if updateParents, let p = parent { p.updateWorldMatrix(updateParents: true, updateChildren: false) }
        if matrixAutoUpdate { updateMatrix() }
        if let p = parent { matrixWorld = p.matrixWorld * matrix } else { matrixWorld = matrix }
        if updateChildren { for c in children { c.updateWorldMatrix(updateParents: false, updateChildren: true) } }
        didUpdateWorld()
    }
    func didUpdateWorld() {}

    public func traverse(_ f: (Object3D) -> Void) {
        f(self)
        for c in children { c.traverse(f) }
    }
    public func traverseVisible(_ f: (Object3D) -> Void) {
        guard visible else { return }
        f(self)
        for c in children { c.traverseVisible(f) }
    }

    /// clone(recursive): geometry/material are shared, as in three
    open func cloneSelf() -> Object3D { let o = Object3D(); copyBase(to: o); return o }
    public func clone(_ recursive: Bool = true) -> Object3D {
        let o = cloneSelf()
        if recursive { for c in children { o.add(c.clone(true)) } }
        return o
    }
    func copyBase(to o: Object3D) {
        o.name = name; o.position = position; o.quaternion = quaternion; o.scale = scale; o.up = up
        o.matrix = matrix; o.matrixWorld = matrixWorld; o.matrixAutoUpdate = matrixAutoUpdate
        o.visible = visible; o.castShadow = castShadow; o.receiveShadow = receiveShadow
        o.renderOrder = renderOrder; o.frustumCulled = frustumCulled; o.userData = userData
    }
}

extension Matrix4 {
    /// the rotation part of a matrix with scale removed (for lookAt under a parent)
    var decomposedRotation: Matrix4 {
        let (_, q, _) = decompose()
        return Matrix4.rotation(q)
    }
}

public final class Group: Object3D {
    public override func cloneSelf() -> Object3D { let o = Group(); copyBase(to: o); return o }
}

public final class Fog {
    public var color: Color, near: Double, far: Double
    public init(_ color: Color, _ near: Double = 1, _ far: Double = 1000) { self.color = color; self.near = near; self.far = far }
}
public final class FogExp2 {
    public var color: Color, density: Double
    public init(_ color: Color, _ density: Double = 0.00025) { self.color = color; self.density = density }
}

public final class Scene: Object3D {
    public var background: Color? = nil
    public var fog: Fog? = nil
    public var fogExp2: FogExp2? = nil
}

// MARK: cameras

open class Camera: Object3D {
    public var matrixWorldInverse = Matrix4()
    /// three's projectionMatrix (WebGL clip z in [-1, 1]) — used by project()
    public internal(set) var projectionMatrixGL = Matrix4()
    /// the same frustum with Metal's clip z in [0, 1] (three's WebGPU convention)
    public internal(set) var projectionMatrix = Matrix4()
    override var looksAlongNegativeZ: Bool { true }
    override func didUpdateWorld() { matrixWorldInverse = matrixWorld.inverted() }
    public func updateProjectionMatrix() {}
}

public final class OrthographicCamera: Camera {
    public var left: Double, right: Double, top: Double, bottom: Double, near: Double, far: Double
    public var zoom = 1.0
    public init(_ left: Double = -1, _ right: Double = 1, _ top: Double = 1, _ bottom: Double = -1, _ near: Double = 0.1, _ far: Double = 2000) {
        self.left = left; self.right = right; self.top = top; self.bottom = bottom; self.near = near; self.far = far
        super.init()
        updateProjectionMatrix()
    }
    public override func updateProjectionMatrix() {
        let dx = (right - left) / (2 * zoom), dy = (top - bottom) / (2 * zoom)
        let cx = (right + left) / 2, cy = (top + bottom) / 2
        let l = cx - dx, r = cx + dx, t = cy + dy, b = cy - dy
        projectionMatrixGL = Matrix4.orthographic(l, r, t, b, near, far, webgpu: false)
        projectionMatrix = Matrix4.orthographic(l, r, t, b, near, far, webgpu: true)
    }
    public override func cloneSelf() -> Object3D {
        let o = OrthographicCamera(left, right, top, bottom, near, far); o.zoom = zoom; copyBase(to: o); o.updateProjectionMatrix(); return o
    }
}

public final class PerspectiveCamera: Camera {
    public var fov: Double, aspect: Double, near: Double, far: Double
    public var zoom = 1.0
    public init(_ fov: Double = 50, _ aspect: Double = 1, _ near: Double = 0.1, _ far: Double = 2000) {
        self.fov = fov; self.aspect = aspect; self.near = near; self.far = far
        super.init()
        updateProjectionMatrix()
    }
    public override func updateProjectionMatrix() {
        let top = near * tan(Double.pi / 180 * 0.5 * fov) / zoom
        let height = 2 * top, width = aspect * height
        let left = -0.5 * width
        projectionMatrixGL = Matrix4.perspective(left, left + width, top, top - height, near, far, webgpu: false)
        projectionMatrix = Matrix4.perspective(left, left + width, top, top - height, near, far, webgpu: true)
    }
}

// MARK: lights

open class Light: Object3D {
    public var color: Color
    public var intensity: Double
    public init(_ color: Color, _ intensity: Double) { self.color = color; self.intensity = intensity; super.init() }
}
public final class AmbientLight: Light {
    public init(_ color: Int = 0xffffff, _ intensity: Double = 1) { super.init(Color(color), intensity) }
}
public final class HemisphereLight: Light {
    public var groundColor: Color
    public init(_ sky: Int = 0xffffff, _ ground: Int = 0xffffff, _ intensity: Double = 1) {
        groundColor = Color(ground)
        super.init(Color(sky), intensity)
        position = Vector3(0, 1, 0) // Object3D.DEFAULT_UP
        updateMatrix()
    }
}
public final class DirectionalLightShadow {
    public let camera = OrthographicCamera(-5, 5, 5, -5, 0.5, 500)
    public var mapSize = Vector2(512, 512)
    public var bias = 0.0, normalBias = 0.0, radius = 1.0, intensity = 1.0
    public internal(set) var matrix = Matrix4()
}
public final class DirectionalLight: Light {
    public let target = Object3D()
    public let shadow = DirectionalLightShadow()
    public init(_ color: Int = 0xffffff, _ intensity: Double = 1) {
        super.init(Color(color), intensity)
        position = Vector3(0, 1, 0)
        updateMatrix()
    }
}
public final class PointLight: Light {
    public var distance: Double, decay: Double
    public init(_ color: Int = 0xffffff, _ intensity: Double = 1, _ distance: Double = 0, _ decay: Double = 2) {
        self.distance = distance; self.decay = decay
        super.init(Color(color), intensity)
    }
}

// MARK: drawables

open class Mesh: Object3D {
    public var geometry: BufferGeometry
    public var material: Material
    public init(_ geometry: BufferGeometry, _ material: Material) { self.geometry = geometry; self.material = material; super.init() }
    public override func cloneSelf() -> Object3D { let o = Mesh(geometry, material); copyBase(to: o); return o }
}

/// InstancedMesh: one draw, `count` instance matrices (and optional colors)
public final class InstancedMesh: Mesh {
    public var count: Int
    public var instanceMatrix: [Matrix4]
    public var instanceColor: [Color]? = nil
    public init(_ geometry: BufferGeometry, _ material: Material, _ count: Int) {
        self.count = count
        instanceMatrix = Array(repeating: Matrix4(), count: count)
        super.init(geometry, material)
    }
    public func setMatrixAt(_ i: Int, _ m: Matrix4) { instanceMatrix[i] = m }
    public func setColorAt(_ i: Int, _ c: Color) {
        if instanceColor == nil { instanceColor = Array(repeating: Color(), count: count) }
        instanceColor![i] = c
    }
}

/// Sprite: a 1x1 quad that always faces the camera (three's sprite shader)
public final class Sprite: Object3D {
    public var material: SpriteMaterial
    public var center = Vector2(0.5, 0.5)
    public init(_ material: SpriteMaterial = SpriteMaterial()) { self.material = material; super.init() }
}

public final class Points: Object3D {
    public var geometry: BufferGeometry, material: PointsMaterial
    public init(_ geometry: BufferGeometry, _ material: PointsMaterial) { self.geometry = geometry; self.material = material; super.init() }
}

/// Line (strip) and LineSegments (pairs); 1-pixel lines, as WebGL draws them
public class Line: Object3D {
    public var geometry: BufferGeometry, material: LineBasicMaterial
    var segments: Bool { false }
    public init(_ geometry: BufferGeometry, _ material: LineBasicMaterial) { self.geometry = geometry; self.material = material; super.init() }
}
public final class LineSegments: Line { override var segments: Bool { true } }

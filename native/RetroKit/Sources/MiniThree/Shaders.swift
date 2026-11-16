// MiniThree's shader library: three.js r180's shader chunks hand-ported to
// MSL. Each function names the chunk it comes from; keep the math in step
// with three (node_modules/three/src/renderers/shaders/ShaderChunk) so the
// native frame stays comparable with the web frame pixel for pixel.

let MSL_COMMON = #"""
#include <metal_stdlib>
using namespace metal;

#define PI 3.141592653589793
#define RECIPROCAL_PI 0.3183098861837907
#define EPSILON 1e-6
#define MAX_DIR 4
#define MAX_POINT 8
#define MAX_HEMI 2

struct DirLight { float4 direction; float4 color; };          // view space
struct PointLightU { float4 position; float4 color; float4 distDecay; };
struct HemiLight { float4 direction; float4 sky; float4 ground; };

struct FrameU {
    float4x4 projection;          // Metal clip (z in [0,1])
    float4x4 view;
    float4x4 shadowMatrix;        // world → shadow uv/depth
    DirLight dir[MAX_DIR];
    PointLightU point[MAX_POINT];
    HemiLight hemi[MAX_HEMI];
    float4 ambient;
    float4 fogColor;              // rgb + mode (0 none, 1 linear, 2 exp2)
    float4 fogParams;             // near, far, density
    float4 shadowParams;          // bias, radius, intensity, mapSize
    int4 counts;                  // dir, point, hemi, dirShadow (index of the shadowed dir light or -1)
    int4 output;                  // toneMapping (0 none, 1 ACES), outputSRGB, isOrtho, -
    float4 exposure;              // toneMappingExposure
    float4 viewport;              // w, h (for points)
};

struct ObjU {
    float4x4 model;
    float4x4 modelView;
    float4 normalM0, normalM1, normalM2; // normalMatrix columns
    float4 diffuse;               // color.rgb, opacity
    float4 emissive;
    float4 uv0, uv1;              // map uv transform rows
    float4 pbr;                   // roughness, metalness, alphaTest, pointSize
    int4 flags;                   // model (0 basic, 1 lambert, 2 standard), hasMap, vertexColors (0/3/4), transparent
    int4 flags2;                  // receiveShadow, doubleSided, fog, toneMapped
    int4 flags3;                  // mapFlipV, sizeAttenuation, -, -
    float4 sprite;                // center.x, center.y, rotation, -
};

struct VOut {
    float4 pos [[position]];
    float3 vNormal;
    float3 vViewPosition;
    float2 vUv;
    float4 vColor;
    float4 vShadowCoord;
    float vFogDepth;
    float pointSize [[point_size]];
};

// common.glsl.js
inline float pow2(float x) { return x * x; }
inline float pow4(float x) { float x2 = x * x; return x2 * x2; }
inline float3 BRDF_Lambert(float3 diffuseColor) { return RECIPROCAL_PI * diffuseColor; }
inline float3 F_Schlick(float3 f0, float f90, float dotVH) {
    float fresnel = exp2((-5.55473 * dotVH - 6.98316) * dotVH);
    return f0 * (1.0 - fresnel) + (f90 * fresnel);
}
// lights_pars_begin.glsl.js
inline float getDistanceAttenuation(float lightDistance, float cutoffDistance, float decayExponent) {
    float distanceFalloff = 1.0 / max(pow(lightDistance, decayExponent), 0.01);
    if (cutoffDistance > 0.0) distanceFalloff *= pow2(saturate(1.0 - pow4(lightDistance / cutoffDistance)));
    return distanceFalloff;
}
inline float3 getHemisphereLightIrradiance(HemiLight h, float3 normal) {
    float dotNL = dot(normal, h.direction.xyz);
    float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
    return mix(h.ground.rgb, h.sky.rgb, hemiDiffuseWeight);
}
// lights_physical_pars_fragment.glsl.js
inline float V_GGX_SmithCorrelated(float alpha, float dotNL, float dotNV) {
    float a2 = pow2(alpha);
    float gv = dotNL * sqrt(a2 + (1.0 - a2) * pow2(dotNV));
    float gl = dotNV * sqrt(a2 + (1.0 - a2) * pow2(dotNL));
    return 0.5 / max(gv + gl, EPSILON);
}
inline float D_GGX(float alpha, float dotNH) {
    float a2 = pow2(alpha);
    float denom = pow2(dotNH) * (a2 - 1.0) + 1.0;
    return RECIPROCAL_PI * a2 / pow2(denom);
}
inline float3 BRDF_GGX(float3 lightDir, float3 viewDir, float3 normal, float3 f0, float f90, float roughness) {
    float alpha = pow2(roughness);
    float3 halfDir = normalize(lightDir + viewDir);
    float dotNL = saturate(dot(normal, lightDir));
    float dotNV = saturate(dot(normal, viewDir));
    float dotNH = saturate(dot(normal, halfDir));
    float dotVH = saturate(dot(viewDir, halfDir));
    float3 F = F_Schlick(f0, f90, dotVH);
    float V = V_GGX_SmithCorrelated(alpha, dotNL, dotNV);
    float D = D_GGX(alpha, dotNH);
    return F * (V * D);
}
// shadowmap_pars_fragment.glsl.js (PCFShadowMap: 17 taps)
inline float texture2DCompare(depth2d<float> depths, sampler s, float2 uv, float compare) {
    float depth = depths.sample(s, uv);
    return step(compare, depth);
}
inline float getShadow(depth2d<float> shadowMap, sampler s, float2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, float4 shadowCoord) {
    float shadow = 1.0;
    shadowCoord.xyz /= shadowCoord.w;
    shadowCoord.z += shadowBias;
    bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
    bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
    if (frustumTest) {
        // three's shadow uv has v up (GL); the Metal depth texture's row 0 is the top
        float2 uv = float2(shadowCoord.x, 1.0 - shadowCoord.y);
        float2 texelSize = float2(1.0) / shadowMapSize;
        float dx0 = -texelSize.x * shadowRadius, dy0 = -texelSize.y * shadowRadius;
        float dx1 = texelSize.x * shadowRadius, dy1 = texelSize.y * shadowRadius;
        float dx2 = dx0 / 2.0, dy2 = dy0 / 2.0, dx3 = dx1 / 2.0, dy3 = dy1 / 2.0;
        // GL dy offsets point up; flip them for the Metal row order
        dy0 = -dy0; dy1 = -dy1; dy2 = -dy2; dy3 = -dy3;
        float z = shadowCoord.z;
        shadow = (
            texture2DCompare(shadowMap, s, uv + float2(dx0, dy0), z) +
            texture2DCompare(shadowMap, s, uv + float2(0.0, dy0), z) +
            texture2DCompare(shadowMap, s, uv + float2(dx1, dy0), z) +
            texture2DCompare(shadowMap, s, uv + float2(dx2, dy2), z) +
            texture2DCompare(shadowMap, s, uv + float2(0.0, dy2), z) +
            texture2DCompare(shadowMap, s, uv + float2(dx3, dy2), z) +
            texture2DCompare(shadowMap, s, uv + float2(dx0, 0.0), z) +
            texture2DCompare(shadowMap, s, uv + float2(dx2, 0.0), z) +
            texture2DCompare(shadowMap, s, uv, z) +
            texture2DCompare(shadowMap, s, uv + float2(dx3, 0.0), z) +
            texture2DCompare(shadowMap, s, uv + float2(dx1, 0.0), z) +
            texture2DCompare(shadowMap, s, uv + float2(dx2, dy3), z) +
            texture2DCompare(shadowMap, s, uv + float2(0.0, dy3), z) +
            texture2DCompare(shadowMap, s, uv + float2(dx3, dy3), z) +
            texture2DCompare(shadowMap, s, uv + float2(dx0, dy1), z) +
            texture2DCompare(shadowMap, s, uv + float2(0.0, dy1), z) +
            texture2DCompare(shadowMap, s, uv + float2(dx1, dy1), z)
        ) * (1.0 / 17.0);
    }
    return mix(1.0, shadow, shadowIntensity);
}
// tonemapping_pars_fragment.glsl.js
inline float3 RRTAndODTFit(float3 v) {
    float3 a = v * (v + 0.0245786) - 0.000090537;
    float3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
}
inline float3 ACESFilmicToneMapping(float3 color, float exposure) {
    const float3x3 ACESInputMat = float3x3(float3(0.59719, 0.07600, 0.02840), float3(0.35458, 0.90834, 0.13383), float3(0.04823, 0.01566, 0.83777));
    const float3x3 ACESOutputMat = float3x3(float3(1.60475, -0.10208, -0.00327), float3(-0.53108, 1.10813, -0.07276), float3(-0.07367, -0.00605, 1.07602));
    color *= exposure / 0.6;
    color = ACESInputMat * color;
    color = RRTAndODTFit(color);
    color = ACESOutputMat * color;
    return saturate(color);
}
// colorspace_pars_fragment.glsl.js: sRGBTransferOETF
inline float3 sRGBTransferOETF(float3 v) {
    return mix(pow(v, float3(0.41666)) * 1.055 - float3(0.055), v * 12.92, float3(v <= float3(0.0031308)));
}
"""#

let MSL_MAIN = #"""
// ---- vertex: meshes (begin/project/defaultnormal/shadowmap_vertex) ----
vertex VOut meshVertex(uint vid [[vertex_id]], uint iid [[instance_id]],
                       const device float* verts [[buffer(0)]],
                       constant FrameU& F [[buffer(1)]],
                       constant ObjU& O [[buffer(2)]],
                       const device float4x4* inst [[buffer(3)]],
                       const device float4* instColor [[buffer(4)]],
                       constant int& instanced [[buffer(5)]]) {
    const device float* v = verts + vid * 12;
    float4 p = float4(v[0], v[1], v[2], 1.0);
    float3 n = float3(v[3], v[4], v[5]);
    VOut o;
    float4x4 model = O.model, modelView = O.modelView;
    float3x3 nm = float3x3(O.normalM0.xyz, O.normalM1.xyz, O.normalM2.xyz);
    if (instanced != 0) {
        float4x4 im = inst[iid];
        p = im * p;
        // defaultnormal_vertex: n /= (|col|^2); n = mat3(instanceMatrix) * n
        float3 sc = float3(dot(im[0].xyz, im[0].xyz), dot(im[1].xyz, im[1].xyz), dot(im[2].xyz, im[2].xyz));
        n = float3x3(im[0].xyz, im[1].xyz, im[2].xyz) * (float3(v[3], v[4], v[5]) / sc);
    }
    float4 mv = modelView * p;
    o.pos = F.projection * mv;
    o.vNormal = normalize(nm * n);
    o.vViewPosition = -mv.xyz;
    float3 uvT = float3(v[6], v[7], 1.0);
    o.vUv = float2(dot(O.uv0.xyz, uvT), dot(O.uv1.xyz, uvT));
    o.vColor = float4(v[8], v[9], v[10], v[11]);
    if (instanced != 0 && O.flags.z == 3) o.vColor.rgb *= instColor[iid].rgb;
    float4 worldPosition = model * p;
    o.vShadowCoord = F.shadowMatrix * worldPosition;
    o.vFogDepth = -mv.z;
    o.pointSize = 1.0;
    return o;
}

// sprite.glsl.js vertex
vertex VOut spriteVertex(uint vid [[vertex_id]], constant FrameU& F [[buffer(1)]], constant ObjU& O [[buffer(2)]]) {
    float2 quad[4] = { float2(-0.5, -0.5), float2(0.5, -0.5), float2(0.5, 0.5), float2(-0.5, 0.5) };
    float2 quv[4] = { float2(0, 0), float2(1, 0), float2(1, 1), float2(0, 1) };
    uint ix[6] = { 0, 1, 2, 0, 2, 3 };
    uint k = ix[vid];
    float4 mvPosition = O.modelView * float4(0, 0, 0, 1);
    float2 scale = float2(length(O.model[0].xyz), length(O.model[1].xyz));
    if (O.flags3.y == 0 && F.output.z == 0) scale *= -mvPosition.z;
    float2 alignedPosition = (quad[k] - (O.sprite.xy - float2(0.5))) * scale;
    float rot = O.sprite.z;
    float2 rotatedPosition = float2(cos(rot) * alignedPosition.x - sin(rot) * alignedPosition.y, sin(rot) * alignedPosition.x + cos(rot) * alignedPosition.y);
    mvPosition.xy += rotatedPosition;
    VOut o;
    o.pos = F.projection * mvPosition;
    o.vNormal = float3(0, 0, 1);
    o.vViewPosition = -mvPosition.xyz;
    float3 uvT = float3(quv[k], 1.0);
    o.vUv = float2(dot(O.uv0.xyz, uvT), dot(O.uv1.xyz, uvT));
    o.vColor = float4(1);
    o.vShadowCoord = float4(0);
    o.vFogDepth = -mvPosition.z;
    o.pointSize = 1.0;
    return o;
}

// points.glsl.js vertex
vertex VOut pointsVertex(uint vid [[vertex_id]], const device float* verts [[buffer(0)]], constant FrameU& F [[buffer(1)]], constant ObjU& O [[buffer(2)]]) {
    const device float* v = verts + vid * 12;
    float4 mv = O.modelView * float4(v[0], v[1], v[2], 1.0);
    VOut o;
    o.pos = F.projection * mv;
    float size = O.pbr.w;
    if (O.flags3.y != 0 && F.output.z == 0) size *= (F.viewport.y * 0.5) / -mv.z; // scale = height / 2
    o.pointSize = size;
    o.vNormal = float3(0, 0, 1);
    o.vViewPosition = -mv.xyz;
    o.vUv = float2(0);
    o.vColor = float4(v[8], v[9], v[10], v[11]);
    o.vShadowCoord = float4(0);
    o.vFogDepth = -mv.z;
    return o;
}

struct FragIn {
    float4 pos [[position]];
    float3 vNormal;
    float3 vViewPosition;
    float2 vUv;
    float4 vColor;
    float4 vShadowCoord;
    float vFogDepth;
};

// ---- fragment: meshbasic / meshlambert / meshphysical(STANDARD) ----
static float4 shade(FragIn in, bool front, float2 pointCoord, bool isPoint,
                    constant FrameU& F, constant ObjU& O,
                    texture2d<float> map, sampler mapS, depth2d<float> shadowMap, sampler shadowS) {
    float4 diffuseColor = float4(O.diffuse.rgb, O.diffuse.a);
    // map_fragment
    if (O.flags.y != 0) {
        float2 uv = isPoint ? float2(dot(O.uv0.xyz, float3(pointCoord.x, 1.0 - pointCoord.y, 1.0)), dot(O.uv1.xyz, float3(pointCoord.x, 1.0 - pointCoord.y, 1.0))) : in.vUv;
        if (O.flags3.x != 0) uv.y = 1.0 - uv.y;
        diffuseColor *= map.sample(mapS, uv);
    }
    // color_fragment
    if (O.flags.z == 4) diffuseColor *= in.vColor;
    else if (O.flags.z == 3) diffuseColor.rgb *= in.vColor.rgb;
    // alphatest_fragment
    if (diffuseColor.a < O.pbr.z) discard_fragment();
    float3 outgoingLight;
    int model = O.flags.x;
    if (model == 0) {
        outgoingLight = diffuseColor.rgb;
    } else {
        // normal_fragment_begin
        float faceDirection = front ? 1.0 : -1.0;
        float3 normal = normalize(in.vNormal);
        if (O.flags2.y != 0) normal *= faceDirection;
        float3 nonPerturbedNormal = normal;
        float3 geometryPosition = -in.vViewPosition;
        float3 geometryViewDir = F.output.z != 0 ? float3(0, 0, 1) : normalize(in.vViewPosition);
        float3 directDiffuse = float3(0), directSpecular = float3(0), indirectDiffuse = float3(0);
        float3 matDiffuse = diffuseColor.rgb;
        float roughness = 1.0, f90 = 1.0;
        float3 specularColor = float3(0.04);
        if (model == 2) {
            // lights_physical_fragment (MeshStandardMaterial: no IOR)
            float metalnessFactor = O.pbr.y;
            matDiffuse = diffuseColor.rgb * (1.0 - metalnessFactor);
            float3 dxy = max(abs(dfdx(nonPerturbedNormal)), abs(dfdy(nonPerturbedNormal)));
            float geometryRoughness = max(max(dxy.x, dxy.y), dxy.z);
            roughness = max(O.pbr.x, 0.0525);
            roughness += geometryRoughness;
            roughness = min(roughness, 1.0);
            specularColor = mix(float3(0.04), diffuseColor.rgb, metalnessFactor);
        }
        // lights_fragment_begin: point, directional, then indirect
        for (int i = 0; i < F.counts.y; i++) {
            float3 lVector = F.point[i].position.xyz - geometryPosition;
            float3 dir = normalize(lVector);
            float lightDistance = length(lVector);
            float3 color = F.point[i].color.rgb * getDistanceAttenuation(lightDistance, F.point[i].distDecay.x, F.point[i].distDecay.y);
            float dotNL = saturate(dot(normal, dir));
            float3 irradiance = dotNL * color;
            if (model == 2) directSpecular += irradiance * BRDF_GGX(dir, geometryViewDir, normal, specularColor, f90, roughness);
            directDiffuse += irradiance * BRDF_Lambert(matDiffuse);
        }
        for (int i = 0; i < F.counts.x; i++) {
            float3 color = F.dir[i].color.rgb;
            float3 dir = F.dir[i].direction.xyz;
            if (i == F.counts.w && O.flags2.x != 0) {
                color *= getShadow(shadowMap, shadowS, float2(F.shadowParams.w), F.shadowParams.z, F.shadowParams.x, F.shadowParams.y, in.vShadowCoord);
            }
            float dotNL = saturate(dot(normal, dir));
            float3 irradiance = dotNL * color;
            if (model == 2) directSpecular += irradiance * BRDF_GGX(dir, geometryViewDir, normal, specularColor, f90, roughness);
            directDiffuse += irradiance * BRDF_Lambert(matDiffuse);
        }
        float3 irradiance = F.ambient.rgb;
        for (int i = 0; i < F.counts.z; i++) irradiance += getHemisphereLightIrradiance(F.hemi[i], normal);
        // RE_IndirectDiffuse (Lambert and Physical alike); with no envmap the
        // physical RE_IndirectSpecular adds nothing (iblIrradiance = radiance = 0)
        indirectDiffuse += irradiance * BRDF_Lambert(matDiffuse);
        outgoingLight = directDiffuse + indirectDiffuse + directSpecular + O.emissive.rgb;
    }
    // opaque_fragment
    float4 frag = float4(outgoingLight, O.flags.w != 0 ? diffuseColor.a : 1.0);
    // tonemapping_fragment
    if (F.output.x == 1 && O.flags2.w != 0) frag.rgb = ACESFilmicToneMapping(frag.rgb, F.exposure.x);
    // colorspace_fragment
    if (F.output.y != 0) frag.rgb = sRGBTransferOETF(frag.rgb);
    // fog_fragment
    if (O.flags2.z != 0) {
        float fogFactor = 0.0;
        if (F.fogColor.w == 1.0) fogFactor = smoothstep(F.fogParams.x, F.fogParams.y, in.vFogDepth);
        else if (F.fogColor.w == 2.0) fogFactor = 1.0 - exp(-F.fogParams.z * F.fogParams.z * in.vFogDepth * in.vFogDepth);
        frag.rgb = mix(frag.rgb, F.fogColor.rgb, fogFactor);
    }
    return frag;
}

fragment float4 meshFragment(FragIn in [[stage_in]], bool front [[front_facing]],
                             constant FrameU& F [[buffer(1)]], constant ObjU& O [[buffer(2)]],
                             texture2d<float> map [[texture(0)]], sampler mapS [[sampler(0)]],
                             depth2d<float> shadowMap [[texture(1)]], sampler shadowS [[sampler(1)]]) {
    return shade(in, front, float2(0), false, F, O, map, mapS, shadowMap, shadowS);
}
fragment float4 pointsFragment(FragIn in [[stage_in]], float2 pc [[point_coord]],
                               constant FrameU& F [[buffer(1)]], constant ObjU& O [[buffer(2)]],
                               texture2d<float> map [[texture(0)]], sampler mapS [[sampler(0)]],
                               depth2d<float> shadowMap [[texture(1)]], sampler shadowS [[sampler(1)]]) {
    return shade(in, true, pc, true, F, O, map, mapS, shadowMap, shadowS);
}

// ---- shadow depth pass (MeshDepthMaterial) ----
struct DOut { float4 pos [[position]]; float2 vUv; };
vertex DOut depthVertex(uint vid [[vertex_id]], uint iid [[instance_id]],
                        const device float* verts [[buffer(0)]],
                        constant float4x4& lightVP [[buffer(1)]],
                        constant ObjU& O [[buffer(2)]],
                        const device float4x4* inst [[buffer(3)]],
                        constant int& instanced [[buffer(5)]]) {
    const device float* v = verts + vid * 12;
    float4 p = float4(v[0], v[1], v[2], 1.0);
    if (instanced != 0) p = inst[iid] * p;
    DOut o;
    o.pos = lightVP * (O.model * p);
    float3 uvT = float3(v[6], v[7], 1.0);
    o.vUv = float2(dot(O.uv0.xyz, uvT), dot(O.uv1.xyz, uvT));
    return o;
}
fragment void depthFragment(DOut in [[stage_in]], constant ObjU& O [[buffer(2)]],
                            texture2d<float> map [[texture(0)]], sampler mapS [[sampler(0)]]) {
    if (O.flags.y != 0 && O.pbr.z > 0.0) {
        float2 uv = in.vUv;
        if (O.flags3.x != 0) uv.y = 1.0 - uv.y;
        float a = O.diffuse.a * map.sample(mapS, uv).a;
        if (a < O.pbr.z) discard_fragment();
    }
}

// ---- ShaderMaterial vertex: gl_Position = vec4(position.xy, 0., 1.) ----
struct PostOut { float4 pos [[position]]; float2 vUv; };
vertex PostOut postVertex(uint vid [[vertex_id]], const device float* verts [[buffer(0)]]) {
    const device float* v = verts + vid * 12;
    PostOut o;
    o.pos = float4(v[0], v[1], 0.0, 1.0);
    o.vUv = float2(v[6], v[7]);
    return o;
}
"""#

/// the prelude every ShaderMaterial fragment is compiled after
let MSL_POST_PRELUDE = #"""
#include <metal_stdlib>
using namespace metal;
struct PostOut { float4 pos [[position]]; float2 vUv; };
// texture2D(t, vUv) for a render target / flipped image: GL's v runs up
#define texture2D(t, uv) t##_.sample(t##_s, float2((uv).x, 1.0 - (uv).y))
#define vec2 float2
#define vec3 float3
#define vec4 float4

"""#

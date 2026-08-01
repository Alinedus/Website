import { useMemo, useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { resolveStates } from './timeline'

/**
 * The one point pool, for the entire film.
 *
 * ~5,000 vertices, one Points object, one draw call, created once and never
 * recreated. Every state of the film — the scattered field, the architecture,
 * the logotype, the blueprint, the building, the city, the network, the
 * intelligence, the final mark — is a different set of TARGETS for these same
 * points. Nothing on screen is ever born or killed; it only becomes something
 * else. That is what makes the film continuous by construction instead of by
 * careful cross-fading.
 *
 * Only two states are resident on the GPU at a time (`aFrom`, `aTo`); the CPU
 * swaps them at a state boundary, which is rare, and the shader interpolates
 * between them every frame. So per-frame cost is independent of how many
 * states the film has.
 *
 * MOTION MODES. "No repeated animations" is a hard requirement, so the pool
 * carries several distinct motion characters selected by a uniform. Uniform
 * branching is free on the GPU (every invocation takes the same path), and it
 * keeps all of them in one shader and one draw call.
 */

export const MOTION = {
  DRIFT: 0, // brownian breathing — unresolved thought
  DRAFT: 1, // ruled, snapping, quantised — a drawing being set out
  SETTLE: 2, // gravity: rises and lands with mass
  PARALLAX: 3, // dead still; the camera does all the work
  PULSE: 4, // signal travels; nodes flare in sequence
  FLOW: 5, // curl flow around a core
  STILL: 6, // absolutely still
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uMorph;       // 0..1 between the two resident states
  uniform int   uMotion;      // MOTION.*
  uniform float uMotionAmp;
  uniform float uReveal;      // global gate; movement 1 uses it with aOrder
  uniform float uRevealLead;
  uniform vec3  uRedPos;
  uniform float uRedRadius;
  uniform float uProjScale;   // drawingBufferHeight / (2 tan(fov/2))
  uniform float uSizeScale;
  uniform float uMaxPx;
  uniform float uFogNear;   // as a RATIO of the focus distance, not metres
  uniform float uFogFar;
  uniform float uFocusDist; // camera → look-target distance this frame

  attribute vec4  aFromA;     // xyz target + w size
  attribute vec4  aToA;
  attribute float aFromRed;   // 0 ink .. 1 accent
  attribute float aToRed;
  attribute float aSeed;
  attribute float aOrder;     // 0..1 reveal order

  varying float vAlpha;
  varying float vTint;
  varying float vFog;
  varying float vSeed;

  // Cheap 3D value-ish noise. Not for looks — for de-correlating per-point
  // motion so a field never pulses as one body.
  float hash11(float p) { return fract(sin(p * 127.1) * 43758.5453); }

  void main() {
    vec3 pos  = mix(aFromA.xyz, aToA.xyz, uMorph);
    float siz = mix(aFromA.w,   aToA.w,   uMorph);
    float red = mix(aFromRed,   aToRed,   uMorph);
    vSeed = aSeed;

    // Motion is applied ON TOP of the morph, so a point is always travelling
    // between two truths while behaving in the manner of the current movement.
    float amp = uMotionAmp;
    if (uMotion == 0) {
      // DRIFT — unresolved. Dies away as a state resolves.
      float settle = 1.0 - abs(uMorph * 2.0 - 1.0);
      pos += vec3(
        sin(uTime * 0.41 + aSeed * 17.0),
        cos(uTime * 0.33 + aSeed * 11.0),
        sin(uTime * 0.27 + aSeed *  7.0)
      ) * amp * (0.35 + settle);
    } else if (uMotion == 1) {
      // DRAFT — a drawing being set out: no wander, only tiny ruled
      // corrections that quantise onto a lattice and stop.
      float q = 0.25;
      vec3 snapped = floor(pos / q + 0.5) * q;
      float bite = 0.5 + 0.5 * sin(uTime * 2.2 + aSeed * 31.0);
      pos = mix(pos, snapped, 0.65 * amp * bite);
    } else if (uMotion == 2) {
      // SETTLE — mass. A damped vertical overshoot keyed to height, so tall
      // things arrive later and harder than short ones.
      float h = clamp(pos.y * 0.05, 0.0, 1.0);
      float k = exp(-3.0 * fract(uTime * 0.12 + aSeed)) * sin(18.0 * fract(uTime * 0.12 + aSeed));
      pos.y += k * amp * h;
    } else if (uMotion == 4) {
      // PULSE — a signal sweeps the field; each point flares as it passes.
      float wave = fract(uTime * 0.18 - aOrder);
      float flare = exp(-14.0 * wave);
      pos += normalize(pos + vec3(0.001)) * flare * amp;
      siz *= 1.0 + flare * 1.9;
      red = max(red, flare * 0.85);
    } else if (uMotion == 5) {
      // FLOW — curl-ish orbit around the origin. Continuous, never repeating,
      // no start or end: the look of something thinking rather than animating.
      float r = length(pos.xz) + 0.001;
      float a = atan(pos.z, pos.x) + uTime * (0.06 + hash11(aSeed) * 0.05);
      float bob = sin(uTime * 0.7 + aSeed * 19.0) * amp;
      pos = vec3(cos(a) * r, pos.y + bob, sin(a) * r);
    }
    // PARALLAX (3) and STILL (6) add nothing by design.

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // ── Reveal ────────────────────────────────────────────────────────────
    // A multiplier, never an offset: an offset leaves points whose order
    // approaches 1.0 permanently below full opacity.
    float appear = clamp((uReveal * uRevealLead - aOrder) * 7.0, 0.0, 1.0);

    // A point drifting past the lens must not become a black hole.
    float nearFade = smoothstep(1.5, 11.0, -mv.z);
    vAlpha = appear * nearFade * step(0.0001, siz);

    // The intelligence dot lights what it is near. Tight and squared, or it
    // reads as a rash of specks scattered through depth rather than a glow.
    float infl = 1.0 - smoothstep(0.0, uRedRadius, distance(pos, uRedPos));
    infl *= infl;
    vTint = clamp(max(red, infl * 0.92), 0.0, 1.0);

    float size = siz * uSizeScale * (1.0 + infl * 1.15);
    gl_PointSize = clamp(size * uProjScale / max(-mv.z, 0.001), 1.0, uMaxPx);

    // Fog is RELATIVE to whatever the camera is looking at, never absolute.
    // Across the film the camera's working distance moves from ~26 units (the
    // corridor) to ~570 (the long-lens drafting table) to ~900 (the city), so
    // any fixed near/far in metres either does nothing or erases the subject
    // entirely — the plan renders as a ghost, which is exactly what it did.
    // Expressed as a ratio of the focus distance it is framing-independent,
    // and it is correct on every aspect ratio for free.
    float dr = (-mv.z) / max(uFocusDist, 0.001);
    vFog = smoothstep(uFogNear, uFogFar, dr);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3  uInk;
  uniform vec3  uRed;
  uniform vec3  uHaze;    // what depth fades TO — the current ground colour
  uniform float uSoft;    // 0 = hard drafting bead, 1 = soft luminous node

  varying float vAlpha;
  varying float vTint;
  varying float vFog;
  varying float vSeed;

  void main() {
    vec2  uv = gl_PointCoord - 0.5;
    float d  = length(uv);

    // Two shapes in one: a hard-edged bead (the identity's construction) and a
    // soft node (a thing that emits rather than is drawn). Movements choose.
    float aa   = fwidth(d);
    float hard = 1.0 - smoothstep(0.5 - aa, 0.5, d);
    float soft = pow(clamp(1.0 - d * 2.0, 0.0, 1.0), 2.2);
    float mask = mix(hard, soft, uSoft);
    if (mask < 0.004) discard;

    vec3 col = mix(uInk, uRed, vTint);
    col = mix(col, uHaze, vFog * 0.92);

    gl_FragColor = vec4(col, mask * vAlpha * (1.0 - vFog * 0.55));
  }
`

export default function PointPool({ states, count, order, look, progress, redPos }) {
  const geoRef = useRef()
  const matRef = useRef()
  const pair = useRef({ from: -1, to: -1 })
  const { camera, gl } = useThree()

  const attrs = useMemo(() => {
    const seed = new Float32Array(count)
    let s = 20259
    for (let i = 0; i < count; i++) {
      s = (s * 16807) % 2147483647
      seed[i] = s / 2147483647
    }
    return {
      seed,
      fromA: new Float32Array(count * 4),
      toA: new Float32Array(count * 4),
      fromRed: new Float32Array(count),
      toRed: new Float32Array(count),
    }
  }, [count])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uMotion: { value: MOTION.DRIFT },
      uMotionAmp: { value: 1 },
      uReveal: { value: 0 },
      uRevealLead: { value: 1.15 },
      uRedPos: { value: new THREE.Vector3() },
      uRedRadius: { value: 6 },
      uProjScale: { value: 1000 },
      uSizeScale: { value: 1 },
      uMaxPx: { value: 40 },
      uFogNear: { value: 1.6 },
      uFogFar: { value: 6.0 },
      uFocusDist: { value: 30 },
      uSoft: { value: 0 },
      uInk: { value: new THREE.Color('#0d0d0d') },
      uRed: { value: new THREE.Color('#f5341b') },
      uHaze: { value: new THREE.Color('#faf6ee') },
    }),
    []
  )

  // gl_PointSize is in device pixels, so the world→pixel factor must come from
  // the drawing buffer, not from CSS pixels — and it must be recomputed EVERY
  // FRAME, not in an effect. The director animates the focal length
  // continuously (35° in the corridor down to 3.4° on the drafting table), and
  // React never sees those writes, so an effect keyed on camera.fov latches the
  // value it had at mount. At the long-lens end that is a tenfold error and the
  // entire blueprint renders as sub-pixel dust.

  // Three never releases GPU memory on its own.
  useEffect(
    () => () => {
      geoRef.current?.dispose()
      matRef.current?.dispose()
    },
    []
  )

  useFrame((state) => {
    const fovRad = (camera.fov * Math.PI) / 180
    uniforms.uProjScale.value = gl.domElement.height / (2 * Math.tan(fovRad / 2))

    const P = progress.current
    const { from, to, morph } = resolveStates(P)

    // Swap the resident pair only when it actually changes — a boundary
    // crossing, not a frame.
    if (from !== pair.current.from || to !== pair.current.to) {
      const g = geoRef.current
      if (g) {
        g.attributes.aFromA.array.set(states[from].pos)
        g.attributes.aToA.array.set(states[to].pos)
        g.attributes.aFromRed.array.set(states[from].red)
        g.attributes.aToRed.array.set(states[to].red)
        g.attributes.aFromA.needsUpdate = true
        g.attributes.aToA.needsUpdate = true
        g.attributes.aFromRed.needsUpdate = true
        g.attributes.aToRed.needsUpdate = true
      }
      pair.current = { from, to }
    }

    const u = uniforms
    u.uTime.value = state.clock.elapsedTime
    u.uMorph.value = morph
    u.uRedPos.value.copy(redPos.current)

    // Every look parameter is published by the movement director, so the pool
    // itself holds no art direction — it only knows how to be a point.
    const L = look.current
    u.uMotion.value = L.motion
    u.uMotionAmp.value = L.motionAmp
    u.uReveal.value = L.reveal
    u.uSizeScale.value = L.sizeScale
    u.uMaxPx.value = L.maxPx
    u.uSoft.value = L.soft
    u.uRedRadius.value = L.redRadius
    u.uFogNear.value = L.fogNear
    u.uFogFar.value = L.fogFar
    u.uFocusDist.value = L.focusDist || 30
    u.uInk.value.copy(L.ink)
    u.uHaze.value.copy(L.haze)
  })

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[attrs.fromA, 4]} />
        <bufferAttribute attach="attributes-aFromA" args={[attrs.fromA, 4]} />
        <bufferAttribute attach="attributes-aToA" args={[attrs.toA, 4]} />
        <bufferAttribute attach="attributes-aFromRed" args={[attrs.fromRed, 1]} />
        <bufferAttribute attach="attributes-aToRed" args={[attrs.toRed, 1]} />
        <bufferAttribute attach="attributes-aSeed" args={[attrs.seed, 1]} />
        <bufferAttribute attach="attributes-aOrder" args={[order, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
      />
    </points>
  )
}

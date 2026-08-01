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

/** How many bead-widths long a fully-drawn stroke is. */
const STROKE_LEN = 3.0

/**
 * INK IS CONSERVED. A mark dragged into a stroke spreads the same pigment over
 * a longer path, so it gets thinner and lighter — which is both what graphite
 * actually does and the thing that stops a fast morph from flooding the frame.
 * Five thousand full-weight strokes at full length is a scribble; five thousand
 * conserved ones is a drawing.
 */
const STROKE_THIN = 0.55
const STROKE_FADE = 0.42

const vertexShader = /* glsl */ `
  #define STROKE_LEN ${STROKE_LEN.toFixed(1)}
  #define STROKE_FADE ${STROKE_FADE.toFixed(2)}
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
  uniform vec3  uCursor;    // the hand, on the focal plane
  uniform float uCursorRadius;
  uniform float uCursorPush; // presence × press

  attribute vec4  aFromA;     // xyz target + w size
  attribute vec4  aToA;
  attribute float aFromRed;   // 0 ink .. 1 accent
  attribute float aToRed;
  attribute float aSeed;
  attribute float aOrder;     // 0..1 reveal order

  uniform float uMorphRate;   // |d(morph)/dt| — how hard the film is drawing
  uniform float uStroke;      // per-movement willingness to elongate
  uniform vec2  uViewport;

  varying float vAlpha;
  varying float vTint;
  varying float vFog;
  varying float vSeed;
  varying vec2  vDir;      // screen-space stroke direction, unit
  varying float vStretch;  // 0 = bead, 1 = fully drawn stroke

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

    // ── The hand ──────────────────────────────────────────────────────────
    // Matter near the pointer lifts toward the viewer and gains weight. Not a
    // hover state — there is no such thing on the tablet this product runs on
    // — but a physical response to proximity that a finger produces exactly as
    // a mouse does. Squared falloff so the influence resolves into a legible
    // pool of attention instead of a wide, vague wash.
    float touch = 1.0 - smoothstep(0.0, uCursorRadius, distance(pos, uCursor));
    touch = touch * touch * uCursorPush;
    pos += normalize(cameraPosition - pos + vec3(1e-4)) * touch * uCursorRadius * 0.16;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // ── THE MARK ELONGATES ALONG ITS OWN TRAVEL ───────────────────────────
    //
    // This is a film about architectural DRAWING whose every mark was a
    // perfect circle. Circles are not how anyone has ever drawn anything: a
    // drawn mark has a direction, because a hand moved. So a point at rest is
    // a BEAD — the identity's own unit, the thing the logotype is built from —
    // and a point in motion is a STROKE, elongated along the path it is
    // travelling, tapering back to a bead when it arrives.
    //
    // The rate comes from the MORPH, which comes from the scroll, which comes
    // from the visitor. So the film is not drawn for them, it is drawn BY
    // them: stop scrolling and five thousand strokes settle into beads; move
    // and the whole frame is graphite again. Nothing here fades — matter
    // travels, and travelling is what leaves a line.
    vec3 travel = aToA.xyz - aFromA.xyz;
    float speed = length(travel) * uMorphRate;
    vStretch = uStroke * (1.0 - exp(-speed * 0.085));

    // Direction in SCREEN space, so the stroke lies along the path the eye
    // actually sees it take — not along a world axis that may project to a
    // point. Taken from a short probe rather than a derivative, which keeps it
    // correct under any projection including the film's 3.4-degree long lens.
    vec2 dir = vec2(1.0, 0.0);
    if (vStretch > 0.001) {
      vec4 ahead = projectionMatrix * (modelViewMatrix * vec4(pos + travel * 0.02, 1.0));
      vec2 a = gl_Position.xy / max(gl_Position.w, 1e-4) * uViewport;
      vec2 b = ahead.xy / max(ahead.w, 1e-4) * uViewport;
      vec2 d = b - a;
      float len = length(d);
      // A mark whose travel projects to nothing has no direction to draw in,
      // and normalising it would spin the sprite on noise.
      if (len > 0.5) dir = d / len; else vStretch = 0.0;
    }
    vDir = dir;

    // ── Reveal ────────────────────────────────────────────────────────────
    // A multiplier, never an offset: an offset leaves points whose order
    // approaches 1.0 permanently below full opacity.
    float appear = clamp((uReveal * uRevealLead - aOrder) * 7.0, 0.0, 1.0);

    // Depth, as a RATIO of what the camera is looking at. Everything below
    // this line is framing-independent because of it.
    float dr = (-mv.z) / max(uFocusDist, 0.001);

    // A point drifting past the lens must not become a black hole — but this
    // shell has to be relative for the same reason the fog does. Held in
    // METRES it was correct in the corridor and catastrophic in the macro
    // push-in: that shot ends 3.2 units from its subject, so a fade killing
    // everything inside 11 units erased the ENTIRE subject at exactly the
    // moment the camera arrived to look at it. The intelligence state builds
    // nested laminae, filaments and a core, and none of it was ever on screen
    // — the climax was a red sphere over the alpha-faded ghost of its own
    // content. At the corridor's working distance these ratios reproduce the
    // old shell to within a unit, so what was right stays right.
    float nearFade = smoothstep(0.055, 0.42, dr);
    // Ink conservation — see STROKE_FADE.
    float spread = 1.0 / (1.0 + vStretch * STROKE_FADE);
    vAlpha = appear * nearFade * step(0.0001, siz) * (1.0 + touch * 0.4) * spread;

    // The intelligence dot lights what it is near. Tight and squared, or it
    // reads as a rash of specks scattered through depth rather than a glow.
    float infl = 1.0 - smoothstep(0.0, uRedRadius, distance(pos, uRedPos));
    infl *= infl;
    vTint = clamp(max(red, infl * 0.92), 0.0, 1.0);

    float size = siz * uSizeScale * (1.0 + infl * 1.15 + touch * 1.35);
    float px = clamp(size * uProjScale / max(-mv.z, 0.001), 1.0, uMaxPx);
    // The sprite must be square and large enough to CONTAIN the stroke, so the
    // quad grows with the elongation and the fragment carves the mark out of
    // it. Clamped after the fact so a fast morph can never blow the fill
    // budget on a mobile GPU.
    float grow = 1.0 + vStretch * STROKE_LEN;
    gl_PointSize = min(px * grow, uMaxPx * 3.2);

    // A point sprite is always centred on its vertex, so a trailing stroke has
    // to be bought by moving the SPRITE forward by half its own length. Done
    // in clip space against the real viewport, which keeps it exact under
    // every focal length the film uses.
    gl_Position.xy += vDir * (gl_PointSize - px) * 0.5 / uViewport * gl_Position.w;

    // Fog is RELATIVE to whatever the camera is looking at, never absolute.
    // Across the film the camera's working distance moves from ~26 units (the
    // corridor) to ~570 (the long-lens drafting table) to ~900 (the city), so
    // any fixed near/far in metres either does nothing or erases the subject
    // entirely — the plan renders as a ghost, which is exactly what it did.
    // Expressed as a ratio of the focus distance it is framing-independent,
    // and it is correct on every aspect ratio for free.
    vFog = smoothstep(uFogNear, uFogFar, dr);
  }
`

const fragmentShader = /* glsl */ `
  #define STROKE_LEN ${STROKE_LEN.toFixed(1)}
  #define STROKE_THIN ${STROKE_THIN.toFixed(2)}
  uniform vec3  uInk;
  uniform vec3  uRed;
  uniform vec3  uHaze;    // what depth fades TO — the current ground colour
  uniform float uSoft;    // 0 = hard drafting bead, 1 = soft luminous node

  varying float vAlpha;
  varying float vTint;
  varying float vFog;
  varying float vSeed;
  varying vec2  vDir;
  varying float vStretch;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;

    // ── Bead, or stroke ───────────────────────────────────────────────────
    // The sprite was GROWN to hold the stroke, so undo that first to get back
    // into bead units, then measure distance to a SEGMENT instead of to a
    // point. A capsule of zero length is exactly a circle, so a settled mark
    // is bit-identical to what it was before any of this existed — every
    // profile below is untouched at rest.
    float L = vStretch * STROKE_LEN;
    vec2 p = uv * (1.0 + L);
    if (L > 0.001) {
      vec2 t = vDir;
      float s = dot(p, t);
      float q = dot(p, vec2(-t.y, t.x));
      // The spine is centred on the sprite; the VERTEX stage has already
      // shifted the whole sprite forward by half its length, so what lands on
      // the point's true position is the stroke's HEAD and the body trails
      // behind it. That is the difference between a mark being laid down and
      // a dash being carried along.
      // Thinner as it lengthens — the same pigment over a longer path.
      p = vec2(s - clamp(s, -L * 0.5, L * 0.5), q * (1.0 + L * STROKE_THIN));
    }
    float d = length(p);
    if (d > 0.5) discard;

    // Two shapes in one: a hard-edged bead (the identity's construction) and a
    // soft node (a thing that emits rather than is drawn). Movements choose.
    //
    // The emissive profile is a CORE plus a halo, not a single falloff. A lone
    // pow() curve has no plateau, so every mark is its own dimmest possible
    // version of itself and a field of them reads as cotton wool — which is
    // exactly what the night movements looked like. A real light has a small
    // saturated centre that holds its value and a fast skirt around it; that
    // is what makes a thousand of them read as a thousand LIGHTS rather than
    // as one soft mass.
    float aa   = fwidth(d);
    float hard = 1.0 - smoothstep(0.5 - aa, 0.5, d);
    float core = 1.0 - smoothstep(0.10, 0.19, d);
    float halo = pow(clamp(1.0 - d * 2.0, 0.0, 1.0), 2.6);
    float soft = clamp(core + halo * 0.62, 0.0, 1.0);
    float mask = mix(hard, soft, uSoft);
    if (mask < 0.004) discard;

    vec3 col = mix(uInk, uRed, vTint);
    col = mix(col, uHaze, vFog * 0.92);

    gl_FragColor = vec4(col, mask * vAlpha * (1.0 - vFog * 0.55));
  }
`

export default function PointPool({ states, count, order, look, progress, redPos, pointer }) {
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
      uMorphRate: { value: 0 },
      uStroke: { value: 1 },
      uViewport: { value: new THREE.Vector2(1, 1) },
      uSizeScale: { value: 1 },
      uMaxPx: { value: 40 },
      uFogNear: { value: 1.6 },
      uFogFar: { value: 6.0 },
      uFocusDist: { value: 30 },
      uCursor: { value: new THREE.Vector3(0, 0, 1e4) },
      uCursorRadius: { value: 6 },
      uCursorPush: { value: 0 },
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

  const morphRef = useRef({ last: 0, rate: 0 })

  useFrame((state, delta) => {
    const fovRad = (camera.fov * Math.PI) / 180
    uniforms.uProjScale.value = gl.domElement.height / (2 * Math.tan(fovRad / 2))
    uniforms.uViewport.value.set(gl.domElement.width * 0.5, gl.domElement.height * 0.5)

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
      // A boundary crossing resets morph from 1 to 0 while the geometry is
      // continuous. Measuring rate across it would report an enormous phantom
      // velocity and flick the whole field into full strokes for one frame.
      morphRef.current.last = morph
    }

    const u = uniforms
    u.uTime.value = state.clock.elapsedTime
    u.uMorph.value = morph

    // How hard the film is being drawn, right now. The rate is smoothed
    // asymmetrically — it takes the peak immediately and releases slowly — so
    // a stroke appears the instant the hand moves and RELAXES into its bead
    // rather than snapping back the moment the scroll stops.
    {
      const dt = Math.max(1e-4, Math.min(delta, 1 / 20))
      const inst = Math.abs(morph - morphRef.current.last) / dt
      morphRef.current.last = morph
      const m = morphRef.current
      m.rate = inst > m.rate ? inst : m.rate + (inst - m.rate) * (1 - Math.exp(-4.5 * dt))
      u.uMorphRate.value = m.rate
    }
    u.uRedPos.value.copy(redPos.current)

    // Every look parameter is published by the movement director, so the pool
    // itself holds no art direction — it only knows how to be a point.
    const L = look.current
    u.uMotion.value = L.motion
    u.uMotionAmp.value = L.motionAmp
    u.uReveal.value = L.reveal
    u.uSizeScale.value = L.sizeScale
    u.uStroke.value = L.stroke ?? 1
    u.uMaxPx.value = L.maxPx
    u.uSoft.value = L.soft
    u.uRedRadius.value = L.redRadius
    u.uFogNear.value = L.fogNear
    u.uFogFar.value = L.fogFar
    u.uFocusDist.value = L.focusDist || 30

    // Scaled to the working distance, so the pool of attention is the same
    // size ON SCREEN whether the camera is 26 units out or 570.
    const fd = L.focusDist || 30
    u.uCursor.value.copy(pointer.world)
    u.uCursorRadius.value = fd * 0.13
    u.uCursorPush.value =
      pointer.present * (0.45 + pointer.down * 0.75) * (L.handStrength ?? 1)
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

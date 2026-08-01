import * as THREE from 'three'
import { MOTION } from './PointPool'
import { fitDistance } from './CameraDirector'
import { PAPER, INK, RED } from './tokens'

/**
 * The art direction, as a table.
 *
 * Six blind designers produced six beautiful movements and three independent
 * critics found they had all reached for the same three tricks: five of six
 * killed perspective, four inverted paper and ink, and four claimed the
 * dolly-zoom-to-orthographic as their exclusive signature. Left alone the film
 * would have read as two movements repeated.
 *
 * So the scarce gestures are ALLOCATED here, once, and each movement owns
 * exactly one of each. This file is the single place that guarantees "no
 * repeated layouts, no repeated animations" — it is a budget, not a palette.
 *
 *   movement      camera grammar        palette event       motion character
 *   ─────────────────────────────────────────────────────────────────────────
 *   1 nothing     corridor dolly        paper, day          drifting swarm
 *   2 blueprint   locked-off ortho      negative print      ruled / snapped
 *   3 building    crane, nadir→eye      raking sun          rigid hinge
 *   4 city        vertical ascent       aerial haze         quantised split
 *   5 network     slow orbit            night               conduction
 *   6 intellig.   push-in to macro      emission            curl flow
 *   7 resolution  pull-back reveal      noon document       wick to the mark
 *
 * A movement may not borrow another's. If a future movement needs a gesture
 * that is already taken, the gesture moves — it is never shared.
 */

const c = (hex) => new THREE.Color(hex)

/** Paper-register look — the film's default ground truth. */
const DAY = {
  ink: c(INK),
  haze: c(PAPER),
  soft: 0,
  fogNear: 1.7,
  fogFar: 6.5,
}

/** Night register. Ink and paper swap ROLES rather than being recoloured, so
 *  the palette never gains a hue it did not already own. */
const NIGHT = {
  ink: c('#f4efe4'), // marks are now light
  haze: c('#0b0a09'), // depth fades to dark
  soft: 1,
  fogNear: 1.5,
  fogFar: 5.0,
}

export const LOOKS = {
  nothing: {
    ...DAY,
    motion: MOTION.DRIFT,
    motionAmp: 1.0,
    sizeScale: 1,
    maxPx: 40,
    redRadius: 6,
  },
  blueprint: {
    ...DAY,
    motion: MOTION.DRAFT,
    motionAmp: 0.35,
    sizeScale: 1,
    maxPx: 26,
    redRadius: 3,
    // The negative print is a full-frame event, driven separately — see
    // GroundPlate. The pool only needs to know its marks may invert.
    invertible: true,
  },
  building: {
    ...DAY,
    motion: MOTION.SETTLE,
    motionAmp: 0.5,
    sizeScale: 1,
    maxPx: 24,
    redRadius: 4,
  },
  city: {
    ...DAY,
    motion: MOTION.PARALLAX,
    motionAmp: 0,
    sizeScale: 0.85,
    maxPx: 14,
    redRadius: 7,
    // Aerial perspective — this movement's exclusive palette event. Tight
    // ratios so distant blocks genuinely dissolve into the haze.
    fogNear: 0.9,
    fogFar: 2.8,
  },
  network: {
    ...NIGHT,
    motion: MOTION.PULSE,
    motionAmp: 0.5,
    sizeScale: 1.15,
    maxPx: 22,
    redRadius: 10,
  },
  intelligence: {
    ...NIGHT,
    motion: MOTION.FLOW,
    motionAmp: 0.35,
    sizeScale: 1.3,
    maxPx: 30,
    redRadius: 14,
    fogNear: 1.2,
    fogFar: 4.0,
  },
  resolution: {
    ...DAY,
    motion: MOTION.STILL,
    motionAmp: 0,
    sizeScale: 1,
    maxPx: 44,
    redRadius: 3,
  },
}

/**
 * Camera intents.
 *
 * Each is a pure function of the movement's local progress. The director blends
 * whichever are live, so a hand-off is one body and one lens moving between two
 * intentions rather than a cut.
 *
 * FOCAL LENGTH IS THE MAIN INSTRUMENT. Several beats want a parallel-projected
 * reading; swapping the projection mid-film would be a hard cut in the one
 * place the film cannot afford one. A long lens pulled far back is optically
 * almost orthographic, and getting there is a dolly-zoom — itself one of the
 * most cinematic moves available. The floor is 3°, not 0: below that the depth
 * buffer degenerates and near/far have to be recomputed every frame for no
 * visible gain.
 */

const V = (x, y, z) => new THREE.Vector3(x, y, z)
const lerp = THREE.MathUtils.lerp
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t) => 1 - Math.pow(1 - t, 3)

/** Framing for a subject of the given half-extents, at a given focal length. */
const frame = (halfW, halfH, fov, aspect, min) =>
  fitDistance(halfW, halfH, fov, aspect, min)

export function buildIntents(framing) {
  const { wordHalfW, wordHalfH, cityHalf } = framing

  // ── 1 · corridor dolly ──────────────────────────────────────────────────
  // Ported from movement 1: a spline through a drafting corridor, resolving to
  // a head-on framing of the logotype.
  const path = new THREE.CatmullRomCurve3(
    [
      [0, 0, 26], [4, 2, 12], [-9, 6, -12], [-22, 3, -40],
      [4, -5, -66], [22, 5, -84], [16, 3, -30], [5, 1, 16],
    ].map(([x, y, z]) => V(x, y, z)),
    false, 'catmullrom', 0.3
  )
  const lookPath = new THREE.CatmullRomCurve3(
    [
      [0, 0, 2], [0, 1, -8], [-6, 3, -30], [-8, 0, -58],
      [6, -1, -84], [10, 3, -62], [2, 2, -14], [0, 0, 1],
    ].map(([x, y, z]) => V(x, y, z)),
    false, 'catmullrom', 0.3
  )
  const tmpA = V(0, 0, 0)
  const tmpB = V(0, 0, 0)

  return {
    nothing(t, { aspect }) {
      const travel = ease(Math.min(1, t / 0.72))
      path.getPointAt(Math.min(0.999, travel), tmpA)
      lookPath.getPointAt(Math.min(0.999, travel), tmpB)
      const d = frame(wordHalfW * 1.62, wordHalfH * 5.2, 35, aspect, 26)
      const resolve = 1 - Math.pow(1 - Math.min(1, Math.max(0, (t - 0.66) / 0.34)), 4)
      return {
        pos: tmpA.clone().lerp(V(0, 0, d), resolve),
        look: tmpB.clone().lerp(V(0, 0, 0), resolve),
        fov: 35,
      }
    },

    // ── 2 · locked-off orthographic drafting table ────────────────────────
    // The camera is nailed down. The only event is that convergence dies: a
    // reverse dolly-zoom to the long-lens limit, calibrated so the subject's
    // screen size never changes. The image stops being a photograph and
    // becomes a projection — which is what a drawing is.
    blueprint(t, { aspect }) {
      const fov = lerp(35, 3.4, ease(Math.min(1, t / 0.55)))
      const d = frame(wordHalfW * 1.35, wordHalfH * 4.2, fov, aspect, 20)
      // Sheet moves only: axis-aligned, never a curve, never an arc.
      const pan = t > 0.62 ? Math.min(1, (t - 0.62) / 0.3) : 0
      const px = lerp(0, wordHalfW * 0.16, ease(pan))
      return { pos: V(px, 0, d), look: V(px, 0, 0), fov }
    },

    // ── 3 · the crane, and the film's ONE projection unwarp ───────────────
    // Nadir to eye level. This is the only place the lens is allowed to open
    // back up, because it is the only beat whose subject genuinely stops being
    // a drawing and starts being a space.
    building(t, { aspect }) {
      const k = ease(t)
      const fov = lerp(3.4, 35, easeOut(Math.min(1, t / 0.82)))
      const far = frame(wordHalfW * 1.5, wordHalfH * 4, fov, aspect, 22)
      // Pitch from straight down to a low three-quarter. It stops at ~14°
      // rather than 0 — at true zero the footprint projects to a line and the
      // framing has no solution.
      const pitch = lerp(Math.PI / 2, 0.24, k)
      const dist = lerp(far, 46, k)
      return {
        pos: V(
          Math.sin(k * 0.6) * 6,
          Math.sin(pitch) * dist,
          Math.cos(pitch) * dist
        ),
        look: V(0, lerp(0, 5.5, k), 0),
        fov,
      }
    },

    // ── 4 · vertical ascent ───────────────────────────────────────────────
    // Scale by ALTITUDE, not by lens. The camera simply rises, and the site
    // keeps subdividing beneath it. Nothing else in the film goes straight up.
    city(t, { aspect }) {
      const k = ease(t)
      const y = lerp(8, cityHalf * 1.5, k)
      const back = lerp(46, cityHalf * 1.25, k)
      const fov = lerp(35, 26, k)
      void aspect
      return {
        pos: V(Math.sin(k * 1.1) * cityHalf * 0.12, y, back),
        look: V(0, lerp(5.5, 0, k), 0),
        fov,
      }
    },

    // ── 5 · slow orbit ────────────────────────────────────────────────────
    // The one arc in the film. It exists to prove the graph is a solid and not
    // a flat diagram — a truth that only parallax can tell.
    network(t, { aspect }) {
      const k = ease(t)
      const a = -Math.PI * 0.28 + k * Math.PI * 0.62
      const r = lerp(cityHalf * 1.15, cityHalf * 0.72, k)
      const y = lerp(cityHalf * 0.9, cityHalf * 0.28, k)
      void aspect
      return {
        pos: V(Math.sin(a) * r, y, Math.cos(a) * r),
        look: V(0, 0, 0),
        fov: lerp(26, 34, k),
        roll: Math.sin(k * Math.PI) * 0.012,
      }
    },

    // ── 6 · push-in to macro ──────────────────────────────────────────────
    // The camera travels INTO the thing and never arrives. Detail exists at
    // three octaves so the approach keeps finding more structure — the visual
    // argument that this is a mind rather than a model.
    intelligence(t, { aspect }) {
      const k = easeOut(t)
      const d = lerp(cityHalf * 0.62, 3.2, k)
      void aspect
      return {
        pos: V(Math.sin(t * 0.9) * d * 0.12, Math.cos(t * 0.7) * d * 0.08, d),
        look: V(0, 0, 0),
        fov: lerp(34, 58, k), // a widening lens exaggerates the approach
        roll: t * 0.05,
      }
    },

    // ── 7 · pull-back reveal ──────────────────────────────────────────────
    // The reverse of everything. It lands on the exact framing movement 1
    // resolved to, so the film closes the loop it opened.
    resolution(t, { aspect }) {
      const k = ease(t)
      const d = frame(wordHalfW * 1.62, wordHalfH * 5.2, 35, aspect, 26)
      return {
        pos: V(0, 0, lerp(3.2, d, k)),
        look: V(0, 0, 0),
        fov: lerp(58, 35, easeOut(Math.min(1, t / 0.7))),
      }
    },
  }
}

export { PAPER, INK, RED }

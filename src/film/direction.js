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

/**
 * ── THE REGISTER, AND WHY IT IS ONE NUMBER ────────────────────────────────
 *
 * Four movements are drawn as ink on paper; two are drawn as light in the
 * dark. That is a single directed quantity — `night` — and it has to be
 * modelled as one, because the obvious implementation is broken in a way that
 * is invisible in the code and fatal on screen.
 *
 * The obvious implementation blends the two palettes: paper→black and
 * ink→light, both linearly, across a movement hand-off. Both channels then
 * pass through their own midpoint AT THE SAME TIME, and the midpoint of
 * near-black and near-white is the same grey. MEASURED on the shipped build:
 * at P = 0.90 — the film's climax, the reveal of the mark — the marks were
 * #aeaba3 on a #bdbab4 ground. That is a contrast ratio of 1.09:1. For about
 * two and a half seconds of scrolling the film was not dim, it was ABSENT,
 * twice: once at the city→network hand-off and once over the finale. The
 * grey-pink mush was not a shader bug. It was the palette's own arithmetic.
 *
 * So the two channels are moved on OFFSET schedules. The ground darkens over
 * the first half of the swap; the marks only ignite over the second. They
 * never cross at grey — they cross at BLACK, which is not a failure but the
 * oldest transition in cinema, a dip to black at an act break. It lasts about
 * four tenths of a second, and the red dot, whose material is unlit and
 * therefore register-independent, is the one thing still visible through it.
 * The film goes dark, the intelligence is all that is left, and the world
 * comes back as light.
 */
const PAPER_C = c(PAPER)
const INK_C = c(INK)
const NIGHT_HAZE = c('#0b0a09')
const NIGHT_INK = c('#f4efe4')

const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1)))
  return t * t * (3 - 2 * t)
}

/** Where the ground has got to, and where the marks have got to. Offset. */
export const REGISTER_BG_IN = 0.46
export const REGISTER_INK_IN = 0.54

/**
 * Resolve the register into its two colours plus the two scalars that ride
 * with it. Pure; writes into caller-owned colours so the frame loop allocates
 * nothing.
 */
export function resolveRegister(night, ink, haze) {
  const bgK = sstep(0, REGISTER_BG_IN, night)
  const inkK = sstep(REGISTER_INK_IN, 1, night)
  haze.copy(PAPER_C).lerp(NIGHT_HAZE, bgK)
  ink.copy(INK_C).lerp(NIGHT_INK, inkK)
  return {
    // A mark is DRAWN on paper and EMITS in the dark. Same schedule as the
    // ink's ignition, so the two can never disagree about which world it is.
    soft: inkK,
    // How deep into the crossing we are: 1 exactly at the black frame. The
    // dot's aura swells here so the blackout reads as the intelligence taking
    // the room, rather than as the renderer having died.
    blackout: sstep(0.18, REGISTER_BG_IN, night) * sstep(0.82, REGISTER_INK_IN, night),
  }
}

export const LOOKS = {
  nothing: {
    night: 0,
    stroke: 1.0,
    motion: MOTION.DRIFT,
    motionAmp: 1.0,
    sizeScale: 0.8,
    maxPx: 22,
    redFrac: 0.62,
    // The corridor's look-target is only a few units ahead of the lens while
    // the field runs a hundred units deep, so a ratio tuned for a framed
    // subject fogs almost everything: the opening read as grey dust rather
    // than as ink appearing on paper. Wide ratios keep the near field BLACK.
    fogNear: 3.4,
    fogFar: 16.0,
  },
  blueprint: {
    night: 0,
    stroke: 0.55,
    motion: MOTION.DRAFT,
    motionAmp: 0.35,
    sizeScale: 0.72,
    maxPx: 18,
    redFrac: 0.15,
    fogNear: 1.7,
    fogFar: 6.5,
  },
  building: {
    night: 0,
    stroke: 1.0,
    motion: MOTION.SETTLE,
    motionAmp: 0.5,
    sizeScale: 0.34,
    maxPx: 9,
    redFrac: 0.26,
    fogNear: 1.7,
    fogFar: 6.5,
  },
  city: {
    night: 0,
    stroke: 0.7,
    motion: MOTION.PARALLAX,
    motionAmp: 0,
    sizeScale: 0.85,
    maxPx: 11,
    redFrac: 0.11,
    // Aerial perspective — this movement's exclusive palette event. Tight
    // ratios so distant blocks genuinely dissolve into the haze.
    fogNear: 0.9,
    fogFar: 2.8,
  },
  network: {
    night: 1,
    stroke: 1.25,
    motion: MOTION.PULSE,
    motionAmp: 0.5,
    sizeScale: 1.15,
    maxPx: 16,
    redFrac: 0.4,
    fogNear: 1.5,
    fogFar: 5.0,
  },
  intelligence: {
    night: 1,
    stroke: 1.0,
    motion: MOTION.FLOW,
    motionAmp: 0.35,
    sizeScale: 0.75,
    maxPx: 18,
    redFrac: 0.34,
    fogNear: 1.2,
    fogFar: 4.0,
  },
  resolution: {
    night: 0,
    stroke: 0.35,
    motion: MOTION.STILL,
    motionAmp: 0,
    sizeScale: 1,
    maxPx: 44,
    redFrac: 0.085,
    fogNear: 1.7,
    fogFar: 6.5,
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

/**
 * The lockup's framing — ONE function, used by the shot that resolves into it
 * at the title card and by the shot that pulls back to it at the finale, so
 * the film's loop closes exactly rather than approximately.
 *
 * PORTRAIT IS NOT A CROP OF LANDSCAPE. A phone frame is tall and narrow, and
 * framing it with the landscape numbers left the mark at 64% of the screen
 * width with 43% of the screen empty above it: a small object floating in a
 * column of paper, which is what a desktop composition looks like when it is
 * merely cropped. Portrait is framed on the word's WIDTH, tightly, because
 * width is the scarce dimension there; landscape is framed on its HEIGHT,
 * because height is the scarce dimension there. Same mark, two compositions.
 */
const lockupDistance = (wordHalfW, wordHalfH, fov, aspect) => {
  const portrait = aspect < 1
  return frame(
    wordHalfW * (portrait ? 1.3 : 1.62),
    wordHalfH * (portrait ? 3.2 : 4.0),
    fov,
    aspect,
    portrait ? 20 : 26
  )
}

/**
 * How far BELOW the mark the lockup shot aims.
 *
 * Aiming at the mark's own centre puts it dead centre in the frame, and the
 * finale is not a mark alone — it is a mark, a line of type and an invitation,
 * and that GROUP is what has to sit well on the page. Centring the first
 * element leaves the group bottom-heavy. Sixteen percent of the frame's half
 * height lifts the mark into the upper-middle and gives the invitation the
 * lower third, which is where an invitation belongs.
 *
 * Expressed against the working distance so it is the same on every viewport.
 */
const lockupLookY = (d, fov) => -0.16 * d * Math.tan((fov * Math.PI) / 360)

export function buildIntents(framing) {
  const {
    wordHalfW,
    wordHalfH,
    cityHalf,
    buildingHalfW = 21,
    buildingHalfH = 12,
    buildingTop = 12,
  } = framing

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
      const d = lockupDistance(wordHalfW, wordHalfH, 35, aspect)
      const ly = lockupLookY(d, 35)
      const resolve = 1 - Math.pow(1 - Math.min(1, Math.max(0, (t - 0.66) / 0.34)), 4)
      return {
        pos: tmpA.clone().lerp(V(0, ly, d), resolve),
        look: tmpB.clone().lerp(V(0, ly, 0), resolve),
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
      // COMPUTED, like every other shot. This was the one hard-coded distance
      // in the table, and the subject grew past it: measured, the building
      // needs 51 units and the literal said 46, so it filled 89% of the frame
      // width with its base cropped off the bottom edge. A three-quarter view
      // is also seen across its diagonal, which is what the extra breadth pays
      // for, and the vertical extent is measured about the RAISED look-point
      // rather than about the origin — the crane tilts up as it rises, so the
      // half-height the lens has to cover is the distance from that point down
      // to the ground, not the model's own half-height.
      const eyeH = lerp(0, 5.5, k)
      const half = Math.hypot(buildingHalfW, buildingHalfW * 0.62)
      const near = frame(
        half * 1.24,
        Math.max(buildingTop - eyeH, eyeH + buildingHalfH) * 1.22,
        fov,
        aspect,
        24
      )
      const dist = lerp(far, near, k)
      return {
        pos: V(
          Math.sin(k * 0.6) * 6,
          Math.sin(pitch) * dist,
          Math.cos(pitch) * dist
        ),
        look: V(0, eyeH, 0),
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
    // A reveal LEAVES. Symmetric easing was the wrong instinct here: it holds
    // the camera almost still through the first third, so the film's register
    // had already returned to paper while the lens was still buried three
    // units inside the core with nothing resolvable in frame. MEASURED at
    // P = 0.889 — a fifth of the way into the reveal — the working distance
    // was 3.6 units of a 91-unit journey. The audience was watching the
    // climax's debris, not the mark.
    //
    // So it breaks away immediately and spends its time SETTLING, which is
    // also what a real pull-back does: the operator lets go, and the last
    // second is the frame coming to rest.
    resolution(t, { aspect }) {
      const k = 1 - Math.pow(1 - t, 2.4)
      const d = lockupDistance(wordHalfW, wordHalfH, 35, aspect)
      const ly = lockupLookY(d, 35) * k
      return {
        pos: V(0, ly, lerp(3.2, d, k)),
        look: V(0, ly, 0),
        fov: lerp(58, 35, easeOut(Math.min(1, t / 0.7))),
      }
    },
  }
}

export { PAPER, INK, RED }

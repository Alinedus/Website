/**
 * The character: a 14-point rig, solved in local 2D and drawn in the logo's own vocabulary —
 * joints are dots, limbs are the strokes between them, and the head stays detached, floating two
 * grid cells clear of the neck exactly as it sits above the d.
 *
 * Pure and stateless. Callers own the phase; this only turns a state into positions, which keeps
 * it trivially testable in 2D before it goes anywhere near the 3D scene.
 *
 * Units are grid cells with the feet at y = 0 and y pointing up. One cell here is the logo's 32,
 * so the head's +2.0 above the neck is the real spacing, not an approximation of it.
 */

export interface Vec2 {
  x: number
  y: number
}

export const JOINTS = [
  'head', 'neck', 'chest', 'hip',
  'shL', 'shR', 'elL', 'elR', 'haL', 'haR',
  'knL', 'knR', 'ftL', 'ftR',
] as const

export type JointName = (typeof JOINTS)[number]
export type Joints = Record<JointName, Vec2>

/** Draw order matters — the body assembles spine-first as it falls in scene 01. */
export const BONES: readonly [JointName, JointName][] = [
  ['neck', 'chest'],
  ['chest', 'hip'],
  ['shL', 'shR'],
  ['shL', 'elL'],
  ['elL', 'haL'],
  ['shR', 'elR'],
  ['elR', 'haR'],
  ['hip', 'knL'],
  ['knL', 'ftL'],
  ['hip', 'knR'],
  ['knR', 'ftR'],
]

const HIP_Y = 2.15
const CHEST_Y = 3.45
const NECK_Y = 4.2
const SHOULDER_Y = 3.8
// He is a side view — limbs swing in x, along the direction of travel. Wide shoulders and hips
// belong to a front view, and combining the two makes the legs look like they are swinging
// sideways. These are just enough lateral offset to separate near limb from far.
const SHOULDER_W = 0.24
const HIP_W = 0.13
const THIGH = 1.1
const SHIN = 1.05
const UPPER_ARM = 0.9
const FORE_ARM = 0.88

/**
 * The head's rest gap above the neck.
 *
 * The submark's centres are 64 units apart on 32-unit dots, so the gap between the *edges* of the
 * two circles is one dot diameter. Matching that ratio is what makes it read as the logo. A flat
 * "two grid cells" measured centre-to-centre — which is what this was — gives a gap nearly twice
 * the head's width, and it stops reading as a head at all.
 */
export const HEAD_R = 0.42
export const HEAD_GAP = 0.95
/** Head centre height at rest, for callers driving the detach. */
export const HEAD_REST = NECK_Y + HEAD_GAP
/** Total rest height, feet to top of head. Callers scale against this. */
export const HEIGHT = HEAD_REST + HEAD_R

export interface FigureState {
  /** walk cycle phase in radians; one full stride is 2π */
  phase: number
  /** 0 standing still, 1 full stride */
  walk: number
  /** 0 upright, 1 trudging — shoulders forward, head down */
  slump: number
  /** 0 level, 1 looking up at the dot */
  lookUp: number
  /** extra cells the head floats above its rest gap, for the detach and fall */
  headLift: number
  /**
   * 0 whole, 1 fully drawn into the head.
   *
   * Truncating the bone list to make him disappear leaves a stray sliver of spine hanging in the
   * air and reads as broken geometry. Pulling every joint into the head instead makes the body
   * condense into the dot — and running it backwards makes the body unfold back out of it, which
   * is how he returns on the line.
   */
  condense: number
}

export function figureState(over: Partial<FigureState> = {}): FigureState {
  return { phase: 0, walk: 0, slump: 0, lookUp: 0, headLift: 0, condense: 0, ...over }
}

export function emptyJoints(): Joints {
  return Object.fromEntries(JOINTS.map((j) => [j, { x: 0, y: 0 }])) as Joints
}

export function solveFigure(s: FigureState, out: Joints = emptyJoints()): Joints {
  const w = s.walk

  // Torso lean: forward when walking, much further forward when trudging, back when looking up.
  const lean = 0.1 * w + 0.3 * s.slump - 0.22 * s.lookUp
  const drop = 0.18 * s.slump

  out.hip.x = 0
  out.hip.y = HIP_Y
  out.chest.x = lean * 0.55
  out.chest.y = CHEST_Y - drop * 0.4
  out.neck.x = lean
  out.neck.y = NECK_Y - drop

  // The head does not rotate — it is a dot. Gaze reads through the neck leaning back and the head
  // riding a little higher, which is all a detached dot can honestly express.
  out.head.x = out.neck.x + 0.06 * s.lookUp
  out.head.y = out.neck.y + HEAD_GAP + s.headLift + 0.14 * s.lookUp

  const shY = SHOULDER_Y - drop * 0.7
  out.shL.x = out.chest.x - SHOULDER_W
  out.shL.y = shY
  out.shR.x = out.chest.x + SHOULDER_W
  out.shR.y = shY

  // arms counter-swing to the opposite leg
  arm(out.shL, -Math.sin(s.phase) * w, s.slump, out.elL, out.haL)
  arm(out.shR, Math.sin(s.phase) * w, s.slump, out.elR, out.haR)

  leg(out.hip, -HIP_W, s.phase, w, out.knL, out.ftL)
  leg(out.hip, HIP_W, s.phase + Math.PI, w, out.knR, out.ftR)

  // Plant him on the ground: shift everything so the lower foot sits at y = 0. This produces the
  // vertical bob for free and correctly, instead of faking it with a sine on the hip and hoping
  // the feet land somewhere near the floor.
  const lift = Math.min(out.ftL.y, out.ftR.y)
  if (lift !== 0) for (const j of JOINTS) out[j].y -= lift

  // Draw the body into the head — or, run backwards, unfold it back out again.
  if (s.condense > 0) {
    const c = s.condense * s.condense * (3 - 2 * s.condense)
    for (const j of JOINTS) {
      if (j === 'head') continue
      out[j].x += (out.head.x - out[j].x) * c
      out[j].y += (out.head.y - out[j].y) * c
    }
  }

  return out
}

function arm(sh: Vec2, swing: number, slump: number, el: Vec2, ha: Vec2) {
  const a = swing * 0.4
  // the elbow folds most when the arm is forward, which is what stops it reading as a scarecrow
  const bend = 0.2 + 0.5 * slump + 0.4 * Math.max(0, swing)
  el.x = sh.x + Math.sin(a) * UPPER_ARM
  el.y = sh.y - Math.cos(a) * UPPER_ARM
  ha.x = el.x + Math.sin(a + bend) * FORE_ARM
  ha.y = el.y - Math.cos(a + bend) * FORE_ARM
}

function leg(hip: Vec2, dx: number, phase: number, w: number, kn: Vec2, ft: Vec2) {
  const swing = Math.sin(phase) * w
  // The knee bends through the swing-through half of the cycle and straightens on the plant —
  // a straight leg on the ground is what makes a walk read as weight rather than a shuffle.
  const bend = 0.12 + (0.75 * Math.max(0, -Math.cos(phase)) + 0.08) * w
  const thighA = swing * 0.46
  const shinA = thighA - bend

  const hx = hip.x + dx
  kn.x = hx + Math.sin(thighA) * THIGH
  kn.y = hip.y - Math.cos(thighA) * THIGH
  ft.x = kn.x + Math.sin(shinA) * SHIN
  ft.y = kn.y - Math.cos(shinA) * SHIN
}

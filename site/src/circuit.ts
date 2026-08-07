import * as THREE from 'three'

/**
 * The Act I circuit, and the straight line it becomes.
 *
 * The one job: read as a loop
 * ---------------------------
 * The whole story is that architects are stuck going round and round, so the circuit has to read as
 * a single unbroken closed ring at a glance. Everything else is secondary to that.
 *
 * An earlier pass chased a true Penrose staircase. It is buildable — the loop closes honestly in
 * world space if each flight climbs and each corner secretly drops back, with a pier hiding each
 * descent. But the piers have to cover a whole flight's drop, which makes them large, and four
 * large masses chop the ring into four separate-looking staircases. Technically impressive,
 * narratively useless. Abandoned.
 *
 * So: one continuous ring, nothing interrupting it. The steps rise gently as they go, and the
 * accumulated climb is cancelled by a per-step drift whose screen projection negates it — the ring
 * closes exactly on screen while every tread still steps. Spread over the whole lap the correction
 * is a fraction of a step each and reads as nothing.
 *
 * The chain, not the poses
 * -----------------------
 * Giving every step a loop pose and a line pose and lerping between them looks like an explosion:
 * steps take independent shortcuts and the chain visibly breaks. So the circuit is a *chain* —
 * fixed step length plus a per-step turn, rise, and drift. Straightening scales those toward zero
 * and re-integrates, so spacing is constant by construction and it can never come apart.
 *
 * NOTE: the closure is solved against the camera basis passed in. Zoom is safe; orbit is not.
 */

export interface CircuitOptions {
  stepsPerFlight?: number
  side?: number
  rise?: number
  /**
   * Per-step rise for each of the four flights, in flight order — the staircase.
   *
   * These must sum to zero over a lap or the loop does not close, and unlike the uniform `rise`
   * above there is no drift correction to lean on: a run that climbs and a run that falls by the
   * same amount closes honestly in world space, which is the only way a staircase can both step
   * visibly and meet itself.
   *
   * Overrides `rise` when given.
   */
  flights?: readonly [number, number, number, number]
  /** where the loop is cut, as a step index in flight order. Defaults to mid-flight. */
  cutIndex?: number
  right: THREE.Vector3
  up: THREE.Vector3
}

const Y_AXIS = new THREE.Vector3(0, 1, 0)

export class Circuit {
  readonly count: number
  readonly stepLen: number
  readonly dims: { len: number; height: number; depth: number }
  readonly positions: THREE.Vector3[] = []
  readonly quats: THREE.Quaternion[] = []
  readonly arc: Float32Array

  /** how far each step climbs. Flat for the ring; a staircase profile for the stair. */
  readonly rises: Float32Array

  private turns: Float32Array
  private drift = new THREE.Vector3()
  private yawFix = Math.PI / 4
  private offset = new THREE.Vector3()

  constructor(opts: CircuitOptions) {
    const spf = opts.stepsPerFlight ?? 11
    const side = opts.side ?? 18
    const rise = opts.rise ?? 0.28

    const r = opts.right.clone().normalize()
    const u = opts.up.clone().normalize()

    this.count = spf * 4
    this.stepLen = side / spf
    // The tread block. Deep enough that neighbours do not overhang each other at a turn; how far it
    // hangs *below* its own walking surface is the renderer's business, because that is what turns
    // a row of plates into a flight of stairs and it has to unwind again for the line.
    this.dims = { len: this.stepLen, height: this.stepLen * 0.2, depth: this.stepLen * 1.08 }

    // One quarter turn at the end of each flight.
    //
    // Spreading it over three treads seemed like the way to soften the corner and made it far
    // worse — the treads are wider than they are long, so rotating them a third of a right angle
    // at a time fans them out into a spray of overlapping cards. A single turn on a tread that is
    // very nearly square is exact instead: rotating a square about its own centre changes nothing,
    // so the corner tiles cleanly with no wedge and no overlap.
    const turns0 = new Float32Array(this.count)
    for (let f = 0; f < 4; f++) turns0[(f + 1) * spf - 1] = -Math.PI / 2
    // and the climb, per flight, in the same flight order
    const rises0 = new Float32Array(this.count)
    for (let f = 0; f < 4; f++) {
      const v = opts.flights ? opts.flights[f] : rise
      for (let i = 0; i < spf; i++) rises0[f * spf + i] = v
    }
    const cut = opts.cutIndex ?? Math.floor(spf / 2)
    this.turns = new Float32Array(this.count)
    this.rises = new Float32Array(this.count)
    for (let i = 0; i < this.count; i++) {
      const j = (i + cut) % this.count
      this.turns[i] = turns0[j]
      this.rises[i] = rises0[j]
    }

    const mid = (this.count - 1) / 2
    this.arc = new Float32Array(this.count)
    for (let i = 0; i < this.count; i++) {
      this.arc[i] = Math.min(i, this.count - 1 - i) / mid
      this.positions.push(new THREE.Vector3())
      this.quats.push(new THREE.Quaternion())
    }

    // The lap accumulates this much screen height. r and u are orthonormal, so the smallest world
    // vector projecting to the negative of it is just -(gx*r + gy*u).
    //
    // A balanced staircase sums to zero and needs no correction at all, which is the whole reason
    // it can step visibly: the uniform-drift trick cancels exactly as much screen height as the
    // climb adds, so a ring built that way is mathematically flat on screen no matter how steep
    // its treads are in world space. The correction only exists for the flat ring, where it is
    // zero anyway.
    let climb = 0
    for (let i = 0; i < this.count; i++) climb += this.rises[i]
    this.drift
      .copy(r)
      .multiplyScalar(-climb * r.y)
      .addScaledVector(u, -climb * u.y)
      .divideScalar(this.count)

    this.solve(0)
    const min = this.positions[0].clone()
    const max = this.positions[0].clone()
    for (let i = 1; i < this.count; i++) {
      min.min(this.positions[i])
      max.max(this.positions[i])
    }
    this.offset.addVectors(min, max).multiplyScalar(-0.5)
    this.solve(0)
  }

  /**
   * A point along the chain, 0 at the cut and 1 at the far end of it. Works unchanged as the ring
   * straightens, because it reads the same positions the renderer does.
   *
   * `cyclic` matters more than it looks. While the ring is closed there are `count` steps in the
   * lap, not `count - 1`: the gap between the last tread and the first is a real step, the one
   * that carries him across the cut from REJECT back to THINK. Sampling that segment linearly
   * leaves it out, so completing a lap teleports him a whole tread forward — a 49px hop on screen
   * at the exact moment he should be arriving at THINK, right at the end of a smooth deceleration.
   *
   * Once it is straightening the chain is no longer a ring and must not wrap, or the far end would
   * lerp back to the near one.
   */
  sample(t: number, outPos: THREE.Vector3, outDir: THREE.Vector3, cyclic = false): void {
    const n = this.count
    let i: number
    let j: number
    let a: number
    if (cyclic) {
      const f = (t - Math.floor(t)) * n
      i = Math.floor(f) % n
      j = (i + 1) % n
      a = f - Math.floor(f)
    } else {
      const f = clamp01(t) * (n - 1)
      i = Math.min(n - 2, Math.floor(f))
      j = i + 1
      a = f - i
    }
    outPos.lerpVectors(this.positions[i], this.positions[j], a)
    outDir.subVectors(this.positions[j], this.positions[i]).normalize()
  }

  solve(straighten: number): void {
    const n = this.count
    const L = this.stepLen

    // Integrate outward from the step opposite the cut, not forward from it. Integrating from one
    // end whips the chain around as the near turns unwind and the arms scythe through each other.
    // Anchoring the far side lets the two arms swing apart symmetrically, which is what pulling a
    // loop straight actually looks like.
    //
    // The weight is linear with a narrow spread. An eased weight holds three corners at a full 90
    // degrees while the fourth snaps open, and the chain crosses itself. The snap comes from the
    // straighten curve upstream instead.
    const anchor = Math.floor(n / 2)
    const w = (i: number) => 1 - stepProgress(this.arc[i], straighten, 0.22)

    const p = new THREE.Vector3()
    let yaw = 0
    this.positions[anchor].copy(p)
    this.quats[anchor].setFromAxisAngle(Y_AXIS, yaw)

    for (let i = anchor; i < n - 1; i++) {
      const wi = w(i)
      p.x += Math.cos(yaw) * L
      p.z += -Math.sin(yaw) * L
      p.y += this.rises[i] * wi
      p.addScaledVector(this.drift, wi)
      yaw += this.turns[i] * wi
      this.positions[i + 1].copy(p)
      this.quats[i + 1].setFromAxisAngle(Y_AXIS, yaw)
    }

    p.set(0, 0, 0)
    yaw = 0
    for (let i = anchor - 1; i >= 0; i--) {
      const wi = w(i)
      yaw -= this.turns[i] * wi
      p.x -= Math.cos(yaw) * L
      p.z -= -Math.sin(yaw) * L
      p.y -= this.rises[i] * wi
      p.addScaledVector(this.drift, -wi)
      this.positions[i].copy(p)
      this.quats[i].setFromAxisAngle(Y_AXIS, yaw)
    }

    for (let i = 0; i < n; i++) this.positions[i].add(this.offset)

    if (straighten <= 0) return

    const min = this.positions[0].clone()
    const max = this.positions[0].clone()
    for (let i = 1; i < n; i++) {
      min.min(this.positions[i])
      max.max(this.positions[i])
    }
    const c = min.add(max).multiplyScalar(0.5).multiplyScalar(straighten)
    const q = new THREE.Quaternion().setFromAxisAngle(
      Y_AXIS,
      this.yawFix * smoothstep(0.55, 1, straighten),
    )

    for (let i = 0; i < n; i++) {
      this.positions[i].sub(c).applyQuaternion(q)
      this.quats[i].premultiply(q)
    }
  }
}

/** Steps at the cut straighten first, the point opposite it last, so the unroll propagates. */
export function stepProgress(arcFromCut: number, straighten: number, spread = 0.22): number {
  return clamp01((straighten - arcFromCut * spread) / (1 - spread))
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** power4.inOut — the cut */
export function easeCut(t: number): number {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2
}

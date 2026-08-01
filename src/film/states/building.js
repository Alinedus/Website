/**
 * The building — the plan, standing up.
 *
 * The blueprint left a drawing lying on the table: a footprint in the world XZ
 * plane at y = 0. This state does not re-site it, re-scale it or re-draw it. It
 * takes each line of that plan and gives it a HEIGHT. Nothing translates; the
 * whole state is a set of rotations about lines that are already on the ground,
 * which is why the movement can express it as one rigid hinge and why the plan
 * is still legible underneath at every instant of it.
 *
 * ── Why a wall is TWO panels ──────────────────────────────────────────────
 *
 * An architect's plan draws a wall as a pair of parallel lines, because a wall
 * has thickness and therefore two faces. So the honest standing-up of a plan is
 * not one plane per wall: it is one panel per DRAWN LINE, each hinging about
 * its own line, and the pair arriving as the two faces of a solid. That also
 * gives the openings somewhere to be — a window punched through both faces of a
 * thick wall reads as a hole with a reveal, rather than as a gap in a screen.
 *
 * ── The parameterisation the movement animates ────────────────────────────
 *
 *   point = panel.a + along · (panel.b - panel.a) + up · height
 *
 * Every point in the wall bands is (panel, along, up), emitted row by row from
 * the base line upward, each row running back the way the last one came — a
 * boustrophedon, for the same reason the plates use one: row-major would put a
 * whole wall-length jump between the last bead of every row and the first bead
 * of the next, and those ~190 discontinuities are exactly where a morph tears.
 * Two further consequences are load-bearing:
 *
 *   · a panel occupies ONE contiguous index range, so the movement can hinge it
 *     rigidly by index (see `buildingPanels`), with no per-point bookkeeping;
 *   · the FIRST `cols` indices of every panel are exactly its base line — the
 *     plan line itself — so the incoming morph maps drawn plan onto drawn plan
 *     and the rest of the wall grows out of it, instead of the footprint being
 *     assembled out of whatever happened to be nearby.
 *
 * ── What the accent means here ────────────────────────────────────────────
 *
 * Red is on the base row and nowhere else: the hinge lines. It is the one thing
 * the audience has to understand in this movement — THESE lines are THOSE walls
 * — and because a hinge axis does not move when its panel rotates, the red plan
 * stays pinned on the ground through the entire raise. The door punches the red
 * line exactly where a plan punches it, so the threshold reads as a threshold.
 *
 * Scale: 1 world unit ≈ 0.5 m. So the 40 × 24 footprint is 20 × 12 m, a storey
 * is 6 units ≈ 3 m, walls are 0.8 ≈ 400 mm, a door head at 4.6 ≈ 2.3 m. The
 * numbers below were chosen in metres and converted, which is why the openings
 * read as openings rather than as decoration at an arbitrary size.
 *
 * No RNG state is consumed. The only stochastic-looking value here is a lattice
 * jitter derived from a pure hash of the cell indices, so this module returns
 * bit-identical geometry however many times it is called and in whatever order
 * relative to its sibling states.
 */

import { emptyState, put } from './index.js'

/* ── The plan. Exported so the blueprint state can land on the same lines ─── */

/** The table the drawing lies on, and the datum every height is measured from. */
export const GROUND_Y = 0
/** Two storeys. Read against the 40-unit-wide plan this is a low building. */
export const WALL_H = 12
export const STOREY_H = 6
export const WALL_T = 0.8

/**
 * The footprint centreline, in world (x, z), wound so that the outward normal
 * of edge (p→q) is (dz, -dx). An L: one reflex corner at [4, 2], which is what
 * gives the raking sun something to fall across and the crane something to
 * turn around.
 */
export const FOOTPRINT = [
  [-20, -12],
  [20, -12],
  [20, 12],
  [4, 12],
  [4, 2],
  [-20, 2],
]

/** Cross walls. Half height, so the plan stays readable from the nadir. */
export const PARTITIONS = [
  { a: [-6, -12], b: [-6, 2] },
  { a: [4, -2], b: [20, -2] },
]

/** A double-height void in the upper plate — the two storeys read from above. */
const VOID = { x0: -14, x1: -4, z0: -8, z1: -1 }

/* ── Openings ──────────────────────────────────────────────────────────────
 * `at` is the distance along the wall's CENTRELINE from the edge's first
 * vertex, so the same number places the hole on both faces of the wall. */

/** A window: 2.6 × 3.0 units ≈ 1.3 × 1.5 m. */
const win = (at, sill) => ({ at, w: 2.6, sill, head: sill + 3.0 })
const SILL_LO = 1.4
const SILL_HI = 7.4

const OUTER_OPENINGS = [
  // South elevation: the long face, so it carries the entrance and the rhythm.
  [
    { at: 20, w: 2.4, sill: -1, head: 4.6 }, // door — sill below grade so the
    win(6, SILL_LO), //                        base row (the red plan line) is
    win(12, SILL_LO), //                       punched through, as a plan draws
    win(28, SILL_LO), //                       a threshold.
    win(34, SILL_LO),
    win(6, SILL_HI),
    win(12, SILL_HI),
    win(20, SILL_HI),
    win(28, SILL_HI),
    win(34, SILL_HI),
  ],
  // East end: one full-height slot, so the elevation is not all one rhythm.
  [{ at: 12, w: 2.2, sill: SILL_LO, head: 10.4 }],
  [win(8, SILL_LO), win(8, SILL_HI)],
  [], // the short return is blank
  [
    win(6, SILL_LO),
    win(12, SILL_LO),
    win(18, SILL_LO),
    win(6, SILL_HI),
    win(12, SILL_HI),
    win(18, SILL_HI),
  ],
  [win(7, SILL_LO), win(7, SILL_HI)],
]

const PARTITION_OPENINGS = [
  [{ at: 7, w: 2.2, sill: -1, head: 4.4 }],
  [{ at: 8, w: 2.2, sill: -1, head: 4.4 }],
]

/* ── Plan geometry helpers (everything 2D in x/z) ─────────────────────────── */

const EPS = 1e-6

/** Outward unit normal of edge p→q, for the winding FOOTPRINT is authored in. */
function edgeNormal(p, q) {
  const dx = q[0] - p[0]
  const dz = q[1] - p[1]
  const L = Math.hypot(dx, dz) || 1
  return [dz / L, -dx / L]
}

/**
 * Mitred offset of a closed polygon; `d > 0` moves outward.
 *
 * Mitring rather than naive per-edge offsetting because the two faces of a wall
 * must MEET at a corner. Offset each edge independently and the outer faces
 * cross and the inner faces fall short, which at bead scale reads as a frayed
 * corner on precisely the feature — the corner — that says "this is built".
 */
function offsetLoop(poly, d) {
  const n = poly.length
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const na = edgeNormal(poly[(i - 1 + n) % n], poly[i])
    const nb = edgeNormal(poly[i], poly[(i + 1) % n])
    // Miter vector (na+nb)/(1+na·nb): unit-length on a straight run, √2·d at a
    // right angle. The clamp is a rail against a doubled-back plan, not a case
    // any authored footprint reaches.
    const k = 1 + (na[0] * nb[0] + na[1] * nb[1])
    const s = 1 / Math.max(k, 0.2)
    out[i] = [poly[i][0] + d * (na[0] + nb[0]) * s, poly[i][1] + d * (na[1] + nb[1]) * s]
  }
  return out
}

function polyArea(poly) {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return Math.abs(a) / 2
}

function polyBBox(poly) {
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const [x, z] of poly) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (z < z0) z0 = z
    if (z > z1) z1 = z
  }
  return [x0, x1, z0, z1]
}

function pointInPoly(x, z, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi || EPS) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Deterministic per-cell jitter — a lattice with no dither reads as moiré. */
function hash2(i, j) {
  let h = Math.imul(i ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(j + 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 15
  h = Math.imul(h, 0x2545f491)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

/** Is (s, y) inside one of this wall's holes? `s` is centreline distance. */
function isOpen(list, s, y) {
  for (let i = 0; i < list.length; i++) {
    const o = list[i]
    if (
      s > o.at - o.w / 2 + EPS &&
      s < o.at + o.w / 2 - EPS &&
      y > o.sill + EPS &&
      y < o.head - EPS
    ) {
      return true
    }
  }
  return false
}

/**
 * A serpentine lattice clipped to a polygon.
 *
 * Serpentine, not row-major: consecutive indices are then spatial neighbours at
 * the end of a row as well as inside one, so a floor plate stays a coherent
 * sheet under a morph rather than tearing along every row boundary.
 */
function latticeInPolygon(poly, pitch, exclude) {
  const [x0, x1, z0, z1] = polyBBox(poly)
  const nx = Math.max(1, Math.round((x1 - x0) / pitch))
  const nz = Math.max(1, Math.round((z1 - z0) / pitch))
  const jx = (x1 - x0) / nx
  const jz = (z1 - z0) / nz
  const out = []
  for (let j = 0; j <= nz; j++) {
    const z = z0 + jz * j + (hash2(j, 7) - 0.5) * jz * 0.22
    for (let ii = 0; ii <= nx; ii++) {
      const i = j & 1 ? nx - ii : ii
      const x = x0 + jx * i + (hash2(i, j) - 0.5) * jx * 0.22
      if (!pointInPoly(x, z, poly)) continue
      if (exclude && exclude(x, z)) continue
      out.push(x, z)
    }
  }
  return out
}

/**
 * Exactly `target` points over a polygon, in serpentine order.
 *
 * Thinning is a Bresenham selection over the walk rather than a random subset,
 * so the survivors are still neighbours in index order — which is the whole
 * reason the walk is serpentine in the first place.
 */
function plateSamples(poly, target, exclude) {
  if (target <= 0) return []
  let pitch = Math.sqrt(Math.max(polyArea(poly), 1) / target) * 0.94
  let pts = []
  for (let attempt = 0; attempt < 7; attempt++) {
    pts = latticeInPolygon(poly, pitch, exclude)
    if (pts.length / 2 >= target) break
    pitch *= 0.87
  }
  let M = pts.length / 2
  // Only reachable if the polygon is degenerate; pad rather than under-fill,
  // because an under-filled band would silently steal slots from the next one.
  while (M < target && M > 0) {
    const src = (M % (pts.length / 2)) * 2
    pts.push(pts[src] + (hash2(M, 3) - 0.5) * pitch, pts[src + 1] + (hash2(M, 5) - 0.5) * pitch)
    M++
  }
  if (M <= target) return pts

  const out = []
  for (let i = 0; i < M; i++) {
    if (Math.floor(((i + 1) * target) / M) > Math.floor((i * target) / M)) {
      out.push(pts[i * 2], pts[i * 2 + 1])
    }
  }
  return out
}

/* ── Layout ────────────────────────────────────────────────────────────────
 * Built once per (pool size, bead size) and shared by the point build, the
 * line build and the panel table, so the three can never disagree about where
 * a wall is or which indices it owns. */

let cached = null

function layout(count, bead) {
  if (cached && cached.count === count && cached.bead === bead) return cached

  // ── Panels: one per drawn plan line, two per wall ──────────────────────
  const outerOut = offsetLoop(FOOTPRINT, WALL_T / 2)
  const outerIn = offsetLoop(FOOTPRINT, -WALL_T / 2)
  const panels = []

  for (let e = 0; e < FOOTPRINT.length; e++) {
    const c0 = FOOTPRINT[e]
    const c1 = FOOTPRINT[(e + 1) % FOOTPRINT.length]
    const L = Math.hypot(c1[0] - c0[0], c1[1] - c0[1])
    const ux = (c1[0] - c0[0]) / L
    const uz = (c1[1] - c0[1]) / L
    for (const [face, loop] of [
      ['out', outerOut],
      ['in', outerIn],
    ]) {
      const a = loop[e]
      const b = loop[(e + 1) % loop.length]
      panels.push({
        id: `w${e}.${face}`,
        kind: 'wall',
        face,
        a,
        b,
        h: WALL_H,
        openings: OUTER_OPENINGS[e],
        // The miter pushes a face's start off the centreline's start; carrying
        // the offset means one `at` places a hole identically on both faces.
        along0: (a[0] - c0[0]) * ux + (a[1] - c0[1]) * uz,
      })
    }
  }

  for (let p = 0; p < PARTITIONS.length; p++) {
    const { a: c0, b: c1 } = PARTITIONS[p]
    const n = edgeNormal(c0, c1)
    for (const side of [1, -1]) {
      const o = (side * WALL_T) / 2
      panels.push({
        id: `p${p}.${side > 0 ? 'a' : 'b'}`,
        kind: 'partition',
        face: side > 0 ? 'a' : 'b',
        a: [c0[0] + n[0] * o, c0[1] + n[1] * o],
        b: [c1[0] + n[0] * o, c1[1] + n[1] * o],
        h: STOREY_H,
        openings: PARTITION_OPENINGS[p],
        along0: 0,
      })
    }
  }

  for (const P of panels) P.len = Math.hypot(P.b[0] - P.a[0], P.b[1] - P.a[1])

  // ── Pitch ──────────────────────────────────────────────────────────────
  // The wall lattice is the one band whose size is dictated by geometry rather
  // than by budget, so it sets the pitch; if it would eat the pool it coarsens
  // until the plates still have somewhere to live. At the film's pool size the
  // first trial always wins, so this is a rail for other pool sizes, not a knob.
  let pitch = bead / 1.2
  let copePitch = pitch * 0.8
  const wallCount = () =>
    panels.reduce(
      (n, P) =>
        n + Math.max(2, Math.round(P.len / pitch) + 1) * Math.max(2, Math.round(P.h / pitch) + 1),
      0
    )
  const cope = offsetLoop(FOOTPRINT, WALL_T / 2 + 0.18)
  const copeLen = cope.reduce(
    (n, p, i) => n + Math.hypot(cope[(i + 1) % cope.length][0] - p[0], cope[(i + 1) % cope.length][1] - p[1]),
    0
  )
  for (let guard = 0; guard < 10; guard++) {
    if (wallCount() + copeLen / copePitch <= count * 0.86) break
    pitch *= 1.12
    copePitch = pitch * 0.8
  }

  let cursor = 0
  for (const P of panels) {
    P.cols = Math.max(2, Math.round(P.len / pitch) + 1)
    P.rows = Math.max(2, Math.round(P.h / pitch) + 1)
    P.start = cursor
    P.count = P.cols * P.rows
    cursor += P.count
  }

  // ── Parapet coping ─────────────────────────────────────────────────────
  // Proud of the wall head and outboard of its face, so the crane's first read
  // from the nadir is a crisp continuous ring, and the raking sun has an edge
  // to throw a shadow line from.
  const copeY = WALL_H + 0.22
  const copeXZ = []
  for (let i = 0; i < cope.length; i++) {
    const p = cope[i]
    const q = cope[(i + 1) % cope.length]
    const L = Math.hypot(q[0] - p[0], q[1] - p[1])
    const n = Math.max(1, Math.round(L / copePitch))
    for (let j = 0; j < n; j++) {
      const t = j / n
      copeXZ.push(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
    }
  }
  const copeStart = cursor
  cursor += copeXZ.length / 2

  // ── Plates ─────────────────────────────────────────────────────────────
  // Inset clear of the inner wall face so the red hinge line stays a line and
  // is not thickened into a band by the slab's own edge beads.
  const plateLoop = offsetLoop(FOOTPRINT, -(WALL_T / 2 + 0.25))
  const remaining = Math.max(0, count - cursor)
  const upperTarget = Math.min(remaining, Math.round(remaining * 0.22))

  const upperXZ = plateSamples(
    plateLoop,
    upperTarget,
    (x, z) => x > VOID.x0 && x < VOID.x1 && z > VOID.z0 && z < VOID.z1
  )
  const upperStart = cursor
  cursor += upperXZ.length / 2

  const groundXZ = plateSamples(plateLoop, Math.max(0, count - cursor), null)
  const groundStart = cursor
  cursor += groundXZ.length / 2

  cached = {
    count,
    bead,
    pitch,
    panels,
    cope,
    copeXZ,
    copeY,
    copeStart,
    upperXZ,
    upperStart,
    groundXZ,
    groundStart,
    used: cursor,
  }
  return cached
}

/** Bead diameter: matched to the wordmark's, so the building is the same matter. */
function beadOf(ctx) {
  const r = ctx && ctx.wordmark && ctx.wordmark.dotRadius
  return r > 0 ? r * 2 : 1.2
}

/** Storey datums read as slightly heavier rows — a drafted line, not a gap. */
function datumScale(y, h) {
  if (Math.abs(y) < 1e-3 || Math.abs(y - STOREY_H) < 1e-3) return 1.25
  if (Math.abs(y - h) < 1e-3) return 1.12
  return 1
}

/* ── The state ─────────────────────────────────────────────────────────── */

export function buildBuilding(ctx) {
  const count = ctx.count
  const bead = beadOf(ctx)
  const L = layout(count, bead)
  const out = emptyState(count)

  let i = 0
  const emit = (x, y, z, size, red) => {
    if (i >= count) return
    put(out, i++, x, y, z, size, red)
  }

  // ── Walls: (panel, along, up), row-major from the hinge line up ────────
  for (const P of L.panels) {
    const ux = (P.b[0] - P.a[0]) / (P.len || 1)
    const uz = (P.b[1] - P.a[1]) / (P.len || 1)
    for (let k = 0; k < P.rows; k++) {
      const y = (P.h * k) / (P.rows - 1)
      const scale = datumScale(y, P.h)
      for (let c = 0; c < P.cols; c++) {
        // Row 0 runs in the plan's own direction, so the base band is the plan
        // line as drawn; every row after it doubles back.
        const j = k & 1 ? P.cols - 1 - c : c
        const u = (P.len * j) / (P.cols - 1)
        const open = isOpen(P.openings, u + P.along0, y)
        // An opening keeps its points and loses its size: the hole is made of
        // the same matter as the wall, so it can be filled again later without
        // anything being created.
        emit(
          P.a[0] + ux * u,
          GROUND_Y + y,
          P.a[1] + uz * u,
          open ? 0 : bead * scale,
          k === 0 && !open ? 1 : 0
        )
      }
    }
  }

  for (let n = 0; n < L.copeXZ.length; n += 2) {
    emit(L.copeXZ[n], L.copeY, L.copeXZ[n + 1], bead * 0.92, 0)
  }

  const plateBead = bead * 0.62
  for (let n = 0; n < L.upperXZ.length; n += 2) {
    emit(L.upperXZ[n], GROUND_Y + STOREY_H, L.upperXZ[n + 1], plateBead, 0)
  }
  for (let n = 0; n < L.groundXZ.length; n += 2) {
    emit(L.groundXZ[n], GROUND_Y, L.groundXZ[n + 1], plateBead, 0)
  }

  // Any slot the bands did not claim parks on the coping ring at zero size —
  // spread, never clumped, so a leftover point has somewhere sane to travel
  // from rather than a pile at the origin.
  const ring = L.copeXZ.length / 2 || 1
  while (i < count) {
    const n = (i % ring) * 2
    emit(L.copeXZ[n] || 0, L.copeY, L.copeXZ[n + 1] || 0, 0, 0)
  }

  return out
}

/* ── The line layer ────────────────────────────────────────────────────── */

function seg(out, x0, y0, z0, x1, y1, z1) {
  out.push(x0, y0, z0, x1, y1, z1)
}

/**
 * The building's own line drawing: the plan's double lines still on the ground,
 * the arrises, the storey datum, the parapet, and every opening's reveal.
 *
 * Deliberately only geometry that is true of the RAISED state — the movement
 * brings this layer up as the hinge completes, so the drawing arrives with the
 * building rather than being dragged through the rotation with it.
 */
export function buildBuildingLines(ctx) {
  const L = layout(ctx.count, beadOf(ctx))
  const out = []

  for (const P of L.panels) {
    const [ax, az] = P.a
    const [bx, bz] = P.b
    const top = GROUND_Y + P.h

    seg(out, ax, GROUND_Y, az, bx, GROUND_Y, bz) // the plan line — the hinge
    seg(out, ax, top, az, bx, top, bz)
    seg(out, ax, GROUND_Y, az, ax, top, az)
    // Closed loops get their far arris from the next panel's near one; an open
    // partition has no next panel, so it draws its own.
    if (P.kind === 'partition') seg(out, bx, GROUND_Y, bz, bx, top, bz)
    if (P.h > STOREY_H) {
      seg(out, ax, GROUND_Y + STOREY_H, az, bx, GROUND_Y + STOREY_H, bz)
    }

    const ux = (bx - ax) / (P.len || 1)
    const uz = (bz - az) / (P.len || 1)
    for (const o of P.openings) {
      const s0 = o.at - o.w / 2 - P.along0
      const s1 = o.at + o.w / 2 - P.along0
      if (s1 <= 0 || s0 >= P.len) continue
      const y0 = GROUND_Y + Math.max(0, o.sill)
      const y1 = GROUND_Y + Math.min(P.h, o.head)
      if (y1 <= y0) continue
      const p0x = ax + ux * Math.max(0, s0)
      const p0z = az + uz * Math.max(0, s0)
      const p1x = ax + ux * Math.min(P.len, s1)
      const p1z = az + uz * Math.min(P.len, s1)
      seg(out, p0x, y0, p0z, p1x, y0, p1z)
      seg(out, p1x, y0, p1z, p1x, y1, p1z)
      seg(out, p1x, y1, p1z, p0x, y1, p0z)
      seg(out, p0x, y1, p0z, p0x, y0, p0z)
    }
  }

  for (let i = 0; i < L.cope.length; i++) {
    const p = L.cope[i]
    const q = L.cope[(i + 1) % L.cope.length]
    seg(out, p[0], L.copeY, p[1], q[0], L.copeY, q[1])
  }

  // The void's edge is what makes the upper plate read as a plate with a hole
  // in it, rather than as a sparse patch of the ground plate seen from above.
  const vy = GROUND_Y + STOREY_H
  seg(out, VOID.x0, vy, VOID.z0, VOID.x1, vy, VOID.z0)
  seg(out, VOID.x1, vy, VOID.z0, VOID.x1, vy, VOID.z1)
  seg(out, VOID.x1, vy, VOID.z1, VOID.x0, vy, VOID.z1)
  seg(out, VOID.x0, vy, VOID.z1, VOID.x0, vy, VOID.z0)

  return new Float32Array(out)
}

/**
 * The hinge table: one entry per rigid panel, with the index range it owns and
 * the ground line it rotates about.
 *
 * The movement needs this — "rigid hinge on arcs" is a rotation of a contiguous
 * slice of the pool about a known axis, and without the ranges it would have to
 * re-derive them from the positions, which is both slower and a second source
 * of truth about where the walls are.
 */
export function buildingPanels(ctx) {
  const L = layout(ctx.count, beadOf(ctx))
  return L.panels.map((P) => ({
    id: P.id,
    kind: P.kind,
    face: P.face,
    start: P.start,
    count: P.count,
    cols: P.cols,
    rows: P.rows,
    height: P.h,
    hinge: [P.a[0], GROUND_Y, P.a[1], P.b[0], GROUND_Y, P.b[1]],
  }))
}

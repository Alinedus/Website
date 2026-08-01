/**
 * The space the anchors pass through on their way to becoming a word.
 *
 * This is deliberately NOT a city. ALINED is a thinking tool, so the fly-
 * through reads as an architect's working space: grounded massing studies,
 * free-floating orthogonal planes (the app's own placed-plane chrome), and
 * plate grids. Every line in here terminates on an anchor, and every anchor
 * is a particle — so when the alignment comes, the architecture doesn't
 * "disappear", it releases its points and they go and spell the word.
 *
 * Deterministic: seeded PRNG, so the composition is identical on every load
 * and can be art-directed by tuning the seed rather than by luck.
 */

const SEED = 0x5eed1a

/** mulberry32 — small, fast, good enough distribution for scatter. */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Corridor the camera travels; volumes are seeded around it. */
export const CORRIDOR = { near: -6, far: -124 }
const GROUND_Y = -17

/** Push the 12 edges of an axis-aligned box into `out`. */
function box(out, cx, cy, cz, w, h, d) {
  const x0 = cx - w / 2
  const x1 = cx + w / 2
  const y0 = cy - h / 2
  const y1 = cy + h / 2
  const z0 = cz - d / 2
  const z1 = cz + d / 2
  const c = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ]
  const E = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ]
  for (const [a, b] of E) out.push([c[a], c[b]])
}

/**
 * A free-standing rectangular plane with an interior grid — the app's placed
 * X/Y/Z plane, which is where an ALINED drawing actually happens.
 */
function plane(out, cx, cy, cz, w, h, axis, divs = 3) {
  // `axis` picks which world plane the rectangle lies in.
  const at = (u, v) => {
    if (axis === 'xy') return [cx + u, cy + v, cz]
    if (axis === 'yz') return [cx, cy + v, cz + u]
    return [cx + u, cy, cz + v] // 'xz'
  }
  const hw = w / 2
  const hh = h / 2
  const corners = [at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)]
  for (let i = 0; i < 4; i++) out.push([corners[i], corners[(i + 1) % 4]])

  for (let i = 1; i < divs; i++) {
    const u = -hw + (w * i) / divs
    const v = -hh + (h * i) / divs
    out.push([at(u, -hh), at(u, hh)])
    out.push([at(-hw, v), at(hw, v)])
  }
}

/**
 * @returns {{
 *   segments: Array<[number[], number[]]>,
 *   linePositions: Float32Array,
 *   lineOrder: Float32Array,   // 0..1 draw order, front of corridor first
 *   anchors: Float32Array,     // xyz sampled along every edge
 *   anchorCount: number,
 * }}
 */
export function buildArchitecture() {
  const rand = rng(SEED)
  const segs = []

  // ── Grounded massing ────────────────────────────────────────────────────
  for (let i = 0; i < 20; i++) {
    const z = CORRIDOR.near - 4 - rand() * (Math.abs(CORRIDOR.far) - 10)
    const side = rand() < 0.5 ? -1 : 1
    const x = side * (12 + rand() * 30)
    const w = 5 + rand() * 12
    const d = 5 + rand() * 12
    const h = 8 + rand() * 26
    box(segs, x, GROUND_Y + h / 2, z, w, h, d)

    // Occasionally set a smaller volume on top — a massing study reads as
    // stacked decisions, not extruded footprints.
    if (rand() < 0.45) {
      const w2 = w * (0.4 + rand() * 0.35)
      const d2 = d * (0.4 + rand() * 0.35)
      const h2 = 4 + rand() * 10
      box(segs, x, GROUND_Y + h + h2 / 2, z, w2, h2, d2)
    }
  }

  // ── Floating planes ─────────────────────────────────────────────────────
  const axes = ['xy', 'yz', 'xz']
  for (let i = 0; i < 11; i++) {
    const z = CORRIDOR.near - 8 - rand() * (Math.abs(CORRIDOR.far) - 16)
    const x = (rand() - 0.5) * 62
    const y = -6 + rand() * 26
    plane(
      segs,
      x, y, z,
      10 + rand() * 16,
      8 + rand() * 12,
      axes[(rand() * 3) | 0],
      2 + ((rand() * 3) | 0)
    )
  }

  // ── Ground plates ───────────────────────────────────────────────────────
  for (let i = 0; i < 3; i++) {
    const z = CORRIDOR.near - 20 - i * 38
    plane(segs, 0, GROUND_Y, z, 96, 34, 'xz', 6)
  }

  // ── Flatten to buffers ──────────────────────────────────────────────────
  const zs = segs.flatMap(([a, b]) => [a[2], b[2]])
  const zMax = Math.max(...zs)
  const zMin = Math.min(...zs)
  const zSpan = zMax - zMin || 1
  // Draw order runs with the camera: nearest the corridor entrance first, so
  // the space assembles ahead of the viewer rather than popping in whole.
  const orderOf = (z) => 1 - (z - zMin) / zSpan

  const linePositions = new Float32Array(segs.length * 6)
  const lineOrder = new Float32Array(segs.length * 2)
  const anchors = []

  segs.forEach(([a, b], s) => {
    linePositions.set(a, s * 6)
    linePositions.set(b, s * 6 + 3)
    const o = orderOf((a[2] + b[2]) / 2)
    lineOrder[s * 2] = o
    lineOrder[s * 2 + 1] = o

    // Sample anchors along the edge at roughly constant spacing, so long
    // spans aren't under-represented and short ones aren't clotted.
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const n = Math.max(2, Math.min(9, Math.round(len / 2.6)))
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1)
      anchors.push(
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t
      )
    }
  })

  return {
    segments: segs,
    linePositions,
    lineOrder,
    anchors: new Float32Array(anchors),
    anchorCount: anchors.length / 3,
  }
}

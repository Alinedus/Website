/**
 * The network — the city, admitting it was always a graph.
 *
 * ── The one rule this state exists to obey ────────────────────────────────
 *
 * NOTHING FLIES. The whole argument of this movement is that the city does not
 * rearrange itself into a diagram; it was already a diagram, and all that
 * changes is that we start seeing the connections. So every point's position
 * here is its CITY position: x and z EXACTLY as the city left them — bit for
 * bit, asserted by the harness — and only the height compressed and lifted off
 * the ground plane into a shallow slab straddling y = 0. That single axis is
 * the whole of the move. Mass stays still; only signal travels, and the
 * travelling is done by the edge layer's reveal, not by the points.
 *
 * The slab, rather than a flat plate, is what earns the movement its slow
 * orbit: a genuinely coplanar graph looks identical from every azimuth and the
 * orbit would read as a pointless rotation. A shallow slab with coherent relief
 * only resolves under parallax, so the arc is the thing that proves it is a
 * solid. It is SHALLOW (about a twelfth of the site half-extent) because the
 * orbit's closest approach passes well inside the site's own footprint — see
 * `network` in direction.js — and a deep slab would swallow the camera.
 *
 * ── Why only a fifth of the pool is a graph NODE ──────────────────────────
 *
 * The line budget is ~4,000 segments. A graph over all 5,200 points at that
 * budget has average degree 1.5, which cannot even be connected — a tree over
 * 5,200 nodes needs 5,199 edges, so it is necessarily a forest of a thousand
 * pieces, and the BFS flood this movement is built around would light a few per
 * cent of it and stop. Worse, it destroys hierarchy: every node looks like
 * every other node.
 *
 * So the pool splits into MASS and STRUCTURE. Every point keeps its city
 * position and stays visible; ~1,030 of them are promoted to nodes and carry
 * the graph (TARGET_NODES). That is the honest reading anyway — the network of
 * a city is not every brick, it is the armature the bricks hang off — and it
 * buys a real degree distribution, which is what makes hubs read.
 *
 * ── Where the hierarchy comes from ────────────────────────────────────────
 *
 * A uniform lattice yields uniform degree, and a k-NN graph over uniform degree
 * is a visually flat mesh. Worse, a k-NN graph under a FLAT degree cap converges
 * on the cap: every node fills to exactly it, and the distribution collapses to
 * a spike (measured — p50, p90 and the cap all landed on 5). So the structure is
 * introduced twice over, before the graph and inside its own budget:
 *
 *   · promotion to node follows the CITY'S OWN local density, so a crowded
 *     quarter is finely sampled and open ground coarsely — local density, and
 *     therefore link length and how many neighbours choose a node, genuinely
 *     varies;
 *   · each node's degree cap is GRADED by that same density (its k-th
 *     neighbour distance, ranked through a histogram), so a core node is
 *     allowed to become busy and a fringe node is not;
 *   · the nodes are clustered — a few dozen seeds — and each cluster elects a
 *     hub, which takes spokes into its own cluster and arterials out to other
 *     hubs, at a much higher cap.
 *
 * Measured, that gives a degree median of 4, a 90th percentile of 6 and hubs at
 * 11-13 — a long tail rather than a spike — and node diameter follows it.
 *
 * The arterials are admitted FIRST, before any local edge, because the degree
 * cap is the only thing trimming the edge list and a length-ordered greedy pass
 * would spend the whole budget on short links and then have no room left for
 * the long-range structure that makes the graph read as one organism. There is
 * deliberately NO distance cutoff anywhere in this file, for the same reason.
 *
 * ── Determinism ───────────────────────────────────────────────────────────
 *
 * No ctx.rng is consumed. Every stochastic-looking value is a pure hash of its
 * own coordinates, exactly as building.js does it, so this module returns
 * bit-identical geometry however many times it is called and in whatever order
 * relative to its sibling states — which matters here because the lines export
 * is called separately from the state export, and a shared RNG cursor would
 * make the film's composition depend on the order the integrator happens to
 * call them in.
 *
 * ── What the integrator must wire ─────────────────────────────────────────
 *
 * `ctx.city` — the already-built city state (`{pos}` or a bare
 * Float32Array(count*4)) — is the input this state wants, since "mass stays
 * still" is only literally true if it reads the same positions the previous
 * state wrote. States are built in timeline order and the city precedes the
 * network, so passing it through costs one line. Without it this module
 * synthesises a city-consistent field (quantised subdivision, Hilbert-ordered,
 * downtown-dense) so the state is never broken — but the transition in will be
 * a settle rather than a stillness.
 *
 * ── A note on the arithmetic ──────────────────────────────────────────────
 *
 * Squared distances are compared throughout and `Math.hypot` and `**` are
 * avoided in the hot loops. That is correctness-neutral — squaring is monotone,
 * so nearest-neighbour picks, the hub spanning tree and the length ordering are
 * all identical.
 *
 * More generally, this state is built ONCE, at boot, on the main thread, which
 * means it never leaves V8's interpreter tier: it is compiled lazily and every
 * loop in it runs exactly once. So the thing that matters is total INNER
 * ITERATIONS, and several decisions here look over-engineered until that is
 * taken into account — clustering over the nodes rather than the pool, seeding
 * by stratification rather than farthest-point, an analytic radius that lands
 * the thinning in one pass, a flat integer set rather than a Map. Measured
 * against building.js (the comparable state) on the same machine, this took the
 * module from 4.6x its cold build to 3.0x, and from 18 ms warm to 6 ms.
 *
 * Two things that LOOK like wins are not, and were tried and reverted: a bucket
 * grid over the cluster seeds (60% slower than scanning all 32 — the ring
 * bookkeeping and object property loads cost more than the comparisons they
 * replace at this k), and hoisting object fields into locals outside the
 * innermost loops (no measurable effect). Measure before changing any of it.
 */

import { emptyState, put } from './index.js'

/* ── Tunables ───────────────────────────────────────────────────────────── */

/**
 * Site half-extent, used ONLY when no city field is supplied.
 *
 * Matched to city.js's own SITE_HALF, and it has to be: `context.js` measures
 * the orbit's framing (`cityHalf`) off the CITY state whether or not this one
 * was wired to it, so a fallback at a different scale would be correctly built
 * and then wrongly framed.
 */
const SITE_HALF_FALLBACK = 300

/** Slab half-thickness, as a fraction of the site half-extent. Shallow: the
 *  orbit's closest approach is at 0.28 of that half-extent. */
const SLAB_FRAC = 0.085
/** How the slab's thickness is spent: compressed tower heights vs. relief. */
const SLAB_TOWERS = 0.5
const SLAB_RELIEF = 0.5

const CLUSTERS = 32
/**
 * How much of the pool carries the graph. This is the ONE knob that trades the
 * film's boot budget against the graph's richness: cost is roughly linear in it
 * (measured ~4 ms of cold build per 400 nodes) and so is the edge count. At
 * 1,100 the graph settles at ~2,200 segments, leaving 45% of MAX_SEGMENTS in
 * hand for anyone who wants a denser armature and will pay for it.
 */
const TARGET_NODES = 1100
const K_NEAR = 5
const HUB_SPOKES = 8

/** Segment budget. The shared line layer's ceiling is ~6,000. */
const MAX_SEGMENTS = 4000
/** Ordinary nodes are capped between these by local density; hubs get their
 *  own, far higher, ceiling. The SPREAD is the point — a single flat cap makes
 *  every node identical. */
const DEG_CAP_MIN = 2
const DEG_CAP_MAX = 7
const HUB_DEG_CAP = 18

/* ── Pure hash noise ────────────────────────────────────────────────────── */

/** Deterministic [0,1) from two integers. */
function hash2(i, j) {
  let h = Math.imul(i ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul(j + 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 15
  h = Math.imul(h, 0x2545f491)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

/** Deterministic [0,1) from one integer and a salt. */
function hash1(i, salt) {
  return hash2(i, salt * 0x9e37 + 17)
}

/** Smoothed lattice noise in [0,1). Coherent, so neighbouring points get
 *  neighbouring values — white noise here would fuzz the slab instead of
 *  giving it relief. */
function vnoise(x, z) {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const fx = x - xi
  const fz = z - zi
  const sx = fx * fx * (3 - 2 * fx)
  const sz = fz * fz * (3 - 2 * fz)
  const a = hash2(xi, zi)
  const b = hash2(xi + 1, zi)
  const c = hash2(xi, zi + 1)
  const d = hash2(xi + 1, zi + 1)
  const top = a + (b - a) * sx
  const bot = c + (d - c) * sx
  return top + (bot - top) * sz
}

/* ── Spatial hash ───────────────────────────────────────────────────────── */

/**
 * A flat counting-sort bucket grid over XZ.
 *
 * XZ rather than XYZ deliberately: the slab is an order of magnitude thinner
 * than it is wide, so a third axis buys nothing, and a tower's stacked points
 * must share a bucket for the promotion pass to thin them to one node.
 */
function buildGrid(xs, zs, ids, cell) {
  const m = ids.length
  if (m === 0) return null
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (let n = 0; n < m; n++) {
    const x = xs[ids[n]]
    const z = zs[ids[n]]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  const nx = Math.max(1, Math.floor((maxX - minX) / cell) + 1)
  const nz = Math.max(1, Math.floor((maxZ - minZ) / cell) + 1)
  const nc = nx * nz
  const starts = new Int32Array(nc + 1)
  const cellOf = new Int32Array(m)
  for (let n = 0; n < m; n++) {
    const ix = Math.min(nx - 1, Math.max(0, Math.floor((xs[ids[n]] - minX) / cell)))
    const iz = Math.min(nz - 1, Math.max(0, Math.floor((zs[ids[n]] - minZ) / cell)))
    const c = iz * nx + ix
    cellOf[n] = c
    starts[c + 1]++
  }
  for (let c = 0; c < nc; c++) starts[c + 1] += starts[c]
  const items = new Int32Array(m)
  const cursor = starts.slice(0, nc)
  for (let n = 0; n < m; n++) items[cursor[cellOf[n]]++] = n
  return { minX, minZ, cell, nx, nz, starts, items }
}

/** Clamped cell coordinate of a world x / z. */
const gx = (g, x) => Math.min(g.nx - 1, Math.max(0, Math.floor((x - g.minX) / g.cell)))
const gz = (g, z) => Math.min(g.nz - 1, Math.max(0, Math.floor((z - g.minZ) / g.cell)))

/* ── The city field ─────────────────────────────────────────────────────── */

/**
 * Accept whatever shape the integrator hands over: the built state object, a
 * bare xyzw buffer, or nothing.
 */
function suppliedCity(ctx) {
  const src = ctx.city || ctx.cityState || ctx.cityPos
  const pos = src && (src.pos || src)
  if (!pos || typeof pos.length !== 'number') return null
  if (pos.length < ctx.count * 4) return null
  return pos
}

/** Canonical Hilbert xy→d. `n` must be a power of two. */
function hilbert(n, x, y) {
  let d = 0
  let ax = x
  let ay = y
  for (let s = n >> 1; s > 0; s >>= 1) {
    const rx = (ax & s) > 0 ? 1 : 0
    const ry = (ay & s) > 0 ? 1 : 0
    d += s * s * ((3 * rx) ^ ry)
    if (ry === 0) {
      if (rx === 1) {
        ax = n - 1 - ax
        ay = n - 1 - ay
      }
      const t = ax
      ax = ay
      ay = t
    }
  }
  return d
}

/**
 * Quantised subdivision of a square site, used when no city is supplied.
 *
 * A recursive quad-split whose split probability rises toward the middle, so
 * the plan reads as a downtown surrounded by coarser fabric — which is also
 * what gives the graph its density gradient and therefore its hubs.
 *
 * Cells are walked along a HILBERT curve rather than row by row. Index identity
 * is the film's load-bearing invariant: consecutive pool indices must be
 * spatial neighbours or every morph into and out of this state tears. A
 * space-filling curve gives that for cells of mixed sizes, where the serpentine
 * walks the other states use would not.
 */
function synthCity(count, half) {
  const cells = []
  const MAX_DEPTH = 5

  const split = (cx, cz, size, depth) => {
    // Centrality in [0,1]: 1 at the site's middle, 0 at its corner.
    const central = Math.max(0, 1 - Math.sqrt(cx * cx + cz * cz) / (half * 1.42))
    const p = (0.34 + central * 0.62) * (depth < 2 ? 1.6 : 1)
    if (depth < MAX_DEPTH && hash2((cx * 7) | 0, ((cz * 7) | 0) + depth * 977) < p) {
      const q = size / 4
      split(cx - q, cz - q, size / 2, depth + 1)
      split(cx + q, cz - q, size / 2, depth + 1)
      split(cx - q, cz + q, size / 2, depth + 1)
      split(cx + q, cz + q, size / 2, depth + 1)
      return
    }
    cells.push({ cx, cz, size, central, h: 0 })
  }
  split(0, 0, half * 2, 0)

  // Hilbert order over a 64x64 lattice covering the site.
  const N = 64
  for (const c of cells) {
    const ix = Math.min(N - 1, Math.max(0, Math.floor(((c.cx + half) / (half * 2)) * N)))
    const iz = Math.min(N - 1, Math.max(0, Math.floor(((c.cz + half) / (half * 2)) * N)))
    c.h = hilbert(N, ix, iz)
  }
  cells.sort((a, b) => a.h - b.h)

  // Points per cell: area-weighted, biased toward the centre so downtown is
  // denser in mass as well as finer in grain. Largest-remainder, so the total
  // is exactly `count` and no slot is left unassigned.
  const w = cells.map((c) => c.size * c.size * (0.45 + c.central * 1.3))
  const wSum = w.reduce((a, b) => a + b, 0) || 1
  const take = new Int32Array(cells.length)
  let assigned = 0
  const rem = []
  for (let i = 0; i < cells.length; i++) {
    const exact = (w[i] / wSum) * count
    take[i] = Math.floor(exact)
    assigned += take[i]
    rem.push([exact - take[i], i])
  }
  rem.sort((a, b) => b[0] - a[0] || a[1] - b[1])
  for (let k = 0; assigned < count; k++, assigned++) take[rem[k % rem.length][1]]++

  const px = new Float32Array(count)
  const py = new Float32Array(count)
  const pz = new Float32Array(count)
  let i = 0
  for (let ci = 0; ci < cells.length && i < count; ci++) {
    const c = cells[ci]
    const n = take[ci]
    if (n <= 0) continue
    const g = Math.max(1, Math.ceil(Math.sqrt(n)))
    const step = c.size / g
    // Serpentine inside the cell, for the same neighbour-preserving reason the
    // Hilbert curve orders the cells.
    for (let k = 0; k < n && i < count; k++) {
      const row = Math.floor(k / g)
      const col = row & 1 ? g - 1 - (k % g) : k % g
      const jx = (hash2(ci * 31 + col, row) - 0.5) * step * 0.55
      const jz = (hash2(col, ci * 17 + row) - 0.5) * step * 0.55
      // Height: downtown is tall, the fabric is low, and a fifth of the plots
      // stay at grade so the slab's underside is a real surface, not a haze.
      const tall = c.central * c.central
      const h = hash2(i, 0x51ed) < 0.2 ? 0 : half * 0.3 * tall * (0.18 + 0.82 * hash1(i, 3))
      px[i] = c.cx - c.size / 2 + (col + 0.5) * step + jx
      py[i] = h
      pz[i] = c.cz - c.size / 2 + (row + 0.5) * step + jz
      i++
    }
  }
  // Only reachable on a degenerate subdivision; park the remainder on the last
  // emitted point rather than at the origin, where it would read as a clot.
  for (; i < count; i++) {
    px[i] = i > 0 ? px[i - 1] : 0
    py[i] = i > 0 ? py[i - 1] : 0
    pz[i] = i > 0 ? pz[i - 1] : 0
  }
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (let j = 0; j < count; j++) {
    if (px[j] < minX) minX = px[j]
    if (px[j] > maxX) maxX = px[j]
    if (pz[j] < minZ) minZ = pz[j]
    if (pz[j] > maxZ) maxZ = pz[j]
  }
  return { px, py, pz, minX, maxX, minZ, maxZ }
}

/** The city's positions, from the integrator if wired, else synthesised. */
function cityField(ctx) {
  const count = ctx.count
  const pos = suppliedCity(ctx)
  if (!pos) {
    const f = synthCity(count, SITE_HALF_FALLBACK)
    return {
      px: f.px,
      py: f.py,
      pz: f.pz,
      half: SITE_HALF_FALLBACK,
      minX: f.minX,
      maxX: f.maxX,
      minZ: f.minZ,
      maxZ: f.maxZ,
    }
  }
  const px = new Float32Array(count)
  const py = new Float32Array(count)
  const pz = new Float32Array(count)
  let half = 0
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (let i = 0; i < count; i++) {
    const x = pos[i * 4]
    const y = pos[i * 4 + 1]
    const z = pos[i * 4 + 2]
    // `v - v === 0` rejects both NaN and the infinities in one arithmetic test,
    // where three Number.isFinite calls per point are three builtin calls per
    // point — 15,000 of them at boot.
    px[i] = x - x === 0 ? x : 0
    py[i] = y - y === 0 ? y : 0
    pz[i] = z - z === 0 ? z : 0
    // Extent is measured off the SIZED points only, matching how context.js
    // derives `cityHalf` for the orbit — a zero-size point parked off-site must
    // not stretch the slab it is never seen in.
    if (px[i] < minX) minX = px[i]
    if (px[i] > maxX) maxX = px[i]
    if (pz[i] < minZ) minZ = pz[i]
    if (pz[i] > maxZ) maxZ = pz[i]
    if (pos[i * 4 + 3] > 0) {
      const ax = Math.abs(px[i])
      const az = Math.abs(pz[i])
      if (ax > half) half = ax
      if (az > half) half = az
    }
  }
  return { px, py, pz, half: half > 1 ? half : SITE_HALF_FALLBACK, minX, maxX, minZ, maxZ }
}

/* ── Clustering ─────────────────────────────────────────────────────────── */

/**
 * A few dozen clusters over the nodes: stratified seeds, then Lloyd.
 *
 * Clustering is only ever used to elect hubs and to group a hub's spokes, both
 * of which are questions about NODES — and an assignment costs `points x
 * seeds`, so doing it over all 5,200 points cost more than the rest of this
 * module put together (measured against building.js, the comparable state, at
 * four times its entire build).
 *
 * The seeds are taken at even intervals along the node array rather than by
 * farthest-point sampling. That is not a shortcut, it is the film's own
 * invariant cashed in: a point's index is its identity and every state assigns
 * targets so that consecutive indices are spatial neighbours, so the node array
 * IS a space-filling walk of the city and evenly spaced indices are evenly
 * spread positions. It costs nothing where farthest-point sampling costs a full
 * assignment pass, and it is the standard equal-mass initialiser for k-means on
 * spatially sorted data.
 *
 * One Lloyd relaxation then drags each seed into the mass it actually owns, so
 * a dense quarter ends up with a large, highly connected cluster and a sparse
 * edge with a small one. Only one: run to convergence and the tessellation
 * regularises again, which would hand every cluster the same size and put us
 * back at the uniform degree this whole pass exists to avoid.
 *
 * `idx` maps cluster-local index -> pool index; every array returned is indexed
 * cluster-locally.
 */
function cluster(px, pz, idx, k) {
  const count = idx.length

  // Gather the subset into dense arrays once: the passes below are tight
  // numeric loops, and an extra indirection through `idx` inside them is paid
  // tens of thousands of times.
  const qx = new Float64Array(count)
  const qz = new Float64Array(count)
  for (let i = 0; i < count; i++) {
    qx[i] = px[idx[i]]
    qz[i] = pz[idx[i]]
  }

  const sx = new Float64Array(k)
  const sz = new Float64Array(k)
  for (let s = 0; s < k; s++) {
    const at = Math.min(count - 1, Math.floor(((s + 0.5) * count) / k))
    sx[s] = qx[at]
    sz[s] = qz[at]
  }

  const accX = new Float64Array(k)
  const accZ = new Float64Array(k)
  const n = new Int32Array(k)
  for (let i = 0; i < count; i++) {
    const x = qx[i]
    const z = qz[i]
    let bd = Infinity
    let bs = 0
    for (let s = 0; s < k; s++) {
      const dx = x - sx[s]
      const dz = z - sz[s]
      const d = dx * dx + dz * dz
      if (d < bd) {
        bd = d
        bs = s
      }
    }
    accX[bs] += x
    accZ[bs] += z
    n[bs]++
  }
  for (let s = 0; s < k; s++) {
    if (n[s] > 0) {
      sx[s] = accX[s] / n[s]
      sz[s] = accZ[s] / n[s]
    }
  }

  // The final assignment, with the per-cluster mean member distance fused into
  // it. That distance is a length scale callers can express thresholds in, so
  // it adapts to a big loose cluster and a tight dense one without a magic
  // world constant.
  const of = new Int32Array(count)
  const reach = new Float64Array(k)
  const cnt = new Int32Array(k)
  for (let i = 0; i < count; i++) {
    const x = qx[i]
    const z = qz[i]
    let bd = Infinity
    let bs = 0
    for (let s = 0; s < k; s++) {
      const dx = x - sx[s]
      const dz = z - sz[s]
      const d = dx * dx + dz * dz
      if (d < bd) {
        bd = d
        bs = s
      }
    }
    of[i] = bs
    reach[bs] += Math.sqrt(bd)
    cnt[bs]++
  }
  for (let s = 0; s < k; s++) reach[s] = cnt[s] > 0 ? Math.max(1e-3, reach[s] / cnt[s]) : 1

  return { of, sx, sz, reach, k }
}

/* ── Promotion to graph node ────────────────────────────────────────────── */

/**
 * Thin the pool to nodes by variable-radius Poisson rejection.
 *
 * The radius follows the CITY'S OWN LOCAL DENSITY, read off a coarse grid: a
 * crowded quarter is finely sampled and open ground coarsely. That gradient IS
 * the degree hierarchy, since a k-NN graph over a denser region produces
 * shorter links and a node more of its neighbours choose. A fixed radius would
 * produce the uniform lattice the critique warned about.
 *
 * The exponent is sub-linear (node density goes as city density^0.6), so the
 * downtown is genuinely busier without the fringe thinning to nothing — and the
 * clamp keeps either extreme from running away on a city with an unusual
 * distribution.
 *
 * Reading density from a grid rather than from distance-to-a-cluster-seed is
 * what allows the clustering to run over the nodes alone: this is O(count)
 * where that was O(count x seeds), and it also answers the better question,
 * since it responds to where the city actually put its mass.
 *
 * Walked in index order, which is a spatial walk in every state feeding this
 * one, so the survivors are spread rather than front-loaded.
 */
const DENSITY_POW = -0.3
const DENSITY_CLAMP_LO = 0.45
const DENSITY_CLAMP_HI = 2.2
/** Points held per r^2 by this sweep. Measured, not derived — see promote(). */
const PACK_C = 1.32

function promote(px, pz, count, target, box) {
  const minX = box.minX
  const minZ = box.minZ
  const spanX = Math.max(1e-3, box.maxX - minX)
  const spanZ = Math.max(1e-3, box.maxZ - minZ)

  // ── Local density, on a coarse grid ────────────────────────────────────
  const G = 48
  const dcx = spanX / G
  const dcz = spanZ / G
  const bin = new Int32Array(G * G)
  const binOf = new Int32Array(count)
  for (let i = 0; i < count; i++) {
    const bx = Math.min(G - 1, ((px[i] - minX) / dcx) | 0)
    const bz = Math.min(G - 1, ((pz[i] - minZ) / dcz) | 0)
    const b = bz * G + bx
    binOf[i] = b
    bin[b]++
  }
  // The reference is the mean over OCCUPIED cells: an empty half of the site
  // must not drag the reference down and make the whole city read as dense.
  let occupied = 0
  for (let b = 0; b < G * G; b++) if (bin[b] > 0) occupied++
  const refCount = count / Math.max(1, occupied)

  // The radius multiplier is a property of the BIN, not of the point, so it is
  // computed once per bin and looked up. That also makes the first-guess
  // integral below exact instead of a guess about the average.
  const tBin = new Float64Array(G * G)
  for (let b = 0; b < G * G; b++) {
    if (bin[b] === 0) continue
    const rel = bin[b] / refCount
    tBin[b] = Math.min(DENSITY_CLAMP_HI, Math.max(DENSITY_CLAMP_LO, Math.pow(rel, DENSITY_POW)))
  }

  // Analytic first guess. This thinning holds about one point per PACK_C * r^2,
  // so over a field whose radius varies as base * t(x),
  //
  //     N  ~=  (1 / PACK_C base^2) * INTEGRAL dA / t(x)^2
  //
  // and that integral is a sum over the occupied bins, which are already in
  // hand. Solving it for `base` lands the first pass close enough to skip the
  // refinement entirely. Two things about it were each worth a full extra pass
  // over the pool: assuming a FLAT field (the obvious sqrt(area / N)) is 39%
  // out on a city with a downtown, and PACK_C is 1.32 rather than the 0.7 of a
  // maximal Poisson disc, because this is a single sequential sweep with no
  // retries and so packs measurably looser than a maximal one.
  const cellArea = dcx * dcz
  let integral = 0
  for (let b = 0; b < G * G; b++) {
    if (tBin[b] > 0) integral += cellArea / (tBin[b] * tBin[b])
  }
  // The middle term below is a floor for degenerate input. A city with no AREA
  // — every point on one line, or all on one spot — makes the integral vanish,
  // the radius collapse and the WHOLE pool get promoted: a boot-time cost spike
  // on exactly the input least able to afford it. One-dimensionally the spacing
  // that yields `target` points is span/target, and for any real city that
  // value is an order of magnitude below the area term and never binds.
  const spread = Math.max(spanX, spanZ)
  const base = Math.max(
    1e-4,
    spread / Math.max(1, target),
    Math.sqrt(integral / (PACK_C * Math.max(1, target)))
  )
  const keep = new Int32Array(count)

  // A flat head/next linked-list grid, rebuilt per pass. The obvious Map keyed
  // on cell was measured at six times the cost for the same answer.
  const pass = (scale) => {
    const cell = Math.max(1e-4, base * scale * DENSITY_CLAMP_HI)
    const nx = Math.max(1, Math.floor(spanX / cell) + 1)
    const nz = Math.max(1, Math.floor(spanZ / cell) + 1)
    const head = new Int32Array(nx * nz).fill(-1)
    const next = new Int32Array(count)
    let m = 0
    for (let i = 0; i < count; i++) {
      const x = px[i]
      const z = pz[i]
      const r = base * scale * tBin[binOf[i]]
      const r2 = r * r
      const ix = Math.min(nx - 1, Math.max(0, ((x - minX) / cell) | 0))
      const iz = Math.min(nz - 1, Math.max(0, ((z - minZ) / cell) | 0))
      let ok = true
      for (let b = iz - 1; b <= iz + 1 && ok; b++) {
        if (b < 0 || b >= nz) continue
        for (let a = ix - 1; a <= ix + 1 && ok; a++) {
          if (a < 0 || a >= nx) continue
          for (let j = head[b * nx + a]; j !== -1; j = next[j]) {
            const dx = x - px[j]
            const dz = z - pz[j]
            if (dx * dx + dz * dz < r2) {
              ok = false
              break
            }
          }
        }
      }
      if (!ok) continue
      const c = iz * nx + ix
      next[i] = head[c]
      head[c] = i
      keep[m++] = i
    }
    return m
  }

  // Converge the radius onto the node target. A thinned point set's count goes
  // as 1/r^2, so scaling the radius by sqrt(got/target) lands within a few per
  // cent in one step. Nothing downstream depends on an exact node count, so the
  // loop stops at 6% rather than chasing the last few.
  let scale = 1
  let m = pass(scale)
  let bestM = m
  let bestNodes = keep.slice(0, m)
  for (let it = 0; it < 2 && Math.abs(m - target) > target * 0.06; it++) {
    scale = Math.min(4, Math.max(0.25, scale * Math.sqrt(Math.max(m, 1) / target)))
    m = pass(scale)
    if (Math.abs(m - target) < Math.abs(bestM - target)) {
      bestM = m
      bestNodes = keep.slice(0, m)
    }
  }
  return bestNodes
}

/* ── An integer set, flat ───────────────────────────────────────────────── */

/**
 * Open-addressed set of non-negative integers, returned as its raw table so the
 * one caller can inline the probe rather than pay a call per test.
 *
 * A plain `Set` does the same job and was measured at several milliseconds of
 * the cold boot budget for the thousands of membership tests the candidate pass
 * makes — enough to matter when nine states are built on the main thread before
 * the first frame. Keys are `a * nodeCount + b`, which stays inside int32 for
 * any node count this module can produce.
 */
function makeIntSet(capacity) {
  let size = 8
  while (size < capacity * 2) size <<= 1
  return { keys: new Int32Array(size).fill(-1), mask: size - 1 }
}

/* ── Graph construction ─────────────────────────────────────────────────── */

/**
 * k nearest neighbours of node `n` by squared 3D distance, via the bucket grid.
 * Returns the count found; `dOut` holds squared distances, ascending.
 */
function kNearest(g, xs, ys, zs, nodes, n, k, idxOut, dOut) {
  // The grid's fields are lifted into locals. This function is the module's
  // innermost loop and runs entirely in V8's interpreter tier at boot, where a
  // property load on a plain object costs many times a local read — hoisting
  // them was worth more here than any change to the algorithm.
  const gnx = g.nx
  const gnz = g.nz
  const gcell = g.cell
  const starts = g.starts
  const items = g.items

  const self = nodes[n]
  const x = xs[self]
  const y = ys[self]
  const z = zs[self]
  const ix = gx(g, x)
  const iz = gz(g, z)
  let found = 0

  for (let R = 1; R <= 6; R++) {
    found = 0
    const x0 = Math.max(0, ix - R)
    const x1 = Math.min(gnx - 1, ix + R)
    const z0 = Math.max(0, iz - R)
    const z1 = Math.min(gnz - 1, iz + R)
    for (let jz = z0; jz <= z1; jz++) {
      const row = jz * gnx
      for (let jx = x0; jx <= x1; jx++) {
        const c = row + jx
        for (let s = starts[c]; s < starts[c + 1]; s++) {
          const m = items[s]
          if (m === n) continue
          const o = nodes[m]
          const dx = xs[o] - x
          const dy = ys[o] - y
          const dz = zs[o] - z
          const d = dx * dx + dy * dy + dz * dz
          // Insertion sort into a k-slot list: k is 6, so this beats any heap.
          if (found < k) {
            let p = found++
            while (p > 0 && dOut[p - 1] > d) {
              dOut[p] = dOut[p - 1]
              idxOut[p] = idxOut[p - 1]
              p--
            }
            dOut[p] = d
            idxOut[p] = m
          } else if (d < dOut[k - 1]) {
            let p = k - 1
            while (p > 0 && dOut[p - 1] > d) {
              dOut[p] = dOut[p - 1]
              idxOut[p] = idxOut[p - 1]
              p--
            }
            dOut[p] = d
            idxOut[p] = m
          }
        }
      }
    }
    // The block is exhaustive out to R cells; stop as soon as the k-th
    // candidate is provably inside that disc.
    const reach = R * gcell
    if (found >= k && dOut[found - 1] <= reach * reach) break
    if (x0 === 0 && z0 === 0 && x1 === gnx - 1 && z1 === gnz - 1) break
  }
  return found
}

/** Union-find with path halving. */
function makeDSU(n) {
  const p = new Int32Array(n)
  for (let i = 0; i < n; i++) p[i] = i
  const find = (a) => {
    let x = a
    while (p[x] !== x) {
      p[x] = p[p[x]]
      x = p[x]
    }
    return x
  }
  return {
    find,
    union(a, b) {
      const ra = find(a)
      const rb = find(b)
      if (ra === rb) return false
      p[ra] = rb
      return true
    },
  }
}

/* ── Layout ─────────────────────────────────────────────────────────────── */

/**
 * Built once and shared by the state, the lines and the graph descriptor, so
 * the three can never disagree about where a node is or which edges exist.
 */
let cached = null

function layout(ctx) {
  const count = ctx.count
  const bead = beadOf(ctx)
  const cityKey = suppliedCity(ctx)
  if (cached && cached.count === count && cached.bead === bead && cached.cityKey === cityKey) {
    return cached
  }

  const city = cityField(ctx)
  const half = city.half
  const slab = half * SLAB_FRAC

  // ── The settle ─────────────────────────────────────────────────────────
  // XZ is NOT touched. Every point keeps the exact x and z the city gave it,
  // which is the literal reading of "nothing flies" and, not coincidentally,
  // free. (An earlier version pulled each point 3% toward its cluster's seed
  // for cohesion. It was imperceptible by construction — 3% was chosen so no
  // single point would show it — and it was the reason cluster membership had
  // to be computed for all 5,200 points, which cost more than every other part
  // of this module combined. Deleting it made the state both truer and fast.)
  //
  // Y is the compression, and the only motion in the state. The city's heights
  // are a heavily skewed distribution — most of a city is at grade — so a
  // linear remap piles four points in five onto the slab's floor and leaves the
  // rest of it empty, which under an orbit reads as the flat plate the slab
  // exists to avoid. A square root spreads the low fabric through the lower
  // half, coherent relief supplies structure where the heights say nothing, and
  // the sum is rescaled to fill the slab exactly. Rescaling rather than
  // trusting the terms also makes the slab depth a guarantee, whatever units
  // the city turns out to be authored in.
  const px = city.px
  const pz = city.pz
  const py = city.py
  let yMax = 0
  for (let i = 0; i < count; i++) if (py[i] > yMax) yMax = py[i]
  const yScale = yMax > 1e-4 ? 1 / yMax : 0
  // Frequency is relative to the site, so the relief reads the same whatever
  // extent the city turns out to have. One octave: the fine grain in the slab
  // is already supplied by the per-building height term this is summed with.
  const rFreq = 1 / Math.max(1, half * 0.24)
  let vMin = Infinity
  let vMax = -Infinity
  for (let i = 0; i < count; i++) {
    const v =
      Math.sqrt(Math.min(1, Math.max(0, py[i] * yScale))) * SLAB_TOWERS +
      vnoise(px[i] * rFreq, pz[i] * rFreq) * SLAB_RELIEF
    py[i] = v
    if (v < vMin) vMin = v
    if (v > vMax) vMax = v
  }
  const vSpan = vMax - vMin
  const vk = vSpan > 1e-6 ? (2 * slab) / vSpan : 0
  for (let i = 0; i < count; i++) py[i] = (py[i] - vMin) * vk - slab

  // ── Nodes ──────────────────────────────────────────────────────────────
  const nodes = promote(px, pz, count, Math.min(TARGET_NODES, count), city)
  const N = nodes.length
  const nodeOfPool = new Int32Array(count).fill(-1)
  for (let n = 0; n < N; n++) nodeOfPool[nodes[n]] = n

  // Clustering runs over the NODES — see cluster(). Everything it feeds (hub
  // election, spokes) is a question about nodes.
  const cl = cluster(px, pz, nodes, Math.min(CLUSTERS, Math.max(1, N)))
  const clOf = cl.of
  const clSx = cl.sx
  const clSz = cl.sz

  // One cell per ~4 nodes keeps the 3x3 neighbourhood at ~36 candidates, which
  // is enough for the 6-NN search to terminate at R = 1 almost always.
  const nodeCell = Math.max(1e-3, (half * 2) / Math.max(1, Math.sqrt(N / 4)))
  const grid = buildGrid(px, pz, nodes, nodeCell)

  // ── Hubs ───────────────────────────────────────────────────────────────
  // One per cluster: the node nearest its seed. Elected from POSITION, not from
  // degree, so the hierarchy is decided before the graph rather than read out
  // of it — otherwise the hub is wherever the k-NN happened to clot.
  const members = Array.from({ length: cl.k }, () => [])
  for (let n = 0; n < N; n++) members[clOf[n]].push(n)
  const hubs = []
  const isHub = new Uint8Array(N)
  for (let s = 0; s < cl.k; s++) {
    let bn = -1
    let bd = Infinity
    for (const n of members[s]) {
      const i = nodes[n]
      const dx = px[i] - clSx[s]
      const dz = pz[i] - clSz[s]
      const d = dx * dx + dz * dz
      if (d < bd) {
        bd = d
        bn = n
      }
    }
    if (bn >= 0) {
      hubs.push(bn)
      isHub[bn] = 1
    }
  }

  // ── Candidate edges, in the order they may claim degree ────────────────
  // Flat typed arrays rather than objects: this is the film's largest inner
  // loop and one object per candidate was measurably the most expensive thing
  // in the module. `cd` holds SQUARED length, which orders identically.
  const capC = N * K_NEAR + hubs.length * (HUB_SPOKES + 3) + 64
  const ca = new Int32Array(capC)
  const cb = new Int32Array(capC)
  const cd = new Float64Array(capC)
  let nc = 0
  const seen = makeIntSet(capC)

  const sqDist = (a, b) => {
    const ia = nodes[a]
    const ib = nodes[b]
    const dx = px[ia] - px[ib]
    const dy = py[ia] - py[ib]
    const dz = pz[ia] - pz[ib]
    return dx * dx + dy * dy + dz * dz
  }
  // Both the distance and the duplicate test are inlined rather than called:
  // this runs thousands of times at boot, in the interpreter, where a call is
  // dear and these were three of them.
  const seenKeys = seen.keys
  const seenMask = seen.mask
  const pushCand = (a, b) => {
    if (a === b || nc >= capC) return
    const key = a < b ? a * N + b : b * N + a
    let h = (Math.imul(key, 0x9e3779b1) >>> 0) & seenMask
    for (;;) {
      const k = seenKeys[h]
      if (k === -1) {
        seenKeys[h] = key
        break
      }
      if (k === key) return
      h = (h + 1) & seenMask
    }
    const ia = nodes[a]
    const ib = nodes[b]
    const dx = px[ia] - px[ib]
    const dy = py[ia] - py[ib]
    const dz = pz[ia] - pz[ib]
    ca[nc] = a
    cb[nc] = b
    cd[nc] = dx * dx + dy * dy + dz * dz
    nc++
  }

  // Arterials: a spanning tree over the hubs, plus each hub's two nearest
  // peers. Few edges, enormous structural value — these are the spans that make
  // a field of clusters read as one city, and the reason nothing here uses a
  // distance cutoff.
  const H = hubs.length
  if (H > 1) {
    const inTree = new Uint8Array(H)
    const bestD = new Float64Array(H).fill(Infinity)
    const bestFrom = new Int32Array(H)
    const hd = (a, b) => sqDist(hubs[a], hubs[b])
    inTree[0] = 1
    for (let h = 1; h < H; h++) bestD[h] = hd(0, h)
    for (let step = 1; step < H; step++) {
      let pick = -1
      for (let h = 0; h < H; h++) if (!inTree[h] && (pick < 0 || bestD[h] < bestD[pick])) pick = h
      if (pick < 0) break
      inTree[pick] = 1
      pushCand(hubs[bestFrom[pick]], hubs[pick])
      for (let h = 0; h < H; h++) {
        if (inTree[h]) continue
        const d = hd(pick, h)
        if (d < bestD[h]) {
          bestD[h] = d
          bestFrom[h] = pick
        }
      }
    }
    // Each hub's two nearest peers, by linear scan. Building and sorting a
    // pair array per hub allocated sixteen hundred throwaway arrays for an
    // answer two variables hold.
    for (let a = 0; a < H; a++) {
      let b1 = -1
      let b2 = -1
      let d1 = Infinity
      let d2 = Infinity
      for (let b = 0; b < H; b++) {
        if (b === a) continue
        const d = hd(a, b)
        if (d < d1) {
          d2 = d1
          b2 = b1
          d1 = d
          b1 = b
        } else if (d < d2) {
          d2 = d
          b2 = b
        }
      }
      if (b1 >= 0) pushCand(hubs[a], hubs[b1])
      if (b2 >= 0) pushCand(hubs[a], hubs[b2])
    }
  }
  const arterialEnd = nc

  // Spokes: a hub reaches into its own cluster. This is what actually gives a
  // hub a degree a fringe node cannot reach, and therefore what makes it read.
  // Selected by insertion into a fixed slot list rather than by sorting the
  // cluster, for the same allocation reason.
  {
    const sIdx = new Int32Array(HUB_SPOKES)
    const sD = new Float64Array(HUB_SPOKES)
    for (const h of hubs) {
      const mine = members[clOf[h]]
      let found = 0
      for (const n of mine) {
        if (n === h) continue
        const d = sqDist(h, n)
        if (found >= HUB_SPOKES && d >= sD[HUB_SPOKES - 1]) continue
        let p = found < HUB_SPOKES ? found++ : HUB_SPOKES - 1
        while (p > 0 && sD[p - 1] > d) {
          sD[p] = sD[p - 1]
          sIdx[p] = sIdx[p - 1]
          p--
        }
        sD[p] = d
        sIdx[p] = n
      }
      for (let s = 0; s < found; s++) pushCand(h, sIdx[s])
    }
  }
  const spokeEnd = nc

  // Local k-NN. `kth` doubles as the local density measure the degree cap is
  // graded by — a node whose sixth neighbour is close is in a crowd.
  const kth = new Float64Array(N)
  if (grid) {
    const idxBuf = new Int32Array(K_NEAR)
    const dBuf = new Float64Array(K_NEAR)
    for (let n = 0; n < N; n++) {
      const got = kNearest(grid, px, py, pz, nodes, n, K_NEAR, idxBuf, dBuf)
      kth[n] = got > 0 ? dBuf[got - 1] : Infinity
      for (let s = 0; s < got; s++) pushCand(n, idxBuf[s])
    }
  }

  // Order ONLY the local tier, shortest first, as an index permutation so the
  // payload arrays are never shuffled.
  //
  // A counting sort over a quantised length rather than a comparator sort: the
  // admission below is greedy and only cares about the ordering down to about a
  // bead's width, and the comparator sort over eight thousand candidates was
  // measured as this module's single largest cost. Quantising on sqrt(length)
  // spends the buckets where the edges are — most of them are short.
  const localCount = nc - spokeEnd
  const localOrder = new Int32Array(localCount)
  if (localCount > 0) {
    let dMax = 0
    for (let e = spokeEnd; e < nc; e++) if (cd[e] > dMax) dMax = cd[e]
    const B = 2048
    const inv = dMax > 0 ? (B - 1) / Math.sqrt(dMax) : 0
    const qk = new Int32Array(localCount)
    const bucket = new Int32Array(B + 1)
    for (let e = spokeEnd; e < nc; e++) {
      const q = Math.min(B - 1, (Math.sqrt(cd[e]) * inv) | 0)
      qk[e - spokeEnd] = q
      bucket[q + 1]++
    }
    for (let b = 0; b < B; b++) bucket[b + 1] += bucket[b]
    const cursor = bucket.slice(0, B)
    for (let e = spokeEnd; e < nc; e++) localOrder[cursor[qk[e - spokeEnd]]++] = e
  }

  // ── The graded degree cap ──────────────────────────────────────────────
  // Rank the nodes by local density and spread the cap across [MIN, MAX]. A
  // single flat cap is what collapses the degree distribution onto a spike:
  // every node simply fills to it, and the hierarchy the clustering worked to
  // create is thrown away at the last step.
  // The percentile comes from a histogram, not a sort: the cap is a small
  // integer, so ranking to full precision is work nobody can see.
  const cap = new Int32Array(N)
  {
    const B = 1024
    const hist = new Int32Array(B)
    const qk = new Int32Array(N)
    let kMax = 0
    for (let n = 0; n < N; n++) {
      if (Number.isFinite(kth[n]) && kth[n] > kMax) kMax = kth[n]
    }
    const inv = kMax > 0 ? (B - 1) / Math.sqrt(kMax) : 0
    for (let n = 0; n < N; n++) {
      const q = Number.isFinite(kth[n]) ? Math.min(B - 1, (Math.sqrt(kth[n]) * inv) | 0) : B - 1
      qk[n] = q
      hist[q]++
    }
    let run = 0
    const below = new Int32Array(B)
    for (let b = 0; b < B; b++) {
      below[b] = run
      run += hist[b]
    }
    const span = DEG_CAP_MAX - DEG_CAP_MIN
    for (let n = 0; n < N; n++) {
      const q = qk[n]
      const pct = N > 0 ? (below[q] + hist[q] * 0.5) / N : 0
      cap[n] = DEG_CAP_MAX - Math.round(pct * span)
    }
    for (const h of hubs) cap[h] = HUB_DEG_CAP
  }

  // ── Admission ──────────────────────────────────────────────────────────
  const degree = new Int32Array(N)
  const eaBuf = new Int32Array(MAX_SEGMENTS + 256)
  const ebBuf = new Int32Array(MAX_SEGMENTS + 256)
  let E = 0
  const dsu = makeDSU(N)

  const admit = (a, b, force) => {
    if (E >= eaBuf.length) return
    if (!force && (degree[a] >= cap[a] || degree[b] >= cap[b])) return
    eaBuf[E] = a
    ebBuf[E] = b
    E++
    degree[a]++
    degree[b]++
    dsu.union(a, b)
  }

  for (let e = 0; e < arterialEnd; e++) admit(ca[e], cb[e], true)
  for (let e = arterialEnd; e < spokeEnd; e++) admit(ca[e], cb[e], false)
  // Headroom left for the connectivity repair, which must not be starved by the
  // budget — an unreachable component is a hole in the flood.
  const localCeil = MAX_SEGMENTS - 120
  for (let i = 0; i < localCount && E < localCeil; i++) {
    const e = localOrder[i]
    admit(ca[e], cb[e], false)
  }

  // ── Connectivity repair ────────────────────────────────────────────────
  // The BFS flood is the movement's whole gesture, so anything it cannot reach
  // is invisible. Stitch every stray component to the main one by its shortest
  // available link. These bypass the cap: they are structure, not decoration.
  if (N > 0 && grid) {
    const gridNx = grid.nx
    const gridNz = grid.nz
    const gridStarts = grid.starts
    const gridItems = grid.items
    let mainRoot = dsu.find(0)
    for (let guard = 0; guard < 400; guard++) {
      let stray = -1
      for (let n = 0; n < N; n++) {
        if (dsu.find(n) !== mainRoot) {
          stray = n
          break
        }
      }
      if (stray < 0) break
      const strayRoot = dsu.find(stray)
      let bA = -1
      let bB = -1
      let bD = Infinity
      for (let n = 0; n < N; n++) {
        if (dsu.find(n) !== strayRoot) continue
        const i = nodes[n]
        const ix = gx(grid, px[i])
        const iz = gz(grid, pz[i])
        for (let R = 1; R <= 8; R++) {
          const x0 = Math.max(0, ix - R)
          const x1 = Math.min(gridNx - 1, ix + R)
          const z0 = Math.max(0, iz - R)
          const z1 = Math.min(gridNz - 1, iz + R)
          let hit = false
          for (let jz = z0; jz <= z1; jz++) {
            for (let jx = x0; jx <= x1; jx++) {
              const c = jz * gridNx + jx
              for (let s = gridStarts[c]; s < gridStarts[c + 1]; s++) {
                const m = gridItems[s]
                if (dsu.find(m) === strayRoot) continue
                const o = nodes[m]
                const dx = px[i] - px[o]
                const dy = py[i] - py[o]
                const dz = pz[i] - pz[o]
                const d = dx * dx + dy * dy + dz * dz
                if (d < bD) {
                  bD = d
                  bA = n
                  bB = m
                }
                hit = true
              }
            }
          }
          if (hit) break
        }
      }
      if (bA < 0) break
      admit(bA, bB, true)
      mainRoot = dsu.find(bA)
    }
  }

  // ── BFS from the node nearest the intelligence dot ─────────────────────
  // The flood's source is the free red dot's parking spot, so the conduction
  // starts where the film's protagonist is standing rather than at an arbitrary
  // corner.
  const dot = (ctx.wordmark && ctx.wordmark.intelligenceDot) || [0, 0, 0]
  let source = 0
  {
    let bd = Infinity
    for (let n = 0; n < N; n++) {
      const i = nodes[n]
      const dx = px[i] - dot[0]
      const dy = py[i] - dot[1]
      const dz = pz[i] - dot[2]
      const d = dx * dx + dy * dy + dz * dz
      if (d < bd) {
        bd = d
        source = n
      }
    }
  }

  const adjStart = new Int32Array(N + 1)
  for (let e = 0; e < E; e++) {
    adjStart[eaBuf[e] + 1]++
    adjStart[ebBuf[e] + 1]++
  }
  for (let n = 0; n < N; n++) adjStart[n + 1] += adjStart[n]
  const adj = new Int32Array(E * 2)
  {
    const cursor = adjStart.slice(0, N)
    for (let e = 0; e < E; e++) {
      adj[cursor[eaBuf[e]]++] = ebBuf[e]
      adj[cursor[ebBuf[e]]++] = eaBuf[e]
    }
  }

  const depth = new Int32Array(N).fill(-1)
  if (N > 0) {
    const queue = new Int32Array(N)
    let head = 0
    let tail = 0
    depth[source] = 0
    queue[tail++] = source
    while (head < tail) {
      const n = queue[head++]
      for (let s = adjStart[n]; s < adjStart[n + 1]; s++) {
        const m = adj[s]
        if (depth[m] >= 0) continue
        depth[m] = depth[n] + 1
        queue[tail++] = m
      }
    }
  }
  let maxDepth = 0
  for (let n = 0; n < N; n++) if (depth[n] > maxDepth) maxDepth = depth[n]
  // An unreached node would otherwise sort to the front and light before the
  // source; park it one ring past the last.
  const rings = maxDepth + 2
  const ringOf = (n) => (depth[n] < 0 ? maxDepth + 1 : depth[n])

  // Edge order is the ring at which an edge lights. Counting sort rather than a
  // comparator: rings are a couple of dozen small integers, and this runs on
  // every boot.
  const edgeRingIdx = new Int32Array(E)
  const bucket = new Int32Array(rings + 1)
  for (let e = 0; e < E; e++) {
    const r = Math.max(ringOf(eaBuf[e]), ringOf(ebBuf[e]))
    edgeRingIdx[e] = r
    bucket[r + 1]++
  }
  for (let r = 0; r < rings; r++) bucket[r + 1] += bucket[r]
  const edgeA = new Int32Array(E)
  const edgeB = new Int32Array(E)
  const edgeRing = new Float32Array(E)
  {
    const cursor = bucket.slice(0, rings)
    for (let e = 0; e < E; e++) {
      const r = edgeRingIdx[e]
      const at = cursor[r]++
      edgeA[at] = eaBuf[e]
      edgeB[at] = ebBuf[e]
      edgeRing[at] = Math.min(1, r / Math.max(1, maxDepth + 1))
    }
  }

  cached = {
    count,
    bead,
    cityKey,
    half,
    slab,
    px,
    py,
    pz,
    nodes,
    nodeOfPool,
    degree,
    isHub,
    depth,
    maxDepth,
    source,
    edgeA,
    edgeB,
    edgeRing,
  }
  return cached
}

/** Bead diameter: matched to the wordmark's, so the network is the same matter
 *  the logotype is made of. */
function beadOf(ctx) {
  const r = ctx && ctx.wordmark && ctx.wordmark.dotRadius
  return r > 0 ? r * 2 : 1.2
}

/* ── The state ──────────────────────────────────────────────────────────── */

/** Mass that carries no edge: present, still, and small enough that the graph
 *  reads on top of it rather than through it. */
const AMBIENT = 0.4
/**
 * Node diameter against degree. The exponent matters: linear would make a
 * degree-18 hub nine times a degree-2 leaf and swamp the frame, while flat
 * would hide the hierarchy the clustering pass exists to create. At 0.72 an
 * ordinary node sits near one bead and a hub near two and a half, which is the
 * ratio at which a hub reads as a hub without becoming a blob.
 */
const NODE_BASE = 0.52
const NODE_GAIN = 0.3
const NODE_POW = 0.72
const NODE_MAX = 2.8
/** Degree at which a node starts taking the accent. Above the graded cap, so
 *  only genuine hubs qualify. */
const HUB_RED_FROM = 8
const HUB_RED_SPAN = 9

export function buildNetwork(ctx) {
  const count = ctx.count
  const L = layout(ctx)
  const bead = L.bead
  const out = emptyState(count)

  const nodeOfPool = L.nodeOfPool
  const degree = L.degree
  const lx = L.px
  const ly = L.py
  const lz = L.pz
  const source = L.source

  for (let i = 0; i < count; i++) {
    const n = nodeOfPool[i]
    let size = bead * AMBIENT
    let red = 0
    if (n >= 0) {
      const deg = degree[n]
      size = bead * Math.min(NODE_MAX, NODE_BASE + NODE_GAIN * Math.pow(deg, NODE_POW))
      // Red is the comprehension, not the decoration: it marks where the
      // structure concentrates. Only nodes past the hub threshold take any, so
      // roughly one point in a hundred is accented — and the flood's source
      // takes it outright, because that is where the film is about to go.
      red = Math.min(1, Math.max(0, (deg - HUB_RED_FROM) / HUB_RED_SPAN))
      if (n === source) red = 1
    }
    put(out, i, lx[i], ly[i], lz[i], size, red)
  }

  return out
}

/* ── The line layer ─────────────────────────────────────────────────────── */

/**
 * The graph edges, xyz pairs, EMITTED IN BFS ORDER from the node nearest the
 * intelligence dot.
 *
 * The order is the deliverable as much as the geometry is. The shared line
 * layer sweeps a reveal across its segment order, so a buffer in breadth-first
 * order gives conduction — a charge spreading through a still structure — for
 * free, with no per-frame work and no second draw call. In depth order (the
 * layer's default when no order attribute is supplied) the same edges would
 * read as a wipe across the site, which is a different, and wrong, idea.
 */
export function buildNetworkLines(ctx) {
  const L = layout(ctx)
  const nodes = L.nodes
  const ea = L.edgeA
  const eb = L.edgeB
  const lx = L.px
  const ly = L.py
  const lz = L.pz
  const E = ea.length
  const out = new Float32Array(E * 6)
  for (let e = 0; e < E; e++) {
    const a = nodes[ea[e]]
    const b = nodes[eb[e]]
    const o = e * 6
    out[o] = lx[a]
    out[o + 1] = ly[a]
    out[o + 2] = lz[a]
    out[o + 3] = lx[b]
    out[o + 4] = ly[b]
    out[o + 5] = lz[b]
  }
  return out
}

/**
 * Per-VERTEX reveal order in [0,1] — the BFS ring an edge belongs to, not its
 * position in the buffer.
 *
 * Pass this as the line layer's `order` attribute to get true conduction: every
 * edge of a ring lights together and the front advances outward at a constant
 * graph speed. Without it the layer falls back to depth order, and with a plain
 * buffer-index ramp the front would race through sparse rings and stall in
 * dense ones.
 */
export function buildNetworkLineOrder(ctx) {
  const L = layout(ctx)
  const E = L.edgeRing.length
  const out = new Float32Array(E * 2)
  for (let e = 0; e < E; e++) {
    out[e * 2] = L.edgeRing[e]
    out[e * 2 + 1] = L.edgeRing[e]
  }
  return out
}

/**
 * The graph, for a movement that wants to drive anything off it — a pulse on
 * the hubs, a charge arriving at a node, the source the red dot flies to.
 *
 * Indices are POOL indices, so this can be read straight against the point
 * buffer with no second mapping to keep in sync.
 */
export function networkGraph(ctx) {
  const L = layout(ctx)
  const N = L.nodes.length
  const degree = new Int32Array(L.count)
  const depth = new Int32Array(L.count).fill(-1)
  for (let n = 0; n < N; n++) {
    degree[L.nodes[n]] = L.degree[n]
    depth[L.nodes[n]] = L.depth[n]
  }
  const hubs = []
  for (let n = 0; n < N; n++) if (L.isHub[n]) hubs.push(L.nodes[n])
  return {
    nodes: L.nodes,
    nodeCount: N,
    degree,
    depth,
    maxDepth: L.maxDepth,
    hubs: Int32Array.from(hubs),
    source: L.nodes[L.source],
    edgeCount: L.edgeA.length,
    half: L.half,
    slabHalf: L.slab,
  }
}

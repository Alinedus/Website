/**
 * INTELLIGENCE — the network stops being a diagram and becomes one thing.
 *
 * ── What this refuses ─────────────────────────────────────────────────────
 *
 * A glowing sphere and a particle blob are the two shapes every "AI" sequence
 * reaches for, and both say the same nothing: that thinking is a bright fuzzy
 * ball. This state is a STRUCTURE. It has an inside, an outside, an anatomy and
 * a history, and the camera can be flown into it because there is something in
 * there to find.
 *
 * ── The construction: the graph's topology IS the entity's anatomy ─────────
 *
 * The previous state's whole argument is that the city was always a graph, and
 * movement 5 floods that graph breadth-first from the node nearest the free red
 * dot. That flood is the only thing in the film that has already imposed an
 * order on every point: how far each one is, in HOPS, from where comprehension
 * started. So this state is built in the flood's own polar coordinates:
 *
 *   RADIUS  ← the point's former graph depth. Equal depth ⇒ equal radius, so
 *             each BFS ring becomes a level set — a nested shell. The rings are
 *             not spheres: `reachGain` and the arms below deform them, which is
 *             what makes them read as an organ's laminae rather than as onion.
 *   AZIMUTH ← the direction the point lay in FROM the flood's source. A radial
 *             district of the city therefore becomes one arm of the mind, and
 *             an arm contains points at every depth — which is precisely why it
 *             comes out as a FILAMENT running from the core to the rim, rather
 *             than as a clump parked at one radius.
 *   LATITUDE← a smooth fold of the former ground plane (`fold`). A planar graph
 *             has no third angle, so one has to be invented; inventing it as a
 *             low-frequency field over the former XZ means the plane is WRAPPED
 *             onto the entity coherently, and its lobes become the entity's.
 *
 * Nothing here is decoration laid over the graph. Every coordinate is a reading
 * of the graph, which is what earns the claim that the thing is made of its own
 * history.
 *
 * ── Why it is filamentary rather than smooth ──────────────────────────────
 *
 * A continuous direction field gives a continuous shell — a ball. The arms come
 * from QUANTISING direction into a hierarchical cube-sphere cell tree whose
 * refinement rises with radius: 6 cells near the core, then 24, 96, 384. Because
 * the grids nest exactly (each level halves the cell), a point's cells form an
 * ancestry, and the cell centres of that ancestry are a POLYLINE from the origin
 * outward — the branch it grew along. Bifurcation is not a special case; it is
 * what a cell boundary IS.
 *
 * The pull toward the cell centre rises with radius (`pullOf`). That single
 * gradient produces the shape the brief asks for: near the core the pull is
 * almost nothing, so every direction survives and the middle is a dense
 * undifferentiated mass; at the rim the pull is near total, so the points
 * collapse onto discrete twigs. An integrated centre with an articulated
 * periphery is what cognition looks like, and it is one line of tuning.
 *
 * ── Three octaves, because the camera flies in ────────────────────────────
 *
 * Movement 6 owns the push-in to macro: it travels from ~180 units out to 3.2
 * units, ending INSIDE the core with a 58° lens. So the geometry is designed
 * against that specific approach and carries structure at three scales —
 *
 *   macro ~50 u   the lobed silhouette — reachGain, the fold, the outer shells
 *   meso  ~4-18 u the branch tree and the swirl that makes its arms meander
 *   micro ~0.3-1u strand cross-section, bead spacing and size, the fine swirl
 *
 * The pool's near-fade (PointPool: smoothstep(1.5, 11.0)) dissolves everything
 * within ~11 units of the lens, so what the final frames actually show is the
 * mid-arm region seen from inside the core. That band is deliberately the most
 * populated part of the model.
 *
 * ── Fitted to the motion it will be given ─────────────────────────────────
 *
 * MOTION.FLOW rotates every point about the WORLD Y AXIS at a per-point rate.
 * Structure that is axisymmetric about Y therefore survives it and structure
 * that is not gets sheared. So the anisotropy is placed on purpose: the global
 * squash (`AXIS_SCALE`) is a solid of revolution about Y and cannot wobble,
 * while all the non-axisymmetric structure lives in the arms — which are given
 * a standing twist so the shear reads as continued flow instead of as damage.
 *
 * ── Determinism ───────────────────────────────────────────────────────────
 *
 * No ctx.rng is consumed. Every stochastic-looking value is a pure hash of its
 * own coordinates, exactly as building.js and network.js do it, because the
 * lines export is called separately from the state export and a shared RNG
 * cursor would make the composition depend on the order the integrator happens
 * to call them in.
 *
 * ── What the integrator may wire (all optional) ───────────────────────────
 *
 *   ctx.network      the already-built network state ({pos} or a bare xyzw
 *                    buffer) — the former positions this state reads its
 *                    azimuth and its fold from.
 *   ctx.networkGraph  the descriptor `networkGraph(ctx)` in network.js already
 *                    returns — its `depth` (per POOL index, -1 off-graph) is
 *                    the radius, its `source` is the entity's root, its
 *                    `degree` thickens the former hubs.
 *
 * States are built in timeline order and the network precedes this one, so both
 * cost one line each. WITHOUT them the module synthesises a planar field of the
 * same shape (a Hilbert-ordered site with a warped distance field standing in
 * for the flood) and runs the identical pipeline, so the state is never broken —
 * only less specifically the previous shot's own body.
 */

import { emptyState, put } from './index.js'

/* ── Tunables ───────────────────────────────────────────────────────────── */

/**
 * Rim radius. ABSOLUTE, not scaled off the previous state: direction.js ends
 * this movement's push-in at a fixed 3.2 units from the origin, so the scale at
 * which the core must hold up is fixed too. Sizing off the city instead would
 * make the macro octave drift whenever the city was retuned.
 */
const R_MAX = 25

/** Radius vs. depth-rank. >1 packs the population inward — this exponent is
 *  the dense core, and the single number that trades core density against how
 *  far the filaments reach. */
const RADIAL_P = 1.75

/**
 * Level boundaries as POPULATION quantiles, not as radii.
 *
 * The former graph's depth histogram is whatever the BFS happened to produce —
 * bell-shaped over a well-connected graph, lopsided over a sparse one. Cutting
 * the levels at fixed radii would leave the outer band nearly empty on one
 * scene and overloaded on another. Cutting at quantiles gives every level a
 * fixed share of the pool whatever the graph did, so the branch tree is always
 * populated at the density it was tuned for.
 */
const LEVEL_Q = [0, 0.32, 0.64, 0.9, 1]
/** Cells per cube-face edge per level. Must DOUBLE — that is what makes a
 *  level's cell an exact subdivision of its parent's, hence a real tree. */
const FACE_N = [1, 2, 4, 8]

/** How hard a point is drawn onto its cell centre, at the core and at the rim.
 *  The gradient between them is the whole "integrated centre, articulated
 *  periphery" reading. */
const PULL_MIN = 0.06
const PULL_MAX = 0.93
const PULL_SHAPE = 1.35

/** Lobing. Four fixed axes reach further than the rest, so the silhouette is
 *  irregular at the macro octave without any per-point randomness. */
const LOBE_AMP = 0.85
const LOBE_MIN = 0.58
const LOBE_MAX = 1.42

/** Global squash. Deliberately UNIFORM in xz: MOTION.FLOW spins points about Y,
 *  so anything anisotropic in the xz plane would make the silhouette breathe. */
const AXIS_SCALE = [1.06, 0.76, 1.06]

/** Standing spiral, so the flow's differential rotation continues a gesture the
 *  geometry already makes rather than starting a new one. */
const TWIST = 1.05
const TWIST_P = 1.15

/**
 * Swirl: TANGENTIAL displacement. Tangential, because a radial one would blur
 * the level sets — the shells are the reading and this is only the meander over
 * them.
 *
 * Two scales, built two different ways on purpose. The COARSE one bends whole
 * arms and has a wavelength of most of the model, so it is a smooth analytic
 * field on the sphere (three dot products and a cosine): at that wavelength a
 * hashed lattice is indistinguishable from a low-order polynomial and costs
 * eight hashes and ninety operations per point to be so. The FINE one has to be
 * genuinely incoherent between neighbouring strands, which only noise gives, so
 * it pays for the lattice. Then a per-point grit, which keeps the lattice from
 * ever reading as a lattice.
 */
const SWIRL_COARSE_AMP = 0.055 // × radius
const SWIRL_COARSE_WAVE = 5.2 // radians of phase across the full reach
const SWIRL_FINE_FREQ = 0.32
const SWIRL_FINE_AMP_R = 0.03
const SWIRL_FINE_AMP_C = 0.1
const GRIT = 0.05

/** Bead diameter as a fraction of the wordmark's, core → rim. Small and dense
 *  in the middle, large and sparse on the filaments. */
const SIZE_CORE = 0.3
const SIZE_GAIN = 1.18
const SIZE_SHAPE = 1.25

/** Red marks comprehension concentrating, so it is a steep function of depth —
 *  roughly the innermost quarter of the pool carries any at all. */
const RED_SHAPE = 3.4
const RED_MAX = 0.94

/** Half-extent of the synthesised site, used only when no former field is
 *  supplied. Matches the order of the city's own plat. */
const SYNTH_HALF = 150

/* ── Pure hash noise ────────────────────────────────────────────────────── */

/** Deterministic uint32 from three integers. */
function hashU(i, j, k) {
  let h =
    Math.imul(i ^ 0x27d4eb2d, 0x165667b1) ^
    Math.imul(j + 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(k + 0x7f4a7c15, 0x27d4eb2f)
  h ^= h >>> 15
  h = Math.imul(h, 0x2545f491)
  h ^= h >>> 13
  return h >>> 0
}

/** Deterministic [0,1) from two integers. */
const hash2i = (i, j) => hashU(i, j, 0) / 4294967296

/** Deterministic [0,1) from one integer and a salt. */
const hash1i = (i, salt) => hashU(i, salt * 0x9e37 + 17, 0x5bf0) / 4294967296

const smooth = (t) => t * t * (3 - 2 * t)

/** Length. Deliberately NOT Math.hypot: hypot is specified to avoid
 *  intermediate overflow and pays several times a plain sqrt for it, and this
 *  is called half a dozen times per point on a metre-scale model where nothing
 *  can overflow. Swapping the two measured a fifth off the build. */
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z)

/** Smoothed 2-D lattice noise in [0,1). Coherent, so a neighbouring point of
 *  the former field gets a neighbouring value — white noise here would shred
 *  the fold instead of folding it. */
function vn2(x, z) {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const sx = smooth(x - xi)
  const sz = smooth(z - zi)
  const a = hash2i(xi, zi)
  const b = hash2i(xi + 1, zi)
  const c = hash2i(xi, zi + 1)
  const d = hash2i(xi + 1, zi + 1)
  const top = a + (b - a) * sx
  const bot = c + (d - c) * sx
  return top + (bot - top) * sz
}

const INV10 = 1 / 1023

/**
 * Smoothed 3-D lattice noise, VECTOR valued, in [-1,1] per component.
 *
 * One hash per lattice corner, split into three 10-bit fields — not three
 * independently sampled scalar noises. The components only have to be
 * uncorrelated, and different bit fields of one avalanched hash are exactly
 * that, at a third of the hashing. Three octaves of this over the whole pool is
 * the dominant cost in the file, so the factor of three is the difference
 * between fitting the boot budget and not.
 */
function nvec3(x, y, z, out) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const sx = smooth(x - xi)
  const sy = smooth(y - yi)
  const sz = smooth(z - zi)
  const x0 = 1 - sx
  const y0 = 1 - sy
  const z0 = 1 - sz
  // Unrolled: this is the file's innermost loop and it runs 10,400 times on the
  // main thread at boot, where V8 is still interpreting it.
  const w000 = x0 * y0 * z0
  const w100 = sx * y0 * z0
  const w010 = x0 * sy * z0
  const w110 = sx * sy * z0
  const w001 = x0 * y0 * sz
  const w101 = sx * y0 * sz
  const w011 = x0 * sy * sz
  const w111 = sx * sy * sz
  const h000 = hashU(xi, yi, zi)
  const h100 = hashU(xi + 1, yi, zi)
  const h010 = hashU(xi, yi + 1, zi)
  const h110 = hashU(xi + 1, yi + 1, zi)
  const h001 = hashU(xi, yi, zi + 1)
  const h101 = hashU(xi + 1, yi, zi + 1)
  const h011 = hashU(xi, yi + 1, zi + 1)
  const h111 = hashU(xi + 1, yi + 1, zi + 1)
  const a =
    (h000 & 1023) * w000 + (h100 & 1023) * w100 + (h010 & 1023) * w010 +
    (h110 & 1023) * w110 + (h001 & 1023) * w001 + (h101 & 1023) * w101 +
    (h011 & 1023) * w011 + (h111 & 1023) * w111
  const b =
    ((h000 >>> 10) & 1023) * w000 + ((h100 >>> 10) & 1023) * w100 +
    ((h010 >>> 10) & 1023) * w010 + ((h110 >>> 10) & 1023) * w110 +
    ((h001 >>> 10) & 1023) * w001 + ((h101 >>> 10) & 1023) * w101 +
    ((h011 >>> 10) & 1023) * w011 + ((h111 >>> 10) & 1023) * w111
  const c =
    (h000 >>> 22) * w000 + (h100 >>> 22) * w100 + (h010 >>> 22) * w010 +
    (h110 >>> 22) * w110 + (h001 >>> 22) * w001 + (h101 >>> 22) * w101 +
    (h011 >>> 22) * w011 + (h111 >>> 22) * w111
  out[0] = a * INV10 * 2 - 1
  out[1] = b * INV10 * 2 - 1
  out[2] = c * INV10 * 2 - 1
  return out
}

/* ── Rank normalisation ─────────────────────────────────────────────────── */

const RANK_BINS = 2048

/**
 * Replace a field by its own quantile in [0,1], via a histogram.
 *
 * Two separate jobs need this and both need the same property: TIES MUST SHARE
 * A VALUE. Ranking depths by sorting would give the 60 points at BFS ring 7
 * sixty different ranks and smear the ring into a band; binning them puts them
 * all at one quantile, which is what keeps a shell a shell. It is also O(n),
 * where a sort is not.
 *
 * Returns the per-point quantile AND the bin each point fell in, because the
 * bin is the cheap route to everything else: there are only ever 2,048 distinct
 * quantiles, so every curve of q below is tabulated once per bin instead of
 * evaluated once per point.
 *
 * @param {Float32Array} v values, already clamped to [0,1]
 */
function rankNormalise(v, count) {
  const bins = RANK_BINS
  const hist = new Int32Array(bins)
  const bin = new Int32Array(count)
  for (let i = 0; i < count; i++) {
    const b = Math.min(bins - 1, Math.max(0, Math.floor(v[i] * bins)))
    bin[i] = b
    hist[b]++
  }
  // Mid-rank: the centre of the tied block, so a shell lands on one radius and
  // the shells either side of it stay symmetric about it.
  const qOfBin = new Float32Array(bins)
  let cum = 0
  for (let b = 0; b < bins; b++) {
    qOfBin[b] = (cum + hist[b] * 0.5) / count
    cum += hist[b]
  }
  const q = new Float32Array(count)
  for (let i = 0; i < count; i++) q[i] = qOfBin[bin[i]]
  return { q, bin, qOfBin }
}

/* ── The cube-sphere cell tree ──────────────────────────────────────────── */

/**
 * Which cube face a direction points at, and where on it.
 *
 * A cube-sphere rather than an icosahedron or a lat/long grid for one reason:
 * halving a face's grid is an EXACT subdivision, so the level-k cell containing
 * a direction is always inside the level-(k-1) one. That is what guarantees the
 * branch polylines never cross — a child branch cannot wander outside its
 * parent's cone. The cells are not equal-area, and that mild irregularity is
 * welcome: it keeps the arms from reading as a regular fan.
 */
function faceUV(dx, dy, dz, out) {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  const az = Math.abs(dz)
  if (ax >= ay && ax >= az) {
    const k = 1 / (ax || 1e-9)
    if (dx > 0) {
      out[0] = 0
      out[1] = dz * k
    } else {
      out[0] = 1
      out[1] = -dz * k
    }
    out[2] = dy * k
  } else if (ay >= az) {
    const k = 1 / (ay || 1e-9)
    out[1] = dx * k
    if (dy > 0) {
      out[0] = 2
      out[2] = dz * k
    } else {
      out[0] = 3
      out[2] = -dz * k
    }
  } else {
    const k = 1 / (az || 1e-9)
    if (dz > 0) {
      out[0] = 4
      out[1] = -dx * k
    } else {
      out[0] = 5
      out[1] = dx * k
    }
    out[2] = dy * k
  }
  return out
}

/** The inverse: a unit direction from a face and its (u,v) in [-1,1]. */
function dirOfFaceUV(face, u, v, out) {
  let x
  let y
  let z
  switch (face) {
    case 0:
      x = 1
      y = v
      z = u
      break
    case 1:
      x = -1
      y = v
      z = -u
      break
    case 2:
      x = u
      y = 1
      z = v
      break
    case 3:
      x = u
      y = -1
      z = -v
      break
    case 4:
      x = -u
      y = v
      z = 1
      break
    default:
      x = u
      y = v
      z = -1
      break
  }
  const inv = 1 / len3(x, y, z)
  out[0] = x * inv
  out[1] = y * inv
  out[2] = z * inv
  return out
}

/** Cell index along one face axis, and the cell centre's coordinate. */
const cellIndex = (t, n) => Math.min(n - 1, Math.max(0, Math.floor((t + 1) * 0.5 * n)))
const cellCentre = (i, n) => ((i + 0.5) / n) * 2 - 1

/** One integer per (level, face, ic, jc). ic and jc never exceed 7. */
const cellKey = (level, face, ic, jc) => ((level * 6 + face) * 16 + jc) * 16 + ic
const CELL_KEYS = 4 * 6 * 16 * 16

/** Unit-vector blend. Both arguments always lie in the same cell, so they can
 *  never be near-antipodal and the normalise is safe. */
function blendDir(ax, ay, az, bx, by, bz, t, out) {
  const x = ax + (bx - ax) * t
  const y = ay + (by - ay) * t
  const z = az + (bz - az) * t
  const inv = 1 / (len3(x, y, z) || 1)
  out[0] = x * inv
  out[1] = y * inv
  out[2] = z * inv
  return out
}

/* ── Shape fields ───────────────────────────────────────────────────────── */

/** Four lobe axes. Fixed, irrational-looking, and normalised at module load so
 *  the dot products below are honest cosines. */
const LOBE_AXES = [
  [0.71, 0.35, -0.61, 1.0],
  [-0.42, 0.8, 0.43, 0.72],
  [0.3, -0.55, 0.78, 0.55],
  [-0.85, -0.25, -0.46, 0.46],
].map(([x, y, z, w]) => {
  const inv = 1 / len3(x, y, z)
  return [x * inv, y * inv, z * inv, w]
})
const LOBE_WSUM = LOBE_AXES.reduce((a, l) => a + l[3], 0)

/** Three axes for the coarse swirl. Products of the direction's components
 *  along them give a smooth vector field with a handful of lobes and six fixed
 *  points — which is what a slow flow over a body looks like. */
const unit3 = ([x, y, z]) => {
  const inv = 1 / Math.sqrt(x * x + y * y + z * z)
  return [x * inv, y * inv, z * inv]
}
const SW0 = unit3([0.58, 0.66, -0.48])
const SW1 = unit3([-0.36, 0.51, 0.78])
const SW2 = unit3([0.79, -0.29, 0.54])

/**
 * How far the entity reaches in a given direction.
 *
 * A cubed cosine keeps the sign and sharpens the lobe, so four axes give four
 * long arms-of-arms and four recessed clefts — enough to break the silhouette
 * without it reading as a modelled shape. Smooth in direction, so former
 * neighbours are never separated by it.
 */
function reachGain(dx, dy, dz) {
  let f = 0
  for (let j = 0; j < LOBE_AXES.length; j++) {
    const a = LOBE_AXES[j]
    const d = dx * a[0] + dy * a[1] + dz * a[2]
    f += a[3] * d * d * d
  }
  f /= LOBE_WSUM
  return Math.min(LOBE_MAX, Math.max(LOBE_MIN, 1 + LOBE_AMP * f))
}

/** Which branch level a point's depth-rank puts it on. */
function levelOf(q) {
  for (let k = FACE_N.length - 1; k > 0; k--) if (q >= LEVEL_Q[k]) return k
  return 0
}

const pullOf = (q) => PULL_MIN + (PULL_MAX - PULL_MIN) * Math.pow(q, PULL_SHAPE)

/** Radius at a depth-rank, before the lobes deform it. */
const radiusOf = (q) => R_MAX * Math.pow(q, RADIAL_P)

/** Spiral about Y, growing with radius. In place. */
function twistY(p) {
  const r = Math.sqrt(p[0] * p[0] + p[2] * p[2])
  if (r < 1e-6) return p
  const mag = len3(p[0], p[1], p[2])
  const a = Math.atan2(p[2], p[0]) + TWIST * Math.pow(Math.min(1, mag / R_MAX), TWIST_P)
  p[0] = Math.cos(a) * r
  p[2] = Math.sin(a) * r
  return p
}

/**
 * The one place a direction and a radius become a world position, shared by the
 * points and by the skeleton lines — so the two can never disagree about where
 * a branch is.
 */
function placeOnBranch(dx, dy, dz, radius, out) {
  const r = radius * reachGain(dx, dy, dz)
  out[0] = dx * r
  out[1] = dy * r
  out[2] = dz * r
  twistY(out)
  out[0] *= AXIS_SCALE[0]
  out[1] *= AXIS_SCALE[1]
  out[2] *= AXIS_SCALE[2]
  return out
}

/* ── Hilbert order, for the synthesised field ───────────────────────────── */

/** Canonical Hilbert d→xy. `n` must be a power of two. */
function hilbertD2XY(n, d, out) {
  let t = d
  let x = 0
  let y = 0
  for (let s = 1; s < n; s *= 2) {
    const rx = 1 & (t >> 1)
    const ry = 1 & (t ^ rx)
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x
        y = s - 1 - y
      }
      const tmp = x
      x = y
      y = tmp
    }
    x += s * rx
    y += s * ry
    t = Math.floor(t / 4)
  }
  out[0] = x
  out[1] = y
  return out
}

/* ── The former field ───────────────────────────────────────────────────── */

/** Accept whatever shape the integrator hands over: a built state, a bare xyzw
 *  buffer, or nothing. */
function suppliedField(ctx) {
  const src = ctx.network || ctx.networkState || ctx.city || ctx.cityState
  const pos = src && (src.pos || src)
  if (!pos || typeof pos.length !== 'number') return null
  if (pos.length < ctx.count * 4) return null
  return pos
}

/** The network's own graph descriptor, if it was wired through. */
function suppliedGraph(ctx) {
  const g = ctx.networkGraph
  if (!g || !g.depth || g.depth.length < ctx.count) return null
  return g
}

/**
 * Every point's former position on the ground plane, the flood's source, and
 * its depth from that source normalised to [0,1].
 *
 * The supplied and synthesised paths return the SAME shape, so everything
 * downstream is written once. That is the only way a fallback stays honest:
 * it has to be the same film, built from a stand-in, not a different film.
 */
function formerField(ctx) {
  const count = ctx.count
  const fx = new Float32Array(count)
  const fz = new Float32Array(count)
  const pos = suppliedField(ctx)
  const graph = suppliedGraph(ctx)

  if (pos) {
    for (let i = 0; i < count; i++) {
      const x = pos[i * 4]
      const z = pos[i * 4 + 2]
      fx[i] = Number.isFinite(x) ? x : 0
      fz[i] = Number.isFinite(z) ? z : 0
    }
  } else {
    // A Hilbert walk over a square site. The curve, rather than a raster or a
    // spiral, for the reason every other state uses one: consecutive pool
    // indices must be spatial neighbours or the morph into this state tears.
    const N = 128
    const cells = N * N
    const xy = [0, 0]
    for (let i = 0; i < count; i++) {
      hilbertD2XY(N, Math.min(cells - 1, Math.floor(((i + 0.5) * cells) / count)), xy)
      const jx = (hash2i(i, 0x51ed) - 0.5) * 0.9
      const jz = (hash2i(i, 0x77af) - 0.5) * 0.9
      fx[i] = ((xy[0] + 0.5 + jx) / N - 0.5) * 2 * SYNTH_HALF
      fz[i] = ((xy[1] + 0.5 + jz) / N - 0.5) * 2 * SYNTH_HALF
    }
  }

  // Half-extent of the field, for every frequency below — so the fold reads the
  // same whatever scale the previous state turned out to have.
  let half = 0
  for (let i = 0; i < count; i++) half = Math.max(half, Math.abs(fx[i]), Math.abs(fz[i]))
  if (!(half > 1)) half = SYNTH_HALF

  // ── The source ─────────────────────────────────────────────────────────
  // The flood's own source if the graph came through, else the point nearest
  // the free red dot's parking spot — which is how network.js chose it, so the
  // two states agree about where comprehension started without being told.
  let source = 0
  if (graph && graph.source >= 0 && graph.source < count) {
    source = graph.source
  } else {
    const dot = (ctx.wordmark && ctx.wordmark.intelligenceDot) || [0, 0, 0]
    let bd = Infinity
    for (let i = 0; i < count; i++) {
      const d = (fx[i] - dot[0]) ** 2 + (fz[i] - dot[2]) ** 2
      if (d < bd) {
        bd = d
        source = i
      }
    }
  }

  // ── Depth ──────────────────────────────────────────────────────────────
  const tau = new Float32Array(count)
  if (graph) {
    const depth = graph.depth
    const maxDepth = Math.max(1, graph.maxDepth || 1)

    // Only ~a quarter of the pool was ever a graph NODE; the rest carried no
    // edge and has no depth. It is not "outside" the flood, it is the matter
    // between the nodes, so it takes the depth of the nodes it lies between —
    // in INDEX order, which is a spatial order in every state feeding this one.
    // Giving it the outermost ring instead would build a hollow shell.
    let prev = -1
    const prevOf = new Int32Array(count)
    for (let i = 0; i < count; i++) {
      if (depth[i] >= 0) prev = i
      prevOf[i] = prev
    }
    let next = -1
    const nextOf = new Int32Array(count)
    for (let i = count - 1; i >= 0; i--) {
      if (depth[i] >= 0) next = i
      nextOf[i] = next
    }

    for (let i = 0; i < count; i++) {
      let d
      if (depth[i] >= 0) {
        d = depth[i]
      } else {
        const a = prevOf[i]
        const b = nextOf[i]
        if (a >= 0 && b >= 0) {
          const t = (i - a) / (b - a)
          d = depth[a] + (depth[b] - depth[a]) * t
        } else if (a >= 0) d = depth[a]
        else if (b >= 0) d = depth[b]
        else d = maxDepth * 0.5
        // Nudge off the ring so the NODES keep the shells crisp and the mass
        // reads as the tissue between them rather than joining them.
        d += (hash1i(i, 5) - 0.5) * 0.55
      }
      tau[i] = Math.min(1, Math.max(0, d / maxDepth))
    }
  } else {
    // No graph: distance from the source, warped by a coherent field so the
    // rings are not circles. A real BFS depth is shorter than the crow flies
    // along an arterial and longer through a badly connected pocket, and that
    // difference is exactly what pulls some districts into the core and pushes
    // others out to the rim — so the stand-in has to have it too.
    const f = 1 / (half * 0.45)
    const x0 = fx[source]
    const z0 = fz[source]
    let dMax = 1e-6
    for (let i = 0; i < count; i++) {
      const w = 1 + 0.45 * (vn2(fx[i] * f, fz[i] * f) * 2 - 1)
      const dx = fx[i] - x0
      const dz = fz[i] - z0
      const d = Math.sqrt(dx * dx + dz * dz) * w
      tau[i] = d
      if (d > dMax) dMax = d
    }
    // Quantise onto rings, so the fallback has level sets too rather than a
    // continuous gradient that would come out as a smooth ball.
    const RINGS = 26
    for (let i = 0; i < count; i++) {
      tau[i] = Math.min(1, Math.round((tau[i] / dMax) * RINGS) / RINGS)
    }
  }

  return { fx, fz, half, source, tau, graph }
}

/* ── Layout ─────────────────────────────────────────────────────────────── */

/** Built once and shared by the state and the lines, so neither can drift from
 *  the other. */
let cached = null

/** Bead diameter: matched to the wordmark's, so the entity is the same matter
 *  the logotype is made of. */
function beadOf(ctx) {
  const r = ctx && ctx.wordmark && ctx.wordmark.dotRadius
  return r > 0 ? r * 2 : 1.2
}

function layout(ctx) {
  const count = ctx.count
  const bead = beadOf(ctx)
  const fieldKey = suppliedField(ctx)
  const graphKey = suppliedGraph(ctx)
  if (
    cached &&
    cached.count === count &&
    cached.bead === bead &&
    cached.fieldKey === fieldKey &&
    cached.graphKey === graphKey
  ) {
    return cached
  }

  const F = formerField(ctx)
  const { fx, fz, half, source, tau, graph } = F

  // ── Latitude: the fold ─────────────────────────────────────────────────
  // A low-frequency field over the former ground, rank-normalised so that
  // sin(latitude) comes out UNIFORM in [-1,1] — i.e. the plane wraps the
  // entity exactly once with no pile-up at the poles and no bald equator. The
  // fold decides WHICH district goes to which latitude (coherently, so
  // neighbours travel together); the rank decides that the coverage is even.
  const f1 = 1 / (half * 0.55)
  const f2 = f1 * 2.7
  const foldRaw = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const a = vn2(fx[i] * f1, fz[i] * f1)
    const b = vn2(fx[i] * f2 + 13.7, fz[i] * f2 - 9.1)
    foldRaw[i] = Math.min(1, Math.max(0, 0.68 * a + 0.32 * b))
  }
  const foldQ = rankNormalise(foldRaw, count).q

  // ── Radius: the depth rank ─────────────────────────────────────────────
  const { q, bin, qOfBin } = rankNormalise(tau, count)

  // Every curve of q, tabulated once per histogram bin. The point loop below
  // then does five array reads where it used to do five Math.pow calls and a
  // level search — which, at 5,200 points on a cold interpreter at boot, is
  // most of a frame.
  const lutRadius = new Float32Array(RANK_BINS)
  const lutPull = new Float32Array(RANK_BINS)
  const lutSize = new Float32Array(RANK_BINS)
  const lutRed = new Float32Array(RANK_BINS)
  const lutLevel = new Uint8Array(RANK_BINS)
  for (let b = 0; b < RANK_BINS; b++) {
    const bq = qOfBin[b]
    lutRadius[b] = radiusOf(bq)
    lutPull[b] = pullOf(bq)
    lutSize[b] = bead * (SIZE_CORE + SIZE_GAIN * Math.pow(bq, SIZE_SHAPE))
    lutRed[b] = RED_MAX * Math.pow(1 - bq, RED_SHAPE)
    lutLevel[b] = levelOf(bq)
  }

  const px = new Float32Array(count)
  const py = new Float32Array(count)
  const pz = new Float32Array(count)
  const size = new Float32Array(count)
  const red = new Float32Array(count)

  // Which cells of the branch tree are actually inhabited — collected here so
  // the line layer draws the skeleton this cloud grew on, and no twig that
  // nothing grew on.
  const occupied = new Uint8Array(CELL_KEYS)

  const fu = [0, 0, 0]
  const cd = [0, 0, 0]
  const dir = [0, 0, 0]
  const p = [0, 0, 0]
  const n = [0, 0, 0]

  const x0 = fx[source]
  const z0 = fz[source]

  for (let i = 0; i < count; i++) {
    // ── The former polar coordinates ────────────────────────────────────
    const ax = fx[i] - x0
    const az = fz[i] - z0
    const arc = Math.sqrt(ax * ax + az * az)
    // A point sitting on the source has no azimuth. Give it a deterministic
    // one rather than a NaN — it lands at radius ~0 anyway, where the pull is
    // almost nothing and every direction is jumbled together.
    const theta = arc > 1e-4 ? Math.atan2(az, ax) : hash1i(i, 11) * Math.PI * 2
    const sinPhi = Math.min(1, Math.max(-1, foldQ[i] * 2 - 1))
    const cosPhi = Math.sqrt(Math.max(0, 1 - sinPhi * sinPhi))
    const tx = Math.cos(theta) * cosPhi
    const ty = sinPhi
    const tz = Math.sin(theta) * cosPhi

    // ── Quantise the direction into the branch tree ─────────────────────
    const b = bin[i]
    const level = lutLevel[b]
    const nn = FACE_N[level]
    faceUV(tx, ty, tz, fu)
    const face = fu[0]
    const ic = cellIndex(fu[1], nn)
    const jc = cellIndex(fu[2], nn)
    dirOfFaceUV(face, cellCentre(ic, nn), cellCentre(jc, nn), cd)

    // Mark the whole ancestry, not just the point's own cell: a twig whose
    // parent branch was never drawn would float unattached.
    for (let k = level, ca = ic, cb = jc; k >= 0; k--, ca >>= 1, cb >>= 1) {
      occupied[cellKey(k, face, ca, cb)] = 1
    }

    // The pull rises with radius, so the core keeps every direction the former
    // field had (a mass) and the rim collapses onto discrete twigs (filaments).
    // What survives the pull is the residual — the point's own offset inside
    // its cell — which is why a strand has a cross-section at all, and why that
    // cross-section still remembers how the former district was arranged.
    blendDir(tx, ty, tz, cd[0], cd[1], cd[2], lutPull[b], dir)

    placeOnBranch(dir[0], dir[1], dir[2], lutRadius[b], p)

    // ── Swirl ───────────────────────────────────────────────────────────
    // Every displacement below is crossed with the radial unit vector, so it is
    // TANGENTIAL by construction: the filaments meander without the shells they
    // thread through ever thickening.
    const mag = len3(p[0], p[1], p[2]) || 1
    const ux = p[0] / mag
    const uy = p[1] / mag
    const uz = p[2] / mag

    // Coarse: whole arms bend. The radial phase term is what stops a strand
    // from translating rigidly — without it the field is constant along a ray
    // and the arm would move without bending.
    const t1 = ux * SW0[0] + uy * SW0[1] + uz * SW0[2]
    const t2 = ux * SW1[0] + uy * SW1[1] + uz * SW1[2]
    const t3 = ux * SW2[0] + uy * SW2[1] + uz * SW2[2]
    const phase = Math.cos(SWIRL_COARSE_WAVE * (mag / R_MAX) + t1 * 2)
    const ca = SWIRL_COARSE_AMP * mag * phase
    const cx = t2 * t3
    const cy = t3 * t1
    const cz = t1 * t2
    p[0] += (uy * cz - uz * cy) * ca
    p[1] += (uz * cx - ux * cz) * ca
    p[2] += (ux * cy - uy * cx) * ca

    // Fine: strand-scale texture, where incoherence between neighbouring
    // strands is the whole point and only noise will do.
    const fa = SWIRL_FINE_AMP_R * mag + SWIRL_FINE_AMP_C
    nvec3(p[0] * SWIRL_FINE_FREQ, p[1] * SWIRL_FINE_FREQ, p[2] * SWIRL_FINE_FREQ, n)
    p[0] += (uy * n[2] - uz * n[1]) * fa
    p[1] += (uz * n[0] - ux * n[2]) * fa
    p[2] += (ux * n[1] - uy * n[0]) * fa

    const g = hashU(i, 0x2f1d, 0x9e3)
    p[0] += ((g & 1023) * INV10 - 0.5) * GRIT
    p[1] += (((g >>> 10) & 1023) * INV10 - 0.5) * GRIT
    p[2] += ((g >>> 22) * INV10 - 0.5) * GRIT

    px[i] = p[0]
    py[i] = p[1]
    pz[i] = p[2]

    // ── Size and red ────────────────────────────────────────────────────
    let d = lutSize[b] * (0.86 + 0.28 * hash1i(i, 23))
    // A former hub keeps its weight: the network sized its nodes by degree, so
    // carrying it over means the same specks are still the heavy ones.
    if (graph && graph.degree) {
      const deg = graph.degree[i] || 0
      if (deg > 6) d *= 1 + Math.min(1, (deg - 6) / 10) * 0.5
    }
    size[i] = d
    red[i] = lutRed[b]
  }

  // The root of the whole thing is the point the flood started from. It is the
  // one place in this state where red is not a gradient but a fact.
  red[source] = 1

  cached = {
    count,
    bead,
    fieldKey,
    graphKey,
    px,
    py,
    pz,
    size,
    red,
    source,
    occupied,
  }
  return cached
}

/* ── The state ──────────────────────────────────────────────────────────── */

/**
 * Every point is part of this state — nothing stands down.
 *
 * Other states dismiss the points they do not need by sizing them to zero. This
 * one cannot: the argument of the movement is that the whole field has become a
 * single body, and a body with a quarter of its matter switched off is not one.
 */
export function buildIntelligence(ctx) {
  const count = ctx.count
  const L = layout(ctx)
  const out = emptyState(count)
  for (let i = 0; i < count; i++) {
    put(out, i, L.px[i], L.py[i], L.pz[i], L.size[i], L.red[i])
  }
  return out
}

/* ── The line layer ─────────────────────────────────────────────────────── */

/** Sub-segments per branch, so an arm is drawn as an arc rather than a spoke.
 *  Three is the cheapest number at which the twist and the lobes both show. */
const BRANCH_STEPS = 3

/**
 * The branch skeleton the cloud grew on — the entity's anatomy, drawn.
 *
 * One polyline per inhabited cell, running from its parent's node out to its
 * own, subdivided so it follows the twist. Only inhabited cells are emitted, so
 * the skeleton is exactly as dense as the matter it carries: a solid trunk near
 * the core, a dendritic fringe at the rim where the cloud is down to a bead or
 * two per twig and the line is what makes the twig read at all.
 *
 * 350-600 segments measured across the wired and unwired paths — a tenth of the
 * shared layer's ceiling.
 *
 * REVEAL: leave it at 1. The order attribute below runs root-outward, which
 * under a sweep would read as a charge spreading through a still structure —
 * and conduction belongs to movement 5. Here the order is only there so the
 * layer has a defined draw sequence.
 */
export function buildIntelligenceLines(ctx) {
  const L = layout(ctx)
  const occ = L.occupied

  const cd = [0, 0, 0]
  const pd = [0, 0, 0]
  const dir = [0, 0, 0]
  const a = [0, 0, 0]
  const b = [0, 0, 0]

  const segs = []
  for (let level = 0; level < FACE_N.length; level++) {
    const nn = FACE_N[level]
    const rIn = radiusOf(LEVEL_Q[level])
    const rOut = radiusOf(LEVEL_Q[level + 1])
    for (let face = 0; face < 6; face++) {
      for (let jc = 0; jc < nn; jc++) {
        for (let ic = 0; ic < nn; ic++) {
          if (!occ[cellKey(level, face, ic, jc)]) continue
          dirOfFaceUV(face, cellCentre(ic, nn), cellCentre(jc, nn), cd)
          // The parent's direction, or — at the root — the branch's own, which
          // makes the first segment a straight spike out of the origin.
          if (level > 0) {
            const pn = FACE_N[level - 1]
            dirOfFaceUV(face, cellCentre(ic >> 1, pn), cellCentre(jc >> 1, pn), pd)
          } else {
            pd[0] = cd[0]
            pd[1] = cd[1]
            pd[2] = cd[2]
          }

          blendDir(pd[0], pd[1], pd[2], cd[0], cd[1], cd[2], 0, dir)
          placeOnBranch(dir[0], dir[1], dir[2], rIn, a)
          for (let s = 1; s <= BRANCH_STEPS; s++) {
            const t = s / BRANCH_STEPS
            blendDir(pd[0], pd[1], pd[2], cd[0], cd[1], cd[2], t, dir)
            placeOnBranch(dir[0], dir[1], dir[2], rIn + (rOut - rIn) * t, b)
            segs.push(a[0], a[1], a[2], b[0], b[1], b[2])
            a[0] = b[0]
            a[1] = b[1]
            a[2] = b[2]
          }
        }
      }
    }
  }
  return Float32Array.from(segs)
}

/**
 * Per-VERTEX draw order in [0,1] — radius from the root, so if the layer is
 * ever swept it grows outward rather than wiping across the frame. Both
 * vertices of a segment share the segment's own value, so a branch never draws
 * half of itself.
 */
export function buildIntelligenceLineOrder(ctx) {
  const pos = buildIntelligenceLines(ctx)
  const segCount = pos.length / 6
  const out = new Float32Array(segCount * 2)
  // Normalised against the model's own reach rather than R_MAX: the lobes push
  // some arms well past it, and an order attribute above 1 would never draw.
  let rMax = 1e-6
  for (let s = 0; s < segCount; s++) {
    const o = s * 6
    const r = len3(pos[o + 3], pos[o + 4], pos[o + 5])
    if (r > rMax) rMax = r
  }
  for (let s = 0; s < segCount; s++) {
    const o = s * 6
    const r =
      (len3(pos[o], pos[o + 1], pos[o + 2]) +
        len3(pos[o + 3], pos[o + 4], pos[o + 5])) *
      0.5
    const v = Math.min(1, r / rMax)
    out[s * 2] = v
    out[s * 2 + 1] = v
  }
  return out
}

/**
 * The entity, for anything that wants to drive off it — the red dot flying to
 * its root, a pulse on a former hub, a camera target that is not the origin.
 * Indices are POOL indices, so it reads straight against the point buffer.
 */
export function intelligenceBody(ctx) {
  const L = layout(ctx)
  return {
    source: L.source,
    root: [L.px[L.source], L.py[L.source], L.pz[L.source]],
    rMax: R_MAX * LOBE_MAX,
  }
}

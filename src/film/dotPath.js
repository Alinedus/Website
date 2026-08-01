import * as THREE from 'three'

/**
 * The route the intelligence dot takes through the corridor.
 *
 * Shared, because two things depend on it and they must not disagree: the dot
 * follows it, and every bead in the field derives its reveal order from it.
 * The field does not "fade in" — each bead wakes as the dot passes nearest to
 * it. That is the difference between a particle system that turns on and a
 * space that is being discovered by something moving through it.
 */
/**
 * The pen-down is at the sheet's lower-left THIRD intersection, not at the
 * centre of the frame. The very first thing anybody sees on this site is this
 * point, and it used to be a circle in the exact middle of a blank page —
 * which is the most-used hero composition on the internet and the one thing
 * the brief explicitly forbade. See SHEET_X3/SHEET_Y3 in scatterArchitecture.
 */
export const DOT_START = [-3.2, -1.9, 0.4]

export const DOT_PATH_POINTS = [
  DOT_START,
  [2.6, 1.8, -5],
  [-7, 5.5, -22],
  [-17, 2, -45],
  [2, -6.5, -71],
  [18, 4.5, -93],
  [9, 8, -58],
  [2.5, 4, -19],
]

export function makeDotPath() {
  return new THREE.CatmullRomCurve3(
    DOT_PATH_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    false,
    'catmullrom',
    0.32
  )
}

/**
 * For each bead, the point along the route at which the dot comes closest to
 * it — i.e. the moment that bead should wake.
 *
 * @param {Float32Array} positions xyz triples
 * @returns {Float32Array} 0..1 per bead
 */
export function wakeOrder(positions, count, samples = 260) {
  const path = makeDotPath()
  const pts = []
  for (let i = 0; i <= samples; i++) pts.push(path.getPointAt(i / samples))

  const out = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3]
    const y = positions[i * 3 + 1]
    const z = positions[i * 3 + 2]
    let bestT = 0
    let bestD = Infinity
    for (let s = 0; s <= samples; s++) {
      const p = pts[s]
      const dx = p.x - x
      const dy = p.y - y
      const dz = p.z - z
      const d = dx * dx + dy * dy + dz * dz
      if (d < bestD) {
        bestD = d
        bestT = s / samples
      }
    }
    out[i] = bestT
  }
  return out
}

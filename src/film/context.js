/**
 * Everything the film needs, built once at boot.
 *
 * All of it is procedural — there are no assets in this project, so the
 * logotype is rasterised and sampled, the architecture is generated, and every
 * later state is derived from those two. That is also why this is worth doing
 * eagerly: it is a few tens of milliseconds of arithmetic, once, in exchange
 * for a film that never loads anything.
 */

import { buildLogotype } from './logotype'
import { buildArchitecture } from './architecture'
import { wakeOrder } from './dotPath'
import { buildAllStates, POOL, rng } from './states'
import { assignWordmark } from './states/wordmarkState'
import { buildBlueprintLines } from './states/blueprint'
import { buildCityLines } from './states/city'
import { buildNetworkLines } from './states/network'

export async function buildFilm({ count: poolCount } = {}) {
  const t0 = performance.now()

  const wordmark = buildLogotype({ targetWidth: 40 })
  const architecture = buildArchitecture()

  const count = poolCount || POOL
  const anchorCount = Math.min(architecture.anchorCount, count)

  // ONE rng for the whole build. Every state draws from it in a fixed order,
  // so the composition is identical on every load and can be art-directed by
  // changing the seed rather than by reloading until it looks right.
  const ctx = {
    count,
    rng: rng(0x0a11ed),
    wordmark,
    anchors: architecture.anchors,
    anchorCount,
  }

  // Which points become letters — computed before the states, because several
  // of them need to keep the lettered group coherent.
  const { wordOf, letterIds } = assignWordmark(ctx)
  ctx.wordOf = wordOf
  ctx.letterIds = letterIds

  const states = buildAllStates(ctx)

  // Drawn layers. Each is optional: a movement that has no lines simply has no
  // layer, and the renderer skips it. Wrapped because a generator that throws
  // must cost its own layer, never the whole film.
  const lines = {}
  const tryLines = (key, fn) => {
    try {
      const v = fn(ctx)
      if (v && v.length) lines[key] = v
    } catch (e) {
      console.warn(`line layer "${key}" failed to build`, e)
    }
  }
  tryLines('blueprint', buildBlueprintLines)
  tryLines('city', buildCityLines)
  tryLines('network', buildNetworkLines)

  // Reveal order for movement 1: a point wakes as the intelligence dot passes
  // nearest to it, so the opening field is discovered by the character rather
  // than cross-faded in.
  const order = wakeOrder(
    (() => {
      // wakeOrder wants xyz triples; the scatter state is xyzw.
      const p = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        p[i * 3] = states[0].pos[i * 4]
        p[i * 3 + 1] = states[0].pos[i * 4 + 1]
        p[i * 3 + 2] = states[0].pos[i * 4 + 2]
      }
      return p
    })(),
    count
  )

  // The prepared sheet is present before anything is drawn on it: its marks
  // carry a negative wake order, which the shader's reveal term resolves to
  // "already awake" for free (see `appear` in PointPool).
  const band = states[0]?.sheetBand
  if (band) for (let i = band[0]; i < band[1]; i++) order[i] = -1

  // Framing extents the camera director needs. Measured from the geometry
  // rather than hard-coded, so retuning a state cannot silently crop the shot
  // — which is exactly what had happened: the crane's final distance was the
  // one literal in the whole camera table, and MEASURED against the building
  // it was supposed to frame it left the subject at 89% of the frame width
  // with its base three units below the bottom edge. That literal IS the
  // illegible black smear the jury rejected.
  const extentOf = (idx) => {
    const pos = states[idx]?.pos
    if (!pos) return null
    let x = 0
    let y = 0
    let z = 0
    let top = -Infinity
    for (let i = 0; i < count; i++) {
      if (pos[i * 4 + 3] <= 0) continue
      x = Math.max(x, Math.abs(pos[i * 4]))
      y = Math.max(y, Math.abs(pos[i * 4 + 1]))
      z = Math.max(z, Math.abs(pos[i * 4 + 2]))
      top = Math.max(top, pos[i * 4 + 1])
    }
    return x > 0.01 ? { x, y, z, top } : null
  }

  const city = extentOf(5)
  const building = extentOf(4)

  const framing = {
    wordHalfW: wordmark.width / 2,
    wordHalfH: wordmark.height / 2,
    cityHalf: city ? Math.max(city.x, city.z) : 60,
    buildingHalfW: building ? Math.max(building.x, building.z) : 21,
    buildingHalfH: building ? building.y : 12,
    buildingTop: building ? building.top : 12,
  }

  return {
    ctx,
    wordmark,
    architecture,
    states,
    lines,
    order,
    count,
    framing,
    buildMs: performance.now() - t0,
  }
}

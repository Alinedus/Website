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

export async function buildFilm() {
  const t0 = performance.now()

  const wordmark = buildLogotype({ targetWidth: 40 })
  const architecture = buildArchitecture()

  const count = POOL
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

  // Framing extents the camera director needs. Measured from the geometry
  // rather than hard-coded, so retuning a state cannot silently crop the shot.
  const cityIdx = 5
  let cityHalf = 60
  {
    const pos = states[cityIdx]?.pos
    if (pos) {
      let m = 0
      for (let i = 0; i < count; i++) {
        if (pos[i * 4 + 3] <= 0) continue
        m = Math.max(m, Math.abs(pos[i * 4]), Math.abs(pos[i * 4 + 2]))
      }
      if (m > 1) cityHalf = m
    }
  }

  const framing = {
    wordHalfW: wordmark.width / 2,
    wordHalfH: wordmark.height / 2,
    cityHalf,
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

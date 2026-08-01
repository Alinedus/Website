/**
 * What this device can actually do — decided once, at boot.
 *
 * The rule the film is tuned against: a mid-range Android GPU can be an order
 * of magnitude slower than a desktop one, and a particle system that holds 60fps
 * on a laptop at five thousand points will not hold it on a phone. So the film
 * adapts by DENSITY, never by CONTENT.
 *
 * Every tier plays all seven movements, every state, every camera move, the
 * whole ninety seconds. What a phone loses is bead count, pixel ratio and the
 * graphite trace — things that make the frame richer. What it keeps is the
 * film. An experience that drops its own third act on mobile is not adapting,
 * it is failing quietly, and the customers this product is FOR are on tablets.
 */

const TIERS = {
  // Desktop with a real GPU. The composition as authored.
  high: {
    key: 'high',
    pool: 5200,
    dpr: [1, 2],
    ink: true, // the pointer's graphite trace
    antialias: true,
    parallax: 1,
    lineOpacityMul: 1,
  },
  // Tablets, integrated graphics, small laptops.
  mid: {
    key: 'mid',
    pool: 3400,
    dpr: [1, 1.75],
    ink: true,
    antialias: true,
    parallax: 0.7,
    lineOpacityMul: 1.05, // fewer beads: let the drawn lines carry a little more
  },
  // Phones and anything that reports weak. The skill's measured mobile
  // baseline for a points system is ~3,000; going under it deliberately.
  low: {
    key: 'low',
    pool: 2400,
    dpr: [1, 1.5],
    ink: false, // a second full-screen 2D canvas is the first thing to go
    antialias: false,
    parallax: 0.45,
    lineOpacityMul: 1.12,
  },
}

/** Best guess at the GPU, without blocking on anything. */
function probe() {
  if (typeof window === 'undefined') return TIERS.mid

  const nav = window.navigator
  const mem = nav.deviceMemory || 4
  const cores = nav.hardwareConcurrency || 4
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 820

  // The renderer string is the only honest signal about the actual GPU, and it
  // is worth one throwaway context to get it.
  let renderer = ''
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    if (gl && ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    /* a browser that refuses to say is treated as unknown, not as weak */
  }

  const r = renderer.toLowerCase()
  const softwareGL = /swiftshader|llvmpipe|software|basic render/.test(r)
  const mobileGPU = /adreno|mali|powervr|apple a\d|tegra/.test(r)

  // Software rasterisation is not a slow GPU, it is no GPU. Nothing else
  // matters if this is true.
  if (softwareGL) return TIERS.low
  if (mem <= 4 && (coarse || narrow)) return TIERS.low
  if (mobileGPU || (coarse && narrow)) return TIERS.mid
  if (cores <= 4 || mem <= 4) return TIERS.mid
  return TIERS.high
}

let resolved = null

/** The tier for this session. Probed once; the answer cannot change mid-film. */
export function quality() {
  if (!resolved) resolved = probe()
  return resolved
}

/** Force a tier — `?q=low` — so the founder can see any device's experience. */
export function applyQualityOverride(search = window.location?.search || '') {
  const m = /[?&]q=(high|mid|low)\b/.exec(search)
  if (m) resolved = TIERS[m[1]]
  return quality()
}

export { TIERS }

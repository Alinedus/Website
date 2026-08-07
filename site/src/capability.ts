/**
 * What this browser and this person can actually take.
 *
 * Two independent questions, deliberately kept apart:
 *
 *   reducedMotion  someone has asked the OS to stop things moving. They still get the whole story
 *                  — every beat, every line — but as a series of composed stills rather than a
 *                  degraded version of the film. Nothing animates, nothing smooths, nothing
 *                  resists.
 *
 *   webgl          the machine cannot draw the film at all. Then there is no film, and the written
 *                  version becomes the site rather than sitting invisible behind it.
 */

export const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') ?? c.getContext('webgl')
    if (!gl) return false
    // a context that exists but is immediately lost is worse than none — it renders black
    return !(gl as WebGLRenderingContext).isContextLost()
  } catch {
    return false
  }
}

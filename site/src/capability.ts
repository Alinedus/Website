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
    const live = !(gl as WebGLRenderingContext).isContextLost()

    /*
     * Hand the probe's context back before returning.
     *
     * This asks the question and then walks away holding the answer *and* a live WebGL context,
     * for the life of the page, on a canvas that is never added to the document and never drawn
     * again. On a desktop that is merely untidy. On iOS it is not: WebKit caps how many WebGL
     * contexts a page may hold, and when the cap is reached it does not refuse the new one — it
     * takes the oldest one away. The oldest one here is the film's, because this probe runs first.
     *
     * So the film is drawn on a context that is one slot closer to being reclaimed than it needs
     * to be, and it costs nothing to give the slot back. loseContext() fires webglcontextlost on
     * this throwaway canvas only; the renderer's context is created afterwards and is untouched.
     */
    ;(gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext()

    return live
  } catch {
    return false
  }
}

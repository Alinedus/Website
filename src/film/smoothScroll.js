import Lenis from 'lenis'

/**
 * Momentum scrolling, and the one thing everybody gets wrong about it.
 *
 * Lenis owns the scroll position: its own loop writes the page's scroll every
 * frame from an internal target. So a plain `window.scrollTo` does not move the
 * page — it is overwritten on the next frame and the page springs back. Any
 * programmatic jump has to go through Lenis or it silently does nothing.
 *
 * That is not theoretical. Adding Lenis broke the skip link — the one control
 * that exists so a keyboard or screen-reader user does not have to traverse
 * twenty thousand pixels of film — and it broke it QUIETLY, because the click
 * still fired and focus still moved; only the page stayed put. Routing every
 * programmatic scroll through here is what stops that being possible.
 *
 * Touch is deliberately native. A phone's own momentum is better than anything
 * a library synthesises, and overriding it is what makes scroll-driven sites
 * feel broken on mobile — where this product's customers actually are.
 */

let lenis = null

export function initSmoothScroll({ enabled = true } = {}) {
  if (!enabled || typeof window === 'undefined') return () => {}

  lenis = new Lenis({
    duration: 1.05,
    easing: (t) => 1 - Math.pow(1 - t, 3),
    smoothWheel: true,
    syncTouch: false,
  })

  let raf = 0
  const loop = (t) => {
    lenis?.raf(t)
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)

  return () => {
    cancelAnimationFrame(raf)
    lenis?.destroy()
    lenis = null
  }
}

/**
 * Move the page. Uses Lenis when it is driving, the platform when it is not,
 * so callers never have to know which is true.
 */
export function scrollToY(y, { immediate = false } = {}) {
  if (lenis) lenis.scrollTo(y, { immediate, duration: immediate ? 0 : 0.9 })
  else window.scrollTo({ top: y, behavior: immediate ? 'auto' : 'smooth' })
}

/** For tests and for anything that needs the page exactly where it asked. */
export function jumpToY(y) {
  scrollToY(y, { immediate: true })
}

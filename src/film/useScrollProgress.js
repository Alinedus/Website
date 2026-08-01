import { useEffect, useRef, useState } from 'react'

/**
 * Scroll → normalised scene time, without re-rendering React.
 *
 * The value lives in a ref and is read inside useFrame. Putting it in state
 * would re-render the whole tree on every scroll event, which is the single
 * most common way a scroll-driven WebGL hero ends up janky.
 */
export function useScrollTarget(enabled) {
  const target = useRef(enabled ? 0 : 1)

  useEffect(() => {
    if (!enabled) {
      target.current = 1
      return
    }

    const read = () => {
      const el = document.getElementById('hero')
      if (!el) return
      // Distance the sticky stage can travel before the section releases.
      //
      // Measured against the STAGE, not `window.innerHeight`. The section is
      // sized in `svh` — the *small* viewport height, which by definition does
      // not change when a mobile browser's URL bar shows or hides — while
      // innerHeight does. Mixing the two meant the denominator moved by up to
      // ~10% mid-scroll on iOS and Android: the film's progress jumped
      // backwards the moment the toolbar reappeared, which is the one thing a
      // scrub-driven camera must never do. The stage IS the 100svh element, so
      // reading its height keeps both sides of the division in one unit system.
      const stage = el.firstElementChild
      const vh = stage ? stage.offsetHeight : window.innerHeight
      const travel = el.offsetHeight - vh
      const y = window.scrollY - el.offsetTop
      target.current = travel > 0 ? Math.min(1, Math.max(0, y / travel)) : 0
    }

    read()
    window.addEventListener('scroll', read, { passive: true })
    window.addEventListener('resize', read)
    return () => {
      window.removeEventListener('scroll', read)
      window.removeEventListener('resize', read)
    }
  }, [enabled])

  return target
}

/**
 * `prefers-reduced-motion`. The scene honours this by collapsing to its
 * resolved final frame — the composition, held — rather than by removing the
 * canvas. The story's last image is the one worth keeping.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (e) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/** Frame-rate independent exponential damping. */
export const damp = (current, goal, lambda, dt) =>
  current + (goal - current) * (1 - Math.exp(-lambda * dt))

/** Remap `v` from [a,b] to [0,1], clamped. */
export const range = (v, a, b) =>
  Math.min(1, Math.max(0, (v - a) / (b - a || 1)))

/** Smooth, symmetric ease. Never linear — linear reads as machinery. */
export const easeInOut = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

/** Decisive arrival: fast commitment, long settle. Used for the final camera. */
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))

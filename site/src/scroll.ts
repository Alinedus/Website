import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { clamp01, smoothstep } from './scenes'
import { reducedMotion } from './capability'

gsap.registerPlugin(ScrollTrigger)

/** Where the page fights back. Scene 05 — everything has stopped and he cannot go on. */
const STOP: readonly [number, number] = [0.452, 0.508]
const BASE_WHEEL = 1
const BASE_TOUCH = 1
const BASE_DURATION = 1.05

export interface Scroll {
  /** current story position, 0 to 1 */
  get(): number
  /** pin the story to an exact position for capture; null hands control back to the wheel */
  setOverride(p: number | null): void
  /** move to a story position — used by the keyboard route and the skip link */
  goTo(p: number): void
  lenis: Lenis | null
}

export function initScroll(): Scroll {
  let progress = 0
  let override: number | null = null

  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight

  // Reduced motion means no smoothing, no easing and nothing that resists the wheel. Lenis is not
  // started at all — native scroll is the honest answer, not Lenis configured to feel native.
  if (reducedMotion) {
    ScrollTrigger.create({
      trigger: '#space',
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        progress = self.progress
      },
    })
    return {
      get: () => override ?? progress,
      setOverride: (p) => {
        override = p === null ? null : clamp01(p)
      },
      goTo: (p) => window.scrollTo({ top: maxScroll() * clamp01(p), behavior: 'auto' }),
      lenis: null,
    }
  }

  const lenis = new Lenis({ duration: BASE_DURATION })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((t) => lenis.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)

  /**
   * The stop, made physical: for about half a screen the wheel stops being worth as much and the
   * page takes longer to catch up. You feel it before you can name it, which is the idea — he has
   * run out of road and so, briefly, have you.
   *
   * `wheelMultiplier` is read on every wheel event, but off the VirtualScroll's own options object
   * — Lenis copies the value in at construction rather than sharing `lenis.options`, so setting it
   * there does nothing. Checked against lenis 1.3.26; guarded so a change upstream degrades to
   * normal scrolling rather than throwing.
   */
  const vs = (lenis as unknown as { virtualScroll?: { options?: Record<string, number> } })
    .virtualScroll
  let lastK = -1

  function resist(p: number) {
    const k = smoothstep(STOP[0], STOP[0] + 0.018, p) * (1 - smoothstep(STOP[1] - 0.012, STOP[1], p))
    if (Math.abs(k - lastK) < 0.01) return
    lastK = k
    if (vs?.options) {
      vs.options.wheelMultiplier = BASE_WHEEL * (1 - 0.6 * k)
      vs.options.touchMultiplier = BASE_TOUCH * (1 - 0.6 * k)
    }
    lenis.options.duration = BASE_DURATION * (1 + 1.1 * k)
  }

  ScrollTrigger.create({
    trigger: '#space',
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: (self) => {
      progress = self.progress
      resist(progress)
    },
  })

  return {
    get: () => override ?? progress,
    setOverride: (p) => {
      override = p === null ? null : clamp01(p)
      // never leave the page heavy because a capture parked it inside the stop
      if (override === null) lastK = -1
      else resist(0)
    },
    goTo: (p) => lenis.scrollTo(maxScroll() * clamp01(p), { duration: 1.1 }),
    lenis,
  }
}

import { reducedMotion } from './capability'

/**
 * The loading screen: the d, breathing.
 *
 * The whole thing exists to set up one moment. The scarlet dot floating above the d rises and
 * falls while the site loads, then the rest of the letter blows apart and that same dot — the same
 * DOM element, never swapped, never faded and replaced — flies to wherever the film's head is and
 * hands over. Nothing cuts. The dot you watched waiting is the head you then follow for thirteen
 * viewports, which is also exactly what the submark says: the head is detached, and it is a person.
 *
 * Two things make it work rather than merely happen:
 *
 *   The dot's target is asked for at hand-off time from the live projection, not stored as a
 *   constant. If the two ever disagree by a few pixels the eye catches the jump immediately.
 *
 *   There is a floor on how long this is on screen. First paint is 80ms, so without one the whole
 *   sequence would be a flicker — a brand moment nobody sees is worse than no brand moment.
 */

/**
 * Roughly two breaths before it lets go. Long enough to be a moment, short enough that nobody
 * waits on it — the sequence lands at about three seconds end to end.
 */
const MIN_MS = 1800
const DOT_CX = 424 / 720 // the scarlet dot's centre in the submark's own viewBox
const DOT_CY = 216 / 720
const DOT_R = 16 / 720

export interface Preloader {
  /** resolves once the film owns the frame and scrolling should be released */
  run(headTarget: () => { x: number; y: number; r: number }): Promise<void>
}

export function createPreloader(): Preloader {
  const root = document.getElementById('preload')!
  const markBox = root.querySelector('.pl-mark') as HTMLElement
  const dot = root.querySelector('.pl-dot') as HTMLElement
  const pct = root.querySelector('.pl-pct') as HTMLElement

  let marks: SVGElement[] = []
  let ready = false

  // the letter itself, minus its scarlet dot — that one is a DOM element so it can outlive the SVG
  const svg = fetch('/logo/submark.svg')
    .then((r) => r.text())
    .then((txt) => {
      markBox.innerHTML = txt
      const el = markBox.querySelector('svg')!
      el.removeAttribute('width')
      el.removeAttribute('height')
      el.querySelectorAll('.cls-1').forEach((n) => n.remove())

      // Each dot gets wrapped in a group, and the group is what animates.
      //
      // The rects carry their own `transform="translate(...) rotate(-180)"` from Illustrator —
      // harmless, since it is a half-turn about each circle's own centre. But `transform-box:
      // fill-box` re-bases that translate against the element's bounding box instead of user
      // space, which flings every dot several hundred units down and right. A wrapper has no
      // transform of its own, so there is nothing to re-base.
      marks = Array.from(el.querySelectorAll<SVGElement>('rect, path')).map((node) => {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        node.parentNode!.insertBefore(g, node)
        g.appendChild(node)
        g.setAttribute('class', 'pl-el')
        return g as unknown as SVGElement
      })
    })
    .catch(() => {})

  async function run(headTarget: () => { x: number; y: number; r: number }) {
    const t0 = performance.now()
    await Promise.race([
      Promise.all([svg, document.fonts.ready]),
      new Promise((r) => setTimeout(r, 4000)),
    ])
    ready = true
    place()

    if (reducedMotion) {
      // no bounce, no scatter — the mark is simply there, and then it is not
      await wait(Math.max(0, 700 - (performance.now() - t0)))
      root.style.opacity = '0'
      await wait(240)
      root.remove()
      return
    }

    await breathe(t0)
    await scatter()
    await fly(headTarget())
    root.remove()
  }

  /** the dot's rest position, from the SVG's own geometry rather than guessed offsets */
  function place() {
    const b = markBox.getBoundingClientRect()
    const side = Math.min(b.width, b.height)
    const left = b.left + (b.width - side) / 2
    const top = b.top + (b.height - side) / 2
    const r = side * DOT_R
    dot.style.width = dot.style.height = `${r * 2}px`
    home = { x: left + side * DOT_CX, y: top + side * DOT_CY, r }
    move(home.x, home.y, 1)
  }

  let home = { x: 0, y: 0, r: 0 }

  function move(x: number, y: number, scale: number) {
    dot.style.transform = `translate(${x - home.r}px, ${y - home.r}px) scale(${scale})`
  }

  /**
   * Rising and falling — slower up than down, and a beat of stillness at the top. An even sine
   * reads as a machine; the pause is what makes it read as waiting.
   */
  function breathe(t0: number): Promise<void> {
    return new Promise((done) => {
      const CYCLE = 950
      // In dot radii. The submark's dot is only 4.4% of the mark's width, so a rise measured in
      // "grid cells" is a ten-pixel twitch that reads as a rendering glitch rather than a breath.
      const RISE = 3.2
      ;(function frame(now: number) {
        const el = now - t0
        const t = (el % CYCLE) / CYCLE
        const lift = t < 0.55 ? ease(t / 0.55) : 1 - ease((t - 0.55) / 0.45)
        const hold = t > 0.46 && t < 0.6 ? 1 : lift
        move(home.x, home.y - home.r * RISE * hold, 1 + 0.06 * hold)
        pct.textContent = String(
          Math.min(100, Math.round((el / MIN_MS) * 100)),
        ).padStart(3, '0')

        // Leave only at the bottom of a breath, so it never snaps out mid-rise. The window is wide
        // enough that it catches the first pass after the minimum rather than waiting out another
        // whole cycle, which was adding well over a second for nothing.
        const settled = t > 0.88 || t < 0.12
        if (ready && el > MIN_MS && settled) {
          move(home.x, home.y, 1)
          pct.textContent = '100'
          done()
          return
        }
        requestAnimationFrame(frame)
      })(performance.now())
    })
  }

  /**
   * The letter comes apart. Each dot flies outward from the centre of the mark, and the ones
   * furthest from the scarlet dot go first — so the eye is never invited to follow anything but
   * the dot that is about to become a person.
   */
  function scatter(): Promise<void> {
    const b = markBox.getBoundingClientRect()
    const cx = b.left + b.width / 2
    const cy = b.top + b.height / 2
    const withDist = marks.map((m) => {
      const r = m.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      return { m, x, y, d: Math.hypot(x - home.x, y - home.y) }
    })
    const far = Math.max(...withDist.map((w) => w.d)) || 1
    for (const w of withDist) {
      const dx = (w.x - cx) * 1.7 + (w.x - home.x) * 0.25
      const dy = (w.y - cy) * 1.7 + (w.y - home.y) * 0.25
      w.m.style.transitionDelay = `${Math.round((1 - w.d / far) * 220)}ms`
      w.m.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(0.2)`
      w.m.style.opacity = '0'
    }
    return wait(470)
  }

  /** the dot's flight to the head, arcing rather than sliding, and matching its size on arrival */
  function fly(to: { x: number; y: number; r: number }): Promise<void> {
    const from = { ...home }
    const lift = Math.min(90, Math.abs(to.y - from.y) * 0.35 + 26)
    const DUR = 620
    return new Promise((done) => {
      const t0 = performance.now()
      ;(function frame(now: number) {
        const t = Math.min(1, (now - t0) / DUR)
        const e = ease(t)
        const x = from.x + (to.x - from.x) * e
        const y = from.y + (to.y - from.y) * e - Math.sin(t * Math.PI) * lift
        move(x, y, (from.r + (to.r - from.r) * e) / from.r)
        if (t < 1) return requestAnimationFrame(frame)
        // one frame of overlap, then the film has it
        root.style.opacity = '0'
        setTimeout(done, 90)
      })(performance.now())
    })
  }

  return { run }
}

/** power4.inOut — the site's easing for anything decisive */
const ease = (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2)
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

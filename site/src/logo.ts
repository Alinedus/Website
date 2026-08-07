/**
 * The sign-off: the primary logo assembling itself out of its own SVG.
 *
 * Not a redraw. This loads the real Primary Logo file and animates its actual elements, so the
 * logo that lands at the end of the film is the logo in the brand pack, down to the last dot.
 *
 * It arrives in the order the mark was drawn:
 *
 *   1. the drafting grid, the surface everything else is set out on
 *   2. the d, right to left — held alone for a beat, because that shape is what he has been
 *      standing in for the whole film
 *   3. the rest of the word, arriving leftward around it
 *   4. the two scarlet dots, last — the head lands on a word that already exists
 *   5. the tagline, typing itself left to right
 */

const PHASES = {
  grid: [0.0, 0.17] as const,
  d: [0.17, 0.4] as const,
  rest: [0.52, 0.85] as const,
  dots: [0.85, 0.92] as const,
  tag: [0.92, 1.0] as const,
}

export interface LogoView {
  el: HTMLElement
  ready: Promise<void>
  /**
   * 0 to 1 across the whole sign-off. `landed` is the d's dot: it is the only element the logo
   * does not reveal on its own schedule, because the film is flying it in from the other side of
   * the screen and it may not appear until it arrives.
   */
  reveal(t: number, landed?: boolean): void
  /**
   * Where the d's dot will land, in screen pixels, or null before the SVG is in.
   *
   * Readable while the dot is still hidden: `.logo-el` scales about its own centre with
   * `transform-box: fill-box`, so scale(0) collapses the box *to the right point* rather than to
   * the origin. The radius cannot be read the same way — it is zero — so it comes from the SVG's
   * own scale instead.
   */
  dotAt(): { x: number; y: number; r: number } | null
}

export function createLogo(): LogoView {
  const el = document.createElement('div')
  el.id = 'logo'
  el.setAttribute('aria-hidden', 'true')
  document.getElementById('stage')!.appendChild(el)

  let grid: SVGElement[] = []
  let word: SVGElement[] = []
  let dots: SVGElement[] = []
  let tag: SVGElement[] = []
  let dCount = 0
  /** the d's dot — held back for the head, and not part of `dots` */
  let dDot: SVGElement | null = null
  let svgEl: SVGSVGElement | null = null
  let landedNow = false
  const shown = new Map<SVGElement[], number>()

  const view: LogoView = { el, ready: Promise.resolve(), reveal, dotAt }

  view.ready = fetch('/logo/primary.svg')
    .then((r) => r.text())
    .then((txt) => {
      el.innerHTML = txt
      const svg = el.querySelector('svg')!
      svgEl = svg
      svg.removeAttribute('width')
      svg.removeAttribute('height')

      grid = Array.from(svg.querySelectorAll<SVGElement>('line'))
      for (const g of grid) g.classList.add('logo-grid')

      // cls-2 is the scarlet ink: the two dots are rects, the tagline is outlined paths.
      // The rightmost of the two is the d's — his head — and it is pulled out of the sequence so
      // the film can deliver it. The i's tittle still arrives on the logo's own schedule.
      const scarlet = Array.from(svg.querySelectorAll<SVGElement>('rect.cls-2'))
      const dRect = scarlet.reduce<SVGElement | null>(
        (best, e) => (!best || xOf(e) > xOf(best) ? e : best),
        null,
      )
      dots = wrap(scarlet.filter((e) => e !== dRect))
      if (dRect) {
        dDot = wrap([dRect])[0]
        // Its own class, with no scale transition: the head arrives at this exact spot at this
        // exact size and the two swap in a single frame. A 420ms scale-up would read as the dot
        // growing out of nothing right after something else landed on the same pixel.
        dDot.setAttribute('class', 'logo-land')
      }
      tag = wrap(Array.from(svg.querySelectorAll<SVGElement>('path.cls-2')).sort((a, b) => xOf(a) - xOf(b)))

      const ink = Array.from(svg.querySelectorAll<SVGElement>('rect, path')).filter(
        (e) => !e.classList.contains('cls-2') && !e.closest('.logo-el'),
      )
      ink.sort((a, b) => xOf(b) - xOf(a))
      // one letter's worth in from the right edge — that is the d
      const maxX = ink.length ? xOf(ink[0]) : 0
      dCount = ink.filter((e) => xOf(e) > maxX - 62).length
      word = wrap(ink)

      reveal(0)
    })
    .catch(() => {
      /* the static copy in #doc still carries the wordmark's meaning */
    })

  /** Groups, not the elements themselves — these carry Illustrator transforms that `fill-box`
   *  would otherwise re-base and fling across the canvas. */
  function wrap(nodes: SVGElement[]): SVGElement[] {
    return nodes.map((node) => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      node.parentNode!.insertBefore(g, node)
      g.appendChild(node)
      g.setAttribute('class', 'logo-el')
      return g as unknown as SVGElement
    })
  }

  function take(list: SVGElement[], n: number) {
    const want = Math.max(0, Math.min(list.length, Math.round(n)))
    const have = shown.get(list) ?? 0
    if (want === have) return
    if (want > have) for (let i = have; i < want; i++) list[i].classList.add('on')
    else for (let i = want; i < have; i++) list[i].classList.remove('on')
    shown.set(list, want)
  }

  function reveal(t: number, landed = false) {
    if (!word.length) return
    take(grid, ramp(t, PHASES.grid) * grid.length)
    // the d first, then a beat of nothing, then the rest of the word coming in behind it
    take(word, ramp(t, PHASES.d) * dCount + ramp(t, PHASES.rest) * (word.length - dCount))
    take(dots, ramp(t, PHASES.dots) * dots.length)
    take(tag, ramp(t, PHASES.tag) * tag.length)
    if (dDot && landed !== landedNow) {
      dDot.classList.toggle('on', landed)
      landedNow = landed
    }
  }

  function dotAt() {
    if (!dDot || !svgEl) return null
    const b = dDot.getBoundingClientRect()
    if (!b.width && !b.height && !b.left) return null
    const node = dDot.firstElementChild
    const box = svgEl.getBoundingClientRect()
    const vb = svgEl.viewBox.baseVal
    const k = vb && vb.width ? box.width / vb.width : 1
    const w = parseFloat(node?.getAttribute('width') || '0') * k
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: w / 2 }
  }

  return view
}

const ramp = (t: number, [a, b]: readonly [number, number]) =>
  t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a)

function xOf(e: SVGElement): number {
  if (e.tagName === 'rect') return parseFloat(e.getAttribute('x') || '0')
  const m = (e.getAttribute('d') || '').match(/-?\d*\.?\d+/)
  return m ? parseFloat(m[0]) : 0
}

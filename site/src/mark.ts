import { clamp01, smoothstep } from './scenes'

/**
 * The mark in the top-left corner: the d, all the way through.
 *
 * It is not a static badge. Its scarlet dot is doing the same thing his head is doing, at every
 * moment of the film — so for the whole of Act I the corner mark sits *incomplete*, its head
 * floating clear of the letter, exactly as he does. When his head comes off at the stop, the
 * corner dot rises with it. When it comes down and cuts the loop, the corner dot lands home and
 * the d is finally whole.
 *
 * Which means the logo resolves at the same instant the story does. Most people will never
 * consciously notice; they will notice that the end feels settled.
 *
 * Between those beats there is a very slow breath — small enough to read as alive rather than as
 * something demanding attention for thirteen viewports.
 */

/**
 * The d's dot sits about 20 units clear of its stem in the wordmark's own coordinates — a quarter
 * of the gap in the submark, because the letters are drawn much smaller inside the same 720 box.
 */
const GAP = 20

export interface Mark {
  update(p: number, headLift: number): void
}

export function createMark(onClick: () => void): Mark {
  const root = document.getElementById('mark') as HTMLButtonElement
  root.addEventListener('click', onClick)

  let dotG: SVGGElement | null = null
  let lastLift = -1
  let lastPop = -1

  fetch('/logo/wordmark.svg')
    .then((r) => r.text())
    .then((txt) => {
      root.innerHTML = txt
      const svg = root.querySelector('svg')!
      svg.removeAttribute('width')
      svg.removeAttribute('height')
      // crop to the word — the file's own box is mostly empty space around it
      svg.setAttribute('viewBox', '192 300 336 118')

      // Wrapped, not transformed directly: these rects carry Illustrator's own transform
      // attribute, and `transform-box: fill-box` would re-base it and fling them off-canvas.
      // The wordmark has two scarlet dots — the i's tittle and the d's. Only the d's is his head,
      // so only the rightmost one moves; the tittle stays exactly where it belongs.
      const scarlet = Array.from(svg.querySelectorAll<SVGElement>('.cls-1'))
      const dDot = scarlet.reduce<SVGElement | null>(
        (best, e) => (!best || xOf(e) > xOf(best) ? e : best),
        null,
      )

      const els = Array.from(svg.querySelectorAll<SVGElement>('rect, path'))
      const wrapped = els.map((node) => {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        node.parentNode!.insertBefore(g, node)
        g.appendChild(node)
        g.setAttribute(
          'class',
          node === dDot ? 'mark-dot' : node.classList.contains('cls-1') ? 'mark-tittle' : 'mark-el',
        )
        return { g, node, x: xOf(node) }
      })

      // The dot gets two nested groups. The outer one is the story — JS writes it, and only when
      // the value actually changes. The inner one carries the idle breath as a CSS keyframe, so
      // that runs on the compositor instead of forcing an SVG transform write every single frame
      // and defeating the guard on the outer one.
      const hit = wrapped.find((w) => w.node === dDot)
      if (hit) {
        const inner = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        inner.setAttribute('class', 'mark-breath')
        hit.g.insertBefore(inner, hit.node)
        inner.appendChild(hit.node)
        dotG = hit.g as SVGGElement
      }

      // Hover ripples left to right across the word. The delay comes from each dot's position,
      // not its index — the wordmark has 140 of them, and one step per element would drag the
      // ripple out to a second and a half.
      const letters = wrapped.filter((w) => w.g.getAttribute('class') === 'mark-el')
      const lo = Math.min(...letters.map((w) => w.x))
      const hi = Math.max(...letters.map((w) => w.x))
      const span = hi - lo || 1
      for (const w of letters) {
        w.g.style.transitionDelay = `${Math.round(((w.x - lo) / span) * 240)}ms`
      }
    })
    .catch(() => {
      root.textContent = 'alined'
    })

  function update(p: number, headLift: number) {
    if (!dotG) return

    // Act I keeps the head off the letter; the cut brings it home for good.
    const actOne = 1 - smoothstep(0.502, 0.53, p)
    const lift = clamp01(actOne * Math.max(0.42, headLift))

    // and the same impact his head gets when it strikes the ring
    const pop = 1 + 0.9 * smoothstep(0.518, 0.5275, p) * (1 - smoothstep(0.5275, 0.545, p))

    const l = +lift.toFixed(3)
    const q = +pop.toFixed(3)
    if (l !== lastLift || q !== lastPop) {
      dotG.style.transform = `translateY(${(-lift * GAP * 0.62).toFixed(1)}px) scale(${pop.toFixed(3)})`
      lastLift = l
      lastPop = q
    }
  }

  return { update }
}

function xOf(e: SVGElement): number {
  if (e.tagName === 'rect') return parseFloat(e.getAttribute('x') || '0')
  const m = (e.getAttribute('d') || '').match(/-?\d*\.?\d+/)
  return m ? parseFloat(m[0]) : 0
}

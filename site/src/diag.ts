/**
 * A readout you can hold in your hand.
 *
 * The mobile failure does not reproduce in a desktop browser at a phone's viewport, with touch,
 * the real preloader and real scrolling — not in Chromium, at any size. So it is not the viewport,
 * and it is not something the emulator models. That leaves the device itself, and the only way to
 * see what a device is doing is to ask it on the device.
 *
 * `?hud` puts this on screen. It reads the values that separate the standing theories from each
 * other, so one screenshot taken while the film is wrong settles which of them it is:
 *
 *   p stuck, everything else healthy      the film is not advancing — scroll, not rendering
 *   ctx lost = yes                        the context was reclaimed; the canvas is dead
 *   p advancing, ctx alive, nothing drawn  the camera or the geometry, not the plumbing
 *   resizes climbing as you scroll         the URL bar is churning innerHeight under the layout
 *
 * It reads the film's own progress and fps off the existing dev HUD rather than being wired into
 * the loop, so this file observes and changes nothing. Its styles are inline for the same reason:
 * style.css has moved on main, and a diagnostic is not worth a merge conflict.
 */

const LIVE = [
  'p now/max',
  'p drops',
  'y drops',
  'lenis vs y',
  'ST end',
  'doc h',
  'logo on',
  'measurings',
  'film age',
  'raf',
  'fps',
  'ctx lost',
  'buffer',
  'canvas css',
  'inner',
  'visual vp',
  'dpr',
  'scrollY',
  'resizes',
  'inner h seen',
  'last error',
] as const

const CAUGHT = [
  'rule',
  'frame / t',
  'p before',
  'p at',
  'p delta',
  'p max',
  'p trail',
  'scrollY before',
  'scrollY at',
  'scrollY delta',
  'lenis scroll',
  'lenis vs y',
  'doc h',
  'ST end',
  'inner h',
  'visual vp h',
  'resizes',
  'logo on',
  'measuring',
] as const

interface ScrollLike {
  get(): number
  lenis: { scroll?: number; targetScroll?: number; limit?: number } | null
}

export function createDiag(scroll?: ScrollLike): void {
  const box = document.createElement('div')
  box.id = 'diag'
  box.setAttribute('aria-hidden', 'true')
  box.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'z-index:9999',
    'max-width:100vw',
    'padding:8px 10px',
    'background:rgba(0,0,0,0.82)',
    'color:#EFEFEF',
    'font:11px/1.45 ui-monospace,Menlo,Consolas,monospace',
    'white-space:pre',
    'pointer-events:none',
    '-webkit-user-select:none',
  ].join(';')
  document.body.appendChild(box)

  /* The URL bar slides as you scroll and innerHeight moves with it. Counting the resizes, and
     keeping the range of heights seen, is what tells that story after the fact — a screenshot of
     a single moment cannot. */
  let resizes = 0
  let hMin = Infinity
  let hMax = -Infinity
  const seeHeight = () => {
    hMin = Math.min(hMin, innerHeight)
    hMax = Math.max(hMax, innerHeight)
  }
  seeHeight()
  addEventListener('resize', () => {
    resizes++
    seeHeight()
  })

  /* Errors never reach a phone's console. Anything thrown from here on is held and shown. */
  let lastError = '—'
  addEventListener('error', (e) => {
    lastError = `${e.message ?? e.type}`.slice(0, 64)
  })
  addEventListener('unhandledrejection', (e) => {
    lastError = `rejection: ${String((e as PromiseRejectionEvent).reason).slice(0, 52)}`
  })

  /*
   * Two clocks, deliberately separate.
   *
   * `raf` is this file's own frame count. It proves the browser is still animating the page at
   * all. `film age` is how long it has been since main.ts's loop last wrote a new progress value.
   *
   * The pair is what distinguishes a film that is idle from a film that is dead. tick() in
   * main.ts ends by asking for the next frame, so anything thrown inside it — from stage.update,
   * from ui.update, from any of the four calls in between — takes the request with it and the
   * loop never runs again. Nothing catches it and nothing reports it. The page carries on
   * scrolling, because Lenis and ScrollTrigger ride gsap's ticker and not this loop, so what is
   * left is a page that scrolls under a picture that has stopped: the copy frozen on whichever
   * scene it had reached, the geometry frozen with it.
   *
   * If raf is climbing while film age keeps growing, that is what has happened, and `last error`
   * says why.
   */
  /* ------------------------------------------------------ first anomaly */
  /*
   * What counts as wrong, and why each rule is drawn where it is.
   *
   * The starting state must never trip this. At p = 0 the logo has nothing on: reveal() is called
   * once with 0 as soon as the SVG lands, ramp() returns 0 for every phase at t = 0, so no element
   * carries `on`, and the d's dot is held back until p >= HANDBACK.fly[1], which is 0.9865. So an
   * element carrying `on` below the reveal range is already abnormal, and the count being zero at
   * rest is what makes that safe to test.
   *
   * R5 is the one a frame sampler cannot see. fitLogo() puts `measuring` on #logo, reads the
   * glyphs and takes it off again inside one synchronous block, and CSS gives that class
   * `transform: scale(1)` on every `.logo-el` — it outranks the scale(0) they normally sit at, so
   * for the duration of that class the whole wordmark is full size whatever `on` says. The comment
   * on the rule reasons that nothing is painted in between, which holds only if the browser does
   * not composite mid-block. fitLogo is bound to resize, and on a phone resize fires continuously
   * while the URL bar slides, so this runs over and over during exactly the scrolling where the
   * wordmark is reported. A MutationObserver sees the class arrive even when it is gone before the
   * next frame; requestAnimationFrame does not.
   */
  const LOGO_MAX = 0.9 // clear of the 0.942 the reveal starts at
  const P_JUMP = 0.05 // one frame of ordinary scrolling moves p by far less
  const P_FALL = 0.05 // having reached the end, this much back down is a fall
  const P_VS_Y = 0.08 // p against scrollY/limit, generous for Lenis's smoothing

  interface Snap {
    p: number
    y: number
    t: number
    frame: number
  }
  const trail: number[] = []
  let prev: Snap | null = null
  let caught: Record<(typeof CAUGHT)[number], string> | null = null
  let measurings = 0
  const born = performance.now()

  const logoEl = document.getElementById('logo')
  const logoOn = () => logoEl?.querySelectorAll('.on').length ?? 0
  const measuringNow = () => logoEl?.classList.contains('measuring') ?? false
  const limitOf = () =>
    scroll?.lenis?.limit ?? document.documentElement.scrollHeight - innerHeight

  function capture(rule: string, at: Snap, before: Snap | null) {
    if (caught) return
    const vv = window.visualViewport
    caught = {
      rule,
      'frame / t': `${at.frame} / ${(at.t / 1000).toFixed(2)}s`,
      'p before': before ? before.p.toFixed(4) : '—',
      'p at': at.p.toFixed(4),
      'p delta': before ? `${at.p - before.p >= 0 ? '+' : ''}${(at.p - before.p).toFixed(4)}` : '—',
      'p max': pMax.toFixed(4),
      'p trail': trail.map((v) => v.toFixed(3)).join(' '),
      'scrollY before': before ? String(Math.round(before.y)) : '—',
      'scrollY at': String(Math.round(at.y)),
      'scrollY delta': before ? `${at.y - before.y >= 0 ? '+' : ''}${Math.round(at.y - before.y)}` : '—',
      'lenis scroll': typeof scroll?.lenis?.scroll === 'number' ? String(Math.round(scroll.lenis.scroll)) : '—',
      'lenis vs y':
        typeof scroll?.lenis?.scroll === 'number' ? String(Math.round(scroll.lenis.scroll - at.y)) : '—',
      'doc h': String(document.documentElement.scrollHeight),
      'ST end': String(Math.round(limitOf())),
      'inner h': String(innerHeight),
      'visual vp h': vv ? String(Math.round(vv.height)) : 'n/a',
      resizes: String(resizes),
      'logo on': String(logoOn()),
      measuring: measuringNow() ? 'YES' : 'no',
    }
  }

  /*
   * R5 — the class that forces the wordmark full size, caught as it is applied.
   *
   * Reading the element's class inside the callback does not work: the callback is a microtask, so
   * it runs after fitLogo's synchronous block has both added `measuring` and taken it off again,
   * and by then the class says nothing happened. The records carry what was there before each
   * change, so the value *after* a change is the next record's oldValue, or the class as it stands
   * for the last one. A pair whose before lacks `measuring` and whose after has it is an episode,
   * however briefly it existed.
   */
  if (logoEl) {
    new MutationObserver((records) => {
      const cur = logoEl.className
      for (let i = 0; i < records.length; i++) {
        const before = records[i].oldValue ?? ''
        const after = i + 1 < records.length ? (records[i + 1].oldValue ?? '') : cur
        if (before.includes('measuring') || !after.includes('measuring')) continue
        measurings++
        const p = scroll?.get?.() ?? -1
        if (performance.now() - born < 1200) continue // the load's own fit, not a glitch
        if (p >= 0 && p < LOGO_MAX) {
          capture(
            'R5 measuring-forces-logo-visible',
            { p, y: window.scrollY, t: performance.now() - born, frame: rafs },
            prev,
          )
        }
      }
    }).observe(logoEl, { attributes: true, attributeFilter: ['class'], attributeOldValue: true })
  }

  let rafs = 0
  const countFrame = () => {
    rafs++
    sample()
    detect()
    requestAnimationFrame(countFrame)
  }
  requestAnimationFrame(countFrame)

  function detect() {
    const p = scroll?.get?.() ?? -1
    if (p < 0) return
    const y = window.scrollY
    const now: Snap = { p, y, t: performance.now() - born, frame: rafs }
    trail.push(p)
    if (trail.length > 8) trail.shift()

    if (!caught && now.t > 1200) {
      // R1 — the wordmark is on while progress is nowhere near its range
      if (logoOn() > 0 && p < LOGO_MAX) capture('R1 logo-on-below-reveal-range', now, prev)
      // R2 — progress leapt forward further than a frame of scrolling can
      else if (prev && p - prev.p > P_JUMP) capture('R2 p-jumped-up', now, prev)
      // R3 — progress had reached the reveal range and then fell out of it
      else if (pMax >= 0.942 && p < pMax - P_FALL) capture('R3 p-fell-from-end', now, prev)
      // R4 — progress disagrees with where the page actually is
      else {
        const lim = limitOf()
        if (lim > 0 && Math.abs(p - y / lim) > P_VS_Y) capture('R4 p-disagrees-with-scrollY', now, prev)
      }
    }
    prev = now
  }

  const canvas = document.getElementById('gl') as HTMLCanvasElement | null
  const hPct = document.getElementById('h-pct')
  const hFps = document.getElementById('h-fps')

  let lastTick = -1
  let lastTickAt = performance.now()

  /*
   * Accumulators, not a live trace.
   *
   * The question is whether progress ever runs backwards while a finger is going one way, and a
   * photograph of one instant cannot answer it — by the time the screen is captured the moment has
   * passed. So each of these keeps the worst thing it has seen since the page loaded, and one
   * screenshot taken at any point afterwards reports it.
   *
   * reveal() in logo.ts is a pure function of progress with no clock of its own, and main.ts is
   * its only caller, so the wordmark cannot appear unless progress genuinely passed 0.942. `p max`
   * is therefore the whole question: if it reads 9xx during a scroll through the middle of the
   * film, progress really did jump to the end, and the rest of these say which of the three ways
   * it got there.
   */
  let pMax = 0
  let pPrev = -1
  let pDrops = 0
  let pWorstDrop = 0
  let yPrev = -1
  let yDrops = 0
  let yWorstDrop = 0
  let lenisGap = 0
  let endMin = Infinity
  let endMax = -Infinity
  let docMin = Infinity
  let docMax = -Infinity

  function sample() {
    const p = scroll?.get?.() ?? -1
    if (p >= 0) {
      pMax = Math.max(pMax, p)
      if (pPrev >= 0 && p < pPrev - 0.004) {
        pDrops++
        pWorstDrop = Math.max(pWorstDrop, pPrev - p)
      }
      pPrev = p
    }
    const y = window.scrollY
    if (yPrev >= 0 && y < yPrev - 2) {
      yDrops++
      yWorstDrop = Math.max(yWorstDrop, yPrev - y)
    }
    yPrev = y

    /* Lenis writes window.scrollY itself, so the two should never disagree by much. If they do,
       the film is being driven from one number while the page is drawn at another. */
    const ls = scroll?.lenis?.scroll
    if (typeof ls === 'number') lenisGap = Math.max(lenisGap, Math.abs(ls - y))

    /* ScrollTrigger's end is the document height less the viewport, and the viewport is the thing
       a URL bar changes. If end moves, every progress value derived from it moves with it — the
       same scroll position becomes a different p, which is a jump nobody scrolled. */
    const lim = scroll?.lenis?.limit
    if (typeof lim === 'number' && lim > 0) {
      endMin = Math.min(endMin, lim)
      endMax = Math.max(endMax, lim)
    }
    const dh = document.documentElement.scrollHeight
    docMin = Math.min(docMin, dh)
    docMax = Math.max(docMax, dh)
  }

  /* getContext hands back the context that already exists rather than making a second one, so
     asking the canvas whether it is lost costs nothing and creates nothing. */
  const glOf = (c: HTMLCanvasElement | null): WebGLRenderingContext | null => {
    if (!c) return null
    try {
      return (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null
    } catch {
      return null
    }
  }

  const padLive = Math.max(...LIVE.map((f) => f.length))
  const padCaught = Math.max(...CAUGHT.map((f) => f.length))

  function tick() {
    const gl = glOf(canvas)
    const r = canvas?.getBoundingClientRect()
    const vv = window.visualViewport
    /* The heartbeat, not the progress value. p legitimately holds still whenever the reader is
       not scrolling, so a stalled p says nothing; a stalled frame count says the loop is gone. */
    const t = (window as unknown as { __tick?: number }).__tick ?? -1
    if (t !== lastTick) {
      lastTick = t
      lastTickAt = performance.now()
    }
    const age = Math.round(performance.now() - lastTickAt)

    const pNow = scroll?.get?.() ?? -1
    const values: Record<(typeof LIVE)[number], string> = {
      'p now/max': `${pNow < 0 ? '—' : pNow.toFixed(3)} / ${pMax.toFixed(3)}${
        pMax > 0.9 ? '  <-- REACHED THE END' : ''
      }`,
      'p drops': `${pDrops}  worst ${pWorstDrop.toFixed(3)}`,
      'y drops': `${yDrops}  worst ${Math.round(yWorstDrop)}px`,
      'lenis vs y': `${Math.round(lenisGap)}px max`,
      'ST end': endMin === Infinity ? '—' : `${Math.round(endMin)}–${Math.round(endMax)}`,
      'doc h': docMin === Infinity ? '—' : `${docMin}–${docMax}`,
      'logo on': String(logoOn()),
      measurings: String(measurings),
      'film age': age > 1500 ? `${age}ms  <-- LOOP DEAD` : `${age}ms`,
      raf: `${rafs} / film ${t}`,
      fps: hFps?.textContent ?? '—',
      'ctx lost': gl ? (gl.isContextLost() ? 'YES' : 'no') : 'NO CONTEXT',
      buffer: canvas ? `${canvas.width}x${canvas.height}` : '—',
      'canvas css': r ? `${Math.round(r.width)}x${Math.round(r.height)}` : '—',
      inner: `${innerWidth}x${innerHeight}`,
      'visual vp': vv ? `${Math.round(vv.width)}x${Math.round(vv.height)}` : 'n/a',
      dpr: String(devicePixelRatio),
      scrollY: String(Math.round(scrollY)),
      resizes: String(resizes),
      'inner h seen': hMin === Infinity ? '—' : `${hMin}–${hMax}`,
      'last error': lastError,
    }
    const live = LIVE.map((f) => `${f.padEnd(padLive)}  ${values[f]}`).join('\n')
    box.textContent = caught
      ? 'ANOMALY CAPTURED\n' +
        CAUGHT.map((f) => `${f.padEnd(padCaught)}  ${caught![f]}`).join('\n') +
        '\n\n--- live ---\n' +
        live
      : live
    setTimeout(tick, 250)
  }
  tick()
}

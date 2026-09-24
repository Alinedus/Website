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

const FIELDS = [
  'p',
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
  'doc h',
  'resizes',
  'inner h seen',
  'last error',
] as const

export function createDiag(): void {
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
  let rafs = 0
  const countFrame = () => {
    rafs++
    requestAnimationFrame(countFrame)
  }
  requestAnimationFrame(countFrame)

  const canvas = document.getElementById('gl') as HTMLCanvasElement | null
  const hPct = document.getElementById('h-pct')
  const hFps = document.getElementById('h-fps')

  let lastTick = -1
  let lastTickAt = performance.now()

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

  const pad = Math.max(...FIELDS.map((f) => f.length))

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

    const values: Record<(typeof FIELDS)[number], string> = {
      p: hPct?.textContent || '—',
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
      'doc h': String(document.documentElement.scrollHeight),
      resizes: String(resizes),
      'inner h seen': hMin === Infinity ? '—' : `${hMin}–${hMax}`,
      'last error': lastError,
    }
    box.textContent = FIELDS.map((f) => `${f.padEnd(pad)}  ${values[f]}`).join('\n')
    setTimeout(tick, 250)
  }
  tick()
}

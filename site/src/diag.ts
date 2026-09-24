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

  const canvas = document.getElementById('gl') as HTMLCanvasElement | null
  const hPct = document.getElementById('h-pct')
  const hFps = document.getElementById('h-fps')

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
    const values: Record<(typeof FIELDS)[number], string> = {
      p: hPct?.textContent ?? '—',
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

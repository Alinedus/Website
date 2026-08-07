import { createStage } from './stage'
import { createUI, staticDoc } from './ui'
import { createLogo } from './logo'
import { createMark } from './mark'
import { createPreloader } from './preloader'
import { initScroll } from './scroll'
import { reducedMotion, hasWebGL } from './capability'
import { VIEWPORTS, SCENES, HANDBACK, sceneAt, clamp01, smoothstep, quantise } from './scenes'

document.documentElement.style.setProperty('--viewports', String(VIEWPORTS))
document.getElementById('doc')!.innerHTML = staticDoc()
if (reducedMotion) document.documentElement.dataset.motion = 'reduced'

/* No WebGL means there is no film, so the written version stops being a fallback behind the
   canvas and becomes the site. Better an honest document than a black rectangle. */
if (!hasWebGL()) {
  document.documentElement.dataset.render = 'static'
  document.getElementById('gl')!.remove()
  document.getElementById('space')!.remove()
  document.getElementById('preload')!.remove()
  throw new Error('WebGL unavailable — serving the written version')
}

const canvas = document.getElementById('gl') as HTMLCanvasElement
const logo = createLogo()
const stage = createStage(canvas, () => logo.dotAt())
const ui = createUI()
const scroll = initScroll()
const mark = createMark(() => scroll.goTo(0))

/** The sign-off runs across the last scene; logo.ts owns the order things arrive in. */
const logoReveal = (p: number) => smoothstep(0.942, 1.0, p)

/* ------------------------------------------------------------------- dev hud */
const hud = document.getElementById('hud')!
const hPct = document.getElementById('h-pct')!
const hScene = document.getElementById('h-scene')!
const hFps = document.getElementById('h-fps')!

addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') hud.hidden = !hud.hidden
})

/* ---------------------------------------------------------------- keyboard */
/**
 * A scroll-driven film is unusable from a keyboard by default: the wheel is the only control and
 * there is nothing to tab to until the very end. Arrows and Page keys step scene by scene, Home
 * and End jump to either end, and the skip link goes straight to the contact details for anyone
 * who wants those and not the story.
 */
const STEP_KEYS: Record<string, number> = {
  ArrowDown: 1, ArrowRight: 1, PageDown: 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1,
}

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const el = document.activeElement
  if (el instanceof HTMLButtonElement || el instanceof HTMLAnchorElement) {
    if (e.key === ' ' || e.key === 'Enter') return
  }
  if (e.key === 'Home') return jump(0)
  if (e.key === 'End') return jump(1)
  const dir = STEP_KEYS[e.key]
  if (!dir) return
  const here = SCENES.indexOf(sceneAt(scroll.get()))
  const next = SCENES[Math.max(0, Math.min(SCENES.length - 1, here + dir))]
  jump(dir > 0 ? next.from + 0.004 : next.still)

  function jump(p: number) {
    e.preventDefault()
    scroll.goTo(p)
  }
})

document.getElementById('skip')!.addEventListener('click', () => scroll.goTo(1))

/* -------------------------------------------------------------------- loop */
let last = performance.now()
let acc = 0
let frames = 0

function tick(now: number) {
  const raw = scroll.get()
  // reduced motion snaps the story to one composed frame per beat; the spine still follows real
  // scroll, because a progress indicator that jumps is just broken
  const p = reducedMotion ? quantise(raw) : raw
  stage.update(p)
  ui.update(p, `#${stage.ink.getHexString()}`, `#${stage.inkDim.getHexString()}`, stage.readout, raw)
  // the d's dot is the one element the logo does not own: it turns on the frame his head arrives
  logo.reveal(logoReveal(p), p >= HANDBACK.fly[1])
  mark.update(p, stage.readout.headLift)

  frames++
  acc += now - last
  last = now
  if (acc > 500) {
    hPct.textContent = String(Math.round(p * 100)).padStart(3, '0')
    hScene.textContent = sceneAt(p).id
    hFps.textContent = String(Math.round((frames * 1000) / acc))
    frames = 0
    acc = 0
  }
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

/* --------------------------------------------------------------- preloader */
/**
 * The film renders behind the loading screen the whole time, so by the time the dot flies to the
 * head there is already a live frame underneath it to land on. Scrolling is held at zero until the
 * hand-off finishes — the head's screen position is only correct at p = 0, and a reader who
 * scrolled during the sequence would watch the dot fly to the wrong place.
 */
// ?instant skips straight to the film — for frame captures and for working on a scene without
// sitting through three seconds of logo every reload
if (new URLSearchParams(location.search).has('instant')) {
  document.getElementById('preload')!.remove()
} else {
  const preloader = createPreloader()
  document.documentElement.style.overflow = 'hidden'
  scroll.lenis?.stop()
  window.scrollTo(0, 0)

  preloader.run(() => stage.headScreen()).then(() => {
    document.documentElement.style.overflow = ''
    scroll.lenis?.start()
    window.scrollTo(0, 0)
  })
}

/* Deterministic hooks so the film can be driven to an exact story position for capture, without
   simulating scroll. Used by the Playwright contact-sheet pass. */
declare global {
  interface Window {
    __setProgress: (p: number) => void
    __useScroll: () => void
    __headAt: () => { x: number; y: number; r: number }
    __wheelMul: () => number
  }
}
window.__setProgress = (p: number) => scroll.setOverride(clamp01(p))
window.__useScroll = () => scroll.setOverride(null)
window.__headAt = () => stage.headScreen()
window.__wheelMul = () =>
  (scroll.lenis as unknown as { virtualScroll?: { options?: { wheelMultiplier: number } } })
    .virtualScroll?.options?.wheelMultiplier ?? -1

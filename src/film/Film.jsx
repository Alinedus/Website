import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import PointPool from './PointPool'
import LineLayer from './LineLayer'
import RedDot from './RedDot'
import CameraDirector from './CameraDirector'
import { buildFilm } from './context'
import { LOOKS, buildIntents, resolveRegister } from './direction'
import { RUNTIME_S, MOVEMENTS, MOVEMENT_WINDOWS, movementWeight, stateWeight } from './timeline'
import { PAPER, GRID, RED } from './tokens'
import { useScrollTarget, useReducedMotion, damp, range } from './useScrollProgress'
import PointerFX from './PointerFX'
import { createPointerState, usePointerListeners } from './pointer'
import { applyQualityOverride } from './quality'
import { initSmoothScroll, jumpToY } from './smoothScroll'

/**
 * THE FILM.
 *
 * One pinned stage. One canvas. One scroll progress. Seven movements that are
 * windows on a single continuous interpolation, not sections — which is what
 * makes "no hard scene changes" a property of the architecture rather than a
 * thing to be careful about.
 *
 * The technical review's budget is held here: one persistent Points buffer,
 * a handful of line layers, one billboarded dot. No render targets, no
 * post-processing library, no assets.
 */

/**
 * Pixels of scroll per second of film. Calibrated on movement 1, where ~4,500px
 * read as an unhurried 15-20 seconds.
 */
const PX_PER_SECOND = 265

/**
 * The frame's world half-height where the push-in begins. Grain and mark are
 * held at their true world size at or above this, and shrink in step with the
 * frame below it — so the hand-off into the movement is exactly continuous and
 * no other shot is touched.
 */
const SCREEN_LOCK_REF_H = 21

/** Blends the whole film's art direction into one look object per frame. */
function Director({ progress, scrollTarget, look, reduced, intents, quality }) {
  const { gl } = useThree()
  const smoothed = useRef(reduced ? 1 : 0)
  // Frame-time watchdog. The tier is a guess made from what the browser is
  // willing to admit about the hardware; this is the measurement. If the guess
  // was optimistic, resolution comes down rather than the frame rate.
  const perf = useRef({ acc: 0, n: 0, dpr: 0, dropped: false })
  const acc = useRef({ ink: new THREE.Color(), haze: new THREE.Color() })
  const clear = useRef(new THREE.Color(PAPER))

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)

    if (!perf.current.dropped && quality) {
      const w = perf.current
      w.acc += delta
      w.n += 1
      // Judge over a full second, and only after the first — the opening
      // frames include shader compilation and would condemn every device.
      if (w.acc > 1 && w.n > 20) {
        const avg = w.acc / w.n
        if (avg > 1 / 45) {
          const cur = gl.getPixelRatio()
          const next = Math.max(1, cur * 0.75)
          if (next < cur - 0.01) gl.setPixelRatio(next)
          else w.dropped = true
        } else {
          w.dropped = true // comfortably inside budget; stop watching
        }
        w.acc = 0
        w.n = 0
      }
    }

    // Damping the SCROLL — not the camera — is what makes this feel filmed.
    // The wheel is a stuttery input device; the lens must never inherit that.
    smoothed.current = reduced
      ? 1
      : damp(smoothed.current, scrollTarget.current, 5.2, dt)
    const P = smoothed.current
    progress.current = P

    // ── Blend every live movement's look ──────────────────────────────────
    const a = acc.current
    let w = 0
    let night = 0
    let motionAmp = 0
    let sizeScale = 0
    let maxPx = 0
    let redFrac = 0
    let stroke = 0
    let fogNear = 0
    let fogFar = 0
    let bestW = -1
    let motion = 0

    for (const m of MOVEMENTS) {
      const k = movementWeight(m.key, P)
      if (k <= 0) continue
      const L = LOOKS[m.key]
      // The REGISTER is blended as a scalar and resolved to colour afterwards.
      // Averaging the two palettes' colours directly is what put the film's
      // climax at 1.09:1 contrast — see resolveRegister in direction.js.
      night += L.night * k
      motionAmp += L.motionAmp * k
      sizeScale += L.sizeScale * k
      maxPx += L.maxPx * k
      redFrac += L.redFrac * k
      stroke += L.stroke * k
      fogNear += L.fogNear * k
      fogFar += L.fogFar * k
      w += k
      // Motion mode is an enum and cannot be averaged — the loudest movement
      // owns the character outright, which is also what the allocation intends.
      if (k > bestW) {
        bestW = k
        motion = L.motion
      }
    }

    if (w > 0.0001) {
      const L = look.current
      L.motion = motion
      L.motionAmp = motionAmp / w
      L.maxPx = maxPx / w
      L.stroke = stroke / w
      // A FRACTION of the frame, resolved to metres by the pool against the
      // live focus height. The dot's pool of attention is then the same size
      // to the eye in every shot, which is the only definition of it that
      // means anything.
      L.redRadius = (redFrac / w) * (L.focusHalfH || 10)
      L.fogNear = fogNear / w
      L.fogFar = fogFar / w

      const reg = resolveRegister(night / w, a.ink, a.haze)
      L.ink.copy(a.ink)
      L.haze.copy(a.haze)
      L.soft = reg.soft
      L.blackout = reg.blackout
      L.reveal = 1

      // Movement 1 alone reveals the field in the dot's wake.
      const [, n1End] = MOVEMENT_WINDOWS.nothing
      if (P < n1End) {
        L.reveal = range(P, 0.03, n1End * 0.92)
      }

      // The dot shrinks as the camera pushes into the core, or it becomes a
      // wall of red at two units — but ONLY while that movement is lit. Keyed
      // to "past the push-in's start" it never released, so the mark stayed at
      // 45% through the finale and the lockup's dot came out smaller than a
      // letter bead.
      // ── The push-in is SCREEN-REFERRED ────────────────────────────────
      // Every other shot in the film frames a subject and holds it; this one
      // travels twenty times closer to something that is meant to be
      // self-similar at every scale. Under plain world-sized geometry that
      // approach multiplies everything by twenty: the mark became a wall of
      // red with a specular hit on it, and the field's grain grew past the
      // point-size clamp so every particle pinned to the same maximum and the
      // structure dissolved into identical cotton discs.
      //
      // So through this movement, and only this one, the pool's grain and the
      // mark's radius are driven by the camera's own working height. Their
      // APPARENT size is held while the structure opens up around them, which
      // is the thing the shot was always trying to say — the intelligence does
      // not grow, the world it understands does.
      L.screenLock = movementWeight('intelligence', P)
      L.dotScale = 1
      const shrink = Math.min(1, (L.focusHalfH || SCREEN_LOCK_REF_H) / SCREEN_LOCK_REF_H)
      L.sizeScale = (sizeScale / w) * (1 - L.screenLock * (1 - shrink))

      // Through the dip to black the dot is the only lit thing in the frame,
      // so it takes the room rather than merely surviving.
      L.dotAura = 0.17 + reg.soft * 0.16 + L.blackout * 0.55

      // The ground the film sits on IS the haze colour, so day→night is one
      // value moving and never a cross-fade between two backgrounds.
      if (!clear.current.equals(L.haze)) {
        clear.current.copy(L.haze)
        gl.setClearColor(clear.current, 1)
      }
    }
    void intents
  })

  return null
}

export default function Film() {
  const reduced = useReducedMotion()
  const [film, setFilm] = useState(null)
  const [failed, setFailed] = useState(false)
  const [visible, setVisible] = useState(true)

  const stageRef = useRef(null)
  const taglineRef = useRef(null)
  const cueRef = useRef(null)
  const ctaRef = useRef(null)
  const ctaLabelRef = useRef(null)
  const inkRef = useRef(null)

  const progress = useRef(reduced ? 1 : 0)
  const redPos = useRef(new THREE.Vector3(0, 0, 4))
  const look = useRef({
    motion: 0,
    motionAmp: 1,
    reveal: 0,
    sizeScale: 1,
    maxPx: 40,
    soft: 0,
    redRadius: 6,
    stroke: 1,
    focusHalfH: 10,
    fogNear: 3.4,
    fogFar: 16,
    dotScale: 1,
    screenLock: 0,
    blackout: 0,
    dotAura: 0.17,
    ink: new THREE.Color('#0d0d0d'),
    haze: new THREE.Color(PAPER),
  })

  const scrollTarget = useScrollTarget(!reduced)

  // Decided once, before anything is built. Density adapts; the film does not.
  const q = useMemo(() => applyQualityOverride(), [])

  // Momentum scrolling. The render loop already DAMPS the scroll, which smooths
  // the camera — but on a wheel the underlying target still arrives in discrete
  // notches, and no amount of damping downstream turns steps into momentum.
  // Lenis fixes the input rather than the symptom. It owns the scroll position
  // while it runs, so every programmatic jump goes through smoothScroll.js.
  useEffect(() => initSmoothScroll({ enabled: !reduced }), [reduced])

  // A handle for verification harnesses, which must drive the same scroll path
  // a real wheel does rather than one Lenis will overwrite.
  useEffect(() => {
    window.__filmScrollTo = jumpToY
    return () => delete window.__filmScrollTo
  }, [])

  // One pointer state for the whole site. Events only store coordinates; every
  // derived value is computed once per frame inside the render loop.
  const pointer = useRef(createPointerState())
  usePointerListeners(pointer.current, !reduced)

  useEffect(() => {
    let alive = true
    buildFilm({ count: q.pool })
      .then((f) => alive && setFilm(f))
      .catch((e) => {
        console.error('film build failed', e)
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [q])

  useEffect(() => {
    const el = stageRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      rootMargin: '10%',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const intents = useMemo(
    () => (film ? buildIntents(film.framing) : null),
    [film]
  )

  // Layer weights are refs so the line layers can read them in useFrame
  // without re-rendering React on every scroll event.
  const weights = useRef({})
  useEffect(() => {
    for (const m of MOVEMENTS) weights.current[m.key] = { current: 0 }
  }, [])

  const height =
    reduced || failed
      ? '100svh'
      : `calc(100svh + ${Math.round(RUNTIME_S * PX_PER_SECOND)}px)`

  return (
    <section
      id="hero"
      className={failed ? 'hero hero--failed' : 'hero'}
      style={{ height }}
      aria-label="ALINED — Design Intelligence Layer"
    >
      <div
        className={q.ink && !reduced ? 'hero__stage has-glyph-cursor' : 'hero__stage'}
        ref={stageRef}
      >
        {failed && (
          <div className="film__fallback">
            <p className="film__fallback-mark">alined</p>
            <p className="film__fallback-line">Design Intelligence Layer</p>
            <p className="film__fallback-note">
              The film needs WebGL, which this browser has not made available.
              ALINED is a sketch-first 3D modelling tool that reads
              architectural intent and turns drawings into spatial models.
            </p>
          </div>
        )}

        {film && intents && (
          <Canvas
            frameloop={visible ? 'always' : 'never'}
            dpr={q.dpr}
            gl={{ antialias: q.antialias, alpha: false, powerPreference: 'high-performance' }}
            camera={{ fov: 35, near: 0.1, far: 3000, position: [0, 0, 26] }}
            onCreated={({ gl }) => gl.setClearColor(PAPER, 1)}
            onError={() => setFailed(true)}
          >
            <Director
              progress={progress}
              scrollTarget={scrollTarget}
              look={look}
              reduced={reduced}
              intents={intents}
              quality={q}
            />
            <CameraDirector
              progress={progress}
              intents={intents}
              framing={film.framing}
              look={look}
              pointer={pointer.current}
              parallax={reduced ? 0 : q.parallax}
            />
            <PointerFX
              pointer={pointer}
              look={look}
              canvasRef={inkRef}
              ctaRef={ctaRef}
              labelRef={ctaLabelRef}
              enabled={!reduced && q.ink}
            />

            <FilmLayers film={film} progress={progress} look={look} />
            <Lockup
              film={film}
              progress={progress}
              taglineRef={taglineRef}
              ctaRef={ctaRef}
              cueRef={cueRef}
            />

            <PointPool
              states={film.states}
              count={film.count}
              order={film.order}
              look={look}
              progress={progress}
              redPos={redPos}
              pointer={pointer.current}
            />
            <RedDot
              progress={progress}
              wordmark={film.wordmark}
              framing={film.framing}
              redPos={redPos}
              look={look}
              pointer={pointer.current}
            />
          </Canvas>
        )}

        <p className="hero__tagline" ref={taglineRef} style={{ opacity: 0 }}>
          DESIGN INTELLIGENCE LAYER
        </p>

        {/* The invitation is DRAWN, never faded: its ring strokes itself on
            like every other line in the film, and the label arrives by
            letterspacing settling rather than by opacity. */}
        <div className="film__cta" ref={ctaRef}>
          <a
            className="film__cta-link"
            id="request-access"
            href="mailto:hello@alined.app?subject=ALINED%20access"
          >
            <svg className="film__cta-ring" viewBox="0 0 240 56" aria-hidden="true">
              <rect x="1" y="1" width="238" height="54" rx="27" pathLength="100" />
            </svg>
            <span className="film__cta-label" ref={ctaLabelRef}>
              Request access
            </span>
          </a>
        </div>

        {q.ink && <canvas className="film__ink" ref={inkRef} aria-hidden="true" />}

        <div className="hero__vignette" aria-hidden="true" />
        <div className="hero__grain" aria-hidden="true" />

        {/* The cue invites the FIRST scroll and then has no further business
            being on screen — least of all at the finale, where it was still
            pulsing directly beneath the invitation, telling the visitor to
            keep going at the exact moment the film asks them to stop. */}
        {!reduced && !failed && <div className="hero__cue" ref={cueRef} aria-hidden="true" />}

      </div>
    </section>
  )
}

/**
 * The lockup's furniture: the drafting grid the logotype is set on, the red
 * tittle of the "i", and the two pieces of DOM type.
 *
 * All of it belongs to the two states where the word is legible — the title
 * card at the end of movement 1, and the finale — so it is keyed to those and
 * absent everywhere else.
 *
 * The tittle is a real mark rather than a recoloured bead: at the sampling
 * lattice's pitch its footprint is two or three beads, and tinting them reads
 * as a short red dash instead of the single round dot the artwork draws.
 */
function Lockup({ film, progress, taglineRef, ctaRef, cueRef }) {
  const { size, camera } = useThree()
  const gridMat = useRef()
  const tittleMat = useRef()
  const tittleMesh = useRef()
  const anchor = useRef(new THREE.Vector3())
  const { wordmark } = film

  const gridPositions = useMemo(() => {
    const w = wordmark.width * 1.1
    const h = wordmark.height * 1.72
    const pitch = wordmark.dotRadius * 2.9
    const z = -1.1
    const out = []
    const nx = Math.ceil(w / 2 / pitch)
    const ny = Math.ceil(h / 2 / pitch)
    for (let i = -nx; i <= nx; i++) out.push(i * pitch, -h / 2, z, i * pitch, h / 2, z)
    for (let j = -ny; j <= ny; j++) out.push(-w / 2, j * pitch, z, w / 2, j * pitch, z)
    return new Float32Array(out)
  }, [wordmark])

  useFrame(() => {
    const P = progress.current
    // Legible at the title card and again at the finale, nowhere between.
    const card = stateWeight('wordmark', P)
    const finale = stateWeight('mark', P)
    const w = Math.max(card, finale)

    // ── The title card and the finale are NOT the same image ──────────────
    // They were: same state, same framing, same furniture, so the film ended
    // on a frame it had already shown at a quarter of the way through and had
    // no rising shape at all. The difference is the drafting grid. At the
    // TITLE CARD the name is a thing being set out — construction lines, a
    // mark still hunting for its place. At the FINALE the grid is struck and
    // the name simply IS, with the dot landed on it and an invitation under
    // it. Same subject, one act apart: drawn, then built.
    if (gridMat.current) gridMat.current.opacity = card * 0.32
    if (tittleMat.current) tittleMat.current.opacity = w
    if (tittleMesh.current)
      tittleMesh.current.scale.setScalar(wordmark.dotRadius * (wordmark.tittleScale ?? 1) * w)

    // The tagline is DOM — letterspaced 11px type has to be crisp and
    // selectable — but it is positioned by projecting the wordmark's own
    // anchor, so it is welded to the geometry rather than guessed at in CSS.
    //
    // How TALL the mark is on this screen is measured the same way, by
    // projecting its own top and bottom, because everything under it is spaced
    // against that. A logo's relationship to the line beneath it is
    // typographic — a proportion of its own height — not a percentage of a
    // viewport it knows nothing about.
    anchor.current.set(0, wordmark.bottomY, 0)
    anchor.current.project(camera)
    const baseY = (-anchor.current.y * 0.5 + 0.5) * size.height
    anchor.current.set(0, wordmark.bottomY + wordmark.height, 0)
    anchor.current.project(camera)
    const topY = (-anchor.current.y * 0.5 + 0.5) * size.height
    const markPx = Math.abs(baseY - topY)

    const el = taglineRef.current
    let tagBottom = baseY
    if (el) {
      const y = baseY + Math.min(64, Math.max(18, markPx * 0.26))
      el.style.transform = `translate(-50%, 0) translate3d(0px, ${
        y - size.height / 2
      }px, 0)`
      el.style.opacity = w
      el.style.letterSpacing = `${0.62 - (1 - w) * 0.22}em`
      tagBottom = y + el.offsetHeight
    }

    // The invitation arrives last, and only once. It is also the only large red
    // object in ninety seconds, by which time red has been taught to mean
    // "understood".
    const cta = ctaRef.current
    if (cta) {
      const k = Math.max(0, (finale - 0.45) / 0.55)
      cta.style.setProperty('--draw', k.toFixed(3))
      cta.style.pointerEvents = k > 0.6 ? 'auto' : 'none'

      // The invitation is spaced off the TAGLINE, by a proportion of the
      // mark's own measured height — so the lockup is ONE group at every
      // viewport instead of a mark near the top of the screen and a button
      // pinned to the bottom of it, which on a phone left a third of the page
      // of dead paper between them. Floored at 76px so the touch target never
      // crowds the type, capped so a large desktop mark cannot push it off the
      // page, and clamped into the frame so a camera mid-pull-back can never
      // park it out of sight.
      const drop = Math.min(210, Math.max(76, markPx * 0.52))
      const cy = Math.min(size.height - 104, Math.max(size.height * 0.5, tagBottom + drop))
      cta.style.setProperty('--cy', `${Math.round(cy)}px`)
    }

    // The scroll cue has done its job the moment the film starts moving.
    const cue = cueRef?.current
    if (cue) cue.style.opacity = (1 - range(P, 0.004, 0.045)).toFixed(3)
  })

  return (
    <>
      <lineSegments frustumCulled={false} renderOrder={0}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[gridPositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial ref={gridMat} color={GRID} transparent opacity={0} depthWrite={false} />
      </lineSegments>
      <mesh ref={tittleMesh} position={wordmark.tittle} renderOrder={3}>
        <sphereGeometry args={[1, 24, 18]} />
        <meshBasicMaterial ref={tittleMat} color={RED} toneMapped={false} transparent opacity={0} />
      </mesh>
    </>
  )
}

/**
 * The drawn layers, one per movement that has them. Each fades with its own
 * movement's weight, so across a hand-off two topologies are briefly co-present
 * — which, over a point pool that is genuinely continuous underneath, reads as
 * one thing becoming another rather than as a cross-fade.
 */
function FilmLayers({ film, progress, look }) {
  const focusDist = useRef({ current: 30 })
  // Keyed to STATES, not movements: a line layer draws the shape the points
  // are currently making, and must die with it.
  const w = useRef({
    architecture: { current: 0 },
    blueprint: { current: 0 },
    city: { current: 0 },
    network: { current: 0 },
  })
  const reveal = useRef({ current: 0 })

  useFrame(() => {
    const P = progress.current
    w.current.architecture.current = stateWeight('architecture', P)
    w.current.blueprint.current = stateWeight('blueprint', P)
    w.current.city.current = stateWeight('city', P)
    w.current.network.current = stateWeight('network', P)
    focusDist.current.current = look.current.focusDist || 30
    reveal.current.current = P < MOVEMENT_WINDOWS.nothing[1]
      ? range(P, 0.18, MOVEMENT_WINDOWS.nothing[1] * 0.95)
      : 1
  })

  const haze = look.current.haze.getStyle()

  return (
    <>
      <LineLayer
        positions={film.architecture.linePositions}
        order={film.architecture.lineOrder}
        color="#0d0d0d"
        haze={haze}
        opacity={0.62}
        weight={w.current.architecture}
        reveal={reveal.current}
        focusDist={focusDist.current}
      />
      {film.lines?.blueprint && (
        <LineLayer
          positions={film.lines.blueprint}
          color="#0d0d0d"
          haze={haze}
          opacity={0.7}
          weight={w.current.blueprint}
          focusDist={focusDist.current}
        />
      )}
      {film.lines?.city && (
        <LineLayer
          positions={film.lines.city}
          color="#0d0d0d"
          haze={haze}
          opacity={0.28}
          weight={w.current.city}
          focusDist={focusDist.current}
          fog={[0.9, 2.8]}
        />
      )}
      {film.lines?.network && (
        <LineLayer
          positions={film.lines.network}
          color="#f4efe4"
          haze="#0b0a09"
          opacity={0.34}
          weight={w.current.network}
          focusDist={focusDist.current}
          fog={[1.5, 5.0]}
        />
      )}
    </>
  )
}

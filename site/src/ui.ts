import { SCENES, sceneAt, smoothstep, clamp01, type Scene } from './scenes'
import { STATIONS, LAP_LINES, counters } from './stations'
import { ACT2, FORM_ENDPOINT, SIGNOFF, beatAt } from './act2'
import type { StageReadout } from './stage'

/**
 * The DOM layer: one block per scene, the station copy, the counters, and the spine.
 *
 * Scenes are fixed and cross-faded from scroll position rather than pinned by ScrollTrigger.
 * Pin-spacers make every range depend on the ones before it, which means retiming one beat
 * silently retimes the rest — with a continuous 3D timeline underneath, that is unworkable.
 *
 * Scenes 03 and 04 have no generic block: lap one is told by the stations and the acceleration by
 * the counters, so a headline saying "Lap one" would only be in the way.
 */

const SPINE_H = 1000
/** scenes that carry their own copy — a generic headline would only be in the way */
/* The hinge (06) is bare too — it is pure geometry, and its scene id and range were the only
   things still showing through, colliding with scene 05's copy on the way in.

   01 and 02 went bare when the station copy moved to the front of the film. They were carrying
   production notes — "the head comes off", "the circuit builds" — which is what the thing does,
   not what it means, and the real first line now lands over exactly that moment instead. */
const BARE = new Set(['01', '02', '03', '04', '06', '07', '09'])

export interface UI {
  /** `p` drives the story; `rawP` drives the spine, which tracks real scroll even when the story
   *  itself is snapping between stills for reduced motion */
  update(p: number, ink: string, inkDim: string, r: StageReadout, rawP: number): void
}

export function createUI(): UI {
  const stage = document.getElementById('stage')!
  const spine = document.getElementById('spine')!

  /* The film is decorative as far as assistive tech is concerned — #doc carries the same story in
     order, and having both read out would duplicate every line. The sign-off is the exception: it
     holds the only real controls on the page, so it stays in the tree. */
  stage.setAttribute('aria-hidden', 'true')

  /* ------------------------------------------------------------- scenes */
  const blocks = SCENES.filter((s) => !BARE.has(s.id)).map((s) => {
    const el = document.createElement('section')
    el.className = 'scene'
    el.dataset.act = String(s.act)
    el.setAttribute('aria-label', `Scene ${s.id} — ${s.label}`)
    // A scene with no note is one whose headline has to carry the moment on its own — no
    // descriptive line under it and no scroll range beside it. "Stuck in the endless design loop?"
    // followed by "46% – 50%" is not a question anybody answers.
    el.innerHTML = `
      <div class="scene-inner">
        <h2 class="scene-label">${s.label}</h2>
        ${s.note
          ? `<p class="scene-note">${s.note}</p>
             <p class="scene-range">${pct(s.from)} – ${pct(s.to)}</p>`
          : ''}
      </div>`
    stage.appendChild(el)
    return { s, el, inner: el.querySelector('.scene-inner') as HTMLElement }
  })

  /* ------------------------------------------------------ station block */
  const station = document.createElement('section')
  station.className = 'scene panel'
  station.innerHTML = `
    <div class="scene-inner">
      <h2 class="station-line" id="st-line"></h2>
      <p class="station-under" id="st-under"></p>
      <p class="station-cost"><span id="st-cost"></span> <i id="st-artifact"></i></p>
    </div>`
  stage.appendChild(station)
  const stLine = station.querySelector('#st-line') as HTMLElement
  const stUnder = station.querySelector('#st-under') as HTMLElement
  const stCost = station.querySelector('#st-cost') as HTMLElement
  const stArtifact = station.querySelector('#st-artifact') as HTMLElement

  /* ---------------------------------------------------- counters block */
  const accel = document.createElement('section')
  accel.className = 'scene panel'
  accel.innerHTML = `
    <div class="scene-inner">
      <h2 class="station-line" id="ac-line"></h2>
      <dl class="counters">
        <div><dt>revision</dt><dd id="c-rev">02</dd></div>
        <div><dt>day</dt><dd id="c-day">07</dd></div>
        <div><dt>fee remaining</dt><dd id="c-fee">93%</dd></div>
        <div class="stuck"><dt>progress toward execution</dt><dd id="c-prog">0%</dd></div>
      </dl>
    </div>`
  stage.appendChild(accel)
  const acLine = accel.querySelector('#ac-line') as HTMLElement
  const cRev = accel.querySelector('#c-rev') as HTMLElement
  const cDay = accel.querySelector('#c-day') as HTMLElement
  const cFee = accel.querySelector('#c-fee') as HTMLElement

  /* ------------------------------------------------------- act II beats */
  const beat = document.createElement('section')
  beat.className = 'scene panel'
  // No eyebrow. "07 / act 2 · the way out" was a scene number, an act number and an internal beat
  // key — production chrome on the four lines the whole site is arguing towards. The statement
  // carries itself.
  beat.innerHTML = `
    <div class="scene-inner">
      <h2 class="station-line" id="b-line"></h2>
      <p class="station-under" id="b-sub"></p>
    </div>`
  stage.appendChild(beat)
  const bLine = beat.querySelector('#b-line') as HTMLElement
  const bSub = beat.querySelector('#b-sub') as HTMLElement

  /* ------------------------------------------------------- the sign-off */
  const signoff = document.createElement('section')
  signoff.className = 'scene signoff'
  signoff.setAttribute('aria-hidden', 'false')
  // Two routes out, one visual weight. The demo is the scarlet button it always was; the message
  // box takes its place rather than sitting beside it, so the last frame of the film never carries
  // two competing calls at once.
  signoff.innerHTML = `
    <div class="signoff-inner">
      <p class="tagline">The shortest distance between <b>intent</b> and <b>execution</b>.</p>
      <div class="ask" id="ask">
        <a class="cta" href="mailto:${SIGNOFF.ctaMail}?subject=Request%20a%20demo">${SIGNOFF.cta}</a>
        <button class="ask-open" type="button" id="ask-open">${SIGNOFF.open}</button>
      </div>
      <form class="note" id="note" hidden>
        <label class="sr-only" for="note-msg">Your message</label>
        <textarea id="note-msg" name="message" rows="3" required
          placeholder="${SIGNOFF.placeholder}"></textarea>
        <div class="note-row">
          <label class="sr-only" for="note-mail">Your email</label>
          <input id="note-mail" name="email" type="email" required
            placeholder="${SIGNOFF.emailLabel}" autocomplete="email" />
          <button class="cta" type="submit" id="note-send">${SIGNOFF.send}</button>
        </div>
        <!-- Bots fill everything they find; people never see this. Cheaper than a captcha and it
             costs the reader nothing. -->
        <input class="sr-only" tabindex="-1" aria-hidden="true" autocomplete="off"
          name="company" id="note-trap" />
        <!-- The mail-client route hands off through a real anchor rather than assigning
             location.href: some sandboxed and embedded contexts refuse the assignment outright,
             and a click carrying the user's own gesture is the one form every browser honours. -->
        <a class="sr-only" id="note-mailto" aria-hidden="true" tabindex="-1" href="#">mail</a>
        <p class="note-status" id="note-status" role="status" aria-live="polite"></p>
      </form>
      <dl class="colophon" aria-label="Contact">
        ${SIGNOFF.colophon
          .map(
            (g) => `<div>
              <dt>${g.label}</dt>
              ${g.items
                .map(
                  (i) =>
                    `<dd><a href="${i.href}"${
                      i.href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''
                    }>${i.text}</a></dd>`,
                )
                .join('')}
            </div>`,
          )
          .join('')}
      </dl>
    </div>`
  // The footer said "Design intelligence layer" — which the primary logo already carries, in its
  // own type, two inches above it. Two of the same phrase in one frame is one too many, and it was
  // the thing standing between the tagline and the space it needed.
  stage.appendChild(signoff)
  const signoffInner = signoff.querySelector('.signoff-inner') as HTMLElement

  /**
   * Where the logo sits, measured rather than guessed.
   *
   * The mark is centred in the viewport and lifted clear of the sign-off block. A lift in vh is
   * right at one aspect ratio and wrong at every other, because the block's height comes from its
   * type and does not shrink with the window — so the shorter the window, the larger a share of it
   * the block takes, and the less a vh lift buys. It cleared by three pixels at 1280x720 and
   * overlapped outright on anything wider and shorter.
   *
   * Centring the mark in the space that is actually left cannot overlap by construction, at any
   * aspect ratio, whether or not the message box is open. Re-measured on resize and whenever the
   * block changes height; the CSS transition means it glides rather than jumps.
   */
  /**
   * Where the mark sits, from one rule: a set distance above the sign-off block.
   *
   * It used to be a flat -21vh. That is correct at exactly one aspect ratio and wrong at every
   * other, because the block's height comes from its type and does not shrink with the window — so
   * the shorter the window, the larger a share of it the block takes, and the less a lift measured
   * in vh buys. At 1280x720 the wordmark cleared the tagline by three pixels; at 1440x700 and every
   * wide-short window it went straight through it, and opening the message box broke it everywhere.
   *
   * So the gap is the thing that is specified, and the position is derived. The gap is proportional
   * to the height — 9.9%, which is what the composition that was signed off measures at 1600x900 —
   * and the mark is placed to sit exactly that far above whatever the block currently is. Nothing
   * about the block's height, the message box being open, or the aspect ratio can break it.
   *
   * The one thing that outranks the gap is the top of the screen: if there is not enough room, the
   * gap gives way rather than the mark sliding off the frame.
   */
  const logoEl = document.getElementById('logo')
  const fitLogo = (): boolean => {
    if (!logoEl) return false
    const svg = logoEl.querySelector('svg') as SVGElement | null
    if (!svg) return false

    // Measured with the reveal suspended and the glide switched off. Every glyph sits at scale(0)
    // until the sequence brings it in, and a rect read mid-transition is wherever the last move had
    // got to — either one silently reports the wordmark as being somewhere it is not.
    svg.style.transition = 'none'
    logoEl.classList.add('measuring')
    document.documentElement.style.setProperty('--logo-lift', '0px')

    // the drawn glyphs, not the SVG box: the wordmark is a band inside a viewBox far larger than it
    let top = Infinity
    let bottom = -Infinity
    for (const el of logoEl.querySelectorAll('.logo-el, .logo-land')) {
      const r = el.getBoundingClientRect()
      if (r.height > 0) {
        top = Math.min(top, r.top)
        bottom = Math.max(bottom, r.bottom)
      }
    }
    logoEl.classList.remove('measuring')

    if (bottom > -Infinity) {
      const gap = Math.min(110, Math.max(24, innerHeight * 0.099))
      let lift = signoffInner.getBoundingClientRect().top - gap - bottom
      if (top + lift < 10) lift = 10 - top
      document.documentElement.style.setProperty('--logo-lift', `${Math.round(lift)}px`)
    }
    requestAnimationFrame(() => {
      svg.style.transition = ''
    })
    return bottom > -Infinity
  }
  // createLogo() injects its SVG asynchronously, so at this point #logo exists and is empty. Keep
  // asking until there is something to measure, then stop.
  let logoFitted = fitLogo()
  addEventListener('resize', fitLogo)
  // fonts land after first paint and the block is type, so its height is not final until they do
  if (document.fonts) document.fonts.ready.then(fitLogo)
  wireMessageBox(signoff, fitLogo)

  /* --------------------------------------------------- station labels */
  const labels = document.createElement('div')
  labels.id = 'st-labels'
  labels.setAttribute('aria-hidden', 'true')
  labels.innerHTML = STATIONS.map((s) => `<span>${s.key}</span>`).join('')
  document.body.appendChild(labels)
  const labelEls = Array.from(labels.querySelectorAll('span'))

  /* -------------------------------------------------------------- spine */
  const ticks = SCENES.map(
    (s) =>
      `<rect class="tick" data-id="${s.id}" x="12" y="${(s.from * SPINE_H).toFixed(1)}" width="10" height="1.5" />`,
  ).join('')

  spine.innerHTML = `
    <svg viewBox="0 0 34 ${SPINE_H}" preserveAspectRatio="none" aria-hidden="true">
      <path class="track" d="M17 0 L17 ${SPINE_H}" vector-effect="non-scaling-stroke" />
      <path class="fill" id="spine-fill" d="M17 0 L17 0" vector-effect="non-scaling-stroke" />
      ${ticks}
      <rect class="tick on" x="6" y="${0.5 * SPINE_H}" width="22" height="2" />
    </svg>`
  const fill = spine.querySelector('#spine-fill') as SVGPathElement
  const tickEls = Array.from(spine.querySelectorAll<SVGRectElement>('.tick[data-id]'))

  let lastScene = ''
  let lastInk = ''
  let lastStation = -2
  let lastLap = -1
  let lastLapLine = -1
  let labelsShown = false
  let labelStation = -2
  let lastBeat = ''
  const wasOn = new Array(blocks.length).fill(false)
  addEventListener('resize', () => {
    labelStation = -2
  })

  // Everything below is guarded on change. Writing a custom property on :root invalidates style for
  // the whole document, and touching hidden scenes every frame costs a recalc each.
  function update(p: number, ink: string, inkDim: string, r: StageReadout, rawP: number) {
    if (!logoFitted) logoFitted = fitLogo()
    if (ink !== lastInk) {
      const root = document.documentElement.style
      root.setProperty('--ink', ink)
      root.setProperty('--ink-dim', inkDim)
      lastInk = ink
    }

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      const l = (p - b.s.from) / (b.s.to - b.s.from)
      const on = l > -0.1 && l < 1.1
      if (!on) {
        if (wasOn[i]) {
          b.el.style.visibility = 'hidden'
          b.el.style.opacity = '0'
          wasOn[i] = false
        }
        continue
      }
      if (!wasOn[i]) {
        b.el.style.visibility = 'visible'
        wasOn[i] = true
      }
      const o = Math.min(smoothstep(-0.1, 0.16, l), 1 - smoothstep(0.84, 1.1, l))
      b.el.style.opacity = o.toFixed(3)
      b.inner.style.transform = `translateY(${((0.5 - l) * 34).toFixed(1)}px)`
    }

    /* -- lap one: the station copy ------------------------------------- */
    // Each station's copy rides that station's own progress, so it lifts in as he arrives and
    // lifts away as he leaves — and the text is only ever swapped at the boundary, where the
    // panel is already at zero.
    // The copy starts when the head comes off, not when the walk does — he is already standing on
    // THINK while his body draws itself and the loop builds under him, so "it all begins with an
    // idea" belongs to that moment. The loop's own labels stay gated on lap one: they cannot
    // appear before there is a loop to label.
    const inStationCopy = p < SCENES[2].to
    const inLapOne = p >= SCENES[2].from && p < SCENES[2].to
    panel(station, inStationCopy ? r.stationLocal : -1)
    if (inStationCopy && r.station >= 0 && r.station !== lastStation) {
      const s = STATIONS[r.station]
      stLine.textContent = s.line
      stLine.classList.toggle('client', !!s.client)
      // every station carries a second line now, not just the client's
      stUnder.textContent = s.sub ?? ''
      stCost.textContent = s.cost
      stCost.className = s.cost.startsWith('−') ? 'loss' : ''
      stArtifact.textContent = s.artifact
      lastStation = r.station
    }

    /* -- the acceleration: counters ------------------------------------ */
    const inLaps = p >= SCENES[3].from && p < SCENES[3].to
    // the block holds steady so the counters stay legible while they climb; only the statement
    // above them turns over, on its own third of the scene
    panel(accel, inLaps ? within(p, SCENES[3].from, SCENES[3].to) : -1)
    if (inLaps) {
      // the tally, not the lap — see StageReadout. How fast he walks and how fast the bill climbs
      // are two different stories, and only one of them is negotiable.
      if (r.tally !== lastLap) {
        const c = counters(r.tally)
        cRev.textContent = String(c.revision).padStart(2, '0')
        cDay.textContent = String(c.day).padStart(2, '0')
        cFee.textContent = `${c.fee}%`
        lastLap = r.tally
      }
      const l = within(p, SCENES[3].from, SCENES[3].to) * LAP_LINES.length
      const li = Math.min(LAP_LINES.length - 1, Math.floor(l))
      if (li !== lastLapLine) {
        acLine.textContent = LAP_LINES[li]
        lastLapLine = li
      }
      swap(acLine, l - li)
    }

    /* -- act II: the beats along the line ------------------------------ */
    const b = beatAt(p)
    panel(beat, b ? within(p, b.from, b.to) : -1, true)
    if (b && b.key !== lastBeat) {
      bLine.textContent = b.line
      bLine.classList.toggle('client', !!b.client)
      bSub.textContent = b.sub ?? ''
      lastBeat = b.key
    }

    // Nothing between the last statement and the mark: the proof frame and the cards used to sit
    // here, and the stretch they held is now the finished house standing on its own.
    // deliberately ends past 1 — the sign-off is where the reader stops, so it must not fade out
    // again as they reach the very bottom
    panel(signoff, within(p, 0.976, 1.06), true)

    /* -- station labels on the ring ------------------------------------ */
    // The camera is locked through Act I, so these only move when the station or the viewport
    // does. Writing seven transforms a frame was costing ~19fps in style recalc alone.
    const showLabels = r.station >= 0 && inLapOne
    if (!showLabels) {
      // Hide once, not on every station change. Through the acceleration the station index ticks
      // about seventy times in well under a second; without this the hide loop ran every one of
      // them and dragged a fast full-page scroll from 60fps into the low 40s.
      if (labelsShown) {
        for (const el of labelEls) el.style.opacity = '0'
        labelsShown = false
        labelStation = -2
      }
    } else if (r.station !== labelStation) {
      for (let i = 0; i < labelEls.length; i++) {
        const el = labelEls[i]
        const pt = r.screen[i]
        // Centred on the point the stage gives, and kept whole inside the frame by its own measured
        // width rather than a guessed margin. The old fixed -22px nudge was a stand-in for centring
        // that happened to be about right for five characters at 1600px wide; at 390px "PRESENT"
        // ran 24px off the right edge. offsetWidth is read only when the station changes — seven
        // times a lap — so this costs no frames.
        const hw = el.offsetWidth / 2
        const hh = el.offsetHeight / 2
        const x = Math.max(hw + 6, Math.min(innerWidth - hw - 6, pt.x)) - hw
        const y = Math.max(hh + 6, Math.min(innerHeight - hh - 6, pt.y)) - hh
        el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`
        // Only the stations he has actually reached. The loop is revealed by his walking now, so a
        // name sitting out ahead of him would be labelling a tread that does not exist yet — and
        // announcing the next six stops rather ruins the point of arriving at them.
        el.style.opacity = i > r.station ? '0' : i === r.station ? '1' : '0.44'
        el.classList.toggle('on', i === r.station)
      }
      labelsShown = true
      labelStation = r.station
    }

    fill.setAttribute('d', `M17 0 L17 ${(rawP * SPINE_H).toFixed(1)}`)

    const cur = sceneAt(p)
    if (cur.id !== lastScene) {
      for (const t of tickEls) t.classList.toggle('on', t.dataset.id === cur.id)
      lastScene = cur.id
    }
  }

  return { update }
}

/**
 * Panels fade and lift on their own local progress rather than snapping on and off.
 *
 * Driving this from scroll rather than a timer matters: the copy changes at station and beat
 * boundaries, and a timed cross-fade would race a fast scroll and leave the wrong line on screen.
 * Here the text is always swapped at the exact moment its panel is at zero opacity, because that
 * moment *is* the boundary — so the swap can never be seen, however fast you move, and it scrubs
 * backwards correctly too.
 *
 * `snappy` is Act II. Same curve, tighter windows: Act I resists, Act II resolves.
 */
function panel(el: HTMLElement, local: number, snappy = false) {
  if (local <= -0.02 || local >= 1.02) {
    if (el.style.visibility !== 'hidden') {
      el.style.visibility = 'hidden'
      write(el, 'opacity', '0')
    }
    return
  }
  if (el.style.visibility !== 'visible') el.style.visibility = 'visible'

  const rise = snappy ? 0.1 : 0.17
  const fall = snappy ? 0.9 : 0.83
  const inn = smoothstep(0, rise, local)
  const out = 1 - smoothstep(fall, 1, local)

  write(el, 'opacity', Math.min(inn, out).toFixed(3))
  const inner = el.firstElementChild as HTMLElement | null
  // in from below, out through the top — the copy moves the way the reader is moving
  if (inner) write(inner, 'transform', `translateY(${((1 - inn) * 16 - (1 - out) * 16).toFixed(1)}px)`)
}

/** One line turning over inside a panel that itself stays put — the statements in scene 04. */
function swap(el: HTMLElement, local: number) {
  const inn = smoothstep(0, 0.16, local)
  const out = 1 - smoothstep(0.84, 1, local)
  write(el, 'opacity', Math.min(inn, out).toFixed(3))
  write(el, 'transform', `translateY(${((1 - inn) * 11 - (1 - out) * 11).toFixed(1)}px)`)
}

/**
 * Only touch the DOM when the value actually changed. These run every frame across six panels, and
 * a style write that changes nothing still costs a recalc — the same trap that took a throttled
 * scroll from 60fps to the low 40s earlier in the build.
 */
const lastWrite = new WeakMap<HTMLElement, Record<string, string>>()

function write(el: HTMLElement, prop: 'opacity' | 'transform', value: string) {
  let seen = lastWrite.get(el)
  if (!seen) lastWrite.set(el, (seen = {}))
  if (seen[prop] === value) return
  seen[prop] = value
  el.style[prop] = value
}

/** local progress through a range, for panels that are not station- or beat-driven */
function within(p: number, from: number, to: number): number {
  return (p - from) / (to - from)
}

function pct(v: number): string {
  return `${String(Math.round(v * 100)).padStart(2, '0')}%`
}

/** Ordered, readable copy for search engines and for anyone without WebGL. */
/**
 * The message box.
 *
 * Two routes, chosen by whether FORM_ENDPOINT is set — see the note on that constant for why a
 * static site needs two in the first place. Either way the reader types in one place and presses
 * one button; the difference is only whether the send happens here or in their mail client.
 *
 * Written so a failure is never a dead end: if the POST is rejected, the addresses are already on
 * screen underneath and the status line points at them.
 */
function wireMessageBox(root: HTMLElement, refit: () => void): void {
  const ask = root.querySelector('#ask') as HTMLElement
  const open = root.querySelector('#ask-open') as HTMLButtonElement
  const form = root.querySelector('#note') as HTMLFormElement
  const msg = root.querySelector('#note-msg') as HTMLTextAreaElement
  const mail = root.querySelector('#note-mail') as HTMLInputElement
  const trap = root.querySelector('#note-trap') as HTMLInputElement
  const send = root.querySelector('#note-send') as HTMLButtonElement
  const status = root.querySelector('#note-status') as HTMLElement
  const hand = root.querySelector('#note-mailto') as HTMLAnchorElement

  open.addEventListener('click', () => {
    ask.hidden = true
    form.hidden = false
    msg.focus()
    // the block just got taller, so the mark has to move up out of its way
    refit()
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    // A bot filled the field nobody can see. Say nothing and do nothing — a visible rejection just
    // tells it which field to leave alone next time.
    if (trap.value) return
    const body = msg.value.trim()
    const from = mail.value.trim()
    if (!body || !from) return

    if (!FORM_ENDPOINT) {
      const subject = encodeURIComponent('A message from the site')
      const text = encodeURIComponent(`${body}\n\n— ${from}`)
      hand.href = `mailto:${SIGNOFF.ctaMail}?subject=${subject}&body=${text}`
      hand.click()
      return
    }

    send.disabled = true
    status.textContent = SIGNOFF.sending
    status.className = 'note-status'
    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: from, message: body }),
      })
      if (!res.ok) throw new Error(String(res.status))
      form.innerHTML = `<p class="note-status ok">${SIGNOFF.sent}</p>`
      refit()
    } catch {
      send.disabled = false
      status.textContent = SIGNOFF.failed
      status.className = 'note-status bad'
      refit()
    }
  })
}

export function staticDoc(): string {
  const scenes = SCENES.map((s: Scene) => `<li><h2>${s.label}</h2><p>${s.note}</p></li>`).join('')
  const stations = STATIONS.map((s) => `<li><b>${s.key}</b> — ${s.line} (${s.cost})</li>`).join('')
  return `
    <h1>alined — the shortest distance between intent and execution</h1>
    <p>Design intelligence layer for architects. Think, sketch and model on one surface, and change
       it in front of the client instead of going round the loop again.</p>
    <ol>${scenes}</ol>
    <h2>The loop</h2>
    <ul>${stations}</ul>
    <p>${LAP_LINES.join(' ')}</p>
    <p>Request access: <a href="mailto:lets.get.alined@gmail.com">lets.get.alined@gmail.com</a></p>
    <p>Contact: <a href="mailto:lets.get.alined@gmail.com">lets.get.alined@gmail.com</a>,
       <a href="mailto:reshma@lets-get-alined.com">reshma@lets-get-alined.com</a></p>`
}

void clamp01

import {
  BONES, HEAD_R, HEIGHT, JOINTS, emptyJoints, figureState, solveFigure,
  type FigureState, type Joints,
} from './figure'

/**
 * 2D harness for the rig. Not shipped — it exists so the walk cycle can be judged frame by frame
 * before it goes into the 3D scene, where a bad cycle is much harder to see.
 *
 * Row 1: one full stride sampled at eight phases.
 * Row 2: the named poses.
 * Row 3: the detach-and-fall, sampled across scene 01.
 */

const CLOUD = '#EFEFEF'
const SCARLET = '#FF391F'
const DIM = '#4A4443'

const cv = document.getElementById('rig') as HTMLCanvasElement
const ctx = cv.getContext('2d')!
const joints = emptyJoints()

let W = 0
let H = 0

function fit() {
  const dpr = Math.min(devicePixelRatio || 1, 2)
  const r = cv.getBoundingClientRect()
  W = r.width
  H = r.height
  cv.width = Math.round(W * dpr)
  cv.height = Math.round(H * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function draw(j: Joints, ox: number, oy: number, scale: number, bodyDraw = 1) {
  const px = (v: { x: number; y: number }) => ({ x: ox + v.x * scale, y: oy - v.y * scale })

  const shown = Math.round(bodyDraw * BONES.length)
  ctx.strokeStyle = CLOUD
  ctx.lineWidth = Math.max(1.5, scale * 0.075)
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let i = 0; i < shown; i++) {
    const a = px(j[BONES[i][0]])
    const b = px(j[BONES[i][1]])
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
  }
  ctx.stroke()

  ctx.fillStyle = CLOUD
  for (const name of JOINTS) {
    if (name === 'head') continue
    const seen = BONES.slice(0, shown).some((b) => b[0] === name || b[1] === name)
    if (!seen) continue
    const p = px(j[name])
    ctx.beginPath()
    ctx.arc(p.x, p.y, Math.max(1.6, scale * 0.062), 0, Math.PI * 2)
    ctx.fill()
  }

  const h = px(j.head)
  ctx.fillStyle = SCARLET
  ctx.beginPath()
  ctx.arc(h.x, h.y, Math.max(2.5, scale * HEAD_R), 0, Math.PI * 2)
  ctx.fill()
}

function label(text: string, x: number, y: number) {
  ctx.font = '400 10px "Geist Mono", monospace'
  ctx.fillStyle = DIM
  ctx.textAlign = 'center'
  ctx.fillText(text.toUpperCase(), x, y)
}

function baseline(x0: number, x1: number, y: number) {
  ctx.strokeStyle = DIM
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x0, y + 0.5)
  ctx.lineTo(x1, y + 0.5)
  ctx.stroke()
}

const POSES: [string, Partial<FigureState>][] = [
  ['stand', { walk: 0 }],
  ['walk', { walk: 1, phase: 1.1 }],
  ['trudge', { walk: 1, phase: 1.1, slump: 1 }],
  ['look up', { walk: 0, lookUp: 1 }],
  ['head off', { walk: 0, headLift: 3.2 }],
]

function frame(now: number) {
  fit()
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, W, H)

  const rowH = H / 3
  const scale = (rowH * 0.5) / HEIGHT

  // --- row 1: one stride, eight phases -------------------------------------
  const n = 8
  const y1 = rowH * 0.82
  baseline(W * 0.04, W * 0.96, y1)
  for (let i = 0; i < n; i++) {
    const x = W * (0.09 + (0.82 * i) / (n - 1))
    const phase = (i / n) * Math.PI * 2
    solveFigure(figureState({ phase, walk: 1 }), joints)
    draw(joints, x, y1, scale)
    label(`${Math.round((i / n) * 360)}°`, x, y1 + 22)
  }

  // --- row 2: named poses, plus the live cycle ------------------------------
  const y2 = rowH * 1.82
  baseline(W * 0.04, W * 0.96, y2)
  POSES.forEach(([name, over], i) => {
    const x = W * (0.11 + (0.36 * i) / (POSES.length - 1))
    solveFigure(figureState(over), joints)
    draw(joints, x, y2, scale)
    label(name, x, y2 + 22)
  })

  const live = (now / 1000) * 3.4
  solveFigure(figureState({ phase: live, walk: 1 }), joints)
  draw(joints, W * 0.72, y2, scale * 1.28)
  label('live · walk', W * 0.72, y2 + 22)

  solveFigure(figureState({ phase: live, walk: 1, slump: 1 }), joints)
  draw(joints, W * 0.88, y2, scale * 1.28)
  label('live · trudge', W * 0.88, y2 + 22)

  // --- row 3: the detach and fall ------------------------------------------
  const y3 = rowH * 2.82
  baseline(W * 0.04, W * 0.96, y3)
  const steps = 7
  for (let i = 0; i < steps; i++) {
    const x = W * (0.09 + (0.82 * i) / (steps - 1))
    const t = i / (steps - 1)
    // head falls first, the body draws itself in beneath it
    const headLift = 5.5 * (1 - t) * (1 - t)
    const bodyDraw = clamp01((t - 0.15) / 0.6)
    solveFigure(figureState({ walk: 0, headLift }), joints)
    draw(joints, x, y3, scale, bodyDraw)
    label(`${Math.round(t * 100)}%`, x, y3 + 22)
  }

  requestAnimationFrame(frame)
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

addEventListener('resize', fit)
requestAnimationFrame(frame)

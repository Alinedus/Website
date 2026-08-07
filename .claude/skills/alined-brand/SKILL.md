---
name: alined-brand
description: The alined brand system — palette, type, the 32-unit grid, motion rules, and the dot vocabulary. Load before writing any CSS, canvas, shader, or 3D code for the alined website, or when choosing colours, type, easing, or spacing on this project.
---

# alined — brand system

**alined** is a design intelligence layer for architects. Tagline: *the shortest distance between intent and execution.*
The name is the argument: **alined → a line**. The site's spine is **LOOP → LINE**.

Full creative direction lives in `alined-website-plan.html` at the project root. This file is the enforceable subset.

---

## 1. Colour — four values, locked

| Token | Hex | Use |
|---|---|---|
| `--charcoal` | `#1A1A1A` | Act I ground. The loop, the trap. |
| `--cloud` | `#EFEFEF` | Act II ground. Daylight, paper. |
| `--white` | `#FFFFFF` | Surfaces, and the 60ms inversion flash at the cut. |
| `--scarlet` | `#FF391F` | The accent. See the rule below. |

**Do not add a fifth colour.** No blues, no greens, no semantic red/amber/green. If something needs to
recede, use opacity on charcoal or cloud, not a new hue.

Derived neutrals must be **biased warm** (toward scarlet), never a cold or pure grey:
`#232020` `#332E2C` `#6B6664` `#A8A29F` `#DEDAD8`.

### The scarlet rule

Scarlet appears in exactly **four contexts** across the whole site:

1. The stick figure's **head**
2. The **client's line** of dialogue
3. The **drafting grid** (at 4–6% opacity only)
4. The **CTA**

Nothing else is ever scarlet. And **only one scarlet element animates per scene** — if two red things move
at once, neither reads as the head. It is the eye's anchor across the entire 100% of scroll.

---

## 2. Type — Geist, both cuts

- **Geist Sans Variable** — `brand-assets/Typeface/Geist/webfonts/Geist[wght].woff2` (68 KB, wght 100–900)
- **Geist Mono Variable** — `brand-assets/Typeface/_gf/Geist_Mono/GeistMono-VariableFont_wght.ttf`
  (convert to woff2 before shipping)

No third family. These sites do not pair a display face with a body face — they range one face hard.

| Role | Weight | Tracking | Notes |
|---|---|---|---|
| Display | 800 | `-0.05em` | line-height `0.90–0.94`, `clamp()` fluid, never breakpoint sizes |
| Statement | 600 | `-0.03em` | line-height `1.25` |
| Body | 400 | `-0.01em` | line-height `1.62`, max `66ch` |
| HUD / data | Mono 400 | `+0.18em` | uppercase, `tabular-nums`, small |

The HUD register mirrors the logo's own `D E S I G N   I N T E L L I G E N C E   L A Y E R` lockup.
Animate the variable `wght` axis on scroll where it earns its place — cheap, and almost nobody ships it.

---

## 3. The grid — 32 units

The logo is not a wordmark, it is a construction system. Every letter is built from **Ø32 dots on a
32-unit grid** inside a `0 0 720 720` viewBox, joined by small tangent fillets. `Primary Logo.svg` carries
its own drafting grid — grey hairlines at `stroke-width: .08`, 10-unit spacing, *not* scarlet.

- All spacing derives from **32**: `8 · 16 · 24 · 32 · 48 · 64 · 96 · 128`
- Screen scale: use `--u: 16px` (half-unit) as the base rhythm
- The background drafting grid is scarlet at **4–6% opacity**, never more

### Submark geometry (`SVG/Submark.svg`, viewBox 720)

Dot centres are `(x+16, y+16)`; every dot is Ø32.

- **Scarlet head**: centre `(424, 216)`
- **Stem top**: centre `(424, 280)` — 64u apart on 32u dots, so the gap between the circles' *edges*
  is one dot diameter. Match that **ratio**, not the raw number: a head dot and a neck joint are not
  the same size, and copying "two cells" centre-to-centre leaves the head visibly adrift.
- Stem continues down x=424; bowl occupies roughly x 296→424, y 344→504

**The `d` is a person standing next to their work.** Stem = body, scarlet dot = head, bowl = the room they
drew. The stick figure is the logo disassembled — never draw it in any other idiom.

---

## 4. The dot vocabulary

Everything visual is built from **points, the lines between them, and snapping**.

- Joints and nodes are **dots**; connections are **strokes with round caps**
- The stick figure is a **14-point rig**: head (detached), neck, hip, 2 shoulders, 2 elbows, 2 hands,
  2 knees, 2 feet. Never a modelled or illustrated character.
- 3D geometry is **wireframe / line art** by default
- **One exception on the entire site**: the finished double-storey house at `EXECUTION` is fully lit and
  materialised. It lands *because* everything else was line art. Do not add a second rendered object.

---

## 5. Motion — three rules

**1. Things snap, they don't float.** Elements arrive at 32-unit grid positions with a one-frame
overshoot. Nothing eases lazily into place — the brand is a drafting tool and it has magnetism.

**2. Act I is heavy, Act II is instant.** Same curves, opposite durations. Act I moves take 600–900ms and
resist. After the cut, everything resolves in 120–200ms. The site's own responsiveness is the argument.

**3. Scarlet moves once per scene.** See the scarlet rule.

```
--ease-snap:  cubic-bezier(0.16, 1, 0.3, 1)     /* expo.out — default */
--ease-cut:   cubic-bezier(0.76, 0, 0.24, 1)    /* power4.inOut — the cut, inversions */
--ease-over:  cubic-bezier(0.34, 1.56, 0.64, 1) /* back.out — grid snaps */

Act I: 600 / 900ms      Act II: 120 / 200ms
```

Always ship a `prefers-reduced-motion` path — a static, composed frame, not a degraded animation.

---

## 6. Stack

Vite + TypeScript · Three.js · GSAP (ScrollTrigger, MotionPath, DrawSVG, MorphSVG, SplitText — all free
since Webflow acquired GreenSock) · Lenis.

- **Vanilla Three.js, not React Three Fiber** — a reconciler fights imperative scroll timelines
- **Real document scroll, not hijacked** — the spine is *scroll position = story position*, target
  **12–15 viewports**. Do not collapse the document and virtualise scrolling.
- Animate **transform and opacity** only in DOM layers
- Profile via Playwright's CDP session (`Emulation.setCPUThrottlingRate`, `Performance.getMetrics`,
  `browser.startTracing`) — chrome-devtools-mcp is not needed
- **Desktop only** for now; mobile is deferred, but keep a static fallback so a phone gets something coherent

---

## 7. Voice

Plain, specific, and short. The audience is working architects — they can smell marketing.

- Concrete over clever: *"Six hours of GPU. One image."* not *"Rendering takes forever."*
- Never claim what the product doesn't do
- **No product screenshots anywhere** — founder's decision. Show the *effect*, not the interface.
- The client's line — **"Can we just move the kitchen?"** — appears **twice**, identically set, once in
  each act. That callback is the entire pitch; do not paraphrase it in either place.

---

## 8. Contact

- Primary CTA: **REQUEST ACCESS** → `lets.get.alined@gmail.com`
- Secondary, smaller: `lets.get.alined@gmail.com` · `reshma@lets-get-alined.com`
- Two CTAs, deliberately unequal weight. One thing to click, one thing to read.

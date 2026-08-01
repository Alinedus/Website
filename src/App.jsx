import { Suspense, lazy } from 'react'
import { scrollToY } from './film/smoothScroll'

/**
 * The film is the site.
 *
 * It is also 700KB of WebGL engine, so it is SPLIT OUT and streamed. Everything
 * that matters to a person who cannot see it — the heading, the invitation's
 * escape hatch — is in this shell and present on the first paint, before three
 * has even started downloading. A canvas that takes a second to arrive is fine;
 * a page whose content takes a second to arrive is not.
 */
const Film = lazy(() => import('./film/Film'))

function skipToInvitation(e) {
  e.preventDefault()
  const hero = document.getElementById('hero')
  if (hero) {
    // Through the smooth-scroll owner, never window.scrollTo: while Lenis is
    // driving it rewrites the scroll position every frame, so a raw call is
    // reverted before the next paint and the link silently does nothing.
    scrollToY(hero.offsetTop + hero.offsetHeight - window.innerHeight)
  }
  // The invitation only exists once the film has streamed in and reached its
  // final state, so focus is attempted rather than assumed.
  window.setTimeout(() => document.getElementById('request-access')?.focus(), 240)
}

export default function App() {
  return (
    <>
      <a className="skip-link" href="#request-access" onClick={skipToInvitation}>
        Skip the film — request access
      </a>

      <h1 className="sr-only">
        ALINED — a design intelligence layer for architects. Sketch, and your
        lines become intelligent spatial models.
      </h1>

      <Suspense fallback={<div className="film__shell" aria-hidden="true" />}>
        <Film />
      </Suspense>
    </>
  )
}

/**
 * The contact page: the colophon, unfolded.
 *
 * The sign-off's six columns are a strip under a logo reveal — they are subordinate to the mark
 * on purpose, and at 10px across six tracks they are something you scan, not something you read.
 * This page is the same information with the opposite job: one column, nothing above it competing
 * for the eye, and every value large enough to read off a phone held at arm's length.
 *
 * Not one string of it is written here. Everything comes from SIGNOFF.colophon in act2.ts, which
 * is the same object ui.ts renders the footer from — so the two cannot drift, and a number changed
 * in one place is changed in both. That is the whole reason this file reads the data rather than
 * restating it: a contact page carrying a phone number the footer has already replaced is worse
 * than no contact page.
 *
 * The ordering is the page's own, and it is not the footer's. The footer leads with the registered
 * company because a row of labels has to start somewhere and the entity is not a footnote to it.
 * Here the reader arrived wanting to reach somebody, so the address they would post to comes
 * first and the ways to get a reply follow.
 */
import { SIGNOFF } from './act2'

interface Item {
  text: string
  href?: string
  prefix?: string
}

interface Group {
  label: string
  items: Item[]
}

const GROUPS = SIGNOFF.colophon as Group[]

/**
 * A colophon group by label.
 *
 * Warns and returns null rather than throwing. A renamed label in act2.ts should be loud, but a
 * contact page that renders five of its six sections is still a contact page, and one that throws
 * on load is a blank screen for a reader who only wanted a phone number.
 */
function pick(label: string): Group | null {
  const g = GROUPS.find((x) => x.label.toLowerCase() === label.toLowerCase())
  if (!g) console.warn(`[contact] no "${label}" group in SIGNOFF.colophon — section skipped`)
  return g ?? null
}

const address = pick('Address')

/* The address column carries two kinds of thing: the lines of the address itself, and values that
   travel with a qualifier — today that is the company's own number, which act2.ts stores with its
   prefix so "78240 99522" can never appear under an address reading as a plot number. Split on
   the presence of that prefix rather than on position, so an extra address line added later lands
   in the address and an extra qualified value gets a section of its own without touching this. */
const addressLines = address?.items.filter((i) => !i.prefix) ?? []
const qualified = address?.items.filter((i) => i.prefix) ?? []

/**
 * The page's sections, in the order they are read.
 *
 * A qualified value's own prefix becomes its heading — "Company Ph. No." is already the exact
 * wording the footer sets beside the number, so taking the heading from the data means this page
 * cannot end up calling it something the footer does not.
 */
const SECTIONS: { label: string; items: Item[] }[] = [
  { label: 'Address', items: addressLines },
  ...qualified.map((i) => ({ label: i.prefix!, items: [{ text: i.text, href: i.href }] })),
  { label: 'Write', items: pick('Write')?.items ?? [] },
  { label: 'Call', items: pick('Call')?.items ?? [] },
  { label: 'Founders', items: pick('Founders')?.items ?? [] },
  { label: 'Follow', items: pick('Follow')?.items ?? [] },
]

/* Same rule the footer uses: an off-site destination opens away from the page and carries its
   rel, an on-site scheme — mailto:, tel: — does not. */
const value = (i: Item): string =>
  i.href
    ? `<a href="${i.href}"${
        i.href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''
      }>${i.text}</a>`
    : i.text

const root = document.getElementById('contact')!

root.innerHTML = `
  <div class="contact-inner">
    <h1 class="sr-only">alined — contact</h1>
    <a class="c-mark" href="/" aria-label="alined — home"></a>
    <hr class="c-rule" />
    <dl class="c-list">
      ${SECTIONS.filter((s) => s.items.length)
        .map(
          (s) => `<div>
            <dt>${s.label}</dt>
            ${s.items.map((i) => `<dd>${value(i)}</dd>`).join('')}
          </div>`,
        )
        .join('')}
    </dl>
  </div>`

/**
 * The wordmark, read from the same file the corner mark reads.
 *
 * Cropped to the word with the same viewBox mark.ts uses — the file's own box is a 720 square
 * that is mostly empty air around it. None of the story rigging comes with it: there is no film
 * on this page for the d's dot to be the head of, so it sits where the letter says it sits.
 */
fetch('/logo/wordmark.svg')
  .then((r) => r.text())
  .then((txt) => {
    const host = root.querySelector('.c-mark')!
    host.innerHTML = txt
    const svg = host.querySelector('svg')
    if (!svg) return
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    svg.setAttribute('viewBox', '192 300 336 118')
    // the link already carries the name for anything not looking at it
    svg.setAttribute('aria-hidden', 'true')
  })
  .catch(() => {
    /* The mark is the page's only decoration and the address underneath it is the point. If the
       SVG does not arrive, the link falls back to its own accessible name rather than the page
       failing to render. */
  })

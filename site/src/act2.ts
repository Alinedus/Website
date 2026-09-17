/**
 * Act II, along the line. Ranges are global scroll progress.
 *
 * Four statements, in the order they were written. The ranges are set so each one lands on the
 * thing the film is doing underneath it — the second beat covers the stretch where the building is
 * being revised without pause, which is what "explore endlessly" looks like when you draw it.
 *
 * NOTE: this used to carry the callback — the client repeating his rejection line from Act I
 * word-for-word, costing nine seconds instead of six days. The new copy does not have it, so it
 * is gone. If it comes back, both halves have to move together: Act I's REJECT line and the beat
 * that quotes it are one device, and paraphrasing either end breaks it.
 */

export interface Beat {
  /** identifier only — it used to print as an eyebrow above the line, and no longer renders */
  key: string
  line: string
  sub?: string
  from: number
  to: number
  /** the client speaking — scarlet, and set as large as it was in Act I */
  client?: boolean
}

export const ACT2: Beat[] = [
  {
    key: 'The way out',
    line: 'Your workflow shouldn’t punish you for thinking.',
    from: 0.625,
    to: 0.7,
  },
  {
    // sits over the whole revision stretch — the building changes thirteen times under this line
    key: 'With alined',
    line: 'Ideate freely. Explore endlessly. Design without interruption.',
    from: 0.7,
    to: 0.78,
  },
  {
    key: 'Your journey',
    line: 'We’ll preserve your journey.',
    from: 0.78,
    to: 0.825,
  },
  {
    key: 'What matters',
    line: 'Coz we believe it’s not just what you design, it is how you think that matters.',
    from: 0.825,
    to: 0.862,
  },
]

/* The proof frame — "the loop / 38 days" against "the line / 1 session" — and the four "what
   collapses" cards that followed it were both cut. The script goes from the last statement to the
   logo reveal with nothing in between, so the numbers and the cards were two arguments made after
   the argument was already won. If either comes back, note that the four beats above are the only
   copy in Act II now, and the line's drift and the house both already run to 0.936 to cover the
   ground they used to occupy. */

/**
 * The contact number, in one place, so the display text and the `tel:` href cannot drift apart.
 */
const TEL = '7010815677'

export const SIGNOFF = {
  tagline: 'The shortest distance between intent and execution.',
  cta: 'Request demo',
  ctaMail: 'lets.get.alined@gmail.com',
  contact: ['lets.get.alined@gmail.com', 'reshma@lets-get-alined.com'],
  /**
   * Everything else, as six labelled columns rather than one long line of links.
   *
   * Eight destinations under a logo reveal is the point where a sign-off turns into a link farm.
   * Grouping them under quiet labels means the eye lands on a label first and reads one short
   * column, instead of scanning a dozen unrelated strings for the one it wants. It is set in mono,
   * at the size the two addresses were before any of this, so the whole block stays subordinate to
   * the mark above it, which is what the frame is actually for.
   *
   * The first two columns are the registered company — who alined is on paper, as filed. They sit
   * in this row rather than in a strip of their own underneath it: a second row of the same labels
   * at the same size reads as one tangled table, and the company is not a footnote to the contact
   * details, it is the first thing in the row. Their wording is the only copy on the site that is
   * not ours to edit, down to the capitalisation.
   *
   * Only the last four carry links. A company name, a CIN and a registered address are there to be
   * read, and underlining them would promise somewhere to go.
   */
  colophon: [
    {
      label: 'Company',
      items: [{ text: 'BOTAlINE INNOVATION PRIVATE LIMITED' }, { text: 'U62099KA2026PTC220708' }],
    },
    {
      label: 'Address',
      // Broken at the comma between the street and the district — the same two halves anyone
      // writing this address on an envelope would use, and the exact text either side of it.
      //
      // Two entries rather than one wrapping string so this column has the same three parts every
      // other column has: a label and two values. That is what lets the row distribute itself —
      // see the note on .colophon > div. One long string would give this column a single value to
      // place, and all of its slack would fall into the gap under the label.
      items: [
        { text: 'NO.18, BRIGADE ROAD, RICHMOND TOWN, Mahatma Gandhi Road, Bangalore,' },
        { text: 'Bangalore North, Karnataka, India, 560001' },
      ],
    },
    {
      label: 'Write',
      items: [
        { text: 'lets.get.alined@gmail.com', href: 'mailto:lets.get.alined@gmail.com' },
        { text: 'reshma@lets-get-alined.com', href: 'mailto:reshma@lets-get-alined.com' },
      ],
    },
    {
      label: 'Call',
      items: [
        { text: TEL, href: `tel:${TEL}` },
        { text: '94483 10888', href: 'tel:9448310888' },
      ],
    },
    {
      label: 'Follow',
      items: [
        { text: 'Instagram', href: 'https://www.instagram.com/lets.get.alined/' },
        { text: 'LinkedIn', href: 'https://www.linkedin.com/company/letsgetalined/' },
      ],
    },
    {
      label: 'Founders',
      items: [
        { text: 'Reshma Ashok', href: 'https://www.linkedin.com/in/reshma-ashok-a9b060243/' },
        { text: 'Rithu BD', href: 'https://www.linkedin.com/in/rithu-bd-816015186/' },
      ],
    },
  ] as { label: string; items: { text: string; href?: string }[] }[],
  footer: 'Design intelligence layer',
  /** the second route out of the sign-off: say something, rather than ask for the demo */
  open: 'or write to us',
  placeholder: 'Tell us what you’re working on.',
  emailLabel: 'your email',
  send: 'Send',
  sending: 'Sending…',
  sent: 'Thank you — that’s with us.',
  failed: 'That didn’t send. Mail us directly:',
}

/**
 * Where the message box posts.
 *
 * A static site cannot send email. There is no server here to send it from, and no amount of
 * front-end work changes that — so the form has two routes and picks one from this constant.
 *
 * Left empty, it composes the message into the visitor's own mail client, already addressed and
 * filled in. That works on every device today and needs nothing set up, but it does hand the
 * visitor off to their mail app to press send.
 *
 * Set it to a form endpoint — Formspree, Web3Forms, Formcarry, a Vercel or Cloudflare function,
 * anything that accepts a POST and forwards it — and the same form submits quietly in the
 * background instead, so the message lands in the inbox without the visitor leaving the page.
 * Nothing else has to change.
 */
export const FORM_ENDPOINT = ''

export function beatAt(p: number): Beat | null {
  for (const b of ACT2) if (p >= b.from && p < b.to) return b
  return null
}

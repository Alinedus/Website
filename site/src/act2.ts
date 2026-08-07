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

export const SIGNOFF = {
  tagline: 'The shortest distance between intent and execution.',
  cta: 'Request demo',
  ctaMail: 'lets.get.alined@gmail.com',
  contact: ['lets.get.alined@gmail.com', 'reshma@lets-get-alined.com'],
  /**
   * Everything else, as four labelled pairs rather than one long line of links.
   *
   * Eight destinations under a logo reveal is the point where a sign-off turns into a link farm.
   * Grouping them two-by-two under four quiet labels means the eye lands on a label first and reads
   * one short column, instead of scanning eight unrelated strings for the one it wants. It is set
   * in mono, at the size the addresses already were, and no group is longer than two lines — so the
   * whole block stays subordinate to the mark above it, which is the thing the frame is actually
   * for. Four twos also wrap cleanly: four columns on a desktop, two on a phone, and never a
   * ragged last row.
   */
  colophon: [
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
        { text: '78240 99522', href: 'tel:7824099522' },
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
  ],
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

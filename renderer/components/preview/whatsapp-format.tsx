import type { ReactNode } from 'react'

/**
 * WhatsApp text formatting → React nodes.
 *
 * Supported, as WhatsApp renders them:
 *   *bold*   _italic_   ~strike~   `inline code`   ```monospace block```
 *   > quote   (at the start of a line)
 *   links (http(s)://… and www.…) are tinted, not clickable — this is a preview.
 *
 * WHY a hand parser and not regex-replace into HTML: the text is user input,
 * and the only safe way to show it is as React text nodes. Nothing here ever
 * builds markup from the string, so `<script>` in a message is just text.
 *
 * The marker rules mirror WhatsApp's: an opening marker must not follow a
 * letter or digit and must be followed by a non-space; the closing one must
 * follow a non-space and not be followed by a letter or digit; a pair never
 * spans a line break. So `2*3*4` and `snake_case_name` stay literal. Markers
 * nest (`*_bold italic_*`), except inside code, which is always literal.
 */

const INLINE_MARKERS = {
  '*': 'strong',
  _: 'em',
  '~': 'del',
  '`': 'code',
} as const

type Marker = keyof typeof INLINE_MARKERS

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/g

function isMarker(ch: string | undefined): ch is Marker {
  return ch !== undefined && ch in INLINE_MARKERS
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch)
}

function isSpaceOrEnd(ch: string | undefined): boolean {
  return ch === undefined || /\s/.test(ch)
}

interface Keys {
  next: () => string
}

function findClose(text: string, open: number, marker: Marker): number {
  for (let j = open + 2; j < text.length; j++) {
    const ch = text[j]
    if (ch === '\n') return -1
    if (ch === marker && !isSpaceOrEnd(text[j - 1]) && !isWordChar(text[j + 1])) return j
  }
  return -1
}

function linkify(text: string, keys: Keys): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index
    if (start > last) nodes.push(text.slice(last, start))
    nodes.push(
      <span key={keys.next()} className="text-wa-link underline underline-offset-2">
        {match[0]}
      </span>,
    )
    last = start + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function inline(text: string, keys: Keys): ReactNode[] {
  const nodes: ReactNode[] = []
  let plain = ''
  const flush = () => {
    if (plain) nodes.push(...linkify(plain, keys))
    plain = ''
  }

  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (
      isMarker(ch) &&
      !isWordChar(text[i - 1]) &&
      !isSpaceOrEnd(text[i + 1]) &&
      text[i + 1] !== ch
    ) {
      const close = findClose(text, i, ch)
      if (close !== -1) {
        flush()
        const inner = text.slice(i + 1, close)
        const key = keys.next()
        switch (INLINE_MARKERS[ch]) {
          case 'strong':
            nodes.push(
              <strong key={key} className="font-semibold">
                {inline(inner, keys)}
              </strong>,
            )
            break
          case 'em':
            nodes.push(<em key={key}>{inline(inner, keys)}</em>)
            break
          case 'del':
            nodes.push(<del key={key}>{inline(inner, keys)}</del>)
            break
          case 'code':
            nodes.push(
              <code
                key={key}
                className="rounded-[4px] bg-wa-divider px-1 font-mono text-[0.9em]"
              >
                {inner}
              </code>,
            )
            break
        }
        i = close + 1
        continue
      }
    }
    plain += ch
    i++
  }
  flush()
  return nodes
}

function lines(text: string, keys: Keys): ReactNode[] {
  const out: ReactNode[] = []
  const rows = text.split('\n')
  const QUOTE = /^> (.*)$/
  rows.forEach((row, index) => {
    const quote = QUOTE.exec(row)
    if (quote) {
      out.push(
        <span
          key={keys.next()}
          className="my-0.5 block border-l-[3px] border-wa-meta/50 pl-2 text-wa-meta"
        >
          {inline(quote[1] ?? '', keys)}
        </span>,
      )
      // A block element already breaks the line.
      return
    }
    out.push(...inline(row, keys))
    // Before a quote the block itself starts the new line; a '\n' as well
    // would leave an empty line under pre-wrap.
    const next = rows[index + 1]
    if (next !== undefined && !QUOTE.test(next)) out.push('\n')
  })
  return out
}

/**
 * Render a message's text with WhatsApp formatting. Returns React nodes to
 * place inside an element with `white-space: pre-wrap`, so line breaks and
 * spacing survive exactly as typed.
 */
export function renderWhatsAppFormatting(text: string): ReactNode[] {
  let counter = 0
  const keys: Keys = { next: () => `wa${counter++}` }
  const out: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(/```([\s\S]+?)```/g)) {
    const start = match.index
    if (start > last) out.push(...lines(text.slice(last, start), keys))
    out.push(
      <code key={keys.next()} className="font-mono text-[0.92em]">
        {match[1]}
      </code>,
    )
    last = start + match[0].length
  }
  if (last < text.length) out.push(...lines(text.slice(last), keys))
  return out
}

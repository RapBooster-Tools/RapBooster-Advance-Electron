/**
 * A small vCard (2.1, 3.0, 4.0) reader for contact import.
 *
 * Hand-written rather than pulled from a library because the importer needs
 * only five fields, must stream a phone's full address-book export line by
 * line, and has to cope with the two encodings phones actually produce:
 * folded lines (3.0/4.0) and QUOTED-PRINTABLE with soft line breaks (2.1,
 * which older Android exports still use).
 *
 * NOTE: one card becomes one row. The number most likely to be on WhatsApp
 * (a CELL/MOBILE number, else the preferred one, else the first) goes in
 * "Phone"; any others go in "Other phones" so nothing is lost and the user can
 * map them to a field. One row per number would message the same person once
 * per number they have, which is exactly the duplicate a bulk sender must
 * avoid.
 */

export const VCARD_HEADERS = ['Name', 'Phone', 'Other phones', 'Email', 'Company']

export interface VCard {
  name: string
  phones: string[]
  email: string
  company: string
}

const BARE_ENCODINGS = new Set(['QUOTED-PRINTABLE', 'BASE64', '8BIT', '7BIT'])

interface Property {
  name: string
  params: Map<string, string[]>
  value: string
}

interface Phone {
  value: string
  mobile: boolean
  preferred: boolean
}

/** Split on an unescaped separator (`\;` and `\,` are literal in 3.0/4.0). */
function splitUnescaped(value: string, separator: string): string[] {
  const out: string[] = []
  let current = ''
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]
    if (ch === '\\' && i + 1 < value.length) {
      current += ch + value[i + 1]
      i += 1
    } else if (ch === separator) {
      out.push(current)
      current = ''
    } else current += ch
  }
  out.push(current)
  return out
}

function unescapeText(value: string): string {
  return value.replace(/\\([\\,;nN])/g, (_, ch: string) =>
    ch === 'n' || ch === 'N' ? ' ' : ch,
  )
}

function decodeQuotedPrintable(value: string, charset: string): string {
  const bytes: number[] = []
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]!
    const hex = value.slice(i + 1, i + 3)
    if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16))
      i += 2
    } else {
      bytes.push(...Buffer.from(ch, 'utf8'))
    }
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(Uint8Array.from(bytes))
  } catch {
    // An unknown CHARSET label: UTF-8 is what every modern phone writes.
    return new TextDecoder('utf-8').decode(Uint8Array.from(bytes))
  }
}

/** Parse `[group.]NAME[;PARAM[=v1,v2]]*:value` into its parts. */
export function parseProperty(line: string): Property | null {
  // The value starts at the first colon outside a quoted parameter value.
  let inQuotes = false
  let colon = -1
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') inQuotes = !inQuotes
    else if (line[i] === ':' && !inQuotes) {
      colon = i
      break
    }
  }
  if (colon <= 0) return null

  const [rawName, ...rawParams] = line.slice(0, colon).split(';')
  const name = (rawName ?? '').split('.').pop()!.trim().toUpperCase()
  const params = new Map<string, string[]>()
  for (const raw of rawParams) {
    const eq = raw.indexOf('=')
    // vCard 2.1 allows bare parameters: `TEL;CELL;PREF:…` means TYPE=CELL,PREF,
    // and `FN;QUOTED-PRINTABLE:…` names the encoding.
    const bare = raw.trim().toUpperCase()
    const key =
      eq !== -1
        ? raw.slice(0, eq).trim().toUpperCase()
        : BARE_ENCODINGS.has(bare)
          ? 'ENCODING'
          : 'TYPE'
    const values = (eq === -1 ? raw : raw.slice(eq + 1))
      .replace(/"/g, '')
      .split(',')
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean)
    params.set(key, [...(params.get(key) ?? []), ...values])
  }

  let value = line.slice(colon + 1)
  if (params.get('ENCODING')?.includes('QUOTED-PRINTABLE')) {
    value = decodeQuotedPrintable(value, params.get('CHARSET')?.[0] ?? 'utf-8')
  }
  return { name, params, value }
}

function nameFromN(value: string): string {
  // N:Family;Given;Additional;Prefix;Suffix
  const [family = '', given = '', additional = '', prefix = '', suffix = ''] =
    splitUnescaped(value, ';').map(unescapeText)
  return [prefix, given, additional, family, suffix]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ')
}

function choosePhones(phones: Phone[]): string[] {
  if (phones.length === 0) return []
  const best =
    phones.find((p) => p.mobile) ?? phones.find((p) => p.preferred) ?? phones[0]!
  return [best.value, ...phones.filter((p) => p !== best).map((p) => p.value)]
}

class CardBuilder {
  fn = ''
  n = ''
  email = ''
  company = ''
  phones: Phone[] = []

  add(prop: Property): void {
    const text = unescapeText(prop.value).trim()
    switch (prop.name) {
      case 'FN':
        if (!this.fn) this.fn = text
        break
      case 'N':
        if (!this.n) this.n = nameFromN(prop.value)
        break
      case 'EMAIL':
        if (!this.email) this.email = text
        break
      case 'ORG':
        if (!this.company)
          this.company = splitUnescaped(prop.value, ';')
            .map((p) => unescapeText(p).trim())
            .filter(Boolean)
            .join(' ')
        break
      case 'TEL': {
        // 4.0 writes numbers as URIs: `TEL;VALUE=uri:tel:+1-555-0100`.
        const value = text.replace(/^tel:/i, '').trim()
        if (!value) break
        const types = prop.params.get('TYPE') ?? []
        this.phones.push({
          value,
          mobile: types.some((t) => t === 'CELL' || t === 'MOBILE' || t === 'IPHONE'),
          preferred: types.includes('PREF') || prop.params.has('PREF'),
        })
        break
      }
      default:
        break
    }
  }

  build(): VCard {
    return {
      name: this.fn || this.n,
      phones: choosePhones(this.phones),
      email: this.email,
      company: this.company,
    }
  }
}

/**
 * Line-fed vCard reader. `push` takes physical lines in file order and returns
 * the cards completed so far; `end` flushes anything left.
 */
export class VCardReader {
  private pending: string | null = null
  private card: CardBuilder | null = null

  push(physical: string): VCard[] {
    const line = physical.replace(/\r$/, '')

    // A QUOTED-PRINTABLE soft line break: "=" at the end continues the value
    // on the next physical line, which carries no leading whitespace.
    if (
      this.pending !== null &&
      /QUOTED-PRINTABLE/i.test(this.pending.slice(0, this.pending.indexOf(':') + 1))
    ) {
      if (this.pending.endsWith('=')) {
        this.pending = this.pending.slice(0, -1) + line
        return []
      }
    }
    // RFC 6350 folding: a line starting with a space or tab continues the last.
    if (this.pending !== null && /^[ \t]/.test(line)) {
      this.pending += line.slice(1)
      return []
    }

    const done = this.flush()
    this.pending = line
    return done
  }

  end(): VCard[] {
    const done = this.flush()
    // A file cut off before END:VCARD still yields what it had.
    if (this.card) {
      done.push(this.card.build())
      this.card = null
    }
    return done
  }

  private flush(): VCard[] {
    const line = this.pending
    this.pending = null
    if (line === null || line.trim() === '') return []

    const upper = line.trim().toUpperCase()
    if (upper === 'BEGIN:VCARD') {
      this.card = new CardBuilder()
      return []
    }
    if (upper === 'END:VCARD') {
      const card = this.card?.build()
      this.card = null
      return card ? [card] : []
    }
    if (!this.card) return []

    const prop = parseProperty(line)
    if (prop) this.card.add(prop)
    return []
  }
}

/** One import row per card, in `VCARD_HEADERS` order. */
export function vcardToRow(card: VCard): string[] {
  const [phone = '', ...others] = card.phones
  return [card.name, phone, others.join(', '), card.email, card.company]
}

/** Parse a whole vCard text. Used for small inputs and by tests. */
export function parseVCardText(text: string): VCard[] {
  const reader = new VCardReader()
  const cards: VCard[] = []
  for (const line of text.split(/\n/)) cards.push(...reader.push(line))
  cards.push(...reader.end())
  return cards
}

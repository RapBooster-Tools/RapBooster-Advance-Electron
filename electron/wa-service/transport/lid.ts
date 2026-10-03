/**
 * LID → phone number resolution (D129).
 *
 * WHY: WhatsApp now addresses many people by a LID (`<opaque>@lid`), an id
 * that is NOT their phone number. Showing its digits as a number is wrong, and
 * treating them as one is dangerous: `+<lid digits>` can be a real stranger's
 * number, so an export or a campaign would message the wrong person.
 *
 * Every JID that becomes a phone number in the transport goes through here.
 * The resolver prefers a phone-number JID handed to us directly (message keys
 * carry `remoteJidAlt` / `participantAlt`, contacts and group members carry
 * `phoneNumber`), then the mapping it has learned, then the transport's own
 * store (Baileys keeps one in `signalRepository.lidMapping`). A LID that still
 * cannot be resolved becomes `hiddenPhone(lid)` — a value that can never pass
 * as a phone number — and is repaired in main when the mapping turns up later.
 */

/** A pair as Baileys reports it: both are JIDs. */
export interface LidPair {
  lid: string
  pn: string
}

/** A learned mapping as the rest of the app sees it. */
export interface LidPhone {
  lid: string
  phone: string
}

export const isLidJid = (jid: string | null | undefined): jid is string =>
  typeof jid === 'string' && jid.endsWith('@lid')

export const isPnJid = (jid: string | null | undefined): jid is string =>
  typeof jid === 'string' && jid.endsWith('@s.whatsapp.net')

/** The user part of a JID, without the `:<device>` suffix. */
export function userOf(jid: string): string {
  return (jid.split('@')[0] ?? '').split(':')[0] ?? ''
}

/** `<lid user>@lid`: device suffix dropped, so one person has one key. */
export function normalLid(jid: string): string {
  return `${userOf(jid)}@lid`
}

export function pnJidOf(phone: string): string {
  return `${phone.replace(/\D/g, '')}@s.whatsapp.net`
}

function phoneOfPnJid(jid: string): string | null {
  const digits = userOf(jid)
  return /^\d{7,15}$/.test(digits) ? `+${digits}` : null
}

/**
 * The stand-in for a number WhatsApp has not shown us: the LID itself, kept
 * in JID form. It is not E.164, so every phone validator rejects it, and
 * `isHiddenPhone` (shared/phone-display.ts) lets the UI say "number hidden".
 */
export function hiddenPhone(lidJid: string): string {
  return normalLid(lidJid)
}

export class LidResolver {
  /** lid user → phone number (E.164). */
  private readonly known = new Map<string, string>()

  /**
   * @param lookup the transport's own mapping store, consulted for LIDs this
   *   resolver has not learned yet; may be absent (the mock) or fail.
   * @param onLearned called with mappings that are new to this resolver, so
   *   main can repair rows stored before the number was known.
   */
  constructor(
    private readonly lookup?: (lids: string[]) => Promise<LidPair[] | null | undefined>,
    private readonly onLearned?: (mappings: LidPhone[]) => void,
  ) {}

  /** Record pairs from any source. Returns (and reports) the new ones. */
  learn(pairs: Array<Partial<LidPair>>): LidPhone[] {
    const fresh: LidPhone[] = []
    for (const pair of pairs) {
      if (!isLidJid(pair.lid) || !isPnJid(pair.pn)) continue
      const phone = phoneOfPnJid(pair.pn)
      if (!phone) continue
      const key = userOf(pair.lid)
      if (this.known.get(key) === phone) continue
      this.known.set(key, phone)
      fresh.push({ lid: normalLid(pair.lid), phone })
    }
    if (fresh.length > 0) this.onLearned?.(fresh)
    return fresh
  }

  /** Synchronous: only what is already known. */
  knownPhone(jid: string): string | null {
    if (isPnJid(jid)) return phoneOfPnJid(jid)
    if (isLidJid(jid)) return this.known.get(userOf(jid)) ?? null
    return null
  }

  /** Ask the transport's store about LIDs not known yet, in one batch. */
  async prefetch(jids: Array<string | null | undefined>): Promise<void> {
    if (!this.lookup) return
    const missing = [
      ...new Set(
        jids
          .filter(isLidJid)
          .filter((j) => !this.known.has(userOf(j)))
          .map(normalLid),
      ),
    ]
    if (missing.length === 0) return
    try {
      const pairs = await this.lookup(missing)
      if (pairs) this.learn(pairs)
    } catch (err) {
      // The store is an optimisation over what we learn from events; a failed
      // lookup leaves the number hidden until a mapping event arrives.
      console.debug('lid: mapping lookup failed', err)
    }
  }

  /**
   * The phone number behind the first candidate that has one. Candidates are
   * the alternatives WhatsApp gives for the same person, best first — e.g.
   * `(key.remoteJid, key.remoteJidAlt)`. Pairs among them are learned.
   */
  async phoneOf(...candidates: Array<string | null | undefined>): Promise<string | null> {
    const lid = candidates.find(isLidJid)
    const pn = candidates.find(isPnJid)
    if (lid && pn) this.learn([{ lid, pn }])
    if (pn) return phoneOfPnJid(pn)
    if (!lid) return null
    await this.prefetch([lid])
    return this.known.get(userOf(lid)) ?? null
  }

  /** `phoneOf`, or the hidden stand-in when only a LID is known. */
  async phoneOrHidden(...candidates: Array<string | null | undefined>): Promise<string> {
    const phone = await this.phoneOf(...candidates)
    if (phone) return phone
    const lid = candidates.find(isLidJid)
    if (lid) return hiddenPhone(lid)
    const any = candidates.find((c): c is string => typeof c === 'string') ?? ''
    return phoneOfPnJid(any) ?? any
  }

  /**
   * The JID to file a one-to-one chat under: the phone-number JID when the
   * number is known, so one person is one chat however WhatsApp addressed
   * them; the normalised LID otherwise.
   */
  async chatJid(jid: string, alt?: string | null): Promise<string> {
    if (!isLidJid(jid)) return jid
    const phone = await this.phoneOf(jid, alt)
    return phone ? pnJidOf(phone) : normalLid(jid)
  }
}

/**
 * Incoming calls: optionally reject them and reply with a message (D89).
 *
 * A marketing number that rings all day is either answered by nobody or
 * distracts whoever holds the phone. Rejecting with a short message moves the
 * caller to chat, where the inbox, keyword rules and the AI bot can help.
 */
import { getPrisma } from '../db/client'
import { waBridge } from '../wa-bridge'
import { isSuppressed } from './optout'
import { isParkingError } from './sending-policy'
import { emitWebhook } from './webhooks'
import { isHiddenPhone } from '../../../shared/phone-display'

export const DEFAULT_CALL_MESSAGE =
  "Sorry, we can't take calls on this number. Please send us a message and we'll reply here."

const AUTO_REJECT_KEY = 'calls.autoReject'
const MESSAGE_KEY = 'calls.message'

export interface CallConfig {
  autoReject: boolean
  message: string
}

export async function readCallConfig(): Promise<CallConfig> {
  const rows = await getPrisma().setting.findMany({
    where: { key: { in: [AUTO_REJECT_KEY, MESSAGE_KEY] } },
    take: 2,
  })
  const stored = new Map(rows.map((r) => [r.key, r.value]))
  return {
    autoReject: stored.get(AUTO_REJECT_KEY) === 'true',
    message: stored.get(MESSAGE_KEY) ?? DEFAULT_CALL_MESSAGE,
  }
}

export async function writeCallConfig(config: CallConfig): Promise<void> {
  const prisma = getPrisma()
  const entries: Array<[string, string]> = [
    [AUTO_REJECT_KEY, String(config.autoReject)],
    [MESSAGE_KEY, config.message],
  ]
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value, isEncrypted: false },
        update: { value },
      }),
    ),
  )
}

/** "+9198…" from a phone or a JID such as "9198…:12@s.whatsapp.net". */
function phoneOf(from: string): string {
  // A hidden number stays hidden: "+<LID digits>" would be a stranger (D129).
  if (isHiddenPhone(from)) return from
  if (!from.includes('@')) return from.startsWith('+') ? from : `+${from}`
  const user = from.split('@')[0]?.split(':')[0] ?? ''
  return `+${user}`
}

function isDuplicate(err: unknown): boolean {
  return (err as { code?: string } | undefined)?.code === 'P2002'
}

export async function handleIncomingCall(
  deviceId: string,
  call: { callId: string; from: string; isVideo: boolean },
): Promise<void> {
  const prisma = getPrisma()
  const phone = phoneOf(call.from)

  // WhatsApp can repeat a call offer on reconnect; the first one was handled.
  if (await prisma.callEvent.findUnique({ where: { id: call.callId } })) return
  try {
    await prisma.callEvent.create({
      data: { id: call.callId, deviceId, from: phone, isVideo: call.isVideo },
    })
  } catch (err) {
    // Two copies of the same offer raced past the check above.
    if (isDuplicate(err)) return
    throw err
  }

  const config = await readCallConfig()
  if (!config.autoReject) return

  try {
    await waBridge.request('call:reject', {
      deviceId,
      callId: call.callId,
      from: call.from,
    })
  } catch (err) {
    console.error('calls: could not reject an incoming call', err)
    return
  }
  await prisma.callEvent.update({ where: { id: call.callId }, data: { rejected: true } })

  let replied = false
  const message = config.message.trim()
  if (message && !(await isSuppressed(phone))) {
    try {
      // Automated: paced by the throttle, held by quiet hours and the cap.
      await waBridge.request('message:send', {
        deviceId,
        to: call.from.includes('@') ? call.from : `${phone.slice(1)}@s.whatsapp.net`,
        message: { kind: 'text', body: message },
      })
      replied = true
      await prisma.callEvent.update({ where: { id: call.callId }, data: { replied } })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      // A call reply is only useful while the caller is waiting, so a parked
      // one is dropped rather than queued for the morning.
      if (isParkingError(detail)) console.log(`calls: reply not sent — ${detail}`)
      else console.error('calls: could not send the call reply', detail)
    }
  }

  await emitWebhook('call.rejected', {
    deviceId,
    callId: call.callId,
    phone,
    isVideo: call.isVideo,
    replied,
  })
}

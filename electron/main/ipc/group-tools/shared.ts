/**
 * Helpers shared by the group power-tool handlers (D89).
 */
import type { Device, Group } from '../../../../generated/prisma/client'
import { AppError } from '../../../../shared/errors'
import type {
  WaRequestKind,
  WaRequests,
  WaResponses,
} from '../../../../shared/wa-protocol'
import { getPrisma } from '../../db/client'
import { waBridge } from '../../wa-bridge'

export const INVITE_URL = 'https://chat.whatsapp.com/'

export function inviteUrl(code: string): string {
  return `${INVITE_URL}${code}`
}

/**
 * Accept `https://chat.whatsapp.com/<code>`, `chat.whatsapp.com/<code>?…` or
 * the bare code. Returns null for anything else.
 */
export function parseInviteCode(input: string): string | null {
  const trimmed = input.trim()
  const fromUrl =
    /(?:^|\/\/|\s)(?:www\.)?chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]+)/i.exec(
      trimmed,
    )?.[1]
  const code = fromUrl ?? trimmed
  return /^[A-Za-z0-9]{4,64}$/.test(code) ? code : null
}

/**
 * WhatsApp's own failure text is the most useful thing to show (it says
 * "not-authorized", "item-not-found"…), but it arrives as a raw Error that the
 * router would flatten into "Something went wrong". Wrap it with the action the
 * user attempted, and keep the raw text as the logged detail.
 */
export async function waCall<K extends WaRequestKind>(
  kind: K,
  payload: WaRequests[K],
  action: string,
): Promise<WaResponses[K]> {
  try {
    return await waBridge.request(kind, payload)
  } catch (err) {
    throw new AppError('SEND_FAILED', {
      userMessage: `Could not ${action}: ${reasonOf(err)}`,
      detail: `${kind}: ${err instanceof Error ? err.message : String(err)}`,
      cause: err,
    })
  }
}

/** The short reason WhatsApp gave, without the mock/transport prefix. */
export function reasonOf(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^mock:\s*/, '').slice(0, 200)
}

export async function requireConnectedDevice(deviceId: string): Promise<Device> {
  const device = await getPrisma().device.findUnique({ where: { id: deviceId } })
  if (!device) {
    throw new AppError('NOT_FOUND', { userMessage: 'That device no longer exists.' })
  }
  if (device.status !== 'connected') {
    throw new AppError('DEVICE_NOT_CONNECTED', {
      userMessage: `Connect ${device.name} first — it is ${device.status.replace('_', ' ')}.`,
    })
  }
  return device
}

/** The cached group, and its device, which must be connected to act on it. */
export async function requireGroup(
  groupId: string,
  options: { admin?: boolean; action?: string } = {},
): Promise<{ group: Group; device: Device }> {
  const group = await getPrisma().group.findUnique({ where: { id: groupId } })
  if (!group) {
    throw new AppError('NOT_FOUND', {
      userMessage: 'That group is not in the local list. Sync groups and try again.',
    })
  }
  if (options.admin && !group.isAdmin) {
    throw new AppError('VALIDATION_FAILED', {
      userMessage: `Only a group admin can ${options.action ?? 'do that'}. This account is not an admin of "${group.name}".`,
    })
  }
  const device = await requireConnectedDevice(group.deviceId)
  return { group, device }
}

/**
 * `wa-service` entry point.
 *
 * Runs as an Electron utilityProcess. Owns every WhatsApp socket and nothing
 * else — no database handle, no window, no license state. It receives typed
 * requests over the parent port and answers with a discriminated result;
 * unsolicited state changes go back as events.
 */
import { MockTransport } from './transport/mock'
import { SessionManager } from './session-manager'
import { ThrottleScheduler, type RunOptions } from './throttle'
import type { Transport } from './transport/types'
import type {
  WaOutgoing,
  WaEventEnvelope,
  WaEventKind,
  WaEvents,
  WaRequestEnvelope,
  WaRequestKind,
  WaResponseEnvelope,
  WaResponses,
} from '../../shared/wa-protocol'

/**
 * The mock is selected by env so tests never reach the network. Baileys is
 * imported lazily precisely so the mock path does not pay for loading it — and
 * so a Baileys import failure cannot break the test transport.
 */
async function createTransport(): Promise<Transport> {
  if (process.env.WA_TRANSPORT === 'mock') {
    return new MockTransport()
  }
  const { BaileysTransport } = await import('./transport/baileys')
  return new BaileysTransport()
}

function post(message: WaResponseEnvelope | WaEventEnvelope): void {
  process.parentPort?.postMessage(message)
}

function emit<K extends WaEventKind>(event: K, payload: WaEvents[K]): void {
  post({ event, payload } as WaEventEnvelope)
}

async function main(): Promise<void> {
  const transport = await createTransport()
  const throttle = new ThrottleScheduler(undefined, (deviceId, to, state) =>
    transport.presence(deviceId, to, state),
  )

  // Lookups and membership changes are not sends, but hammering them is just as
  // visible to WhatsApp. One per device at a time, with a floor between calls.
  const QUERY_GAP_MS = 2_500
  const queryChains = new Map<string, Promise<unknown>>()
  function query<T>(deviceId: string, task: () => Promise<T>): Promise<T> {
    const previous = queryChains.get(deviceId) ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          return await task()
        } finally {
          await new Promise((resolve) => setTimeout(resolve, QUERY_GAP_MS))
        }
      })
    queryChains.set(deviceId, next)
    return next
  }

  /** Typing simulation input for an outgoing message. */
  function typingFor(to: string, message: WaOutgoing): RunOptions['typing'] {
    if (message.kind === 'audio') return { to, state: 'recording', chars: 60 }
    const text =
      'body' in message && typeof message.body === 'string'
        ? message.body
        : 'caption' in message && typeof message.caption === 'string'
          ? message.caption
          : 'name' in message && typeof message.name === 'string'
            ? message.name
            : ''
    return { to, state: 'composing', chars: text.length }
  }

  const sessions = new SessionManager(transport, {
    onStatus: (deviceId, status, detail) =>
      emit('status', { deviceId, status, ...(detail ?? {}) }),
    onGiveUp: (deviceId, attempts, detail) =>
      emit('giveUp', { deviceId, attempts, detail }),
    onLog: (level, message) => emit('log', { level, message }),
  })

  // Forward transport events straight through; main decides what to persist.
  transport.on('status', (deviceId, status, detail) => {
    if (status === 'connected') sessions.noteConnected(deviceId)
    emit('status', { deviceId, status, ...(detail ?? {}) })
  })
  transport.on('qr', (deviceId, qr) => emit('qr', { deviceId, qr }))
  transport.on('pairingCode', (deviceId, code) => emit('pairingCode', { deviceId, code }))
  transport.on('message', (deviceId, message) => emit('message', { deviceId, message }))
  transport.on('receipt', (deviceId, messageId, status) =>
    emit('receipt', { deviceId, messageId, status }),
  )
  transport.on('call', (deviceId, call) => emit('call', { deviceId, ...call }))
  transport.on('label', (deviceId, label) => emit('label', { deviceId, ...label }))
  transport.on('labelAssociation', (deviceId, association) =>
    emit('labelAssociation', { deviceId, ...association }),
  )
  transport.on('contacts', (deviceId, contacts) =>
    emit('contacts', { deviceId, contacts }),
  )
  transport.on('lidMapping', (deviceId, mappings) =>
    emit('lidMapping', { deviceId, mappings }),
  )

  async function handle<K extends WaRequestKind>(
    envelope: WaRequestEnvelope<K>,
  ): Promise<WaResponses[K]> {
    const { kind, payload } = envelope

    switch (kind) {
      case 'device:connect': {
        const p = payload as WaRequestEnvelope<'device:connect'>['payload']
        await sessions.connect(p.deviceId, p.authDir)
        return { started: true } as WaResponses[K]
      }
      case 'device:pairingCode': {
        const p = payload as WaRequestEnvelope<'device:pairingCode'>['payload']
        const code = await transport.requestPairingCode(p.deviceId, p.phone)
        return { code } as WaResponses[K]
      }
      case 'device:disconnect': {
        const p = payload as WaRequestEnvelope<'device:disconnect'>['payload']
        await sessions.disconnect(p.deviceId)
        return { ok: true } as WaResponses[K]
      }
      case 'device:logout': {
        const p = payload as WaRequestEnvelope<'device:logout'>['payload']
        await sessions.logout(p.deviceId)
        return { ok: true } as WaResponses[K]
      }
      case 'device:isConnected': {
        const p = payload as WaRequestEnvelope<'device:isConnected'>['payload']
        return { connected: transport.isConnected(p.deviceId) } as WaResponses[K]
      }
      case 'group:fetch': {
        const p = payload as WaRequestEnvelope<'group:fetch'>['payload']
        return { groups: await transport.fetchGroups(p.deviceId) } as WaResponses[K]
      }
      case 'group:create': {
        const p = payload as WaRequestEnvelope<'group:create'>['payload']
        return (await transport.createGroup(
          p.deviceId,
          p.subject,
          p.participants,
        )) as WaResponses[K]
      }
      case 'message:send': {
        const p = payload as WaRequestEnvelope<'message:send'>['payload']
        // Every outbound message goes through the scheduler. This is the last
        // gate before the socket, so no caller can bypass pacing.
        return (await throttle.run(
          p.deviceId,
          () => transport.send(p.deviceId, p.to, p.message),
          { manual: p.manual ?? false, typing: typingFor(p.to, p.message) },
        )) as WaResponses[K]
      }
      case 'status:post': {
        const p = payload as WaRequestEnvelope<'status:post'>['payload']
        return (await throttle.run(p.deviceId, () =>
          transport.postStatus(p.deviceId, p.message, p.statusJidList),
        )) as WaResponses[K]
      }
      case 'channel:post': {
        const p = payload as WaRequestEnvelope<'channel:post'>['payload']
        return (await throttle.run(p.deviceId, () =>
          transport.channelPost(p.deviceId, p.channelId, p.message),
        )) as WaResponses[K]
      }
      case 'number:check': {
        const p = payload as WaRequestEnvelope<'number:check'>['payload']
        return (await query(p.deviceId, () =>
          transport.checkNumbers(p.deviceId, p.phones),
        )) as WaResponses[K]
      }
      case 'message:read': {
        const p = payload as WaRequestEnvelope<'message:read'>['payload']
        await transport.markRead(p.deviceId, p.chatJid, p.messageIds)
        return { ok: true } as WaResponses[K]
      }
      case 'group:metadata': {
        const p = payload as WaRequestEnvelope<'group:metadata'>['payload']
        return (await query(p.deviceId, () =>
          transport.groupMetadata(p.deviceId, p.groupId),
        )) as WaResponses[K]
      }
      case 'group:inviteCode': {
        const p = payload as WaRequestEnvelope<'group:inviteCode'>['payload']
        const code = await transport.groupInviteCode(p.deviceId, p.groupId)
        return { code } as WaResponses[K]
      }
      case 'group:revokeInvite': {
        const p = payload as WaRequestEnvelope<'group:revokeInvite'>['payload']
        const code = await transport.groupRevokeInvite(p.deviceId, p.groupId)
        return { code } as WaResponses[K]
      }
      case 'group:acceptInvite': {
        const p = payload as WaRequestEnvelope<'group:acceptInvite'>['payload']
        const groupId = await query(p.deviceId, () =>
          transport.groupAcceptInvite(p.deviceId, p.code),
        )
        return { groupId } as WaResponses[K]
      }
      case 'group:setting': {
        const p = payload as WaRequestEnvelope<'group:setting'>['payload']
        const { deviceId, ...rest } = p
        await transport.groupSetting(deviceId, rest)
        return { ok: true } as WaResponses[K]
      }
      case 'group:joinApproval': {
        const p = payload as WaRequestEnvelope<'group:joinApproval'>['payload']
        await transport.groupJoinApproval(p.deviceId, p.groupId, p.enabled)
        return { ok: true } as WaResponses[K]
      }
      case 'group:description': {
        const p = payload as WaRequestEnvelope<'group:description'>['payload']
        await transport.groupDescription(p.deviceId, p.groupId, p.description)
        return { ok: true } as WaResponses[K]
      }
      case 'group:requests': {
        const p = payload as WaRequestEnvelope<'group:requests'>['payload']
        return (await transport.groupRequests(p.deviceId, p.groupId)) as WaResponses[K]
      }
      case 'group:requestsUpdate': {
        const p = payload as WaRequestEnvelope<'group:requestsUpdate'>['payload']
        const { deviceId, ...rest } = p
        return (await query(deviceId, () =>
          transport.groupRequestsUpdate(deviceId, rest),
        )) as WaResponses[K]
      }
      case 'group:participants': {
        const p = payload as WaRequestEnvelope<'group:participants'>['payload']
        const { deviceId, ...rest } = p
        return (await query(deviceId, () =>
          transport.groupParticipants(deviceId, rest),
        )) as WaResponses[K]
      }
      case 'community:fetch': {
        const p = payload as WaRequestEnvelope<'community:fetch'>['payload']
        return (await transport.communityFetch(p.deviceId)) as WaResponses[K]
      }
      case 'community:create': {
        const p = payload as WaRequestEnvelope<'community:create'>['payload']
        return (await query(p.deviceId, () =>
          transport.communityCreate(p.deviceId, p.subject, p.description),
        )) as WaResponses[K]
      }
      case 'community:link': {
        const p = payload as WaRequestEnvelope<'community:link'>['payload']
        await transport.communityLink(p.deviceId, p.communityId, p.groupId)
        return { ok: true } as WaResponses[K]
      }
      case 'community:unlink': {
        const p = payload as WaRequestEnvelope<'community:unlink'>['payload']
        await transport.communityUnlink(p.deviceId, p.communityId, p.groupId)
        return { ok: true } as WaResponses[K]
      }
      case 'community:createGroup': {
        const p = payload as WaRequestEnvelope<'community:createGroup'>['payload']
        const { deviceId, ...rest } = p
        return (await query(deviceId, () =>
          transport.communityCreateGroup(deviceId, rest),
        )) as WaResponses[K]
      }
      case 'channel:create': {
        const p = payload as WaRequestEnvelope<'channel:create'>['payload']
        return (await transport.channelCreate(
          p.deviceId,
          p.name,
          p.description,
        )) as WaResponses[K]
      }
      case 'channel:follow': {
        const p = payload as WaRequestEnvelope<'channel:follow'>['payload']
        return (await transport.channelFollow(p.deviceId, p.key)) as WaResponses[K]
      }
      case 'catalog:fetch': {
        const p = payload as WaRequestEnvelope<'catalog:fetch'>['payload']
        return { products: await transport.fetchCatalog(p.deviceId) } as WaResponses[K]
      }
      case 'business:profile': {
        const p = payload as WaRequestEnvelope<'business:profile'>['payload']
        return { isBusiness: await transport.isBusiness(p.deviceId) } as WaResponses[K]
      }
      case 'chat:label': {
        const p = payload as WaRequestEnvelope<'chat:label'>['payload']
        const { deviceId, ...rest } = p
        await transport.chatLabel(deviceId, rest)
        return { ok: true } as WaResponses[K]
      }
      case 'call:reject': {
        const p = payload as WaRequestEnvelope<'call:reject'>['payload']
        await transport.rejectCall(p.deviceId, p.callId, p.from)
        return { ok: true } as WaResponses[K]
      }
      case 'throttle:configure': {
        const p = payload as WaRequestEnvelope<'throttle:configure'>['payload']
        const { deviceId, sentToday, ...config } = p
        const defined = Object.fromEntries(
          Object.entries(config).filter(([, v]) => v !== undefined),
        )
        throttle.configure(deviceId, defined)
        if (sentToday !== undefined) throttle.seed(deviceId, sentToday)
        return { ok: true } as WaResponses[K]
      }
      case 'service:ping':
        return { pong: true, sessions: sessions.sessionCount } as WaResponses[K]
      case 'service:shutdown':
        await sessions.shutdown()
        return { ok: true } as WaResponses[K]
      default: {
        // Exhaustiveness: adding a request kind without a case is a type error.
        const never: never = kind
        throw new Error(`unknown request kind: ${String(never)}`)
      }
    }
  }

  process.parentPort?.on('message', (event) => {
    const envelope = event.data as WaRequestEnvelope
    void handle(envelope)
      .then((data) => post({ id: envelope.id, result: { ok: true, data } }))
      .catch((err: unknown) => {
        // Never throw across the port: a rejected promise loses its shape and
        // the caller would hang waiting for a reply that never arrives.
        post({
          id: envelope.id,
          result: { ok: false, error: err instanceof Error ? err.message : String(err) },
        })
      })
  })

  emit('log', {
    level: 'info',
    message: `wa-service ready (${process.env.WA_TRANSPORT ?? 'baileys'})`,
  })
}

process.on('uncaughtException', (err) => {
  emit('log', { level: 'error', message: `uncaughtException: ${err.message}` })
})
process.on('unhandledRejection', (reason) => {
  emit('log', { level: 'error', message: `unhandledRejection: ${String(reason)}` })
})

void main().catch((err: unknown) => {
  emit('log', { level: 'error', message: `wa-service failed to start: ${String(err)}` })
  process.exit(1)
})

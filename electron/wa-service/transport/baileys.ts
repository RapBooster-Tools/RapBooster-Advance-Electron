/**
 * Real WhatsApp transport, wrapping Baileys.
 *
 * This is the only file in the codebase that imports Baileys. Everything else
 * talks to the Transport interface, so a version bump or API change is confined
 * here (CLAUDE.md §8).
 *
 * BUTTONS AND LISTS (REQUIREMENTS §7.9).
 * Baileys 7's high-level `sendMessage` content union has no button variant —
 * only button *responses*, i.e. what arrives when a recipient taps one. The
 * protobuf definitions for sending are all still present, so real buttons go out
 * through `generateWAMessageFromContent` + `relayMessage` instead (see
 * `sendInteractive` below). Whether a given account's recipients see them
 * rendered is decided by WhatsApp's servers, not by us, so every interactive
 * send falls back to numbered text if construction or relay fails — a message
 * that always arrives beats one that silently does not.
 */
import makeWASocket, {
  Browsers,
  DisconnectReason,
  generateWAMessageFromContent,
  jidNormalizedUser,
  proto,
  useMultiFileAuthState,
  type Chat,
  type Contact,
  type WAMessage,
  type WASocket,
} from 'baileys'
import type { Boom } from '@hapi/boom'
import { rm } from 'node:fs/promises'
import { basename } from 'node:path'
import { TransportEmitter } from './emitter'
import { isLidJid, isPnJid, LidResolver, pnJidOf } from './lid'
import { resolveLinkPreview } from '../link-preview'
import { buttonsAsNumberedText } from '../../../shared/template-buttons'
import type {
  WaButton,
  WaRequests,
  WaResponses,
  WaSyncedContact,
} from '../../../shared/wa-protocol'
import type {
  GroupMetadata,
  IncomingMessage,
  OutgoingButtons,
  OutgoingList,
  OutgoingMessage,
  Product,
  RemoteGroup,
  SendResult,
  StatusContent,
  Transport,
} from './types'

type Payload<K extends keyof WaRequests> = Omit<WaRequests[K], 'deviceId'>

interface Session {
  socket: WASocket
  authDir: string
  /** LID → phone number for this account (transport/lid.ts). */
  lids: LidResolver
  connected: boolean
  /** Set when logout() is called, so the close handler does not fight it. */
  closing: boolean
}

/** WhatsApp addresses individuals as <number>@s.whatsapp.net. */
function toJid(target: string): string {
  if (target.includes('@')) return target
  return `${target.replace(/\D/g, '')}@s.whatsapp.net`
}

function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const table: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    mp4: 'video/mp4',
    ogg: 'audio/ogg; codecs=opus',
    opus: 'audio/ogg; codecs=opus',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    wav: 'audio/wav',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
  return table[ext] ?? 'application/octet-stream'
}

/** A vCard 3.0 for one shared contact; `waid` makes WhatsApp show "Message". */
function vcard(name: string, phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${name.replace(/[\r\n]/g, ' ')}`,
    `TEL;type=CELL;type=VOICE;waid=${digits}:+${digits}`,
    'END:VCARD',
  ].join('\n')
}

/** Our own JID's user part, or null before login completes. */
function ownJid(socket: WASocket): string | null {
  return socket.user?.id ? jidNormalizedUser(socket.user.id) : null
}

/**
 * Buttons, in the most widely-rendered shape that can carry them.
 *
 * - Quick replies only → `buttonsMessage`, the oldest and best-supported form.
 * - Reply/url/call mix → `templateMessage.hydratedTemplate`, whose three button
 *   kinds map exactly onto ours.
 * - Anything with a copy button → `interactiveMessage.nativeFlowMessage`, the
 *   only shape that carries one.
 *
 * Each step down is less widely rendered, so we take the highest one that can
 * express the template rather than always using the most capable.
 */
function buildButtonsMessage(message: OutgoingButtons): proto.IMessage {
  const { body, footer, buttons } = message

  if (buttons.some((b) => b.type === 'copy')) {
    return {
      // viewOnce is how WhatsApp Web itself wraps native-flow messages; without
      // it many clients ignore the buttons entirely.
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
          interactiveMessage: {
            body: { text: body },
            ...(footer ? { footer: { text: footer } } : {}),
            nativeFlowMessage: {
              messageVersion: 1,
              buttons: buttons.map(nativeFlowButton),
            },
          },
        },
      },
    }
  }

  if (buttons.every((b) => b.type === 'reply')) {
    return {
      buttonsMessage: {
        contentText: body,
        ...(footer ? { footerText: footer } : {}),
        headerType: proto.Message.ButtonsMessage.HeaderType.EMPTY,
        buttons: buttons.map((b) => ({
          buttonId: b.id,
          buttonText: { displayText: b.label },
          type: proto.Message.ButtonsMessage.Button.Type.RESPONSE,
        })),
      },
    }
  }

  return {
    templateMessage: {
      hydratedTemplate: {
        hydratedContentText: body,
        ...(footer ? { hydratedFooterText: footer } : {}),
        hydratedButtons: buttons.map((b, index) => hydratedButton(b, index + 1)),
      },
    },
  }
}

function hydratedButton(button: WaButton, index: number): proto.IHydratedTemplateButton {
  switch (button.type) {
    case 'url':
      return {
        index,
        urlButton: { displayText: button.label, url: button.value ?? '' },
      }
    case 'call':
      return {
        index,
        callButton: { displayText: button.label, phoneNumber: button.value ?? '' },
      }
    // A copy button never reaches here — buildButtonsMessage routes those to
    // native flow, which is the only shape that can express one.
    case 'reply':
    case 'copy':
      return {
        index,
        quickReplyButton: { displayText: button.label, id: button.id },
      }
  }
}

/**
 * Native-flow buttons are `{ name, buttonParamsJson }` pairs. Baileys neither
 * validates the name nor parses the JSON — the names below are WhatsApp's own,
 * and an unknown one is dropped by the server, which is why the caller keeps a
 * text fallback.
 */
function nativeFlowButton(button: WaButton) {
  switch (button.type) {
    case 'url':
      return {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({
          display_text: button.label,
          url: button.value ?? '',
          merchant_url: button.value ?? '',
        }),
      }
    case 'call':
      return {
        name: 'cta_call',
        buttonParamsJson: JSON.stringify({
          display_text: button.label,
          phone_number: button.value ?? '',
        }),
      }
    case 'copy':
      return {
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({
          display_text: button.label,
          copy_code: button.value ?? '',
        }),
      }
    case 'reply':
      return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({ display_text: button.label, id: button.id }),
      }
  }
}

/** A single-select list. WhatsApp renders one section; more adds no value here. */
function buildListMessage(message: OutgoingList): proto.IMessage {
  return {
    listMessage: {
      description: message.body,
      buttonText: message.buttonText,
      ...(message.footer ? { footerText: message.footer } : {}),
      listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
      sections: [
        {
          rows: message.rows.map((row) => ({
            rowId: row.id,
            title: row.title,
            ...(row.description ? { description: row.description } : {}),
          })),
        },
      ],
    },
  }
}

/**
 * The text of a tapped button or list row.
 *
 * WHY the label before the id: the label is what the customer saw and what the
 * inbox should show; chatbot flows and keyword rules match option titles, and
 * flows also accept the id (the option id we sent), so either way still works.
 */
function tappedReply(content: Record<string, unknown>): string | null {
  const buttons = content.buttonsResponseMessage as
    { selectedButtonId?: string | null; selectedDisplayText?: string | null } | undefined
  const template = content.templateButtonReplyMessage as
    { selectedId?: string | null; selectedDisplayText?: string | null } | undefined
  const list = content.listResponseMessage as
    | {
        title?: string | null
        singleSelectReply?: { selectedRowId?: string | null } | null
      }
    | undefined
  const interactive = content.interactiveResponseMessage as
    | {
        body?: { text?: string | null } | null
        nativeFlowResponseMessage?: { paramsJson?: string | null } | null
      }
    | undefined

  let nativeId: string | null = null
  const params = interactive?.nativeFlowResponseMessage?.paramsJson
  if (params) {
    try {
      const parsed = JSON.parse(params) as { id?: unknown }
      if (typeof parsed.id === 'string') nativeId = parsed.id
    } catch (err) {
      // A malformed payload from another client: fall back to the body text.
      console.debug('baileys: unreadable interactive reply params', err)
    }
  }

  const candidates = [
    buttons?.selectedDisplayText,
    buttons?.selectedButtonId,
    template?.selectedDisplayText,
    template?.selectedId,
    list?.title,
    list?.singleSelectReply?.selectedRowId,
    interactive?.body?.text,
    nativeId,
  ]
  return (
    candidates.find((c): c is string => typeof c === 'string' && c.trim() !== '') ?? null
  )
}

export class BaileysTransport extends TransportEmitter implements Transport {
  private readonly sessions = new Map<string, Session>()

  async connect(deviceId: string, authDir: string): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(authDir)

    const socket = makeWASocket({
      auth: state,
      // Identifying as a desktop browser is what WhatsApp expects from a linked
      // device; the default can look anomalous.
      browser: Browsers.appropriate('Desktop'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    })

    // Baileys keeps every LID↔number pair it has seen in its signal store;
    // the resolver asks it, and reports newly learned pairs so main can fix
    // rows stored while the number was still hidden.
    const lids = new LidResolver(
      (missing) => socket.signalRepository.lidMapping.getPNsForLIDs(missing),
      (mappings) => this.emit('lidMapping', deviceId, mappings),
    )
    this.sessions.set(deviceId, {
      socket,
      authDir,
      lids,
      connected: false,
      closing: false,
    })
    socket.ev.on('lid-mapping.update', (pair) => {
      lids.learn([pair])
    })
    this.emit('status', deviceId, 'connecting')

    // Credentials must be persisted the moment they change; a dropped update
    // means the user has to re-scan.
    socket.ev.on('creds.update', () => {
      void saveCreds()
    })

    socket.ev.on('connection.update', (update) => {
      const session = this.sessions.get(deviceId)
      if (!session) return

      if (update.qr) {
        this.emit('qr', deviceId, update.qr)
        this.emit('status', deviceId, 'qr_pending')
      }

      if (update.connection === 'open') {
        session.connected = true
        const phone = socket.user?.id?.split(':')[0]
        this.emit('status', deviceId, 'connected', phone ? { phone: `+${phone}` } : {})
      }

      if (update.connection === 'close') {
        session.connected = false
        const statusCode = (update.lastDisconnect?.error as Boom | undefined)?.output
          ?.statusCode
        const loggedOut = statusCode === DisconnectReason.loggedOut

        // Only loggedOut is terminal. Everything else — restart required,
        // connection lost, timeout — is retryable, and the supervisor decides
        // when to retry (CLAUDE.md §5.4).
        if (loggedOut) {
          this.emit('status', deviceId, 'logged_out')
          this.emit(
            'disconnected',
            deviceId,
            'logged_out',
            `statusCode=${String(statusCode)}`,
          )
          this.sessions.delete(deviceId)
        } else if (!session.closing) {
          this.emit('status', deviceId, 'disconnected')
          this.emit(
            'disconnected',
            deviceId,
            'retryable',
            `statusCode=${String(statusCode)}`,
          )
        }
      }
    })

    // Resolving a LID can wait on the signal store; chaining keeps messages
    // in the order WhatsApp delivered them.
    let inbound = Promise.resolve()
    socket.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return
      inbound = inbound.then(async () => {
        for (const raw of messages) {
          if (raw.key.fromMe) continue
          try {
            const parsed = await this.parseIncoming(raw, lids)
            if (parsed) this.emit('message', deviceId, parsed)
          } catch (err) {
            console.error(`could not read an incoming message on ${deviceId}`, err)
          }
        }
      })
    })

    socket.ev.on('call', (calls) => {
      for (const call of calls) {
        // Only the offer matters: that is the moment a reject is still possible.
        if (call.status !== 'offer') continue
        void lids.phoneOrHidden(call.from, call.callerPn).then((from) =>
          this.emit('call', deviceId, {
            callId: call.id,
            from,
            isVideo: call.isVideo ?? false,
          }),
        )
      }
    })

    // The phone's address book and chat list arrive in pieces: the initial
    // history sync, then upserts and updates. Only entries with a real phone
    // number are useful to the grabber; a LID-only entry cannot be messaged by
    // number, so it is kept only when WhatsApp told us its phone number.
    const emitSynced = (synced: WaSyncedContact[]) => {
      if (synced.length > 0) this.emit('contacts', deviceId, synced)
    }
    const forwardContacts = async (raw: Array<Partial<Contact>>) => {
      // Every pair a contact carries is a mapping worth keeping, whether or
      // not the contact itself is forwarded.
      lids.learn(
        raw.flatMap((c) => [
          { lid: c.lid, pn: c.phoneNumber },
          { lid: c.id, pn: c.phoneNumber },
        ]),
      )
      await lids.prefetch(raw.map((c) => c.id))
      emitSynced(
        raw.flatMap((c) => {
          const phone =
            (c.phoneNumber ? lids.knownPhone(c.phoneNumber) : null) ??
            (c.id ? lids.knownPhone(c.id) : null)
          if (!phone) return []
          return [
            {
              jid: pnJidOf(phone),
              phone,
              name: c.name ?? c.notify ?? c.verifiedName ?? null,
              source: 'addressBook' as const,
            },
          ]
        }),
      )
    }
    // WHY chats too: the address book misses everyone who messaged the user
    // without being saved — often exactly the leads a business wants.
    const forwardChats = async (raw: Array<Partial<Chat>>) => {
      // Groups, broadcast lists, Status and channels are not people.
      const people = raw.filter((c) => isPnJid(c.id) || isLidJid(c.id))
      lids.learn(
        people.map((c) => ({
          lid: c.lidJid ?? (isLidJid(c.id) ? c.id : undefined),
          pn: c.pnJid ?? (isPnJid(c.id) ? c.id : undefined),
        })),
      )
      await lids.prefetch(people.map((c) => c.id))
      emitSynced(
        people.flatMap((c) => {
          const phone =
            (c.pnJid ? lids.knownPhone(c.pnJid) : null) ?? lids.knownPhone(c.id!)
          if (!phone) return []
          const ts = c.conversationTimestamp ? Number(c.conversationTimestamp) : 0
          return [
            {
              jid: pnJidOf(phone),
              phone,
              name: c.name ?? c.displayName ?? null,
              source: 'chat' as const,
              lastChatAt: ts > 0 ? new Date(ts * 1000).toISOString() : null,
            },
          ]
        }),
      )
    }
    const logFailure = (what: string) => (err: unknown) =>
      console.warn(`could not read synced ${what} on ${deviceId}`, err)
    socket.ev.on('messaging-history.set', ({ contacts, chats, lidPnMappings }) => {
      lids.learn(lidPnMappings ?? [])
      void forwardContacts(contacts).catch(logFailure('contacts'))
      void forwardChats(chats).catch(logFailure('chats'))
    })
    socket.ev.on('contacts.upsert', (contacts) => {
      void forwardContacts(contacts).catch(logFailure('contacts'))
    })
    socket.ev.on('contacts.update', (contacts) => {
      void forwardContacts(contacts).catch(logFailure('contacts'))
    })
    socket.ev.on('chats.upsert', (chats) => {
      void forwardChats(chats).catch(logFailure('chats'))
    })

    socket.ev.on('labels.edit', (label) => {
      this.emit('label', deviceId, {
        labelId: label.id,
        name: label.name,
        color: label.color,
        deleted: label.deleted,
      })
    })

    socket.ev.on('labels.association', ({ association, type }) => {
      // Message-level labels have no equivalent in our model; chats map to tags.
      if (!('chatId' in association) || 'messageId' in association) return
      // Chats are filed under the number when it is known; so must this be.
      void lids.chatJid(association.chatId).then((chatJid) =>
        this.emit('labelAssociation', deviceId, {
          labelId: association.labelId,
          chatJid,
          action: type,
        }),
      )
    })

    socket.ev.on('messages.update', (updates) => {
      for (const update of updates) {
        const status = update.update.status
        if (!update.key.id || status === undefined || status === null) continue
        // 3 = delivered, 4 = read in WhatsApp's status enum.
        if (Number(status) === 3)
          this.emit('receipt', deviceId, update.key.id, 'delivered')
        if (Number(status) === 4) this.emit('receipt', deviceId, update.key.id, 'read')
      }
    })
  }

  private async parseIncoming(
    raw: WAMessage,
    lids: LidResolver,
  ): Promise<IncomingMessage | null> {
    const id = raw.key.id
    const remoteJid = raw.key.remoteJid
    if (!id || !remoteJid) return null
    const isGroup = remoteJid.endsWith('@g.us')
    // A one-to-one chat is filed under the phone number whenever WhatsApp
    // gave us one (the key's alt JID, or a learned mapping), so the same
    // person is one chat however WhatsApp chose to address them.
    const chatId = isGroup
      ? remoteJid
      : await lids.chatJid(remoteJid, raw.key.remoteJidAlt)
    // In a group the sender is the participant; elsewhere the chat itself.
    const from = isGroup
      ? await lids.phoneOrHidden(raw.key.participant, raw.key.participantAlt)
      : await lids.phoneOrHidden(remoteJid, raw.key.remoteJidAlt)

    const content = (raw.message ?? {}) as Record<string, unknown>
    const text =
      (content.conversation as string | undefined) ??
      (content.extendedTextMessage as { text?: string } | undefined)?.text ??
      null

    const image = content.imageMessage as { caption?: string } | undefined
    const video = content.videoMessage as { caption?: string } | undefined
    const document = content.documentMessage as
      { fileName?: string; fileLength?: number | Long; caption?: string } | undefined

    let type: IncomingMessage['type'] = 'text'
    let body = text
    let fileName: string | null = null
    let fileSize: number | null = null

    if (image ?? video) {
      type = 'media'
      body = image?.caption ?? video?.caption ?? null
    } else if (document) {
      type = 'attachment'
      body = document.caption ?? null
      fileName = document.fileName ?? null
      fileSize = document.fileLength ? Number(document.fileLength) : null
    } else if (content.audioMessage) {
      type = 'voice'
    } else if (content.stickerMessage) {
      type = 'sticker'
    } else if (content.locationMessage ?? content.liveLocationMessage) {
      type = 'location'
      const loc = (content.locationMessage ?? content.liveLocationMessage) as {
        name?: string
        address?: string
        degreesLatitude?: number
        degreesLongitude?: number
      }
      body =
        loc.name ??
        loc.address ??
        `${loc.degreesLatitude ?? ''},${loc.degreesLongitude ?? ''}`
    } else if (content.contactMessage ?? content.contactsArrayMessage) {
      type = 'contact'
      body =
        (content.contactMessage as { displayName?: string } | undefined)?.displayName ??
        (content.contactsArrayMessage as { displayName?: string } | undefined)
          ?.displayName ??
        null
    } else if (
      content.pollCreationMessage ??
      content.pollCreationMessageV2 ??
      content.pollCreationMessageV3
    ) {
      type = 'poll'
      body =
        (
          (content.pollCreationMessage ??
            content.pollCreationMessageV2 ??
            content.pollCreationMessageV3) as { name?: string }
        ).name ?? null
    } else if (content.eventMessage) {
      type = 'event'
      body = (content.eventMessage as { name?: string }).name ?? null
    } else if (content.productMessage) {
      type = 'product'
    } else if (content.buttonsResponseMessage ?? content.templateButtonReplyMessage) {
      type = 'buttons'
      body = tappedReply(content)
    } else if (content.listResponseMessage ?? content.interactiveResponseMessage) {
      type = 'interactive'
      body = tappedReply(content)
    }

    const seconds = raw.messageTimestamp
      ? Number(raw.messageTimestamp)
      : Date.now() / 1000

    return {
      id,
      chatId,
      from,
      pushName: raw.pushName ?? null,
      isGroup,
      type,
      body,
      fileName,
      fileSize,
      timestamp: new Date(seconds * 1000).toISOString(),
    }
  }

  async requestPairingCode(deviceId: string, phone: string): Promise<string> {
    const session = this.sessions.get(deviceId)
    if (!session) throw new Error(`no session for device ${deviceId}`)

    this.emit('status', deviceId, 'pairing_pending')
    // Baileys wants digits only, including country code, without a leading '+'.
    const code = await session.socket.requestPairingCode(phone.replace(/\D/g, ''))
    this.emit('pairingCode', deviceId, code)
    return code
  }

  async disconnect(deviceId: string): Promise<void> {
    const session = this.sessions.get(deviceId)
    if (!session) return
    session.closing = true
    session.socket.end(undefined)
    session.connected = false
    this.sessions.delete(deviceId)
    this.emit('status', deviceId, 'disconnected')
  }

  async logout(deviceId: string): Promise<void> {
    const session = this.sessions.get(deviceId)
    if (!session) return
    session.closing = true
    try {
      await session.socket.logout()
    } catch (err) {
      // The socket may already be dead; the credentials still have to go.
      console.warn(`logout: socket.logout failed for ${deviceId}`, err)
    }
    this.sessions.delete(deviceId)
    // Credentials are useless after logout and must not be reused.
    await rm(session.authDir, { recursive: true, force: true })
    this.emit('status', deviceId, 'logged_out')
  }

  isConnected(deviceId: string): boolean {
    return this.sessions.get(deviceId)?.connected ?? false
  }

  async send(
    deviceId: string,
    to: string,
    message: OutgoingMessage,
  ): Promise<SendResult> {
    const session = this.sessions.get(deviceId)
    if (!session?.connected) {
      throw new Error(`device ${deviceId} is not connected`)
    }

    const jid = toJid(to)

    if (message.kind === 'buttons' || message.kind === 'list') {
      const interactive = await this.sendInteractive(session.socket, jid, message)
      if (interactive) return interactive
      // Fell back: send the text form through the normal path below.
    }

    const sent = await session.socket.sendMessage(jid, await this.toContent(message))
    const id = sent?.key?.id
    if (!id) throw new Error('send returned no message id')
    return { messageId: id }
  }

  /**
   * Send a real buttons/list message by building the protobuf directly.
   *
   * Returns null when the message could not be built or relayed, which makes the
   * caller fall back to numbered text. WHY a fallback at all: WhatsApp decides
   * server-side whether an unofficial client may send these, and that answer has
   * changed before. A campaign that stops delivering is far worse than one whose
   * buttons arrive as a numbered list.
   */
  private async sendInteractive(
    socket: WASocket,
    jid: string,
    message: OutgoingButtons | OutgoingList,
  ): Promise<SendResult | null> {
    try {
      const content =
        message.kind === 'list' ? buildListMessage(message) : buildButtonsMessage(message)

      const generated = generateWAMessageFromContent(jid, content, {
        userJid: socket.user?.id ?? '',
      })
      const id = generated.key?.id
      if (!id) return null

      await socket.relayMessage(jid, generated.message ?? {}, { messageId: id })
      return { messageId: id }
    } catch (err) {
      // Not silent: this is the signal that WhatsApp changed the rules, and the
      // user is still getting their message — as text.
      console.warn('interactive send failed, falling back to text', err)
      return null
    }
  }

  /** Map our outgoing shapes onto Baileys' AnyMessageContent. */
  private async toContent(message: OutgoingMessage) {
    switch (message.kind) {
      // Link previews are on for every text message (REQUIREMENTS §7.11). The
      // preview is resolved here and handed over finished, so Baileys does not
      // fetch it again per recipient — see ../link-preview.ts. An explicit null
      // is what tells Baileys "no preview, and do not go looking".
      case 'text':
        return { text: message.body, linkPreview: await resolveLinkPreview(message.body) }

      // NOTE: pass `{ url: path }` rather than a Buffer so Baileys streams the
      // file from disk. Reading it into memory first costs roughly twice the
      // file size (the buffer, plus the encryption stream Baileys builds from
      // it) and that cost is paid per in-flight send. Measured on a 15 MB
      // video: 30.9 MB peak buffered vs 11.8 MB streamed. Across 20 devices
      // that is ~618 MB against ~236 MB, and the buffered figure breaks the
      // 800 MB budget in CLAUDE.md §5.7 on its own. The produced message is
      // byte-identical either way — same thumbnail, dimensions and fileLength.
      case 'media': {
        const source = { url: message.path }
        return message.mediaType === 'video'
          ? { video: source, ...(message.caption ? { caption: message.caption } : {}) }
          : { image: source, ...(message.caption ? { caption: message.caption } : {}) }
      }

      case 'document': {
        return {
          document: { url: message.path },
          fileName: message.fileName || basename(message.path),
          mimetype: mimeFor(message.path),
          ...(message.caption ? { caption: message.caption } : {}),
        }
      }

      // Only reached when the interactive send above could not be delivered.
      case 'buttons': {
        const text = buttonsAsNumberedText(message.body, message.buttons)
        const body = message.footer ? `${text}\n\n${message.footer}` : text
        return { text: body, linkPreview: await resolveLinkPreview(body) }
      }

      case 'list': {
        const rows = message.rows
          .map(
            (row, i) =>
              `${i + 1}. ${row.title}${row.description ? ` — ${row.description}` : ''}`,
          )
          .join('\n')
        const text = `${message.body}\n\n${rows}`
        const body = message.footer ? `${text}\n\n${message.footer}` : text
        return { text: body, linkPreview: await resolveLinkPreview(body) }
      }

      // Voice notes: WhatsApp renders `ptt` audio as a voice note only when it
      // is Opus in Ogg; other formats arrive as a playable audio file.
      case 'audio':
        return {
          audio: { url: message.path },
          ptt: message.ptt,
          mimetype: mimeFor(message.path),
        }

      case 'sticker':
        return { sticker: { url: message.path } }

      case 'location':
        return {
          location: {
            degreesLatitude: message.latitude,
            degreesLongitude: message.longitude,
            ...(message.name ? { name: message.name } : {}),
            ...(message.address ? { address: message.address } : {}),
          },
        }

      case 'contacts':
        return {
          contacts: {
            displayName:
              message.contacts.length === 1
                ? message.contacts[0]!.name
                : `${message.contacts.length} contacts`,
            contacts: message.contacts.map((c) => ({
              displayName: c.name,
              vcard: vcard(c.name, c.phone),
            })),
          },
        }

      case 'poll':
        return {
          poll: {
            name: message.name,
            values: message.options,
            selectableCount: message.selectableCount,
          },
        }

      case 'event':
        return {
          event: {
            name: message.name,
            ...(message.description ? { description: message.description } : {}),
            startDate: new Date(message.startAt),
            ...(message.endAt ? { endDate: new Date(message.endAt) } : {}),
            ...(message.location ? { location: { name: message.location } } : {}),
          },
        }

      // A product message needs an image. Without one, send the details as
      // text rather than failing the recipient.
      case 'product': {
        if (!message.imageUrl) {
          const price =
            message.priceAmount1000 !== undefined && message.currency
              ? `\n${(message.priceAmount1000 / 1000).toFixed(2)} ${message.currency}`
              : ''
          const text = [message.body, `*${message.title}*`, message.description]
            .filter(Boolean)
            .join('\n')
          return { text: `${text}${price}`, linkPreview: null }
        }
        return {
          product: {
            productId: message.productId,
            title: message.title,
            ...(message.description ? { description: message.description } : {}),
            ...(message.priceAmount1000 !== undefined
              ? { priceAmount1000: message.priceAmount1000 }
              : {}),
            ...(message.currency ? { currencyCode: message.currency } : {}),
            productImage: { url: message.imageUrl },
          },
          ...(message.body ? { body: message.body } : {}),
        }
      }
    }
  }

  private lidsFor(deviceId: string): LidResolver {
    const session = this.sessions.get(deviceId)
    if (!session) throw new Error(`no session for device ${deviceId}`)
    return session.lids
  }

  private socketFor(deviceId: string): WASocket {
    const session = this.sessions.get(deviceId)
    if (!session?.connected) throw new Error(`device ${deviceId} is not connected`)
    return session.socket
  }

  async presence(
    deviceId: string,
    to: string,
    state: 'composing' | 'recording' | 'paused',
  ): Promise<void> {
    await this.socketFor(deviceId).sendPresenceUpdate(state, toJid(to))
  }

  private statusContent(content: StatusContent) {
    if (content.kind === 'text') return { text: content.body }
    const source = { url: content.path }
    return content.mediaType === 'video'
      ? { video: source, ...(content.caption ? { caption: content.caption } : {}) }
      : { image: source, ...(content.caption ? { caption: content.caption } : {}) }
  }

  async postStatus(
    deviceId: string,
    content: StatusContent,
    statusJidList: string[],
  ): Promise<SendResult> {
    const socket = this.socketFor(deviceId)
    const sent = await socket.sendMessage(
      'status@broadcast',
      this.statusContent(content),
      {
        statusJidList: statusJidList.map(toJid),
        ...(content.kind === 'text' && content.backgroundColor
          ? { backgroundColor: content.backgroundColor }
          : {}),
      },
    )
    const id = sent?.key?.id
    if (!id) throw new Error('status post returned no message id')
    return { messageId: id }
  }

  async checkNumbers(
    deviceId: string,
    phones: string[],
  ): Promise<WaResponses['number:check']> {
    const socket = this.socketFor(deviceId)
    const digits = phones.map((p) => p.replace(/\D/g, ''))
    const found = (await socket.onWhatsApp(...digits)) ?? []
    // Results come back keyed by JID, not in request order.
    const byNumber = new Map(
      found.filter((r) => r.exists).map((r) => [r.jid.split('@')[0] ?? '', r.jid]),
    )
    return {
      results: phones.map((phone, i) => {
        const jid = byNumber.get(digits[i] ?? '') ?? null
        return { phone, exists: jid !== null, jid }
      }),
    }
  }

  async markRead(deviceId: string, chatJid: string, messageIds: string[]): Promise<void> {
    await this.socketFor(deviceId).readMessages(
      messageIds.map((id) => ({ remoteJid: chatJid, id, fromMe: false })),
    )
  }

  /**
   * Members' phone numbers. A LID-addressed group lists members by LID, with
   * the number alongside only when WhatsApp shares it; an unresolved member
   * gets the hidden stand-in, never the LID's digits dressed up as a number.
   */
  private async memberPhones(
    lids: LidResolver,
    members: Array<{ id: string; lid?: string; phoneNumber?: string }>,
  ): Promise<string[]> {
    lids.learn(
      members.flatMap((m) => [
        { lid: m.lid, pn: m.phoneNumber },
        { lid: m.id, pn: m.phoneNumber },
      ]),
    )
    await lids.prefetch(members.map((m) => m.id))
    return Promise.all(members.map((m) => lids.phoneOrHidden(m.id, m.phoneNumber)))
  }

  private async toMetadata(
    deviceId: string,
    group: Awaited<ReturnType<WASocket['groupMetadata']>>,
  ): Promise<GroupMetadata> {
    const phones = await this.memberPhones(this.lidsFor(deviceId), group.participants)
    return {
      id: group.id,
      name: group.subject,
      description: group.desc ?? null,
      participants: group.participants.map((p, i) => ({
        jid: p.id,
        phone: phones[i]!,
        isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
      })),
      announce: group.announce ?? false,
      restrict: group.restrict ?? false,
      joinApproval: group.joinApprovalMode ?? false,
      isCommunity: group.isCommunity ?? false,
      parentId: group.linkedParent ?? null,
    }
  }

  async groupMetadata(deviceId: string, groupId: string): Promise<GroupMetadata> {
    const socket = this.socketFor(deviceId)
    return this.toMetadata(deviceId, await socket.groupMetadata(groupId))
  }

  async groupInviteCode(deviceId: string, groupId: string): Promise<string> {
    const code = await this.socketFor(deviceId).groupInviteCode(groupId)
    if (!code) throw new Error('WhatsApp returned no invite code — are we an admin?')
    return code
  }

  async groupRevokeInvite(deviceId: string, groupId: string): Promise<string> {
    const code = await this.socketFor(deviceId).groupRevokeInvite(groupId)
    if (!code) throw new Error('WhatsApp returned no new invite code')
    return code
  }

  async groupAcceptInvite(deviceId: string, code: string): Promise<string> {
    const groupId = await this.socketFor(deviceId).groupAcceptInvite(code)
    if (!groupId) throw new Error('The invite link was not accepted')
    return groupId
  }

  async groupSetting(deviceId: string, p: Payload<'group:setting'>): Promise<void> {
    await this.socketFor(deviceId).groupSettingUpdate(p.groupId, p.setting)
  }

  async groupJoinApproval(
    deviceId: string,
    groupId: string,
    enabled: boolean,
  ): Promise<void> {
    await this.socketFor(deviceId).groupJoinApprovalMode(groupId, enabled ? 'on' : 'off')
  }

  async groupDescription(
    deviceId: string,
    groupId: string,
    description: string,
  ): Promise<void> {
    await this.socketFor(deviceId).groupUpdateDescription(groupId, description)
  }

  async groupRequests(
    deviceId: string,
    groupId: string,
  ): Promise<WaResponses['group:requests']> {
    const raw = (
      await this.socketFor(deviceId).groupRequestParticipantsList(groupId)
    ).filter((r) => typeof r.jid === 'string')
    const phones = await this.memberPhones(
      this.lidsFor(deviceId),
      raw.map((r) => ({
        id: r.jid!,
        ...(r.phone_number ? { phoneNumber: r.phone_number } : {}),
      })),
    )
    return {
      requests: raw.map((r, i) => ({
        jid: r.jid!,
        phone: phones[i]!,
        requestedAt: r.request_time
          ? new Date(Number(r.request_time) * 1000).toISOString()
          : null,
      })),
    }
  }

  async groupRequestsUpdate(
    deviceId: string,
    p: Payload<'group:requestsUpdate'>,
  ): Promise<WaResponses['group:requestsUpdate']> {
    const raw = await this.socketFor(deviceId).groupRequestParticipantsUpdate(
      p.groupId,
      p.jids,
      p.action,
    )
    return {
      results: raw.map((r, i) => ({
        jid: r.jid ?? p.jids[i] ?? '',
        ok: r.status === '200',
        error: r.status === '200' ? null : `status ${r.status}`,
      })),
    }
  }

  async groupParticipants(
    deviceId: string,
    p: Payload<'group:participants'>,
  ): Promise<WaResponses['group:participants']> {
    const raw = await this.socketFor(deviceId).groupParticipantsUpdate(
      p.groupId,
      p.jids.map(toJid),
      p.action,
    )
    // WhatsApp answers per participant: 200 ok, 403 privacy (needs an invite),
    // 408 recently left, 409 already a member.
    const reasons: Record<string, string> = {
      '403': 'privacy settings block adding them — send an invite link instead',
      '408': 'they left recently and cannot be re-added yet',
      '409': 'already a member',
    }
    return {
      results: raw.map((r, i) => ({
        jid: r.jid ?? p.jids[i] ?? '',
        ok: r.status === '200',
        error: r.status === '200' ? null : (reasons[r.status] ?? `status ${r.status}`),
      })),
    }
  }

  async communityFetch(deviceId: string): Promise<WaResponses['community:fetch']> {
    const socket = this.socketFor(deviceId)
    const communities = Object.values(await socket.communityFetchAllParticipating())
    const groups = Object.values(await socket.groupFetchAllParticipating())
    return {
      communities: communities.map((c) => ({
        id: c.id,
        name: c.subject,
        linkedGroupIds: groups.filter((g) => g.linkedParent === c.id).map((g) => g.id),
      })),
    }
  }

  async communityCreate(
    deviceId: string,
    subject: string,
    description: string,
  ): Promise<WaResponses['community:create']> {
    const created = await this.socketFor(deviceId).communityCreate(subject, description)
    if (!created) throw new Error('WhatsApp did not create the community')
    return { id: created.id, name: created.subject }
  }

  async communityLink(
    deviceId: string,
    communityId: string,
    groupId: string,
  ): Promise<void> {
    await this.socketFor(deviceId).communityLinkGroup(groupId, communityId)
  }

  async communityUnlink(
    deviceId: string,
    communityId: string,
    groupId: string,
  ): Promise<void> {
    await this.socketFor(deviceId).communityUnlinkGroup(groupId, communityId)
  }

  async communityCreateGroup(
    deviceId: string,
    p: Payload<'community:createGroup'>,
  ): Promise<RemoteGroup> {
    const created = await this.socketFor(deviceId).communityCreateGroup(
      p.subject,
      p.participants.map(toJid),
      p.communityId,
    )
    if (!created) throw new Error('WhatsApp did not create the group')
    return {
      id: created.id,
      name: created.subject,
      memberCount: created.participants.length,
      isAdmin: true,
    }
  }

  async channelCreate(
    deviceId: string,
    name: string,
    description: string,
  ): Promise<WaResponses['channel:create']> {
    const created = await this.socketFor(deviceId).newsletterCreate(name, description)
    return { id: created.id, name: created.name, inviteCode: created.invite ?? null }
  }

  async channelFollow(
    deviceId: string,
    key: string,
  ): Promise<WaResponses['channel:follow']> {
    const socket = this.socketFor(deviceId)
    const meta = await socket.newsletterMetadata(
      key.endsWith('@newsletter') ? 'jid' : 'invite',
      key,
    )
    if (!meta) throw new Error('No channel found for that link')
    await socket.newsletterFollow(meta.id)
    return {
      id: meta.id,
      name: meta.name,
      description: meta.description ?? null,
      subscribers: meta.subscribers ?? 0,
      inviteCode: meta.invite ?? null,
    }
  }

  async channelPost(
    deviceId: string,
    channelId: string,
    content: StatusContent,
  ): Promise<SendResult> {
    const sent = await this.socketFor(deviceId).sendMessage(
      channelId,
      this.statusContent(content),
    )
    const id = sent?.key?.id
    if (!id) throw new Error('channel post returned no message id')
    return { messageId: id }
  }

  async fetchCatalog(deviceId: string): Promise<Product[]> {
    const socket = this.socketFor(deviceId)
    const own = ownJid(socket)
    if (!own) throw new Error('device is not logged in yet')
    const { products } = await socket.getCatalog({ jid: own, limit: 100 })
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || null,
      priceAmount1000: Number.isFinite(p.price) ? p.price : null,
      currency: p.currency || null,
      imageUrl: Object.values(p.imageUrls ?? {})[0] ?? null,
    }))
  }

  async isBusiness(deviceId: string): Promise<boolean> {
    const socket = this.socketFor(deviceId)
    const own = ownJid(socket)
    if (!own) return false
    const profile = await socket.getBusinessProfile(own)
    return Boolean(profile)
  }

  async chatLabel(deviceId: string, p: Payload<'chat:label'>): Promise<void> {
    const socket = this.socketFor(deviceId)
    if (p.action === 'add') await socket.addChatLabel(p.chatJid, p.labelId)
    else await socket.removeChatLabel(p.chatJid, p.labelId)
  }

  async rejectCall(deviceId: string, callId: string, from: string): Promise<void> {
    await this.socketFor(deviceId).rejectCall(callId, from)
  }

  async fetchGroups(deviceId: string): Promise<RemoteGroup[]> {
    const session = this.sessions.get(deviceId)
    if (!session?.connected) throw new Error(`device ${deviceId} is not connected`)

    // NOTE: compare normalized JIDs, not string prefixes. Baileys reports our
    // own id with a device suffix (`<user>:<device>@s.whatsapp.net`) while group
    // participants carry none, so the two are only comparable after
    // normalization. A previous version used `p.id.startsWith(own)`, which also
    // matched any participant whose number merely *begins* with ours — a member
    // on +9198765432100 would have been read as us on +919876543210, silently
    // reporting the wrong admin rights for that group.
    const own = session.socket.user?.id ? jidNormalizedUser(session.socket.user.id) : null
    // A LID-addressed group lists us by our LID, not our number.
    const ownLid = session.socket.user?.lid
      ? jidNormalizedUser(session.socket.user.lid)
      : null
    const isUs = (p: { id: string; phoneNumber?: string }) =>
      [p.id, p.phoneNumber].some(
        (j) => typeof j === 'string' && [own, ownLid].includes(jidNormalizedUser(j)),
      )
    const all = await session.socket.groupFetchAllParticipating()

    return Object.values(all).map((group) => ({
      id: group.id,
      name: group.subject,
      memberCount: group.participants.length,
      // Unknown own id means we cannot claim admin — never assume we can.
      isAdmin:
        own !== null &&
        group.participants.some(
          (p) => isUs(p) && (p.admin === 'admin' || p.admin === 'superadmin'),
        ),
    }))
  }

  async createGroup(
    deviceId: string,
    subject: string,
    participants: string[],
  ): Promise<RemoteGroup> {
    const session = this.sessions.get(deviceId)
    if (!session?.connected) throw new Error(`device ${deviceId} is not connected`)

    const created = await session.socket.groupCreate(subject, participants.map(toJid))
    return {
      id: created.id,
      name: created.subject,
      memberCount: created.participants.length,
      isAdmin: true,
    }
  }

  async shutdown(): Promise<void> {
    for (const [deviceId] of this.sessions) {
      await this.disconnect(deviceId)
    }
  }
}

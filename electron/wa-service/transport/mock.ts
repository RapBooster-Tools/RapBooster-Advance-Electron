/**
 * Deterministic in-memory transport.
 *
 * WHY it exists: every automated test that touches sending must use this.
 * Pointing CI at a real WhatsApp account risks a permanent ban, which is
 * unrecoverable (CLAUDE.md §5.4). It also makes campaign, group and inbox
 * behaviour reproducible — real WhatsApp is neither fast nor deterministic.
 *
 * Behaviour is tuned by environment variables so a spec can script failure
 * without a bespoke build:
 *   WA_MOCK_FAIL_RATE   0..1, fraction of sends that fail (default 0)
 *   WA_MOCK_LATENCY_MS  artificial per-send delay (default 0)
 *   WA_MOCK_CONNECT_MS  delay before a device reports connected (default 50)
 *   WA_MOCK_INCOMING    inbound messages synthesised per linked device (default 0)
 *   WA_MOCK_SEND_LOG    file to append every send to as JSONL, for assertions
 *   WA_MOCK_ACTION_LOG  file to append non-send actions to (presence, read
 *                       receipts, call rejects, group/community/channel ops)
 *   WA_MOCK_INJECT      JSONL file the mock tails for scripted inbound events —
 *                       messages, calls, labels, receipts — so a spec can drive
 *                       any inbound path with arbitrary content
 *   WA_MOCK_INVALID_SUFFIX  numbers ending in this are "not on WhatsApp"
 *                       (default 000)
 *   WA_MOCK_BUSINESS    1 = every device reports a WhatsApp Business account
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { TransportEmitter } from './emitter'
import type {
  GroupMetadata,
  OutgoingMessage,
  Product,
  RemoteGroup,
  SendResult,
  StatusContent,
  Transport,
} from './types'
import type { WaIncomingType, WaRequests, WaResponses } from '../../../shared/wa-protocol'

type Payload<K extends keyof WaRequests> = Omit<WaRequests[K], 'deviceId'>

const num = (name: string, fallback: number): number => {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Append every send to a JSONL file when WA_MOCK_SEND_LOG points at one.
 *
 * WHY a file rather than a new IPC channel: nothing in the app could previously
 * assert *what* was sent — the mock counted sends and dropped the payload — so
 * the button and list shapes had no way to be tested. A file keeps the test seam
 * inside code that already only exists for tests; production never loads this
 * transport, so there is no new surface to secure.
 */
function recordSend(deviceId: string, to: string, message: OutgoingMessage): void {
  const path = process.env.WA_MOCK_SEND_LOG
  if (!path) return
  try {
    appendFileSync(path, `${JSON.stringify({ deviceId, to, message })}\n`, 'utf8')
  } catch (err) {
    // A broken test seam must never fail a send the app is making.
    console.debug('mock: could not write the send log', err)
  }
}

/** Append a non-send action to WA_MOCK_ACTION_LOG, for assertions. */
function recordAction(
  action: string,
  deviceId: string,
  detail: Record<string, unknown>,
): void {
  const path = process.env.WA_MOCK_ACTION_LOG
  if (!path) return
  try {
    appendFileSync(path, `${JSON.stringify({ action, deviceId, ...detail })}\n`, 'utf8')
  } catch (err) {
    console.debug('mock: could not write the action log', err)
  }
}

interface MockGroup {
  id: string
  deviceId: string
  name: string
  description: string | null
  participants: Set<string>
  admins: Set<string>
  announce: boolean
  restrict: boolean
  joinApproval: boolean
  isCommunity: boolean
  parentId: string | null
  inviteCode: string
  requests: string[]
}

/** A deterministic member phone, so assertions can name a participant. */
const memberPhone = (groupIndex: number, member: number): string =>
  `+9198${String(groupIndex).padStart(2, '0')}${String(member).padStart(6, '0')}`

const jidOf = (phone: string): string => `${phone.replace(/^\+/, '')}@s.whatsapp.net`
const phoneOf = (jid: string): string => `+${jid.split('@')[0]?.split(':')[0] ?? ''}`

interface InjectedEvent {
  type: 'message' | 'call' | 'label' | 'labelAssociation' | 'receipt' | 'drop'
  /** A device id, or "*" for the first connected device. */
  deviceId?: string
  from?: string
  body?: string
  messageType?: WaIncomingType
  isGroup?: boolean
  isVideo?: boolean
  labelId?: string
  name?: string
  color?: number
  deleted?: boolean
  chatJid?: string
  action?: 'add' | 'remove'
  messageId?: string
  status?: 'delivered' | 'read'
}

interface MockSession {
  deviceId: string
  connected: boolean
  phone: string
  sent: number
}

export class MockTransport extends TransportEmitter implements Transport {
  private readonly sessions = new Map<string, MockSession>()
  private readonly groups = new Map<string, MockGroup>()
  private readonly seededGroups = new Set<string>()
  private readonly channels = new Map<
    string,
    { deviceId: string; name: string; inviteCode: string }
  >()
  private counter = 0
  private injectOffset = 0
  private injectTimer: NodeJS.Timeout | undefined

  constructor() {
    super()
    this.startInjectWatcher()
  }

  /**
   * Tail WA_MOCK_INJECT and turn each new JSONL line into a transport event.
   * Polling a file is crude, but it is test-only code and needs no IPC surface.
   */
  private startInjectWatcher(): void {
    const path = process.env.WA_MOCK_INJECT
    if (!path) return
    this.injectTimer = setInterval(() => {
      if (!existsSync(path)) return
      const text = readFileSync(path, 'utf8')
      if (text.length <= this.injectOffset) return
      const fresh = text.slice(this.injectOffset)
      const complete = fresh.lastIndexOf('\n')
      if (complete < 0) return
      this.injectOffset += complete + 1
      for (const line of fresh.slice(0, complete).split('\n')) {
        if (line.trim() === '') continue
        try {
          this.inject(JSON.parse(line) as InjectedEvent)
        } catch (err) {
          console.debug('mock: bad inject line', err)
        }
      }
    }, 150)
    this.injectTimer.unref()
  }

  private resolveDevice(deviceId: string | undefined): string | undefined {
    if (deviceId && deviceId !== '*') return deviceId
    return [...this.sessions.values()].find((s) => s.connected)?.deviceId
  }

  private inject(event: InjectedEvent): void {
    const deviceId = this.resolveDevice(event.deviceId)
    if (!deviceId) return
    switch (event.type) {
      case 'message':
        this.simulateIncoming(
          deviceId,
          event.body ?? '',
          event.from,
          event.messageType ?? 'text',
          event.isGroup ?? false,
        )
        return
      case 'call':
        this.emit('call', deviceId, {
          callId: this.nextId('call'),
          from: event.from ?? '+919999000011',
          isVideo: event.isVideo ?? false,
        })
        return
      case 'label':
        this.emit('label', deviceId, {
          labelId: event.labelId ?? '1',
          name: event.name ?? 'Label',
          color: event.color ?? 0,
          deleted: event.deleted ?? false,
        })
        return
      case 'labelAssociation':
        this.emit('labelAssociation', deviceId, {
          labelId: event.labelId ?? '1',
          chatJid: event.chatJid ?? jidOf(event.from ?? '+919999000011'),
          action: event.action ?? 'add',
        })
        return
      case 'receipt':
        if (event.messageId) {
          this.emit('receipt', deviceId, event.messageId, event.status ?? 'delivered')
        }
        return
      case 'drop':
        this.simulateDrop(deviceId)
        return
    }
  }

  private requireConnected(deviceId: string): MockSession {
    const session = this.sessions.get(deviceId)
    if (!session?.connected) throw new Error(`mock: device ${deviceId} is not connected`)
    return session
  }

  /** The three fixture groups per device, created on first use. */
  private seedGroups(deviceId: string): void {
    if (this.seededGroups.has(deviceId)) return
    this.seededGroups.add(deviceId)
    const fixtures = [
      { name: 'Sales Team 001', members: 15, isAdmin: true },
      { name: 'Support Group A', members: 8, isAdmin: true },
      { name: 'Marketing Team 001', members: 12, isAdmin: false },
    ]
    const own = this.sessions.get(deviceId)?.phone ?? '+910000000000'
    fixtures.forEach((f, i) => {
      const id = `${deviceId}-group-${i + 1}@g.us`
      const participants = new Set<string>()
      for (let m = 1; m < f.members; m += 1)
        participants.add(jidOf(memberPhone(i + 1, m)))
      participants.add(jidOf(own))
      this.groups.set(id, {
        id,
        deviceId,
        name: f.name,
        description: null,
        participants,
        admins: new Set(f.isAdmin ? [jidOf(own)] : [jidOf(memberPhone(i + 1, 1))]),
        announce: false,
        restrict: false,
        joinApproval: false,
        isCommunity: false,
        parentId: null,
        inviteCode: `INV${i + 1}${Math.abs(deviceId.length * 7919) % 10_000}`,
        requests: [jidOf(memberPhone(90 + i, 1)), jidOf(memberPhone(90 + i, 2))],
      })
    })
  }

  private group(deviceId: string, groupId: string): MockGroup {
    this.requireConnected(deviceId)
    this.seedGroups(deviceId)
    const group = this.groups.get(groupId)
    if (!group || group.deviceId !== deviceId)
      throw new Error(`mock: unknown group ${groupId}`)
    return group
  }

  private isAdmin(deviceId: string, group: MockGroup): boolean {
    const own = this.sessions.get(deviceId)?.phone
    return own !== undefined && group.admins.has(jidOf(own))
  }

  private remote(deviceId: string, group: MockGroup): RemoteGroup {
    return {
      id: group.id,
      name: group.name,
      memberCount: group.participants.size,
      isAdmin: this.isAdmin(deviceId, group),
    }
  }

  /** Deterministic pseudo-phone so assertions can rely on it. */
  private phoneFor(deviceId: string): string {
    let hash = 0
    for (const ch of deviceId) hash = (hash * 31 + ch.charCodeAt(0)) | 0
    return `+9199${String(Math.abs(hash) % 100_000_000).padStart(8, '0')}`
  }

  private nextId(prefix: string): string {
    this.counter += 1
    return `${prefix}_${Date.now().toString(36)}_${this.counter}`
  }

  async connect(deviceId: string, authDir: string): Promise<void> {
    // The real transport writes credentials here; creating it keeps the
    // on-disk layout identical between mock and production runs.
    mkdirSync(authDir, { recursive: true })

    const session: MockSession = {
      deviceId,
      connected: false,
      phone: this.phoneFor(deviceId),
      sent: 0,
    }
    this.sessions.set(deviceId, session)

    this.emit('status', deviceId, 'connecting')
    this.emit('qr', deviceId, `mock-qr:${deviceId}:${Date.now()}`)
    this.emit('status', deviceId, 'qr_pending')

    setTimeout(
      () => {
        const current = this.sessions.get(deviceId)
        if (!current) return
        current.connected = true
        this.emit('status', deviceId, 'connected', { phone: current.phone })

        // The phone's address book, as WhatsApp's history sync would deliver
        // it: 12 contacts, three without a saved name, one shared with the
        // fixture groups so de-duplication is exercised...
        const book = Array.from({ length: 12 }, (_, i) => {
          const phone = i === 0 ? memberPhone(1, 1) : `+9197${String(i).padStart(8, '0')}`
          return {
            jid: jidOf(phone),
            phone,
            name: i % 4 === 3 ? null : `Book Contact ${i + 1}`,
            source: 'addressBook' as const,
          }
        })
        this.emit('contacts', deviceId, book)

        // ...and its chat list: 6 one-to-one chats, the first two with people
        // already in the address book (so a number known both ways is
        // exercised), the other four never saved — two of those unnamed.
        const chats = Array.from({ length: 6 }, (_, i) => {
          const phone = i < 2 ? book[i + 1]!.phone : `+9196${String(i).padStart(8, '0')}`
          return {
            jid: jidOf(phone),
            phone,
            name:
              i < 2 ? (book[i + 1]!.name ?? null) : i % 2 === 0 ? `Chat Lead ${i}` : null,
            source: 'chat' as const,
            lastChatAt: new Date(Date.now() - i * 3_600_000).toISOString(),
          }
        })
        this.emit('contacts', deviceId, chats)

        // Inbox specs need inbound traffic. Driving it from here rather than
        // exposing a "simulate" IPC channel keeps the test hook inside code that
        // is already test-only — production never ships this transport.
        const inbound = num('WA_MOCK_INCOMING', 0)
        for (let i = 0; i < inbound; i += 1) {
          setTimeout(
            () =>
              this.simulateIncoming(
                deviceId,
                `Mock inbound ${i + 1}`,
                `+91999900${i}011`,
              ),
            100 * (i + 1),
          )
        }
      },
      num('WA_MOCK_CONNECT_MS', 50),
    )
  }

  async requestPairingCode(deviceId: string, _phone: string): Promise<string> {
    const code = '12345678'
    this.emit('status', deviceId, 'pairing_pending')
    this.emit('pairingCode', deviceId, code)

    setTimeout(
      () => {
        const current = this.sessions.get(deviceId)
        if (!current) return
        current.connected = true
        this.emit('status', deviceId, 'connected', { phone: current.phone })
      },
      num('WA_MOCK_CONNECT_MS', 50),
    )

    return code
  }

  async disconnect(deviceId: string): Promise<void> {
    const session = this.sessions.get(deviceId)
    if (!session) return
    session.connected = false
    this.emit('status', deviceId, 'disconnected')
    this.emit('disconnected', deviceId, 'retryable', 'mock: disconnect requested')
  }

  async logout(deviceId: string): Promise<void> {
    this.sessions.delete(deviceId)
    this.emit('status', deviceId, 'logged_out')
    this.emit('disconnected', deviceId, 'logged_out', 'mock: logged out')
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
      throw new Error(`mock: device ${deviceId} is not connected`)
    }

    recordSend(deviceId, to, message)

    const latency = num('WA_MOCK_LATENCY_MS', 0)
    if (latency > 0) await new Promise((resolve) => setTimeout(resolve, latency))

    const failRate = num('WA_MOCK_FAIL_RATE', 0)
    if (failRate > 0) {
      // Deterministic per-send rather than random: the Nth send of a run fails
      // the same way every time, so a failing test reproduces exactly.
      session.sent += 1
      const period = Math.max(1, Math.round(1 / failRate))
      if (session.sent % period === 0) {
        throw new Error(`mock: simulated send failure to ${to}`)
      }
    } else {
      session.sent += 1
    }

    return { messageId: this.nextId('mock') }
  }

  async fetchGroups(deviceId: string): Promise<RemoteGroup[]> {
    this.requireConnected(deviceId)
    this.seedGroups(deviceId)
    return [...this.groups.values()]
      .filter((g) => g.deviceId === deviceId && !g.isCommunity)
      .map((g) => this.remote(deviceId, g))
  }

  async createGroup(
    deviceId: string,
    subject: string,
    participants: string[],
  ): Promise<RemoteGroup> {
    const session = this.requireConnected(deviceId)
    this.seedGroups(deviceId)
    const id = this.nextId('mockgroup') + '@g.us'
    const own = jidOf(session.phone)
    const group: MockGroup = {
      id,
      deviceId,
      name: subject,
      description: null,
      participants: new Set([
        own,
        ...participants.map((p) => (p.includes('@') ? p : jidOf(p))),
      ]),
      admins: new Set([own]),
      announce: false,
      restrict: false,
      joinApproval: false,
      isCommunity: false,
      parentId: null,
      inviteCode: `INV${this.counter}`,
      requests: [],
    }
    this.groups.set(id, group)
    // Participants exclude ourselves in the count WhatsApp reports on create.
    return { id, name: subject, memberCount: participants.length, isAdmin: true }
  }

  async presence(
    deviceId: string,
    to: string,
    state: 'composing' | 'recording' | 'paused',
  ): Promise<void> {
    this.requireConnected(deviceId)
    recordAction('presence', deviceId, { to, state })
  }

  async postStatus(
    deviceId: string,
    content: StatusContent,
    statusJidList: string[],
  ): Promise<SendResult> {
    this.requireConnected(deviceId)
    recordSend(deviceId, 'status@broadcast', {
      kind: 'text',
      body: JSON.stringify({ content, statusJidList }),
    })
    return { messageId: this.nextId('status') }
  }

  async checkNumbers(
    deviceId: string,
    phones: string[],
  ): Promise<WaResponses['number:check']> {
    this.requireConnected(deviceId)
    const invalidSuffix = process.env.WA_MOCK_INVALID_SUFFIX ?? '000'
    recordAction('checkNumbers', deviceId, { count: phones.length })
    return {
      results: phones.map((phone) => {
        const exists = !phone.endsWith(invalidSuffix)
        return { phone, exists, jid: exists ? jidOf(phone) : null }
      }),
    }
  }

  async markRead(deviceId: string, chatJid: string, messageIds: string[]): Promise<void> {
    this.requireConnected(deviceId)
    recordAction('read', deviceId, { chatJid, messageIds })
  }

  async groupMetadata(deviceId: string, groupId: string): Promise<GroupMetadata> {
    const g = this.group(deviceId, groupId)
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      participants: [...g.participants].map((jid) => ({
        jid,
        phone: phoneOf(jid),
        isAdmin: g.admins.has(jid),
      })),
      announce: g.announce,
      restrict: g.restrict,
      joinApproval: g.joinApproval,
      isCommunity: g.isCommunity,
      parentId: g.parentId,
    }
  }

  async groupInviteCode(deviceId: string, groupId: string): Promise<string> {
    return this.group(deviceId, groupId).inviteCode
  }

  async groupRevokeInvite(deviceId: string, groupId: string): Promise<string> {
    const g = this.group(deviceId, groupId)
    g.inviteCode = `REV${this.nextId('inv').replace(/[^a-z0-9]/gi, '')}`
    recordAction('revokeInvite', deviceId, { groupId })
    return g.inviteCode
  }

  async groupAcceptInvite(deviceId: string, code: string): Promise<string> {
    const session = this.requireConnected(deviceId)
    this.seedGroups(deviceId)
    const existing = [...this.groups.values()].find((g) => g.inviteCode === code)
    if (existing) {
      existing.participants.add(jidOf(session.phone))
      return existing.id
    }
    const created = await this.createGroup(deviceId, `Joined ${code}`, [])
    return created.id
  }

  async groupSetting(deviceId: string, p: Payload<'group:setting'>): Promise<void> {
    const g = this.group(deviceId, p.groupId)
    if (!this.isAdmin(deviceId, g)) throw new Error('mock: not-authorized')
    if (p.setting === 'announcement') g.announce = true
    if (p.setting === 'not_announcement') g.announce = false
    if (p.setting === 'locked') g.restrict = true
    if (p.setting === 'unlocked') g.restrict = false
    recordAction('groupSetting', deviceId, { ...p })
  }

  async groupJoinApproval(
    deviceId: string,
    groupId: string,
    enabled: boolean,
  ): Promise<void> {
    const g = this.group(deviceId, groupId)
    if (!this.isAdmin(deviceId, g)) throw new Error('mock: not-authorized')
    g.joinApproval = enabled
  }

  async groupDescription(
    deviceId: string,
    groupId: string,
    description: string,
  ): Promise<void> {
    this.group(deviceId, groupId).description = description
  }

  async groupRequests(
    deviceId: string,
    groupId: string,
  ): Promise<WaResponses['group:requests']> {
    const g = this.group(deviceId, groupId)
    return {
      requests: g.requests.map((jid) => ({
        jid,
        phone: phoneOf(jid),
        requestedAt: null,
      })),
    }
  }

  async groupRequestsUpdate(
    deviceId: string,
    p: Payload<'group:requestsUpdate'>,
  ): Promise<WaResponses['group:requestsUpdate']> {
    const g = this.group(deviceId, p.groupId)
    const results = p.jids.map((jid) => {
      const index = g.requests.indexOf(jid)
      if (index < 0) return { jid, ok: false, error: 'no such request' }
      g.requests.splice(index, 1)
      if (p.action === 'approve') g.participants.add(jid)
      return { jid, ok: true, error: null }
    })
    return { results }
  }

  async groupParticipants(
    deviceId: string,
    p: Payload<'group:participants'>,
  ): Promise<WaResponses['group:participants']> {
    const g = this.group(deviceId, p.groupId)
    if (!this.isAdmin(deviceId, g)) throw new Error('mock: not-authorized')
    const invalidSuffix = process.env.WA_MOCK_INVALID_SUFFIX ?? '000'
    recordAction('participants', deviceId, {
      groupId: p.groupId,
      action: p.action,
      count: p.jids.length,
    })
    return {
      results: p.jids.map((jid) => {
        if (phoneOf(jid).endsWith(invalidSuffix))
          return { jid, ok: false, error: 'not on WhatsApp' }
        if (p.action === 'add') g.participants.add(jid)
        if (p.action === 'remove') {
          g.participants.delete(jid)
          g.admins.delete(jid)
        }
        if (p.action === 'promote') g.admins.add(jid)
        if (p.action === 'demote') g.admins.delete(jid)
        return { jid, ok: true, error: null }
      }),
    }
  }

  async communityFetch(deviceId: string): Promise<WaResponses['community:fetch']> {
    this.requireConnected(deviceId)
    this.seedGroups(deviceId)
    const all = [...this.groups.values()].filter((g) => g.deviceId === deviceId)
    return {
      communities: all
        .filter((g) => g.isCommunity)
        .map((c) => ({
          id: c.id,
          name: c.name,
          linkedGroupIds: all.filter((g) => g.parentId === c.id).map((g) => g.id),
        })),
    }
  }

  async communityCreate(
    deviceId: string,
    subject: string,
    description: string,
  ): Promise<WaResponses['community:create']> {
    const created = await this.createGroup(deviceId, subject, [])
    const g = this.groups.get(created.id)!
    g.isCommunity = true
    g.description = description
    return { id: g.id, name: g.name }
  }

  async communityLink(
    deviceId: string,
    communityId: string,
    groupId: string,
  ): Promise<void> {
    this.group(deviceId, communityId)
    this.group(deviceId, groupId).parentId = communityId
  }

  async communityUnlink(
    deviceId: string,
    communityId: string,
    groupId: string,
  ): Promise<void> {
    this.group(deviceId, communityId)
    const g = this.group(deviceId, groupId)
    if (g.parentId === communityId) g.parentId = null
  }

  async communityCreateGroup(
    deviceId: string,
    p: Payload<'community:createGroup'>,
  ): Promise<RemoteGroup> {
    this.group(deviceId, p.communityId)
    const created = await this.createGroup(deviceId, p.subject, p.participants)
    this.groups.get(created.id)!.parentId = p.communityId
    return created
  }

  async channelCreate(
    deviceId: string,
    name: string,
    _description: string,
  ): Promise<WaResponses['channel:create']> {
    this.requireConnected(deviceId)
    const id = `${this.nextId('chan').replace(/[^a-z0-9]/gi, '')}@newsletter`
    const inviteCode = `CH${this.counter}`
    this.channels.set(id, { deviceId, name, inviteCode })
    return { id, name, inviteCode }
  }

  async channelFollow(
    deviceId: string,
    key: string,
  ): Promise<WaResponses['channel:follow']> {
    this.requireConnected(deviceId)
    const known = [...this.channels.entries()].find(
      ([id, c]) => id === key || c.inviteCode === key,
    )
    if (known) {
      return {
        id: known[0],
        name: known[1].name,
        description: null,
        subscribers: 1,
        inviteCode: known[1].inviteCode,
      }
    }
    const id = key.endsWith('@newsletter') ? key : `${key.toLowerCase()}@newsletter`
    return {
      id,
      name: `Channel ${key}`,
      description: null,
      subscribers: 1200,
      inviteCode: key,
    }
  }

  async channelPost(
    deviceId: string,
    channelId: string,
    content: StatusContent,
  ): Promise<SendResult> {
    this.requireConnected(deviceId)
    recordSend(deviceId, channelId, { kind: 'text', body: JSON.stringify(content) })
    return { messageId: this.nextId('chanpost') }
  }

  async fetchCatalog(deviceId: string): Promise<Product[]> {
    this.requireConnected(deviceId)
    return [
      {
        id: 'prod-1',
        name: 'Starter Pack',
        description: 'Everything to get going',
        priceAmount1000: 499000,
        currency: 'INR',
        imageUrl: null,
      },
      {
        id: 'prod-2',
        name: 'Pro Bundle',
        description: null,
        priceAmount1000: 1999000,
        currency: 'INR',
        imageUrl: null,
      },
    ]
  }

  async isBusiness(deviceId: string): Promise<boolean> {
    this.requireConnected(deviceId)
    return process.env.WA_MOCK_BUSINESS === '1'
  }

  async chatLabel(deviceId: string, p: Payload<'chat:label'>): Promise<void> {
    this.requireConnected(deviceId)
    recordAction('chatLabel', deviceId, { ...p })
  }

  async rejectCall(deviceId: string, callId: string, from: string): Promise<void> {
    this.requireConnected(deviceId)
    recordAction('rejectCall', deviceId, { callId, from })
  }

  async shutdown(): Promise<void> {
    if (this.injectTimer) clearInterval(this.injectTimer)
    this.sessions.clear()
  }

  // ── test affordances, not part of the Transport contract ──

  /** Push a synthetic inbound message, for inbox and auto-reply specs. */
  simulateIncoming(
    deviceId: string,
    body: string,
    from = '+919999000011',
    type: WaIncomingType = 'text',
    isGroup = false,
  ): void {
    this.emit('message', deviceId, {
      id: this.nextId('in'),
      chatId: isGroup ? `${deviceId}-group-1@g.us` : `${from}@s.whatsapp.net`,
      from,
      pushName: 'Mock Contact',
      isGroup,
      type,
      body,
      fileName: null,
      fileSize: null,
      timestamp: new Date().toISOString(),
    })
  }

  /** Drop a connection the way a network failure would. */
  simulateDrop(deviceId: string): void {
    const session = this.sessions.get(deviceId)
    if (!session) return
    session.connected = false
    this.emit('status', deviceId, 'disconnected')
    this.emit('disconnected', deviceId, 'retryable', 'mock: simulated network drop')
  }
}

/**
 * The WhatsApp transport contract.
 *
 * WHY this interface exists: Baileys is the most security-sensitive and most
 * volatile dependency in the app, currently pinned to a release candidate. Every
 * caller — session manager, campaign worker, group runner, auto-reply worker —
 * talks to this interface instead, so a Baileys upgrade or API change touches
 * exactly one implementation file.
 *
 * It is also what makes the whole system testable. The mock implementation
 * satisfies this contract deterministically, so Sprints 3 and 4 can be tested in
 * CI without a real WhatsApp account — and a ban on a real account is
 * unrecoverable (CLAUDE.md §5.4).
 */
import type { DeviceStatus } from '../../../shared/types'
import type {
  WaGroupMetadata,
  WaIncomingType,
  WaOutgoing,
  WaProduct,
  WaRemoteGroup,
  WaRequests,
  WaResponses,
  WaStatusContent,
  WaSyncedContact,
} from '../../../shared/wa-protocol'

/** Outgoing messages are exactly the protocol's shapes — one definition, no drift. */
export type OutgoingMessage = WaOutgoing
export type OutgoingText = Extract<WaOutgoing, { kind: 'text' }>
export type OutgoingMedia = Extract<WaOutgoing, { kind: 'media' }>
export type OutgoingDocument = Extract<WaOutgoing, { kind: 'document' }>
export type OutgoingButtons = Extract<WaOutgoing, { kind: 'buttons' }>
export type OutgoingList = Extract<WaOutgoing, { kind: 'list' }>
export type StatusContent = WaStatusContent

export interface SendResult {
  messageId: string
}

export interface IncomingMessage {
  id: string
  chatId: string
  from: string
  pushName: string | null
  isGroup: boolean
  type: WaIncomingType
  body: string | null
  fileName: string | null
  fileSize: number | null
  timestamp: string
}

export type RemoteGroup = WaRemoteGroup
export type GroupMetadata = WaGroupMetadata
export type Product = WaProduct

export type DisconnectKind = 'retryable' | 'logged_out'

export interface TransportEvents {
  status: (
    deviceId: string,
    status: DeviceStatus,
    detail?: { phone?: string; error?: string },
  ) => void
  qr: (deviceId: string, qr: string) => void
  pairingCode: (deviceId: string, code: string) => void
  message: (deviceId: string, message: IncomingMessage) => void
  receipt: (deviceId: string, messageId: string, status: 'delivered' | 'read') => void
  disconnected: (deviceId: string, kind: DisconnectKind, detail: string) => void
  call: (
    deviceId: string,
    call: { callId: string; from: string; isVideo: boolean },
  ) => void
  label: (
    deviceId: string,
    label: { labelId: string; name: string; color: number; deleted: boolean },
  ) => void
  labelAssociation: (
    deviceId: string,
    association: { labelId: string; chatJid: string; action: 'add' | 'remove' },
  ) => void
  contacts: (deviceId: string, contacts: WaSyncedContact[]) => void
  /** LID → phone pairs learned after the fact, so main can repair stored rows. */
  lidMapping: (deviceId: string, mappings: Array<{ lid: string; phone: string }>) => void
}

type Payload<K extends keyof WaRequests> = Omit<WaRequests[K], 'deviceId'>

export interface Transport {
  connect(deviceId: string, authDir: string): Promise<void>
  requestPairingCode(deviceId: string, phone: string): Promise<string>
  disconnect(deviceId: string): Promise<void>
  logout(deviceId: string): Promise<void>
  isConnected(deviceId: string): boolean
  send(deviceId: string, to: string, message: OutgoingMessage): Promise<SendResult>
  /** Show or clear "typing…"/"recording…" in a chat. Best effort. */
  presence(
    deviceId: string,
    to: string,
    state: 'composing' | 'recording' | 'paused',
  ): Promise<void>
  postStatus(
    deviceId: string,
    content: StatusContent,
    statusJidList: string[],
  ): Promise<SendResult>
  checkNumbers(deviceId: string, phones: string[]): Promise<WaResponses['number:check']>
  markRead(deviceId: string, chatJid: string, messageIds: string[]): Promise<void>
  fetchGroups(deviceId: string): Promise<RemoteGroup[]>
  createGroup(
    deviceId: string,
    subject: string,
    participants: string[],
  ): Promise<RemoteGroup>
  groupMetadata(deviceId: string, groupId: string): Promise<GroupMetadata>
  groupInviteCode(deviceId: string, groupId: string): Promise<string>
  groupRevokeInvite(deviceId: string, groupId: string): Promise<string>
  groupAcceptInvite(deviceId: string, code: string): Promise<string>
  groupSetting(deviceId: string, p: Payload<'group:setting'>): Promise<void>
  groupJoinApproval(deviceId: string, groupId: string, enabled: boolean): Promise<void>
  groupDescription(deviceId: string, groupId: string, description: string): Promise<void>
  groupRequests(deviceId: string, groupId: string): Promise<WaResponses['group:requests']>
  groupRequestsUpdate(
    deviceId: string,
    p: Payload<'group:requestsUpdate'>,
  ): Promise<WaResponses['group:requestsUpdate']>
  groupParticipants(
    deviceId: string,
    p: Payload<'group:participants'>,
  ): Promise<WaResponses['group:participants']>
  communityFetch(deviceId: string): Promise<WaResponses['community:fetch']>
  communityCreate(
    deviceId: string,
    subject: string,
    description: string,
  ): Promise<WaResponses['community:create']>
  communityLink(deviceId: string, communityId: string, groupId: string): Promise<void>
  communityUnlink(deviceId: string, communityId: string, groupId: string): Promise<void>
  communityCreateGroup(
    deviceId: string,
    p: Payload<'community:createGroup'>,
  ): Promise<RemoteGroup>
  channelCreate(
    deviceId: string,
    name: string,
    description: string,
  ): Promise<WaResponses['channel:create']>
  channelFollow(deviceId: string, key: string): Promise<WaResponses['channel:follow']>
  channelPost(
    deviceId: string,
    channelId: string,
    content: StatusContent,
  ): Promise<SendResult>
  fetchCatalog(deviceId: string): Promise<Product[]>
  isBusiness(deviceId: string): Promise<boolean>
  chatLabel(deviceId: string, p: Payload<'chat:label'>): Promise<void>
  rejectCall(deviceId: string, callId: string, from: string): Promise<void>
  shutdown(): Promise<void>
  on<E extends keyof TransportEvents>(event: E, handler: TransportEvents[E]): void
}

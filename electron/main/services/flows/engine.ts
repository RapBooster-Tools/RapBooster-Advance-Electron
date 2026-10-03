/**
 * The chatbot flow engine (Wave 3): runs visual menu flows before keyword rules
 * and the AI bot.
 *
 * A chat mid-flow is advanced with each reply; otherwise the highest-priority
 * enabled flow whose trigger matches starts. Where the chat is lives in
 * `FlowSession` (CLAUDE.md §2.6 — nothing in memory survives a restart), and
 * the decision itself is `runStep`, shared with the builder's simulator.
 *
 * Never runs for a chat a person owns (escalated), a chat that opted out of
 * automatic replies, or a suppressed number.
 */
import { getPrisma } from '../../db/client'
import { escalate } from '../ai/escalation'
import type { InboundContext } from '../inbound'
import { notify, toast } from '../notify'
import { isSuppressed } from '../optout'
import { isParkingError } from '../sending-policy'
import { emitWebhook } from '../webhooks'
import { chatMergeValues, chatPhone, isFirstInbound } from './merge-values'
import { runStep, type FlowVars } from './run'
import { sendOutputs } from './send'
import { loadEnabledFlows, sessionDurationMs, toRecord, type FlowRecord } from './store'
import { pickFlow } from './triggers'

/**
 * One reply at a time per chat. WHY: two messages from one customer can arrive
 * together; both would read the same session and the customer would get the
 * same menu twice, or an answer applied to the wrong question.
 */
const chains = new Map<string, Promise<void>>()

function oneAtATime<T>(chatId: string, fn: () => Promise<T>): Promise<T> {
  const previous = chains.get(chatId) ?? Promise.resolve()
  const run = previous.then(fn)
  const tail = run.then(
    () => undefined,
    (err: unknown) => {
      // The caller receives this rejection through `run`; the chain only has
      // to keep going for the next message.
      console.debug('flows: a queued step failed', err)
    },
  )
  chains.set(chatId, tail)
  void tail.then(() => {
    if (chains.get(chatId) === tail) chains.delete(chatId)
  })
  return run
}

function parseVars(json: string): FlowVars {
  try {
    const parsed: unknown = JSON.parse(json)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(
          (e): e is [string, string] => typeof e[1] === 'string',
        ),
      )
    }
  } catch (err) {
    // Lost answers only blank a {{variable}}; the conversation itself goes on.
    console.debug('flows: unreadable session answers, starting empty', err)
  }
  return {}
}

interface Plan {
  flow: FlowRecord
  /** null = start the flow from its first step. */
  nodeId: string | null
  vars: FlowVars
}

/** The chat's live session, or null — expired and orphaned sessions are dropped. */
async function resumePlan(chatId: string): Promise<Plan | null> {
  const prisma = getPrisma()
  const session = await prisma.flowSession.findUnique({ where: { chatId } })
  if (!session) return null
  if (session.expiresAt > new Date()) {
    const row = await prisma.chatbotFlow.findUnique({ where: { id: session.flowId } })
    const flow = row?.enabled ? toRecord(row) : null
    // A flow switched off or edited so the step no longer exists ends the
    // session; the message is then treated as a fresh one.
    if (flow?.graph.nodes.some((n) => n.id === session.nodeId)) {
      return { flow, nodeId: session.nodeId, vars: parseVars(session.vars) }
    }
  }
  await prisma.flowSession.deleteMany({ where: { chatId } })
  return null
}

async function startPlan(ctx: InboundContext): Promise<Plan | null> {
  const flows = await loadEnabledFlows()
  if (flows.length === 0) return null
  const isFirstMessage = flows.some((f) => f.trigger === 'new_chat')
    ? await isFirstInbound(ctx.chatId)
    : false
  const flow = pickFlow(flows, { deviceId: ctx.deviceId, text: ctx.text, isFirstMessage })
  return flow ? { flow, nodeId: null, vars: {} } : null
}

/** Pass the chat to a person exactly as the AI bot does. */
async function handOff(ctx: InboundContext, flow: FlowRecord, text: string | null) {
  const outcome = await escalate(ctx.deviceId, ctx.chatId, { escalationMessage: text })
  if (!outcome.ok) {
    console.error('flows: handoff message not sent', outcome.message)
    toast('error', outcome.message)
  }
  toast('warning', `The chatbot flow "${flow.name}" handed a conversation to you.`)
  notify('chat:updated', { chatId: ctx.chatId })
  await emitWebhook('chat.escalated', { chatId: ctx.chatId, phone: ctx.phone }).catch(
    (err: unknown) => console.error('flows: chat.escalated webhook failed', err),
  )
}

async function runFlow(ctx: InboundContext): Promise<boolean> {
  const prisma = getPrisma()
  const chat = await prisma.chat.findUnique({
    where: { id: ctx.chatId },
    select: { name: true, phone: true, autoReplyOptOut: true, isEscalated: true },
  })
  // A person owns these conversations, or the customer asked for no automation.
  if (!chat || chat.autoReplyOptOut || chat.isEscalated) return false
  if (await isSuppressed(chatPhone(ctx.phone))) return false

  const plan = (await resumePlan(ctx.chatId)) ?? (await startPlan(ctx))
  if (!plan) return false

  const values = await chatMergeValues(chat)
  const result = runStep(plan.flow.graph, plan.nodeId, plan.vars, ctx.text, values)

  // NOTE: a tapped button or list row that reached us without its choice (the
  // transport could not read it) must not loop the customer through the same
  // buttons again: the menu is repeated as numbers they can type instead.
  const unreadableTap =
    !ctx.text && (ctx.type === 'buttons' || ctx.type === 'interactive')
  const outputs = unreadableTap
    ? result.messages.map((m) =>
        m.kind === 'menu' ? { ...m, style: 'numbers' as const } : m,
      )
    : result.messages

  try {
    await sendOutputs(ctx.deviceId, ctx.chatId, outputs)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    if (isParkingError(detail)) {
      // The session stays where it was: the customer's next message retries
      // this step once the device may send again.
      console.info(`flows: flow ${plan.flow.id} reply held — ${detail}`)
    } else {
      console.error(`flows: flow ${plan.flow.id} reply failed`, detail)
      toast('error', `The chatbot flow "${plan.flow.name}" could not send its reply.`)
    }
    // Still answered: the flow owns this message, and a keyword rule or the AI
    // improvising in its place would derail the conversation.
    return true
  }

  if (result.ended) {
    await prisma.flowSession.deleteMany({ where: { chatId: ctx.chatId } })
  } else if (result.nextNodeId) {
    const data = {
      flowId: plan.flow.id,
      nodeId: result.nextNodeId,
      vars: JSON.stringify(result.vars),
      expiresAt: new Date(Date.now() + sessionDurationMs()),
    }
    await prisma.flowSession.upsert({
      where: { chatId: ctx.chatId },
      create: { chatId: ctx.chatId, ...data },
      update: data,
    })
  }

  if (result.handoff) await handOff(ctx, plan.flow, result.handoffText)
  return true
}

/** Advance the chat's active flow, or start one whose trigger matches. True = answered. */
export async function tryFlow(ctx: InboundContext): Promise<boolean> {
  if (ctx.isGroup) return false
  return oneAtATime(ctx.chatId, () => runFlow(ctx))
}

/** Drop sessions whose customer stopped answering. Called by the scheduler. */
export async function flowTick(): Promise<void> {
  const { count } = await getPrisma().flowSession.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  })
  if (count > 0) console.info(`flows: ${count} idle flow session(s) expired`)
}

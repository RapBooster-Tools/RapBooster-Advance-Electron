/**
 * Chatbot flows and welcome/away replies (Wave 3).
 *
 * The graph itself is validated by the contract (shared/flow.ts) before a
 * handler runs; what is checked here is what the schema cannot see — a keyword
 * flow with no keywords, business hours that close before they open.
 *
 * NOTE: `flow:update` is `flowInput.partial()`, and zod applies a field's
 * default even inside `partial()`. An update therefore always carries trigger,
 * keywords, deviceIds, priority and enabled; the renderer sends the whole flow.
 */
import { AppError } from '../../../shared/errors'
import type { IpcResponse } from '../../../shared/ipc'
import { getPrisma } from '../db/client'
import {
  hoursProblem,
  readAutoReplyConfig,
  writeAutoReplyConfig,
} from '../services/auto-replies'
import { simulateFlow } from '../services/flows/simulate'
import {
  activeSessionCounts,
  keywordsJson,
  MAX_FLOWS,
  toRecord,
  type FlowRow,
} from '../services/flows/store'
import { registerHandler } from './router'

type ChatbotFlow = IpcResponse<'flow:list'>[number]

function serialize(row: FlowRow, sessions: Map<string, number>): ChatbotFlow {
  const record = toRecord(row)
  if (!record) {
    throw new AppError('DB_ERROR', {
      userMessage: `The flow "${row.name}" is damaged and cannot be opened.`,
      detail: `flow ${row.id} has an unreadable graph`,
    })
  }
  return {
    id: record.id,
    name: record.name,
    enabled: record.enabled,
    trigger: record.trigger,
    keywords: record.keywords,
    deviceIds: record.deviceIds,
    priority: record.priority,
    graph: record.graph,
    activeSessions: sessions.get(record.id) ?? 0,
    updatedAt: record.updatedAt.toISOString(),
  }
}

function assertKeywords(trigger: string, keywords: string[]): void {
  if (trigger === 'keywords' && JSON.parse(keywordsJson(keywords)).length === 0) {
    throw new AppError('VALIDATION_FAILED', {
      userMessage:
        'Add at least one keyword that starts this flow, or choose another way to start it.',
    })
  }
}

async function notFound(id: string): Promise<never> {
  throw new AppError('NOT_FOUND', {
    userMessage: 'That chatbot flow no longer exists.',
    detail: `flow ${id} not found`,
  })
}

export function registerFlowHandlers(): void {
  registerHandler('flow:list', async () => {
    const rows = await getPrisma().chatbotFlow.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: MAX_FLOWS,
    })
    const sessions = await activeSessionCounts()
    // A damaged row is left out of the list rather than hiding every flow.
    return rows.flatMap((row) => (toRecord(row) ? [serialize(row, sessions)] : []))
  })

  registerHandler('flow:create', async (input) => {
    assertKeywords(input.trigger, input.keywords)
    const prisma = getPrisma()
    if ((await prisma.chatbotFlow.count()) >= MAX_FLOWS) {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: `You can have up to ${MAX_FLOWS} chatbot flows. Delete one you no longer use first.`,
      })
    }
    const row = await prisma.chatbotFlow.create({
      data: {
        name: input.name,
        enabled: input.enabled,
        trigger: input.trigger,
        keywords: keywordsJson(input.keywords),
        deviceIds: JSON.stringify([...new Set(input.deviceIds)]),
        priority: input.priority,
        graph: JSON.stringify(input.graph),
      },
    })
    return serialize(row, new Map())
  })

  registerHandler('flow:update', async ({ id, ...input }) => {
    const prisma = getPrisma()
    const existing = await prisma.chatbotFlow.findUnique({ where: { id } })
    if (!existing) return notFound(id)
    const trigger = input.trigger ?? existing.trigger
    if (input.keywords !== undefined) assertKeywords(trigger, input.keywords)

    const row = await prisma.chatbotFlow.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.trigger !== undefined ? { trigger: input.trigger } : {}),
        ...(input.keywords !== undefined
          ? { keywords: keywordsJson(input.keywords) }
          : {}),
        ...(input.deviceIds !== undefined
          ? { deviceIds: JSON.stringify([...new Set(input.deviceIds)]) }
          : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.graph !== undefined ? { graph: JSON.stringify(input.graph) } : {}),
      },
    })
    // Switching a flow off ends its conversations: a customer mid-menu would
    // otherwise keep getting a flow the user just turned off.
    if (!row.enabled) await prisma.flowSession.deleteMany({ where: { flowId: id } })
    return serialize(row, await activeSessionCounts())
  })

  registerHandler('flow:delete', async ({ id }) => {
    // Sessions cascade with the flow.
    const { count } = await getPrisma().chatbotFlow.deleteMany({ where: { id } })
    if (count === 0) return notFound(id)
    return { ok: true as const }
  })

  registerHandler('flow:simulate', ({ graph, replies }) => simulateFlow(graph, replies))

  registerHandler('autoreply:getConfig', () => readAutoReplyConfig())

  registerHandler('autoreply:setConfig', async (config) => {
    if (config.welcome.enabled && config.welcome.text.trim() === '') {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: 'Write the welcome message, or switch it off.',
      })
    }
    if (config.away.enabled && config.away.text.trim() === '') {
      throw new AppError('VALIDATION_FAILED', {
        userMessage: 'Write the away message, or switch it off.',
      })
    }
    const problem = hoursProblem(config.away.hours)
    if (problem) throw new AppError('VALIDATION_FAILED', { userMessage: problem })
    await writeAutoReplyConfig(config)
    return { ok: true as const }
  })
}

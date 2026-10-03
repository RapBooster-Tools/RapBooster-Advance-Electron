/**
 * Reading chatbot flows and their sessions from SQLite.
 *
 * `keywords`, `deviceIds` and `graph` are JSON columns. A row whose graph no
 * longer parses is skipped rather than allowed to break the inbox: one corrupt
 * flow must not stop every other automation from answering.
 */
import {
  FLOW_SESSION_MINUTES,
  flowGraph,
  type FlowGraph,
  type FlowTrigger,
} from '../../../../shared/flow'
import { getPrisma } from '../../db/client'
import { parseStringArray } from '../keyword-rules'

/** Enough for any real set of flows; bounds every query (CLAUDE.md §5.3). */
export const MAX_FLOWS = 200

export interface FlowRow {
  id: string
  name: string
  enabled: boolean
  trigger: string
  keywords: string
  deviceIds: string
  priority: number
  graph: string
  updatedAt: Date
}

export interface FlowRecord {
  id: string
  name: string
  enabled: boolean
  trigger: FlowTrigger
  keywords: string[]
  deviceIds: string[]
  priority: number
  graph: FlowGraph
  updatedAt: Date
}

function parseTrigger(value: string): FlowTrigger {
  return value === 'new_chat' || value === 'any' ? value : 'keywords'
}

export function parseGraph(json: string): FlowGraph | null {
  try {
    const parsed = flowGraph.safeParse(JSON.parse(json))
    if (parsed.success) return parsed.data
    console.warn('flows: a stored flow graph failed validation', parsed.error.message)
  } catch (err) {
    console.warn('flows: a stored flow graph is not valid JSON', err)
  }
  return null
}

export function toRecord(row: FlowRow): FlowRecord | null {
  const graph = parseGraph(row.graph)
  if (!graph) return null
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    trigger: parseTrigger(row.trigger),
    keywords: parseStringArray(row.keywords),
    deviceIds: parseStringArray(row.deviceIds),
    priority: row.priority,
    graph,
    updatedAt: row.updatedAt,
  }
}

/** Enabled flows in the order they are tried: priority high to low, then oldest. */
export async function loadEnabledFlows(): Promise<FlowRecord[]> {
  const rows = await getPrisma().chatbotFlow.findMany({
    where: { enabled: true },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: MAX_FLOWS,
  })
  return rows.flatMap((row) => toRecord(row) ?? [])
}

/**
 * How long a session waits for the customer's next answer.
 *
 * NOTE: E2E may shorten it with RB_FLOW_SESSION_MS (test builds only) — the
 * real thirty minutes cannot be waited out in a test.
 */
export function sessionDurationMs(): number {
  const override = Number(process.env.RB_FLOW_SESSION_MS)
  if (process.env.NODE_ENV === 'test' && Number.isFinite(override) && override >= 500) {
    return override
  }
  return FLOW_SESSION_MINUTES * 60_000
}

/** Unexpired sessions per flow. */
export async function activeSessionCounts(): Promise<Map<string, number>> {
  const groups = await getPrisma().flowSession.groupBy({
    by: ['flowId'],
    where: { expiresAt: { gt: new Date() } },
    _count: { _all: true },
  })
  return new Map(groups.map((g) => [g.flowId, g._count._all]))
}

/** Keywords are compared normalized, so store them that way — and once each. */
export function keywordsJson(keywords: string[]): string {
  const cleaned = keywords.map((k) => k.trim().toLowerCase().replace(/\s+/gu, ' '))
  return JSON.stringify([...new Set(cleaned.filter((k) => k !== ''))])
}

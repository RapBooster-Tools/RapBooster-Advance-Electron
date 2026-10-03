/**
 * Keyword rule channels: CRUD plus a dry run (D89).
 */
import { AppError } from '../../../../shared/errors'
import type { RuleMatchType } from '../../../../shared/types'
import { getPrisma } from '../../db/client'
import {
  findMatchingRule,
  loadActiveRules,
  messagePreview,
  normalizeText,
  parseStringArray,
  ruleMessage,
} from '../../services/keyword-rules'
import { registerHandler } from '../router'

interface RuleRow {
  id: string
  name: string
  keywords: string
  matchType: string
  replyText: string | null
  templateId: string | null
  deviceIds: string
  enabled: boolean
  priority: number
  cooldownMinutes: number
  hitCount: number
  lastHitAt: Date | null
}

function serializeRule(row: RuleRow) {
  return {
    id: row.id,
    name: row.name,
    keywords: parseStringArray(row.keywords),
    matchType: row.matchType as RuleMatchType,
    replyText: row.replyText,
    templateId: row.templateId,
    deviceIds: parseStringArray(row.deviceIds),
    enabled: row.enabled,
    priority: row.priority,
    cooldownMinutes: row.cooldownMinutes,
    hitCount: row.hitCount,
    lastHitAt: row.lastHitAt?.toISOString() ?? null,
  }
}

/** Keywords are compared normalized, so store them that way — and once each. */
function keywordsJson(keywords: string[]): string {
  return JSON.stringify([...new Set(keywords.map(normalizeText).filter(Boolean))])
}

function assertOneReply(replyText: string | null, templateId: string | null): void {
  if (Boolean(replyText) === Boolean(templateId)) {
    throw new AppError('VALIDATION_FAILED', {
      userMessage: 'Give the rule either a reply text or a template — exactly one.',
    })
  }
}

async function assertTemplate(templateId: string | null): Promise<void> {
  if (!templateId) return
  const found = await getPrisma().template.findUnique({
    where: { id: templateId },
    select: { id: true },
  })
  if (!found) {
    throw new AppError('NOT_FOUND', { userMessage: 'That template no longer exists.' })
  }
}

const MAX_LISTED_RULES = 500

export function registerRuleHandlers(): void {
  registerHandler('rule:list', async () => {
    const rows = await getPrisma().keywordRule.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: MAX_LISTED_RULES,
    })
    return rows.map(serializeRule)
  })

  registerHandler('rule:create', async (input) => {
    const replyText = input.replyText?.trim() || null
    const templateId = input.templateId ?? null
    assertOneReply(replyText, templateId)
    await assertTemplate(templateId)

    const row = await getPrisma().keywordRule.create({
      data: {
        name: input.name,
        keywords: keywordsJson(input.keywords),
        matchType: input.matchType,
        replyText,
        templateId,
        deviceIds: JSON.stringify([...new Set(input.deviceIds)]),
        enabled: input.enabled,
        priority: input.priority,
        cooldownMinutes: input.cooldownMinutes,
      },
    })
    return serializeRule(row)
  })

  registerHandler('rule:update', async ({ id, ...input }) => {
    const prisma = getPrisma()
    const existing = await prisma.keywordRule.findUnique({ where: { id } })
    if (!existing) {
      throw new AppError('NOT_FOUND', { userMessage: 'That rule no longer exists.' })
    }

    // The contract cannot carry a null, so switching a rule between text and a
    // template is expressed by sending only the new one.
    const textGiven = input.replyText !== undefined
    const templateGiven = input.templateId !== undefined
    let replyText = textGiven ? input.replyText?.trim() || null : existing.replyText
    let templateId = templateGiven ? (input.templateId ?? null) : existing.templateId
    if (textGiven && replyText && !templateGiven) templateId = null
    if (templateGiven && !textGiven) replyText = null
    assertOneReply(replyText, templateId)
    if (templateGiven) await assertTemplate(templateId)

    const row = await prisma.keywordRule.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.keywords !== undefined
          ? { keywords: keywordsJson(input.keywords) }
          : {}),
        ...(input.matchType !== undefined ? { matchType: input.matchType } : {}),
        ...(input.deviceIds !== undefined
          ? { deviceIds: JSON.stringify([...new Set(input.deviceIds)]) }
          : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.cooldownMinutes !== undefined
          ? { cooldownMinutes: input.cooldownMinutes }
          : {}),
        replyText,
        templateId,
      },
    })
    return serializeRule(row)
  })

  registerHandler('rule:delete', async ({ id }) => {
    // Hits cascade with the rule.
    await getPrisma().keywordRule.deleteMany({ where: { id } })
    return { ok: true as const }
  })

  registerHandler('rule:test', async ({ text, deviceId }) => {
    const rule = findMatchingRule(await loadActiveRules(), text, deviceId)
    if (!rule) return { ruleId: null, reply: null }
    // Placeholder values: a dry run has no real contact behind it.
    const message = ruleMessage(rule, { Name: 'Customer', Mobile: '' })
    return { ruleId: rule.id, reply: message ? messagePreview(message) : null }
  })
}

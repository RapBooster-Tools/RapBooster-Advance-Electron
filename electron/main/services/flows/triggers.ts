/**
 * Which flow, if any, a message starts.
 *
 * Keywords use the keyword rules' whole-word matching (keyword-rules.ts), so
 * "menu" starts a flow for "show me the menu" but not for "menus", and one
 * keyword means the same thing in a rule and in a flow.
 */
import { keywordMatches, normalizeText } from '../keyword-rules'
import type { FlowRecord } from './store'

export interface TriggerContext {
  deviceId: string
  text: string | null
  /** The chat's first inbound message — the `new_chat` trigger. */
  isFirstMessage: boolean
}

export function flowAnswersDevice(flow: FlowRecord, deviceId: string): boolean {
  return flow.deviceIds.length === 0 || flow.deviceIds.includes(deviceId)
}

export function flowTriggered(flow: FlowRecord, ctx: TriggerContext): boolean {
  if (!flowAnswersDevice(flow, ctx.deviceId)) return false
  switch (flow.trigger) {
    case 'any':
      return true
    case 'new_chat':
      return ctx.isFirstMessage
    case 'keywords': {
      const text = normalizeText(ctx.text ?? '')
      if (text === '') return false
      return flow.keywords.some((k) => keywordMatches(text, k, 'contains'))
    }
  }
}

/** The first flow, in priority order, that this message starts. */
export function pickFlow(flows: FlowRecord[], ctx: TriggerContext): FlowRecord | null {
  return flows.find((flow) => flowTriggered(flow, ctx)) ?? null
}

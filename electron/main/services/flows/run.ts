/**
 * One step of a chatbot flow, as a pure function.
 *
 * WHY pure: the engine (real chats) and `flow:simulate` (the builder's test
 * panel) both call `runStep`, so what a customer gets is exactly what the user
 * saw when they tested the flow. Nothing here touches the database, the clock
 * or WhatsApp — the engine does that with the result.
 *
 * A session rests only on a step that waits for the customer: a menu or a
 * question. Message steps are sent and passed through in the same step;
 * handoff and end steps finish the conversation.
 */
import type { FlowGraph, FlowNode } from '../../../../shared/flow'
import { renderTemplate } from '../../../../shared/merge-tags'

export type FlowVars = Record<string, string>
export type MenuStyle = 'numbers' | 'buttons' | 'list'

type MenuNode = Extract<FlowNode, { type: 'menu' }>
type MenuOption = MenuNode['options'][number]

export type FlowOutput =
  | { kind: 'text'; text: string }
  | {
      kind: 'menu'
      text: string
      style: MenuStyle
      options: Array<{ id: string; label: string }>
    }

export interface StepResult {
  /** What the bot sends, in order. */
  messages: FlowOutput[]
  /** The menu or question now waiting for an answer; null once the flow is over. */
  nextNodeId: string | null
  vars: FlowVars
  /** True when the chat passes to a person; `handoffText` is then told to the customer. */
  handoff: boolean
  handoffText: string | null
  ended: boolean
}

/** Used when a menu has no "didn't understand" text of its own. */
export const DEFAULT_INVALID_TEXT =
  "Sorry, I didn't understand that. Please reply with one of the options below."

function render(text: string, vars: FlowVars, values: Record<string, string>): string {
  // Answers collected in the flow win over contact fields of the same name:
  // the customer just told us, the contact list may be months old.
  return renderTemplate(text, { ...values, ...vars }).text.trim()
}

/** A menu as plain text — the "numbers" style, and what the simulator shows. */
export function menuAsText(text: string, options: Array<{ label: string }>): string {
  const lines = options.map((o, i) => `${i + 1}. ${o.label}`).join('\n')
  return `${text}\n\n${lines}`
}

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

/**
 * Which option a reply chose: its number ("2", "2.", "2)"), its title in any
 * case, or the id a tapped WhatsApp button or list row echoes back.
 */
export function matchOption(node: MenuNode, reply: string): MenuOption | null {
  const raw = reply.trim()
  if (raw === '') return null
  const numbered = /^(\d{1,2})\s*[.)]?$/.exec(raw)
  if (numbered) return node.options[Number(numbered[1]) - 1] ?? null
  const byId = node.options.find((o) => o.id === raw)
  if (byId) return byId
  const wanted = normalize(raw)
  return node.options.find((o) => normalize(o.label) === wanted) ?? null
}

function menuOutput(node: MenuNode, text: string): FlowOutput {
  return {
    kind: 'menu',
    text,
    style: node.style,
    options: node.options.map((o) => ({ id: o.id, label: o.label })),
  }
}

/**
 * Walk forward from `startId`, sending each step, until one waits for the
 * customer or the flow ends.
 */
function enter(
  graph: FlowGraph,
  startId: string | null,
  vars: FlowVars,
  values: Record<string, string>,
  messages: FlowOutput[],
): StepResult {
  const done = (handoffText: string | null = null): StepResult => ({
    messages,
    nextNodeId: null,
    vars,
    handoff: handoffText !== null,
    handoffText,
    ended: true,
  })

  // NOTE: a loop made only of message steps would never wait for an answer;
  // visiting a step twice in one walk ends the flow instead of spamming.
  const visited = new Set<string>()
  let id = startId
  while (id !== null && !visited.has(id)) {
    visited.add(id)
    const node = graph.nodes.find((n) => n.id === id)
    if (!node) return done()
    switch (node.type) {
      case 'message':
        messages.push({ kind: 'text', text: render(node.text, vars, values) })
        id = node.next
        break
      case 'menu':
        messages.push(menuOutput(node, render(node.text, vars, values)))
        return {
          messages,
          nextNodeId: node.id,
          vars,
          handoff: false,
          handoffText: null,
          ended: false,
        }
      case 'question':
        messages.push({ kind: 'text', text: render(node.text, vars, values) })
        return {
          messages,
          nextNodeId: node.id,
          vars,
          handoff: false,
          handoffText: null,
          ended: false,
        }
      case 'handoff':
        return done(render(node.text, vars, values))
      case 'end': {
        const text = node.text ? render(node.text, vars, values) : ''
        if (text !== '') messages.push({ kind: 'text', text })
        return done()
      }
    }
  }
  return done()
}

/**
 * Run one step.
 *
 * `nodeId` null starts the flow at its first step (the reply that triggered it
 * is not an answer to anything). Otherwise `nodeId` is the menu or question the
 * session rests on, and `reply` is the customer's answer to it.
 */
export function runStep(
  graph: FlowGraph,
  nodeId: string | null,
  vars: FlowVars,
  reply: string | null,
  values: Record<string, string> = {},
): StepResult {
  const messages: FlowOutput[] = []
  if (nodeId === null)
    return enter(graph, graph.startNodeId, { ...vars }, values, messages)

  const node = graph.nodes.find((n) => n.id === nodeId)
  const stay = (): StepResult => ({
    messages,
    nextNodeId: nodeId,
    vars,
    handoff: false,
    handoffText: null,
    ended: false,
  })

  if (node?.type === 'menu') {
    const option = matchOption(node, reply ?? '')
    if (!option) {
      // One message, not two: the apology and the menu again travel together,
      // so a confused customer does not cost the account an extra send.
      const invalid = node.invalidText?.trim() || DEFAULT_INVALID_TEXT
      const text = `${render(invalid, vars, values)}\n\n${render(node.text, vars, values)}`
      messages.push(menuOutput(node, text))
      return stay()
    }
    return enter(graph, option.next, { ...vars }, values, messages)
  }

  if (node?.type === 'question') {
    const answer = (reply ?? '').trim()
    if (answer === '') {
      // A photo or sticker is not an answer; ask again.
      messages.push({ kind: 'text', text: render(node.text, vars, values) })
      return stay()
    }
    const next = { ...vars, [node.variable]: answer.slice(0, 500) }
    return enter(graph, node.next, next, values, messages)
  }

  // The step is gone (the flow was edited) or never waits: the flow is over.
  return {
    messages,
    nextNodeId: null,
    vars,
    handoff: false,
    handoffText: null,
    ended: true,
  }
}

/** Every outgoing message as the plain text a customer could read. */
export function outputAsText(output: FlowOutput): string {
  return output.kind === 'menu' ? menuAsText(output.text, output.options) : output.text
}

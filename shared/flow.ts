/**
 * Chatbot flow graphs (Wave 3) — the data the visual builder edits and the
 * flow engine runs. Validated here so the renderer, the contract and the engine
 * share one definition.
 *
 * A flow is a set of nodes; each node says what the bot sends and where the
 * conversation goes next. Menus branch on the customer's choice, questions
 * store the answer in a variable usable as {{variable}} later, handoff passes
 * the chat to a person.
 */
import { z } from 'zod'

export const MAX_FLOW_NODES = 100
export const MAX_MENU_OPTIONS = 10

const nodeId = z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/)
const next = nodeId.nullable()
const position = z.object({ x: z.number(), y: z.number() })
const text = z.string().trim().min(1).max(4096)

export const flowNode = z.discriminatedUnion('type', [
  z.object({
    id: nodeId,
    type: z.literal('message'),
    text,
    next,
    position,
  }),
  z.object({
    id: nodeId,
    type: z.literal('menu'),
    text,
    /** numbers = "Reply 1, 2, 3"; buttons/list use real WhatsApp UI with a numbered fallback. */
    style: z.enum(['numbers', 'buttons', 'list']).default('numbers'),
    options: z
      .array(
        z.object({
          id: nodeId,
          label: z.string().trim().min(1).max(60),
          next,
        }),
      )
      .min(1)
      .max(MAX_MENU_OPTIONS),
    /** Sent when the reply matches no option; the menu is then repeated. */
    invalidText: z.string().max(500).optional(),
    position,
  }),
  z.object({
    id: nodeId,
    type: z.literal('question'),
    text,
    /** Stored answer, usable later as {{variable}}. */
    variable: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/),
    next,
    position,
  }),
  z.object({
    id: nodeId,
    type: z.literal('handoff'),
    /** Told to the customer; the chat is then escalated to a person. */
    text,
    position,
  }),
  z.object({
    id: nodeId,
    type: z.literal('end'),
    text: z.string().max(4096).optional(),
    position,
  }),
])
export type FlowNode = z.infer<typeof flowNode>

export const flowGraph = z
  .object({
    startNodeId: nodeId,
    nodes: z.array(flowNode).min(1).max(MAX_FLOW_NODES),
  })
  .superRefine((graph, ctx) => {
    const ids = new Set<string>()
    for (const node of graph.nodes) {
      if (ids.has(node.id)) {
        ctx.addIssue({ code: 'custom', message: `Two steps share the id "${node.id}".` })
      }
      ids.add(node.id)
    }
    if (!ids.has(graph.startNodeId)) {
      ctx.addIssue({ code: 'custom', message: 'The flow has no starting step.' })
    }
    for (const node of graph.nodes) {
      const targets =
        node.type === 'menu'
          ? node.options.map((o) => o.next)
          : node.type === 'message' || node.type === 'question'
            ? [node.next]
            : []
      for (const target of targets) {
        if (target !== null && !ids.has(target)) {
          ctx.addIssue({
            code: 'custom',
            message: `A step points to "${target}", which does not exist.`,
          })
        }
      }
    }
  })
export type FlowGraph = z.infer<typeof flowGraph>

export const flowTrigger = z.enum(['keywords', 'new_chat', 'any'])
export type FlowTrigger = z.infer<typeof flowTrigger>

/** How long a customer may take to answer before the session lapses. */
export const FLOW_SESSION_MINUTES = 30

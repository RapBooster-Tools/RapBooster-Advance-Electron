/**
 * Pure helpers for the flow builder: editing the graph, laying it out on the
 * canvas, and explaining validation errors in plain English.
 */
import {
  flowGraph,
  MAX_FLOW_NODES,
  MAX_MENU_OPTIONS,
  type FlowGraph,
  type FlowNode,
} from '@shared/flow'

export type NodeType = FlowNode['type']

export const TYPE_LABEL: Record<NodeType, string> = {
  message: 'Message',
  menu: 'Menu',
  question: 'Question',
  handoff: 'Hand to a person',
  end: 'End',
}

export const TYPE_HINT: Record<NodeType, string> = {
  message: 'Sends a message, then moves on to the next step.',
  menu: 'Offers numbered choices; each choice can lead somewhere different.',
  question: 'Asks something and saves the answer, so later steps can use it.',
  handoff: 'Tells the customer a person will reply, then stops the bot for this chat.',
  end: 'Finishes the conversation, optionally with a last message.',
}

export function newId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`
}

const ORIGIN = { x: 0, y: 0 }

export function createNode(type: NodeType): FlowNode {
  const id = newId('s')
  switch (type) {
    case 'message':
      return { id, type, text: 'Write your message here.', next: null, position: ORIGIN }
    case 'menu':
      return {
        id,
        type,
        text: 'Please choose an option:',
        style: 'numbers',
        options: [
          { id: newId('o'), label: 'First option', next: null },
          { id: newId('o'), label: 'Second option', next: null },
        ],
        position: ORIGIN,
      }
    case 'question':
      return {
        id,
        type,
        text: 'What is your name?',
        variable: 'name',
        next: null,
        position: ORIGIN,
      }
    case 'handoff':
      return {
        id,
        type,
        text: 'Thanks! A member of our team will reply shortly.',
        position: ORIGIN,
      }
    case 'end':
      return { id, type, text: 'Thank you for chatting with us!', position: ORIGIN }
  }
}

/** Where a step leads, with the menu option (if any) that leads there. */
export function targetsOf(node: FlowNode): Array<{ to: string; option: number | null }> {
  if (node.type === 'menu') {
    return node.options.flatMap((o, i) => (o.next ? [{ to: o.next, option: i }] : []))
  }
  if ((node.type === 'message' || node.type === 'question') && node.next) {
    return [{ to: node.next, option: null }]
  }
  return []
}

/** Remove a step and every link to it; the first remaining step becomes the start if needed. */
export function removeNode(graph: FlowGraph, id: string): FlowGraph {
  const nodes = graph.nodes
    .filter((n) => n.id !== id)
    .map((n): FlowNode => {
      if (n.type === 'menu') {
        return {
          ...n,
          options: n.options.map((o) => (o.next === id ? { ...o, next: null } : o)),
        }
      }
      if ((n.type === 'message' || n.type === 'question') && n.next === id) {
        return { ...n, next: null }
      }
      return n
    })
  const startNodeId =
    graph.startNodeId === id ? (nodes[0]?.id ?? graph.startNodeId) : graph.startNodeId
  return { startNodeId, nodes }
}

export function nodeTitle(node: FlowNode, index: number): string {
  const text = node.text?.trim() ?? ''
  const short = text.length > 32 ? `${text.slice(0, 32)}…` : text
  return `${index + 1}. ${TYPE_LABEL[node.type]}${short ? ` — ${short}` : ''}`
}

// ── layout ──

export const CARD_WIDTH = 210
const COLUMN = 240
const ROW_GAP = 56
const PAD = 24

export function cardHeight(node: FlowNode): number {
  return node.type === 'menu' ? 78 + node.options.length * 20 : 78
}

export interface Box {
  x: number
  y: number
  h: number
}

export interface Layout {
  boxes: Map<string, Box>
  width: number
  height: number
}

/**
 * Rows by depth: a breadth-first walk from the start step. Steps nothing leads
 * to go on a last row of their own, so they are visible and can be linked.
 */
export function layoutGraph(graph: FlowGraph): Layout {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const depth = new Map<string, number>()
  const rows: string[][] = []
  const place = (id: string, d: number) => {
    depth.set(id, d)
    ;(rows[d] ??= []).push(id)
  }

  if (byId.has(graph.startNodeId)) {
    place(graph.startNodeId, 0)
    const queue = [graph.startNodeId]
    while (queue.length > 0) {
      const id = queue.shift()!
      const node = byId.get(id)
      if (!node) continue
      for (const { to } of targetsOf(node)) {
        if (!depth.has(to) && byId.has(to)) {
          place(to, depth.get(id)! + 1)
          queue.push(to)
        }
      }
    }
  }
  const loose = graph.nodes.filter((n) => !depth.has(n.id))
  if (loose.length > 0) {
    const d = rows.length
    for (const n of loose) place(n.id, d)
  }

  const widest = Math.max(1, ...rows.map((r) => r.length))
  const width = widest * COLUMN + PAD * 2
  const boxes = new Map<string, Box>()
  let y = PAD
  for (const row of rows) {
    const left = PAD + ((widest - row.length) * COLUMN) / 2 + (COLUMN - CARD_WIDTH) / 2
    let tallest = 0
    row.forEach((id, i) => {
      const h = cardHeight(byId.get(id)!)
      tallest = Math.max(tallest, h)
      boxes.set(id, { x: left + i * COLUMN, y, h })
    })
    y += tallest + ROW_GAP
  }
  return { boxes, width, height: y - ROW_GAP + PAD }
}

/** The graph with each step's stored position matching the drawn layout. */
export function withPositions(graph: FlowGraph): FlowGraph {
  const { boxes } = layoutGraph(graph)
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const box = boxes.get(n.id)
      return box ? { ...n, position: { x: Math.round(box.x), y: Math.round(box.y) } } : n
    }),
  }
}

// ── validation ──

type Issue = { code: string; path: PropertyKey[]; message: string }

function describe(issue: Issue, graph: FlowGraph): string {
  const [root, index, field, option, sub] = issue.path
  const tooBig = issue.code === 'too_big'
  if (root === 'nodes' && typeof index === 'number') {
    const node = graph.nodes[index]
    const where = `Step ${index + 1}${node ? ` (${TYPE_LABEL[node.type]})` : ''}`
    if (field === 'text') {
      return tooBig
        ? `${where}: the message is too long (4,096 characters at most).`
        : `${where}: write the message the customer will see.`
    }
    if (field === 'options' && typeof option === 'number' && sub === 'label') {
      return tooBig
        ? `${where}: choice ${option + 1} has a title longer than 60 characters.`
        : `${where}: choice ${option + 1} needs a title.`
    }
    if (field === 'options') {
      return tooBig
        ? `${where}: a menu can offer at most ${MAX_MENU_OPTIONS} choices.`
        : `${where}: add at least one choice.`
    }
    if (field === 'variable') {
      return `${where}: the answer name must start with a letter and use only letters, numbers or _ — for example "name" or "city".`
    }
    if (field === 'invalidText') {
      return `${where}: the "didn't understand" message is too long (500 characters at most).`
    }
    return `${where}: ${issue.message}`
  }
  if (root === 'nodes') {
    return tooBig
      ? `A flow can have at most ${MAX_FLOW_NODES} steps.`
      : 'Add at least one step.'
  }
  // The schema's own cross-step checks are already written in plain English.
  return issue.message
}

/** Every problem that would stop the flow saving, in plain English. */
export function graphProblems(graph: FlowGraph): string[] {
  const parsed = flowGraph.safeParse(graph)
  if (parsed.success) return []
  return [...new Set(parsed.error.issues.map((i) => describe(i, graph)))]
}

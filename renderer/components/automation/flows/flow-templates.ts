/**
 * Starter flows for the template gallery, so a first-time user begins from a
 * conversation that already works and only has to change the wording.
 */
import type { FlowGraph, FlowTrigger } from '@shared/flow'

export interface FlowDraft {
  /** Absent until the flow is first saved. */
  id?: string
  name: string
  enabled: boolean
  trigger: FlowTrigger
  keywords: string[]
  deviceIds: string[]
  priority: number
  graph: FlowGraph
}

export interface FlowTemplate {
  id: string
  title: string
  description: string
  draft: FlowDraft
}

const at = { x: 0, y: 0 }

const mainMenu: FlowGraph = {
  startNodeId: 'menu',
  nodes: [
    {
      id: 'menu',
      type: 'menu',
      text: 'Hi {{Name}}! How can we help you today?',
      style: 'numbers',
      options: [
        { id: 'prices', label: 'Prices', next: 'prices' },
        { id: 'hours', label: 'Opening hours', next: 'hours' },
        { id: 'human', label: 'Talk to a person', next: 'human' },
      ],
      invalidText: "Sorry, I didn't get that. Please reply with 1, 2 or 3.",
      position: at,
    },
    {
      id: 'prices',
      type: 'message',
      text: 'Our plans start at 499 a month. Reply MENU any time to see the options again.',
      next: null,
      position: at,
    },
    {
      id: 'hours',
      type: 'message',
      text: "We're open Monday to Friday, 9 am to 6 pm. Reply MENU any time to see the options again.",
      next: null,
      position: at,
    },
    {
      id: 'human',
      type: 'handoff',
      text: 'Sure! A member of our team will reply here shortly.',
      position: at,
    },
  ],
}

const leadCapture: FlowGraph = {
  startNodeId: 'ask-name',
  nodes: [
    {
      id: 'ask-name',
      type: 'question',
      text: "Thanks for your interest! What's your name?",
      variable: 'name',
      next: 'ask-need',
      position: at,
    },
    {
      id: 'ask-need',
      type: 'question',
      text: 'Nice to meet you, {{name}}. What are you looking for?',
      variable: 'requirement',
      next: 'handoff',
      position: at,
    },
    {
      id: 'handoff',
      type: 'handoff',
      text: 'Thank you, {{name}}! Someone from our team will contact you about "{{requirement}}" shortly.',
      position: at,
    },
  ],
}

const faq: FlowGraph = {
  startNodeId: 'faq',
  nodes: [
    {
      id: 'faq',
      type: 'menu',
      text: 'Here are the questions we hear most. Which one can we answer?',
      style: 'list',
      options: [
        { id: 'delivery', label: 'Delivery times', next: 'delivery' },
        { id: 'returns', label: 'Returns', next: 'returns' },
        { id: 'payment', label: 'Payment methods', next: 'payment' },
        { id: 'other', label: 'Something else', next: 'other' },
      ],
      position: at,
    },
    {
      id: 'delivery',
      type: 'message',
      text: 'Orders arrive in 3–5 working days.',
      next: 'bye',
      position: at,
    },
    {
      id: 'returns',
      type: 'message',
      text: 'You can return any item within 14 days of delivery.',
      next: 'bye',
      position: at,
    },
    {
      id: 'payment',
      type: 'message',
      text: 'We accept UPI, cards and cash on delivery.',
      next: 'bye',
      position: at,
    },
    {
      id: 'other',
      type: 'handoff',
      text: 'No problem — a member of our team will reply here shortly.',
      position: at,
    },
    {
      id: 'bye',
      type: 'end',
      text: 'Reply HELP any time to see these questions again.',
      position: at,
    },
  ],
}

const base = { enabled: true, deviceIds: [], priority: 0 }

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: 'main-menu',
    title: 'Main menu',
    description: 'Prices, opening hours, or talk to a person. Starts on "menu" or "hi".',
    draft: {
      ...base,
      name: 'Main menu',
      trigger: 'keywords',
      keywords: ['menu', 'hi', 'hello'],
      graph: mainMenu,
    },
  },
  {
    id: 'lead-capture',
    title: 'Lead capture',
    description: 'Asks for a name and what they need, then passes the chat to your team.',
    draft: {
      ...base,
      name: 'Lead capture',
      trigger: 'keywords',
      keywords: ['enquiry', 'quote', 'interested'],
      graph: leadCapture,
    },
  },
  {
    id: 'faq',
    title: 'FAQ',
    description: 'Answers common questions from a list; anything else goes to a person.',
    draft: {
      ...base,
      name: 'FAQ',
      trigger: 'keywords',
      keywords: ['faq', 'help'],
      graph: faq,
    },
  },
]

export function blankDraft(): FlowDraft {
  return {
    ...base,
    name: 'New flow',
    trigger: 'keywords',
    keywords: [],
    graph: {
      startNodeId: 'start',
      nodes: [
        {
          id: 'start',
          type: 'message',
          text: 'Hi {{Name}}! Thanks for your message.',
          next: null,
          position: at,
        },
      ],
    },
  }
}

/** A fresh, independent copy — editing must never change the template itself. */
export function draftFromTemplate(template: FlowTemplate): FlowDraft {
  return structuredClone(template.draft)
}

/**
 * The help system's single source of truth: the in-app help drawer, the Help
 * Center, the InfoTips, the guided tours, the first-run checklist and
 * docs/USER-GUIDE.md all read from here.
 */
import type { HelpTopic } from './types'
import { HELP_TOPICS } from './topic-list'
import { dashboard } from './topics/dashboard'

export { FIELD_HELP, type FieldHelpId } from './fields'
export { GLOSSARY } from './glossary'
export { TROUBLESHOOTING } from './troubleshooting'
export { SAFETY_RULES, GENERAL_FAQ } from './safety'
export { CHECKLIST, SHORTCUTS, WELCOME } from './getting-started'
export { TOURS, tourFor } from './tours'
export { searchHelp, type HelpSearchResult } from './search'
export { HELP_TOPICS }

const BY_ID = new Map(HELP_TOPICS.map((t) => [t.id, t]))

export function topicById(id: string): HelpTopic | undefined {
  return BY_ID.get(id)
}

/** The topic for a route segment as `useSelectedLayoutSegment()` reports it. */
export function topicForSegment(segment: string | null): HelpTopic {
  return BY_ID.get(segment ?? 'dashboard') ?? dashboard
}

/** Screen topics only (no Settings sections), for lists of screens. */
export const SCREEN_TOPICS: HelpTopic[] = HELP_TOPICS.filter((t) => !t.parent)

export interface HelpAnchor {
  topic: string
  /** A task inside the topic to scroll to, when the anchor names one. */
  task?: string
}

/**
 * `data-help` ids that name a panel rather than a topic or task. Every other
 * `data-help` id is either a topic id or a task id.
 */
const ALIASES: Record<string, HelpAnchor> = {
  'inbox-scheduled': { topic: 'inbox', task: 'inbox-schedule' },
  'flow-builder': { topic: 'automation', task: 'chatbot-flows' },
}

const TASK_OWNER = new Map<string, string>()
for (const topic of HELP_TOPICS) {
  for (const task of topic.tasks) TASK_OWNER.set(task.id, topic.id)
}

/** Resolve a `data-help` id to the topic (and task) it is about. */
export function resolveHelpAnchor(id: string): HelpAnchor | undefined {
  if (BY_ID.has(id)) return { topic: id }
  const alias = ALIASES[id]
  if (alias) return alias
  const owner = TASK_OWNER.get(id)
  return owner ? { topic: owner, task: id } : undefined
}

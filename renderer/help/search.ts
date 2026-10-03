import { FIELD_HELP } from './fields'
import { GLOSSARY } from './glossary'
import { GENERAL_FAQ, SAFETY_RULES } from './safety'
import { HELP_TOPICS } from './topic-list'
import { TROUBLESHOOTING } from './troubleshooting'

export interface HelpSearchResult {
  /** Unique within one result list. */
  key: string
  kind: 'topic' | 'task' | 'faq' | 'setting' | 'glossary' | 'problem' | 'safety'
  title: string
  /** A short line under the title. */
  snippet: string
  /** The topic to open, when the result belongs to one. */
  topic?: string
  /** The task inside that topic to scroll to. */
  task?: string
}

interface Entry extends HelpSearchResult {
  /** Text that matches strongly: titles and keywords. */
  strong: string
  /** Everything else. */
  weak: string
}

function snippetOf(text: string): string {
  return text.length > 140 ? `${text.slice(0, 137).trimEnd()}…` : text
}

/** Built once: the content never changes while the app runs. */
function buildIndex(): Entry[] {
  const entries: Entry[] = []
  for (const topic of HELP_TOPICS) {
    entries.push({
      key: `topic:${topic.id}`,
      kind: 'topic',
      title: topic.title,
      snippet: snippetOf(topic.summary),
      topic: topic.id,
      strong: `${topic.title} ${topic.navLabel} ${topic.keywords.join(' ')}`,
      weak: [topic.summary, ...topic.tips, ...topic.warnings].join(' '),
    })
    for (const task of topic.tasks) {
      entries.push({
        key: `task:${task.id}`,
        kind: 'task',
        title: task.title,
        snippet: `${topic.title} · ${snippetOf(task.steps[0] ?? '')}`,
        topic: topic.id,
        task: task.id,
        strong: task.title,
        weak: task.steps.join(' '),
      })
    }
    topic.faq.forEach((faq, index) => {
      entries.push({
        key: `faq:${topic.id}:${index}`,
        kind: 'faq',
        title: faq.question,
        snippet: snippetOf(faq.answer),
        topic: topic.id,
        strong: faq.question,
        weak: faq.answer,
      })
    })
  }
  for (const [id, field] of Object.entries(FIELD_HELP)) {
    entries.push({
      key: `setting:${id}`,
      kind: 'setting',
      title: field.label,
      snippet: snippetOf(field.text),
      topic: field.topic,
      strong: field.label,
      weak: field.text,
    })
  }
  for (const entry of GLOSSARY) {
    entries.push({
      key: `glossary:${entry.term}`,
      kind: 'glossary',
      title: entry.term,
      snippet: snippetOf(entry.definition),
      strong: entry.term,
      weak: entry.definition,
    })
  }
  for (const problem of TROUBLESHOOTING) {
    entries.push({
      key: `problem:${problem.id}`,
      kind: 'problem',
      title: problem.problem,
      snippet: snippetOf(problem.why),
      strong: problem.problem,
      weak: [problem.why, ...problem.steps].join(' '),
    })
  }
  for (const rule of SAFETY_RULES) {
    entries.push({
      key: `safety:${rule.id}`,
      kind: 'safety',
      title: rule.title,
      snippet: snippetOf(rule.text),
      strong: rule.title,
      weak: rule.text,
    })
  }
  GENERAL_FAQ.forEach((faq, index) => {
    entries.push({
      key: `faq:general:${index}`,
      kind: 'faq',
      title: faq.question,
      snippet: snippetOf(faq.answer),
      strong: faq.question,
      weak: faq.answer,
    })
  })
  return entries.map((e) => ({
    ...e,
    strong: e.strong.toLowerCase(),
    weak: e.weak.toLowerCase(),
  }))
}

let index: Entry[] | undefined

/**
 * Find help by plain words. Every word must appear somewhere in an entry;
 * entries whose title or keywords hold the words rank first, topics before
 * tasks before the rest when scores tie.
 */
export function searchHelp(query: string, limit = 30): HelpSearchResult[] {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#]+/u)
    .filter((w) => w.length > 1)
  if (words.length === 0) return []

  index ??= buildIndex()
  const KIND_RANK: Record<HelpSearchResult['kind'], number> = {
    topic: 0,
    task: 1,
    problem: 2,
    setting: 3,
    faq: 4,
    safety: 5,
    glossary: 6,
  }

  const scored: Array<{ entry: Entry; score: number }> = []
  for (const entry of index) {
    let score = 0
    let all = true
    for (const word of words) {
      if (entry.strong.includes(word)) score += 5
      else if (entry.weak.includes(word)) score += 1
      else {
        all = false
        break
      }
    }
    if (all) scored.push({ entry, score })
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      KIND_RANK[a.entry.kind] - KIND_RANK[b.entry.kind] ||
      a.entry.title.localeCompare(b.entry.title),
  )
  return scored.slice(0, limit).map(({ entry }) => ({
    key: entry.key,
    kind: entry.kind,
    title: entry.title,
    snippet: entry.snippet,
    ...(entry.topic ? { topic: entry.topic } : {}),
    ...(entry.task ? { task: entry.task } : {}),
  }))
}

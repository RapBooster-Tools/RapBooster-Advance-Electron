/**
 * Shapes of the help content.
 *
 * NOTE: everything under renderer/help is plain data with erasable TypeScript
 * only (no enums, no imports from outside this folder, `import type` for
 * types). `scripts/build-user-guide.mjs` loads these files straight into Node
 * to write docs/USER-GUIDE.md, so the in-app help and the printed guide can
 * never say different things.
 */

/** A numbered "how to" with 3–7 short steps. */
export interface HelpTask {
  /** Anchor for deep links from a panel's `data-help` attribute. */
  id: string
  title: string
  steps: string[]
}

export interface HelpFaq {
  question: string
  answer: string
}

/** Everything the help system says about one screen or one part of a screen. */
export interface HelpTopic {
  /** Matches the route segment (`dashboard` for `/`) and `data-help` ids. */
  id: string
  /** Where the screen lives, for "Show me" and the Help Center. */
  route: string
  /** The name in the sidebar, so a reader can find the screen. */
  navLabel: string
  title: string
  /** Set on a part of a screen (Settings sections), naming the screen topic. */
  parent?: string
  /** One paragraph: what the screen is for. */
  summary: string
  tasks: HelpTask[]
  tips: string[]
  /** Things that can cost money, data or a WhatsApp account. */
  warnings: string[]
  faq: HelpFaq[]
  /** Other topic ids worth reading next. */
  related: string[]
  /** Extra words people search with that the text itself may not contain. */
  keywords: string[]
}

/** The longer explanation behind a "?" next to a setting. */
export interface FieldHelp {
  /** The setting's label as the screen shows it. */
  label: string
  text: string
  /** The topic whose chapter lists this setting. */
  topic: string
}

export interface GlossaryEntry {
  term: string
  definition: string
}

export interface TroubleshootingEntry {
  id: string
  problem: string
  /** One or two sentences: why this usually happens. */
  why: string
  steps: string[]
  /** Topic ids to read next. */
  related: string[]
}

export interface SafetyRule {
  id: string
  title: string
  text: string
}

export interface TourStep {
  /** Value of the `data-tour` attribute to spotlight. */
  target: string
  title: string
  body: string
}

export interface Tour {
  /** Same as the screen's topic id. */
  id: string
  route: string
  title: string
  steps: TourStep[]
}

export interface ChecklistItem {
  id: 'device' | 'contacts' | 'template' | 'campaign' | 'autoreply'
  title: string
  description: string
  route: string
  /** The tour "Show me" starts after opening the screen. */
  tour: string
  optional: boolean
}

export interface Shortcut {
  keys: string
  description: string
}

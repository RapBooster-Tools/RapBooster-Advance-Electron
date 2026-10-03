/**
 * Writes docs/USER-GUIDE.md from the in-app help content (renderer/help).
 *
 *   node scripts/build-user-guide.mjs          write the guide
 *   node scripts/build-user-guide.mjs --check  fail if the guide is stale
 *
 * WHY generated: the customer asked for in-app help *and* a full user guide.
 * Two hand-written copies drift apart the first time a screen changes, and a
 * guide that names a button the app no longer has is worse than no guide. The
 * help content is the single source; this file only lays it out.
 *
 * WHY no build step: Node 22.18+ strips TypeScript types natively, so the help
 * data files are imported as they are. They import each other without file
 * extensions (the renderer's bundler style), so a resolve hook adds `.ts` for
 * relative imports under renderer/help — nothing else is affected.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as prettier from 'prettier'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HELP_DIR = pathToFileURL(join(ROOT, 'renderer', 'help')).href
const OUT = join(ROOT, 'docs', 'USER-GUIDE.md')
const check = process.argv.includes('--check')

if (!process.features.typescript || typeof registerHooks !== 'function') {
  console.error(
    `USER GUIDE: Node ${process.versions.node} cannot load TypeScript directly. ` +
      'Use Node 22.18 or newer.',
  )
  process.exit(1)
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const fromHelp = context.parentURL?.startsWith(HELP_DIR)
    const bare = specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)
    const resolved = nextResolve(
      fromHelp && bare ? `${specifier}.ts` : specifier,
      context,
    )
    // The package has no "type" field, so Node would first try these files as
    // CommonJS and warn on every run. They are ES modules; say so up front.
    return resolved.url.startsWith(HELP_DIR) && resolved.url.endsWith('.ts')
      ? { ...resolved, format: 'module-typescript' }
      : resolved
  },
})

const help = await import(`${HELP_DIR}/index.ts`)

// ─── Markdown helpers ────────────────────────────────────────────────────────

/** GitHub's heading anchors, which markdownlint's MD051 checks links against. */
function slug(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Mark}\p{Number}\p{Connector_Punctuation}\- ]/gu, '')
    .replace(/ /g, '-')
}

/**
 * Help text is written for the app, where `*bold*`, `{{Name}}` and links are
 * shown literally. In Markdown they would turn into formatting, so each one
 * becomes a code span — which is also how a reader should type them.
 */
const LITERAL =
  /```[^`]+```|https?:\/\/[^\s)"]+[^\s)".,]|\{\{[^}]+\}\}|\{[^{}|]+(?:\|[^{}|]+)+\}|(?<![\w*])\*[^*\s][^*]*\*(?![\w*])|(?<!\w)_[^_\s][^_]*_(?!\w)|(?<!\w)~[^~\s][^~]*~(?!\w)/g

function text(value) {
  return value.replace(LITERAL, (match) =>
    match.includes('`') ? `\`\` ${match} \`\`` : `\`${match}\``,
  )
}

function link(topicId) {
  const topic = help.topicById(topicId)
  if (!topic) throw new Error(`Unknown related topic "${topicId}"`)
  return `[${topic.title}](#${slug(topic.title)})`
}

function bullets(items) {
  return items.map((item) => `- ${text(item)}`).join('\n')
}

function steps(items) {
  return items.map((item, i) => `${i + 1}. ${text(item)}`).join('\n')
}

// ─── Chapters ────────────────────────────────────────────────────────────────

function screenChapter(topic) {
  const out = [`## ${topic.title}`, text(topic.summary)]
  const where = topic.parent
    ? `Find it: click **${topic.navLabel}** in the sidebar, then scroll to this section.`
    : `Find it: click **${topic.navLabel}** in the sidebar.`
  out.push(where)

  if (topic.tasks.length > 0) {
    out.push('### Things you can do')
    for (const task of topic.tasks)
      out.push(`#### ${text(task.title)}`, steps(task.steps))
  }

  const fields = Object.values(help.FIELD_HELP).filter((f) => f.topic === topic.id)
  if (fields.length > 0) {
    out.push(
      '### Settings explained',
      fields.map((f) => `- **${text(f.label)}**: ${text(f.text)}`).join('\n'),
    )
  }
  if (topic.tips.length > 0) out.push('### Tips', bullets(topic.tips))
  if (topic.warnings.length > 0) out.push('### Be careful', bullets(topic.warnings))
  if (topic.faq.length > 0) {
    out.push('### Questions')
    for (const faq of topic.faq) out.push(`#### ${text(faq.question)}`, text(faq.answer))
  }
  if (topic.related.length > 0) {
    out.push(`See also: ${topic.related.map(link).join(', ')}.`)
  }
  return out
}

function gettingStarted() {
  const { WELCOME, CHECKLIST, TOURS } = help
  return [
    '## Getting started',
    WELCOME.sentences.map(text).join(' '),
    `${text(WELCOME.checklistIntro)} You can hide it at any time and bring it back from Help Center.`,
    '### The getting-started checklist',
    steps(
      CHECKLIST.map((item) => {
        const screen = help.HELP_TOPICS.find((t) => t.route === item.route)
        return `**${item.title}.** ${item.description} (${link(screen.id)})`
      }),
    ),
    '### Help while you work',
    bullets([
      'Press F1 on any screen, or click the "?" next to its title, to read about that screen and search all of the help.',
      'Small "?" icons next to settings explain what they do. Hover over them, or reach them with the Tab key.',
      'The first time you open a screen, RapBooster offers a short guided tour. You can restart any tour from Help Center.',
      'Help Center, in the Setup part of the sidebar, has everything in this guide.',
    ]),
    '### Guided tours',
    `Tours are available for these screens: ${TOURS.map((t) => link(t.id)).join(', ')}.`,
  ]
}

function safetyChapter() {
  const out = [
    '## Safety rules',
    'WhatsApp bans numbers that behave like spammers, and a banned number cannot be recovered. RapBooster has safety limits switched on from the start. These rules keep your numbers safe.',
  ]
  for (const rule of help.SAFETY_RULES) out.push(`### ${rule.title}`, text(rule.text))
  return out
}

function troubleshootingChapter() {
  const out = ['## Troubleshooting']
  for (const entry of help.TROUBLESHOOTING) {
    out.push(
      `### ${entry.problem}`,
      text(entry.why),
      steps(entry.steps),
      `See also: ${entry.related.map(link).join(', ')}.`,
    )
  }
  return out
}

function glossaryChapter() {
  return [
    '## Glossary',
    help.GLOSSARY.map((e) => `- **${e.term}**: ${text(e.definition)}`).join('\n'),
  ]
}

function faqChapter() {
  const out = [
    '## Frequently asked questions',
    'Questions about a single screen are answered in that screen\'s chapter, under "Questions".',
  ]
  for (const faq of help.GENERAL_FAQ) out.push(`### ${faq.question}`, text(faq.answer))
  return out
}

function shortcutsChapter() {
  return [
    '## Keyboard shortcuts',
    help.SHORTCUTS.map((s) => `- \`${s.keys}\`: ${text(s.description)}`).join('\n'),
  ]
}

// ─── Assemble ────────────────────────────────────────────────────────────────

function contents() {
  const entry = (title, indent = '') => `${indent}- [${title}](#${slug(title)})`
  const lines = [entry('Getting started'), entry('Safety rules')]
  for (const topic of help.HELP_TOPICS) {
    lines.push(entry(topic.title, topic.parent ? '  ' : ''))
  }
  for (const title of [
    'Troubleshooting',
    'Glossary',
    'Frequently asked questions',
    'Keyboard shortcuts',
  ]) {
    lines.push(entry(title))
  }
  return ['## Contents', lines.join('\n')]
}

function build() {
  const blocks = [
    '# RapBooster Advance user guide',
    '<!-- Generated from renderer/help by scripts/build-user-guide.mjs. Do not edit this file: change the help content and run `npm run docs:guide`. -->',
    'This guide explains every part of RapBooster Advance in plain words. The same help is inside the app: press F1 on any screen, or open Help Center from the sidebar.',
    ...contents(),
    ...gettingStarted(),
    ...safetyChapter(),
    ...help.HELP_TOPICS.flatMap(screenChapter),
    ...troubleshootingChapter(),
    ...glossaryChapter(),
    ...faqChapter(),
    ...shortcutsChapter(),
  ]
  return `${blocks.join('\n\n')}\n`
}

const config = (await prettier.resolveConfig(OUT)) ?? {}
const guide = await prettier.format(build(), { ...config, parser: 'markdown' })

if (check) {
  let current = ''
  try {
    current = readFileSync(OUT, 'utf8')
  } catch (err) {
    console.error(`USER GUIDE: cannot read ${OUT} (${err.code ?? err.message}).`)
  }
  if (current !== guide) {
    console.error(
      'USER GUIDE IS OUT OF DATE: docs/USER-GUIDE.md does not match renderer/help.\n' +
        'Run `npm run docs:guide` and commit the result.',
    )
    process.exit(1)
  }
  console.log('user guide OK — docs/USER-GUIDE.md matches the in-app help')
} else {
  writeFileSync(OUT, guide)
  console.log(`wrote ${OUT}`)
}

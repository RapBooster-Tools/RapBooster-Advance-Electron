/**
 * Spintax: `{Hi|Hello|Hey}` picks one option per recipient (tracker D89).
 *
 * Lives in `shared` because the template editor counts variations and previews
 * one, while the send path spins for real. Two parsers would eventually disagree
 * about an edge case, and the user would only find out from what was sent.
 *
 * Grammar, deliberately small:
 *   - `{a|b|c}` is a group; one option is chosen. Options may be empty and may
 *     contain further groups.
 *   - `{{Field}}` is a merge tag and is passed through untouched — matched with
 *     the same rule `merge-tags.ts` uses, so the two never fight over a brace.
 *   - `\{`, `\}` and `\|` write the character literally. `\{\{` and `\}\}` are
 *     merge-tag escapes and are left for `renderTemplate` to unescape.
 *   - A group without a `|` (`{note}`) keeps its braces. Before spintax existed
 *     such text was sent as written; treating it as a one-option group would
 *     silently strip braces from existing templates.
 *   - An unclosed `{` is literal text.
 */

/** Deeper nesting is treated as literal text, so a pathological template cannot blow the stack. */
const MAX_DEPTH = 20

/** Same shape as merge-tags' TAG, anchored: `{{` + no braces + `}}`. */
const MERGE_TAG = /^\{\{\s*[^{}]+?\s*\}\}/

type Node = string | { options: Node[][] } | { literal: Node[] }

interface Parsed {
  nodes: Node[]
  /** Index just past the terminator, or text.length at the end. */
  end: number
  terminator: '|' | '}' | null
}

function parseSequence(text: string, start: number, depth: number): Parsed {
  const nodes: Node[] = []
  let buffer = ''
  const flush = () => {
    if (buffer !== '') nodes.push(buffer)
    buffer = ''
  }

  let i = start
  while (i < text.length) {
    const ch = text[i]!
    const rest = text.slice(i, i + 4)

    if (rest === '\\{\\{' || rest === '\\}\\}') {
      buffer += rest
      i += 4
      continue
    }
    if (ch === '\\' && i + 1 < text.length && '{}|'.includes(text[i + 1]!)) {
      buffer += text[i + 1]
      i += 2
      continue
    }
    if (ch === '{') {
      const tag = MERGE_TAG.exec(text.slice(i))
      if (tag) {
        buffer += tag[0]
        i += tag[0].length
        continue
      }
      if (depth < MAX_DEPTH) {
        const group = parseGroup(text, i + 1, depth + 1)
        if (group) {
          flush()
          nodes.push(group.node)
          i = group.end
          continue
        }
      }
      buffer += ch
      i += 1
      continue
    }
    if (depth > 0 && (ch === '|' || ch === '}')) {
      flush()
      return { nodes, end: i + 1, terminator: ch }
    }
    buffer += ch
    i += 1
  }

  flush()
  return { nodes, end: text.length, terminator: null }
}

/** Parse the options after a `{`; null when the group never closes. */
function parseGroup(
  text: string,
  start: number,
  depth: number,
): { node: Node; end: number } | null {
  const options: Node[][] = []
  let i = start
  for (;;) {
    const part = parseSequence(text, i, depth)
    if (part.terminator === null) return null
    options.push(part.nodes)
    i = part.end
    if (part.terminator === '}') break
  }
  const node: Node = options.length === 1 ? { literal: options[0]! } : { options }
  return { node, end: i }
}

function parse(text: string): Node[] {
  return parseSequence(text, 0, 0).nodes
}

function render(nodes: Node[], rng: () => number): string {
  let out = ''
  for (const node of nodes) {
    if (typeof node === 'string') {
      out += node
    } else if ('literal' in node) {
      out += `{${render(node.literal, rng)}}`
    } else {
      const index = Math.min(
        node.options.length - 1,
        Math.floor(rng() * node.options.length),
      )
      out += render(node.options[Math.max(0, index)]!, rng)
    }
  }
  return out
}

function count(nodes: Node[]): number {
  let total = 1
  for (const node of nodes) {
    if (typeof node === 'string') continue
    const n =
      'literal' in node
        ? count(node.literal)
        : node.options.reduce((sum, option) => sum + count(option), 0)
    total = Math.min(Number.MAX_SAFE_INTEGER, total * n)
  }
  return total
}

/** One random variant. `rng` returns [0, 1) — injectable so tests can pin a variant. */
export function spin(text: string, rng: () => number = Math.random): string {
  if (!text.includes('{') && !text.includes('\\')) return text
  return render(parse(text), rng)
}

/** How many distinct messages the spintax can produce (1 when there is none). */
export function spintaxVariants(text: string): number {
  if (!text.includes('{')) return 1
  return count(parse(text))
}

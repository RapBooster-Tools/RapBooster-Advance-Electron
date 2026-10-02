'use client'

import { spintaxVariants } from '@shared/spintax'

/**
 * The spintax hint under a message editor, with a live count of how many
 * distinct messages the text can produce. The count is what tells a user their
 * braces were understood: "1 variation" after typing `{Hi|Hello}` means a typo.
 */
export function SpintaxHint({ content }: { content: string }) {
  const variants = spintaxVariants(content)
  return (
    <p className="text-xs text-ink-subtle" data-testid="spintax-hint">
      Write <code className="font-mono">{'{Hi|Hello|Hey}'}</code> to vary the wording per
      recipient; merge tags like <code className="font-mono">{'{{Name}}'}</code> are left
      as they are.{' '}
      <span
        className={variants > 1 ? 'font-semibold text-primary' : undefined}
        data-testid="spintax-count"
      >
        {variants >= Number.MAX_SAFE_INTEGER
          ? 'Too many variations to count'
          : `${variants.toLocaleString()} variation${variants === 1 ? '' : 's'}`}
      </span>
    </p>
  )
}

/**
 * Deterministic [0, 1) generator (mulberry32), so the editor preview shows a
 * stable variant across re-renders and changes only when asked to.
 */
export function seededRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

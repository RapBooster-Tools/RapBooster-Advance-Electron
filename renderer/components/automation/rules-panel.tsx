'use client'

import { useState } from 'react'
import { MessageSquareReply } from 'lucide-react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { StatusPill } from '@renderer/components/ui/status-pill'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import { formatWhen, INPUT_CLASS } from './field'
import { RuleDialog, type KeywordRule } from './rule-dialog'

const MATCH_SHORT = { contains: 'contains', starts_with: 'starts with', exact: 'exact' }

/** A dry run: which rule would answer this message, and what it would say. */
function RuleTester({ rules }: { rules: KeywordRule[] }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<{ ruleId: string | null; reply: string | null }>()
  const toast = useToast()

  async function run() {
    if (!text.trim()) return
    const res = await window.api.invoke('rule:test', { text })
    if (!res.ok) return toast('error', res.error.userMessage)
    setResult(res.data)
  }

  const matched = rules.find((r) => r.id === result?.ruleId)
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold text-ink">Test a message</h2>
      <div className="flex gap-2">
        <input
          data-testid="rule-test-input"
          aria-label="Message to test"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void run()}
          placeholder="Type what a customer might send…"
          className={`${INPUT_CLASS} flex-1`}
        />
        <Button onClick={() => void run()} data-testid="rule-test-run">
          Test
        </Button>
      </div>
      {result && (
        <p className="mt-2 text-sm text-ink" data-testid="rule-test-result">
          {matched ? (
            <>
              <span className="font-medium">{matched.name}</span> would reply:{' '}
              <span className="text-ink-muted">{result.reply ?? '(media only)'}</span>
            </>
          ) : (
            'No rule matches — the AI bot would handle this message.'
          )}
        </p>
      )}
    </section>
  )
}

export function RulesPanel() {
  const rules = useIpcQuery('rule:list')
  const [editing, setEditing] = useState<KeywordRule | null | undefined>()
  const toast = useToast()

  async function toggle(rule: KeywordRule) {
    const res = await window.api.invoke('rule:update', {
      id: rule.id,
      enabled: !rule.enabled,
    })
    if (!res.ok) return toast('error', res.error.userMessage)
    rules.refetch()
  }

  async function remove(rule: KeywordRule) {
    const res = await window.api.invoke('rule:delete', { id: rule.id })
    if (!res.ok) return toast('error', res.error.userMessage)
    rules.refetch()
  }

  const all = rules.data ?? []
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          Rules answer one-to-one chats before the AI bot. The highest priority match
          wins.
        </p>
        <Button variant="primary" onClick={() => setEditing(null)} data-testid="rule-new">
          + New rule
        </Button>
      </div>

      {all.length === 0 && !rules.loading ? (
        <EmptyState
          icon={MessageSquareReply}
          title="No keyword rules yet"
          description="Answer common questions such as prices or opening hours instantly, with a fixed reply."
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-app-bg text-xs">
              <tr>
                {[
                  'Name',
                  'Keywords',
                  'Reply',
                  'Priority',
                  'Hits',
                  'Last hit',
                  'On',
                  '',
                ].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-ink-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {all.map((r) => (
                <tr key={r.id} className="border-t border-line" data-testid="rule-row">
                  <td className="px-3 py-2 font-medium text-ink">{r.name}</td>
                  <td className="max-w-56 px-3 py-2 text-ink">
                    <span className="text-xs text-ink-muted">
                      {MATCH_SHORT[r.matchType]}:{' '}
                    </span>
                    {r.keywords.join(', ')}
                  </td>
                  <td className="max-w-56 truncate px-3 py-2 text-ink-muted">
                    {r.templateId ? (
                      <StatusPill tone="idle">Template</StatusPill>
                    ) : (
                      r.replyText
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink">{r.priority}</td>
                  <td className="px-3 py-2 text-ink" data-testid="rule-hits">
                    {r.hitCount}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-muted">
                    {formatWhen(r.lastHitAt)}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Enable ${r.name}`}
                      data-testid="rule-toggle"
                      checked={r.enabled}
                      onChange={() => void toggle(r)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void remove(r)}
                        data-testid="rule-delete"
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RuleTester rules={all} />

      {editing !== undefined && (
        <RuleDialog
          rule={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            rules.refetch()
            toast('success', 'Rule saved')
          }}
        />
      )}
    </div>
  )
}

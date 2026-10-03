'use client'

import { useState } from 'react'
import { RotateCcw, Send } from 'lucide-react'
import type { FlowGraph } from '@shared/flow'
import type { IpcResponse } from '@shared/ipc'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/cn'
import { INPUT_CLASS } from '../field'

type Simulation = IpcResponse<'flow:simulate'>

/** The simulate channel accepts at most this many replies per run. */
const MAX_TEST_REPLIES = 30

/**
 * Try the flow as a customer would, without sending anything. It runs the
 * exact step logic real chats use, so what you see here is what they get.
 */
export function FlowTestPanel({ graph, valid }: { graph: FlowGraph; valid: boolean }) {
  const [replies, setReplies] = useState<string[]>([])
  const [result, setResult] = useState<Simulation>()
  const [draft, setDraft] = useState('')
  const toast = useToast()

  async function run(next: string[]) {
    const res = await window.api.invoke('flow:simulate', { graph, replies: next })
    if (!res.ok) return toast('error', res.error.userMessage)
    setReplies(next)
    setResult(res.data)
  }

  function send() {
    const text = draft.trim()
    if (!text) return
    if (replies.length >= MAX_TEST_REPLIES) {
      return toast('info', 'That is a long test. Press Restart to begin again.')
    }
    setDraft('')
    void run([...replies, text])
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col rounded-card border border-line bg-surface"
      data-testid="flow-test-panel"
      aria-label="Test this flow"
    >
      <header className="flex items-center justify-between border-b border-line px-3 py-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">Test this flow</h3>
          <p className="text-xs text-ink-muted">Nothing is sent to WhatsApp.</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void run([])}
          disabled={!valid}
          data-testid="flow-test-start"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          {result ? 'Restart' : 'Start'}
        </Button>
      </header>

      <div className="flex min-h-48 flex-1 flex-col gap-2 overflow-y-auto bg-app-bg p-3">
        {!result && (
          <p className="text-center text-xs text-ink-muted">
            {valid
              ? 'Press Start to see the first message, then reply as a customer would.'
              : 'Fix the problems listed above to test this flow.'}
          </p>
        )}
        {result?.transcript.map((line, i) => (
          <p
            key={i}
            data-testid={`flow-test-${line.from}`}
            className={cn(
              'max-w-[85%] whitespace-pre-wrap rounded-card px-3 py-1.5 text-xs text-ink',
              line.from === 'bot' ? 'self-start bg-wa-in' : 'self-end bg-wa-out',
            )}
          >
            {line.text}
          </p>
        ))}
        {result?.handoff && (
          <p
            className="text-center text-xs font-medium text-ink-muted"
            data-testid="flow-test-handoff"
          >
            The chat is now passed to a person, and the bot stops answering it.
          </p>
        )}
        {result?.ended && !result.handoff && (
          <p className="text-center text-xs text-ink-muted" data-testid="flow-test-ended">
            The conversation has ended.
          </p>
        )}
      </div>

      <div className="flex gap-2 border-t border-line p-2">
        <input
          aria-label="Reply as the customer"
          data-testid="flow-test-input"
          value={draft}
          disabled={!result || !valid}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a customer reply…"
          className={`${INPUT_CLASS} min-w-0 flex-1`}
        />
        <Button
          size="sm"
          variant="primary"
          aria-label="Send reply"
          onClick={send}
          disabled={!result || !valid}
          data-testid="flow-test-send"
        >
          <Send className="size-3.5" aria-hidden />
        </Button>
      </div>
    </section>
  )
}

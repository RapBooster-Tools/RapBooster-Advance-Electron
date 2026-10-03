'use client'

import { Moon, ShieldCheck, Sparkles } from 'lucide-react'
import { useCallback } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { WELCOME } from '@renderer/help'
import { useIpcQuery } from '@renderer/hooks/useIpc'

/**
 * First-run welcome, shown once after activation. It says what the app does
 * and which safety limits are already on — read from the real settings, so
 * it never promises a cap or quiet hours that are not in force.
 */
export function WelcomeDialog({
  onFinish,
}: {
  onFinish: (choice: 'start' | 'skip') => void
}) {
  const sending = useIpcQuery('settings:getSendingDefaults')
  const s = sending.data
  // Stable identity: the Dialog re-runs its focus effect when onClose changes.
  const close = useCallback(() => onFinish('start'), [onFinish])

  const cap =
    s === undefined
      ? null
      : s.dailyCapPerDevice > 0
        ? `Each WhatsApp number sends at most ${s.dailyCapPerDevice} automated messages a day.`
        : 'There is no daily limit yet. Set one in Settings › Sending & safety — 200 is a safe start.'
  const quiet =
    s === undefined
      ? null
      : s.quietHoursEnabled
        ? `Campaigns, follow-up sequences and bulk group messages pause between ${s.quietHoursStart} and ${s.quietHoursEnd}. Replies to customers still go out.`
        : 'Quiet hours are off. You can turn them on in Settings › Sending & safety.'

  return (
    <Dialog
      open
      // Closing with the X or Escape keeps the checklist: it is quiet and easy
      // to hide later, whereas "Skip for now" is an explicit no.
      onClose={close}
      title={WELCOME.title}
      testId="welcome-dialog"
      width={560}
      footer={
        <>
          <Button onClick={() => onFinish('skip')} data-testid="welcome-skip">
            Skip for now
          </Button>
          <Button
            variant="primary"
            onClick={() => onFinish('start')}
            data-testid="welcome-start"
          >
            <Sparkles className="size-4" aria-hidden />
            Let&apos;s get started
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm text-ink">
        <p className="leading-relaxed">{WELCOME.sentences.join(' ')}</p>

        <section
          className="rounded-card border border-primary/30 bg-primary/5 p-3.5"
          data-testid="welcome-safety"
        >
          <h3 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            {WELCOME.safetyTitle}
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5 text-ink-muted">
            {cap && <li data-testid="welcome-cap">{cap}</li>}
            {quiet && (
              <li className="flex items-start gap-1.5" data-testid="welcome-quiet">
                <Moon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {quiet}
              </li>
            )}
            <li>
              Messages go out one at a time with random pauses, like a person typing.
            </li>
            <li>People who reply STOP are never messaged again.</li>
          </ul>
        </section>

        <p className="text-ink-muted">{WELCOME.checklistIntro}</p>
      </div>
    </Dialog>
  )
}

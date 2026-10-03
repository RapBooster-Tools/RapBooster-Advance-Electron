'use client'

import { CheckCircle2, Circle, PartyPopper } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useHelp } from '@renderer/components/help/help-provider'
import { Button } from '@renderer/components/ui/button'
import { Card, CardHeader } from '@renderer/components/ui/card'
import { ProgressBar } from '@renderer/components/ui/progress-bar'
import { CHECKLIST } from '@renderer/help'
import type { ChecklistItem } from '@renderer/help/types'
import { useIpcEvent, useIpcQuery } from '@renderer/hooks/useIpc'
import { cn } from '@renderer/lib/cn'

/** Campaign states that mean it was really started, not just saved. */
const STARTED = new Set(['running', 'paused', 'completed', 'failed'])

/**
 * The last value a query produced, kept while it refetches — otherwise every
 * device or campaign event would blank the checklist for a moment.
 */
function useLatest<T>(value: T | undefined): T | undefined {
  const [latest, setLatest] = useState(value)
  if (value !== undefined && value !== latest) setLatest(value)
  return value ?? latest
}

/**
 * Which checklist steps are done, from real data rather than ticks the user
 * sets: every list here is small (20 devices at most; rules, flows and
 * campaigns are hand-made), and the counts come from the Dashboard's own
 * aggregate query.
 */
function useChecklistProgress(enabled: boolean) {
  const options = { enabled }
  const stats = useIpcQuery('system:dashboard', undefined, options)
  const devices = useIpcQuery('device:list', undefined, options)
  const campaigns = useIpcQuery('campaign:list', undefined, options)
  const rules = useIpcQuery('rule:list', undefined, options)
  const flows = useIpcQuery('flow:list', undefined, options)
  const bot = useIpcQuery('chatbot:get', undefined, options)
  const ai = useIpcQuery('ai:getConfig', undefined, options)
  const replies = useIpcQuery('autoreply:getConfig', undefined, options)

  useIpcEvent('device:status', () => {
    devices.refetch()
    stats.refetch()
  })
  useIpcEvent('campaign:progress', () => {
    campaigns.refetch()
    stats.refetch()
  })

  const statsData = useLatest(stats.data)
  const deviceList = useLatest(devices.data)
  const campaignList = useLatest(campaigns.data)

  // The bot is switched on by default but cannot answer until it has a key
  // (or, for a local model, an address), so only then is it "set up".
  const aiReady =
    ai.data !== undefined &&
    (ai.data.keys[ai.data.config.provider] ||
      (ai.data.config.provider === 'compatible' && ai.data.config.baseUrl !== null))
  const done: Record<ChecklistItem['id'], boolean> = {
    device: (deviceList ?? []).some((d) => d.status === 'connected'),
    contacts: (statsData?.totalContacts ?? 0) > 0,
    template: (statsData?.templates ?? 0) > 0,
    campaign: (campaignList ?? []).some((c) => STARTED.has(c.status) || c.sentCount > 0),
    autoreply:
      (rules.data ?? []).some((r) => r.enabled) ||
      (flows.data ?? []).some((f) => f.enabled) ||
      (bot.data?.enabled === true && aiReady) ||
      replies.data?.welcome.enabled === true ||
      replies.data?.away.enabled === true,
  }
  const loaded = statsData !== undefined && deviceList !== undefined
  return { done, loaded }
}

/**
 * "Getting started" on the Dashboard: the first steps after the welcome, each
 * ticked from real data, each with a "Show me" that opens the screen and its
 * tour. Hidden once dismissed; once every required step is done it says so
 * one last time and is stored as finished, so it does not come back.
 */
export function GettingStarted() {
  const help = useHelp()
  const active = help?.checklist === 'active'
  // Keeps the "all set" card on screen for this visit after it is stored as done.
  const [celebrating, setCelebrating] = useState(false)
  const { done, loaded } = useChecklistProgress(active || celebrating)

  const required = CHECKLIST.filter((item) => !item.optional)
  const requiredDone = required.filter((item) => done[item.id]).length
  const complete = loaded && requiredDone === required.length
  if (active && complete && !celebrating) setCelebrating(true)

  const setChecklist = help?.setChecklist
  useEffect(() => {
    if (celebrating && active) setChecklist?.('done')
  }, [celebrating, active, setChecklist])

  if (!help || !(active || celebrating) || !loaded) return null

  return (
    <Card className="mb-4" data-testid="getting-started" data-help="dashboard-checklist">
      <CardHeader
        icon={complete ? <PartyPopper /> : <CheckCircle2 />}
        title={complete ? 'You are all set!' : 'Getting started'}
        description={
          complete
            ? 'Every first step is done. Help is always one click away: press F1 on any screen.'
            : 'A few steps to your first campaign. Each one ticks itself when it is done.'
        }
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setCelebrating(false)
              if (!complete) help.setChecklist('dismissed')
            }}
            data-testid="checklist-hide"
          >
            Hide checklist
          </Button>
        }
      />
      <ProgressBar
        value={requiredDone}
        max={required.length}
        label={`${requiredDone} of ${required.length} steps done`}
        size="sm"
      />
      <ol className="mt-4 flex flex-col gap-2">
        {CHECKLIST.map((item) => {
          const isDone = done[item.id]
          return (
            <li
              key={item.id}
              data-testid={`checklist-${item.id}`}
              data-done={isDone ? 'true' : 'false'}
              className={cn(
                'flex items-center gap-3 rounded-control border px-3 py-2.5',
                isDone ? 'border-transparent bg-status-ok-bg' : 'border-line bg-surface',
              )}
            >
              {isDone ? (
                <CheckCircle2 className="size-5 shrink-0 text-status-ok-fg" aria-hidden />
              ) : (
                <Circle className="size-5 shrink-0 text-ink-subtle" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm font-medium',
                    isDone ? 'text-status-ok-fg' : 'text-ink',
                  )}
                >
                  {item.title}
                  <span className="sr-only">
                    {isDone ? ' (done)' : ' (not done yet)'}
                  </span>
                </p>
                <p className="text-xs text-ink-muted">{item.description}</p>
              </div>
              <Button
                size="sm"
                variant={isDone ? 'ghost' : 'secondary'}
                onClick={() => help.startTour(item.tour)}
                data-testid={`checklist-show-${item.id}`}
              >
                Show me
              </Button>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

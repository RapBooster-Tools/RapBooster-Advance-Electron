'use client'

/**
 * The right-hand panel of an open chat: who the customer is in your contact
 * lists, which campaigns and follow-up sequences reached them, and notes.
 */
import { format } from 'date-fns'
import type { ReactNode } from 'react'
import { useIpcEvent, useIpcQuery } from '@renderer/hooks/useIpc'
import { cn } from '@renderer/lib/cn'
import type { IpcResponse } from '@shared/ipc'
import { ChatNotes } from './chat-notes'

type Profile = IpcResponse<'chat:profile'>
type CampaignRow = Profile['campaigns'][number]

const SEQUENCE_STATUS: Record<Profile['sequences'][number]['status'], string> = {
  active: 'Running',
  sending: 'Sending',
  completed: 'Finished',
  stopped: 'Stopped',
  failed: 'Failed',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

/** Sent → delivered → read → replied, each lit once it happened. */
function CampaignSteps({ row }: { row: CampaignRow }) {
  const steps: Array<[string, string | null]> = [
    ['Sent', row.sentAt],
    ['Delivered', row.deliveredAt],
    ['Read', row.readAt],
    ['Replied', row.repliedAt],
  ]
  if (row.status === 'failed' || row.status === 'skipped' || row.status === 'pending') {
    const label = { failed: 'Failed', skipped: 'Skipped', pending: 'Waiting' }[row.status]
    return <span className="text-[11px] text-ink-muted">{label}</span>
  }
  return (
    <span className="flex flex-wrap gap-1">
      {steps.map(([label, at]) => (
        <span
          key={label}
          title={at ? format(new Date(at), 'd MMM yyyy, h:mm a') : 'Not yet'}
          data-testid="profile-campaign-step"
          data-done={at ? 'yes' : 'no'}
          className={cn(
            'rounded px-1.5 text-[10px]',
            at
              ? 'bg-status-ok-bg text-status-ok-fg'
              : 'bg-status-idle-bg text-status-idle-fg opacity-60',
          )}
        >
          {label}
        </span>
      ))}
    </span>
  )
}

export function ContactPanel({ chatId }: { chatId: string }) {
  const profile = useIpcQuery('chat:profile', { chatId })
  const tags = useIpcQuery('tag:list')
  const tagName = new Map((tags.data ?? []).map((t) => [t.id, t.name]))

  // Opt-outs, replies and receipts change the profile while it is open.
  useIpcEvent('chat:updated', (p) => p.chatId === chatId && profile.refetch())
  useIpcEvent('message:received', (p) => p.chatId === chatId && profile.refetch())

  const p = profile.data

  return (
    <aside
      className="flex w-[300px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-surface p-4"
      data-testid="contact-panel"
      data-help="inbox-contact-panel"
    >
      {!p ? (
        <p className="text-xs text-ink-muted">
          {profile.error ? profile.error.userMessage : 'Loading…'}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold text-ink" data-testid="profile-name">
              {p.name}
            </p>
            <p className="text-xs text-ink-muted" data-testid="profile-phone">
              {p.phone}
            </p>
            {p.optedOut && (
              <span
                className="mt-1 self-start rounded bg-status-warn-bg px-1.5 text-[11px] text-status-warn-fg"
                data-testid="profile-opted-out"
                title="This number asked not to receive messages. Campaigns, sequences and bots skip it."
              >
                Opted out
              </span>
            )}
          </div>

          <Section title="Contact lists">
            {p.contacts.length === 0 ? (
              <p className="text-xs text-ink-subtle">
                Not in any contact list yet. Import or add this number on the Contacts
                screen to use it in campaigns.
              </p>
            ) : (
              p.contacts.map((c) => (
                <div
                  key={c.id}
                  className="rounded-control border border-line px-2.5 py-2"
                  data-testid="profile-contact"
                >
                  <p className="text-xs font-semibold text-ink">{c.listName}</p>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                    {Object.entries(c.data).map(([field, value]) => (
                      <div key={field} className="contents">
                        <dt className="text-ink-muted">{field}</dt>
                        <dd className="truncate text-ink">{value || '—'}</dd>
                      </div>
                    ))}
                  </dl>
                  {c.tagIds.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.tagIds.map((id) => (
                        <span
                          key={id}
                          className="rounded bg-wa-in px-1.5 text-[10px] text-ink"
                          data-testid="profile-tag"
                        >
                          {tagName.get(id) ?? 'Tag'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </Section>

          <Section title="Campaigns">
            {p.campaigns.length === 0 ? (
              <p className="text-xs text-ink-subtle">
                No campaigns have reached this number.
              </p>
            ) : (
              p.campaigns.map((c) => (
                <div
                  key={c.campaignId}
                  className="flex flex-col gap-1"
                  data-testid="profile-campaign"
                >
                  <span className="truncate text-xs text-ink">{c.name}</span>
                  <CampaignSteps row={c} />
                </div>
              ))
            )}
          </Section>

          <Section title="Follow-up sequences">
            {p.sequences.length === 0 ? (
              <p className="text-xs text-ink-subtle">Not enrolled in any sequence.</p>
            ) : (
              p.sequences.map((s) => (
                <div
                  key={s.enrollmentId}
                  className="flex items-center justify-between gap-2 text-xs"
                  data-testid="profile-sequence"
                >
                  <span className="truncate text-ink">{s.name}</span>
                  <span className="shrink-0 text-ink-muted">
                    {SEQUENCE_STATUS[s.status]}
                    {s.status === 'active' && ` · next: step ${s.nextStep + 1}`}
                  </span>
                </div>
              ))
            )}
          </Section>
        </>
      )}

      <ChatNotes chatId={chatId} />
    </aside>
  )
}

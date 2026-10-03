'use client'

import { Button } from '@renderer/components/ui/button'
import { CampaignStatusPill } from '@renderer/components/ui/status-pill'
import type { IpcResponse } from '@shared/ipc'

export type Campaign = IpcResponse<'campaign:list'>[number]

export type CampaignAction =
  | 'campaign:start'
  | 'campaign:pause'
  | 'campaign:resume'
  | 'campaign:stop'
  | 'campaign:delete'

/**
 * Share of sent messages, rounded. Engagement is measured against what was
 * sent, not the audience: a skipped or failed number could never be read.
 */
function pctOf(part: number, sent: number): string {
  return sent > 0 ? `${Math.round((part / sent) * 100)}%` : '—'
}

export function CampaignCard({
  campaign,
  busy,
  onAction,
  onDuplicate,
  onRecipients,
  onReport,
}: {
  campaign: Campaign
  busy: boolean
  onAction: (channel: CampaignAction) => void
  onDuplicate: () => void
  onRecipients: () => void
  onReport: () => void
}) {
  // Skipped rows are settled too: they never send, so the bar must count them
  // or a campaign with opt-outs would never look finished.
  const done = campaign.sentCount + campaign.failedCount + campaign.skippedCount
  const pct = campaign.totalCount > 0 ? (done / campaign.totalCount) * 100 : 0
  const sent = campaign.sentCount

  return (
    <div
      data-testid="campaign-card"
      data-campaign-id={campaign.id}
      className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{campaign.name}</p>
          <p className="text-xs text-ink-muted">
            {new Date(campaign.createdAt).toLocaleDateString()}
          </p>
        </div>
        <CampaignStatusPill status={campaign.status} />
      </div>

      <dl className="text-xs text-ink-muted">
        <div className="flex justify-between">
          <dt>Devices</dt>
          <dd>{campaign.deviceIds.length}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Recipients</dt>
          <dd>{campaign.totalCount.toLocaleString()}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Template</dt>
          <dd className="truncate">{campaign.templateName}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Pacing</dt>
          <dd>
            {campaign.delayFrom}-{campaign.delayTo}s · {campaign.sleepDuration}s/
            {campaign.sleepAfter}
          </dd>
        </div>
        {(campaign.includeTagIds.length > 0 || campaign.excludeTagIds.length > 0) && (
          <div className="flex justify-between">
            <dt>Tags</dt>
            <dd>
              +{campaign.includeTagIds.length} / −{campaign.excludeTagIds.length}
            </dd>
          </div>
        )}
        {campaign.checkNumbers && (
          <div className="flex justify-between">
            <dt>Number check</dt>
            <dd>On</dd>
          </div>
        )}
        {campaign.scheduledAt && (
          <div className="flex justify-between">
            <dt>Scheduled</dt>
            <dd>{new Date(campaign.scheduledAt).toLocaleString()}</dd>
          </div>
        )}
      </dl>

      <div className="h-1.5 overflow-hidden rounded bg-app-bg">
        <div
          className="h-full bg-primary transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs" data-testid="campaign-counters">
        <span className="text-success">✓ Sent: {campaign.sentCount}</span>
        {' | '}
        <span className="text-danger">✗ Failed: {campaign.failedCount}</span>
        {' | '}
        <span className="text-ink-muted" data-testid="campaign-skipped">
          Skipped: {campaign.skippedCount}
        </span>
      </p>
      <dl
        className="grid grid-cols-3 gap-2 text-center"
        data-testid="campaign-engagement"
      >
        {(
          [
            ['Delivered', campaign.deliveredCount, 'campaign-delivered'],
            ['Read', campaign.readCount, 'campaign-read'],
            ['Replied', campaign.repliedCount, 'campaign-replied'],
          ] as const
        ).map(([label, count, testId]) => (
          <div key={label} className="rounded-control bg-app-bg px-2 py-1.5">
            <dt className="text-[11px] text-ink-muted">{label}</dt>
            <dd className="text-sm font-semibold text-ink" data-testid={testId}>
              {count}{' '}
              <span className="text-xs text-ink-muted">({pctOf(count, sent)})</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-1 flex flex-wrap gap-2">
        {campaign.status === 'running' ? (
          <>
            <Button
              size="sm"
              onClick={() => onAction('campaign:pause')}
              disabled={busy}
              data-testid="pause-campaign"
            >
              Pause
            </Button>
            <Button size="sm" onClick={() => onAction('campaign:stop')} disabled={busy}>
              Stop
            </Button>
          </>
        ) : campaign.status === 'paused' ? (
          <>
            <Button
              size="sm"
              variant="primary"
              onClick={() => onAction('campaign:resume')}
              disabled={busy}
              data-testid="resume-campaign"
            >
              Resume
            </Button>
            <Button size="sm" onClick={() => onAction('campaign:stop')} disabled={busy}>
              Stop
            </Button>
          </>
        ) : campaign.status === 'draft' ? (
          <Button
            size="sm"
            variant="primary"
            onClick={() => onAction('campaign:start')}
            disabled={busy}
            data-testid="start-campaign"
          >
            Start
          </Button>
        ) : null}

        <Button size="sm" onClick={onRecipients} data-testid="view-recipients">
          Recipients
        </Button>
        <Button
          size="sm"
          onClick={onReport}
          disabled={busy}
          data-testid="report-campaign"
        >
          Report
        </Button>
        <Button
          size="sm"
          onClick={onDuplicate}
          disabled={busy}
          data-testid="duplicate-campaign"
        >
          Duplicate
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => onAction('campaign:delete')}
          disabled={busy}
          data-testid="delete-campaign"
        >
          Delete
        </Button>
      </div>
    </div>
  )
}

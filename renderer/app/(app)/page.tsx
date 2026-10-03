'use client'

import { useState } from 'react'
import { AnalyticsChart } from '@renderer/components/dashboard/analytics-chart'
import { AttentionCards } from '@renderer/components/dashboard/attention-cards'
import { DeviceUsage } from '@renderer/components/dashboard/device-usage'
import { GettingStarted } from '@renderer/components/dashboard/getting-started'
import { SafetyBanner } from '@renderer/components/dashboard/safety-banner'
import { PageHeader } from '@renderer/components/layout/page-header'
import { useIpcEvent, useIpcQuery } from '@renderer/hooks/useIpc'

function StatCard({
  label,
  value,
  loading,
}: {
  label: string
  value: number
  loading: boolean
}) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-ink">
        {loading ? <span className="text-ink-subtle">—</span> : value}
      </dd>
    </div>
  )
}

/**
 * Dashboard. The prototype's four stat cards, with real aggregates rather than
 * its hardcoded numbers (definitions in REQUIREMENTS §7.1), plus seven days of
 * outcomes, each device's usage against its cap, and inbox work waiting on a
 * person (D89).
 */
export default function DashboardPage() {
  const stats = useIpcQuery('system:dashboard')
  const analytics = useIpcQuery('system:analytics')
  const loading = stats.loading

  // The dashboard is the landing route, so it is frequently already mounted
  // when the numbers change. Without these it would sit showing stale counts
  // for as long as the window stayed open.
  useIpcEvent('campaign:progress', () => {
    stats.refetch()
    analytics.refetch()
  })
  useIpcEvent('device:status', () => {
    stats.refetch()
    analytics.refetch()
  })
  useIpcEvent('message:received', () => stats.refetch())
  useIpcEvent('device:updated', () => analytics.refetch())
  useIpcEvent('chat:updated', () => analytics.refetch())

  // Each refetch clears `data` until it settles; holding the last result keeps
  // the chart from flashing empty on every progress event.
  type Analytics = NonNullable<typeof analytics.data>
  const [lastAnalytics, setLastAnalytics] = useState<Analytics>()
  if (analytics.data && analytics.data !== lastAnalytics) setLastAnalytics(analytics.data)
  const insight = analytics.data ?? lastAnalytics

  const cards = [
    { label: 'Total Contacts', value: stats.data?.totalContacts ?? 0 },
    { label: 'Active Devices', value: stats.data?.activeDevices ?? 0 },
    { label: 'Running Campaigns', value: stats.data?.runningCampaigns ?? 0 },
    { label: 'Templates', value: stats.data?.templates ?? 0 },
  ]

  return (
    <>
      <PageHeader title="Dashboard" />
      <div className="flex-1 p-6">
        <SafetyBanner />
        <GettingStarted />
        {stats.error ? (
          <p className="text-sm text-danger" role="alert">
            {stats.error.userMessage}
          </p>
        ) : (
          <>
            <dl
              className="grid grid-cols-2 gap-4 xl:grid-cols-4"
              data-testid="dashboard-stats"
              data-tour="dashboard-stats"
            >
              {cards.map((card) => (
                <StatCard key={card.label} {...card} loading={loading} />
              ))}
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-4" data-tour="dashboard-today">
              <StatCard
                label="Sent today"
                value={stats.data?.sentToday ?? 0}
                loading={loading}
              />
              <StatCard
                label="Failed today"
                value={stats.data?.failedToday ?? 0}
                loading={loading}
              />
            </div>
            {insight && (
              <>
                <div className="mt-4" data-tour="dashboard-attention">
                  <AttentionCards
                    escalated={insight.escalated}
                    drafts={insight.repliesAwaiting}
                  />
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-[2fr_1fr]">
                  <AnalyticsChart days={insight.days} />
                  <DeviceUsage devices={insight.devices} />
                </div>
              </>
            )}
          </>
        )}
        <span data-testid="renderer-ready" className="sr-only">
          Renderer loaded
        </span>
      </div>
    </>
  )
}

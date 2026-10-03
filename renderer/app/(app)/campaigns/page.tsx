'use client'

import { Megaphone } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  CampaignCard,
  type CampaignAction,
} from '@renderer/components/campaigns/campaign-card'
import { CreateCampaignDialog } from '@renderer/components/campaigns/create-campaign-dialog'
import { RecipientsDialog } from '@renderer/components/campaigns/recipients-dialog'
import { PageHeader } from '@renderer/components/layout/page-header'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { useIpcEvent, useIpcQuery } from '@renderer/hooks/useIpc'

export default function CampaignsPage() {
  const campaigns = useIpcQuery('campaign:list')
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string>()
  const [viewing, setViewing] = useState<{ id: string; name: string }>()

  // Progress arrives batched from the engine, so a 100k-recipient run cannot
  // flood this screen.
  useIpcEvent('campaign:progress', () => campaigns.refetch())

  // Replies are attributed to campaigns as they arrive, but no campaign event
  // carries them, so an inbound message is the cue to refresh. Debounced: a
  // busy inbox must not turn into one full campaign query per message.
  const replyTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useIpcEvent('message:received', () => {
    clearTimeout(replyTimer.current)
    replyTimer.current = setTimeout(() => campaigns.refetch(), 1_500)
  })
  useEffect(() => () => clearTimeout(replyTimer.current), [])

  async function act(id: string, channel: CampaignAction) {
    setBusyId(id)
    const result = await window.api.invoke(channel, { id })
    setBusyId(undefined)
    if (!result.ok) toast('error', result.error.userMessage)
    campaigns.refetch()
  }

  async function duplicate(id: string) {
    setBusyId(id)
    const result = await window.api.invoke('campaign:duplicate', { id })
    setBusyId(undefined)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    toast('success', 'Campaign duplicated as a draft')
    campaigns.refetch()
  }

  async function report(id: string) {
    setBusyId(id)
    const result = await window.api.invoke('campaign:report', { id })
    setBusyId(undefined)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    toast('success', `Report exported (${result.data.rows} rows)`)
    await window.api.invoke('system:openPath', { path: result.data.filePath })
  }

  const list = campaigns.data ?? []

  return (
    <>
      <PageHeader
        title="WhatsApp Bulk Campaigns"
        description="Send a template to a contact list across your devices, with delay and sleep pacing."
        actions={
          <Button
            variant="primary"
            onClick={() => setCreating(true)}
            data-testid="new-campaign"
          >
            + Create Campaign
          </Button>
        }
      />

      {list.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet."
          description="Pick a template, some devices and a contact list, and RapBooster paces the sending for you."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              + Create Campaign
            </Button>
          }
        />
      ) : (
        <div
          className="grid gap-4 p-6 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]"
          data-testid="campaign-grid"
        >
          {list.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              busy={busyId === campaign.id}
              onAction={(channel) => void act(campaign.id, channel)}
              onDuplicate={() => void duplicate(campaign.id)}
              onRecipients={() => setViewing({ id: campaign.id, name: campaign.name })}
              onReport={() => void report(campaign.id)}
            />
          ))}
        </div>
      )}

      {viewing && (
        <RecipientsDialog
          campaignId={viewing.id}
          campaignName={viewing.name}
          onClose={() => setViewing(undefined)}
        />
      )}

      {creating && (
        <CreateCampaignDialog
          onClose={() => setCreating(false)}
          onCreated={(id, startNow) => {
            campaigns.refetch()
            if (startNow) void act(id, 'campaign:start')
            else toast('success', 'Campaign saved as draft')
          }}
        />
      )}
    </>
  )
}

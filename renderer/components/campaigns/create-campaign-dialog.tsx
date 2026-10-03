'use client'

import { useMemo, useState } from 'react'
import { FieldHelp } from '@renderer/components/help/field-help'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import { missingTags } from '@shared/merge-tags'
import { CampaignAudienceTags, type TagAudience } from './campaign-audience'
import { PacingFields, type Pacing } from './pacing-fields'

/**
 * Create-campaign dialog. Fields and defaults follow the prototype
 * (SPRINTS.md §2.3).
 */
export function CreateCampaignDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string, startNow: boolean) => void
}) {
  const devices = useIpcQuery('device:list')
  const lists = useIpcQuery('contactList:list')
  const templates = useIpcQuery('template:list')
  const tags = useIpcQuery('tag:list')

  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [deviceIds, setDeviceIds] = useState<string[]>([])
  const [listIds, setListIds] = useState<string[]>([])
  const [scheduledAt, setScheduledAt] = useState('')
  const [pacing, setPacing] = useState<Pacing>({
    delayFrom: 0,
    delayTo: 5,
    sleepDuration: 10,
    sleepAfter: 10,
  })
  const [audience, setAudience] = useState<TagAudience>({
    includeTagIds: [],
    excludeTagIds: [],
  })
  const [checkNumbers, setCheckNumbers] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const template = templates.data?.find((t) => t.id === templateId)

  // Warn before sending, not after: a tag no selected list provides would go
  // out blank to every recipient.
  const unresolvable = useMemo(() => {
    if (!template) return []
    const fields = new Set<string>()
    for (const id of listIds) {
      const list = lists.data?.find((l) => l.id === id)
      for (const f of list?.fields ?? []) fields.add(f)
    }
    return missingTags(template.content, [...fields])
  }, [template, listIds, lists.data])

  const selectedContacts = useMemo(
    () =>
      listIds.reduce(
        (sum, id) => sum + (lists.data?.find((l) => l.id === id)?.contactCount ?? 0),
        0,
      ),
    [listIds, lists.data],
  )

  const tagNames = (ids: string[]) =>
    ids.map((id) => tags.data?.find((t) => t.id === id)?.name ?? '').filter(Boolean)
  const included = tagNames(audience.includeTagIds)
  const excluded = tagNames(audience.excludeTagIds)

  function toggle(setter: (fn: (c: string[]) => string[]) => void, id: string) {
    setter((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    )
  }

  async function submit(startNow: boolean) {
    setError(undefined)
    setBusy(true)

    const result = await window.api.invoke('campaign:create', {
      name,
      templateId,
      deviceIds,
      listIds,
      ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
      ...pacing,
      includeTagIds: audience.includeTagIds,
      excludeTagIds: audience.excludeTagIds,
      checkNumbers,
    })
    setBusy(false)

    if (!result.ok) {
      setError(result.error.userMessage)
      return
    }
    onCreated(result.data.id, startNow)
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Create Campaign"
      testId="create-campaign-dialog"
      width={560}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit(false)}
            disabled={busy}
            data-testid="save-draft"
          >
            Save as draft
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit(true)}
            disabled={busy}
            data-testid="submit-campaign"
          >
            {scheduledAt ? 'Schedule' : 'Create & Start'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cmp-name" className="text-xs font-semibold text-ink">
            Campaign Name
          </label>
          <input
            id="cmp-name"
            data-testid="cmp-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Spring Sale 2024"
            className="rounded-control border border-line px-2.5 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-xs font-semibold text-ink">Select Devices</legend>
          <div className="max-h-24 overflow-y-auto rounded-control border border-line p-2">
            {(devices.data ?? []).length === 0 && (
              <p className="text-xs text-ink-subtle">Link a device first.</p>
            )}
            {(devices.data ?? []).map((device) => (
              <label key={device.id} className="flex items-center gap-2 py-0.5 text-sm">
                <input
                  type="checkbox"
                  data-testid={`cmp-device-${device.id}`}
                  checked={deviceIds.includes(device.id)}
                  onChange={() => toggle(setDeviceIds, device.id)}
                />
                <span className="truncate">
                  {device.name}{' '}
                  <span className="text-ink-subtle">
                    ({device.status === 'connected' ? 'connected' : device.status})
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-xs font-semibold text-ink">Select Contact Lists</legend>
          <div className="max-h-24 overflow-y-auto rounded-control border border-line p-2">
            {(lists.data ?? []).length === 0 && (
              <p className="text-xs text-ink-subtle">Create a contact list first.</p>
            )}
            {(lists.data ?? []).map((list) => (
              <label key={list.id} className="flex items-center gap-2 py-0.5 text-sm">
                <input
                  type="checkbox"
                  data-testid={`cmp-list-${list.id}`}
                  checked={listIds.includes(list.id)}
                  onChange={() => toggle(setListIds, list.id)}
                />
                <span className="truncate">
                  {list.name}{' '}
                  <span className="text-ink-subtle">({list.contactCount})</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <CampaignAudienceTags tags={tags} value={audience} onChange={setAudience} />

        <div className="flex items-start gap-1">
          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-0.5"
              data-testid="cmp-check-numbers"
              checked={checkNumbers}
              onChange={(e) => setCheckNumbers(e.target.checked)}
            />
            <span>
              Skip numbers not on WhatsApp
              <span className="block text-xs text-ink-muted">
                Checks each number just before sending and skips the ones without an
                account, instead of counting them as failures.
              </span>
            </span>
          </label>
          <FieldHelp id="campaign-check-numbers" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cmp-template" className="text-xs font-semibold text-ink">
            Select Template
          </label>
          <select
            id="cmp-template"
            data-testid="cmp-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="rounded-control border border-line px-2.5 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">-- Choose a template --</option>
            {(templates.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div
            className="rounded-bubble bg-wa-out px-3 py-2 text-sm whitespace-pre-wrap text-ink"
            data-testid="cmp-template-preview"
          >
            {template?.content ?? (
              <span className="text-ink-subtle">(Select a template to preview)</span>
            )}
          </div>
          {unresolvable.length > 0 && (
            <p className="text-xs text-status-warn-fg" data-testid="cmp-unresolvable">
              The selected lists do not provide{' '}
              {unresolvable.map((t) => `{{${t}}}`).join(', ')} — these will send as
              blanks.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1">
            <label htmlFor="cmp-schedule" className="text-xs font-semibold text-ink">
              Schedule Send (optional)
            </label>
            <FieldHelp id="campaign-schedule" />
          </span>
          <input
            id="cmp-schedule"
            type="datetime-local"
            data-testid="cmp-schedule"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="rounded-control border border-line px-2.5 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        <PacingFields value={pacing} onChange={setPacing} />

        <p className="text-xs text-ink-muted" data-testid="cmp-audience-summary">
          {selectedContacts.toLocaleString()} contacts selected across {listIds.length}{' '}
          list
          {listIds.length === 1 ? '' : 's'}
          {included.length > 0 && <>, plus contacts tagged {included.join(', ')}</>}
          {excluded.length > 0 && <>, excluding anyone tagged {excluded.join(', ')}</>}.
          Each number is messaged once.
        </p>

        {error && (
          <p className="text-xs text-danger" role="alert" data-testid="cmp-error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}

'use client'

import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { inputClass, type GroupRow } from './shared'

type Toggle = 'announce' | 'restrict' | 'joinApproval'

const TOGGLES: Array<{ key: Toggle; label: string; hint: string; testId: string }> = [
  {
    key: 'announce',
    label: 'Only admins can send messages',
    hint: 'Members can still read; useful for announcement groups.',
    testId: 'setting-announce',
  },
  {
    key: 'restrict',
    label: 'Only admins can edit group info',
    hint: 'Name, picture and description.',
    testId: 'setting-restrict',
  },
  {
    key: 'joinApproval',
    label: 'Approve new members',
    hint: 'People joining by link wait for an admin to approve them.',
    testId: 'setting-join-approval',
  },
]

/** Settings toggles and the description. Each change applies immediately. */
export function GroupSettingsPanel({
  group,
  onChanged,
}: {
  group: GroupRow
  onChanged: () => void
}) {
  const toast = useToast()
  const [values, setValues] = useState<Record<Toggle, boolean>>({
    announce: group.announce,
    restrict: group.restrict,
    joinApproval: group.joinApproval,
  })
  const [pending, setPending] = useState<Toggle | 'description'>()
  const [description, setDescription] = useState('')

  // Optimistic: the switch moves the moment it is clicked and rolls back if
  // WhatsApp refuses. Waiting for the round trip made it feel broken — a click
  // that visibly did nothing for a second or two.
  async function toggle(key: Toggle, next: boolean) {
    setValues((v) => ({ ...v, [key]: next }))
    setPending(key)
    const result = await window.api.invoke('group:updateSettings', {
      groupId: group.id,
      [key]: next,
    })
    setPending(undefined)
    if (!result.ok) {
      setValues((v) => ({ ...v, [key]: !next }))
      toast('error', result.error.userMessage)
      return
    }
    onChanged()
  }

  async function saveDescription() {
    setPending('description')
    const result = await window.api.invoke('group:updateSettings', {
      groupId: group.id,
      description,
    })
    setPending(undefined)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    toast('success', 'Description updated')
  }

  const disabled = !group.isAdmin || pending !== undefined

  return (
    <div className="flex flex-col gap-3">
      {TOGGLES.map((t) => (
        <label key={t.key} className="flex items-start gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-0.5"
            data-testid={t.testId}
            checked={values[t.key]}
            disabled={disabled}
            onChange={(e) => void toggle(t.key, e.target.checked)}
          />
          <span>
            <span className="block font-medium">{t.label}</span>
            <span className="text-xs text-ink-muted">{t.hint}</span>
          </span>
        </label>
      ))}

      <div className="flex flex-col gap-1.5 border-t border-line pt-3">
        <label htmlFor="group-description" className="text-xs font-semibold text-ink">
          Description
        </label>
        <textarea
          id="group-description"
          data-testid="group-description"
          rows={3}
          maxLength={2048}
          value={description}
          disabled={!group.isAdmin}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Replaces the current group description"
          className={inputClass}
        />
        <Button
          className="self-start"
          onClick={() => void saveDescription()}
          disabled={disabled}
          data-testid="save-description"
        >
          {pending === 'description' ? 'Saving…' : 'Save description'}
        </Button>
      </div>
    </div>
  )
}

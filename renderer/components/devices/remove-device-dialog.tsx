'use client'

import { useState } from 'react'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'

/**
 * Confirm removing a device. It is permanent, so the dialog says exactly what
 * goes and what stays (D158) and the button names the device.
 */
export function RemoveDeviceDialog({
  device,
  onClose,
  onRemoved,
}: {
  device: { id: string; name: string; phone: string | null }
  onClose: () => void
  onRemoved: () => void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function remove() {
    setBusy(true)
    const result = await window.api.invoke('device:delete', { id: device.id })
    setBusy(false)
    if (!result.ok) {
      toast('error', result.error.userMessage)
      return
    }
    toast('success', `${device.name} was removed`)
    onRemoved()
    onClose()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Remove ${device.name}?`}
      testId="remove-device-dialog"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => void remove()}
            disabled={busy}
            data-testid="confirm-remove-device"
          >
            {busy ? 'Removing…' : 'Remove permanently'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 text-sm text-ink">
        <p>
          This logs {device.phone ?? 'this number'} out of RapBooster and{' '}
          <strong>permanently deletes</strong> its chats and messages, groups, channels,
          scheduled posts, call history and synced contacts.
        </p>
        <p className="text-ink-muted">
          Campaign reports keep their numbers. Your contact lists and templates are not
          touched. You can link the same WhatsApp number again later, starting fresh.
        </p>
      </div>
    </Dialog>
  )
}

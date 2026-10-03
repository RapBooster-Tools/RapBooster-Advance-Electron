'use client'

import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'

/** "Are you sure?" before anything in the inbox that cannot be undone. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
  testId,
}: {
  title: string
  message: string
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
  testId: string
}) {
  return (
    <Dialog
      open
      onClose={onCancel}
      title={title}
      width={420}
      testId={testId}
      footer={
        <>
          <Button onClick={onCancel}>Keep it</Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={onConfirm}
            data-testid={`${testId}-yes`}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink">{message}</p>
    </Dialog>
  )
}

'use client'

import { FilePlus2, LayoutTemplate } from 'lucide-react'
import { Dialog } from '@renderer/components/ui/dialog'
import {
  blankDraft,
  draftFromTemplate,
  FLOW_TEMPLATES,
  type FlowDraft,
} from './flow-templates'

/** Pick a starter flow, or a blank one. */
export function FlowGallery({
  onPick,
  onClose,
}: {
  onPick: (draft: FlowDraft) => void
  onClose: () => void
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="Start a new chatbot flow"
      width={640}
      testId="flow-gallery"
    >
      <p className="mb-3 text-sm text-ink-muted">
        Pick a ready-made flow and change the wording to match your business, or start
        from scratch.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FLOW_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid={`flow-template-${t.id}`}
            onClick={() => onPick(draftFromTemplate(t))}
            className="flex flex-col gap-1 rounded-card border border-line p-3 text-left hover:border-primary hover:bg-wa-in"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <LayoutTemplate className="size-4 text-primary" aria-hidden />
              {t.title}
            </span>
            <span className="text-xs text-ink-muted">{t.description}</span>
          </button>
        ))}
        <button
          type="button"
          data-testid="flow-template-blank"
          onClick={() => onPick(blankDraft())}
          className="flex flex-col gap-1 rounded-card border border-dashed border-line p-3 text-left hover:border-primary hover:bg-wa-in"
        >
          <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <FilePlus2 className="size-4 text-primary" aria-hidden />
            Blank flow
          </span>
          <span className="text-xs text-ink-muted">
            One message to start; build the rest yourself.
          </span>
        </button>
      </div>
    </Dialog>
  )
}

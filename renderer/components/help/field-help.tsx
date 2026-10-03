'use client'

import { InfoTip } from '@renderer/components/ui/tooltip'
import { FIELD_HELP, type FieldHelpId } from '@renderer/help'

/**
 * The "?" beside a setting. Its words come from renderer/help/fields.ts, the
 * same text the user guide prints, so the two can never disagree.
 */
export function FieldHelp({
  id,
  side = 'top',
}: {
  id: FieldHelpId
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  const field = FIELD_HELP[id]
  return (
    <InfoTip
      content={field.text}
      label={`About: ${field.label}`}
      side={side}
      testId={`info-${id}`}
    />
  )
}

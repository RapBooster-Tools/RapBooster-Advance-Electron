'use client'

import { FieldHelp } from '@renderer/components/help/field-help'
import { NumberField, Panel } from './form'
import type { AiConfig } from './providers'

/**
 * The guard-rails around the model: how much it may send, how bursts are
 * batched, whether a person signs off first, and how each request is shaped.
 */
export function AiLimitsPanel({
  config,
  onChange,
}: {
  config: AiConfig
  onChange: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void
}) {
  return (
    <Panel title="Limits & Safety" tour="ai-limits">
      <div className="flex items-center gap-1">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            data-testid="ai-approve-before-send"
            checked={config.approveBeforeSend}
            onChange={(e) => onChange('approveBeforeSend', e.target.checked)}
          />
          Approve before sending — replies wait in the inbox for a person to approve, edit
          or discard
        </label>
        <FieldHelp id="ai-approve" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <NumberField
          id="ai-cap-device"
          label="Daily replies per device"
          hint="0 = unlimited"
          info={<FieldHelp id="ai-caps" />}
          min={0}
          max={100_000}
          value={config.dailyCapPerDevice}
          onChange={(v) => onChange('dailyCapPerDevice', v)}
        />
        <NumberField
          id="ai-cap-chat"
          label="Daily replies per chat"
          hint="0 = unlimited"
          min={0}
          max={1_000}
          value={config.dailyCapPerChat}
          onChange={(v) => onChange('dailyCapPerChat', v)}
        />
        <NumberField
          id="ai-coalesce"
          label="Wait for more messages (sec)"
          info={<FieldHelp id="ai-debounce" />}
          hint="A burst of messages gets one reply"
          min={0}
          max={120}
          value={config.coalesceSeconds}
          onChange={(v) => onChange('coalesceSeconds', v)}
        />
        <NumberField
          id="ai-history"
          label="History depth (messages)"
          info={<FieldHelp id="ai-history" />}
          min={0}
          max={50}
          value={config.historyDepth}
          onChange={(v) => onChange('historyDepth', v)}
        />
        <NumberField
          id="ai-max-tokens"
          label="Max tokens per reply"
          info={<FieldHelp id="ai-max-tokens" />}
          min={16}
          max={4096}
          value={config.maxTokens}
          onChange={(v) => onChange('maxTokens', v)}
        />
        <NumberField
          id="ai-temperature"
          label="Temperature"
          info={<FieldHelp id="ai-temperature" />}
          hint="Lower is more predictable"
          min={0}
          max={2}
          step={0.1}
          value={config.temperature}
          onChange={(v) => onChange('temperature', v)}
        />
      </div>
    </Panel>
  )
}

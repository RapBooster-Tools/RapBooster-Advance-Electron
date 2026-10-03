'use client'

import type { FlowGraph } from '@shared/flow'
import { INPUT_CLASS } from '../field'
import { nodeTitle, TYPE_LABEL, type NodeType } from './flow-graph'

const NEW_TYPES: NodeType[] = ['message', 'menu', 'question', 'handoff', 'end']

/**
 * "Then go to…" — any existing step, the end of the conversation, or a new
 * step created and linked in one go.
 */
export function NextSelect({
  graph,
  selfId,
  value,
  onChange,
  onCreate,
  label,
  testId,
}: {
  graph: FlowGraph
  /** A step cannot lead to itself, except a menu offering itself again. */
  selfId: string | null
  value: string | null
  onChange: (next: string | null) => void
  /** Adds an unlinked step of this type and returns its id. */
  onCreate: (type: NodeType) => string
  label: string
  testId: string
}) {
  return (
    <select
      aria-label={label}
      data-testid={testId}
      value={value ?? ''}
      onChange={(e) => {
        const choice = e.target.value
        if (choice.startsWith('new:')) {
          onChange(onCreate(choice.slice(4) as NodeType))
        } else {
          onChange(choice === '' ? null : choice)
        }
      }}
      className={`${INPUT_CLASS} w-full`}
    >
      <option value="">End the conversation here</option>
      <optgroup label="Go to an existing step">
        {graph.nodes.map((n, i) =>
          n.id === selfId ? null : (
            <option key={n.id} value={n.id}>
              {nodeTitle(n, i)}
            </option>
          ),
        )}
      </optgroup>
      <optgroup label="Create a new step">
        {NEW_TYPES.map((t) => (
          <option key={t} value={`new:${t}`}>
            + New {TYPE_LABEL[t].toLowerCase()} step
          </option>
        ))}
      </optgroup>
    </select>
  )
}

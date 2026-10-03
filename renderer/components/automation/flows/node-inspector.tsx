'use client'

import { Flag, Trash2 } from 'lucide-react'
import type { FlowGraph, FlowNode } from '@shared/flow'
import { Button } from '@renderer/components/ui/button'
import { Field, INPUT_CLASS } from '../field'
import { TYPE_HINT, TYPE_LABEL, type NodeType } from './flow-graph'
import { MenuOptions } from './menu-options'
import { NextSelect } from './next-select'

const TEXT_LABEL: Record<NodeType, string> = {
  message: 'Message',
  menu: 'Message above the choices',
  question: 'Question to ask',
  handoff: 'What to tell the customer',
  end: 'Last message (optional)',
}

/** Merge tags the user can type: contact fields plus answers saved by questions. */
function tagHint(graph: FlowGraph): string {
  const answers = graph.nodes.flatMap((n) =>
    n.type === 'question' ? [`{{${n.variable}}}`] : [],
  )
  const extra =
    answers.length > 0 ? `, or a saved answer: ${[...new Set(answers)].join(', ')}` : ''
  return `Type {{Name}} for the customer's name${extra}.`
}

/** Edit the selected step: its text, where it leads, and type-specific settings. */
export function NodeInspector({
  graph,
  node,
  index,
  onChange,
  onCreate,
  onDelete,
  onMakeStart,
}: {
  graph: FlowGraph
  node: FlowNode
  index: number
  onChange: (node: FlowNode) => void
  onCreate: (type: NodeType) => string
  onDelete: () => void
  onMakeStart: () => void
}) {
  const isStart = graph.startNodeId === node.id

  return (
    <aside
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-card border border-line bg-surface p-4"
      data-testid="flow-inspector"
      aria-label="Edit step"
    >
      <div>
        <h3 className="text-sm font-semibold text-ink">
          Step {index + 1}: {TYPE_LABEL[node.type]}
        </h3>
        <p className="text-xs text-ink-muted">{TYPE_HINT[node.type]}</p>
      </div>

      <Field label={TEXT_LABEL[node.type]} htmlFor="flow-node-text" hint={tagHint(graph)}>
        <textarea
          id="flow-node-text"
          data-testid="flow-node-text"
          rows={4}
          value={node.text ?? ''}
          onChange={(e) => onChange({ ...node, text: e.target.value })}
          className={INPUT_CLASS}
        />
      </Field>

      {node.type === 'message' && (
        <Field label="Then go to" hint="Message steps move on straight away.">
          <NextSelect
            graph={graph}
            selfId={node.id}
            value={node.next}
            onChange={(next) => onChange({ ...node, next })}
            onCreate={onCreate}
            label="Then go to"
            testId="flow-node-next"
          />
        </Field>
      )}

      {node.type === 'menu' && (
        <MenuOptions graph={graph} node={node} onChange={onChange} onCreate={onCreate} />
      )}

      {node.type === 'question' && (
        <>
          <Field
            label="Save the answer as"
            htmlFor="flow-node-variable"
            hint={`Later steps can use it as {{${node.variable || 'name'}}}.`}
          >
            <input
              id="flow-node-variable"
              data-testid="flow-node-variable"
              value={node.variable}
              onChange={(e) => onChange({ ...node, variable: e.target.value.trim() })}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="After the answer, go to">
            <NextSelect
              graph={graph}
              selfId={node.id}
              value={node.next}
              onChange={(next) => onChange({ ...node, next })}
              onCreate={onCreate}
              label="After the answer, go to"
              testId="flow-node-next"
            />
          </Field>
        </>
      )}

      <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3">
        <Button
          size="sm"
          onClick={onMakeStart}
          disabled={isStart}
          data-testid="flow-node-make-start"
        >
          <Flag className="size-3.5" aria-hidden />
          {isStart ? 'This is the first step' : 'Make this the first step'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={graph.nodes.length <= 1}
          data-testid="flow-node-delete"
        >
          <Trash2 className="size-3.5" aria-hidden />
          Delete step
        </Button>
      </div>
    </aside>
  )
}

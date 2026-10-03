'use client'

import { useState } from 'react'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import type { FlowGraph, FlowNode } from '@shared/flow'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/cn'
import { FlowCanvas } from './flow-canvas'
import {
  createNode,
  graphProblems,
  removeNode,
  TYPE_LABEL,
  withPositions,
  type NodeType,
} from './flow-graph'
import { FlowSettings } from './flow-settings'
import type { FlowDraft } from './flow-templates'
import { FlowTestPanel } from './flow-test-panel'
import { NodeInspector } from './node-inspector'

const ADDABLE: NodeType[] = ['message', 'menu', 'question', 'handoff', 'end']

function settingsProblems(draft: FlowDraft): string[] {
  const problems: string[] = []
  if (!draft.name.trim()) problems.push('Give the flow a name.')
  if (draft.trigger === 'keywords' && draft.keywords.length === 0) {
    problems.push('Add at least one keyword, or choose another way to start the flow.')
  }
  return problems
}

/** The visual editor: settings on top, the canvas, and a side panel to edit or test. */
export function FlowBuilder({
  initial,
  onClose,
  onSaved,
}: {
  initial: FlowDraft
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<FlowDraft>(initial)
  const [selectedId, setSelectedId] = useState<string | null>(initial.graph.startNodeId)
  const [side, setSide] = useState<'edit' | 'test'>('edit')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const graphIssues = graphProblems(draft.graph)
  const problems = [...settingsProblems(draft), ...graphIssues]
  const index = draft.graph.nodes.findIndex((n) => n.id === selectedId)
  const selected = index >= 0 ? draft.graph.nodes[index] : undefined

  const setGraph = (fn: (graph: FlowGraph) => FlowGraph) =>
    setDraft((d) => ({ ...d, graph: fn(d.graph) }))

  function addStep(type: NodeType): string {
    const node = createNode(type)
    setGraph((g) => ({ ...g, nodes: [...g.nodes, node] }))
    return node.id
  }

  function updateNode(node: FlowNode) {
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === node.id ? node : n)) }))
  }

  function deleteNode(id: string) {
    setGraph((g) => removeNode(g, id))
    setSelectedId(null)
  }

  async function save() {
    if (problems.length > 0) return
    setBusy(true)
    const body = {
      name: draft.name.trim(),
      enabled: draft.enabled,
      trigger: draft.trigger,
      keywords: draft.keywords,
      deviceIds: draft.deviceIds,
      priority: draft.priority,
      graph: withPositions(draft.graph),
    }
    const result = draft.id
      ? await window.api.invoke('flow:update', { id: draft.id, ...body })
      : await window.api.invoke('flow:create', body)
    setBusy(false)
    if (!result.ok) return toast('error', result.error.userMessage)
    toast('success', `Flow "${body.name}" saved.`)
    onSaved()
  }

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="flow-builder"
      data-help="flow-builder"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onClose} data-testid="flow-builder-back">
          <ArrowLeft className="size-4" aria-hidden />
          All flows
        </Button>
        <h2 className="text-base font-semibold text-ink">
          {draft.id ? 'Edit chatbot flow' : 'New chatbot flow'}
        </h2>
        <div className="ml-auto flex gap-2">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            disabled={busy || problems.length > 0}
            data-testid="flow-save"
          >
            {busy ? 'Saving…' : 'Save flow'}
          </Button>
        </div>
      </div>

      <FlowSettings
        draft={draft}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
      />

      {problems.length > 0 && (
        <div
          role="alert"
          data-testid="flow-errors"
          className="rounded-card border border-status-warn-fg/30 bg-status-warn-bg p-3 text-sm text-status-warn-fg"
        >
          <p className="mb-1 flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-4" aria-hidden /> Fix these before saving:
          </p>
          <ul className="list-disc pl-6">
            {problems.map((p) => (
              <li key={p} data-testid="flow-error">
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-ink-muted">Add a step:</span>
        {ADDABLE.map((type) => (
          <Button
            key={type}
            size="sm"
            data-testid={`flow-add-${type}`}
            onClick={() => setSelectedId(addStep(type))}
          >
            + {TYPE_LABEL[type]}
          </Button>
        ))}
        <span className="text-xs text-ink-muted">
          Click a step on the canvas to edit it.
        </span>
      </div>

      <div className="flex min-h-[480px] gap-3">
        <FlowCanvas
          graph={draft.graph}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id)
            setSide('edit')
          }}
        />
        <div className="flex w-80 shrink-0 flex-col gap-2">
          <div className="flex gap-1" role="tablist">
            {(['edit', 'test'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={side === s}
                data-testid={`flow-side-${s}`}
                onClick={() => setSide(s)}
                className={cn(
                  'flex-1 rounded-control px-3 py-1.5 text-sm',
                  side === s
                    ? 'bg-primary font-medium text-white'
                    : 'text-ink-muted hover:bg-wa-in',
                )}
              >
                {s === 'edit' ? 'Edit step' : 'Test'}
              </button>
            ))}
          </div>
          {side === 'test' ? (
            <FlowTestPanel graph={draft.graph} valid={graphIssues.length === 0} />
          ) : selected ? (
            <NodeInspector
              key={selected.id}
              graph={draft.graph}
              node={selected}
              index={index}
              onChange={updateNode}
              onCreate={addStep}
              onDelete={() => deleteNode(selected.id)}
              onMakeStart={() => setGraph((g) => ({ ...g, startNodeId: selected.id }))}
            />
          ) : (
            <p className="rounded-card border border-dashed border-line p-4 text-sm text-ink-muted">
              Select a step on the canvas to change what it says and where it leads.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

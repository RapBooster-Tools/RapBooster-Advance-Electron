'use client'

import { useState } from 'react'
import { Workflow } from 'lucide-react'
import type { IpcResponse } from '@shared/ipc'
import { useToast } from '@renderer/components/providers/toast-provider'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { useIpcQuery } from '@renderer/hooks/useIpc'
import { FlowBuilder } from './flow-builder'
import { FlowGallery } from './flow-gallery'
import { TRIGGER_LABEL } from './flow-settings'
import type { FlowDraft } from './flow-templates'

type ChatbotFlow = IpcResponse<'flow:list'>[number]

/** Everything `flow:update` needs — it always replaces the whole flow (see flows.ipc.ts). */
function toInput(flow: ChatbotFlow) {
  return {
    name: flow.name,
    enabled: flow.enabled,
    trigger: flow.trigger,
    keywords: flow.keywords,
    deviceIds: flow.deviceIds,
    priority: flow.priority,
    graph: flow.graph,
  }
}

function triggerSummary(flow: ChatbotFlow): string {
  return flow.trigger === 'keywords'
    ? `Keywords: ${flow.keywords.join(', ')}`
    : TRIGGER_LABEL[flow.trigger]
}

/** Chatbot flows: the list, and the builder when one is open. */
export function FlowsPanel() {
  const flows = useIpcQuery('flow:list')
  const [editing, setEditing] = useState<FlowDraft>()
  const [picking, setPicking] = useState(false)
  const [deleting, setDeleting] = useState<ChatbotFlow>()
  const toast = useToast()

  async function toggle(flow: ChatbotFlow) {
    const res = await window.api.invoke('flow:update', {
      id: flow.id,
      ...toInput(flow),
      enabled: !flow.enabled,
    })
    if (!res.ok) return toast('error', res.error.userMessage)
    toast('success', `"${flow.name}" switched ${res.data.enabled ? 'on' : 'off'}.`)
    flows.refetch()
  }

  async function duplicate(flow: ChatbotFlow) {
    // A copy starts switched off, so two identical flows never compete.
    const res = await window.api.invoke('flow:create', {
      ...toInput(flow),
      name: `${flow.name} (copy)`.slice(0, 100),
      enabled: false,
    })
    if (!res.ok) return toast('error', res.error.userMessage)
    toast('success', `Copied as "${res.data.name}". It is off until you switch it on.`)
    flows.refetch()
  }

  async function confirmDelete() {
    if (!deleting) return
    const res = await window.api.invoke('flow:delete', { id: deleting.id })
    setDeleting(undefined)
    if (!res.ok) return toast('error', res.error.userMessage)
    toast('success', 'Flow deleted.')
    flows.refetch()
  }

  if (editing) {
    return (
      <FlowBuilder
        initial={editing}
        onClose={() => setEditing(undefined)}
        onSaved={() => {
          setEditing(undefined)
          flows.refetch()
        }}
      />
    )
  }

  const all = flows.data ?? []
  return (
    <div className="flex flex-col gap-4" data-help="chatbot-flows">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-ink-muted">
          Flows guide customers through menus and questions. They answer before keyword
          rules and the AI bot; a customer mid-flow always gets the flow&apos;s next step.
        </p>
        <Button variant="primary" onClick={() => setPicking(true)} data-testid="flow-new">
          + New flow
        </Button>
      </div>

      {all.length === 0 && !flows.loading ? (
        <EmptyState
          icon={Workflow}
          title="No chatbot flows yet"
          description="Start from a ready-made menu, lead capture or FAQ flow, then change the wording to suit your business."
          action={
            <Button
              variant="primary"
              onClick={() => setPicking(true)}
              data-testid="flow-empty-new"
            >
              Start from a template
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-app-bg text-xs">
              <tr>
                {['Name', 'Starts', 'Steps', 'Chats in progress', 'On', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-ink-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {all.map((f) => (
                <tr key={f.id} className="border-t border-line" data-testid="flow-row">
                  <td className="px-3 py-2 font-medium text-ink">{f.name}</td>
                  <td className="max-w-64 truncate px-3 py-2 text-ink-muted">
                    {triggerSummary(f)}
                  </td>
                  <td className="px-3 py-2 text-ink">{f.graph.nodes.length}</td>
                  <td className="px-3 py-2 text-ink" data-testid="flow-sessions">
                    {f.activeSessions}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Switch ${f.name} on or off`}
                      data-testid="flow-toggle"
                      checked={f.enabled}
                      onChange={() => void toggle(f)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid="flow-edit"
                        onClick={() => setEditing({ id: f.id, ...toInput(f) })}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid="flow-duplicate"
                        onClick={() => void duplicate(f)}
                      >
                        Duplicate
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid="flow-delete"
                        onClick={() => setDeleting(f)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {picking && (
        <FlowGallery
          onClose={() => setPicking(false)}
          onPick={(draft) => {
            setPicking(false)
            setEditing(draft)
          }}
        />
      )}

      <Dialog
        open={deleting !== undefined}
        onClose={() => setDeleting(undefined)}
        title="Delete this flow?"
        testId="flow-delete-dialog"
        footer={
          <>
            <Button onClick={() => setDeleting(undefined)}>Keep it</Button>
            <Button
              variant="danger"
              onClick={() => void confirmDelete()}
              data-testid="flow-delete-confirm"
            >
              Delete flow
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink">
          &ldquo;{deleting?.name}&rdquo; will stop answering customers straight away
          {deleting && deleting.activeSessions > 0
            ? `, including ${deleting.activeSessions} chat(s) in the middle of it`
            : ''}
          . This cannot be undone.
        </p>
      </Dialog>
    </div>
  )
}

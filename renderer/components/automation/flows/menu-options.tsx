'use client'

import { Trash2 } from 'lucide-react'
import { MAX_MENU_OPTIONS, type FlowGraph, type FlowNode } from '@shared/flow'
import { Button } from '@renderer/components/ui/button'
import { Field, INPUT_CLASS } from '../field'
import { newId, type NodeType } from './flow-graph'
import { NextSelect } from './next-select'

type MenuNode = Extract<FlowNode, { type: 'menu' }>

const STYLE_LABEL: Record<MenuNode['style'], string> = {
  numbers: 'Numbered list in the message (works everywhere)',
  buttons: 'Tap buttons (up to 3; more become a list)',
  list: 'A "Choose an option" list',
}

/** A menu's choices, each with where it leads, plus how the menu is shown. */
export function MenuOptions({
  graph,
  node,
  onChange,
  onCreate,
}: {
  graph: FlowGraph
  node: MenuNode
  onChange: (node: MenuNode) => void
  onCreate: (type: NodeType) => string
}) {
  const setOption = (index: number, patch: Partial<MenuNode['options'][number]>) =>
    onChange({
      ...node,
      options: node.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    })

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="How the choices look"
        htmlFor="flow-menu-style"
        hint="Customers can always answer by typing the number or the choice's title."
      >
        <select
          id="flow-menu-style"
          data-testid="flow-menu-style"
          value={node.style}
          onChange={(e) =>
            onChange({ ...node, style: e.target.value as MenuNode['style'] })
          }
          className={INPUT_CLASS}
        >
          {(Object.keys(STYLE_LABEL) as MenuNode['style'][]).map((s) => (
            <option key={s} value={s}>
              {STYLE_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-semibold text-ink">Choices</legend>
        {node.options.map((option, index) => (
          <div
            key={option.id}
            data-testid="flow-option"
            className="flex flex-col gap-1.5 rounded-control border border-line p-2"
          >
            <div className="flex items-center gap-1.5">
              <span className="w-5 text-xs font-semibold text-ink-muted">
                {index + 1}.
              </span>
              <input
                aria-label={`Choice ${index + 1} title`}
                data-testid="flow-option-label"
                value={option.label}
                maxLength={60}
                onChange={(e) => setOption(index, { label: e.target.value })}
                className={`${INPUT_CLASS} flex-1`}
              />
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove choice ${index + 1}`}
                disabled={node.options.length <= 1}
                onClick={() =>
                  onChange({
                    ...node,
                    options: node.options.filter((_, i) => i !== index),
                  })
                }
              >
                <Trash2 className="size-3.5" aria-hidden />
              </Button>
            </div>
            <label className="flex items-center gap-1.5 pl-6 text-xs text-ink-muted">
              <span className="shrink-0">goes to</span>
              <NextSelect
                graph={graph}
                selfId={null}
                value={option.next}
                onChange={(next) => setOption(index, { next })}
                onCreate={onCreate}
                label={`Where choice ${index + 1} leads`}
                testId="flow-option-next"
              />
            </label>
          </div>
        ))}
        <Button
          size="sm"
          data-testid="flow-option-add"
          disabled={node.options.length >= MAX_MENU_OPTIONS}
          onClick={() =>
            onChange({
              ...node,
              options: [
                ...node.options,
                {
                  id: newId('o'),
                  label: `Option ${node.options.length + 1}`,
                  next: null,
                },
              ],
            })
          }
        >
          + Add a choice
        </Button>
      </fieldset>

      <Field
        label="If the reply matches no choice"
        htmlFor="flow-menu-invalid"
        hint="Sent together with the menu again. Leave empty for a standard message."
      >
        <textarea
          id="flow-menu-invalid"
          data-testid="flow-menu-invalid"
          rows={2}
          maxLength={500}
          value={node.invalidText ?? ''}
          onChange={(e) =>
            onChange({
              ...node,
              invalidText: e.target.value === '' ? undefined : e.target.value,
            })
          }
          placeholder="Sorry, I didn't understand. Please reply with one of the numbers."
          className={INPUT_CLASS}
        />
      </Field>
    </div>
  )
}

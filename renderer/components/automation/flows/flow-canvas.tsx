'use client'

import { Flag } from 'lucide-react'
import type { FlowGraph, FlowNode } from '@shared/flow'
import { cn } from '@renderer/lib/cn'
import { CARD_WIDTH, layoutGraph, targetsOf, TYPE_LABEL, type Box } from './flow-graph'

const TYPE_ACCENT: Record<FlowNode['type'], string> = {
  message: 'border-l-primary',
  menu: 'border-l-status-ok-fg',
  question: 'border-l-status-warn-fg',
  handoff: 'border-l-danger',
  end: 'border-l-line',
}

interface Edge {
  key: string
  d: string
  label: string | null
  lx: number
  ly: number
}

/** Bottom of the source card to the top of the target, as a smooth curve. */
function edgesOf(graph: FlowGraph, boxes: Map<string, Box>): Edge[] {
  const edges: Edge[] = []
  for (const node of graph.nodes) {
    const from = boxes.get(node.id)
    if (!from) continue
    const targets = targetsOf(node)
    const count = node.type === 'menu' ? node.options.length : 1
    for (const { to, option } of targets) {
      const target = boxes.get(to)
      if (!target) continue
      // Menu links leave from spread-out points so each choice is traceable.
      const slot = option ?? 0
      const x1 = from.x + (CARD_WIDTH * (slot + 1)) / (count + 1)
      const y1 = from.y + from.h
      const x2 = target.x + CARD_WIDTH / 2
      const y2 = target.y
      const bend = Math.max(40, Math.abs(y2 - y1) / 2)
      edges.push({
        key: `${node.id}-${slot}-${to}`,
        d: `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`,
        label: option === null ? null : String(option + 1),
        lx: x1 + 6,
        ly: y1 + 14,
      })
    }
  }
  return edges
}

function CardBody({ node }: { node: FlowNode }) {
  return (
    <>
      <p className="line-clamp-2 text-xs text-ink">
        {node.text?.trim() || <span className="text-ink-muted">(no message)</span>}
      </p>
      {node.type === 'menu' && (
        <ol className="mt-1 flex flex-col">
          {node.options.map((o, i) => (
            <li key={o.id} className="h-5 truncate text-[11px] text-ink-muted">
              {i + 1}. {o.label}
              {o.next === null && ' → ends'}
            </li>
          ))}
        </ol>
      )}
      {node.type === 'question' && (
        <p className="mt-1 truncate text-[11px] text-ink-muted">
          Saves the answer as {`{{${node.variable}}}`}
        </p>
      )}
    </>
  )
}

/**
 * The flow as cards top to bottom by distance from the start, joined by
 * curves drawn in an SVG layer underneath. Click a card to edit it.
 */
export function FlowCanvas({
  graph,
  selectedId,
  onSelect,
}: {
  graph: FlowGraph
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { boxes, width, height } = layoutGraph(graph)
  const edges = edgesOf(graph, boxes)

  return (
    <div
      className="min-h-[420px] flex-1 overflow-auto rounded-card border border-line bg-app-bg"
      data-testid="flow-canvas"
    >
      <div className="relative mx-auto" style={{ width, height }}>
        <svg
          className="pointer-events-none absolute inset-0 text-ink-muted"
          width={width}
          height={height}
          aria-hidden
        >
          <defs>
            <marker
              id="flow-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>
          {edges.map((e) => (
            <g key={e.key}>
              <path
                d={e.d}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                markerEnd="url(#flow-arrow)"
              />
              {e.label && (
                <text x={e.lx} y={e.ly} fontSize={10} fill="currentColor">
                  {e.label}
                </text>
              )}
            </g>
          ))}
        </svg>
        {graph.nodes.map((node, index) => {
          const box = boxes.get(node.id)
          if (!box) return null
          const isStart = node.id === graph.startNodeId
          return (
            <button
              key={node.id}
              type="button"
              data-testid="flow-node"
              data-node-id={node.id}
              data-node-type={node.type}
              onClick={() => onSelect(node.id)}
              style={{ left: box.x, top: box.y, width: CARD_WIDTH, height: box.h }}
              className={cn(
                'absolute flex flex-col overflow-hidden rounded-card border border-l-4 bg-surface px-3 py-2 text-left shadow-sm',
                TYPE_ACCENT[node.type],
                selectedId === node.id ? 'ring-2 ring-primary' : 'hover:shadow-md',
              )}
            >
              <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-ink-muted">
                {index + 1}. {TYPE_LABEL[node.type]}
                {isStart && (
                  <span className="ml-auto inline-flex items-center gap-0.5 text-primary">
                    <Flag className="size-3" aria-hidden /> Start
                  </span>
                )}
              </span>
              <CardBody node={node} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

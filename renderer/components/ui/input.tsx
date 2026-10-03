'use client'

import { ChevronDown } from 'lucide-react'
import type {
  InputHTMLAttributes,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cn } from '@renderer/lib/cn'

/**
 * Shared look for every text-like control. Exported so a screen with an
 * unusual control (a search box with an icon, a combobox) can match exactly.
 */
export const controlClass = cn(
  'w-full rounded-control border border-line bg-surface text-sm text-ink',
  'transition-[border-color,box-shadow] duration-150 outline-none',
  'hover:border-line-strong focus:border-primary',
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle',
  'aria-[invalid=true]:border-danger',
)

type ControlSize = 'sm' | 'md'

const HEIGHT: Record<ControlSize, string> = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-9 px-3',
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  ref?: Ref<HTMLInputElement>
  controlSize?: ControlSize
  /** Marks the control invalid (red border, aria-invalid). Use with <Field error>. */
  invalid?: boolean
}

/** Single-line text input. Pair with <Field> for the label, hint and error. */
export function Input({ className, controlSize = 'md', invalid, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(controlClass, HEIGHT[controlSize], className)}
      {...props}
    />
  )
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: Ref<HTMLTextAreaElement>
  invalid?: boolean
}

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(
        controlClass,
        'min-h-24 resize-y px-3 py-2 leading-relaxed',
        className,
      )}
      {...props}
    />
  )
}

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'size'
> {
  ref?: Ref<HTMLSelectElement>
  controlSize?: ControlSize
  invalid?: boolean
}

/**
 * Native <select>, restyled. Native on purpose: it is keyboard- and
 * screen-reader-correct on both Windows and macOS for free, and its popup
 * follows the theme through `color-scheme`.
 */
export function Select({
  className,
  controlSize = 'md',
  invalid,
  children,
  ...props
}: SelectProps) {
  return (
    <div className={cn('relative', className)}>
      <select
        aria-invalid={invalid || undefined}
        className={cn(controlClass, HEIGHT[controlSize], 'appearance-none pr-8')}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-subtle"
        aria-hidden
      />
    </div>
  )
}

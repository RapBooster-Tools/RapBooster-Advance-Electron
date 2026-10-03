'use client'

import { LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary shadow-card hover:bg-primary-hover active:translate-y-px',
  secondary:
    'bg-surface text-ink border border-line shadow-card hover:bg-wa-in hover:border-line-strong active:translate-y-px',
  danger:
    'bg-danger text-on-danger shadow-card hover:bg-danger-hover active:translate-y-px',
  ghost: 'text-ink hover:bg-wa-in',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
  icon: 'size-9 p-0',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /**
   * Shows a spinner and blocks further clicks while an action runs, so a slow
   * IPC call cannot be submitted twice. The label stays, so the button does not
   * jump in width.
   */
  loading?: boolean
  children?: ReactNode
}

/**
 * The one button. `primary` is the single main action on a screen or dialog;
 * `secondary` for everything else; `danger` only for destructive actions;
 * `ghost` for low-emphasis actions inside rows and toolbars. `size="icon"`
 * needs an `aria-label`.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  className,
  type = 'button',
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-control font-medium whitespace-nowrap select-none',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

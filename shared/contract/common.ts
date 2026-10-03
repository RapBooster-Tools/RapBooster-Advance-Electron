/**
 * Primitives shared by the domain contract files. Kept identical to the ones
 * at the top of shared/ipc.ts so every channel validates the same way.
 */
import { z } from 'zod'

export const id = z.string().min(1)
export const isoDate = z.string().datetime({ offset: true })
export const nullableIso = isoDate.nullable()
export const cursor = z.string().min(1).optional()
export const pageLimit = z.number().int().min(1).max(200).default(100)
export const ok = z.object({ ok: z.literal(true) })
/** An E.164 phone number. */
export const e164 = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Use international format, e.g. +919876543210')

export function page<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    total: z.number().int().min(0),
  })
}

/** A request that runs in the background and reports through an event. */
export const started = z.object({ total: z.number().int().min(0) })

type Patch<T extends z.ZodRawShape> = {
  [K in keyof T]: z.ZodOptional<T[K] extends z.ZodDefault<infer I> ? I : T[K]>
}

/**
 * The update ("patch") form of a create schema: every field optional, and
 * every `.default()` removed.
 *
 * WHY not `.partial()`: zod 4 still applies defaults inside a partial object,
 * so `{ id, enabled: false }` would come out with every defaulted field reset
 * — a toggle silently wiping a rule's devices, priority and cooldown.
 */
export function patchOf<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
): z.ZodObject<Patch<T>> {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => {
      const type = field as z.ZodType
      return [
        key,
        (type instanceof z.ZodDefault ? (type.unwrap() as z.ZodType) : type).optional(),
      ]
    }),
  )
  return z.object(shape) as unknown as z.ZodObject<Patch<T>>
}

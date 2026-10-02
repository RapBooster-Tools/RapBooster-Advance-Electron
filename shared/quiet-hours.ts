/**
 * Quiet-hours window arithmetic, shared by the wa-service throttle (which
 * enforces it) and main (which decides when a parked campaign may resume).
 */

/** True when `now` falls inside the window. start > end wraps midnight. */
export function inQuietHours(
  window: { start: number; end: number } | null,
  now: Date = new Date(),
): boolean {
  if (!window || window.start === window.end) return false
  const minute = now.getHours() * 60 + now.getMinutes()
  return window.start < window.end
    ? minute >= window.start && minute < window.end
    : minute >= window.start || minute < window.end
}

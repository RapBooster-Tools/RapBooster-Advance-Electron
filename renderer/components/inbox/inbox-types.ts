import type { IpcRequestInput, IpcResponse } from '@shared/ipc'

export type InboxMessage = IpcResponse<'chat:messages'>['items'][number]
export type InboxChat = IpcResponse<'chat:get'>

type PickFilters = NonNullable<IpcRequestInput<'system:pickFile'>>['filters']

/**
 * Ask the operating system for one file. Resolves to its path, or undefined if
 * the person cancelled; a failure resolves to the message to show them.
 */
export async function pickOneFile(
  title: string,
  filters: PickFilters,
): Promise<{ path?: string; error?: string }> {
  const result = await window.api.invoke('system:pickFile', { title, filters })
  if (!result.ok) return { error: result.error.userMessage }
  return { path: result.data.paths[0] }
}

/** The name shown for a chosen file — never the full path. */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  const mb = bytes / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

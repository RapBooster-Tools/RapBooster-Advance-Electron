/**
 * Group power tools, the member grabber and communities (D89).
 *
 * Split by domain under ./group-tools so no module grows past one concern.
 */
import { registerCommunityHandlers } from './group-tools/communities'
import { registerGroupExportHandlers } from './group-tools/export'
import { registerGroupMemberHandlers } from './group-tools/members'
import { registerGroupSettingHandlers } from './group-tools/settings'

export function registerGroupToolHandlers(): void {
  registerGroupSettingHandlers()
  registerGroupMemberHandlers()
  registerGroupExportHandlers()
  registerCommunityHandlers()
}

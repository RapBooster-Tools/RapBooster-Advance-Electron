/**
 * WhatsApp Business labels mirrored as tags, and business-account detection.
 */
export async function handleLabel(
  deviceId: string,
  label: { labelId: string; name: string; color: number; deleted: boolean },
): Promise<void> {
  void deviceId
  void label
}

export async function handleLabelAssociation(
  deviceId: string,
  association: { labelId: string; chatJid: string; action: 'add' | 'remove' },
): Promise<void> {
  void deviceId
  void association
}

/** Ask WhatsApp whether the device is a Business account and store the answer. */
export async function refreshBusinessStatus(deviceId: string): Promise<void> {
  void deviceId
}

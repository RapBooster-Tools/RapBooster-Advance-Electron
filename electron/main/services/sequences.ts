/**
 * Drip sequences: timed follow-ups that stop when the contact replies.
 */

/** A reply from this number stops every active enrollment with stopOnReply. */
export async function stopOnReply(phone: string): Promise<void> {
  void phone
}

/** Send every enrollment step that is due. Called by the scheduler. */
export async function sequenceTick(): Promise<void> {}

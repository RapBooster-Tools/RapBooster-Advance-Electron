-- A foreign key without its own index: deleting a contact cascaded through a
-- full scan of CampaignRecipient (CLAUDE.md §5.3, index every foreign key).
CREATE INDEX "CampaignRecipient_contactId_idx" ON "CampaignRecipient"("contactId");

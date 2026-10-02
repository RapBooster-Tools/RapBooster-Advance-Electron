-- Marketing suite (IMPROVEMENT-PLAN.md; tracker D89-D90).
--
-- Hand-edited from `prisma migrate diff`. Prisma's diff rebuilt Device, Contact,
-- Campaign, Group and ChatbotConfig (create a copy, copy rows, drop, rename) to
-- add columns. Our migrator runs every script inside a transaction with
-- foreign_keys=ON, where turning foreign keys off is a no-op — so dropping
-- "Device" would have cascade-deleted every chat, message, group and campaign
-- link on upgrade. Those five tables are altered in place instead: every new
-- column is nullable or has a constant default, which is exactly what SQLite's
-- ADD COLUMN supports.

-- AlterTable
ALTER TABLE "Template" ADD COLUMN "extra" TEXT;

-- AlterTable
ALTER TABLE "CampaignRecipient" ADD COLUMN "deliveredAt" DATETIME;
ALTER TABLE "CampaignRecipient" ADD COLUMN "readAt" DATETIME;
ALTER TABLE "CampaignRecipient" ADD COLUMN "repliedAt" DATETIME;

-- AlterTable
ALTER TABLE "Chat" ADD COLUMN "escalatedAt" DATETIME;

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#0078d4',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "waLabelId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ContactTag" (
    "contactId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("contactId", "tagId"),
    CONSTRAINT "ContactTag_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContactTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Suppression" (
    "phone" TEXT NOT NULL PRIMARY KEY,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CampaignTag" (
    "campaignId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'include',

    PRIMARY KEY ("campaignId", "tagId"),
    CONSTRAINT "CampaignTag_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CampaignTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "subscribers" INTEGER NOT NULL DEFAULT 0,
    "inviteCode" TEXT,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Channel_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduledPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "channelId" TEXT,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "mediaPath" TEXT,
    "backgroundColor" TEXT,
    "listIds" TEXT NOT NULL DEFAULT '[]',
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "postedAt" DATETIME,
    "messageId" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduledPost_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduledPost_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KeywordRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "matchType" TEXT NOT NULL DEFAULT 'contains',
    "replyText" TEXT,
    "templateId" TEXT,
    "deviceIds" TEXT NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 10,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KeywordRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KeywordRuleHit" (
    "ruleId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "lastAt" DATETIME NOT NULL,

    PRIMARY KEY ("ruleId", "chatId"),
    CONSTRAINT "KeywordRuleHit_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "KeywordRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL DEFAULT '[]',
    "secret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastStatus" INTEGER,
    "lastError" TEXT,
    "lastDeliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" DATETIME,
    CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "deviceIds" TEXT NOT NULL DEFAULT '[]',
    "stopOnReply" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SequenceStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sequenceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SequenceStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SequenceStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SequenceEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sequenceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "deviceId" TEXT,
    "nextStep" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "stoppedReason" TEXT,
    "lastSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SequenceEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SequenceEnrollment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT,
    "chatId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AiDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    CONSTRAINT "AiDraft_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CallEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "isVideo" BOOLEAN NOT NULL DEFAULT false,
    "rejected" BOOLEAN NOT NULL DEFAULT false,
    "replied" BOOLEAN NOT NULL DEFAULT false,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable (in place; see header)
ALTER TABLE "Device" ADD COLUMN "warmupEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Device" ADD COLUMN "warmupStartedAt" DATETIME;
ALTER TABLE "Device" ADD COLUMN "healthPausedUntil" DATETIME;
ALTER TABLE "Device" ADD COLUMN "healthReason" TEXT;
ALTER TABLE "Device" ADD COLUMN "isBusiness" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contact" ADD COLUMN "waStatus" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "Contact" ADD COLUMN "waCheckedAt" DATETIME;
ALTER TABLE "Campaign" ADD COLUMN "checkNumbers" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Group" ADD COLUMN "isCommunity" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Group" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Group" ADD COLUMN "announce" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Group" ADD COLUMN "restrict" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Group" ADD COLUMN "joinApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChatbotConfig" ADD COLUMN "escalateAfterMessages" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ChatbotConfig" ADD COLUMN "escalateAfterMinutes" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Contact_waStatus_idx" ON "Contact"("waStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "Tag_waLabelId_idx" ON "Tag"("waLabelId");

-- CreateIndex
CREATE INDEX "ContactTag_tagId_idx" ON "ContactTag"("tagId");

-- CreateIndex
CREATE INDEX "CampaignTag_tagId_idx" ON "CampaignTag"("tagId");

-- CreateIndex
CREATE INDEX "Channel_deviceId_idx" ON "Channel"("deviceId");

-- CreateIndex
CREATE INDEX "ScheduledPost_status_scheduledAt_idx" ON "ScheduledPost"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledPost_deviceId_idx" ON "ScheduledPost"("deviceId");

-- CreateIndex
CREATE INDEX "KeywordRule_enabled_priority_idx" ON "KeywordRule"("enabled", "priority");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_idx" ON "WebhookDelivery"("webhookId");

-- CreateIndex
CREATE INDEX "Sequence_status_idx" ON "Sequence"("status");

-- CreateIndex
CREATE INDEX "SequenceStep_templateId_idx" ON "SequenceStep"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceStep_sequenceId_position_key" ON "SequenceStep"("sequenceId", "position");

-- CreateIndex
CREATE INDEX "SequenceEnrollment_status_nextRunAt_idx" ON "SequenceEnrollment"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "SequenceEnrollment_phone_idx" ON "SequenceEnrollment"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceEnrollment_sequenceId_contactId_key" ON "SequenceEnrollment"("sequenceId", "contactId");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_chatId_createdAt_idx" ON "AiUsage"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_deviceId_createdAt_idx" ON "AiUsage"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "AiDraft_status_idx" ON "AiDraft"("status");

-- CreateIndex
CREATE INDEX "AiDraft_chatId_idx" ON "AiDraft"("chatId");

-- CreateIndex
CREATE INDEX "CallEvent_deviceId_at_idx" ON "CallEvent"("deviceId", "at");

-- CreateIndex
CREATE INDEX "CampaignRecipient_messageId_idx" ON "CampaignRecipient"("messageId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_phone_sentAt_idx" ON "CampaignRecipient"("phone", "sentAt");


-- Wave 3: quick replies, chat notes, scheduled messages, chatbot flows,
-- flow sessions, WhatsApp address book; welcome/away markers on Chat.
-- Additive only (D90): new tables and nullable columns, no rebuilds.

-- AlterTable
ALTER TABLE "Chat" ADD COLUMN "lastAwayAt" DATETIME;
ALTER TABLE "Chat" ADD COLUMN "welcomedAt" DATETIME;

-- CreateTable
CREATE TABLE "QuickReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shortcut" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChatNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatNote_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduledMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "mediaPath" TEXT,
    "sendAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "messageId" TEXT,
    "error" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduledMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatbotFlow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trigger" TEXT NOT NULL DEFAULT 'keywords',
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "deviceIds" TEXT NOT NULL DEFAULT '[]',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "graph" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FlowSession" (
    "chatId" TEXT NOT NULL PRIMARY KEY,
    "flowId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "vars" TEXT NOT NULL DEFAULT '{}',
    "expiresAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FlowSession_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FlowSession_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "ChatbotFlow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WaContact" (
    "deviceId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("deviceId", "jid"),
    CONSTRAINT "WaContact_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "QuickReply_shortcut_key" ON "QuickReply"("shortcut");

-- CreateIndex
CREATE INDEX "ChatNote_chatId_createdAt_idx" ON "ChatNote"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduledMessage_status_sendAt_idx" ON "ScheduledMessage"("status", "sendAt");

-- CreateIndex
CREATE INDEX "ScheduledMessage_chatId_idx" ON "ScheduledMessage"("chatId");

-- CreateIndex
CREATE INDEX "ChatbotFlow_enabled_priority_idx" ON "ChatbotFlow"("enabled", "priority");

-- CreateIndex
CREATE INDEX "FlowSession_flowId_idx" ON "FlowSession"("flowId");

-- CreateIndex
CREATE INDEX "FlowSession_expiresAt_idx" ON "FlowSession"("expiresAt");

-- CreateIndex
CREATE INDEX "WaContact_phone_idx" ON "WaContact"("phone");


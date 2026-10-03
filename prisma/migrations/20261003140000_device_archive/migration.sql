-- A removed device that campaign reports still reference is archived, not
-- deleted (D158): hidden, not counted toward the limit, never reconnected.
ALTER TABLE "Device" ADD COLUMN "archivedAt" DATETIME;

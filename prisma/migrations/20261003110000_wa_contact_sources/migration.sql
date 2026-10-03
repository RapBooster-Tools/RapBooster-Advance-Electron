-- The contacts grabber reads chats as well as the address book (Wave 3).
-- Existing rows all came from the address book, hence the default.
ALTER TABLE "WaContact" ADD COLUMN "inAddressBook" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WaContact" ADD COLUMN "hasChat" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WaContact" ADD COLUMN "lastChatAt" DATETIME;

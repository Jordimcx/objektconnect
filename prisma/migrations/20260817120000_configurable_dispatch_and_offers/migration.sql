CREATE TYPE "DispatchStrategy" AS ENUM ('AUTO_ORDER', 'REVIEW_FIRST', 'QUOTE_FIRST');
CREATE TYPE "ProviderRequestType" AS ENUM ('WORK_ORDER', 'QUOTE_REQUEST');
CREATE TYPE "OfferStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

ALTER TYPE "AccessAction" ADD VALUE 'SUBMIT_OFFER';

ALTER TABLE "OrganizationSettings"
ADD COLUMN "dispatchStrategy" "DispatchStrategy" NOT NULL DEFAULT 'AUTO_ORDER';

ALTER TABLE "Ticket"
ADD COLUMN "providerRequestType" "ProviderRequestType" NOT NULL DEFAULT 'WORK_ORDER';

CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "documentId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'SUBMITTED',
    "validUntil" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Offer_documentId_key" ON "Offer"("documentId");
CREATE INDEX "Offer_ticketId_status_createdAt_idx" ON "Offer"("ticketId", "status", "createdAt");
CREATE INDEX "Offer_providerId_status_idx" ON "Offer"("providerId", "status");

ALTER TABLE "Offer" ADD CONSTRAINT "Offer_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

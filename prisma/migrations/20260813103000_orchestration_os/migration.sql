-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('GENERAL', 'DAMAGE_PHOTO', 'BEFORE_PHOTO', 'AFTER_PHOTO', 'WORK_REPORT', 'INVOICE', 'OFFER', 'INSURANCE_PACKAGE');

-- CreateEnum
CREATE TYPE "InvoiceSource" AS ENUM ('MANUAL', 'MICROSOFT_365', 'GOOGLE_WORKSPACE', 'FORWARDING', 'IMAP');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('RECEIVED', 'MATCHED', 'REVIEW_REQUIRED', 'APPROVED', 'REJECTED', 'QUESTION');

-- CreateEnum
CREATE TYPE "InvoiceRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ConnectorType" AS ENUM ('MICROSOFT_365', 'GOOGLE_WORKSPACE', 'FORWARDING', 'IMAP');

-- CreateEnum
CREATE TYPE "ConnectorStatus" AS ENUM ('TEST_MODE', 'CONFIGURED', 'DISABLED');

-- CreateEnum
CREATE TYPE "AccessAction" AS ENUM ('ACCEPT', 'REJECT', 'MESSAGE', 'PROPOSE_APPOINTMENT', 'STATUS_UPDATE', 'COMPLETE_WORK', 'UPLOAD_INVOICE', 'REQUEST_OTP');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'REPLACEMENT_RECOMMENDED', 'RETIRED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'PROVIDER_LINK', 'TENANT_LINK', 'SYSTEM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AppointmentStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "AppointmentStatus" ADD VALUE 'NO_SHOW';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "calendarUid" TEXT,
ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "noShowAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "kind" "DocumentKind" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "appointmentConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "autoQualifiedAt" TIMESTAMP(3),
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "incidentKey" TEXT,
ADD COLUMN     "invoiceMatchedAt" TIMESTAMP(3),
ADD COLUMN     "providerAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "providerRequestedAt" TIMESTAMP(3),
ADD COLUMN     "publicTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "publicTokenHash" TEXT,
ADD COLUMN     "publicTokenRevokedAt" TIMESTAMP(3),
ADD COLUMN     "relatedTicketId" TEXT,
ADD COLUMN     "reopenedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "warrantySuspected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "workStartedAt" TIMESTAMP(3),
ALTER COLUMN "publicToken" DROP NOT NULL;

-- Preserve all existing public links while storing only their SHA-256 hashes.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
UPDATE "Ticket"
SET
    "publicTokenHash" = encode(digest("publicToken", 'sha256'), 'hex'),
    "publicTokenExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '365 days'
WHERE "publicToken" IS NOT NULL;
UPDATE "Ticket" SET "publicToken" = NULL WHERE "publicToken" IS NOT NULL;

-- Backfill stable calendar identifiers and operational milestones.
UPDATE "Appointment"
SET
    "calendarUid" = gen_random_uuid()::text,
    "confirmedAt" = CASE WHEN "status" = 'CONFIRMED' THEN "createdAt" ELSE NULL END;
ALTER TABLE "Appointment" ALTER COLUMN "calendarUid" SET NOT NULL;

UPDATE "Ticket" AS ticket
SET
    "claimedAt" = CASE WHEN ticket."reportedWithoutLogin" = false THEN ticket."createdAt" ELSE NULL END,
    "autoQualifiedAt" = COALESCE(ticket."reviewedAt", ticket."createdAt"),
    "providerRequestedAt" = (
      SELECT MIN(history."createdAt") FROM "StatusHistory" AS history
      WHERE history."ticketId" = ticket."id" AND history."toStatus" = 'DIENSTLEISTER_ANGEFRAGT'
    ),
    "providerAcceptedAt" = (
      SELECT MIN(history."createdAt") FROM "StatusHistory" AS history
      WHERE history."ticketId" = ticket."id" AND history."toStatus" = 'TERMINABSTIMMUNG'
    ),
    "appointmentConfirmedAt" = (
      SELECT MIN(history."createdAt") FROM "StatusHistory" AS history
      WHERE history."ticketId" = ticket."id" AND history."toStatus" = 'TERMIN_BESTAETIGT'
    ),
    "workStartedAt" = (
      SELECT MIN(history."createdAt") FROM "StatusHistory" AS history
      WHERE history."ticketId" = ticket."id" AND history."toStatus" = 'IN_BEARBEITUNG'
    );

UPDATE "Document" AS document
SET "kind" = CASE
  WHEN document."contentType" LIKE 'image/%' AND EXISTS (
    SELECT 1 FROM "Ticket" AS ticket
    WHERE ticket."id" = document."ticketId" AND ticket."completedAt" IS NOT NULL
  ) THEN 'AFTER_PHOTO'::"DocumentKind"
  WHEN document."contentType" LIKE 'image/%' THEN 'DAMAGE_PHOTO'::"DocumentKind"
  ELSE 'GENERAL'::"DocumentKind"
END;

-- CreateTable
CREATE TABLE "OrganizationSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandPrimary" TEXT NOT NULL DEFAULT '#14233C',
    "brandAccent" TEXT NOT NULL DEFAULT '#18B7A0',
    "logoUrl" TEXT,
    "customDomain" TEXT,
    "senderName" TEXT NOT NULL DEFAULT 'ObjektConnect',
    "senderEmail" TEXT,
    "enabledModules" JSONB NOT NULL,
    "requiredFields" JSONB NOT NULL,
    "labels" JSONB NOT NULL,
    "communicationChannels" JSONB NOT NULL,
    "defaultCostLimit" DECIMAL(10,2) NOT NULL DEFAULT 250,
    "highCostThreshold" DECIMAL(10,2) NOT NULL DEFAULT 1000,
    "providerResponseHours" INTEGER NOT NULL DEFAULT 24,
    "appointmentReminderHours" INTEGER NOT NULL DEFAULT 24,
    "requireProviderOtpCompletion" BOOLEAN NOT NULL DEFAULT false,
    "autopilotEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundConnector" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "ConnectorType" NOT NULL,
    "status" "ConnectorStatus" NOT NULL DEFAULT 'TEST_MODE',
    "displayName" TEXT NOT NULL,
    "inboundAddress" TEXT,
    "config" JSONB NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundConnector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderAccess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdById" TEXT,
    "tokenHash" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "allowedActions" "AccessAction"[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessEvent" (
    "id" TEXT NOT NULL,
    "accessId" TEXT NOT NULL,
    "action" "AccessAction" NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantActivationToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantActivationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "providerId" TEXT,
    "documentId" TEXT,
    "reviewedById" TEXT,
    "source" "InvoiceSource" NOT NULL DEFAULT 'MANUAL',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'RECEIVED',
    "risk" "InvoiceRisk" NOT NULL DEFAULT 'MEDIUM',
    "invoiceNumber" TEXT,
    "supplierName" TEXT,
    "amount" DECIMAL(10,2),
    "issuedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "extractedData" JSONB NOT NULL,
    "checks" JSONB NOT NULL,
    "recommendation" TEXT NOT NULL,
    "matchedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialEntry" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'Stk.',
    "unitCost" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "installedAt" TIMESTAMP(3),
    "warrantyUntil" TIMESTAMP(3),
    "lastServiceAt" TIMESTAMP(3),
    "replacementThreshold" DECIMAL(10,2),
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT,
    "actorUserId" TEXT,
    "actorType" "AuditActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ticketId" TEXT,
    "recipient" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "calendarContent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TEST_MODE',
    "idempotencyKey" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- Create a configurable, shared tenant setup for every existing organization.
INSERT INTO "OrganizationSettings" (
  "id", "organizationId", "enabledModules", "requiredFields", "labels", "communicationChannels", "senderEmail", "createdAt", "updatedAt"
)
SELECT
  'settings_' || md5(organization."id"),
  organization."id",
  '{"tickets":true,"appointments":true,"documents":true,"invoices":true,"assets":true,"analytics":true}'::jsonb,
  '{"title":true,"description":true,"room":true,"preferredWindows":true,"damagePhoto":false}'::jsonb,
  '{"tenant":"Mieter","provider":"Dienstleister","ticket":"Vorgang"}'::jsonb,
  '{"app":true,"email":true,"push":false,"sms":false}'::jsonb,
  'verwaltung@objektconnect.de',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" AS organization
;

INSERT INTO "InboundConnector" (
  "id", "organizationId", "type", "status", "displayName", "inboundAddress", "config", "createdAt", "updatedAt"
)
SELECT
  'connector_' || md5(organization."id" || connector.type::text),
  organization."id",
  connector.type,
  'TEST_MODE'::"ConnectorStatus",
  connector.label,
  CASE WHEN connector.type = 'FORWARDING'::"ConnectorType" THEN 'rechnung+' || substring(md5(organization."id") from 1 for 8) || '@inbox.objektconnect.local' ELSE NULL END,
  '{"mode":"local-test","privateCalendarContent":false}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" AS organization
CROSS JOIN (VALUES
  ('MICROSOFT_365'::"ConnectorType", 'Microsoft 365'),
  ('GOOGLE_WORKSPACE'::"ConnectorType", 'Google Workspace'),
  ('FORWARDING'::"ConnectorType", 'Rechnungs-Weiterleitung'),
  ('IMAP'::"ConnectorType", 'IMAP-Fallback')
) AS connector(type, label)
;

INSERT INTO "AutomationRule" (
  "id", "organizationId", "name", "trigger", "action", "conditions", "enabled", "priority", "createdAt", "updatedAt"
)
SELECT
  'rule_' || md5(organization."id" || rule.action),
  organization."id",
  rule.name,
  rule.trigger,
  rule.action,
  rule.conditions::jsonb,
  true,
  rule.priority,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" AS organization
CROSS JOIN (VALUES
  ('Routinefälle automatisch weiterleiten', 'TICKET_QUALIFIED', 'AUTO_DISPATCH', '{"maxPriority":"NORMAL","requiresCompleteData":true}', 10),
  ('Notfälle immer manuell prüfen', 'TICKET_QUALIFIED', 'MANUAL_REVIEW', '{"priority":"NOTFALL"}', 1),
  ('Ersatzbetrieb nach Reaktionsfrist', 'PROVIDER_RESPONSE_OVERDUE', 'REASSIGN_PROVIDER', '{"useOrganizationResponseHours":true}', 20),
  ('Wiederholungsfall als Gewährleistung prüfen', 'REPEAT_DAMAGE', 'FLAG_WARRANTY', '{"withinDays":180}', 15),
  ('Sammelstörung erkennen', 'SIMILAR_REPORTS', 'CREATE_INCIDENT', '{"withinHours":48,"minimumReports":2}', 15),
  ('Mieterbestätigung anfordern', 'WORK_APPROVED', 'REQUEST_TENANT_CONFIRMATION', '{"channels":["app","email"]}', 30)
) AS rule(name, trigger, action, conditions, priority)
ON CONFLICT DO NOTHING;

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSettings_organizationId_key" ON "OrganizationSettings"("organizationId");

-- CreateIndex
CREATE INDEX "AutomationRule_organizationId_enabled_priority_idx" ON "AutomationRule"("organizationId", "enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "InboundConnector_organizationId_type_key" ON "InboundConnector"("organizationId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAccess_tokenHash_key" ON "ProviderAccess"("tokenHash");

-- CreateIndex
CREATE INDEX "ProviderAccess_ticketId_expiresAt_idx" ON "ProviderAccess"("ticketId", "expiresAt");

-- CreateIndex
CREATE INDEX "ProviderAccess_providerId_revokedAt_idx" ON "ProviderAccess"("providerId", "revokedAt");

-- CreateIndex
CREATE INDEX "AccessEvent_accessId_createdAt_idx" ON "AccessEvent"("accessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenantActivationToken_tokenHash_key" ON "TenantActivationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TenantActivationToken_userId_expiresAt_idx" ON "TenantActivationToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_documentId_key" ON "Invoice"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_idempotencyKey_key" ON "Invoice"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_status_risk_idx" ON "Invoice"("organizationId", "status", "risk");

-- CreateIndex
CREATE INDEX "Invoice_ticketId_createdAt_idx" ON "Invoice"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_providerId_invoiceNumber_idx" ON "Invoice"("providerId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "MaterialEntry_ticketId_idx" ON "MaterialEntry"("ticketId");

-- CreateIndex
CREATE INDEX "Asset_organizationId_propertyId_category_idx" ON "Asset"("organizationId", "propertyId", "category");

-- CreateIndex
CREATE INDEX "Asset_warrantyUntil_idx" ON "Asset"("warrantyUntil");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_ticketId_createdAt_idx" ON "AuditLog"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_idempotencyKey_key" ON "OutboundMessage"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OutboundMessage_organizationId_status_scheduledAt_idx" ON "OutboundMessage"("organizationId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_ticketId_idx" ON "OutboundMessage"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_calendarUid_key" ON "Appointment"("calendarUid");

-- CreateIndex
CREATE INDEX "Document_organizationId_kind_idx" ON "Document"("organizationId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_publicTokenHash_key" ON "Ticket"("publicTokenHash");

-- CreateIndex
CREATE INDEX "Ticket_incidentKey_idx" ON "Ticket"("incidentKey");

-- CreateIndex
CREATE INDEX "Ticket_relatedTicketId_idx" ON "Ticket"("relatedTicketId");

-- CreateIndex
CREATE INDEX "Ticket_assetId_idx" ON "Ticket"("assetId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_relatedTicketId_fkey" FOREIGN KEY ("relatedTicketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundConnector" ADD CONSTRAINT "InboundConnector_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAccess" ADD CONSTRAINT "ProviderAccess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAccess" ADD CONSTRAINT "ProviderAccess_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAccess" ADD CONSTRAINT "ProviderAccess_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAccess" ADD CONSTRAINT "ProviderAccess_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_accessId_fkey" FOREIGN KEY ("accessId") REFERENCES "ProviderAccess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantActivationToken" ADD CONSTRAINT "TenantActivationToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantActivationToken" ADD CONSTRAINT "TenantActivationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialEntry" ADD CONSTRAINT "MaterialEntry_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

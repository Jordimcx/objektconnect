CREATE TYPE "ReportChannel" AS ENUM ('PORTAL', 'PUBLIC_LINK', 'QR_CODE', 'EMAIL', 'PHONE');

ALTER TABLE "Unit" ADD COLUMN "reportingCode" TEXT;
UPDATE "Unit"
SET "reportingCode" = 'OC-' || UPPER(SUBSTRING(MD5("id") FROM 1 FOR 8));
ALTER TABLE "Unit" ALTER COLUMN "reportingCode" SET NOT NULL;
CREATE UNIQUE INDEX "Unit_reportingCode_key" ON "Unit"("reportingCode");

ALTER TABLE "Ticket"
  ADD COLUMN "publicToken" TEXT,
  ADD COLUMN "source" "ReportChannel" NOT NULL DEFAULT 'PORTAL',
  ADD COLUMN "reportedWithoutLogin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reporterName" TEXT,
  ADD COLUMN "reporterEmail" TEXT,
  ADD COLUMN "reporterPhone" TEXT,
  ADD COLUMN "approvedCostLimit" DECIMAL(10,2),
  ADD COLUMN "reviewRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "reviewReason" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "autoDispatchedAt" TIMESTAMP(3),
  ADD COLUMN "costApprovedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "tenantConfirmedAt" TIMESTAMP(3);

UPDATE "Ticket"
SET
  "publicToken" = MD5("id" || '-' || "number"),
  "reviewRequired" = CASE
    WHEN "status"::text IN ('PRUEFUNG_ERFORDERLICH', 'RUECKFRAGE_AN_MIETER', 'WARTEN_AUF_FREIGABE', 'WARTEN_AUF_MATERIAL')
      OR "priority"::text = 'NOTFALL'
    THEN true
    ELSE false
  END,
  "reviewReason" = CASE
    WHEN "priority"::text = 'NOTFALL' THEN 'Notfall mit manueller Einsatzkontrolle'
    WHEN "status"::text = 'WARTEN_AUF_FREIGABE' THEN 'Kostenfreigabe erforderlich'
    WHEN "status"::text = 'WARTEN_AUF_MATERIAL' THEN 'Material oder Folgetermin ausstehend'
    WHEN "status"::text IN ('PRUEFUNG_ERFORDERLICH', 'RUECKFRAGE_AN_MIETER') THEN 'Manuelle Prüfung erforderlich'
    ELSE NULL
  END,
  "reviewedAt" = CASE
    WHEN "status"::text IN ('PRUEFUNG_ERFORDERLICH', 'RUECKFRAGE_AN_MIETER', 'WARTEN_AUF_FREIGABE', 'WARTEN_AUF_MATERIAL')
      OR "priority"::text = 'NOTFALL'
    THEN NULL
    ELSE "createdAt"
  END,
  "completedAt" = CASE WHEN "status"::text IN ('ERLEDIGT', 'VOM_MIETER_BESTAETIGT', 'ABGESCHLOSSEN') THEN "updatedAt" ELSE NULL END,
  "tenantConfirmedAt" = CASE WHEN "status"::text IN ('VOM_MIETER_BESTAETIGT', 'ABGESCHLOSSEN') THEN "updatedAt" ELSE NULL END;
ALTER TABLE "Ticket" ALTER COLUMN "publicToken" SET NOT NULL;

CREATE UNIQUE INDEX "Ticket_publicToken_key" ON "Ticket"("publicToken");
CREATE INDEX "Ticket_organizationId_reviewRequired_idx" ON "Ticket"("organizationId", "reviewRequired");

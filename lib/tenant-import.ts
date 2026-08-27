import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export type TenantImportRow = {
  name: string;
  email: string;
  phone?: string;
  propertyName: string;
  unitLabel: string;
  startsAt?: string;
};

export type TenantImportResult = {
  created: number;
  skipped: Array<{ row: number; reason: string }>;
  createdTenants: Array<{ name: string; email: string; propertyName: string; unitLabel: string }>;
};

// Standard CSV parser (comma-separated, "quoted values with, commas" supported).
// Handles CR/LF line endings and empty trailing lines. Not full RFC 4180 (no
// escaped quotes inside quoted values) — that's not needed for tenant lists.
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inQuotes) {
      if (char === "\"") inQuotes = false;
      else field += char;
      continue;
    }
    if (char === "\"") { inQuotes = true; continue; }
    if (char === ",") { current.push(field); field = ""; continue; }
    if (char === "\n" || char === "\r") {
      if (field.length || current.length) { current.push(field); rows.push(current); current = []; field = ""; }
      if (char === "\r" && input[i + 1] === "\n") i++;
      continue;
    }
    field += char;
  }
  if (field.length || current.length) { current.push(field); rows.push(current); }
  return rows.filter((row) => row.some((cell) => cell.trim().length));
}

// Maps common German+English header variants to the canonical field names, so
// a copy-paste from Excel with any of "E-Mail" / "Email" / "email" all works.
const HEADER_ALIASES: Record<string, keyof TenantImportRow> = {
  name: "name",
  "vor- und nachname": "name",
  "vor und nachname": "name",
  email: "email",
  "e-mail": "email",
  mail: "email",
  phone: "phone",
  telefon: "phone",
  tel: "phone",
  "property name": "propertyName",
  objekt: "propertyName",
  property: "propertyName",
  liegenschaft: "propertyName",
  "unit label": "unitLabel",
  einheit: "unitLabel",
  wohnung: "unitLabel",
  unit: "unitLabel",
  "starts at": "startsAt",
  beginn: "startsAt",
  mietbeginn: "startsAt"
};

export function parseTenantCsv(input: string): { rows: TenantImportRow[]; errors: Array<{ row: number; reason: string }> } {
  const parsed = parseCsv(input);
  const errors: Array<{ row: number; reason: string }> = [];
  if (!parsed.length) return { rows: [], errors: [{ row: 0, reason: "Datei ist leer oder ohne Kopfzeile." }] };
  const headers = parsed[0].map((cell) => cell.trim().toLowerCase());
  const mapped = headers.map((header) => HEADER_ALIASES[header]);
  const rows: TenantImportRow[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const raw = parsed[i];
    const record: Partial<TenantImportRow> = {};
    for (let c = 0; c < raw.length; c++) {
      const field = mapped[c];
      if (!field) continue;
      const value = raw[c].trim();
      if (value) record[field] = value;
    }
    if (!record.name || !record.email || !record.propertyName || !record.unitLabel) {
      errors.push({ row: i + 1, reason: "Pflichtfelder fehlen (Name, E-Mail, Objekt, Einheit)." });
      continue;
    }
    if (!record.email.includes("@")) {
      errors.push({ row: i + 1, reason: `Ungültige E-Mail: ${record.email}` });
      continue;
    }
    rows.push(record as TenantImportRow);
  }
  return { rows, errors };
}

export async function importTenants(
  organizationId: string,
  rows: TenantImportRow[]
): Promise<TenantImportResult> {
  const skipped: TenantImportResult["skipped"] = [];
  const createdTenants: TenantImportResult["createdTenants"] = [];
  let created = 0;

  const properties = await prisma.property.findMany({
    where: { organizationId },
    include: { buildings: { include: { units: true } } }
  });

  // Build once: property-name → units keyed by their label (case-insensitive).
  const propertyIndex = new Map<
    string,
    { propertyId: string; propertyName: string; units: Map<string, { id: string }> }
  >();
  for (const property of properties) {
    const units = new Map<string, { id: string }>();
    for (const building of property.buildings) {
      for (const unit of building.units) units.set(unit.label.toLowerCase(), { id: unit.id });
    }
    propertyIndex.set(property.name.toLowerCase(), {
      propertyId: property.id,
      propertyName: property.name,
      units
    });
  }

  const randomPassword = await bcrypt.hash(`import-${Date.now()}-${Math.random().toString(36).slice(2)}`, 12);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2;
    const propertyMatch = propertyIndex.get(row.propertyName.toLowerCase());
    if (!propertyMatch) {
      skipped.push({ row: rowNumber, reason: `Objekt "${row.propertyName}" nicht gefunden.` });
      continue;
    }
    const unitMatch = propertyMatch.units.get(row.unitLabel.toLowerCase());
    if (!unitMatch) {
      skipped.push({ row: rowNumber, reason: `Einheit "${row.unitLabel}" in ${propertyMatch.propertyName} nicht gefunden.` });
      continue;
    }
    const existing = await prisma.user.findUnique({ where: { email: row.email } });
    if (existing) {
      skipped.push({ row: rowNumber, reason: `E-Mail ${row.email} ist bereits vergeben.` });
      continue;
    }
    const startsAt = row.startsAt ? new Date(row.startsAt) : new Date();
    if (Number.isNaN(startsAt.getTime())) {
      skipped.push({ row: rowNumber, reason: `Ungültiges Startdatum: ${row.startsAt}` });
      continue;
    }
    try {
      await prisma.$transaction(async (tx) => {
        const tenant = await tx.user.create({
          data: {
            organizationId,
            name: row.name,
            email: row.email.toLowerCase(),
            phone: row.phone ?? null,
            passwordHash: randomPassword,
            role: "MIETER"
          }
        });
        await tx.lease.create({
          data: { tenantId: tenant.id, unitId: unitMatch.id, startsAt }
        });
      });
      created++;
      createdTenants.push({
        name: row.name,
        email: row.email,
        propertyName: propertyMatch.propertyName,
        unitLabel: row.unitLabel
      });
    } catch (error) {
      skipped.push({ row: rowNumber, reason: error instanceof Error ? error.message : "Unbekannter Fehler." });
    }
  }

  return { created, skipped, createdTenants };
}

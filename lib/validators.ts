import { ProviderRequestType, TicketCategory, TicketPriority, TicketStatus } from "@prisma/client";
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Bitte eine gültige E-Mail-Adresse eingeben."),
  password: z.string().min(1, "Bitte das Passwort eingeben.")
});

export const ticketCreateSchema = z.object({
  title: z.string().min(4, "Bitte das Problem kurz benennen."),
  description: z.string().min(20, "Bitte beschreiben Sie den Schaden etwas genauer."),
  room: z.string().min(2, "Bitte geben Sie den betroffenen Raum an."),
  category: z.enum(TicketCategory),
  priority: z.enum(TicketPriority),
  preferredWindows: z.array(z.string().min(3)).min(1, "Bitte mindestens ein Terminfenster angeben.")
});

export const publicTicketCreateSchema = z.object({
  reportingCode: z.string().trim().min(4, "Bitte den Objektcode eingeben.").max(40),
  reporterName: z.string().trim().min(2, "Bitte Ihren Namen eingeben.").max(120),
  reporterEmail: z.string().trim().email("Bitte eine gültige E-Mail-Adresse eingeben."),
  reporterPhone: z.string().trim().min(6, "Bitte eine erreichbare Telefonnummer eingeben.").max(40),
  title: z.string().trim().min(4, "Bitte das Problem kurz benennen.").max(160),
  description: z.string().trim().min(20, "Bitte beschreiben Sie den Schaden etwas genauer.").max(3000),
  room: z.string().trim().min(2, "Bitte geben Sie den betroffenen Ort an.").max(120),
  preferredWindows: z.array(z.string().trim().min(3)).min(1, "Bitte mindestens ein Terminfenster angeben.").max(3)
});

export const messageSchema = z.object({
  ticketId: z.string().min(1),
  body: z.string().min(2, "Bitte eine Nachricht eingeben.").max(2000)
});

export const internalNoteSchema = messageSchema;

export const assignTicketSchema = z.object({
  ticketId: z.string().min(1),
  providerId: z.string().min(1),
  priority: z.enum(TicketPriority),
  approvedCostLimit: z.coerce.number().min(0).max(999999),
  requestType: z.enum(ProviderRequestType),
  note: z.string().max(500).optional()
});

export const statusUpdateSchema = z.object({
  ticketId: z.string().min(1),
  status: z.enum(TicketStatus),
  note: z.string().max(800).optional()
});

export const appointmentSchema = z.object({
  ticketId: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  note: z.string().max(500).optional()
});

export const completionSchema = z.object({
  ticketId: z.string().min(1),
  completionReport: z.string().min(10, "Bitte einen kurzen Arbeitsbericht erfassen."),
  workHours: z.coerce.number().min(0).max(999),
  finalCost: z.coerce.number().min(0).max(999999)
});

export const costApprovalSchema = z.object({
  ticketId: z.string().min(1),
  approvedCostLimit: z.coerce.number().min(0).max(999999),
  note: z.string().trim().max(500).optional()
});

export const feedbackSchema = z.object({
  ticketId: z.string().min(1),
  score: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(800).optional()
});

export const publicFeedbackSchema = feedbackSchema.omit({ ticketId: true }).extend({
  token: z.string().min(16)
});

export const providerAccessDecisionSchema = z.object({
  token: z.string().min(20),
  accepted: z.coerce.boolean(),
  reason: z.string().trim().max(500).optional()
});

export const providerAccessMessageSchema = z.object({
  token: z.string().min(20),
  body: z.string().trim().min(2, "Bitte eine Nachricht eingeben.").max(2000)
});

export const providerOfferSchema = z.object({
  token: z.string().min(20),
  amount: z.coerce.number().positive("Bitte einen Angebotsbetrag angeben.").max(999999),
  description: z.string().trim().min(10, "Bitte Leistung und Umfang kurz beschreiben.").max(3000),
  validUntil: z.string().trim().optional()
});

export const providerAccountOfferSchema = providerOfferSchema.omit({ token: true }).extend({
  ticketId: z.string().min(1)
});

export const providerAccessCompletionSchema = z.object({
  token: z.string().min(20),
  completionReport: z.string().trim().min(10, "Bitte einen aussagekräftigen Arbeitsbericht erfassen.").max(5000),
  workHours: z.coerce.number().min(0).max(999),
  finalCost: z.coerce.number().min(0).max(999999),
  materialDescription: z.string().trim().max(500).optional(),
  materialQuantity: z.coerce.number().min(0).max(99999).optional(),
  materialUnitCost: z.coerce.number().min(0).max(999999).optional(),
  invoiceNumber: z.string().trim().max(120).optional(),
  supplierName: z.string().trim().max(200).optional(),
  invoiceAmount: z.coerce.number().min(0).max(999999).optional(),
  otp: z.string().trim().max(12).optional()
});

export const organizationSettingsSchema = z.object({
  brandPrimary: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Bitte eine sechsstellige Hex-Farbe angeben."),
  brandAccent: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Bitte eine sechsstellige Hex-Farbe angeben."),
  logoUrl: z.string().trim().max(500).optional(),
  customDomain: z.string().trim().max(200).optional(),
  senderName: z.string().trim().min(2).max(120),
  senderEmail: z.union([z.string().trim().email(), z.literal("")]).optional(),
  defaultCostLimit: z.coerce.number().min(0).max(999999),
  highCostThreshold: z.coerce.number().min(0).max(999999),
  providerResponseHours: z.coerce.number().int().min(1).max(168),
  appointmentReminderHours: z.coerce.number().int().min(1).max(168),
  requireProviderOtpCompletion: z.coerce.boolean(),
  autopilotEnabled: z.coerce.boolean(),
  dispatchStrategy: z.enum(["AUTO_ORDER", "REVIEW_FIRST", "QUOTE_FIRST"])
});

export const organizationMasterDataSchema = z.object({
  name: z.string().trim().min(2, "Bitte den Namen der Verwaltung eingeben.").max(160),
  claim: z.string().trim().min(2, "Bitte einen kurzen Absendertext eingeben.").max(180),
  senderName: z.string().trim().min(2, "Bitte den Absendernamen eingeben.").max(120),
  senderEmail: z.string().trim().email("Bitte eine gültige Absender-E-Mail eingeben.")
});

export const propertyOnboardingSchema = z.object({
  name: z.string().trim().min(2, "Bitte eine Objektbezeichnung eingeben.").max(160),
  address: z.string().trim().min(5, "Bitte die vollständige Objektadresse eingeben.").max(240),
  buildingName: z.string().trim().min(1, "Bitte das Gebäude benennen.").max(120),
  contactName: z.string().trim().min(2, "Bitte einen Ansprechpartner eingeben.").max(120),
  contactEmail: z.string().trim().email("Bitte eine gültige Kontakt-E-Mail eingeben.")
});

export const unitOnboardingSchema = z.object({
  buildingId: z.string().min(1, "Bitte ein Gebäude auswählen."),
  label: z.string().trim().min(1, "Bitte die Wohneinheit benennen.").max(120),
  floor: z.string().trim().min(1, "Bitte die Etage eingeben.").max(60),
  rooms: z.coerce.number().int().min(1, "Mindestens ein Zimmer ist erforderlich.").max(30),
  squareMeter: z.coerce.number().int().min(1, "Bitte die Wohnfläche eingeben.").max(10000)
});

export const tenantOnboardingSchema = z.object({
  name: z.string().trim().min(2, "Bitte den Namen des Mieters eingeben.").max(160),
  email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse eingeben."),
  phone: z.string().trim().min(6, "Bitte eine erreichbare Telefonnummer eingeben.").max(40),
  unitId: z.string().min(1, "Bitte eine freie Wohneinheit auswählen."),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte einen gültigen Mietbeginn eingeben.")
});

export const providerOnboardingSchema = z.object({
  companyName: z.string().trim().min(2, "Bitte den Firmennamen eingeben.").max(180),
  contactName: z.string().trim().min(2, "Bitte einen Ansprechpartner eingeben.").max(160),
  email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse eingeben."),
  phone: z.string().trim().min(6, "Bitte eine erreichbare Telefonnummer eingeben.").max(40),
  address: z.string().trim().min(5, "Bitte die Geschäftsadresse eingeben.").max(240),
  serviceArea: z.string().trim().min(2, "Bitte das Einsatzgebiet eingeben.").max(160),
  availability: z.string().trim().min(2, "Bitte die Erreichbarkeit eingeben.").max(160),
  categories: z.array(z.enum(TicketCategory)).min(1, "Bitte mindestens ein Gewerk auswählen."),
  propertyIds: z.array(z.string().min(1)).max(250)
});

export const assetCreateSchema = z.object({
  propertyId: z.string().min(1),
  unitId: z.string().optional(),
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(120),
  manufacturer: z.string().trim().max(120).optional(),
  model: z.string().trim().max(120).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  installedAt: z.string().optional(),
  warrantyUntil: z.string().optional(),
  replacementThreshold: z.coerce.number().min(0).max(999999).optional(),
  notes: z.string().trim().max(1000).optional()
});

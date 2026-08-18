import { TicketCategory, TicketPriority, TicketStatus } from "@prisma/client";
import { CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS } from "@/lib/constants";

const categoryRules: Array<{ category: TicketCategory; terms: string[] }> = [
  { category: "WASSER", terms: ["wasser", "rohr", "leck", "läuft", "decke tropft", "überschwemmung"] },
  { category: "HEIZUNG", terms: ["heizung", "kalt", "thermostat", "radiator"] },
  { category: "ELEKTRIK", terms: ["strom", "steckdose", "licht", "sicherung", "elektrik"] },
  { category: "SANITAER", terms: ["toilette", "wc", "waschbecken", "dusche", "abfluss"] },
  { category: "SCHIMMEL", terms: ["schimmel", "feucht", "sporen"] },
  { category: "FENSTER_TUEREN", terms: ["fenster", "tür", "schloss", "griff"] },
  { category: "AUFZUG", terms: ["aufzug", "fahrstuhl"] },
  { category: "REINIGUNG", terms: ["reinigung", "müll", "verschmutzt"] },
  { category: "AUSSENANLAGE", terms: ["garten", "hof", "außen", "weg", "zaun"] }
];

const emergencyTerms = ["stark", "läuft", "brand", "rauch", "kein strom", "überschwemmung", "notfall", "gas", "decke"];
const highTerms = ["dringend", "ausfall", "kein warmwasser", "defekt", "sicherung"];

export type TicketSuggestion = {
  category: TicketCategory;
  priority: TicketPriority;
  recommendation: string;
  missingFields: string[];
};

export function suggestCategory(description: string): TicketCategory {
  const lower = description.toLowerCase();
  return categoryRules.find((rule) => rule.terms.some((term) => lower.includes(term)))?.category ?? "SONSTIGES";
}

export function suggestPriority(description: string): TicketPriority {
  const lower = description.toLowerCase();
  if (emergencyTerms.some((term) => lower.includes(term))) return "NOTFALL";
  if (highTerms.some((term) => lower.includes(term))) return "HOCH";
  return "NORMAL";
}

export function detectMissingFields(input: {
  title?: string | null;
  description?: string | null;
  room?: string | null;
  preferredWindows?: string[] | null;
}) {
  const missing: string[] = [];
  if (!input.title?.trim()) missing.push("Problem kurz benennen");
  if (!input.room?.trim()) missing.push("Betroffenen Raum angeben");
  if (!input.description || input.description.trim().length < 20) missing.push("Beschreibung genauer ausfüllen");
  if (!input.preferredWindows?.length) missing.push("Terminfenster ergänzen");
  return missing;
}

export function createTicketSuggestion(input: {
  title?: string | null;
  description: string;
  room?: string | null;
  preferredWindows?: string[] | null;
}): TicketSuggestion {
  const category = suggestCategory(input.description);
  const priority = suggestPriority(input.description);
  const recommendation =
    category === "WASSER" && priority === "NOTFALL"
      ? "Systemempfehlung: sofort Sanitär-Notdienst zuweisen und Mieter aktiv informieren."
      : priority === "NOTFALL"
        ? "Systemempfehlung: sofort prüfen und bevorzugt verfügbaren Dienstleister zuweisen."
        : "Systemempfehlung: Angaben prüfen und passenden Dienstleister nach Gewerk auswählen.";

  return {
    category,
    priority,
    recommendation,
    missingFields: detectMissingFields(input)
  };
}

export function summarizeTicket(input: {
  number: string;
  title: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  propertyName: string;
  tenantName: string;
}) {
  return `${input.number}: ${input.title} bei ${input.propertyName}. Kategorie ${CATEGORY_LABELS[input.category]}, Priorität ${PRIORITY_LABELS[input.priority]}, Status ${STATUS_LABELS[input.status]}. Zuständig: ${input.tenantName} als Mieterkontakt.`;
}

export function nextBestAction(input: {
  status: TicketStatus;
  assignedProviderId?: string | null;
  appointmentAt?: Date | string | null;
}) {
  if (!input.assignedProviderId) return "Passenden Dienstleister zuweisen";
  if (input.status === "DIENSTLEISTER_ANGEFRAGT") return "Rückmeldung des Dienstleisters prüfen";
  if (!input.appointmentAt && input.status === "TERMINABSTIMMUNG") return "Termin bestätigen lassen";
  if (input.status === "ERLEDIGT") return "Mieter um Erledigungsbestätigung bitten";
  if (input.status === "VOM_MIETER_BESTAETIGT") return "Ticket abschließen und archivieren";
  return "Status aktuell halten und Nachrichten prüfen";
}

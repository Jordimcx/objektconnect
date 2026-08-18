import { Role, TicketPriority, TicketStatus } from "@prisma/client";

export const workflowTransitions: Record<TicketStatus, TicketStatus[]> = {
  NEU: ["PRUEFUNG_ERFORDERLICH", "RUECKFRAGE_AN_MIETER", "FREIGEGEBEN", "ABGELEHNT"],
  PRUEFUNG_ERFORDERLICH: ["RUECKFRAGE_AN_MIETER", "FREIGEGEBEN", "DIENSTLEISTER_ANGEFRAGT", "ABGELEHNT"],
  RUECKFRAGE_AN_MIETER: ["PRUEFUNG_ERFORDERLICH", "FREIGEGEBEN"],
  FREIGEGEBEN: ["DIENSTLEISTER_ANGEFRAGT", "ABGELEHNT"],
  DIENSTLEISTER_ANGEFRAGT: ["TERMINABSTIMMUNG", "PRUEFUNG_ERFORDERLICH", "ABGELEHNT"],
  TERMINABSTIMMUNG: ["TERMIN_BESTAETIGT", "RUECKFRAGE_AN_MIETER", "ABGELEHNT"],
  TERMIN_BESTAETIGT: ["IN_BEARBEITUNG", "WARTEN_AUF_MATERIAL"],
  IN_BEARBEITUNG: ["WARTEN_AUF_MATERIAL", "WARTEN_AUF_FREIGABE", "ERLEDIGT"],
  WARTEN_AUF_MATERIAL: ["IN_BEARBEITUNG", "WARTEN_AUF_FREIGABE"],
  WARTEN_AUF_FREIGABE: ["IN_BEARBEITUNG", "ERLEDIGT"],
  ERLEDIGT: ["VOM_MIETER_BESTAETIGT", "WARTEN_AUF_FREIGABE"],
  VOM_MIETER_BESTAETIGT: ["ABGESCHLOSSEN"],
  ABGESCHLOSSEN: [],
  ABGELEHNT: ["PRUEFUNG_ERFORDERLICH"]
};

export function canTransition(from: TicketStatus, to: TicketStatus) {
  return workflowTransitions[from].includes(to);
}

export function canAssignTicket(role: Role) {
  return role === "HAUSVERWALTER";
}

export function canAcceptAssignment(role: Role, hasAssignedProvider: boolean) {
  return role === "DIENSTLEISTER" && hasAssignedProvider;
}

export function canConfirmAppointment(role: Role) {
  return role === "MIETER";
}

export function canCloseAfterTenantConfirmation(status: TicketStatus, role: Role) {
  return role === "HAUSVERWALTER" && status === "VOM_MIETER_BESTAETIGT";
}

export function dueDateForPriority(priority: TicketPriority, from = new Date()) {
  const date = new Date(from);
  const days = priority === "NOTFALL" ? 1 : priority === "HOCH" ? 3 : priority === "NORMAL" ? 10 : 21;
  date.setDate(date.getDate() + days);
  return date;
}

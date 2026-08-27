import {
  NotificationType,
  Role,
  TicketCategory,
  TicketPriority,
  TicketStatus
} from "@prisma/client";

export const ROLE_LABELS: Record<Role, string> = {
  HAUSVERWALTER: "Hausverwalter",
  MIETER: "Mieter",
  DIENSTLEISTER: "Dienstleister"
};

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  HEIZUNG: "Heizung",
  WASSER: "Wasser",
  ELEKTRIK: "Elektrik",
  SANITAER: "Sanitär",
  FENSTER_TUEREN: "Fenster und Türen",
  SCHIMMEL: "Schimmel",
  AUFZUG: "Aufzug",
  ALLGEMEINE_REPARATUR: "Allgemeine Reparatur",
  REINIGUNG: "Reinigung",
  AUSSENANLAGE: "Außenanlage",
  SONSTIGES: "Sonstiges"
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  NIEDRIG: "Niedrig",
  NORMAL: "Normal",
  HOCH: "Hoch",
  NOTFALL: "Notfall"
};

export const PRIORITY_STYLES: Record<TicketPriority, string> = {
  NIEDRIG: "bg-slate-100 text-slate-700 border-slate-200",
  NORMAL: "bg-sky-50 text-sky-700 border-sky-200",
  HOCH: "bg-amber-50 text-amber-800 border-amber-200",
  NOTFALL: "bg-red-50 text-red-700 border-red-200"
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  NEU: "Neu",
  PRUEFUNG_ERFORDERLICH: "Prüfung erforderlich",
  RUECKFRAGE_AN_MIETER: "Rückfrage an Mieter",
  FREIGEGEBEN: "Freigegeben",
  DIENSTLEISTER_ANGEFRAGT: "Dienstleister angefragt",
  TERMINABSTIMMUNG: "Terminabstimmung",
  TERMIN_BESTAETIGT: "Termin bestätigt",
  IN_BEARBEITUNG: "In Bearbeitung",
  WARTEN_AUF_MATERIAL: "Warten auf Material",
  WARTEN_AUF_FREIGABE: "Warten auf Freigabe",
  ERLEDIGT: "Erledigt",
  VOM_MIETER_BESTAETIGT: "Vom Mieter bestätigt",
  ABGESCHLOSSEN: "Abgeschlossen",
  ABGELEHNT: "Abgelehnt"
};

// Color encodes operational meaning, not the individual state: neutral = not yet
// triaged/terminal, amber = needs a human decision, blue = waiting on a reply,
// teal = actively moving, green = done. Keeps 14 states scannable at a glance.
export const STATUS_STYLES: Record<TicketStatus, string> = {
  NEU: "bg-slate-100 text-slate-700 border-slate-200",
  PRUEFUNG_ERFORDERLICH: "bg-amber-50 text-amber-800 border-amber-200",
  WARTEN_AUF_FREIGABE: "bg-amber-50 text-amber-800 border-amber-200",
  RUECKFRAGE_AN_MIETER: "bg-sky-50 text-sky-700 border-sky-200",
  DIENSTLEISTER_ANGEFRAGT: "bg-sky-50 text-sky-700 border-sky-200",
  TERMINABSTIMMUNG: "bg-sky-50 text-sky-700 border-sky-200",
  WARTEN_AUF_MATERIAL: "bg-sky-50 text-sky-700 border-sky-200",
  FREIGEGEBEN: "bg-teal-50 text-teal-700 border-teal-200",
  TERMIN_BESTAETIGT: "bg-teal-50 text-teal-700 border-teal-200",
  IN_BEARBEITUNG: "bg-teal-50 text-teal-700 border-teal-200",
  ERLEDIGT: "bg-emerald-50 text-emerald-700 border-emerald-200",
  VOM_MIETER_BESTAETIGT: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ABGESCHLOSSEN: "bg-emerald-100 text-emerald-800 border-emerald-200",
  ABGELEHNT: "bg-slate-100 text-slate-700 border-slate-200"
};

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  NEW_TICKET: "Neues Ticket",
  NEW_MESSAGE: "Neue Nachricht",
  WORK_ORDER_REQUEST: "Neue Auftragsanfrage",
  APPOINTMENT_PROPOSED: "Termin vorgeschlagen",
  APPOINTMENT_CONFIRMED: "Termin bestätigt",
  STATUS_CHANGED: "Status geändert",
  QUESTION: "Rückfrage",
  OVERDUE: "Vorgang überfällig",
  WORK_COMPLETED: "Auftrag abgeschlossen",
  FEEDBACK_RECEIVED: "Feedback eingegangen",
  REMINDER: "Erinnerung"
};

export const TICKET_CATEGORIES = Object.values(TicketCategory);
export const TICKET_PRIORITIES = Object.values(TicketPriority);
export const TICKET_STATUSES = Object.values(TicketStatus);

export type NavIconName =
  | "bell"
  | "building"
  | "calendar"
  | "chart"
  | "clipboard"
  | "file"
  | "home"
  | "inbox"
  | "message"
  | "receipt"
  | "asset"
  | "receipt"
  | "asset"
  | "settings"
  | "ticket"
  | "user"
  | "users"
  | "wrench";

export const navigationByRole = {
  HAUSVERWALTER: [
    { href: "/dashboard", label: "Dashboard", icon: "home" },
    { href: "/onboarding", label: "Einrichtung", icon: "clipboard" },
    { href: "/tickets", label: "Tickets", icon: "ticket" },
    { href: "/nachrichten", label: "Nachrichten", icon: "message" },
    { href: "/termine", label: "Termine", icon: "calendar" },
    { href: "/objekte", label: "Objekte", icon: "building" },
    { href: "/wohneinheiten", label: "Wohneinheiten", icon: "inbox" },
    { href: "/mieter", label: "Mieter", icon: "users" },
    { href: "/dienstleister", label: "Dienstleister", icon: "wrench" },
    { href: "/dokumente", label: "Dokumente", icon: "file" },
    { href: "/rechnungen", label: "Rechnungen", icon: "receipt" },
    { href: "/bauteile", label: "Bauteilakte", icon: "asset" },
    { href: "/statistiken", label: "Statistiken", icon: "chart" },
    { href: "/benachrichtigungen", label: "Benachrichtigungen", icon: "bell" },
    { href: "/einstellungen", label: "Einstellungen", icon: "settings" }
  ],
  MIETER: [
    { href: "/dashboard", label: "Dashboard", icon: "home" },
    { href: "/tickets", label: "Meldungen", icon: "ticket" },
    { href: "/nachrichten", label: "Nachrichten", icon: "message" },
    { href: "/termine", label: "Termine", icon: "calendar" },
    { href: "/dokumente", label: "Dokumente", icon: "file" },
    { href: "/benachrichtigungen", label: "Benachrichtigungen", icon: "bell" },
    { href: "/profil", label: "Profil", icon: "user" }
  ],
  DIENSTLEISTER: [
    { href: "/dashboard", label: "Dashboard", icon: "home" },
    { href: "/tickets", label: "Aufträge", icon: "ticket" },
    { href: "/nachrichten", label: "Nachrichten", icon: "message" },
    { href: "/termine", label: "Termine", icon: "calendar" },
    { href: "/dokumente", label: "Dokumente", icon: "file" },
    { href: "/benachrichtigungen", label: "Benachrichtigungen", icon: "bell" },
    { href: "/profil", label: "Profil", icon: "user" }
  ]
} satisfies Record<Role, Array<{ href: string; label: string; icon: NavIconName }>>;

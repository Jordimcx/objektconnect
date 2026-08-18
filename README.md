# ObjektConnect

ObjektConnect ist ein Next.js-MVP für die Kommunikation zwischen Hausverwaltung, Mietern und Dienstleistern. Es kann lokal entwickelt und mit PostgreSQL sowie S3-kompatiblem Dateispeicher online betrieben werden.

## Start ohne Docker

```bash
npm install
brew install postgresql@16
brew services start postgresql@16
createuser objektconnect --createdb
createdb objektconnect -O objektconnect
npx prisma migrate dev
npm run seed
npm run dev
```

Die App läuft danach unter `http://localhost:3000`.

Die lokale `.env` ist für Homebrew-PostgreSQL auf Port `5432` vorbereitet.

## Start mit Docker

Wenn Docker funktioniert, kann stattdessen die Docker-Variante genutzt werden. Dafür die `DATABASE_URL` aus `.env.docker.example` in `.env` übernehmen und dann:

```bash
docker compose up -d
npx prisma migrate dev
npm run seed
npm run dev
```

## Demo-Zugänge

| Rolle | E-Mail | Passwort |
| --- | --- | --- |
| Hausverwalter | `verwaltung@objektconnect.de` | `Demo123!` |
| Mieter | `mieter@objektconnect.de` | `Demo123!` |
| Dienstleister | `dienstleister@objektconnect.de` | `Demo123!` |

## Umgesetzt

- Next.js App Router mit TypeScript, Tailwind CSS, shadcn/ui-nahen Komponenten und Lucide Icons
- PostgreSQL mit Prisma ORM, Docker Compose, Prisma-Schema und Seed-Daten
- Auth.js/NextAuth Credentials Login mit sicheren bcrypt-Hashes
- Rollenbasierte Dashboards für Hausverwaltung, Mieter und Dienstleister
- Ticketworkflow mit Ticketnummer, Priorität, Status, Zuweisung, Terminen, Abschlussbericht und Feedback
- Statushistorie, Systemnachrichten, interne Notizen und internes Benachrichtigungscenter
- Lokaler Upload für Bilder und PDFs mit Dateityp- und Größenprüfung
- Objekt-, Wohneinheiten-, Mieter-, Dienstleister-, Dokumenten-, Termin- und Statistikseiten
- Regelbasierte Assistenz für Kategorie, Priorität, fehlende Angaben, nächste Aktion und Dienstleisterauswahl
- Simulierte Automatisierungen für Notfälle, überfällige Vorgänge, Statusmeldungen, Archivierung und Feedback
- Grundlegende Tests für Login/Rollen, Ticket-Erstellung, Zuweisung, Statuswechsel, Berechtigungen und Terminbestätigung

## Zentrale Dateien

- `prisma/schema.prisma` - Datenmodell
- `prisma/seed.ts` - Demo-Daten
- `lib/auth.ts` - Auth.js Konfiguration
- `lib/ticket-service.ts` - Geschäftslogik und Berechtigungsnahe Ticketaktionen
- `lib/permissions.ts` - Rollen- und Datenzugriffsfilter
- `components/tickets/damage-wizard.tsx` - Schritt-für-Schritt-Schadensmeldung
- `app/(app)/tickets/[id]/page.tsx` - Ticketdetailseite mit Rollenaktionen

## Prüfungen

```bash
npm run lint
npm run test
npm run build
```

## Online-Betrieb

Die benötigten Dienste, Umgebungswerte und Schritte stehen in `DEPLOYMENT.md`. In der Produktion werden keine Seed-Daten angelegt.

Vor der Freigabe für echte Verwaltungen müssen Backups, Löschkonzept, Auftragsverarbeitungsverträge, Monitoring und Schutz vor automatisierten Zugriffen final geprüft werden.

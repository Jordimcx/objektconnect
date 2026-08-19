# ObjektConnect online bereitstellen

Die Anwendung ist für Vercel, eine PostgreSQL-Datenbank und S3-kompatiblen Dateispeicher vorbereitet. Lokal bleibt `STORAGE_DRIVER=local` aktiv. Für die Produktion wird `STORAGE_DRIVER=s3` gesetzt.

## 1. Benötigte Dienste

- Vercel für die Next.js-Anwendung
- Neon PostgreSQL in Frankfurt für die Datenbank
- Cloudflare R2 mit EU-Jurisdiktion für Fotos und Dokumente
- Eine öffentliche Domain, zum Beispiel `app.objektconnect.de`
- Ein Transaktions-Maildienst oder vorübergehend der vorhandene SMTP-Zugang

## 2. Produktionsvariablen

Diese Werte werden in Vercel hinterlegt und nicht in eine Datei eingecheckt:

```text
DATABASE_URL=postgresql://...
AUTH_SECRET=<langes zufälliges Geheimnis>
AUTH_TRUST_HOST=true
NEXTAUTH_URL=https://app.objektconnect.de
APP_URL=https://app.objektconnect.de

STORAGE_DRIVER=s3
S3_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=<r2-access-key>
S3_SECRET_ACCESS_KEY=<r2-secret-key>
S3_BUCKET=objektconnect-files
S3_PREFIX=uploads
STORAGE_SOFT_LIMIT_BYTES=8589934592

SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_USER=<absender>
SMTP_PASSWORD=<smtp-passwort>
```

## 3. Datenbank vorbereiten

Die Neon-Verbindungsadresse wird lokal über eine verdeckte Eingabe gespeichert:

```bash
npm run cloud:database:setup
```

Das Skript erzeugt die ignorierte Datei `.env.cloud.local` mit einer gepoolten Verbindung für die Anwendung und einer direkten Verbindung für Migrationen. Die Verbindungsadresse wird weder im Terminalverlauf noch im Repository gespeichert.

Die Verbindung kann ohne Änderungen an der Datenbank geprüft werden:

```bash
npm run cloud:database:check
```

Auf einer neuen leeren Produktionsdatenbank werden ausschließlich die vorhandenen Migrationen ausgeführt:

```bash
npm run cloud:database:migrate
```

`npm run seed` darf in der Produktion nicht ausgeführt werden. Bestehende lokale Echtdaten werden später getrennt exportiert und in die Cloud-Datenbank importiert.

Für die Übertragung werden zuerst ein lokales Backup und danach dessen Import ausgeführt:

```bash
npm run cloud:database:backup
npm run cloud:database:restore
npm run cloud:database:summary
```

## 4. Veröffentlichung prüfen

Der private EU-Bucket wird über eine verdeckte Eingabe verbunden und mit genau einer Schreib- und Leseoperation geprüft:

```bash
npm run cloud:storage:setup
npm run cloud:storage:check
```

ObjektConnect stoppt Cloud-Uploads standardmäßig bei 8 GB dokumentiertem Speicher. Die verbleibenden 2 GB dienen als Reserve innerhalb des R2-Free-Tiers. Der Bucket verwendet ausschließlich die Speicherklasse `Standard`.

Nach dem Verknüpfen des lokalen Projekts mit Vercel werden die Produktionsvariablen verdeckt übertragen:

```bash
npm run cloud:vercel:configure
```

Nach der ersten Veröffentlichung werden Anmeldung, Aktivierungslink, Schadensmeldung, Upload, E-Mail, Terminbestätigung und rollenbasierter Zugriff mit Testkonten geprüft. Erst danach werden echte Nutzer eingeladen.

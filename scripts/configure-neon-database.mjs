import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const environmentPath = path.join(projectRoot, ".env.cloud.local");

if (!process.stdin.isTTY) {
  console.error("Bitte den Befehl in einem normalen Terminalfenster ausführen.");
  process.exit(1);
}

console.log("\nNeon-Datenbank sicher verbinden");
console.log("Die Eingabe bleibt unsichtbar und wird nicht im Terminalverlauf gespeichert.\n");

const connectionString = await readHidden("Neue Neon Connection String einfügen und Enter drücken: ");

let connection;
try {
  connection = new URL(connectionString.trim());
} catch {
  fail("Die Eingabe ist keine gültige Verbindungsadresse.");
}

if (!connection || !["postgres:", "postgresql:"].includes(connection.protocol)) {
  fail("Die Adresse muss mit postgresql:// beginnen.");
}
if (!connection.hostname.endsWith(".neon.tech")) {
  fail("Die Adresse gehört nicht zu einer Neon-Datenbank.");
}
if (!connection.username || !connection.password) {
  fail("Benutzername oder Passwort fehlen in der Verbindungsadresse.");
}

connection.searchParams.set("sslmode", "require");
const directUrl = new URL(connection);
const pooledUrl = new URL(connection);

if (connection.hostname.includes("-pooler.")) {
  directUrl.hostname = connection.hostname.replace("-pooler.", ".");
} else {
  const [endpoint, ...hostParts] = connection.hostname.split(".");
  pooledUrl.hostname = `${endpoint}-pooler.${hostParts.join(".")}`;
}

const contents = [
  "# Automatisch erzeugt. Nicht weitergeben oder einchecken.",
  `CLOUD_DATABASE_URL=${quote(pooledUrl.toString())}`,
  `CLOUD_DIRECT_URL=${quote(directUrl.toString())}`,
  ""
].join("\n");

await fs.writeFile(environmentPath, contents, { mode: 0o600 });
await fs.chmod(environmentPath, 0o600);

console.log("\nDie Neon-Verbindung wurde sicher lokal gespeichert.");
console.log("Es wurden eine gepoolte App-Verbindung und eine direkte Migrationsverbindung vorbereitet.");

function quote(value) {
  return JSON.stringify(value);
}

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("Eingabe abgebrochen."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };

    process.stdout.write(prompt);
    process.stdin.setEncoding("utf8");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

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

console.log("\nCloudflare R2 sicher verbinden");
console.log("Die Zugangswerte bleiben unsichtbar und werden nicht im Terminalverlauf gespeichert.\n");

const endpointInput = await readHidden("EU S3 API Endpoint einfügen und Enter drücken: ");
const accessKeyId = await readHidden("Access Key ID einfügen und Enter drücken: ");
const secretAccessKey = await readHidden("Secret Access Key einfügen und Enter drücken: ");

let endpoint;
try {
  endpoint = new URL(endpointInput.trim());
} catch {
  fail("Der S3 API Endpoint ist keine gültige Adresse.");
}

if (!endpoint || endpoint.protocol !== "https:" || !endpoint.hostname.endsWith(".r2.cloudflarestorage.com")) {
  fail("Der Endpoint muss eine HTTPS-Adresse von Cloudflare R2 sein.");
}
if (!endpoint.hostname.includes(".eu.r2.cloudflarestorage.com")) {
  fail("Für den EU-Bucket muss der Endpoint '.eu.r2.cloudflarestorage.com' enthalten.");
}
if (accessKeyId.trim().length < 10 || secretAccessKey.trim().length < 20) {
  fail("Access Key ID oder Secret Access Key sind unvollständig.");
}

const existing = await readEnvironmentFile(environmentPath);
const updated = {
  ...existing,
  STORAGE_DRIVER: "s3",
  S3_ENDPOINT: endpoint.toString().replace(/\/$/, ""),
  S3_REGION: "auto",
  S3_ACCESS_KEY_ID: accessKeyId.trim(),
  S3_SECRET_ACCESS_KEY: secretAccessKey.trim(),
  S3_BUCKET: "objektconnect-files",
  S3_PREFIX: "uploads",
  STORAGE_SOFT_LIMIT_BYTES: "8589934592"
};

const contents = [
  "# Automatisch erzeugt. Nicht weitergeben oder einchecken.",
  ...Object.entries(updated).map(([key, value]) => `${key}=${JSON.stringify(value)}`),
  ""
].join("\n");

await fs.writeFile(environmentPath, contents, { mode: 0o600 });
await fs.chmod(environmentPath, 0o600);

console.log("\nCloudflare R2 wurde sicher lokal gespeichert.");
console.log("Der Bucket bleibt privat und wird über die ObjektConnect-Anwendung angesprochen.");

async function readEnvironmentFile(filePath) {
  try {
    const contents = await fs.readFile(filePath, "utf8");
    return Object.fromEntries(
      contents
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const separator = line.indexOf("=");
          const key = line.slice(0, separator);
          const rawValue = line.slice(separator + 1);
          try {
            return [key, JSON.parse(rawValue)];
          } catch {
            return [key, rawValue];
          }
        })
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
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

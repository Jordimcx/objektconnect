import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const environmentPath = path.join(projectRoot, ".env.cloud.local");
const command = process.argv[2] || "check";
const variables = await readEnvironmentFile(environmentPath);
const localVariables = await readEnvironmentFile(path.join(projectRoot, ".env"));
const localUrl = localVariables.DATABASE_URL;
const directUrl = variables.CLOUD_DIRECT_URL;

if (!directUrl) {
  console.error("Die Cloud-Datenbank ist noch nicht eingerichtet. Zuerst npm run cloud:database:setup ausführen.");
  process.exit(1);
}

if (command === "check") {
  await checkConnection(directUrl);
} else if (command === "migrate") {
  await runPrisma(["migrate", "deploy"], directUrl);
} else if (command === "status") {
  await runPrisma(["migrate", "status"], directUrl);
} else if (command === "summary") {
  if (!localUrl) fail("DATABASE_URL fehlt in der lokalen .env-Datei.");
  await printSummary("Lokal", localUrl);
  await printSummary("Neon", directUrl);
} else if (command === "backup") {
  if (!localUrl) fail("DATABASE_URL fehlt in der lokalen .env-Datei.");
  await createBackup(localUrl);
} else if (command === "restore") {
  await restoreLatestBackup(directUrl);
} else {
  console.error(`Unbekannter Datenbankbefehl: ${command}`);
  process.exit(1);
}

async function printSummary(label, databaseUrl) {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const [result] = await prisma.$queryRawUnsafe(`
      SELECT
        (SELECT COUNT(*)::int FROM "Organization") AS organizations,
        (SELECT COUNT(*)::int FROM "User") AS users,
        (SELECT COUNT(*)::int FROM "Property") AS properties,
        (SELECT COUNT(*)::int FROM "Unit") AS units,
        (SELECT COUNT(*)::int FROM "Lease") AS leases,
        (SELECT COUNT(*)::int FROM "ServiceProvider") AS providers,
        (SELECT COUNT(*)::int FROM "Ticket") AS tickets,
        (SELECT COUNT(*)::int FROM "Document") AS documents
    `);
    console.log(`\n${label}:`);
    console.log(`  Verwaltungen: ${result.organizations}`);
    console.log(`  Benutzer: ${result.users}`);
    console.log(`  Objekte: ${result.properties}`);
    console.log(`  Einheiten: ${result.units}`);
    console.log(`  Mietverhältnisse: ${result.leases}`);
    console.log(`  Dienstleister: ${result.providers}`);
    console.log(`  Vorgänge: ${result.tickets}`);
    console.log(`  Dokumente: ${result.documents}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function createBackup(databaseUrl) {
  const backupDirectory = path.join(projectRoot, "backups");
  await fs.mkdir(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archivePath = path.join(backupDirectory, `objektconnect-local-${timestamp}.dump`);

  await runPostgresTool("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--file",
    archivePath
  ], databaseUrl);
  await runPostgresTool("pg_restore", ["--list", archivePath]);

  const statistics = await fs.stat(archivePath);
  console.log(`Backup geprüft: ${path.relative(projectRoot, archivePath)} (${Math.max(1, Math.round(statistics.size / 1024))} KB)`);
}

async function restoreLatestBackup(databaseUrl) {
  const backupDirectory = path.join(projectRoot, "backups");
  const archiveNames = (await fs.readdir(backupDirectory))
    .filter((name) => name.endsWith(".dump"))
    .sort()
    .reverse();
  if (!archiveNames.length) fail("Es wurde noch kein lokales Datenbank-Backup erstellt.");

  const archivePath = path.join(backupDirectory, archiveNames[0]);
  console.log(`Importiere geprüftes Backup: ${path.relative(projectRoot, archivePath)}`);
  await runPostgresTool("pg_restore", [
    "--dbname",
    databaseName(databaseUrl),
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--exit-on-error",
    archivePath
  ], databaseUrl);
  console.log("Das lokale Datenbank-Backup wurde nach Neon übertragen.");
}

async function checkConnection(databaseUrl) {
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const [result] = await prisma.$queryRawUnsafe(
      "SELECT current_database() AS database, current_user AS username, current_setting('server_version') AS version"
    );
    console.log("Neon ist erreichbar.");
    console.log(`Datenbank: ${result.database}`);
    console.log(`Rolle: ${result.username}`);
    console.log(`PostgreSQL: ${result.version}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function runPrisma(argumentsList, databaseUrl) {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(executable, ["prisma", ...argumentsList], {
      cwd: projectRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) process.exit(exitCode);
}

async function runPostgresTool(executable, argumentsList, databaseUrl) {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(executable, argumentsList, {
      cwd: projectRoot,
      env: databaseUrl ? { ...process.env, ...postgresEnvironment(databaseUrl) } : process.env,
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) process.exit(exitCode);
}

function postgresEnvironment(databaseUrl) {
  const url = new URL(databaseUrl);
  const environment = {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, ""))
  };
  const sslMode = url.searchParams.get("sslmode");
  const channelBinding = url.searchParams.get("channel_binding");
  if (sslMode) environment.PGSSLMODE = sslMode;
  if (channelBinding) environment.PGCHANNELBINDING = channelBinding;
  return environment;
}

function databaseName(databaseUrl) {
  return decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function readEnvironmentFile(filePath) {
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
        let value = rawValue;
        try {
          value = JSON.parse(rawValue);
        } catch {
          value = rawValue;
        }
        return [key, value];
      })
  );
}

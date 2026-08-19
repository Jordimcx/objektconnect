import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cloudEnvironmentPath = path.join(projectRoot, ".env.cloud.local");
const localEnvironmentPath = path.join(projectRoot, ".env");
const cloud = await readEnvironmentFile(cloudEnvironmentPath);
const local = await readEnvironmentFile(localEnvironmentPath);

cloud.PRODUCTION_AUTH_SECRET ||= randomBytes(48).toString("base64url");
await writeEnvironmentFile(cloudEnvironmentPath, cloud);

const variables = {
  DATABASE_URL: required(cloud, "CLOUD_DATABASE_URL"),
  AUTH_SECRET: required(cloud, "PRODUCTION_AUTH_SECRET"),
  AUTH_TRUST_HOST: "true",
  STORAGE_DRIVER: "s3",
  S3_ENDPOINT: required(cloud, "S3_ENDPOINT"),
  S3_REGION: cloud.S3_REGION || "auto",
  S3_ACCESS_KEY_ID: required(cloud, "S3_ACCESS_KEY_ID"),
  S3_SECRET_ACCESS_KEY: required(cloud, "S3_SECRET_ACCESS_KEY"),
  S3_BUCKET: required(cloud, "S3_BUCKET"),
  S3_PREFIX: cloud.S3_PREFIX || "uploads",
  STORAGE_SOFT_LIMIT_BYTES: cloud.STORAGE_SOFT_LIMIT_BYTES || "8589934592",
  SMTP_HOST: required(local, "SMTP_HOST"),
  SMTP_PORT: required(local, "SMTP_PORT"),
  SMTP_USER: required(local, "SMTP_USER"),
  SMTP_PASSWORD: required(local, "SMTP_PASSWORD")
};

console.log(`Übertrage ${Object.keys(variables).length} geschützte Produktionsvariablen zu Vercel.`);
for (const [name, value] of Object.entries(variables)) {
  await addVercelVariable(name, value);
}
console.log("Alle Produktionsvariablen wurden in Vercel hinterlegt.");

async function addVercelVariable(name, value) {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      "vercel",
      ["env", "add", name, "production", "--force", "--sensitive", "--yes"],
      { cwd: projectRoot, stdio: ["pipe", "inherit", "inherit"] }
    );
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
    child.stdin.end(value);
  });
  if (exitCode !== 0) process.exit(exitCode);
}

function required(values, name) {
  const value = values[name]?.trim();
  if (!value) {
    console.error(`Die benötigte Einstellung ${name} fehlt.`);
    process.exit(1);
  }
  return value;
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
        try {
          return [key, JSON.parse(rawValue)];
        } catch {
          return [key, rawValue];
        }
      })
  );
}

async function writeEnvironmentFile(filePath, values) {
  const contents = [
    "# Automatisch erzeugt. Nicht weitergeben oder einchecken.",
    ...Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`),
    ""
  ].join("\n");
  await fs.writeFile(filePath, contents, { mode: 0o600 });
  await fs.chmod(filePath, 0o600);
}

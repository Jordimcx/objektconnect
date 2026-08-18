import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const variables = await readEnvironmentFile(path.join(projectRoot, ".env.cloud.local"));
const required = ["S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET"];

for (const name of required) {
  if (!variables[name]) {
    console.error(`Die Cloud-Speicher-Einstellung ${name} fehlt.`);
    process.exit(1);
  }
}

const client = new S3Client({
  endpoint: variables.S3_ENDPOINT,
  region: variables.S3_REGION || "auto",
  forcePathStyle: true,
  credentials: {
    accessKeyId: variables.S3_ACCESS_KEY_ID,
    secretAccessKey: variables.S3_SECRET_ACCESS_KEY
  }
});

const key = `${variables.S3_PREFIX || "uploads"}/connection-check-${randomUUID()}.txt`;
const expected = "ObjektConnect R2 Verbindungstest";

try {
  await client.send(new PutObjectCommand({
    Bucket: variables.S3_BUCKET,
    Key: key,
    Body: expected,
    ContentType: "text/plain"
  }));
  const result = await client.send(new GetObjectCommand({ Bucket: variables.S3_BUCKET, Key: key }));
  const received = result.Body ? await result.Body.transformToString() : "";
  if (received !== expected) throw new Error("Der gelesene Testinhalt stimmt nicht überein.");
  console.log("Cloudflare R2 ist erreichbar und Lesen sowie Schreiben funktionieren.");
  console.log("Der Verbindungstest benötigt eine Schreib- und eine Leseoperation.");
} finally {
  await client.send(new DeleteObjectCommand({ Bucket: variables.S3_BUCKET, Key: key }));
  client.destroy();
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
        const keyName = line.slice(0, separator);
        const rawValue = line.slice(separator + 1);
        try {
          return [keyName, JSON.parse(rawValue)];
        } catch {
          return [keyName, rawValue];
        }
      })
  );
}

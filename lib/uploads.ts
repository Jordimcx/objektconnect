import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/xml",
  "text/xml"
]);
const maxSize = 5 * 1024 * 1024;

export type StoredUpload = {
  fileName: string;
  originalName: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  checksum: string;
};

export type StoredFile = {
  bytes: Uint8Array;
  contentType: string;
};

type StorageDriver = "local" | "s3";

let s3Client: S3Client | undefined;

export async function storeUploads(files: File[]) {
  const stored: StoredUpload[] = [];
  await assertStorageCapacity(files);

  for (const file of files) {
    if (file.size === 0) continue;
    if (!allowedTypes.has(file.type)) {
      throw new Error("Es sind nur JPG, PNG, WebP und PDF-Dateien erlaubt.");
    }
    if (file.size > maxSize) {
      throw new Error("Eine Datei ist größer als 5 MB.");
    }

    const extension = extensionForType(file.type);
    const fileName = `${randomUUID()}${extension}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!matchesFileSignature(file.type, bytes)) {
      throw new Error(`Die Datei ${file.name} entspricht nicht dem angegebenen Dateityp.`);
    }
    const checksum = createHash("sha256").update(bytes).digest("hex");
    await writeStoredFile(fileName, bytes, file.type, file.name, checksum);
    stored.push({
      fileName,
      originalName: file.name,
      url: `/api/files/${encodeURIComponent(fileName)}`,
      contentType: file.type,
      sizeBytes: file.size,
      checksum
    });
  }

  return stored;
}

async function assertStorageCapacity(files: File[]) {
  if (storageDriver() !== "s3") return;

  const requestedBytes = files.reduce((total, file) => total + file.size, 0);
  const softLimitBytes = configuredSoftLimitBytes();
  const usage = await prisma.document.aggregate({ _sum: { sizeBytes: true } });
  const documentedBytes = usage._sum.sizeBytes ?? 0;

  if (documentedBytes + requestedBytes > softLimitBytes) {
    throw new Error(
      "Das kostenlose Cloud-Speicherlimit ist fast erreicht. Bitte alte Dokumente archivieren oder das Speicherlimit bewusst erhöhen."
    );
  }
}

export async function readStoredFile(fileName: string): Promise<StoredFile> {
  assertSafeFileName(fileName);

  if (storageDriver() === "local") {
    const bytes = await readFile(path.join(localUploadDirectory(), fileName));
    return { bytes, contentType: contentTypeForFileName(fileName) };
  }

  const configuration = s3Configuration();
  const result = await getS3Client(configuration).send(new GetObjectCommand({
    Bucket: configuration.bucket,
    Key: objectKey(fileName)
  }));
  if (!result.Body) throw new Error("Die gespeicherte Datei ist leer.");

  return {
    bytes: await result.Body.transformToByteArray(),
    contentType: result.ContentType || contentTypeForFileName(fileName)
  };
}

export function getStorageConfigurationStatus() {
  const driver = storageDriver();
  if (driver === "local") {
    return { driver, configured: true, location: localUploadDirectory() };
  }

  const requiredValues = [
    process.env.S3_ENDPOINT,
    process.env.S3_ACCESS_KEY_ID,
    process.env.S3_SECRET_ACCESS_KEY,
    process.env.S3_BUCKET
  ];
  return {
    driver,
    configured: requiredValues.every((value) => Boolean(value?.trim())),
    location: process.env.S3_BUCKET?.trim() || ""
  };
}

async function writeStoredFile(
  fileName: string,
  bytes: Buffer,
  contentType: string,
  originalName: string,
  checksum: string
) {
  if (storageDriver() === "local") {
    const uploadDir = localUploadDirectory();
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, fileName), bytes);
    return;
  }

  const configuration = s3Configuration();
  await getS3Client(configuration).send(new PutObjectCommand({
    Bucket: configuration.bucket,
    Key: objectKey(fileName),
    Body: bytes,
    ContentType: contentType,
    Metadata: {
      originalname: encodeURIComponent(originalName),
      checksum
    }
  }));
}

function storageDriver(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER?.trim().toLowerCase() || "local";
  if (driver !== "local" && driver !== "s3") {
    throw new Error("STORAGE_DRIVER muss 'local' oder 's3' sein.");
  }
  return driver;
}

function configuredSoftLimitBytes() {
  const defaultLimit = 8 * 1024 * 1024 * 1024;
  const configured = Number(process.env.STORAGE_SOFT_LIMIT_BYTES || defaultLimit);
  if (!Number.isSafeInteger(configured) || configured <= 0) {
    throw new Error("STORAGE_SOFT_LIMIT_BYTES muss eine positive ganze Zahl sein.");
  }
  return configured;
}

function localUploadDirectory() {
  const uploadDir = process.env.UPLOAD_DIR?.trim() || "public/uploads";
  return path.resolve(process.cwd(), uploadDir);
}

function s3Configuration() {
  const endpoint = requiredEnvironmentValue("S3_ENDPOINT");
  const accessKeyId = requiredEnvironmentValue("S3_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnvironmentValue("S3_SECRET_ACCESS_KEY");
  const bucket = requiredEnvironmentValue("S3_BUCKET");
  const region = process.env.S3_REGION?.trim() || "auto";
  return { endpoint, accessKeyId, secretAccessKey, bucket, region };
}

function getS3Client(configuration: ReturnType<typeof s3Configuration>) {
  s3Client ??= new S3Client({
    endpoint: configuration.endpoint,
    region: configuration.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey
    }
  });
  return s3Client;
}

function objectKey(fileName: string) {
  const prefix = (process.env.S3_PREFIX?.trim() || "uploads").replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${fileName}` : fileName;
}

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Die Cloud-Speicher-Einstellung ${name} fehlt.`);
  return value;
}

function assertSafeFileName(fileName: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(fileName)) {
    throw new Error("Ungültiger Dateiname.");
  }
}

function contentTypeForFileName(fileName: string) {
  if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) return "image/jpeg";
  if (fileName.endsWith(".png")) return "image/png";
  if (fileName.endsWith(".webp")) return "image/webp";
  if (fileName.endsWith(".pdf")) return "application/pdf";
  if (fileName.endsWith(".xml")) return "application/xml";
  return "application/octet-stream";
}

function extensionForType(type: string) {
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  if (type === "application/xml" || type === "text/xml") return ".xml";
  return ".pdf";
}

function matchesFileSignature(type: string, bytes: Buffer) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === "image/webp") return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (type === "application/pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  const xmlStart = bytes.subarray(0, 512).toString("utf8").trimStart();
  return xmlStart.startsWith("<?xml") || xmlStart.startsWith("<Invoice") || xmlStart.includes("CrossIndustryInvoice");
}

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { appUrl, configuredAppUrl } from "@/lib/app-url";
import { readStoredFile, storeUploads } from "@/lib/uploads";

const originalEnvironment = {
  APP_URL: process.env.APP_URL,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  VERCEL_URL: process.env.VERCEL_URL,
  STORAGE_DRIVER: process.env.STORAGE_DRIVER,
  UPLOAD_DIR: process.env.UPLOAD_DIR
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("öffentliche Anwendungsadresse", () => {
  it("verwendet die explizite Produktionsadresse für versendete Links", () => {
    process.env.APP_URL = "https://app.objektconnect.de";
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    expect(configuredAppUrl()).toBe("https://app.objektconnect.de");
    expect(appUrl("/aktivieren/abc")).toBe("https://app.objektconnect.de/aktivieren/abc");
  });

  it("kann die von Vercel bereitgestellte Adresse verwenden", () => {
    delete process.env.APP_URL;
    delete process.env.NEXTAUTH_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "objektconnect.vercel.app";
    expect(configuredAppUrl()).toBe("https://objektconnect.vercel.app");
  });
});

describe("umschaltbarer Dateispeicher", () => {
  it("speichert und liest Dateien im lokalen Entwicklungsmodus", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "objektconnect-uploads-"));
    temporaryDirectories.push(directory);
    process.env.STORAGE_DRIVER = "local";
    process.env.UPLOAD_DIR = directory;

    const file = new File([Buffer.from([0xff, 0xd8, 0xff, 0x00])], "schaden.jpg", { type: "image/jpeg" });
    const [upload] = await storeUploads([file]);
    const stored = await readStoredFile(upload.fileName);

    expect(upload.url).toBe(`/api/files/${upload.fileName}`);
    expect(stored.contentType).toBe("image/jpeg");
    expect(Buffer.from(stored.bytes)).toEqual(Buffer.from(await file.arrayBuffer()));
  });
});

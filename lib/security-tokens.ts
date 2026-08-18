import { createHash, randomBytes, randomInt } from "node:crypto";

export function createOpaqueToken(bytes = 32) {
  const token = randomBytes(bytes).toString("base64url");
  return {
    token,
    tokenHash: hashToken(token),
    tokenHint: token.slice(-6)
  };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createOneTimeCode() {
  const code = String(randomInt(100000, 1000000));
  return { code, codeHash: hashToken(code) };
}

export function expiresInHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

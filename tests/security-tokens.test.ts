import { describe, expect, it } from "vitest";
import { createOneTimeCode, createOpaqueToken, expiresInHours, hashToken } from "@/lib/security-tokens";

describe("sichere Zugangslinks", () => {
  it("speichert nur einen stabilen Hash des zufälligen Tokens", () => {
    const access = createOpaqueToken();
    expect(access.token).not.toBe(access.tokenHash);
    expect(access.tokenHash).toBe(hashToken(access.token));
    expect(access.tokenHash).toHaveLength(64);
    expect(access.tokenHint).toBe(access.token.slice(-6));
  });

  it("erzeugt sechsstellige Einmalcodes, die sich nur gehasht vergleichen lassen", () => {
    const otp = createOneTimeCode();
    expect(otp.code).toMatch(/^\d{6}$/);
    expect(otp.codeHash).toBe(hashToken(otp.code));
  });

  it("berechnet eine zukünftige Ablaufzeit", () => {
    const before = Date.now() + 59 * 60 * 1000;
    const expiry = expiresInHours(1).getTime();
    expect(expiry).toBeGreaterThan(before);
    expect(expiry).toBeLessThanOrEqual(Date.now() + 61 * 60 * 1000);
  });
});

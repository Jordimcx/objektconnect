import { describe, expect, it } from "vitest";
import { createToastId } from "@/components/ui/toast";

describe("browserkompatible Benachrichtigungen", () => {
  it("erzeugt eindeutige IDs ohne crypto.randomUUID", () => {
    const first = createToastId();
    const second = createToastId();

    expect(first).toMatch(/^toast-[a-z0-9]+-[a-z0-9]+$/);
    expect(second).not.toBe(first);
  });
});

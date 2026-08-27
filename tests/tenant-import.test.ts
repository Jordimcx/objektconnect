import { describe, expect, it } from "vitest";
import { parseCsv, parseTenantCsv } from "@/lib/tenant-import";

describe("parseCsv", () => {
  it("parses simple rows and skips empty trailing lines", () => {
    expect(parseCsv("a,b,c\n1,2,3\n\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"]
    ]);
  });

  it("keeps commas inside quoted values intact", () => {
    expect(parseCsv('name,street\n"Muster, Max","Am Weg 1, links"\n')).toEqual([
      ["name", "street"],
      ["Muster, Max", "Am Weg 1, links"]
    ]);
  });
});

describe("parseTenantCsv", () => {
  it("maps German and English header aliases", () => {
    const csv = "Name,E-Mail,Telefon,Objekt,Einheit\nMax,max@x.de,0171,Kastanienhof,1.1\n";
    const { rows, errors } = parseTenantCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { name: "Max", email: "max@x.de", phone: "0171", propertyName: "Kastanienhof", unitLabel: "1.1" }
    ]);
  });

  it("flags rows missing required fields", () => {
    const csv = "name,email,objekt,einheit\nOhne Email,,Kastanienhof,1.1\n";
    const { rows, errors } = parseTenantCsv(csv);
    expect(rows).toEqual([]);
    expect(errors[0].reason).toContain("Pflichtfelder fehlen");
  });

  it("flags invalid email addresses", () => {
    const csv = "name,email,objekt,einheit\nAnna,keine-email,Kastanienhof,1.1\n";
    const { rows, errors } = parseTenantCsv(csv);
    expect(rows).toEqual([]);
    expect(errors[0].reason).toContain("Ungültige E-Mail");
  });
});

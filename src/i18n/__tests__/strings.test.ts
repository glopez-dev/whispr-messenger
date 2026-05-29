import { localizeText, localizedTexts } from "@/i18n/strings";

describe("localizeText", () => {
  it("returns the French translation when the language is fr", () => {
    expect(localizeText("fr", "common.cancel")).toBe("Annuler");
  });

  it("returns the English translation when the language is en", () => {
    expect(localizeText("en", "common.cancel")).toBe("Cancel");
  });

  it("falls back to the key itself when the translation is missing", () => {
    expect(localizeText("fr", "does.not.exist")).toBe("does.not.exist");
    expect(localizeText("en", "does.not.exist")).toBe("does.not.exist");
  });

  it("exposes the full localizedTexts table for both supported languages", () => {
    expect(Object.keys(localizedTexts)).toEqual(
      expect.arrayContaining(["fr", "en"]),
    );
    expect(Object.keys(localizedTexts.fr).length).toBeGreaterThan(0);
    expect(Object.keys(localizedTexts.en).length).toBeGreaterThan(0);
  });

  it("keeps fr and en in lock-step on the same set of keys", () => {
    const frKeys = new Set(Object.keys(localizedTexts.fr));
    const enKeys = new Set(Object.keys(localizedTexts.en));
    const missingInEn = [...frKeys].filter((k) => !enKeys.has(k));
    const missingInFr = [...enKeys].filter((k) => !frKeys.has(k));
    expect({ missingInEn, missingInFr }).toEqual({
      missingInEn: [],
      missingInFr: [],
    });
  });
});

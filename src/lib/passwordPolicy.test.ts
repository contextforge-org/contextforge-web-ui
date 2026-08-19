import { describe, expect, it } from "vitest";
import { countPasswordCharacterClasses, MIN_PASSWORD_CHARACTER_CLASSES } from "./passwordPolicy";

describe("countPasswordCharacterClasses", () => {
  it("counts all four classes for a password that genuinely has them", () => {
    expect(countPasswordCharacterClasses("Password123!")).toBe(4);
  });

  it("does not count a trailing space as a special character", () => {
    expect(countPasswordCharacterClasses("Password123 ")).toBe(
      MIN_PASSWORD_CHARACTER_CLASSES, // upper, lower, digit — no genuine special char
    );
  });

  it("does not count accented/non-ASCII letters as a special character", () => {
    // "á" is neither [a-z] nor [A-Z] nor \d nor ASCII punctuation — the old
    // `/[^A-Za-z0-9]/` pattern over-counted it as "special".
    expect(countPasswordCharacterClasses("Passworda1")).toBe(3);
    expect(countPasswordCharacterClasses("Passwordá1")).toBe(3);
  });

  it("counts common ASCII punctuation as the special-character class", () => {
    for (const char of ["!", "@", "#", "$", "%", "-", "_", "."]) {
      expect(countPasswordCharacterClasses(`Password1${char}`)).toBe(4);
    }
  });
});

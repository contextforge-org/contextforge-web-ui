import { describe, expect, it } from "vitest";

import enUS from "./locales/en-US";
import esES from "./locales/es-ES";
import ptBR from "./locales/pt-BR";
import { SUPPORTED_LOCALES } from "./types";
import type { LocaleMessages, SupportedLocale } from "./types";

const BASE_LOCALE: SupportedLocale = "en-US";

const messages: Record<SupportedLocale, LocaleMessages> = {
  "en-US": enUS,
  "es-ES": esES,
  "pt-BR": ptBR,
};

const baseKeys = Object.keys(messages[BASE_LOCALE]);
const translatedLocales = SUPPORTED_LOCALES.filter((locale) => locale !== BASE_LOCALE);

describe("locale messages", () => {
  it("provides a bundle for every supported locale", () => {
    expect(Object.keys(messages).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it.each(translatedLocales)("%s translates every message id defined by en-US", (locale) => {
    const translated = new Set(Object.keys(messages[locale]));

    expect(baseKeys.filter((key) => !translated.has(key))).toEqual([]);
  });

  it.each(translatedLocales)("%s defines no message ids missing from en-US", (locale) => {
    const base = new Set(baseKeys);

    expect(Object.keys(messages[locale]).filter((key) => !base.has(key))).toEqual([]);
  });

  it.each([...SUPPORTED_LOCALES])("%s has no blank messages", (locale) => {
    const blank = Object.entries(messages[locale])
      .filter(([, message]) => typeof message !== "string" || message.trim() === "")
      .map(([key]) => key);

    expect(blank).toEqual([]);
  });
});

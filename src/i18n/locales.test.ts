import { describe, expect, it } from "vitest";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";

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

/**
 * Collects every placeholder name and rich-text tag a message references,
 * descending into plural/select branches so `{count, plural, one {# of {total}}}`
 * reports both arguments.
 */
function collectShape(
  elements: MessageFormatElement[],
  shape: { args: Set<string>; tags: Set<string> } = { args: new Set(), tags: new Set() },
) {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        shape.args.add(element.value);
        break;
      case TYPE.select:
      case TYPE.plural:
        shape.args.add(element.value);
        for (const option of Object.values(element.options)) {
          collectShape(option.value, shape);
        }
        break;
      case TYPE.tag:
        shape.tags.add(element.value);
        collectShape(element.children, shape);
        break;
      default:
        break;
    }
  }
  return shape;
}

function describeMessage(message: string) {
  const shape = collectShape(parse(message));
  return {
    args: [...shape.args].sort().join(","),
    tags: [...shape.tags].sort().join(","),
  };
}

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

  it.each([...SUPPORTED_LOCALES])("%s messages are valid ICU syntax", (locale) => {
    const invalid = Object.entries(messages[locale])
      .map(([key, message]) => {
        try {
          parse(message);
          return null;
        } catch (error) {
          return `${key}: ${(error as Error).message}`;
        }
      })
      .filter((entry): entry is string => entry !== null);

    expect(invalid).toEqual([]);
  });

  // A translation that drops {count}, renames a rich-text tag, or invents an
  // argument compiles fine but breaks at render time — react-intl throws on a
  // missing value and silently drops an unhandled tag. Key parity alone misses
  // both, so compare the shape of each message against the en-US original.
  it.each(translatedLocales)("%s messages use the same arguments and tags as en-US", (locale) => {
    const mismatches = baseKeys
      .map((key) => {
        const base = describeMessage(messages[BASE_LOCALE][key]);
        const translated = describeMessage(messages[locale][key]);

        if (base.args !== translated.args) {
          return `${key}: args en-US=[${base.args}] ${locale}=[${translated.args}]`;
        }
        if (base.tags !== translated.tags) {
          return `${key}: tags en-US=[${base.tags}] ${locale}=[${translated.tags}]`;
        }
        return null;
      })
      .filter((entry): entry is string => entry !== null);

    expect(mismatches).toEqual([]);
  });
});

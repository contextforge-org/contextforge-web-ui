import { describe, it, expect } from "vitest";
import { createIntl } from "react-intl";

import messages from "@/i18n/locales/en-US/dashboard.json";

import { formatRefreshedHint } from "./refreshedHint";

const intl = createIntl({ locale: "en-US", messages });

describe("formatRefreshedHint", () => {
  it("returns null before the first poll settles", () => {
    expect(formatRefreshedHint(intl, null)).toBeNull();
  });

  it("reads 'just now' for a poll that has only just completed", () => {
    expect(formatRefreshedHint(intl, Date.now())).toBe("Refreshed just now");
  });

  it("dates an older poll relatively", () => {
    expect(formatRefreshedHint(intl, Date.now() - 5 * 60_000)).toBe("Refreshed 5 minutes ago");
  });

  it("dates a years-old poll", () => {
    expect(formatRefreshedHint(intl, Date.now() - 400 * 24 * 60 * 60_000)).toBe(
      "Refreshed last year",
    );
  });
});

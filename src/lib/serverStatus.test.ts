import { describe, expect, it } from "vitest";

import enMessages from "@/i18n/locales/en-US";
import {
  getAvailabilityPresentation,
  getServerAvailability,
  type ServerAvailability,
} from "./serverStatus";

const up = { enabled: true, reachable: true };

const AVAILABILITIES: ServerAvailability[] = [
  "active",
  "auth",
  "unreachable",
  "checking",
  "inactive",
];

describe("getServerAvailability", () => {
  it("is active when enabled and reachable", () => {
    expect(getServerAvailability(up)).toBe("active");
  });

  it("is inactive when disabled, even though reachable stays frozen at true", () => {
    expect(getServerAvailability({ enabled: false, reachable: true })).toBe("inactive");
  });

  it("separates a server that went down from one never reached", () => {
    const down = { enabled: true, reachable: false };
    expect(getServerAvailability({ ...down, lastSeen: "2026-01-01T00:00:00Z" })).toBe(
      "unreachable",
    );
    expect(getServerAvailability(down)).toBe("checking");
  });

  it.each(["missing", "expired"] as const)("is auth when the token is %s", (status) => {
    expect(getServerAvailability(up, status)).toBe("auth");
  });

  it.each(["valid", "near_expiry"] as const)("ignores a usable %s token", (status) => {
    expect(getServerAvailability(up, status)).toBe("active");
  });

  it("does not claim auth when the token backend could not be read", () => {
    expect(getServerAvailability(up, "unknown")).toBe("active");
    expect(getServerAvailability({ enabled: true, reachable: false }, "unknown")).toBe("checking");
  });

  it("outranks inactive, so a disabled server awaiting authorization says so", () => {
    expect(getServerAvailability({ enabled: false, reachable: true }, "missing")).toBe("auth");
  });
});

describe("getAvailabilityPresentation", () => {
  it("gives auth the only non-muted warning tone", () => {
    expect(getAvailabilityPresentation("auth").iconClassName).toBe("text-warning");
    expect(getAvailabilityPresentation("active").iconClassName).toBe("text-success");
    expect(getAvailabilityPresentation("unreachable").iconClassName).toBe("text-muted-foreground");
  });

  it("shortens only the auth label", () => {
    const auth = getAvailabilityPresentation("auth");
    expect(auth.shortLabelId).not.toBe(auth.labelId);

    const active = getAvailabilityPresentation("active");
    expect(active.shortLabelId).toBe(active.labelId);
  });

  it("keeps the empty state off the detail text, which assumes components exist", () => {
    for (const availability of AVAILABILITIES) {
      const presentation = getAvailabilityPresentation(availability);
      expect(presentation.emptyId).not.toBe(presentation.detailId);
    }
  });

  it("resolves every message id it hands out", () => {
    const keys = Object.keys(enMessages);
    for (const availability of AVAILABILITIES) {
      const { labelId, shortLabelId, detailId, emptyId } =
        getAvailabilityPresentation(availability);
      for (const id of [labelId, shortLabelId, detailId, emptyId]) {
        expect(keys, `${availability} -> ${id}`).toContain(id);
      }
    }
  });
});

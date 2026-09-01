import { describe, expect, it } from "vitest";
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon } from "lucide-react";
import { STATUS_ICON, STATUS_TONE_CLASS, type StatusSeverity } from "./status";

const SEVERITIES: StatusSeverity[] = ["success", "info", "warning", "error"];

describe("STATUS_ICON", () => {
  it("maps every severity to the canonical sonner glyph", () => {
    expect(STATUS_ICON.success).toBe(CircleCheckIcon);
    expect(STATUS_ICON.info).toBe(InfoIcon);
    expect(STATUS_ICON.warning).toBe(TriangleAlertIcon);
    expect(STATUS_ICON.error).toBe(OctagonXIcon);
  });

  it("gives warning and error distinct icons", () => {
    expect(STATUS_ICON.warning).not.toBe(STATUS_ICON.error);
  });

  it("has an entry for every severity", () => {
    for (const severity of SEVERITIES) {
      expect(STATUS_ICON[severity]).toBeDefined();
    }
  });
});

describe("STATUS_TONE_CLASS", () => {
  it("has an entry for every severity", () => {
    for (const severity of SEVERITIES) {
      expect(typeof STATUS_TONE_CLASS[severity]).toBe("string");
      expect(STATUS_TONE_CLASS[severity].length).toBeGreaterThan(0);
    }
  });

  it("routes success/warning/error through the semantic status tokens", () => {
    expect(STATUS_TONE_CLASS.success).toBe("text-success");
    expect(STATUS_TONE_CLASS.warning).toBe("text-warning");
    expect(STATUS_TONE_CLASS.error).toBe("text-destructive");
  });
});

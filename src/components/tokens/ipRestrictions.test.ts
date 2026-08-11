import { describe, it, expect } from "vitest";
import { isValidIpRestriction, parseIpRestrictions } from "./ipRestrictions";

describe("isValidIpRestriction", () => {
  it.each([
    "192.168.1.1",
    "0.0.0.0",
    "255.255.255.255",
    "192.168.1.0/24",
    "10.0.0.0/8",
    "192.168.1.5/24", // host bits set — the backend parses with strict=False
    "1.2.3.4/0",
    "1.2.3.4/32",
    "10.0.0.0/255.0.0.0", // dotted netmask, also accepted by ipaddress
    "1.2.3.4/255.255.255.255",
    "::",
    "::1",
    "2001:db8::1",
    "2001:0db8:0000:0000:0000:0000:0000:0001",
    "fe80::1/64",
    "2001:db8::/32",
    "::ffff:192.168.1.1",
    "::ffff:10.0.0.1/128",
  ])("accepts %s", (entry) => {
    expect(isValidIpRestriction(entry)).toBe(true);
  });

  it.each([
    "",
    "999.999.999.999/99",
    "256.1.1.1",
    "1.2.3",
    "1.2.3.4.5",
    "01.2.3.4", // leading zeros are rejected by ipaddress
    "1.2.3.4/33",
    "1.2.3.4/-1",
    "1.2.3.4/",
    "1.2.3.4/24/24",
    "1.2.3.4/255.0.255.0", // non-contiguous netmask
    "not-an-ip",
    "192.168.1.0 /24",
    "2001:db8::1::2", // more than one "::"
    "2001:db8:::1",
    "12345::1",
    "2001:db8::1/129",
    "2001:0db8:0000:0000:0000:0000:0000:0001:0001", // nine groups
    "1:2:3:4:5:6:7", // seven groups, uncompressed
    "::ffff:192.168.1.1:1", // dotted quad not in the trailing position
  ])("rejects %s", (entry) => {
    expect(isValidIpRestriction(entry)).toBe(false);
  });
});

describe("parseIpRestrictions", () => {
  it("splits on commas and newlines, trimming and dropping blanks", () => {
    expect(parseIpRestrictions(" 10.0.0.0/8 , 192.168.1.1\n\n ::1 ,")).toEqual({
      entries: ["10.0.0.0/8", "192.168.1.1", "::1"],
      invalid: [],
    });
  });

  it("reports only the malformed entries, in input order", () => {
    expect(parseIpRestrictions("10.0.0.0/8, 999.999.999.999/99, nope")).toEqual({
      entries: ["10.0.0.0/8", "999.999.999.999/99", "nope"],
      invalid: ["999.999.999.999/99", "nope"],
    });
  });

  it("returns empty results for an empty field", () => {
    expect(parseIpRestrictions("   ")).toEqual({ entries: [], invalid: [] });
  });
});

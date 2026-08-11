/**
 * Client-side validation for the token `scope.ip_restrictions` field.
 *
 * Mirrors the backend contract (`TokenScopeRequest.validate_ip_restrictions`,
 * mcpgateway/schemas.py), which feeds each entry to Python's `ipaddress`:
 * a bare IPv4/IPv6 address, or a network in CIDR notation parsed with
 * `strict=False` — so host bits are allowed and `192.168.1.5/24` is accepted.
 * Validating any narrower than that would reject input the server would take.
 */

/** Decimal with no leading zeros, matching what `ipaddress` accepts. */
const DECIMAL = /^(0|[1-9]\d{0,2})$/;
const HEXTET = /^[0-9A-Fa-f]{1,4}$/;

function isIpv4(value: string): boolean {
  const octets = value.split(".");
  return (
    octets.length === 4 && octets.every((octet) => DECIMAL.test(octet) && Number(octet) <= 255)
  );
}

/** 16-bit group count for one side of an IPv6 address, or null when malformed. */
function countGroups(segment: string): number | null {
  if (segment === "") return 0;
  const tokens = segment.split(":");
  let groups = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.includes(".")) {
      // A dotted quad is only legal as the trailing 32 bits (::ffff:10.0.0.1).
      if (index !== tokens.length - 1 || !isIpv4(token)) return null;
      groups += 2;
      continue;
    }
    if (!HEXTET.test(token)) return null;
    groups += 1;
  }
  return groups;
}

function isIpv6(value: string): boolean {
  if (!value.includes(":")) return false;
  const halves = value.split("::");
  if (halves.length > 2) return false;

  const head = countGroups(halves[0]);
  const tail = halves.length === 2 ? countGroups(halves[1]) : 0;
  if (head === null || tail === null) return false;

  // "::" stands in for one or more zero groups, so a compressed address is
  // always short of the full eight.
  return halves.length === 2 ? head + tail <= 7 : head === 8;
}

/** True for a dotted IPv4 netmask with contiguous leading ones (255.255.0.0). */
function isIpv4Netmask(value: string): boolean {
  if (!isIpv4(value)) return false;
  const bits = value.split(".").reduce((acc, octet) => acc * 256 + Number(octet), 0);
  // Contiguous <=> inverting the mask leaves an all-ones suffix.
  const inverted = 0xffffffff - bits;
  return ((inverted + 1) & inverted) === 0;
}

/**
 * True when the entry is a bare IP address or a CIDR network the backend
 * would accept. The prefix may be a length (`/24`, `/64`) or, for IPv4, a
 * dotted netmask (`/255.255.255.0`).
 */
export function isValidIpRestriction(entry: string): boolean {
  const slash = entry.indexOf("/");
  if (slash === -1) return isIpv4(entry) || isIpv6(entry);

  const address = entry.slice(0, slash);
  const prefix = entry.slice(slash + 1);
  if (isIpv4(address)) {
    if (prefix.includes(".")) return isIpv4Netmask(prefix);
    return DECIMAL.test(prefix) && Number(prefix) <= 32;
  }
  if (isIpv6(address)) {
    return DECIMAL.test(prefix) && Number(prefix) <= 128;
  }
  return false;
}

export interface ParsedIpRestrictions {
  /** Non-empty, trimmed entries in input order. */
  entries: string[];
  /** The subset of `entries` the backend would reject. */
  invalid: string[];
}

/** Split the comma/newline separated field into entries and flag bad ones. */
export function parseIpRestrictions(raw: string): ParsedIpRestrictions {
  const entries = raw
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    entries,
    invalid: entries.filter((entry) => !isValidIpRestriction(entry)),
  };
}

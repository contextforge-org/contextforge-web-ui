import { useState } from "react";

import { ServerIcon } from "@/components/servers/ServerIcon";
import type { CatalogServer } from "@/generated/types";
import { cn } from "@/lib/utils";

const CATALOG_ICON_PATH = /^\/static\/catalog-icons\/[A-Za-z0-9][A-Za-z0-9._-]*\.png$/;

// Catalog ids whose bundled icon is a solid dark/black mark with no light-mode
// backdrop of its own (e.g. a bare wordmark or glyph). The tile normally follows
// the app theme (bg-muted), which goes dark in dark mode and swallows these, so
// they get a small light patch directly behind the glyph that stays light
// regardless of theme - the outer tile itself still follows the theme like
// every other icon. Add an id here if a newly bundled icon has the same problem.
const LIGHT_BACKING_CATALOG_IDS = new Set([
  "zine",
  "gitmcp",
  "port-io",
  "wix",
  "attio",
  "dialer",
  "ferryhopper",
  "invideo",
  "parallel-search",
  "parallel-task",
  "polar-signals",
  "zenable",
]);

function getSafeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  // Catalog icons are packaged by the API under this fixed path. Route them
  // through the authenticated BFF so the browser never needs an API origin.
  if (CATALOG_ICON_PATH.test(value)) {
    return `/api${value}`;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

export function CatalogLogo({ server }: { server: CatalogServer }) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const logoUrl = getSafeExternalUrl(server.logo_url);

  if (!logoUrl || failedLogoUrl === logoUrl) {
    return (
      <div aria-hidden="true">
        <ServerIcon name={server.name} size="lg" />
      </div>
    );
  }

  const needsLightBacking = LIGHT_BACKING_CATALOG_IDS.has(server.id);

  return (
    <div
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted p-2"
    >
      <div
        className={cn(
          "flex size-full items-center justify-center",
          // Only the small patch directly behind the glyph goes light, not the
          // whole tile - the outer 32x32 still follows the theme like every
          // other catalog icon.
          needsLightBacking && "bg-neutral-100",
        )}
      >
        <img
          src={logoUrl}
          alt=""
          className="size-full object-contain"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedLogoUrl(logoUrl)}
        />
      </div>
    </div>
  );
}

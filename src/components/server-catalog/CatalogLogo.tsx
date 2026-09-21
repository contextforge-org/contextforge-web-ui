import { useState } from "react";

import { MCPIcon } from "@/components/icons/MCPIcon";
import type { CatalogServer } from "@/generated/types";
import { cn } from "@/lib/utils";

const CATALOG_ICON_PATH = /^\/static\/catalog-icons\/[A-Za-z0-9][A-Za-z0-9._-]*\.png$/;

const TILE =
  "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-catalog-icon-tile p-2 shadow-xs";

// Dark marks on a transparent background, which are not visible on the dark-mode tile.
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
      <div aria-hidden="true" className={TILE}>
        <MCPIcon className="size-full text-foreground" />
      </div>
    );
  }

  const needsLightBacking = LIGHT_BACKING_CATALOG_IDS.has(server.id);

  return (
    <div aria-hidden="true" className={TILE}>
      <div
        className={cn(
          "flex size-full items-center justify-center",
          needsLightBacking && "bg-catalog-icon-backing",
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

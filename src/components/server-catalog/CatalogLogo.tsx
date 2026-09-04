import { useState } from "react";

import { ServerIcon } from "@/components/servers/ServerIcon";
import type { CatalogServer } from "@/generated/types";

const CATALOG_ICON_PATH = /^\/static\/catalog-icons\/[A-Za-z0-9][A-Za-z0-9._-]*\.png$/;

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

  return (
    <div aria-hidden="true" className="size-8 shrink-0">
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
  );
}

import { BookOpen } from "lucide-react";
import { useQuery } from "../../hooks/useQuery";
import { GitHubIcon } from "../icons/GitHubIcon";
import { SidebarTrigger } from "../ui/sidebar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";
import { Typography } from "../ui/typography";
import { HeaderProfileMenu } from "./HeaderProfileMenu";
import { HeaderQuickNav } from "./HeaderQuickNav";

const GITHUB_URL = "https://github.com/IBM/mcp-context-forge";
const DOCS_URL = "https://ibm.github.io/mcp-context-forge/latest/";

interface VersionResponse {
  app?: {
    version?: string;
  };
}

export function Header() {
  const { data: versionData } = useQuery<VersionResponse>("/version?partial=false");
  const liveApiVersion = versionData?.app?.version;

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      <SidebarTrigger />
      <div className="flex items-center gap-2">
        <HeaderQuickNav />
        <HoverCard openDelay={100}>
          <HoverCardTrigger asChild>
            <span
              tabIndex={0}
              className="hidden cursor-default text-sm font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline"
            >
              v{__APP_VERSION__}
            </span>
          </HoverCardTrigger>
          <HoverCardContent className="w-auto" align="end">
            <div className="space-y-1">
              <Typography variant="body">
                ContextForge supported API:{" "}
                <Typography variant="label" as="span">
                  v{__SUPPORTED_API_VERSION__}
                </Typography>
              </Typography>
              <Typography variant="body">
                Live API version:{" "}
                <Typography variant="label" as="span">
                  {liveApiVersion ? `v${liveApiVersion}` : "unavailable"}
                </Typography>
              </Typography>
            </div>
          </HoverCardContent>
        </HoverCard>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
          aria-label="GitHub"
        >
          <GitHubIcon className="size-4" aria-hidden="true" />
        </a>
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
          aria-label="Documentation"
        >
          <BookOpen className="size-4" aria-hidden="true" />
        </a>
        <HeaderProfileMenu />
      </div>
    </header>
  );
}

import { useIntl } from "react-intl";
import { Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ConnectSourceCard({ onAction }: { onAction: () => void }) {
  const intl = useIntl();

  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      className="cursor-pointer transition-opacity hover:opacity-90"
      onClick={onAction}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onAction();
        }
      }}
    >
      <CardHeader className="gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded bg-tool-add-icon-bg text-tool-add-icon-fg shadow-sm">
            <Plus className="size-3.5" />
          </span>
          <CardTitle>{intl.formatMessage({ id: "gateways.createServer.card.title" })}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription className="leading-relaxed">
          {intl.formatMessage({ id: "gateways.createServer.card.description" })}
        </CardDescription>
      </CardContent>
    </Card>
  );
}

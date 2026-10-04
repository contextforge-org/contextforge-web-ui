import { useIntl } from "react-intl";

import type { RbacRule } from "@/api/rules";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RuleDeleteDialogProps {
  rule: RbacRule | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RuleDeleteDialog({ rule, onCancel, onConfirm }: RuleDeleteDialogProps) {
  const intl = useIntl();
  return (
    <Dialog open={rule !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{intl.formatMessage({ id: "rules.deleteConfirm.title" })}</DialogTitle>
          <DialogDescription>
            {intl.formatMessage({ id: "rules.deleteConfirm.body" })}
            {rule ? ` (${rule.name})` : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {intl.formatMessage({ id: "common.button.cancel" })}
          </Button>
          <Button variant="destructive" onClick={onConfirm} data-testid="confirm-delete-rule">
            {intl.formatMessage({ id: "rules.delete" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import type { ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface ExpandableSectionProps {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

/** A bordered, single collapsible section whose open state the caller owns. */
export function ExpandableSection({ label, open, onOpenChange, children }: ExpandableSectionProps) {
  return (
    <Accordion
      type="single"
      collapsible
      value={open ? "section" : ""}
      onValueChange={(value) => onOpenChange(value === "section")}
      className="rounded-md border border-border"
    >
      <AccordionItem value="section" className="border-b-0">
        <AccordionTrigger className="px-3 py-2.5 text-sm font-normal text-muted-foreground hover:no-underline">
          {label}
        </AccordionTrigger>
        <AccordionContent className="space-y-5 px-3">{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

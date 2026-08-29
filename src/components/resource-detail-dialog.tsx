import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export type DetailField = { label: string; value: ReactNode };

export function ResourceDetailDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  fields,
  raw,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  fields: DetailField[];
  raw?: unknown;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6">{title}</DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>

        <ScrollArea className="max-h-[62vh] pr-3">
          <dl className="grid gap-3 sm:grid-cols-2">
            {fields
              .filter((f) => f.value !== undefined && f.value !== null && f.value !== "")
              .map((f) => (
                <div key={f.label} className="rounded-lg border border-border bg-muted/30 p-3">
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                    {f.label}
                  </dt>
                  <dd className="mt-1 text-sm font-medium break-words">{f.value}</dd>
                </div>
              ))}
          </dl>

          {raw !== undefined && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Raw FHIR resource
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
                {JSON.stringify(raw, null, 2)}
              </pre>
            </details>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

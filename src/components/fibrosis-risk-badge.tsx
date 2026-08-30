import { AlertTriangle, CircleAlert, CircleCheck, CircleHelp, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Fib4Result } from "@/lib/fib4";
import { cn } from "@/lib/utils";

export type FibrosisRiskStatus = "low" | "intermediate" | "high" | "not-applicable" | "no-data";

/** Maps the shared FIB-4 result onto the list badge status (no separate thresholds). */
export function fibrosisRiskStatus(result: Fib4Result): FibrosisRiskStatus {
  if (result.reason === "under-35") return "not-applicable";
  if (result.score === null) return "no-data";
  if (result.category === "insufficient-data") return "no-data";
  return result.category;
}

const META: Record<
  FibrosisRiskStatus,
  { label: string; tooltip: string; className: string; Icon: typeof CircleCheck }
> = {
  low: {
    label: "Low",
    tooltip: "FIB-4 < 1.30 — Low likelihood of advanced fibrosis",
    className:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    Icon: CircleCheck,
  },
  intermediate: {
    label: "Intermediate",
    tooltip: "FIB-4 1.30–2.67 — Intermediate risk; further assessment may be appropriate",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    Icon: AlertTriangle,
  },
  high: {
    label: "High",
    tooltip: "FIB-4 > 2.67 — High likelihood of advanced fibrosis",
    className: "border-rose-500/50 bg-rose-500/15 font-semibold text-rose-700 dark:text-rose-300",
    Icon: CircleAlert,
  },
  "not-applicable": {
    label: "N/A",
    tooltip:
      "FIB-4 is not recommended as the primary assessment for patients younger than 35",
    className: "border-border bg-muted text-muted-foreground",
    Icon: Clock,
  },
  "no-data": {
    label: "No data",
    tooltip: "FIB-4 cannot be calculated because required laboratory data is missing",
    className: "border-border bg-muted text-muted-foreground",
    Icon: CircleHelp,
  },
};

export function FibrosisRiskBadge({ result }: { result: Fib4Result }) {
  const status = fibrosisRiskStatus(result);
  const meta = META[status];
  const { Icon } = meta;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn("cursor-default gap-1 whitespace-nowrap", meta.className)}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="max-[420px]:sr-only">{meta.label}</span>
          <span className="sr-only max-[420px]:not-sr-only">{meta.label}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        <p>{meta.tooltip}</p>
        {result.score !== null && <p className="mt-1 font-medium">FIB-4: {result.score.toFixed(2)}</p>}
        {status === "no-data" && result.missingInputs.length > 0 && (
          <p className="mt-1">Missing: {result.missingInputs.join(", ")}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

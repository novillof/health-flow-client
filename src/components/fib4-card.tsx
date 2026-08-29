import { useState } from "react";
import { AlertCircle, ChevronDown, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { codeableText, type Condition, type Observation, type Patient } from "@/lib/fhir";
import {
  FIB4_LOINC,
  calculateFIB4,
  pickLatestObservation,
  type Fib4Result,
} from "@/lib/fib4";
import { cn } from "@/lib/utils";

const CONTEXT_KEYWORDS = [
  "obesity",
  "obese",
  "prediabetes",
  "diabetes",
  "hyperlipidemia",
  "hyperlipidaemia",
  "dyslipidemia",
  "alcohol",
];

function relevantConditions(conditions: Condition[] | undefined): string[] {
  const labels = (conditions ?? []).map((c) => codeableText(c.code)).filter((t) => t && t !== "(unknown)");
  const seen = new Set<string>();
  return labels.filter((label) => {
    const l = label.toLowerCase();
    if (!CONTEXT_KEYWORDS.some((k) => l.includes(k))) return false;
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 10);
}

const CATEGORY_META: Record<
  "low" | "intermediate" | "high",
  { label: string; badge: string; text: string }
> = {
  low: {
    label: "Low risk of advanced fibrosis",
    badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  intermediate: {
    label: "Intermediate risk",
    badge: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    text: "text-amber-600 dark:text-amber-400",
  },
  high: {
    label: "High likelihood of advanced fibrosis",
    badge: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    text: "text-rose-600 dark:text-rose-400",
  },
};

function InputGrid({ result }: { result: Fib4Result }) {
  const rows: { label: string; value: string; loinc?: string; date?: string | null }[] = [
    { label: "Age", value: result.age !== null ? `${result.age} years` : "—", loinc: "Patient.birthDate" },
    {
      label: "AST",
      value: result.ast !== null ? `${result.ast} ${result.astUnit ?? "U/L"}` : "—",
      loinc: FIB4_LOINC.ast,
      date: result.astDate,
    },
    {
      label: "ALT",
      value: result.alt !== null ? `${result.alt} ${result.altUnit ?? "U/L"}` : "—",
      loinc: FIB4_LOINC.alt,
      date: result.altDate,
    },
    {
      label: "Platelets",
      value: result.platelets !== null ? `${result.platelets} ${result.plateletsUnit ?? "×10⁹/L"}` : "—",
      loinc: FIB4_LOINC.platelets,
      date: result.plateletsDate,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((r) => (
        <div key={r.label} className="rounded-lg border border-border bg-background/60 p-3">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">{r.label}</p>
          <p className="mt-1 text-sm font-semibold">{r.value}</p>
          {r.date !== undefined && (
            <p className="mt-1 text-xs text-muted-foreground">Measured: {formatDate(r.date ?? null)}</p>
          )}
          {r.loinc && (
            <p className="text-xs text-muted-foreground">
              {r.loinc.startsWith("Patient") ? r.loinc : `LOINC ${r.loinc}`}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function Fib4Card({
  patient,
  labObservations,
  conditions,
  isPending,
  errorMessage,
}: {
  patient: Patient | undefined;
  labObservations: Observation[] | undefined;
  conditions: Condition[] | undefined;
  isPending: boolean;
  errorMessage?: string | undefined;
}) {
  const [showDetails, setShowDetails] = useState(false);

  const result = calculateFIB4({
    birthDate: patient?.birthDate ?? null,
    astObservation: pickLatestObservation(labObservations, FIB4_LOINC.ast),
    altObservation: pickLatestObservation(labObservations, FIB4_LOINC.alt),
    plateletObservation: pickLatestObservation(labObservations, FIB4_LOINC.platelets),
  });

  const context = relevantConditions(conditions);
  const meta = result.category === "insufficient-data" ? null : CATEGORY_META[result.category];

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Liver Fibrosis Risk</h2>
          <p className="text-sm text-muted-foreground">FIB-4 Assessment</p>
        </div>
        {meta && (
          <Badge variant="outline" className={meta.badge}>
            {meta.label}
          </Badge>
        )}
      </div>

      {isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-40" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : errorMessage ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertCircle className="mt-0.5 size-4 text-destructive" />
          <p className="text-muted-foreground">{errorMessage}</p>
        </div>
      ) : result.reason === "under-35" ? (
        <p className="text-sm text-muted-foreground">FIB-4 is not recommended for this age group.</p>
      ) : result.reason === "missing-birthdate" || result.reason === "invalid-birthdate" ? (
        <p className="text-sm text-muted-foreground">
          FIB-4 cannot be calculated because the patient&apos;s date of birth is missing or invalid.
        </p>
      ) : (
        <>
          {result.score === null ? (
            <div className="space-y-3">
              <p className="text-sm">
                FIB-4 cannot be calculated because required laboratory data is missing.
              </p>
              <div>
                <p className="text-xs tracking-wide text-muted-foreground uppercase">Missing data:</p>
                <ul className="mt-1 list-inside list-disc text-sm">
                  {result.missingInputs.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <p className="text-xs tracking-wide text-muted-foreground uppercase">FIB-4</p>
                <p className={cn("text-4xl font-semibold tabular-nums", meta?.text)}>
                  {result.score.toFixed(2)}
                </p>
              </div>
              {meta && <p className={cn("pb-1 text-sm font-medium", meta.text)}>{meta.label}</p>}
            </div>
          )}

          <div className="mt-5">
            <InputGrid result={result} />
          </div>

          {result.score !== null && (
            <div className="mt-4">
              <button
                type="button"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                aria-expanded={showDetails}
                onClick={() => setShowDetails((v) => !v)}
              >
                <ChevronDown className={cn("size-4 transition-transform", showDetails && "rotate-180")} />
                Calculation details
              </button>
              {showDetails && (
                <div className="mt-3 space-y-3 rounded-lg border border-border bg-background/60 p-3 text-sm">
                  <p className="font-mono text-xs sm:text-sm">
                    ({result.age} × {result.ast}) / ({result.platelets} × √{result.alt}) ={" "}
                    {result.score.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    FIB-4 = (Age × AST) / (Platelets × √ALT). Thresholds for age{" "}
                    {result.age !== null && result.age >= 65 ? "≥ 65" : "35–64"}: low &lt;{" "}
                    {result.age !== null && result.age >= 65 ? "2.00" : "1.30"}, intermediate up to 2.67,
                    high &gt; 2.67.
                  </p>
                  <div className="text-xs text-muted-foreground">
                    <p className="mb-1 font-medium text-foreground">FHIR data</p>
                    <ul className="space-y-0.5 font-mono">
                      <li>Patient.birthDate → age ({patient?.birthDate ?? "—"} → {result.age} years)</li>
                      <li>Observation LOINC {FIB4_LOINC.ast} → AST</li>
                      <li>Observation LOINC {FIB4_LOINC.alt} → ALT</li>
                      <li>Observation LOINC {FIB4_LOINC.platelets} → Platelets</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {context.length > 0 && (
            <div className="mt-5">
              <p className="text-xs tracking-wide text-muted-foreground uppercase">
                Relevant clinical context
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {context.map((c) => (
                  <Badge key={c} variant="outline">
                    {c}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Contextual information only — not used in the FIB-4 calculation.
              </p>
            </div>
          )}
        </>
      )}

      <div className="mt-5 flex items-start gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <p>
          FIB-4 is a non-invasive risk stratification tool and does not establish a diagnosis of liver
          fibrosis. Clinical decision support only; results should be interpreted in the appropriate
          clinical context.
        </p>
      </div>
    </div>
  );
}

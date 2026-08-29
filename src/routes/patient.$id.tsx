import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Activity, AlertCircle, ArrowLeft, BarChart3, TableIcon } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  codeableText,
  componentValue,
  getConditions,
  getLabObservations,
  getMedicationRequests,
  getPatient,
  getVitalObservations,
  medicationName,
  observationDate,
  observationMatchesCodes,
  patientDisplayName,
  type Condition,
  type MedicationRequest,
  type Observation,
} from "@/lib/fhir";
import { DataTable, type Column } from "@/components/data-table";
import { ResourceDetailDialog, type DetailField } from "@/components/resource-detail-dialog";
import { Fib4Card } from "@/components/fib4-card";


export const Route = createFileRoute("/patient/$id")({
  head: () => ({
    meta: [
      { title: "Patient Details — Vitals, Conditions & Medications" },
      {
        name: "description",
        content:
          "Patient chart with demographics, time-series vital signs charts, active conditions and current medications from a FHIR R4 server.",
      },
      { property: "og:title", content: "Patient Details — FHIR Chart" },
      {
        property: "og:description",
        content: "Demographics, vital sign trends, conditions and medications for a FHIR patient.",
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PatientDetailPage,
});

type VitalDef = {
  key: string;
  label: string;
  code: string;
  altCodes?: string[];
  series: { name: string; componentCode?: string; color: string }[];
};

const VITALS: VitalDef[] = [
  { key: "hr", label: "Heart rate", code: "8867-4", series: [{ name: "Heart rate", color: "var(--chart-1)" }] },
  { key: "temp", label: "Temperature", code: "8310-5", series: [{ name: "Temperature", color: "var(--chart-2)" }] },
  { key: "rr", label: "Respiratory rate", code: "9279-1", series: [{ name: "Respiratory rate", color: "var(--chart-3)" }] },
  { key: "spo2", label: "Oxygen saturation", code: "59408-5", series: [{ name: "SpO₂", color: "var(--chart-4)" }] },
  { key: "height", label: "Height", code: "8302-2", series: [{ name: "Height", color: "var(--chart-5)" }] },
  { key: "weight", label: "Weight", code: "29463-7", series: [{ name: "Weight", color: "var(--chart-1)" }] },
  { key: "bmi", label: "BMI", code: "39156-5", series: [{ name: "BMI", color: "var(--chart-2)" }] },
  {
    key: "bp",
    label: "Blood pressure",
    code: "55284-4",
    altCodes: ["85354-9"],
    series: [
      { name: "Systolic", componentCode: "8480-6", color: "var(--chart-1)" },
      { name: "Diastolic", componentCode: "8462-4", color: "var(--chart-4)" },
    ],
  },
];

type Point = { date: string; label: string; unit?: string | undefined } & Record<string, string | number | undefined>;

function buildPoints(observations: Observation[], def: VitalDef): Point[] {
  return observations
    .filter((o) => observationMatchesCodes(o, [def.code, ...(def.altCodes ?? [])]))
    .map((o) => {
      const date = observationDate(o) ?? "";
      const point: Point = {
        date,
        label: date ? new Date(date).toLocaleDateString() : "—",
        unit: o.valueQuantity?.unit ?? o.component?.[0]?.valueQuantity?.unit,
      };
      for (const s of def.series) {
        point[s.name] = s.componentCode
          ? componentValue(o, s.componentCode)
          : o.valueQuantity?.value;
      }
      return point;
    })
    .filter((p) => def.series.some((s) => typeof p[s.name] === "number"))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function formatDateTime(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
      <AlertCircle className="mt-0.5 size-4 text-destructive" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

function VitalCard({ def, points, view }: { def: VitalDef; points: Point[]; view: "chart" | "table" }) {
  const unit = points.find((p) => p.unit)?.unit;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-medium">{def.label}</h3>
        <span className="text-xs text-muted-foreground">
          {unit ? unit : ""} {points.length ? `· ${points.length} readings` : ""}
        </span>
      </div>

      {points.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No readings available.</p>
      ) : view === "chart" ? (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              {def.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {def.series.map((s) => (
                <Line
                  key={s.name}
                  type="monotone"
                  dataKey={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              {def.series.map((s) => (
                <TableHead key={s.name} className="text-right">
                  {s.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {points.map((p, i) => (
              <TableRow key={`${p.date}-${i}`}>
                <TableCell>{formatDateTime(p.date)}</TableCell>
                {def.series.map((s) => (
                  <TableCell key={s.name} className="text-right">
                    {typeof p[s.name] === "number" ? `${p[s.name]}${unit ? ` ${unit}` : ""}` : "—"}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function PatientDetailPage() {
  const { id } = Route.useParams();
  const [view, setView] = useState<"chart" | "table">("chart");

  const patientQuery = useQuery({ queryKey: ["patient", id], queryFn: () => getPatient(id) });
  const vitalsQuery = useQuery({ queryKey: ["vitals", id], queryFn: () => getVitalObservations(id) });
  const conditionsQuery = useQuery({ queryKey: ["conditions", id], queryFn: () => getConditions(id) });
  const medsQuery = useQuery({ queryKey: ["medications", id], queryFn: () => getMedicationRequests(id) });
  const labsQuery = useQuery({ queryKey: ["fib4-labs", id], queryFn: () => getLabObservations(id) });


  const patient = patientQuery.data;
  const observations = vitalsQuery.data ?? [];

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-6">
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <ArrowLeft className="size-4" /> Back
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Activity className="size-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {patientQuery.isPending ? "Loading patient…" : patient ? patientDisplayName(patient) : "Patient"}
              </h1>
              <p className="text-sm text-muted-foreground">Patient/{id}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-10 px-6 py-8">
        {/* Demographics */}
        <section>
          {patientQuery.error instanceof Error ? (
            <ErrorBox message={patientQuery.error.message} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {["Full name", "Gender", "Date of birth"].map((label, i) => (
                <div key={label} className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
                  <div className="mt-2 text-base font-medium">
                    {patientQuery.isPending ? (
                      <Skeleton className="h-5 w-28" />
                    ) : i === 0 ? (
                      patient ? patientDisplayName(patient) : "—"
                    ) : i === 1 ? (
                      <Badge variant="outline">{patient?.gender ?? "unknown"}</Badge>
                    ) : (
                      (patient?.birthDate ?? "—")
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Vitals */}
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Vital signs</h2>
            <div className="flex items-center gap-1 rounded-lg border border-border p-1">
              <Button
                size="sm"
                variant={view === "chart" ? "default" : "ghost"}
                aria-pressed={view === "chart"}
                onClick={() => setView("chart")}
              >
                <BarChart3 className="size-4" /> Charts
              </Button>
              <Button
                size="sm"
                variant={view === "table" ? "default" : "ghost"}
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
              >
                <TableIcon className="size-4" /> Table
              </Button>
            </div>
          </div>

          {vitalsQuery.error instanceof Error ? (
            <ErrorBox message={vitalsQuery.error.message} />
          ) : vitalsQuery.isPending ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {VITALS.map((def) => (
                <VitalCard key={def.key} def={def} points={buildPoints(observations, def)} view={view} />
              ))}
            </div>
          )}
        </section>

        {/* Conditions */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Conditions</h2>
          {conditionsQuery.error instanceof Error ? (
            <ErrorBox message={conditionsQuery.error.message} />
          ) : (
            <ConditionsPanel
              conditions={conditionsQuery.data}
              isPending={conditionsQuery.isPending}
            />
          )}
        </section>

        {/* Medications */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Current medications</h2>
          {medsQuery.error instanceof Error ? (
            <ErrorBox message={medsQuery.error.message} />
          ) : (
            <MedicationsPanel medications={medsQuery.data} isPending={medsQuery.isPending} />
          )}
        </section>
      </div>
    </main>
  );
}

/* ---------- Conditions panel ---------- */

function conceptLabel(concept?: { text?: string; coding?: { code?: string; display?: string }[] }): string {
  return (
    concept?.text ??
    concept?.coding?.find((c) => c.display)?.display ??
    concept?.coding?.find((c) => c.code)?.code ??
    ""
  );
}

const RESOLVED_STATUSES = ["resolved", "remission", "inactive"];

function isResolved(c: Condition): boolean {
  return RESOLVED_STATUSES.includes(conceptLabel(c.clinicalStatus).toLowerCase());
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (["resolved", "remission", "completed"].includes(s))
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (["active", "confirmed"].includes(s))
    return "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  if (["inactive", "stopped", "cancelled", "entered-in-error"].includes(s))
    return "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  if (["on-hold", "draft", "provisional", "differential", "unconfirmed"].includes(s))
    return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-300";
}

function StatusBadge({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={statusBadgeClass(value)}>
      {value}
    </Badge>
  );
}

function conditionOnset(c: Condition): string {
  return c.onsetDateTime ?? c.onsetPeriod?.start ?? c.recordedDate ?? "";
}

function conditionAbatement(c: Condition): string {
  return c.abatementDateTime ?? c.abatementPeriod?.end ?? c.abatementPeriod?.start ?? "";
}

function ConditionsPanel({
  conditions,
  isPending,
}: {
  conditions: Condition[] | undefined;
  isPending: boolean;
}) {
  const [selected, setSelected] = useState<Condition | null>(null);

  const columns: Column<Condition>[] = [
    {
      key: "name",
      label: "Condition",
      value: (c) => codeableText(c.code),
      render: (c) => <span className="font-medium">{codeableText(c.code)}</span>,
    },
    {
      key: "clinical",
      label: "Clinical status",
      value: (c) => conceptLabel(c.clinicalStatus),
      filterable: true,
      render: (c) => <StatusBadge value={conceptLabel(c.clinicalStatus)} />,
    },
    {
      key: "verification",
      label: "Verification status",
      value: (c) => conceptLabel(c.verificationStatus),
      filterable: true,
      render: (c) => <StatusBadge value={conceptLabel(c.verificationStatus)} />,
    },
    {
      key: "onset",
      label: "Onset date",
      value: conditionOnset,
      sortAsDate: true,
      render: (c) => formatDateTime(conditionOnset(c)),
    },
    {
      key: "abatement",
      label: "Resolution date",
      value: conditionAbatement,
      sortAsDate: true,
      render: (c) => formatDateTime(conditionAbatement(c)),
    },
  ];

  const fields: DetailField[] = selected
    ? [
        { label: "Condition", value: codeableText(selected.code) },
        { label: "Clinical status", value: <StatusBadge value={conceptLabel(selected.clinicalStatus)} /> },
        {
          label: "Verification status",
          value: <StatusBadge value={conceptLabel(selected.verificationStatus)} />,
        },
        { label: "Category", value: selected.category?.map((c) => codeableText(c)).join(", ") },
        { label: "Severity", value: conceptLabel(selected.severity) },
        { label: "Body site", value: selected.bodySite?.map((b) => codeableText(b)).join(", ") },
        { label: "Onset", value: formatDateTime(conditionOnset(selected)) },
        { label: "Resolution date", value: formatDateTime(conditionAbatement(selected)) },
        { label: "Recorded date", value: formatDateTime(selected.recordedDate) },
        { label: "Codes", value: selected.code?.coding?.map((c) => c.code).filter(Boolean).join(", ") },
        { label: "Encounter", value: selected.encounter?.reference },
        { label: "Recorder", value: selected.recorder?.display ?? selected.recorder?.reference },
        { label: "Asserter", value: selected.asserter?.display ?? selected.asserter?.reference },
        { label: "Notes", value: selected.note?.map((n) => n.text).filter(Boolean).join(" · ") },
        { label: "Last updated", value: formatDateTime(selected.meta?.lastUpdated) },
        { label: "Resource ID", value: selected.id },
      ]
    : [];

  return (
    <>
      <DataTable
        columns={columns}
        rows={conditions}
        isPending={isPending}
        emptyMessage="No conditions recorded."
        searchPlaceholder="Search conditions…"
        onRowClick={setSelected}
        rowClassName={(c) => (isResolved(c) ? "bg-emerald-500/10 hover:bg-emerald-500/15" : undefined)}
      />
      <ResourceDetailDialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected ? codeableText(selected.code) : ""}
        subtitle={selected ? `Condition/${selected.id ?? ""}` : undefined}
        fields={fields}
        raw={selected}
      />
    </>
  );
}

/* ---------- Medications panel ---------- */

function MedicationsPanel({
  medications,
  isPending,
}: {
  medications: MedicationRequest[] | undefined;
  isPending: boolean;
}) {
  const [selected, setSelected] = useState<MedicationRequest | null>(null);

  const columns: Column<MedicationRequest>[] = [
    {
      key: "name",
      label: "Medication",
      value: medicationName,
      render: (m) => <span className="font-medium">{medicationName(m)}</span>,
    },
    {
      key: "status",
      label: "Status",
      value: (m) => m.status ?? "unknown",
      filterable: true,
      render: (m) => <StatusBadge value={m.status ?? "unknown"} />,
    },
    {
      key: "intent",
      label: "Intent",
      value: (m) => m.intent ?? "",
      filterable: true,
    },
    {
      key: "authoredOn",
      label: "Authored on",
      value: (m) => m.authoredOn ?? "",
      sortAsDate: true,
      render: (m) => formatDateTime(m.authoredOn),
    },
  ];

  const dosage = selected?.dosageInstruction?.[0];
  const fields: DetailField[] = selected
    ? [
        { label: "Medication", value: medicationName(selected) },
        { label: "Status", value: <StatusBadge value={selected.status ?? "unknown"} /> },
        { label: "Intent", value: selected.intent },
        { label: "Priority", value: selected.priority },
        { label: "Authored on", value: formatDateTime(selected.authoredOn) },
        { label: "Category", value: selected.category?.map((c) => codeableText(c)).join(", ") },
        { label: "Reason", value: selected.reasonCode?.map((c) => codeableText(c)).join(", ") },
        {
          label: "Codes",
          value: selected.medicationCodeableConcept?.coding
            ?.map((c) => c.code)
            .filter(Boolean)
            .join(", "),
        },
        { label: "Dosage", value: dosage?.text },
        { label: "Route", value: conceptLabel(dosage?.route) },
        {
          label: "Dose",
          value: dosage?.doseAndRate?.[0]?.doseQuantity
            ? `${dosage.doseAndRate[0].doseQuantity.value ?? ""} ${dosage.doseAndRate[0].doseQuantity.unit ?? ""}`.trim()
            : undefined,
        },
        {
          label: "Frequency",
          value: dosage?.timing?.repeat
            ? `${dosage.timing.repeat.frequency ?? ""}× / ${dosage.timing.repeat.period ?? ""} ${dosage.timing.repeat.periodUnit ?? ""}`.trim()
            : undefined,
        },
        { label: "As needed", value: dosage?.asNeededBoolean === undefined ? undefined : dosage.asNeededBoolean ? "Yes" : "No" },
        { label: "Refills allowed", value: selected.dispenseRequest?.numberOfRepeatsAllowed?.toString() },
        {
          label: "Validity period",
          value: selected.dispenseRequest?.validityPeriod
            ? `${formatDateTime(selected.dispenseRequest.validityPeriod.start)} → ${formatDateTime(selected.dispenseRequest.validityPeriod.end)}`
            : undefined,
        },
        { label: "Requester", value: selected.requester?.display ?? selected.requester?.reference },
        { label: "Encounter", value: selected.encounter?.reference },
        { label: "Notes", value: selected.note?.map((n) => n.text).filter(Boolean).join(" · ") },
        { label: "Last updated", value: formatDateTime(selected.meta?.lastUpdated) },
        { label: "Resource ID", value: selected.id },
      ]
    : [];

  return (
    <>
      <DataTable
        columns={columns}
        rows={medications}
        isPending={isPending}
        emptyMessage="No medication requests found."
        searchPlaceholder="Search medications…"
        onRowClick={setSelected}
      />
      <ResourceDetailDialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected ? medicationName(selected) : ""}
        subtitle={selected ? `MedicationRequest/${selected.id ?? ""}` : undefined}
        fields={fields}
        raw={selected}
      />
    </>
  );
}

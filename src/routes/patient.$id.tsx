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
  getMedicationRequests,
  getPatient,
  getVitalObservations,
  medicationName,
  observationCode,
  observationDate,
  patientDisplayName,
  type Observation,
} from "@/lib/fhir";

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
    series: [
      { name: "Systolic", componentCode: "8480-6", color: "var(--chart-1)" },
      { name: "Diastolic", componentCode: "8462-4", color: "var(--chart-4)" },
    ],
  },
];

type Point = { date: string; label: string; unit?: string | undefined } & Record<string, string | number | undefined>;

function buildPoints(observations: Observation[], def: VitalDef): Point[] {
  return observations
    .filter((o) => observationCode(o) === def.code)
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
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Condition</TableHead>
                    <TableHead>Onset date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conditionsQuery.isPending && (
                    <TableRow>
                      <TableCell colSpan={2}>
                        <Skeleton className="h-4 w-40" />
                      </TableCell>
                    </TableRow>
                  )}
                  {conditionsQuery.data?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                        No conditions recorded.
                      </TableCell>
                    </TableRow>
                  )}
                  {conditionsQuery.data?.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{codeableText(c.code)}</TableCell>
                      <TableCell>
                        {formatDateTime(c.onsetDateTime ?? c.onsetPeriod?.start ?? c.recordedDate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        {/* Medications */}
        <section>
          <h2 className="mb-4 text-lg font-semibold">Current medications</h2>
          {medsQuery.error instanceof Error ? (
            <ErrorBox message={medsQuery.error.message} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medication</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {medsQuery.isPending && (
                    <TableRow>
                      <TableCell colSpan={2}>
                        <Skeleton className="h-4 w-40" />
                      </TableCell>
                    </TableRow>
                  )}
                  {medsQuery.data?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                        No medication requests found.
                      </TableCell>
                    </TableRow>
                  )}
                  {medsQuery.data?.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{medicationName(m)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{m.status ?? "unknown"}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

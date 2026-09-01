import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, ChevronDown, ChevronUp, ChevronsUpDown, Loader2, Pencil, Plus, Search, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  createPatient,
  deletePatient,
  getLabObservationsForPatients,
  patientDisplayName,
  searchPatients,
  updatePatient,
  type Gender,
  type Observation,
  type Patient,
  type PatientInput,
} from "@/lib/fhir";
import { FIB4_LOINC, calculateFIB4, pickLatestObservation } from "@/lib/fib4";
import {
  FibrosisRiskBadge,
  fibrosisRiskStatus,
  type FibrosisRiskStatus,
} from "@/components/fibrosis-risk-badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fibrosis Care — FHIR-enabled patient registry & liver fibrosis assessment" },
      {
        name: "description",
        content:
          "Search, create and update patient records live on a FHIR R4 server. Full name, gender, date of birth and liver fibrosis risk in one clinical workspace.",
      },
      { property: "og:title", content: "Fibrosis Care" },
      {
        property: "og:description",
        content: "FHIR-enabled patient registry & liver fibrosis assessment.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PatientsPage,
});

const GENDERS: Gender[] = ["male", "female", "other", "unknown"];

const emptyForm: PatientInput = { given: "", family: "", gender: "unknown", birthDate: "" };

type FormErrors = Partial<Record<keyof PatientInput, string>>;

function validate(form: PatientInput): FormErrors {
  const errors: FormErrors = {};
  if (!form.given.trim()) errors.given = "Given name is required.";
  if (!form.family.trim()) errors.family = "Family name is required.";
  if (!GENDERS.includes(form.gender)) errors.gender = "Select a gender.";
  if (!form.birthDate) {
    errors.birthDate = "Date of birth is required.";
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(form.birthDate)) {
    errors.birthDate = "Use the format YYYY-MM-DD.";
  } else {
    const date = new Date(`${form.birthDate}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) errors.birthDate = "Not a valid date.";
    else if (date.getTime() > Date.now()) errors.birthDate = "Date of birth cannot be in the future.";
  }
  return errors;
}

function genderBadgeClass(gender: Gender): string {
  switch (gender) {
    case "male":
      return "bg-sky-100 text-sky-800 hover:bg-sky-200 dark:bg-sky-900/30 dark:text-sky-300";
    case "female":
      return "bg-rose-100 text-rose-800 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-300";
    case "other":
      return "bg-violet-100 text-violet-800 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300";
    case "unknown":
    default:
      return "bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-900/30 dark:text-slate-300";
  }
}

type SortKey = "name" | "gender" | "birthDate" | "risk";
type SortState = { key: SortKey; direction: "asc" | "desc" } | null;

/** Clinical priority order used when sorting the Fibrosis risk column. */
const RISK_PRIORITY: Record<FibrosisRiskStatus, number> = {
  high: 0,
  intermediate: 1,
  low: 2,
  "no-data": 3,
  "not-applicable": 4,
};

function SortableHead({
  sortKey,
  sort,
  onSort,
  className,
  children,
}: {
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const active = sort?.key === sortKey;
  const direction = active ? sort!.direction : null;
  const Icon = !active ? ChevronsUpDown : direction === "asc" ? ChevronUp : ChevronDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="-mx-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {children}
        <Icon className={`size-3.5 ${active ? "text-foreground" : "text-muted-foreground/60"}`} aria-hidden="true" />
      </button>
    </TableHead>
  );
}

function PatientsPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState<Patient | null>(null);
  const [form, setForm] = useState<PatientInput>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [sort, setSort] = useState<SortState>(null);

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current && current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  }

  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchTerm), 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const patientsQuery = useQuery({
    queryKey: ["patients", query],
    queryFn: () => searchPatients(query),
  });

  const save = useMutation({
    mutationFn: async (input: PatientInput) =>
      editing?.id ? updatePatient(editing.id, input) : createPatient(input),
    onSuccess: (patient) => {
      toast.success(editing ? "Patient updated" : "Patient created", {
        description: patientDisplayName(patient),
      });
      setDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (error: Error) => toast.error("Save failed", { description: error.message }),
  });

  const remove = useMutation({
    mutationFn: async (patient: Patient) => deletePatient(patient.id!),
    onSuccess: (_, patient) => {
      toast.success("Patient deleted", { description: patientDisplayName(patient) });
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (error: Error) => toast.error("Delete failed", { description: error.message }),
  });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(patient: Patient) {
    const name = patient.name?.[0];
    setEditing(patient);
    setForm({
      given: name?.given?.join(" ") ?? "",
      family: name?.family ?? "",
      gender: patient.gender ?? "unknown",
      birthDate: patient.birthDate ?? "",
    });
    setErrors({});
    setDialogOpen(true);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    save.mutate(form);
  }

  const patients = patientsQuery.data ?? [];
  const errorMessage = patientsQuery.error instanceof Error ? patientsQuery.error.message : null;
  const countLabel = useMemo(
    () => `${patients.length} patient${patients.length === 1 ? "" : "s"}`,
    [patients.length],
  );

  const patientIds = patients.map((p) => p.id).filter((id): id is string => !!id);
  const labsQuery = useQuery({
    queryKey: ["fib4-labs-bulk", patientIds],
    queryFn: () => getLabObservationsForPatients(patientIds),
    enabled: patientIds.length > 0,
  });

  const fib4ByPatient = useMemo(() => {
    const labs: Record<string, Observation[]> = labsQuery.data ?? {};
    const map = new Map<string, ReturnType<typeof calculateFIB4>>();
    for (const patient of patients) {
      if (!patient.id) continue;
      const own = labs[patient.id];
      map.set(
        patient.id,
        calculateFIB4({
          birthDate: patient.birthDate ?? null,
          astObservation: pickLatestObservation(own, FIB4_LOINC.ast),
          altObservation: pickLatestObservation(own, FIB4_LOINC.alt),
          plateletObservation: pickLatestObservation(own, FIB4_LOINC.platelets),
        }),
      );
    }
    return map;
  }, [patients, labsQuery.data]);

  const sortedPatients = useMemo(() => {
    if (!sort) return patients;
    const dir = sort.direction === "asc" ? 1 : -1;
    const name = (p: Patient) => patientDisplayName(p).toLocaleLowerCase();
    const rows = [...patients];
    rows.sort((a, b) => {
      switch (sort.key) {
        case "name":
          return dir * name(a).localeCompare(name(b));
        case "gender":
          return dir * (a.gender ?? "unknown").localeCompare(b.gender ?? "unknown");
        case "birthDate": {
          const av = a.birthDate ? Date.parse(`${a.birthDate}T00:00:00Z`) : Number.NaN;
          const bv = b.birthDate ? Date.parse(`${b.birthDate}T00:00:00Z`) : Number.NaN;
          if (Number.isNaN(av) && Number.isNaN(bv)) return name(a).localeCompare(name(b));
          if (Number.isNaN(av)) return 1;
          if (Number.isNaN(bv)) return -1;
          return dir * (av - bv);
        }
        case "risk": {
          const ra = a.id ? fib4ByPatient.get(a.id) : undefined;
          const rb = b.id ? fib4ByPatient.get(b.id) : undefined;
          const sa = ra ? fibrosisRiskStatus(ra) : "no-data";
          const sb = rb ? fibrosisRiskStatus(rb) : "no-data";
          if (sa !== sb) return dir * (RISK_PRIORITY[sa] - RISK_PRIORITY[sb]);
          const scoreA = ra?.score ?? null;
          const scoreB = rb?.score ?? null;
          if (scoreA !== null && scoreB !== null && scoreA !== scoreB) {
            return dir * (scoreB - scoreA);
          }
          return name(a).localeCompare(name(b));
        }
        default:
          return 0;
      }
    });
    return rows;
  }, [patients, sort, fib4ByPatient]);




  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Activity className="size-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Fibrosis Care</h1>
              <p className="text-sm text-muted-foreground">FHIR-enabled patient registry & liver fibrosis assessment</p>
            </div>
          </div>
          <Button onClick={openCreate}>
            <Plus className="size-4" /> New patient
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold tracking-tight">Patient Registry</h2>
          <p className="text-sm text-muted-foreground">Live FHIR R4 patient records</p>
        </div>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name (partial matches)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search patients by name"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {patientsQuery.isFetching && <Loader2 className="size-4 animate-spin" />}
            <span>{patientsQuery.isSuccess ? countLabel : "Loading…"}</span>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <AlertCircle className="mt-0.5 size-4 text-destructive" />
            <div className="space-y-2">
              <p className="font-medium text-destructive">Could not load patients</p>
              <p className="text-muted-foreground">{errorMessage}</p>
              <Button size="sm" variant="outline" onClick={() => void patientsQuery.refetch()}>
                Try again
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <TooltipProvider delayDuration={150}>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead sortKey="name" sort={sort} onSort={toggleSort}>Full name</SortableHead>
                <SortableHead sortKey="gender" sort={sort} onSort={toggleSort}>Gender</SortableHead>
                <SortableHead sortKey="birthDate" sort={sort} onSort={toggleSort}>Date of birth</SortableHead>
                <SortableHead sortKey="risk" sort={sort} onSort={toggleSort}>Fibrosis risk</SortableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patientsQuery.isPending &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {!patientsQuery.isPending && patients.length === 0 && !errorMessage && (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    <UserRound className="mx-auto mb-2 size-6" />
                    No patients found on the FHIR server.
                  </TableCell>
                </TableRow>
              )}

              {sortedPatients.map((patient) => (
                <TableRow key={patient.id}>
                  <TableCell className="font-medium">
                    <Link
                      to="/patient/$id"
                      params={{ id: patient.id! }}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {patientDisplayName(patient)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={genderBadgeClass(patient.gender ?? "unknown")}>
                      {patient.gender ?? "unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell>{patient.birthDate ?? "—"}</TableCell>
                  <TableCell>
                    {labsQuery.isPending ? (
                      <Skeleton className="h-5 w-20" />
                    ) : (
                      (() => {
                        const result = patient.id ? fib4ByPatient.get(patient.id) : undefined;
                        return result ? <FibrosisRiskBadge result={result} /> : "—";
                      })()
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(patient)}>
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label="Delete patient"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleting(patient)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </TooltipProvider>
        </div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit patient" : "New patient"}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Updates Patient/${editing.id} on the FHIR server.`
                : "Creates a FHIR R4 Patient resource on the server."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="given">Given name(s)</Label>
                <Input
                  id="given"
                  value={form.given}
                  onChange={(e) => setForm((f) => ({ ...f, given: e.target.value }))}
                />
                {errors.given && <p className="text-xs text-destructive">{errors.given}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="family">Family name</Label>
                <Input
                  id="family"
                  value={form.family}
                  onChange={(e) => setForm((f) => ({ ...f, family: e.target.value }))}
                />
                {errors.family && <p className="text-xs text-destructive">{errors.family}</p>}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select
                  value={form.gender}
                  onValueChange={(value) => setForm((f) => ({ ...f, gender: value as Gender }))}
                >
                  <SelectTrigger id="gender">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.gender && <p className="text-xs text-destructive">{errors.gender}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="birthDate">Date of birth</Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                />
                {errors.birthDate && <p className="text-xs text-destructive">{errors.birthDate}</p>}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save changes" : "Create patient"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete patient</DialogTitle>
            <DialogDescription>
              This will permanently remove {deleting ? patientDisplayName(deleting) : "this patient"} from the FHIR server.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting)}
            >
              {remove.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

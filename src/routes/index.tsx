import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, Loader2, Pencil, Plus, Search, Trash2, UserRound } from "lucide-react";
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
import { FibrosisRiskBadge } from "@/components/fibrosis-risk-badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FHIR Patient Registry — Manage Patient Records" },
      {
        name: "description",
        content:
          "Search, create and update patient records live on a FHIR R4 server. Full name, gender and date of birth in one clinical workspace.",
      },
      { property: "og:title", content: "FHIR Patient Registry" },
      {
        property: "og:description",
        content: "Search, create and update FHIR R4 patient records in real time.",
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

function PatientsPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState<Patient | null>(null);
  const [form, setForm] = useState<PatientInput>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});

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


  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Activity className="size-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Patient Registry</h1>
              <p className="text-sm text-muted-foreground">Live FHIR R4 patient records</p>
            </div>
          </div>
          <Button onClick={openCreate}>
            <Plus className="size-4" /> New patient
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-8">
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

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
              <TableHead>Full name</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Date of birth</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patientsQuery.isPending &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {!patientsQuery.isPending && patients.length === 0 && !errorMessage && (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                    <UserRound className="mx-auto mb-2 size-6" />
                    No patients found on the FHIR server.
                  </TableCell>
                </TableRow>
              )}

              {patients.map((patient) => (
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

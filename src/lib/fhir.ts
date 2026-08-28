export type Gender = "male" | "female" | "other" | "unknown";

export type HumanName = {
  use?: string;
  family?: string;
  given?: string[];
  text?: string;
};

export type Patient = {
  resourceType: "Patient";
  id?: string;
  meta?: { versionId?: string; lastUpdated?: string };
  name?: HumanName[];
  gender?: Gender;
  birthDate?: string;
};

export type Bundle = {
  resourceType: "Bundle";
  total?: number;
  entry?: { resource?: Patient }[];
};

const BASE = "/api/fhir";

async function parseError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as {
      error?: string;
      issue?: { diagnostics?: string; details?: { text?: string } }[];
    };
    if (json.error) return json.error;
    const issue = json.issue?.[0];
    if (issue) return issue.diagnostics ?? issue.details?.text ?? `Request failed (${res.status})`;
  } catch {
    /* not JSON */
  }
  return text.slice(0, 200) || `Request failed (${res.status})`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    ...init,
    headers: { Accept: "application/fhir+json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as T;
}

export function patientDisplayName(patient: Patient): string {
  const name = patient.name?.[0];
  if (!name) return "(no name)";
  const composed = [name.given?.join(" "), name.family].filter(Boolean).join(" ").trim();
  return composed || name.text || "(no name)";
}

export async function searchPatients(name: string): Promise<Patient[]> {
  const params = new URLSearchParams({ _count: "50", _sort: "-_lastUpdated" });
  const trimmed = name.trim();
  if (trimmed) params.set("name", trimmed);
  const bundle = await request<Bundle>(`Patient?${params.toString()}`);
  return (bundle.entry ?? [])
    .map((e) => e.resource)
    .filter((r): r is Patient => r?.resourceType === "Patient");
}

export type PatientInput = {
  given: string;
  family: string;
  gender: Gender;
  birthDate: string;
};

export function toPatientResource(input: PatientInput, id?: string): Patient {
  return {
    resourceType: "Patient",
    ...(id ? { id } : {}),
    name: [
      {
        use: "official",
        family: input.family.trim(),
        given: input.given.trim().split(/\s+/).filter(Boolean),
      },
    ],
    gender: input.gender,
    birthDate: input.birthDate,
  };
}

export async function createPatient(input: PatientInput): Promise<Patient> {
  return request<Patient>("Patient", {
    method: "POST",
    headers: { "Content-Type": "application/fhir+json" },
    body: JSON.stringify(toPatientResource(input)),
  });
}

export async function updatePatient(id: string, input: PatientInput): Promise<Patient> {
  return request<Patient>(`Patient/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/fhir+json" },
    body: JSON.stringify(toPatientResource(input, id)),
  });
}

export async function deletePatient(id: string): Promise<void> {
  await request(`Patient/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/* ---------- Patient read ---------- */

export async function getPatient(id: string): Promise<Patient> {
  return request<Patient>(`Patient/${encodeURIComponent(id)}`);
}

/* ---------- Observations (vitals) ---------- */

export type Coding = { system?: string; code?: string; display?: string };
export type CodeableConcept = { coding?: Coding[]; text?: string };
export type Quantity = { value?: number; unit?: string };

export type Observation = {
  resourceType: "Observation";
  id?: string;
  status?: string;
  code?: CodeableConcept;
  effectiveDateTime?: string;
  effectivePeriod?: { start?: string };
  issued?: string;
  valueQuantity?: Quantity;
  component?: { code?: CodeableConcept; valueQuantity?: Quantity }[];
};

export type Condition = {
  resourceType: "Condition";
  id?: string;
  code?: CodeableConcept;
  onsetDateTime?: string;
  onsetPeriod?: { start?: string };
  recordedDate?: string;
  clinicalStatus?: CodeableConcept;
};

export type MedicationRequest = {
  resourceType: "MedicationRequest";
  id?: string;
  status?: string;
  medicationCodeableConcept?: CodeableConcept;
  medicationReference?: { display?: string; reference?: string };
  authoredOn?: string;
};

type AnyBundle<T> = {
  resourceType: "Bundle";
  total?: number;
  entry?: { resource?: T }[];
};

function collect<T extends { resourceType?: string }>(
  bundle: AnyBundle<T>,
  resourceType: string,
): T[] {
  return (bundle.entry ?? [])
    .map((e) => e.resource)
    .filter((r): r is T => r?.resourceType === resourceType);
}

export const VITAL_CODES = [
  "8867-4",
  "8310-5",
  "9279-1",
  "59408-5",
  "8302-2",
  "29463-7",
  "39156-5",
  "55284-4",
] as const;

export function observationCode(obs: Observation): string | undefined {
  return obs.code?.coding?.find((c) => c.code)?.code;
}

export function observationDate(obs: Observation): string | undefined {
  return obs.effectiveDateTime ?? obs.effectivePeriod?.start ?? obs.issued;
}

export function componentValue(obs: Observation, code: string): number | undefined {
  const comp = obs.component?.find((c) => c.code?.coding?.some((cc) => cc.code === code));
  return comp?.valueQuantity?.value;
}

export function codeableText(concept?: CodeableConcept): string {
  return concept?.text ?? concept?.coding?.find((c) => c.display)?.display ?? "(unknown)";
}

export async function getVitalObservations(patientId: string): Promise<Observation[]> {
  const params = new URLSearchParams({
    subject: `Patient/${patientId}`,
    code: VITAL_CODES.join(","),
    _count: "500",
  });
  const bundle = await request<AnyBundle<Observation>>(`Observation?${params.toString()}`);
  return collect(bundle, "Observation");
}

export async function getConditions(patientId: string): Promise<Condition[]> {
  const params = new URLSearchParams({ patient: patientId, _count: "200" });
  const bundle = await request<AnyBundle<Condition>>(`Condition?${params.toString()}`);
  return collect(bundle, "Condition");
}

export async function getMedicationRequests(patientId: string): Promise<MedicationRequest[]> {
  const params = new URLSearchParams({ patient: patientId, _count: "200" });
  const bundle = await request<AnyBundle<MedicationRequest>>(
    `MedicationRequest?${params.toString()}`,
  );
  return collect(bundle, "MedicationRequest");
}

export function medicationName(med: MedicationRequest): string {
  if (med.medicationCodeableConcept) return codeableText(med.medicationCodeableConcept);
  return med.medicationReference?.display ?? "(unknown medication)";
}

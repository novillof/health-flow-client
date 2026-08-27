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

import type { Observation } from "@/lib/fhir";

export const FIB4_LOINC = {
  ast: "1920-8",
  alt: "1742-6",
  platelets: "777-3",
} as const;

export type Fib4Category = "low" | "intermediate" | "high" | "insufficient-data";

export type Fib4Result = {
  eligible: boolean;
  age: number | null;
  score: number | null;
  category: Fib4Category;
  ast: number | null;
  alt: number | null;
  platelets: number | null;
  astUnit: string | null;
  altUnit: string | null;
  plateletsUnit: string | null;
  astDate: string | null;
  altDate: string | null;
  plateletsDate: string | null;
  missingInputs: string[];
  /** Reason the score was not produced, when applicable. */
  reason: "ok" | "missing-birthdate" | "invalid-birthdate" | "under-35" | "missing-labs";
};

/** Age in whole years at today's date, or null when the birthDate is absent/invalid. */
export function calculateAge(birthDate?: string | null, now: Date = new Date()): number | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() > now.getTime()) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  if (age < 0 || age > 130) return null;
  return age;
}

function observationDateValue(obs: Observation): string | null {
  return obs.effectiveDateTime ?? obs.effectivePeriod?.start ?? obs.issued ?? null;
}

function matchesLoinc(obs: Observation, code: string): boolean {
  return (obs.code?.coding ?? []).some(
    (c) => c.code === code && (!c.system || c.system === "http://loinc.org"),
  );
}

/** Most recent observation with a valid positive numeric value for the given LOINC code. */
export function pickLatestObservation(
  observations: Observation[] | undefined,
  code: string,
): Observation | null {
  const candidates = (observations ?? []).filter((o) => {
    if (!matchesLoinc(o, code)) return false;
    const v = o.valueQuantity?.value;
    return typeof v === "number" && Number.isFinite(v) && v > 0;
  });
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const ta = new Date(observationDateValue(a) ?? 0).getTime() || 0;
    const tb = new Date(observationDateValue(b) ?? 0).getTime() || 0;
    return tb - ta;
  });
  return sorted[0] ?? null;
}

type Lab = { value: number | null; unit: string | null; date: string | null };

function readLab(obs: Observation | null | undefined): Lab {
  const v = obs?.valueQuantity?.value;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
    return { value: null, unit: null, date: null };
  }
  return {
    value: v,
    unit: obs?.valueQuantity?.unit ?? null,
    date: obs ? observationDateValue(obs) : null,
  };
}

export function fib4Category(score: number, age: number): Exclude<Fib4Category, "insufficient-data"> {
  const lowCut = age >= 65 ? 2.0 : 1.3;
  if (score < lowCut) return "low";
  if (score <= 2.67) return "intermediate";
  return "high";
}

export function calculateFIB4({
  birthDate,
  astObservation,
  altObservation,
  plateletObservation,
  now,
}: {
  birthDate?: string | null;
  astObservation?: Observation | null;
  altObservation?: Observation | null;
  plateletObservation?: Observation | null;
  now?: Date;
}): Fib4Result {
  const ast = readLab(astObservation);
  const alt = readLab(altObservation);
  const plt = readLab(plateletObservation);

  const base: Fib4Result = {
    eligible: false,
    age: null,
    score: null,
    category: "insufficient-data",
    ast: ast.value,
    alt: alt.value,
    platelets: plt.value,
    astUnit: ast.unit,
    altUnit: alt.unit,
    plateletsUnit: plt.unit,
    astDate: ast.date,
    altDate: alt.date,
    plateletsDate: plt.date,
    missingInputs: [],
    reason: "ok",
  };

  if (!birthDate) return { ...base, reason: "missing-birthdate", missingInputs: ["Date of birth"] };

  const age = calculateAge(birthDate, now);
  if (age === null) return { ...base, reason: "invalid-birthdate", missingInputs: ["Date of birth"] };

  if (age < 35) return { ...base, age, reason: "under-35" };

  const missingInputs: string[] = [];
  if (ast.value === null) missingInputs.push("AST");
  if (alt.value === null) missingInputs.push("ALT");
  if (plt.value === null) missingInputs.push("Platelet count");

  if (missingInputs.length > 0) {
    return { ...base, age, eligible: true, missingInputs, reason: "missing-labs" };
  }

  const raw = (age * (ast.value as number)) / ((plt.value as number) * Math.sqrt(alt.value as number));
  const score = Math.round(raw * 100) / 100;

  return {
    ...base,
    age,
    eligible: true,
    score,
    category: fib4Category(score, age),
  };
}

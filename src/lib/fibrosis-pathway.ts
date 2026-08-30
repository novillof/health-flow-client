import type { CarePlan, Condition, Patient } from "@/lib/fhir";
import { patientDisplayName } from "@/lib/fhir";

export const FIBROSIS_PATHWAY_TITLE = "Fibrosis Follow-up Pathway";

export const FIBROSIS_PATHWAY_STEPS = [
  "High FIB-4 identified",
  "Secondary fibrosis assessment recommended",
  "Clinical review",
  "Follow-up assessment",
] as const;

export const FIBROSIS_PATHWAY_NOTE =
  "High FIB-4 should prompt secondary assessment and clinical review; this workflow is for demonstration purposes and does not replace local clinical guidelines.";

export const FIBROSIS_PATHWAY_TRIGGER = "High FIB-4 result";

/** True when a CarePlan represents an active fibrosis follow-up enrollment. */
export function isFibrosisPathway(plan: CarePlan): boolean {
  return (plan.title ?? "").trim().toLowerCase() === FIBROSIS_PATHWAY_TITLE.toLowerCase();
}

export function findActiveFibrosisPathway(plans: CarePlan[] | undefined): CarePlan | null {
  return (
    (plans ?? []).find((p) => isFibrosisPathway(p) && (p.status ?? "active") === "active") ?? null
  );
}

/** FIB-4 score recorded on the pathway, parsed back from its description. */
export function pathwayFib4Score(plan: CarePlan): string | null {
  const match = /FIB-4(?:\s+score)?:?\s*([0-9]+(?:\.[0-9]+)?)/i.exec(plan.description ?? "");
  return match?.[1] ?? null;
}

export function pathwayEnrolledDate(plan: CarePlan): string | null {
  const value = plan.period?.start ?? plan.created ?? plan.meta?.lastUpdated ?? null;
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 10);
}

/**
 * Builds the FHIR CarePlan used to enroll a patient in the fibrosis follow-up
 * pathway. Read-only with respect to existing Conditions and Observations: it
 * only references them.
 */
export function buildFibrosisCarePlan({
  patient,
  score,
  addresses,
  now = new Date(),
}: {
  patient: Patient;
  score: number;
  addresses?: Condition[];
  now?: Date;
}): CarePlan {
  const created = now.toISOString();
  return {
    resourceType: "CarePlan",
    status: "active",
    intent: "plan",
    title: FIBROSIS_PATHWAY_TITLE,
    description: `Follow-up pathway for additional liver fibrosis assessment. Trigger: ${FIBROSIS_PATHWAY_TRIGGER}. FIB-4 score: ${score.toFixed(2)}. Monitoring and follow-up only — not a diagnosis of liver fibrosis.`,
    created,
    period: { start: created },
    category: [{ text: "Liver fibrosis risk follow-up" }],
    subject: {
      reference: `Patient/${patient.id}`,
      display: patientDisplayName(patient),
    },
    ...((addresses ?? []).length > 0
      ? {
          addresses: (addresses ?? [])
            .filter((c) => c.id)
            .map((c) => ({
              reference: `Condition/${c.id}`,
              display: c.code?.text ?? c.code?.coding?.find((x) => x.display)?.display ?? undefined,
            })),
        }
      : {}),
    activity: FIBROSIS_PATHWAY_STEPS.map((description) => ({
      detail: { status: "not-started", kind: "Task", description },
    })),
    note: [{ text: FIBROSIS_PATHWAY_NOTE }],
  };
}

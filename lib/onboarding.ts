export type OnboardingSnapshot = {
  organizationName: string;
  senderName: string;
  senderEmail: string | null;
  propertyCount: number;
  unitCount: number;
  tenantCount: number;
  providerCount: number;
};

export type OnboardingStepKey = "organization" | "inventory" | "tenants" | "providers";

export function getOnboardingProgress(snapshot: OnboardingSnapshot) {
  const completed: Record<OnboardingStepKey, boolean> = {
    organization: snapshot.organizationName.trim().length >= 2
      && snapshot.senderName.trim().length >= 2
      && Boolean(snapshot.senderEmail?.trim()),
    inventory: snapshot.propertyCount > 0 && snapshot.unitCount > 0,
    tenants: snapshot.tenantCount > 0,
    providers: snapshot.providerCount > 0
  };
  const completedCount = Object.values(completed).filter(Boolean).length;

  return {
    completed,
    completedCount,
    totalCount: 4,
    percent: completedCount * 25,
    isComplete: completedCount === 4
  };
}

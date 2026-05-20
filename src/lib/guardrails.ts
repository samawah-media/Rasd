import type { UsageLimit } from "./types";

export type UsageSnapshot = {
  xReadsToday: number;
  xReadsThisMonth: number;
  aiTokensThisMonth: number;
  screenshotsThisMonth: number;
  storageMb: number;
};

export type CostOperation =
  | { type: "x_read"; units: number }
  | { type: "ai_tokens"; units: number }
  | { type: "screenshot"; units: number }
  | { type: "storage_mb"; units: number };

export function checkBudget(
  limits: UsageLimit,
  usage: UsageSnapshot,
  operation: CostOperation,
) {
  const next = { ...usage };

  if (operation.type === "x_read") {
    next.xReadsToday += operation.units;
    next.xReadsThisMonth += operation.units;
  }

  if (operation.type === "ai_tokens") {
    next.aiTokensThisMonth += operation.units;
  }

  if (operation.type === "screenshot") {
    next.screenshotsThisMonth += operation.units;
  }

  if (operation.type === "storage_mb") {
    next.storageMb += operation.units;
  }

  const violations = [
    next.xReadsToday > limits.maxXReadsPerDay && "تجاوز حد X اليومي",
    next.xReadsThisMonth > limits.maxXReadsPerMonth && "تجاوز حد X الشهري",
    next.aiTokensThisMonth > limits.maxAiTokensPerMonth && "تجاوز حد AI الشهري",
    next.screenshotsThisMonth > limits.maxScreenshotsPerMonth &&
      "تجاوز حد لقطات الشاشة",
    next.storageMb > limits.maxStorageMb && "تجاوز حد التخزين",
  ].filter(Boolean) as string[];

  return {
    allowed: violations.length === 0 || !limits.hardStopEnabled,
    violations,
    nextUsage: next,
    warningThresholdPercent: limits.warningThresholdPercent,
  };
}

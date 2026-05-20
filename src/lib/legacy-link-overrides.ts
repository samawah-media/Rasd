import linkOverrides from "../../data/imports/hidayathon_link_overrides.json";

export type LegacyLinkOverrideStatus = "verified" | "needs_review";

export type LegacyLinkOverride = {
  originalUrl?: string;
  status?: LegacyLinkOverrideStatus;
  note?: string;
  verifiedAt?: string;
  verifiedBy?: string;
};

export type LinkOverridesFile = {
  version: number;
  updated_at: string | null;
  items: Record<string, LegacyLinkOverride>;
};

const overrides = linkOverrides as LinkOverridesFile;

export function getLegacyLinkOverrides() {
  return overrides;
}

export function getLegacyLinkOverrideForItemId(itemId: string) {
  return overrides.items[itemId] ?? null;
}

export function getOpenableOverrideUrl(itemId: string) {
  return getOpenableOverrideUrlFromOverrides(overrides, itemId);
}

export function getLegacyLinkOverrideForItemIdFromOverrides(input: LinkOverridesFile, itemId: string) {
  return input.items[itemId] ?? null;
}

export function getOpenableOverrideUrlFromOverrides(input: LinkOverridesFile, itemId: string) {
  const override = getLegacyLinkOverrideForItemIdFromOverrides(input, itemId);
  return isOpenableHttpUrl(override?.originalUrl) ? override?.originalUrl?.trim() ?? null : null;
}

export function isOpenableHttpUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

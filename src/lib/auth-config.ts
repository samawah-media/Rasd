import type { Role } from "@/lib/types";

export const RASD_OWNER_EMAIL = (process.env.RASD_OWNER_EMAIL ?? "samawah.pod@gmail.com").toLowerCase();

export const DEFAULT_ORGANIZATION_ID = stableUuid("rasd:default:organization");
export const DEFAULT_ORGANIZATION_NAME = "رصد هداية هاكثون";
export const DEFAULT_ORGANIZATION_SLUG = "rasd-hidayathon";
export const DEFAULT_TOPIC_ID = stableUuid("rasd:default:topic");
export const DEFAULT_MANUAL_SOURCE_ID = stableUuid("rasd:default:source:manual");
export const DEFAULT_REPORT_ID = stableUuid("rasd:default:report:hidayathon");
export const DEFAULT_TEMPLATE_ID = stableUuid("rasd:default:template:hidayathon");
export const DEFAULT_USAGE_LIMIT_ID = stableUuid("rasd:default:usage-limit");

export const LEGACY_ORGANIZATION_ID = stableUuid("legacy:hidayathon:organization");
export const LEGACY_ORGANIZATION_NAME = "رصد هداية هاكثون - الأرشيف القديم";
export const LEGACY_ORGANIZATION_SLUG = "legacy-hidayathon";

export const adminRoles: Role[] = ["owner", "editor"];
export const memberRoles: Role[] = ["owner", "editor", "viewer"];
export const ownerRoles: Role[] = ["owner"];

export function isRoleAllowed(role: Role | null | undefined, allowed: readonly Role[]) {
  return Boolean(role && allowed.includes(role));
}

export function isAdminRole(role: Role | null | undefined) {
  return isRoleAllowed(role, adminRoles);
}

export function defaultPathForRole(role: Role | null | undefined) {
  return isAdminRole(role) ? "/" : "/client-report";
}

export function isAuthPath(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/auth/");
}

export function isClientPath(pathname: string) {
  return pathname === "/client-report" || pathname.startsWith("/client-report/");
}

export function isAdminPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/feed" ||
    pathname.startsWith("/feed/") ||
    pathname === "/ops" ||
    pathname.startsWith("/ops/") ||
    pathname === "/access" ||
    pathname.startsWith("/access/") ||
    pathname === "/imports" ||
    pathname.startsWith("/imports/") ||
    pathname === "/reports" ||
    pathname.startsWith("/reports/")
  );
}

export function isProtectedAppPath(pathname: string) {
  return isAdminPath(pathname) || isClientPath(pathname);
}

function stableUuid(value: string) {
  const hex = stableFingerprint(value);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function stableFingerprint(value: string) {
  return `${stableHash(`${value}:0`)}${stableHash(`${value}:1`)}${stableHash(`${value}:2`)}${stableHash(
    `${value}:3`,
  )}`.slice(0, 32);
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

import { adminRoles } from "@/lib/auth-config";
import { requireRole } from "@/server/auth";
import { OpsClient } from "./ops-client";

export default async function OpsPage() {
  await requireRole(adminRoles, "/ops");
  return <OpsClient />;
}

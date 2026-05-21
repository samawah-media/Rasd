import { ownerRoles } from "@/lib/auth-config";
import { requireRole } from "@/server/auth";
import { AccessClient } from "./access-client";

export default async function AccessPage() {
  await requireRole(ownerRoles, "/access");

  return <AccessClient />;
}

import { adminRoles } from "@/lib/auth-config";
import { requireRole } from "@/server/auth";
import { SourcesClient } from "./sources-client";

export default async function SourcesPage() {
  await requireRole(adminRoles, "/sources");
  return <SourcesClient />;
}

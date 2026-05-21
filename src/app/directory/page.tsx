import { adminRoles } from "@/lib/auth-config";
import { requireRole } from "@/server/auth";
import DirectoryClient from "./directory-client";

export default async function DirectoryPage() {
  await requireRole(adminRoles, "/directory");
  return <DirectoryClient />;
}

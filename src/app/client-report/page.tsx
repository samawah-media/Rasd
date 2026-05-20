import { memberRoles } from "@/lib/auth-config";
import { getHidayathonClientReportData } from "@/lib/client-report-data";
import { requireRole } from "@/server/auth";
import { ClientReportView } from "./client-report-view";

export default async function ClientReportPage() {
  const context = await requireRole(memberRoles, "/client-report");
  return <ClientReportView data={getHidayathonClientReportData()} role={context.membership.role} />;
}

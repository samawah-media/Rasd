import { memberRoles } from "@/lib/auth-config";
import { getPreferredHidayathonClientReportData } from "@/lib/client-report-data";
import { requireRole } from "@/server/auth";
import { ClientReportView } from "./client-report-view";

export default async function ClientReportPage() {
  const context = await requireRole(memberRoles, "/client-report");
  const data = await getPreferredHidayathonClientReportData();
  return <ClientReportView data={data} role={context.membership.role} />;
}

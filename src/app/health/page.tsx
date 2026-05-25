import React from "react";
import { adminRoles } from "@/lib/auth-config";
import { requireRole } from "@/server/auth";
import { persistentStore } from "@/server/persistent-store";
import HealthClient from "./health-client";

export default async function HealthPage() {
  // 1. Verify user is authorized
  await requireRole(adminRoles, "/health");

  // 2. Fetch server-side metrics and real-time database state
  const [healthData, auditLogs, sources] = await Promise.all([
    persistentStore.health(),
    persistentStore.listAuditLogs(),
    persistentStore.listSources(),
  ]);

  return <HealthClient initialHealth={healthData} initialLogs={auditLogs} initialSources={sources} />;
}

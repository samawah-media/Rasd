import React from "react";
import { adminRoles } from "@/lib/auth-config";
import { requireRole } from "@/server/auth";
import { persistentStore } from "@/server/persistent-store";
import FeedClient from "./feed-client";

// Ensure the page is dynamically rendered to fetch fresh telemetry/materials
export const dynamic = "force-dynamic";

export default async function FeedPage() {
  // 1. Verify user is authorized as editor or admin
  await requireRole(adminRoles, "/feed");

  // 2. Fetch live items from database
  const items = await persistentStore.listItems();

  // 3. Render the gorgeous stateful client component
  return <FeedClient initialItems={items} />;
}

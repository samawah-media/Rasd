import { adminRoles, memberRoles, isRoleAllowed } from "@/lib/auth-config";
import type { Role } from "@/lib/types";
import { getCurrentAuthContext } from "@/server/auth";

type ApiRule = {
  methods?: readonly string[];
  pattern: RegExp;
  roles: readonly Role[] | "public";
};

const apiRules: ApiRule[] = [
  { methods: ["GET"], pattern: /^\/api\/share-links\/[^/]+$/, roles: "public" },
  { methods: ["GET"], pattern: /^\/api\/client-report\/hidayathon$/, roles: memberRoles },
  { methods: ["GET"], pattern: /^\/api\/client-report\/hidayathon\/export-pdf$/, roles: memberRoles },
  { methods: ["GET"], pattern: /^\/api\/items\/[^/]+\/evidence-card\.svg$/, roles: memberRoles },
  { pattern: /^\/api\/admin(?:\/|$)/, roles: adminRoles },
  { pattern: /^\/api\/audit-logs$/, roles: adminRoles },
  { pattern: /^\/api\/imports(?:\/|$)/, roles: adminRoles },
  { pattern: /^\/api\/items(?:\/|$)/, roles: adminRoles },
  { pattern: /^\/api\/connectors(?:\/|$)/, roles: adminRoles },
  { pattern: /^\/api\/sources$/, roles: adminRoles },
  { pattern: /^\/api\/source-rules$/, roles: adminRoles },
  { pattern: /^\/api\/keyword-rules$/, roles: adminRoles },
  { pattern: /^\/api\/reports\/[^/]+\/share-link$/, roles: adminRoles },
  { pattern: /^\/api\/share-links\/[^/]+\/revoke$/, roles: adminRoles },
  { pattern: /^\/api\/reports(?:\/|$)/, roles: adminRoles },
  { pattern: /^\/api\/topics$/, roles: adminRoles },
];

export async function authorizeApiRequest(request: Request) {
  if (process.env.NODE_ENV === "test") return null;

  const url = new URL(request.url);
  const rule = apiRules.find((entry) => {
    const methodMatches = !entry.methods || entry.methods.includes(request.method);
    return methodMatches && entry.pattern.test(url.pathname);
  });

  if (!rule) {
    return jsonError("api_route_not_found_or_not_authorized", 404);
  }

  if (rule.roles === "public") return null;

  const context = await getCurrentAuthContext();
  if (!context) {
    return jsonError("auth_required", 401);
  }

  if (!isRoleAllowed(context.membership.role, rule.roles)) {
    return jsonError("insufficient_role", 403);
  }

  return null;
}

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

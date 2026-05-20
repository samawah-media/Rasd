import { api } from "@/server/api";
import { authorizeApiRequest } from "@/server/api-auth";

export const runtime = "nodejs";

async function handleApiRequest(request: Request) {
  const blocked = await authorizeApiRequest(request);
  if (blocked) return blocked;
  return api.fetch(request);
}

export const GET = handleApiRequest;
export const POST = handleApiRequest;
export const PUT = handleApiRequest;
export const PATCH = handleApiRequest;
export const DELETE = handleApiRequest;

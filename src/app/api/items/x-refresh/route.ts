import { authorizeApiRequest } from "@/server/api-auth";
import { persistentStore } from "@/server/persistent-store";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/server/supabase-admin";
import { XProviderManager } from "@/lib/x/manager";
import { parseXUrl } from "@/lib/x/parser";
import { DEFAULT_ORGANIZATION_ID } from "@/lib/auth-config";
import { store } from "@/server/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // Authorize request via standard platform auth rules (enforces Owner/Editor rules for /api/items)
  const blocked = await authorizeApiRequest(request);
  if (blocked) return blocked;

  try {
    const url = new URL(request.url);
    const itemId = url.searchParams.get("itemId");
    if (!itemId) {
      return Response.json({ error: "missing_item_id" }, { status: 400 });
    }

    // Retrieve the basic item
    const items = await persistentStore.listItems();
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      return Response.json({ error: "item_not_found" }, { status: 404 });
    }

    // Attach raw_response from DB if Supabase is active
    if (isSupabaseAdminConfigured()) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("monitoring_items")
        .select("raw_response")
        .eq("id", itemId)
        .maybeSingle();

      if (error) {
        console.error("[x-refresh] Error loading raw_response:", error);
      } else if (data) {
        item.raw_response = data.raw_response;
      }
    } else {
      // In-memory fallback
      const inMemItems = await store.listItems();
      const inMemItem = inMemItems.find((i) => i.id === itemId);
      if (inMemItem) {
        item.raw_response = inMemItem.raw_response;
      }
    }

    return Response.json({ item });
  } catch (error) {
    console.error("[x-refresh GET] Server Error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "internal_server_error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  // Authorize request via standard platform auth rules
  const blocked = await authorizeApiRequest(request);
  if (blocked) return blocked;

  try {
    const body = (await request.json()) as { itemId?: string; providerType?: string };
    const { itemId, providerType } = body;
    if (!itemId) {
      return Response.json({ error: "missing_item_id" }, { status: 400 });
    }

    // 1. Fetch current item details
    const items = await persistentStore.listItems();
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      return Response.json({ error: "item_not_found" }, { status: 404 });
    }

    // 2. Parse X URL to extract Tweet ID
    const parsed = parseXUrl(item.originalUrl);
    if (!parsed) {
      return Response.json({ error: "not_a_valid_x_url" }, { status: 400 });
    }

    // 3. Fetch latest metrics via manager orchestrator (respecting keys and fallbacks)
    const envConfig: Record<string, string | undefined> = { ...process.env };
    if (providerType) {
      envConfig.X_PROVIDER_TYPE = providerType;
    }
    const manager = new XProviderManager(envConfig);
    const latestPost = await manager.fetchPost(parsed.tweetId);

    if (!latestPost) {
      return Response.json({ error: "failed_to_refresh_x_metadata" }, { status: 502 });
    }

    // 4. Persistence block
    let updatedItem = { ...item };
    if (isSupabaseAdminConfigured()) {
      const supabase = getSupabaseAdmin();
      
      // Load current raw_response first to merge fields
      const { data: currentItem, error: fetchErr } = await supabase
        .from("monitoring_items")
        .select("raw_response")
        .eq("id", itemId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      const currentRaw = (currentItem?.raw_response || {}) as Record<string, unknown>;
      const nextRaw = {
        ...currentRaw,
        x_post: latestPost, // Store the high-fidelity post structure
      };

      const { error: updateErr } = await supabase
        .from("monitoring_items")
        .update({
          author_name: latestPost.authorName,
          author_handle: latestPost.authorHandle,
          raw_response: nextRaw,
        })
        .eq("id", itemId)
        .select("*, sources(name)")
        .single();

      if (updateErr) throw updateErr;

      // Extract the refreshed item
      const listRes = await persistentStore.listItems();
      const refItem = listRes.find((i) => i.id === itemId);
      if (refItem) {
        updatedItem = { ...refItem, raw_response: nextRaw };
      }

      // Write audit log row
      await supabase.from("audit_logs").insert({
        organization_id: DEFAULT_ORGANIZATION_ID,
        action: "item.stats_refreshed",
        entity_type: "monitoring_item",
        entity_id: itemId,
        metadata: {
          tweetId: parsed.tweetId,
          provider: manager.getActiveProviderName(),
          likesCount: latestPost.likesCount,
          repostsCount: latestPost.repostsCount,
          viewsCount: latestPost.viewsCount,
        },
      });
    } else {
      // In-memory fallback persistence
      const inMemItems = await store.listItems();
      const inMemItem = inMemItems.find((i) => i.id === itemId);
      if (inMemItem) {
        inMemItem.authorName = latestPost.authorName;
        inMemItem.authorHandle = latestPost.authorHandle;
        inMemItem.raw_response = {
          ...((inMemItem.raw_response as Record<string, unknown> | null) || {}),
          x_post: latestPost,
        };
        updatedItem = { ...inMemItem };
      }
    }

    return Response.json({ item: updatedItem });
  } catch (error) {
    console.error("[x-refresh POST] Server Error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "internal_server_error" },
      { status: 500 }
    );
  }
}

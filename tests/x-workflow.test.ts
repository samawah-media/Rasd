(process.env as Record<string, string | undefined>).NODE_ENV = "test";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canonicalizeXUrl, isValidXUrl, parseXUrl } from "../src/lib/x/parser";
import { XProviderManager } from "../src/lib/x/manager";
import { OfficialXProvider, ApifyXProvider, AgentXProvider } from "../src/lib/x/providers";
import { store } from "../src/server/store";
import { GET, POST } from "../src/app/api/items/x-refresh/route";

describe("X/Twitter URL parser and normalizer", () => {
  it("validates standard and alternate X/Twitter post URLs", () => {
    assert.equal(isValidXUrl("https://x.com/jack/status/20"), true);
    assert.equal(isValidXUrl("https://twitter.com/jack/status/1234567890"), true);
    assert.equal(isValidXUrl("https://mobile.x.com/saudi_monitoring/status/987654321"), true);
    assert.equal(isValidXUrl("https://vxtwitter.com/some_user/status/12345"), true);
    assert.equal(isValidXUrl("https://fxtwitter.com/user_name/status/67890?s=20"), true);
    assert.equal(isValidXUrl("https://fixupx.com/user_123/status/54321#fragment"), true);
    assert.equal(isValidXUrl("https://fixvx.com/another_user/status/112233"), true);
  });

  it("rejects invalid URLs or wrong patterns", () => {
    assert.equal(isValidXUrl("https://example.com/jack/status/20"), false);
    assert.equal(isValidXUrl("https://x.com/jack"), false);
    assert.equal(isValidXUrl("https://x.com/jack/status/abc"), false);
    assert.equal(isValidXUrl("https://x.com/invalid-handle!/status/20"), false);
    assert.equal(isValidXUrl("not_a_url"), false);
  });

  it("extracts handles and tweet IDs correctly", () => {
    const result1 = parseXUrl("https://x.com/jack/status/20");
    assert.deepEqual(result1, { tweetId: "20", handle: "@jack" });

    const result2 = parseXUrl("https://mobile.twitter.com/saudi_monitoring/status/987654321?s=19");
    assert.deepEqual(result2, { tweetId: "987654321", handle: "@saudi_monitoring" });

    const result3 = parseXUrl("https://fixvx.com/some_user/status/99999");
    assert.deepEqual(result3, { tweetId: "99999", handle: "@some_user" });
  });

  it("canonicalizes various format URLs to standard x.com format", () => {
    assert.equal(
      canonicalizeXUrl("https://mobile.twitter.com/jack/status/20?s=19"),
      "https://x.com/jack/status/20"
    );
    assert.equal(
      canonicalizeXUrl("https://vxtwitter.com/user/status/54321#fragment"),
      "https://x.com/user/status/54321"
    );
    assert.equal(
      canonicalizeXUrl("https://fixvx.com/user/status/12345"),
      "https://x.com/user/status/12345"
    );
  });
});

describe("X/Twitter Provider Manager and Fallbacks", () => {
  it("resolves the mock provider and returns typed post data", async () => {
    const manager = new XProviderManager({
      X_PROVIDER_TYPE: "mock",
    });

    assert.equal(manager.getActiveProviderName(), "mock");

    const post = await manager.fetchPost("11223344");
    assert.ok(post);
    assert.equal(post.id, "11223344");
    assert.equal(post.authorHandle, "@mock_rasd_account");
    assert.equal(post.isVerified, true);
    assert.ok(post.likesCount > 0);
    assert.ok(post.mediaUrls && post.mediaUrls.length > 0);
  });

  it("falls back to OEmbed when a premium provider fails", async () => {
    const manager = new XProviderManager({
      X_PROVIDER_TYPE: "apify",
      // API TOKEN is missing intentionally to trigger the fail/fallback path
    });

    assert.equal(manager.getActiveProviderName(), "apify");

    const post = await manager.fetchPost("20");
    assert.ok(post);
    assert.equal(post.id, "20");
    assert.equal(post.authorHandle, "@jack");
    assert.ok(post.text.includes("just setting up my twttr"));
  });

  it("handles unrecognized provider type by falling back to oembed active provider", () => {
    const manager = new XProviderManager({
      X_PROVIDER_TYPE: "unrecognized_provider_type",
    });
    assert.equal(manager.getActiveProviderName(), "oembed");
  });
});

describe("X Provider Stubs and Key Gating", () => {
  it("verifies OfficialXProvider behavior when credentials are missing vs present", async () => {
    const withoutKey = new OfficialXProvider();
    await assert.rejects(async () => {
      await withoutKey.fetchPost("123");
    }, /official_x_api_key_missing/);

    const withKey = new OfficialXProvider("test_api_key");
    await assert.rejects(async () => {
      await withKey.fetchPost("123");
    }, /official_provider_not_implemented_stub: 123/);
  });

  it("verifies ApifyXProvider behavior when credentials are missing vs present", async () => {
    const withoutToken = new ApifyXProvider();
    await assert.rejects(async () => {
      await withoutToken.fetchPost("456");
    }, /apify_api_token_missing/);

    const withToken = new ApifyXProvider("test_api_token");
    await assert.rejects(async () => {
      await withToken.fetchPost("456");
    }, /apify_provider_not_implemented_stub: 456/);
  });

  it("verifies AgentXProvider throws xai_api_key_missing when credentials are missing", async () => {
    const provider = new AgentXProvider();
    await assert.rejects(async () => {
      await provider.fetchPost("789");
    }, /xai_api_key_missing/);
  });
});

describe("X Stats Refresh API endpoint", () => {
  it("GET rejects missing itemId", async () => {
    const req = new Request("https://localhost/api/items/x-refresh");
    const res = await GET(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "missing_item_id");
  });

  it("POST rejects missing itemId", async () => {
    const req = new Request("https://localhost/api/items/x-refresh", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "missing_item_id");
  });

  it("GET returns item metadata and raw_response", async () => {
    store.resetForTest();
    const ingest = store.ingestManualUrl({
      url: "https://x.com/jack/status/20",
    });

    const req = new Request(`https://localhost/api/items/x-refresh?itemId=${ingest.item.id}`);
    const res = await GET(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.item);
    assert.equal(body.item.id, ingest.item.id);
  });

  it("POST refreshes X stats via mock provider and saves updates", async () => {
    store.resetForTest();
    const ingest = store.ingestManualUrl({
      url: "https://x.com/mock_account/status/112233",
    });

    const req = new Request("https://localhost/api/items/x-refresh", {
      method: "POST",
      body: JSON.stringify({
        itemId: ingest.item.id,
        providerType: "mock",
      }),
    });

    const res = await POST(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.item);
    assert.equal(body.item.authorName, "حساب تجريبي رصد");
    assert.equal(body.item.authorHandle, "@mock_rasd_account");
    assert.ok(body.item.raw_response?.x_post);
    assert.equal(body.item.raw_response.x_post.likesCount, 1420);
  });
});


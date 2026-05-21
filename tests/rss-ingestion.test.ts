import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { fetchRssFeed, parseRssFeed, RssIngestionError } from "../src/server/rss-ingestion";
import { store } from "../src/server/store";

const sampleFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Hidayathon News</title>
    <item>
      <guid>story-1</guid>
      <title>هداية هاكاثون يطلق تحديا جديدا</title>
      <link>https://news.example.com/hidayathon/story-1?utm_source=rss</link>
      <description><![CDATA[تغطية عن هداية وهاكاثون هداية في مكة.]]></description>
      <dc:creator>فريق التحرير</dc:creator>
      <pubDate>Wed, 20 May 2026 10:30:00 GMT</pubDate>
      <media:thumbnail url="https://news.example.com/images/story-1.jpg" />
    </item>
  </channel>
</rss>`;

describe("RSS ingestion", () => {
  beforeEach(() => {
    store.resetForTest();
  });

  it("parses RSS entries into safe normalized feed payloads", async () => {
    const feed = await parseRssFeed(sampleFeed, "https://news.example.com/rss.xml");

    assert.equal(feed.feedTitle, "Hidayathon News");
    assert.equal(feed.entries.length, 1);
    assert.equal(feed.entries[0].sourceItemId, "story-1");
    assert.equal(feed.entries[0].canonicalUrl, "https://news.example.com/hidayathon/story-1");
    assert.equal(feed.entries[0].authorName, "فريق التحرير");
    assert.equal(feed.entries[0].publishedAt, "2026-05-20T10:30:00.000Z");
    assert.deepEqual(feed.entries[0].imageCandidates, ["https://news.example.com/images/story-1.jpg"]);
  });

  it("fetches RSS only from public feed URLs", async () => {
    await assert.rejects(
      () => fetchRssFeed("http://127.0.0.1/rss.xml"),
      (error) => error instanceof RssIngestionError && error.message === "feed_url must be a public http or https URL",
    );
  });

  it("creates RSS monitoring items once and deduplicates re-runs", async () => {
    const source = store.createSource({
      name: "Hidayathon Feed",
      type: "rss",
      feedUrl: "https://news.example.com/rss.xml",
      credibility: "official",
    });
    const fetcher: typeof fetch = async () =>
      new Response(sampleFeed, {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      });

    const first = await store.ingestRssSource(source.id, { fetcher });
    const second = await store.ingestRssSource(source.id, { fetcher });

    assert.equal(first.fetched, 1);
    assert.equal(first.created, 1);
    assert.equal(first.duplicates, 0);
    assert.equal(first.skipped, 0);
    assert.equal(first.items[0].state, "needs_review");
    assert.equal(first.items[0].originalUrl, "https://news.example.com/hidayathon/story-1");
    assert.equal(first.items[0].sourceItemId, `${source.id}:story-1`);
    assert.equal(second.created, 0);
    assert.equal(second.duplicates, 1);
    assert.equal(second.skipped, 0);
  });

  it("skips RSS entries that do not match Hidayathon keywords", async () => {
    const source = store.createSource({
      name: "General News Feed",
      type: "rss",
      feedUrl: "https://news.example.com/general.xml",
      credibility: "media",
    });
    const unrelatedFeed = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>خبر اقتصادي عام</title><link>https://news.example.com/business/story</link><description>تغطية اقتصادية لا تخص المشروع.</description><pubDate>Wed, 20 May 2026 10:30:00 GMT</pubDate></item></channel></rss>`;
    const fetcher: typeof fetch = async () => new Response(unrelatedFeed, { status: 200 });

    const result = await store.ingestRssSource(source.id, { fetcher });

    assert.equal(result.fetched, 1);
    assert.equal(result.created, 0);
    assert.equal(result.duplicates, 0);
    assert.equal(result.skipped, 1);
    assert.equal(result.items.length, 0);
  });

  it("does not crash on missing optional RSS fields", async () => {
    const source = store.createSource({
      name: "Sparse Feed",
      type: "rss",
      feedUrl: "https://news.example.com/sparse.xml",
      credibility: "media",
    });
    const sparseFeed = `<?xml version="1.0"?><rss version="2.0"><channel><item><link>https://news.example.com/hidayathon/no-title</link></item></channel></rss>`;
    const fetcher: typeof fetch = async () => new Response(sparseFeed, { status: 200 });

    const result = await store.ingestRssSource(source.id, { fetcher });

    assert.equal(result.created, 1);
    assert.equal(result.skipped, 0);
    assert.equal(result.items[0].title, "https://news.example.com/hidayathon/no-title");
    assert.equal(result.items[0].warning, "missing_or_invalid_date");
  });

  it("surfaces malformed feeds as controlled errors", async () => {
    await assert.rejects(
      () => parseRssFeed("<rss><channel><item>", "https://news.example.com/rss.xml"),
      (error) => error instanceof RssIngestionError && error.message === "rss_parse_failed",
    );
  });
});

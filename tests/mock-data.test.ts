import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { monitoringItems, sources } from "../src/lib/mock-data";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/;

describe("mock data source identifiers", () => {
  it("keeps seeded source ids compatible with the Supabase uuid schema", () => {
    for (const source of sources) {
      assert.match(source.id, UUID_PATTERN);
    }
  });

  it("keeps seeded monitoring items attached to known sources", () => {
    const sourceIds = new Set(sources.map((source) => source.id));
    for (const item of monitoringItems) {
      assert.equal(sourceIds.has(item.sourceId), true, `Unknown sourceId on item ${item.id}: ${item.sourceId}`);
    }
  });
});

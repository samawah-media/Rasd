import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const projectRoot = process.cwd();

describe("admin navigation", () => {
  it("exposes the legacy import workspace from the primary sidebar", () => {
    const sidebar = readFileSync(join(projectRoot, "src", "components", "RichRightSidebar.tsx"), "utf8");

    assert.match(sidebar, /title:\s*"الاستيراد"/);
    assert.match(sidebar, /path:\s*"\/imports"/);
    assert.match(sidebar, /icon:\s*FileInput/);
  });
});

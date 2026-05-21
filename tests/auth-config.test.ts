import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_ORGANIZATION_ID,
  RASD_OWNER_EMAIL,
  defaultPathForRole,
  isAdminPath,
  isAdminRole,
  isClientPath,
  isProtectedAppPath,
  isRoleAllowed,
  memberRoles,
} from "../src/lib/auth-config";

describe("auth and role routing rules", () => {
  it("pins the first owner email and default tenant", () => {
    assert.equal(RASD_OWNER_EMAIL, "samawah.pod@gmail.com");
    assert.match(DEFAULT_ORGANIZATION_ID, /^[0-9a-f-]{36}$/);
  });

  it("routes owners and editors to admin, viewers to the client workspace", () => {
    assert.equal(defaultPathForRole("owner"), "/");
    assert.equal(defaultPathForRole("editor"), "/");
    assert.equal(defaultPathForRole("viewer"), "/client-report");
  });

  it("keeps admin pages separate from the client report", () => {
    assert.equal(isAdminPath("/"), true);
    assert.equal(isAdminPath("/ops"), true);
    assert.equal(isAdminPath("/access"), true);
    assert.equal(isAdminPath("/imports/backfill"), true);
    assert.equal(isAdminPath("/reports/report-5"), true);
    assert.equal(isClientPath("/client-report"), true);
    assert.equal(isAdminPath("/client-report"), false);
    assert.equal(isProtectedAppPath("/client-report"), true);
  });

  it("allows every member into the client workspace but only owner/editor into admin", () => {
    assert.equal(isRoleAllowed("viewer", memberRoles), true);
    assert.equal(isAdminRole("viewer"), false);
    assert.equal(isAdminRole("editor"), true);
    assert.equal(isAdminRole("owner"), true);
  });
});

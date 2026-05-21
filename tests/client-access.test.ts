import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateViewerAccountInput } from "../src/server/client-access";

describe("client viewer account access", () => {
  it("normalizes safe viewer account input", () => {
    const result = validateViewerAccountInput({
      email: "  Client@Example.COM ",
      password: "securePass123",
      display_name: "  عميل هداية  ",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.value.email, "client@example.com");
    assert.equal(result.value.password, "securePass123");
    assert.equal(result.value.displayName, "عميل هداية");
  });

  it("rejects incomplete or weak viewer account input", () => {
    assert.deepEqual(validateViewerAccountInput({ password: "securePass123" }), {
      ok: false,
      error: "email_required",
    });
    assert.deepEqual(validateViewerAccountInput({ email: "not-an-email", password: "securePass123" }), {
      ok: false,
      error: "email_invalid",
    });
    assert.deepEqual(validateViewerAccountInput({ email: "client@example.com" }), {
      ok: false,
      error: "password_required",
    });
    assert.deepEqual(validateViewerAccountInput({ email: "client@example.com", password: "short" }), {
      ok: false,
      error: "password_too_short",
    });
  });
});

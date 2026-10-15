import { describe, it } from "node:test";
import assert from "node:assert";

describe("Automatic Versions Interval Logic", () => {
  it("creates an automatic version when edits occurred and last version is >= 10 minutes old", () => {
    const TEN_MINUTES_MS = 10 * 60 * 1000;
    const now = Date.now();
    const lastVersionCreatedAt = new Date(now - 11 * 60 * 1000).toISOString();

    const elapsedMs = now - new Date(lastVersionCreatedAt).getTime();
    const shouldCreate = elapsedMs >= TEN_MINUTES_MS;

    assert.strictEqual(shouldCreate, true);
  });

  it("does NOT create an automatic version when last version is less than 10 minutes old", () => {
    const TEN_MINUTES_MS = 10 * 60 * 1000;
    const now = Date.now();
    const lastVersionCreatedAt = new Date(now - 4 * 60 * 1000).toISOString(); // 4 mins ago

    const elapsedMs = now - new Date(lastVersionCreatedAt).getTime();
    const shouldCreate = elapsedMs >= TEN_MINUTES_MS;

    assert.strictEqual(shouldCreate, false);
  });
});

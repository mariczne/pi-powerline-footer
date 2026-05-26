import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchProviderSubscriptionUsage,
  formatSubscriptionUsageSummary,
  getSupportedSubscriptionProvider,
  parseAnthropicSubscriptionUsage,
  parseCodexSubscriptionUsage,
} from "../subscription-usage.ts";

test("supported subscription provider detection only accepts anthropic and openai-codex", () => {
  assert.equal(getSupportedSubscriptionProvider({ provider: "anthropic" }), "anthropic");
  assert.equal(getSupportedSubscriptionProvider({ provider: "openai-codex" }), "openai-codex");
  assert.equal(getSupportedSubscriptionProvider({ provider: "openai" }), null);
  assert.equal(getSupportedSubscriptionProvider(undefined), null);
});

test("codex usage parser reads primary and secondary window percentages", () => {
  assert.deepEqual(parseCodexSubscriptionUsage({
    rate_limit: {
      primary_window: { used_percent: 55, reset_after_seconds: 3600 },
      secondary_window: { used_percent: 22, reset_after_seconds: 7200 },
    },
  }, 1000), {
    sessionPercent: 55,
    weeklyPercent: 22,
    sessionResetAt: 3601000,
    weeklyResetAt: 7201000,
  });
});

test("anthropic usage parser reads five-hour and seven-day utilization", () => {
  const sessionResetAt = new Date(2026, 4, 26, 15, 23, 0, 0).getTime();
  const weeklyResetAt = new Date(2026, 4, 31, 0, 0, 0, 0).getTime();

  assert.deepEqual(parseAnthropicSubscriptionUsage({
    five_hour: { utilization: 0.55, resets_at: new Date(sessionResetAt).toISOString() },
    seven_day: { utilization: 0.22, resets_at: new Date(weeklyResetAt).toISOString() },
  }), {
    sessionPercent: 55,
    weeklyPercent: 22,
    sessionResetAt,
    weeklyResetAt,
  });
});

test("subscription usage summary renders bracketed remaining percentages with reset labels", () => {
  const nowMs = new Date(2026, 4, 26, 10, 0, 0, 0).getTime();
  const sessionResetAt = new Date(2026, 4, 26, 15, 23, 0, 0).getTime();
  const weeklyResetAt = new Date(2026, 4, 31, 0, 0, 0, 0).getTime();

  assert.equal(formatSubscriptionUsageSummary({
    provider: "openai-codex",
    sessionPercent: 55,
    weeklyPercent: 22,
    sessionResetAt,
    weeklyResetAt,
    fetchedAt: 123,
  }, nowMs), "[5h 45% 15:23] [7d 78% 05-31]");
});

test("codex usage fetch uses bearer auth and parses the response", async () => {
  let headers: Record<string, string> | undefined;
  const usage = await fetchProviderSubscriptionUsage("openai-codex", "codex-token", undefined, {
    nowMs: 123,
    fetchFn: async (_url, init) => {
      headers = init?.headers as Record<string, string>;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            rate_limit: {
              primary_window: { used_percent: 61, reset_after_seconds: 3600 },
              secondary_window: { used_percent: 19, reset_after_seconds: 7200 },
            },
          };
        },
      } as Response;
    },
  });

  assert.equal(headers?.Authorization, "Bearer codex-token");
  assert.deepEqual(usage, {
    provider: "openai-codex",
    sessionPercent: 61,
    weeklyPercent: 19,
    sessionResetAt: 3600123,
    weeklyResetAt: 7200123,
    fetchedAt: 123,
  });
});

test("anthropic usage fetch appends the oauth beta header", async () => {
  let headers: Record<string, string> | undefined;
  await fetchProviderSubscriptionUsage("anthropic", "claude-token", { "anthropic-beta": "foo" }, {
    fetchFn: async (_url, init) => {
      headers = init?.headers as Record<string, string>;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            five_hour: { utilization: 55, resets_at: new Date(1000).toISOString() },
            seven_day: { utilization: 22, resets_at: new Date(2000).toISOString() },
          };
        },
      } as Response;
    },
  });

  assert.equal(headers?.Authorization, "Bearer claude-token");
  assert.equal(headers?.["anthropic-beta"], "foo,oauth-2025-04-20");
});

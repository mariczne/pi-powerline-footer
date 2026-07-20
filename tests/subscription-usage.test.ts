import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchProviderSubscriptionUsage,
  formatSubscriptionUsageSummary,
  getSupportedSubscriptionProvider,
  isSubscriptionUsageEnabled,
  parseAnthropicSubscriptionUsage,
  parseCodexSubscriptionUsage,
  parseOpencodeGoDashboardUsage,
  parseOpencodeGoSubscriptionUsage,
} from "../subscription-usage.ts";

test("supported subscription provider detection only accepts providers with usage endpoints", () => {
  assert.equal(getSupportedSubscriptionProvider({ provider: "anthropic" }), "anthropic");
  assert.equal(getSupportedSubscriptionProvider({ provider: "openai-codex" }), "openai-codex");
  assert.equal(getSupportedSubscriptionProvider({ provider: "opencode-go" }), "opencode-go");
  assert.equal(getSupportedSubscriptionProvider({ provider: "opencode" }), null);
  assert.equal(getSupportedSubscriptionProvider({ provider: "openai" }), null);
  assert.equal(getSupportedSubscriptionProvider(undefined), null);
});

test("subscription usage auth policy allows opencode go api keys", () => {
  const opencodeGoEnv = {
    OPENCODE_GO_WORKSPACE_ID: "wrk_123",
    OPENCODE_GO_AUTH_COOKIE: "Fe26.2**cookie",
  };

  assert.equal(isSubscriptionUsageEnabled("opencode-go", false, opencodeGoEnv), true);
  assert.equal(isSubscriptionUsageEnabled("opencode-go", true, opencodeGoEnv), true);
  assert.equal(isSubscriptionUsageEnabled("opencode-go", false, {}), false);
  assert.equal(isSubscriptionUsageEnabled("anthropic", false), false);
  assert.equal(isSubscriptionUsageEnabled("anthropic", true), true);
  assert.equal(isSubscriptionUsageEnabled("openai-codex", false), false);
  assert.equal(isSubscriptionUsageEnabled("openai-codex", true), true);
  assert.equal(isSubscriptionUsageEnabled(null, true), false);
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

test("codex one-week responses retain their quota window", async () => {
  const usage = await fetchProviderSubscriptionUsage("openai-codex", "codex-token", undefined, {
    nowMs: 1000,
    fetchFn: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          rate_limit: {
            primary_window: {
              used_percent: 25,
              limit_window_seconds: 604800,
              reset_after_seconds: 384403,
            },
            secondary_window: null,
          },
        };
      },
    }) as Response,
  });

  assert.deepEqual(usage, {
    provider: "openai-codex",
    weeklyPercent: 25,
    weeklyResetAt: 384404000,
    fetchedAt: 1000,
  });
  assert.equal(formatSubscriptionUsageSummary({
    provider: "openai-codex",
    weeklyPercent: 25,
    fetchedAt: 1000,
  }), "[7d 75%]");
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

test("opencode go usage parser reads rolling and weekly windows", () => {
  assert.deepEqual(parseOpencodeGoSubscriptionUsage({
    rolling5h: { usagePercent: 55, resetInSec: 3600 },
    weekly: { usagePercent: 22, resetInSec: 7200 },
    monthly: { usagePercent: 12, resetInSec: 86400 },
  }, 1000), {
    sessionPercent: 55,
    weeklyPercent: 22,
    sessionResetAt: 3601000,
    weeklyResetAt: 7201000,
  });
});

test("opencode go usage parser supports windows response shape", () => {
  assert.deepEqual(parseOpencodeGoSubscriptionUsage({
    windows: {
      rolling: { usage_percent: 0.55, resets_in_seconds: 3600 },
      weekly: { usage_percent: 0.22, resets_in_seconds: 7200 },
      monthly: { usage_percent: 0.12, resets_in_seconds: 86400 },
    },
  }, 1000), {
    sessionPercent: 55,
    weeklyPercent: 22,
    sessionResetAt: 3601000,
    weeklyResetAt: 7201000,
  });
});

test("opencode go dashboard parser reads SolidJS hydration usage", () => {
  assert.deepEqual(parseOpencodeGoDashboardUsage(
    `<html><script>rollingUsage:$R[10]={usagePercent:55,resetInSec:3600}weeklyUsage:$R[11]={usagePercent:22,resetInSec:7200}monthlyUsage:$R[12]={usagePercent:8,resetInSec:86400}</script></html>`,
    1000,
  ), {
    sessionPercent: 55,
    weeklyPercent: 22,
    sessionResetAt: 3601000,
    weeklyResetAt: 7201000,
  });
});

test("opencode go dashboard parser supports data-slot usage", () => {
  assert.deepEqual(parseOpencodeGoDashboardUsage(
    `<div data-slot="usage">
      <div data-slot="usage-item">
        <span data-slot="usage-label">Rolling Usage</span>
        <span data-slot="usage-value"><!--$-->5.5<!--/-->%</span>
        <span data-slot="reset-time"><!--$-->Resets in<!--/--> <!--$-->1 hour 30 minutes<!--/--></span>
      </div>
      <div data-slot="usage-item">
        <span data-slot="usage-label">Weekly Usage</span>
        <span data-slot="usage-value"><!--$-->22<!--/-->%</span>
        <span data-slot="reset-time"><!--$-->Resets in<!--/--> <!--$-->6 days 2 hours<!--/--></span>
      </div>
      <div data-slot="usage-item">
        <span data-slot="usage-label">Monthly Usage</span>
        <span data-slot="usage-value"><!--$-->8<!--/-->%</span>
        <span data-slot="reset-time"><!--$-->Resets in<!--/--> <!--$-->26 days<!--/--></span>
      </div>
    </div>`,
    1000,
  ), {
    sessionPercent: 5.5,
    weeklyPercent: 22,
    sessionResetAt: 5401000,
    weeklyResetAt: 525601000,
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

test("opencode go usage fetch scrapes dashboard when dashboard config exists", async () => {
  let url: string | undefined;
  let headers: Record<string, string> | undefined;
  const usage = await fetchProviderSubscriptionUsage("opencode-go", undefined, undefined, {
    nowMs: 123,
    env: {
      OPENCODE_GO_WORKSPACE_ID: "wrk_123",
      OPENCODE_GO_AUTH_COOKIE: "Fe26.2**cookie",
    },
    fetchFn: async (requestUrl, init) => {
      url = String(requestUrl);
      headers = init?.headers as Record<string, string>;
      return {
        ok: true,
        status: 200,
        async text() {
          return `<html><script>rollingUsage:$R[10]={usagePercent:61,resetInSec:3600}weeklyUsage:$R[11]={usagePercent:19,resetInSec:7200}monthlyUsage:$R[12]={usagePercent:8,resetInSec:86400}</script></html>`;
        },
      } as Response;
    },
  });

  assert.equal(url, "https://opencode.ai/workspace/wrk_123/go");
  assert.equal(headers?.Cookie, "auth=Fe26.2**cookie");
  assert.equal(headers?.Accept, "text/html");
  assert.deepEqual(usage, {
    provider: "opencode-go",
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

import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchProviderSubscriptionUsage,
  formatSubscriptionUsageSummary,
  getSupportedSubscriptionProvider,
  isSubscriptionUsageEnabled,
  parseAnthropicSubscriptionUsage,
  parseCodexSubscriptionUsage,
  parseCopilotQuotaHeader,
  parseCopilotRateLimitHeaders,
  parseCopilotResponseHeaders,
  parseCopilotSubscriptionUsage,
  parseOpencodeGoDashboardUsage,
  parseOpencodeGoSubscriptionUsage,
} from "../subscription-usage.ts";

test("supported subscription provider detection only accepts providers with usage endpoints", () => {
  assert.equal(getSupportedSubscriptionProvider({ provider: "anthropic" }), "anthropic");
  assert.equal(getSupportedSubscriptionProvider({ provider: "openai-codex" }), "openai-codex");
  assert.equal(getSupportedSubscriptionProvider({ provider: "opencode-go" }), "opencode-go");
  assert.equal(getSupportedSubscriptionProvider({ provider: "github-copilot" }), "github-copilot");
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
  assert.equal(isSubscriptionUsageEnabled("github-copilot", false), false);
  assert.equal(isSubscriptionUsageEnabled("github-copilot", true), true);
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

test("copilot usage parser reads premium_models monthly quota as a 30d window", () => {
  const resetAt = new Date("2026-07-01T00:00:00.000Z").getTime();
  assert.deepEqual(parseCopilotSubscriptionUsage({
    quota_reset_date: "2026-07-01T00:00:00.000Z",
    quota_snapshots: {
      premium_models: {
        entitlement: 1000,
        percent_remaining: 40,
        overage_permitted: true,
        overage_count: 0,
        unlimited: false,
      },
    },
  }), {
    weeklyPercent: 60,
    weeklyLabel: "30d",
    weeklyResetAt: resetAt,
  });
});

test("copilot usage parser falls back to premium_interactions when premium_models is absent", () => {
  const resetAt = new Date("2026-07-01T00:00:00.000Z").getTime();
  assert.deepEqual(parseCopilotSubscriptionUsage({
    quota_reset_date: "2026-07-01T00:00:00.000Z",
    quota_snapshots: {
      premium_interactions: {
        entitlement: 300,
        percent_remaining: 75,
        overage_permitted: false,
        overage_count: 0,
        unlimited: false,
      },
    },
  }), {
    weeklyPercent: 25,
    weeklyLabel: "30d",
    weeklyResetAt: resetAt,
  });
});

test("copilot usage parser handles percent_remaining as a string", () => {
  const resetAt = new Date("2026-07-01T00:00:00.000Z").getTime();
  assert.deepEqual(parseCopilotSubscriptionUsage({
    quota_reset_date: "2026-07-01T00:00:00.000Z",
    quota_snapshots: {
      premium_interactions: {
        entitlement: "1000",
        percent_remaining: "40.0",
        unlimited: true,
      },
    },
  }), {
    weeklyPercent: 60,
    weeklyLabel: "30d",
    weeklyResetAt: resetAt,
  });
});

test("copilot usage parser uses remaining/entitlement when percent_remaining is absent", () => {
  const resetAt = new Date("2026-07-01T00:00:00.000Z").getTime();
  assert.deepEqual(parseCopilotSubscriptionUsage({
    quota_reset_date: "2026-07-01T00:00:00.000Z",
    quota_snapshots: {
      premium_interactions: {
        entitlement: 1000,
        remaining: 400,
        unlimited: true,
      },
    },
  }), {
    weeklyPercent: 60,
    weeklyLabel: "30d",
    weeklyResetAt: resetAt,
  });
});

test("copilot usage parser returns null when no usage data is available", () => {
  assert.equal(parseCopilotSubscriptionUsage({
    quota_reset_date: "2026-07-01T00:00:00.000Z",
    quota_snapshots: {
      premium_models: { entitlement: -1, unlimited: true },
    },
  }), null);
});

test("copilot usage fetch uses token auth and github api version header", async () => {
  let url: string | undefined;
  let headers: Record<string, string> | undefined;
  const usage = await fetchProviderSubscriptionUsage("github-copilot", "ghp_token", undefined, {
    nowMs: 123,
    fetchFn: async (requestUrl, init) => {
      url = String(requestUrl);
      headers = init?.headers as Record<string, string>;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            quota_reset_date: "2026-07-01T00:00:00.000Z",
            quota_snapshots: {
              premium_models: { entitlement: 1000, percent_remaining: 40, unlimited: false },
            },
          };
        },
      } as Response;
    },
  });

  assert.equal(url, "https://api.github.com/copilot_internal/user");
  assert.equal(headers?.Authorization, "token ghp_token");
  assert.equal(headers?.["X-GitHub-Api-Version"], "2025-04-01");
  assert.deepEqual(usage, {
    provider: "github-copilot",
    weeklyPercent: 60,
    weeklyLabel: "30d",
    weeklyResetAt: new Date("2026-07-01T00:00:00.000Z").getTime(),
    fetchedAt: 123,
  });
});

test("copilot monthly-only usage summary renders a single 30d window", () => {
  const nowMs = new Date(2026, 5, 24, 10, 0, 0, 0).getTime();
  const resetAt = new Date(2026, 6, 1, 0, 0, 0, 0).getTime();
  assert.equal(formatSubscriptionUsageSummary({
    provider: "github-copilot",
    weeklyPercent: 60,
    weeklyLabel: "30d",
    weeklyResetAt: resetAt,
    fetchedAt: 123,
  }, nowMs), "[30d 40% 07-01]");
});

test("copilot quota header parser reads percent_remaining and reset date", () => {
  const resetAt = new Date("2026-07-01T00:00:00.000Z").getTime();
  assert.deepEqual(parseCopilotQuotaHeader("ent=1000&rem=40.0&ov=0&ovPerm=true&rst=2026-07-01T00:00:00.000Z"), {
    weeklyPercent: 60,
    weeklyLabel: "30d",
    weeklyResetAt: resetAt,
  });
});

test("copilot rate-limit headers parse session and weekly windows", () => {
  const sessionReset = new Date("2026-06-24T16:00:00.000Z").getTime();
  const weeklyReset = new Date("2026-07-01T00:00:00.000Z").getTime();
  assert.deepEqual(parseCopilotRateLimitHeaders(
    "ent=1000&rem=55.0&rst=2026-06-24T16:00:00.000Z",
    "ent=1000&rem=80.0&rst=2026-07-01T00:00:00.000Z",
  ), {
    sessionPercent: 45,
    sessionLabel: "5h",
    sessionResetAt: sessionReset,
    weeklyPercent: 20,
    weeklyLabel: "7d",
    weeklyResetAt: weeklyReset,
  });
});

test("copilot response headers prefer rate-limit over quota snapshot", () => {
  const result = parseCopilotResponseHeaders({
    "x-quota-snapshot-premium_models": "ent=1000&rem=40.0&rst=2026-07-01T00:00:00.000Z",
    "x-usage-ratelimit-session": "ent=1000&rem=70.0&rst=2026-06-24T16:00:00.000Z",
    "x-usage-ratelimit-weekly": "ent=1000&rem=90.0&rst=2026-07-01T00:00:00.000Z",
  });
  assert.equal(result?.sessionPercent, 30);
  assert.equal(result?.sessionLabel, "5h");
  assert.equal(result?.weeklyPercent, 10);
  assert.equal(result?.weeklyLabel, "7d");
});

test("copilot response headers fall back to quota snapshot when rate-limit absent", () => {
  const resetAt = new Date("2026-07-01T00:00:00.000Z").getTime();
  assert.deepEqual(parseCopilotResponseHeaders({
    "x-quota-snapshot-premium_interactions": "ent=1000&rem=25.0&rst=2026-07-01T00:00:00.000Z",
  }), {
    weeklyPercent: 75,
    weeklyLabel: "30d",
    weeklyResetAt: resetAt,
  });
});

test("copilot response headers return null when no recognizable headers present", () => {
  assert.equal(parseCopilotResponseHeaders({ "content-type": "application/json" }), null);
});

test("copilot usage parser uses quota_reset_date_utc when available", () => {
  const resetAt = new Date("2026-07-01T00:00:00.000Z").getTime();
  assert.deepEqual(parseCopilotSubscriptionUsage({
    quota_reset_date_utc: "2026-07-01T00:00:00.000Z",
    quota_snapshots: {
      premium_interactions: { entitlement: 1000, percent_remaining: 40, unlimited: true },
    },
  }), {
    weeklyPercent: 60,
    weeklyLabel: "30d",
    weeklyResetAt: resetAt,
  });
});

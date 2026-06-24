import {
  buildRequestHeaders,
  clampPercent,
  getHeaderKey,
  parseResetAt,
  requestJson,
  requireAuthorizationHeader,
  type ParsedUsageWindow,
  type RequestConfig,
} from "./shared.ts";

function readNumberLike(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function parseCopilotSubscriptionUsage(data: any): ParsedUsageWindow | null {
  const snapshots = data?.quota_snapshots;
  if (!snapshots || typeof snapshots !== "object") return null;

  const snapshot = snapshots.premium_models ?? snapshots.premium_interactions ?? snapshots.chat;
  if (!snapshot) return null;

  const percentRemaining = readNumberLike(snapshot.percent_remaining);
  const entitlement = readNumberLike(snapshot.entitlement);
  const remaining = readNumberLike(snapshot.remaining);

  let usedPercent: number | null = null;
  if (percentRemaining !== null) {
    usedPercent = clampPercent(100 - percentRemaining);
  } else if (entitlement !== null && entitlement > 0 && remaining !== null) {
    usedPercent = clampPercent((1 - remaining / entitlement) * 100);
  }

  if (usedPercent === null) return null;

  const resetAt = parseResetAt(data?.quota_reset_date_utc ?? data?.quota_reset_date ?? snapshot.reset_date);

  return {
    weeklyPercent: usedPercent,
    weeklyLabel: "30d",
    weeklyResetAt: resetAt,
  };
}

export function parseCopilotQuotaHeader(headerValue: string): ParsedUsageWindow | null {
  const params = new URLSearchParams(headerValue);
  const percentRemaining = readNumberLike(params.get("rem"));
  if (percentRemaining === null) return null;

  const usedPercent = clampPercent(100 - percentRemaining);
  const resetDateString = params.get("rst");
  const resetAt = resetDateString ? parseResetAt(resetDateString) : undefined;

  return {
    weeklyPercent: usedPercent,
    weeklyLabel: "30d",
    weeklyResetAt: resetAt,
  };
}

export function parseCopilotRateLimitHeaders(
  sessionHeader: string | undefined,
  weeklyHeader: string | undefined,
): ParsedUsageWindow | null {
  const session = sessionHeader ? parseCopilotQuotaHeader(sessionHeader) : null;
  const weekly = weeklyHeader ? parseCopilotQuotaHeader(weeklyHeader) : null;
  if (!session && !weekly) return null;

  return {
    sessionPercent: session?.sessionPercent ?? session?.weeklyPercent,
    sessionLabel: session ? "5h" : undefined,
    sessionResetAt: session?.weeklyResetAt,
    weeklyPercent: weekly?.sessionPercent ?? weekly?.weeklyPercent,
    weeklyLabel: weekly ? "7d" : undefined,
    weeklyResetAt: weekly?.weeklyResetAt,
  };
}

export function extractCopilotHeaders(headers: Record<string, string>): {
  quotaHeader?: string;
  sessionRateLimitHeader?: string;
  weeklyRateLimitHeader?: string;
} {
  const quotaKey = getHeaderKey(headers, "x-quota-snapshot-premium_models")
    ?? getHeaderKey(headers, "x-quota-snapshot-premium_interactions")
    ?? getHeaderKey(headers, "x-quota-snapshot-chat");
  const sessionKey = getHeaderKey(headers, "x-usage-ratelimit-session");
  const weeklyKey = getHeaderKey(headers, "x-usage-ratelimit-weekly");

  return {
    quotaHeader: quotaKey ? headers[quotaKey] : undefined,
    sessionRateLimitHeader: sessionKey ? headers[sessionKey] : undefined,
    weeklyRateLimitHeader: weeklyKey ? headers[weeklyKey] : undefined,
  };
}

export function parseCopilotResponseHeaders(headers: Record<string, string>): ParsedUsageWindow | null {
  const { quotaHeader, sessionRateLimitHeader, weeklyRateLimitHeader } = extractCopilotHeaders(headers);

  const rateLimit = parseCopilotRateLimitHeaders(sessionRateLimitHeader, weeklyRateLimitHeader);
  if (rateLimit) {
    if (rateLimit.sessionPercent === undefined) {
      return {
        weeklyPercent: rateLimit.weeklyPercent,
        weeklyLabel: rateLimit.weeklyLabel,
        weeklyResetAt: rateLimit.weeklyResetAt,
      };
    }
    return rateLimit;
  }

  if (quotaHeader) {
    const parsed = parseCopilotQuotaHeader(quotaHeader);
    if (parsed) return parsed;
  }

  return null;
}

export async function fetchCopilotSubscriptionUsage(
  apiKey: string | undefined,
  headers: Record<string, string> | undefined,
  config: RequestConfig = {},
): Promise<ParsedUsageWindow | null> {
  const requestHeaders = buildRequestHeaders(apiKey, headers);
  requireAuthorizationHeader(requestHeaders);

  const authKey = getHeaderKey(requestHeaders, "authorization");
  if (authKey) {
    const value = requestHeaders[authKey];
    requestHeaders[authKey] = value.startsWith("Bearer ") ? `token ${value.slice("Bearer ".length)}` : value;
  }
  if (!getHeaderKey(requestHeaders, "x-github-api-version")) {
    requestHeaders["X-GitHub-Api-Version"] = "2025-04-01";
  }

  return parseCopilotSubscriptionUsage(
    await requestJson("https://api.github.com/copilot_internal/user", requestHeaders, config),
  );
}

import {
  buildRequestHeaders,
  clampPercent,
  parseResetAfterSeconds,
  readPercentCandidate,
  requestJson,
  requireAuthorizationHeader,
  type ParsedUsageWindow,
  type RequestConfig,
} from "./shared.ts";

export function parseCodexSubscriptionUsage(data: any, nowMs = Date.now()): ParsedUsageWindow | null {
  const primary = data?.rate_limit?.primary_window;
  const secondary = data?.rate_limit?.secondary_window;
  const sessionPercent = readPercentCandidate(primary?.used_percent);
  const weeklyPercent = readPercentCandidate(secondary?.used_percent);
  if (sessionPercent === null || weeklyPercent === null) return null;

  return {
    sessionPercent: clampPercent(sessionPercent),
    weeklyPercent: clampPercent(weeklyPercent),
    sessionResetAt: parseResetAfterSeconds(primary?.reset_after_seconds, nowMs),
    weeklyResetAt: parseResetAfterSeconds(secondary?.reset_after_seconds, nowMs),
  };
}

export async function fetchCodexSubscriptionUsage(
  apiKey: string | undefined,
  headers: Record<string, string> | undefined,
  config: RequestConfig = {},
): Promise<ParsedUsageWindow | null> {
  const requestHeaders = buildRequestHeaders(apiKey, headers);
  requireAuthorizationHeader(requestHeaders);

  return parseCodexSubscriptionUsage(
    await requestJson("https://chatgpt.com/backend-api/wham/usage", requestHeaders, config),
    config.nowMs ?? Date.now(),
  );
}
